---
status: diagnosed
trigger: "Gap G-14-1a (Phase 14 UAT test 1): Docktor cannot start after stopping while attached to a probe network that is subsequently deleted; Docker refuses to start the container (network test-network not found); startup sweep never runs; restart: unless-stopped does not help. Goal: find_root_cause_only."
created: 2026-10-10T00:00:00Z
updated: 2026-10-10T00:00:00Z
goal: find_root_cause_only
symptoms_prefilled: true
bug_class: Bohrbug (deterministic, 100% reproducible with throwaway containers)
---

## Current Focus

hypothesis: CONFIRMED - dockerd persists a runtime `network connect` in the container's own config; `docker start` re-attaches every persisted network by ID and aborts if one is gone, before any process in the container runs. Docktor's only crash backstop (startup sweep) is in-process code, so it is circular. Docktor also never detaches on shutdown (no signal handler, Node is PID 1 and ignores SIGTERM => every `docker stop` ends in SIGKILL).
test: done (E1-E6 below)
expecting: n/a
next_action: return ROOT CAUSE FOUND to caller (diagnose-only mode, no source modified)

## Symptoms

expected: Docktor restarts cleanly after stopping while attached to a probe network that is subsequently removed (startup sweep gets to run).
actual: Docker refuses to start the container ("network test-network not found"); sweep never runs; restart: unless-stopped does not help.
errors: "network test-network not found"
reproduction: Docktor stops (docker stop / crash) while attached to a stack network via the probe attach (alias docktor-health-probe); that network is then deleted (e.g. stack removed / compose down / network prune); start Docktor.
started: Phase 14 amended D-05 (health probes attach Docktor's own container temporarily to the stack network). UAT 2026-10-10.

## Eliminated

- hypothesis: The startup sweep is buggy / skipped (e.g. alias check, bounded() deadline, ordering in HealthProbeJob.start()).
  evidence: UAT test 1B shows the sweep removes a leftover attachment when the network still exists. In the failing case dockerd aborts container start ("failed to set up container networking: network ... not found", State.Status=exited, State.Error set; E1) before the entrypoint, so no Docktor code (index.ts, schema sync, jobs) ever executes.
  timestamp: 2026-10-10

- hypothesis: Recreating the network (same name) lets the container start, so the restart policy / operator can just re-create it.
  evidence: E3: after `network rm` + `network create <same name>` (new ID 25cecb60ee58) start still fails with "network de5e8521... not found". The persisted endpoint is keyed by the old network ID.
  timestamp: 2026-10-10

- hypothesis: "Detach before stack/network deletion (delete flow)" prevents the failure.
  evidence: E4: while Docktor is running and attached, `docker network rm` fails ("network ... has active endpoints"), so Docker itself already prevents deleting a network Docktor is currently attached to. The failure needs the network to be deleted while Docktor is NOT running (endpoint inactive), i.e. when Docktor's delete flow cannot execute. StackService.deleteStack -> DockerExecutor.down cannot run while Docktor is down.
  timestamp: 2026-10-10

## Evidence

- timestamp: 2026-10-10
  checked: server/src/infrastructure/probe-transport.ts (NetworkAttachments.connect/release), dockerode-client.ts connectNetwork/disconnectNetwork
  found: Attach = Engine API `POST /networks/{id}/connect {Container: <own id>, EndpointConfig:{Aliases:[docktor-health-probe]}}` on Docktor's own RUNNING container; detach only in `release()` (finally of the probe) or `sweepStaleAttachments()`. No other detach path.
  implication: Persistence, if any, is by dockerd, outside Docktor's control.

- timestamp: 2026-10-10
  checked: grep server/src for SIGTERM|SIGINT|process.on|process.once|close-with-grace|app.close(; Dockerfile; docker-compose.yml
  found: No signal handler anywhere. app.ts registers an `onClose` hook (stopJobs) but nothing ever calls app.close(). HealthProbeJob has no stop() override (IntervalJob.stop only cancels cron; it does not drain or detach). Dockerfile `CMD ["node","dist/server/index.js"]` (Node = PID 1); docker-compose.yml has no `init: true`, no `stop_grace_period`.
  implication: No shutdown hook exists to detach, and (E5) SIGTERM is not even delivered as an exit on PID 1.

- timestamp: 2026-10-10
  checked: E1 (Docker Engine 29.8.0, throwaway container gsd-dbg-self, network gsd-dbg-net, same call shape as dockerode: connect with alias on a RUNNING container)
  found: After `docker network connect --alias docktor-health-probe` and `docker stop`, `docker inspect` of the STOPPED container still lists gsd-dbg-net with aliases=[docktor-health-probe] and the network ID => the runtime connect is persisted in the container config. `docker network rm gsd-dbg-net` then succeeds (a stopped container holds no active endpoint). `docker start` => "Error response from daemon: failed to set up container networking: network d7ad121e... not found"; container stays State=exited.
  implication: Reproduces G-14-1a exactly; root mechanism is dockerd semantics + stale persisted endpoint, not Docktor's sweep logic.

- timestamp: 2026-10-10
  checked: E2 recovery paths on the broken (stopped, network gone) container
  found: `docker network disconnect <network-NAME> <container>` succeeds (exit 0) on a stopped container EVEN THOUGH the network no longer exists (dockerd edits the persisted map by name). Afterwards `docker start` works. Disconnect by network ID fails ("not connected"/not found). Recreating the network does not help (E3).
  implication: A cheap operator/external recovery exists: disconnect by name then start; or `docker rm` + `docker compose up -d` (recreate from compose config).

- timestamp: 2026-10-10
  checked: E4 `docker network rm` while the container is running and attached
  found: "network gsd-dbg-net has active endpoints (name:gsd-dbg-self ...)" - refused.
  implication: With Docktor running, Docker blocks deletion of an attached network (also explains why `compose down -v` can leave a network behind during an in-flight probe window). The persisted-failure window only opens while Docktor is stopped.

- timestamp: 2026-10-10
  checked: E5 Node as PID 1 using the docktor image (docktor-docktor:latest), `docker stop -t 15`
  found: no SIGTERM handler: 16041 ms, exit 137 (SIGKILL after the full grace period); with `process.on('SIGTERM')`: 964 ms, exit 0; with `docker run --init` (tini) and no handler: 848 ms, exit 143 (terminated by signal, no cleanup possible).
  implication: Today EVERY `docker stop`/`restart`/recreate of Docktor is a SIGKILL after the 10s default grace. A shutdown hook requires adding a SIGTERM handler first; `init: true` alone would not give cleanup.

- timestamp: 2026-10-10
  checked: E6 non-persisting alternative: helper container from the already-local Docktor image (`docker run --rm --pull never --network container:<target> --entrypoint node <image> -e fetch(...)`, and the `--network <net>` variant)
  found: Both reach the target (status 200; `localhost:8080` works in the container-netns variant), `--rm` helper leaves nothing on Docktor's own container; precedent exists in server/src/infrastructure/socket-inspector.ts (`docker run --rm --pull never <selfImage>`).
  implication: The only way to avoid persistence entirely is to not attach Docktor's own container (14-RESEARCH.md option C, rejected at the time for per-probe spawn cost).

- timestamp: 2026-10-10
  checked: .planning/phases/14-.../14-RESEARCH.md lines 296-305, 514, 534; 14-09-PLAN T-14-43; 14-15-PLAN T-14-59
  found: Option A (ephemeral attach) was chosen with the note "a crash between connect/disconnect leaves an attachment (needs a startup sweep)". The threat register treats the startup sweep as the backstop for every lingering-attachment case. It was never considered that dockerd refuses to start the container when a persisted attachment's network is gone.
  implication: Design gap: the crash-recovery backstop is located in the very process whose start it conditions on.

- timestamp: 2026-10-10
  checked: external corroboration (web search)
  found: moby commit "Fail the container start if the network has been removed" (known engine behaviour); docker-cli `network connect` docs: "a container connects to its configured networks when it runs".
  implication: Behaviour is intentional engine semantics, not a Docker Desktop quirk.

## Resolution

root_cause: |
  (AND of three conditions; the first is the root, the other two are what exposes it.)
  1. dockerd persists a runtime `network connect` in the container's own config (verified: a stopped container still lists the endpoint) and, on every start (manual, restart policy, daemon/host restart), re-attaches ALL persisted networks by ID and aborts the start if one no longer exists. Docktor's amended D-05 attach (NetworkAttachments.connect -> POST /networks/{id}/connect on its own running container) therefore writes a startup dependency on a third-party stack network into Docktor's own container.
  2. Docktor can leave that attachment behind because it never detaches on shutdown: server/src/index.ts has no SIGTERM/SIGINT handler, nothing calls app.close(), HealthProbeJob has no stop() drain, and Node runs as PID 1 (Dockerfile CMD, no `init: true`) so SIGTERM is not acted upon and `docker stop` always ends in SIGKILL after 10s (E5). A crash/OOM/SIGKILL/host power loss/daemon crash can never run a finally block anyway.
  3. The only recovery (HealthProbeJob.start() -> ProbeTransport.sweepStaleAttachments(), alias docktor-health-probe) is in-process code that runs after the container has started, but the failure is dockerd refusing to start the container, before the entrypoint. Restart policies reuse the same start path, so they cannot recover either. The trigger (network deleted or re-created with a new ID while Docktor is stopped: `compose down`, `docker network prune`, stack redeploy from CLI) is outside Docktor's control.
fix: (diagnose-only; not applied)
verification: Reproduced deterministically with throwaway containers (E1-E6); no source files modified; all gsd-dbg-* Docker objects removed.
files_changed: []
