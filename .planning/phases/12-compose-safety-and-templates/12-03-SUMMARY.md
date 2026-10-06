---
phase: 12-compose-safety-and-templates
plan: 03
subsystem: api
tags: [compose, port-parsing, port-conflicts, strategy-tiers, shell-out, docker]

requires:
  - phase: 12-compose-safety-and-templates
    provides: "no direct code dependency on 12-01/12-02 — this plan is a standalone pure-domain + infrastructure foundation; it shares the phase's compose-YAML parsing conventions"
provides:
  - "server/src/domain/host-ports.ts — RequestedHostPort, parseEnvAssignments(), extractRequestedHostPorts(), MAX_PORTS_PER_RANGE, MAX_REQUESTED_PORTS"
  - "server/src/domain/port-conflicts.ts — PortHolder, PortConflict, DocktorStackPorts, RunningContainerPorts, SocketListener, PORT_HOLDING_STACK_STATUSES, resolvePortConflicts()"
  - "server/src/application/ports/socket-inspector-port.ts — SocketInspectorPort"
  - "server/src/infrastructure/socket-inspector.ts — SocketInspector, socketInspector singleton, parseSsOutput(), parseLsofOutput()"
  - "Dockerfile final stage now installs git, iproute2, lsof"
affects: [12-04, 12-08]

actuals:
  tokens: 11126
  tasks: 2
  commits: 2
  plan_head_before: 3105e54cd2064f9cae32a9027c1edeece2ed6004
  plan_head_after: d73fb926962eac636bf42d35349a5f2c5ab5f28a

tech-stack:
  added: []
  patterns:
    - "Ordered tier-resolver list in resolvePortConflicts() (DB stacks -> dockerode containers -> SocketInspector listeners) — D-15 precedence is enforced by resolver order plus a single break-on-first-match loop, so a future tier is additive, never a rewrite"
    - "SocketInspector's injectable CommandRunner constructor param (mirrors ResticExecutor's injectable-binary pattern) — tests substitute a fake runner instead of mocking node:child_process"
    - "ss -> lsof -> [] graceful-degradation chain (docker-executor.ts's imageDigest() try/catch-to-null idiom), console.warn once per instance rather than per call"

key-files:
  created:
    - server/src/domain/host-ports.ts
    - server/src/domain/port-conflicts.ts
    - server/src/application/ports/socket-inspector-port.ts
    - server/src/infrastructure/socket-inspector.ts
    - server/test/unit/domain/host-ports.test.ts
    - server/test/unit/domain/port-conflicts.test.ts
    - server/test/unit/infrastructure/socket-inspector.test.ts
  modified:
    - Dockerfile

key-decisions:
  - "extractRequestedHostPorts() dedupes by port/protocol keeping the first service in declaration order, independent of hostIp — matches the plan's explicit instruction and keeps the conflict-check surface small"
  - "resolveContainerHolder (tier 2) attributes a container to its owning Docktor stack by compose-project-label match regardless of that stack's DB status — a running container is stronger evidence than a stale status column, per the plan's action text"
  - "interpolateEnv() implements real shell semantics for the two default forms: \${VAR:-default} (colon-dash) falls back on unset-OR-empty; \${VAR-default} (dash-only) falls back only on unset, using VAR's value even if empty"
  - "SocketInspector's console.warn fires at most once per instance (hasWarned flag), not once per listListeners() call, to avoid log-spam on a host that simply lacks ss/lsof"

requirements-completed: ["#21", "#19"]

coverage:
  - id: D1
    description: "extractRequestedHostPorts() extracts the requested host port from every common ports: syntax (short form with optional host-IP prefix, /tcp|/udp suffix, A-B:C-D ranges, long form {target, published, protocol, host_ip}), and a container-only entry requests no host port"
    requirement: "#21"
    verification:
      - kind: unit
        ref: "server/test/unit/domain/host-ports.test.ts (22 tests covering short form, udp suffix, IPv4/IPv6 host-IP prefix, ranges, long form numeric/string/udp/host_ip, long-form-without-published, dedup, invalid YAML, no-services, container-only)"
        status: pass
    human_judgment: false
  - id: D2
    description: "\${VAR}, \${VAR:-default}, \${VAR-default}, and $VAR in a published port resolve from the stack's .env content, falling back to the inline default; an unresolvable entry is skipped"
    requirement: "#21"
    verification:
      - kind: unit
        ref: "server/test/unit/domain/host-ports.test.ts#resolves \${VAR:-default} to the inline default when the var is unset / resolves \${VAR:-default} to the env value when the var is set / skips an entry with an unresolvable \${VAR} reference"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-15 holder precedence: a conflict names its holder as exactly one of stack/container/process/unknown, with Docktor stacks taking precedence over containers over sockets"
    requirement: "#21"
    verification:
      - kind: unit
        ref: "server/test/unit/domain/port-conflicts.test.ts#precedence: a DB-tier stack holder wins over a matching container holder for the same port"
        status: pass
    human_judgment: false
  - id: D4
    description: "The stack being deployed never conflicts with itself: its own Service rows (tier 1) and containers whose compose project label equals its stack id (tier 2) are ignored"
    requirement: "#21"
    verification:
      - kind: unit
        ref: "server/test/unit/domain/port-conflicts.test.ts#never reports a conflict with the stack being deployed (self-exclusion) / ignores a container whose compose project equals the deploying stack (self-exclusion)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Only Docktor stacks in a port-holding status (RUNNING, HEALTHY, UNHEALTHY, DEPLOYING, UPDATING) count as tier-1 holders; a STOPPED/DRAFT/ERROR stack does not"
    requirement: "#21"
    verification:
      - kind: unit
        ref: "server/test/unit/domain/port-conflicts.test.ts#ignores a stack that is not in a port-holding status"
        status: pass
    human_judgment: false
  - id: D6
    description: "D-13: SocketInspector shells out to ss (falling back to lsof) through execFile with a fixed argv and a 5s timeout, and resolves to [] — never throws — when neither tool is available; a listener whose owning process is not visible is reported with processName null (-> holder kind unknown)"
    requirement: "#21"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/socket-inspector.test.ts (11 tests: ss success, ss-fails-lsof-succeeds fallback, both-fail resolves [] without throwing, fixed-argv invocation, parseSsOutput/parseLsofOutput shape tests)"
        status: pass
      - kind: unit
        ref: "server/test/unit/domain/port-conflicts.test.ts#reports an unknown holder when the listener's owning process could not be identified"
        status: pass
      - kind: other
        ref: "grep -c 'implements SocketInspectorPort' server/src/infrastructure/socket-inspector.ts -> 1; grep -c 'timeout' server/src/infrastructure/socket-inspector.ts -> 1"
        status: pass
    human_judgment: false
  - id: D7
    description: "The runtime image installs git (#19 template repos), iproute2 (ss), and lsof (#21) in the final Dockerfile stage"
    requirement: "#19"
    verification:
      - kind: other
        ref: "awk '/^FROM node:22-slim$/,0' Dockerfile | grep -cw 'git|iproute2|lsof' each -> 2"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-10-02
status: complete
---

# Phase 12 Plan 3: Host-port conflict detection foundation Summary

**Pure domain layer for compose host-port extraction (every common `ports:` syntax plus `.env` interpolation) and D-15 three-tier conflict resolution (Docktor stacks → containers → best-effort `ss`/`lsof` sockets), plus the `git`/`iproute2`/`lsof` image packages the phase needs.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-10-02 (session start, after 12-02 completion)
- **Completed:** 2026-10-02
- **Tasks:** 2/2
- **Files modified:** 8 (across 2 commits)

## Accomplishments

- Built `server/src/domain/host-ports.ts`: `extractRequestedHostPorts()` parses every common compose `ports:` form — short form with an optional IPv4/bracketed-IPv6 host prefix and `/tcp`\|`/udp` suffix, `A-B:C-D` ranges (capped at `MAX_PORTS_PER_RANGE`/`MAX_REQUESTED_PORTS`), and long form `{target, published, protocol, host_ip}` — plus `${VAR}`/`${VAR:-default}`/`${VAR-default}`/`$VAR` interpolation against `.env` content with correct shell-style unset-vs-empty semantics, skipping (never guessing) an unresolvable reference.
- Built `server/src/domain/port-conflicts.ts`: `resolvePortConflicts()` implements the D-15 three-tier holder precedence (Docktor stack via DB → any running container via dockerode → listening socket via `SocketInspector`) as an ordered, additive list of tier resolvers, with self-exclusion at every tier and malformed `Service.ports` JSON tolerated without throwing.
- Built the D-13 `SocketInspector` infrastructure adapter (`server/src/infrastructure/socket-inspector.ts` + `application/ports/socket-inspector-port.ts`): shells out to `ss` via an injectable `CommandRunner`, falls back to `lsof` on failure, and resolves `[]` (never throws) when neither tool is available — with a 5s `execFile` timeout and fixed argv, matching `docker-executor.ts`'s shell-out convention.
- Extended the Dockerfile's single final-stage `apt-get install` to add `git` (#19 — template repos), `iproute2` (provides `ss`), and `lsof` (#21 — D-13), with an inline comment explaining each addition's purpose.
- Both domain modules stayed provably pure (`grep -c 'infrastructure/\|repositories/\|lib/db'` → 0 for both files), confirmed against `layering.test.ts`'s domain-purity rule, which also picked up the new `SocketInspector`/`SocketInspectorPort` pairing automatically (97 passing cases, up from 95).

## Task Commits

Each task was committed atomically:

1. **Task 1: Domain tracer — a `8080:80` request collides with a running Docktor stack's Service.ports** - `ace8f7e` (feat)
2. **Task 2: All port syntaxes + env interpolation, container/socket tiers, SocketInspector, image packages** - `d73fb92` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `server/src/domain/host-ports.ts` - `RequestedHostPort`, `parseEnvAssignments()`, `extractRequestedHostPorts()`, `MAX_PORTS_PER_RANGE`, `MAX_REQUESTED_PORTS`
- `server/src/domain/port-conflicts.ts` - `PortHolder`, `PortConflict`, `DocktorStackPorts`, `RunningContainerPorts`, `SocketListener`, `PORT_HOLDING_STACK_STATUSES`, `resolvePortConflicts()`
- `server/src/application/ports/socket-inspector-port.ts` - `SocketInspectorPort`
- `server/src/infrastructure/socket-inspector.ts` - `SocketInspector`, `socketInspector` singleton, `parseSsOutput()`, `parseLsofOutput()`, `CommandRunner`
- `Dockerfile` - final-stage `apt-get install` list extended with `git`, `iproute2`, `lsof`
- Test files: `server/test/unit/domain/host-ports.test.ts`, `server/test/unit/domain/port-conflicts.test.ts`, `server/test/unit/infrastructure/socket-inspector.test.ts`

## Decisions Made

- **Dedup key is port/protocol only** (not hostIp) — matches the plan's explicit instruction; the first service to request a given port/protocol wins, in compose declaration order.
- **Tier 2 container-to-stack attribution ignores the stack's DB status** — a container whose compose project label matches a known Docktor stack id is attributed to that stack even if the stack's own `status` column says `STOPPED`, because the running container is itself proof of holding the port (stronger evidence than a potentially-stale status field).
- **`${VAR:-default}` vs `${VAR-default}` get distinct semantics** — colon-dash falls back on unset-or-empty (shell convention), dash-only falls back only on unset, matching real `.env`/shell interpolation behavior rather than treating both forms identically.
- **`SocketInspector`'s "tool unavailable" warning is rate-limited to once per instance** (not once per call) via a `hasWarned` flag, since `listListeners()` may be called frequently (every deploy, per D-14) and the singleton instance lives for the server's lifetime.

## Deviations from Plan

None — plan executed exactly as written. Both tasks' `<behavior>` lines are each covered by a dedicated test, every `<verify>` command passed (per-task and the plan-level full-suite/typecheck/Dockerfile checks), and every `<acceptance_criteria>` grep matched on the first run.

## Issues Encountered

None. The full `yarn workspace @docktor/server test:unit` suite (71 files, 1165 tests) and `yarn typecheck` both pass cleanly after both tasks; the elevated console output during the full-suite run is expected stderr/stdout from pre-existing intentional error-path tests (BackupService/NotificationService/etc. failure-path assertions), not new failures.

## User Setup Required

None - no external service configuration required. (The Dockerfile change takes effect on the next image build; no runtime action needed.)

## Next Phase Readiness

- Plan 12-08's `PortConflictService` can now call `resolvePortConflicts({stackId, requested, stacks, containers, listeners})` directly: `requested` from `extractRequestedHostPorts(compose, parseEnvAssignments(env))`, `stacks` from `StackRepository.findAll()` rows (already shaped as `{id, displayName, status, services[].ports}`), `containers` by mapping `dockerodeClient.listContainers(false)` output (`Names[0]`, `Labels["com.docker.compose.project"]`, `Ports[]`), and `listeners` from `socketInspector.listListeners()`.
- Plan 12-04's `GitExecutor` can now rely on the `git` binary being present in the runtime image.
- No blockers, no flagged assumptions beyond what RESEARCH.md's Pitfall 1 already documents (socket-tier visibility is a container-network-namespace limitation, not a bug in this plan's code) — both `socket-inspector-port.ts` and `socket-inspector.ts` carry that caveat in their header doc comments for 12-08's UI-copy author to read.

---
*Phase: 12-compose-safety-and-templates*
*Completed: 2026-10-02*

## Self-Check: PASSED

All 7 created files, the modified Dockerfile, and this SUMMARY.md verified present on disk; both task commits (`ace8f7e`, `d73fb92`) verified present in git history.
