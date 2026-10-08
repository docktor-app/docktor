---
phase: 14-health-uptime-and-disk-visibility
reviewed: 2026-10-08T00:00:00Z
depth: standard
files_reviewed: 87
files_reviewed_list:
  - client/src/components/app-sidebar.tsx
  - client/src/components/common/empty-state.tsx
  - client/src/components/domain/stack/service-status-badge.tsx
  - client/src/components/domain/stack/stack-list.tsx
  - client/src/components/domain/stack/uptime-badge.tsx
  - client/src/hooks/use-now.ts
  - client/src/hooks/use-service-health-events.ts
  - client/src/hooks/use-stack-uptime.ts
  - client/src/hooks/use-stack-uptimes.ts
  - client/src/hooks/use-storage.ts
  - client/src/lib/compose-health-probe.ts
  - client/src/lib/format-bytes.ts
  - client/src/lib/format-incident-duration.ts
  - client/src/lib/health-api.ts
  - client/src/lib/health-format.ts
  - client/src/lib/settings-api.ts
  - client/src/lib/stacks-api.ts
  - client/src/lib/storage-api.ts
  - client/src/lib/storage-view.ts
  - client/src/lib/uptime-api.ts
  - client/src/lib/uptime-format.ts
  - client/src/router.tsx
  - client/src/routes/app/dashboard.tsx
  - client/src/routes/app/settings.tsx
  - client/src/routes/app/settings/components/health-retention-card.tsx
  - client/src/routes/app/stacks/components/config-tab.tsx
  - client/src/routes/app/stacks/components/health-probe-form.tsx
  - client/src/routes/app/stacks/components/incident-list.tsx
  - client/src/routes/app/stacks/components/overview-tab.tsx
  - client/src/routes/app/stacks/components/service-health-timeline.tsx
  - client/src/routes/app/stacks/components/services-section.tsx
  - client/src/routes/app/stacks/components/uptime-card.tsx
  - client/src/routes/app/stacks/index.tsx
  - client/src/routes/app/storage.tsx
  - client/src/routes/app/storage/components/storage-backups-section.tsx
  - client/src/routes/app/storage/components/storage-stacks-table.tsx
  - client/src/routes/app/storage/components/storage-status-alerts.tsx
  - client/src/routes/app/storage/components/storage-totals.tsx
  - server/prisma/schema/service-health-event.prisma
  - server/prisma/schema/stack-volume-usage.prisma
  - server/prisma/schema/stack.prisma
  - server/prisma/schema/status-log.prisma
  - server/src/app.ts
  - server/src/application/container-state-catch-up.ts
  - server/src/application/incident-tracker.ts
  - server/src/application/index.ts
  - server/src/application/ports/disk-usage-scanner-port.ts
  - server/src/application/ports/dockerode-client-port.ts
  - server/src/application/ports/probe-ownership-port.ts
  - server/src/application/ports/probe-transport-port.ts
  - server/src/application/probed-service-registry.ts
  - server/src/application/service-health-history-service.ts
  - server/src/application/service-health-service.ts
  - server/src/application/settings-service.ts
  - server/src/application/stack-service.ts
  - server/src/application/storage-service.ts
  - server/src/application/subscribers/incident-subscriber.ts
  - server/src/application/subscribers/probe-result-subscriber.ts
  - server/src/application/subscribers/register.ts
  - server/src/application/subscribers/service-health-history-subscriber.ts
  - server/src/application/uptime-service.ts
  - server/src/domain/disk-usage.ts
  - server/src/domain/events.ts
  - server/src/domain/health-probe.ts
  - server/src/domain/incident-tracking.ts
  - server/src/domain/service-health.ts
  - server/src/domain/uptime.ts
  - server/src/infrastructure/disk-usage-scanner.ts
  - server/src/infrastructure/dockerode-client.ts
  - server/src/infrastructure/probe-transport.ts
  - server/src/jobs/disk-usage-job.ts
  - server/src/jobs/health-history-pruner.ts
  - server/src/jobs/health-probe-job.ts
  - server/src/jobs/index.ts
  - server/src/jobs/state-poller.ts
  - server/src/lib/compose-health-probe.ts
  - server/src/lib/stacks-dir.ts
  - server/src/repositories/index.ts
  - server/src/repositories/service-health-event-repository.ts
  - server/src/repositories/stack-disk-usage-repository.ts
  - server/src/repositories/stack-incident-repository.ts
  - server/src/repositories/status-log-repository.ts
  - server/src/routes/health.ts
  - server/src/routes/settings.ts
  - server/src/routes/storage.ts
  - shared/src/validation/health.ts
  - shared/src/validation/index.ts
findings:
  critical: 1
  warning: 11
  info: 6
  total: 18
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-10-08
**Depth:** standard
**Files Reviewed:** 87
**Status:** issues_found

## Summary

Phase 14 adds the HTTP health probe (compose `x-docktor.health-probe`, `ProbeTransport`, `HealthProbeJob`, `ServiceHealthService`), health history, uptime and incidents, and the disk usage scanner and Storage page.

The security-sensitive code is mostly sound.

- **SSRF:** The URL host is only ever used as the `Host` header and for SNI. The TCP connection goes to the inspected container's own IP through a pinned `lookup`, redirects are not followed, the body is discarded, and the URL is re-validated in the transport. I found no way to make Docktor call an address other than the target container.
- **`du` scanner:** It uses `execFile` with an argv array and `--`, so there is no shell or argument injection. Children that are symlinks are filtered out. One symlink gap remains at the `volumes/` directory itself (WR-03).
- **Compose YAML parsing:** The server parser uses the `yaml` library's default alias limit, catches `toJS()` failures, and fails closed on a bad block.

The main defects are operational.

- Docker API calls on the probe path have no timeout, so one hung call can stop all probing and block startup (CR-01).
- Probe results can write stale container ids and stale health into `Service` rows after a redeploy (WR-01, WR-05).
- Docktor joins untrusted stack networks, with the exposure that implies (WR-02).
- There are several client-side race and consistency problems (WR-06 through WR-09).

## Critical Issues

### CR-01: Docker API calls on the probe path have no timeout, so a hung daemon call stops all probing and can block server startup

**File:** `server/src/jobs/health-probe-job.ts:102-106,129-140,226-234`; `server/src/infrastructure/probe-transport.ts:178,204,337,352,387`; `server/src/infrastructure/dockerode-client.ts:30-47`

**Issue:** `requestOnce` is bounded by `timeoutMs`, but everything around it is not. `inspectContainer` (target and self), `connectNetwork` and `disconnectNetwork` go straight to dockerode, which has no default request timeout. This has two consequences.

1. **Probing stops permanently.** `HealthProbeJob.run()` sets `inFlight = true` and awaits `Promise.all` over the worker pool. If any worker awaits a Docker call that never settles, `tick()` never returns. `inFlight` stays `true`, and every later 5-second tick returns immediately at line 133. Nothing is logged, and `IntervalJob` never records an error, because the run never rejects. Probe-owned services keep their last stored health indefinitely. Because the probe owns the service (D-07), StatePoller does not correct it either. A service shown as `healthy` can be down with no signal.
2. **Startup can block.** `HealthProbeJob.start()` awaits `sweepStaleAttachments()` (which calls `inspectContainer`) and `refreshOwnership()` before `super.start()`. `JobRegistry.startAll()` awaits each `start()` in sequence, and `startJobs()` runs in Fastify's `onReady` hook. A Docker call that never completes at boot therefore delays every later job and the server's `listen()`.

`NetworkAttachments.connect` also awaits `this.detaching.get(networkId)`. A disconnect that hangs therefore blocks every later probe on that network.

**Fix:** Bound each Docker call and the whole probe, and make the pool resilient.

```ts
// probe-transport.ts
const DOCKER_CALL_TIMEOUT_MS = 10_000;

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
// wrap every this.docker.inspectContainer / connectNetwork / disconnectNetwork call
```

Also wrap `await this.probeService(probe)` in `runDue` with an overall deadline of `spec.timeoutMs` plus a margin for the Docker calls. Wrap the `start()` pre-steps with the same timeout. As a last line of defence, reset `inFlight` after a maximum tick duration.

## Warnings

### WR-01: A probe result for a replaced container overwrites the new container's id and health in the Service row

**File:** `server/src/application/service-health-service.ts:113-138` (writes `containerId: event.containerId` at line 131)

**Issue:** `applyProbeResult` guards on `row.containerState === "running"` but never checks that `row.containerId` equals `event.containerId`. A probe takes up to 30 seconds, and a deploy or restart can finish in that time. When the stack leaves its transitional status, `ContainerStateCatchUp` writes the new container id. A result for the old container, still queued behind the keyed lock, then passes the guards and `applyHealth` does the following.

- It writes `containerId: event.containerId`, which is the old id.
- It records an `http-probe` history transition that belongs to a container that no longer exists.
- It seeds `entries` with the old container id.

The Service row now points at a dead container, and the next probe is mis-detected as a "new container" and reset to `starting`.

**Fix:** Drop results that do not belong to the current container.

```ts
if (row === undefined || row.containerState !== "running") return;
if (row.containerId !== null && row.containerId !== event.containerId) return;
```

### WR-02: Docktor joins untrusted stack networks, exposing the management container to stack workloads

**File:** `server/src/infrastructure/probe-transport.ts:100-114,372-407` (and the attachment lifecycle at 140-209)

**Issue:** For every probe of a service that shares no network with Docktor, Docktor attaches its own container to the target's network. It does this every 30 seconds per service. While attached, every container on that network (including other tenants' containers, if a stack uses a shared `external` network) can reach Docktor's HTTP port, the login and setup endpoints, and anything else Docktor listens on.

- The window is short but recurring.
- The attachment is also left in place if the disconnect fails (the sweep only runs at the next boot).
- `chooseNetwork` falls back to `candidates[0]` when the stack's `<project>_default` network is absent. A compose author can therefore steer Docktor onto any network the service is on.

This is a defence-in-depth gap, not an SSRF, but it widens the blast radius of a malicious stack.

**Fix:** Prefer a dedicated approach where practical.

- Probe through `docker exec` or a helper sidecar.
- Restrict attachment to the stack's own `<project>_default` network, and report `network-unreachable` for anything else.
- Document that the attachment exposes Docktor's listener to that network.
- Retry the disconnect (with backoff) on failure rather than waiting for a restart.

### WR-03: `<stack>/volumes` is not lstat-checked, so a symlinked `volumes` directory is followed

**File:** `server/src/jobs/disk-usage-job.ts:122,136-147`; `server/src/infrastructure/disk-usage-scanner.ts:76-85`

**Issue:** The scanner and port documentation promise that "a link pointing into the host mount is never followed". That holds only for the children of `volumes/`. `measureBackups` checks `isRealDirectory(backupsDir)`, but `measureVolumes` does not. If `<stack>/volumes` is itself a symlink (a container with write access to its stack directory through a `./` bind mount can create one), then `readdir` follows it and lists the target's subdirectories. `du -sk -- <volumes>/<name>` then measures directories outside the stack, and the sizes are stored and shown on the Storage page. This leaks directory names and sizes outside the stacks tree, and can make `du` run over very large trees.

**Fix:** Apply the same guard before listing.

```ts
private async measureVolumes(volumesDir: string) {
    if (!(await this.scanner.isRealDirectory(volumesDir))) {
        return []; // missing or symlink: nothing to measure
    }
    ...
}
```

### WR-04: The `du` runner's default `maxBuffer` can discard a valid total

**File:** `server/src/infrastructure/disk-usage-scanner.ts:41-42,87-99`

**Issue:** `execFileAsync` keeps the default `maxBuffer` of 1 MiB for stdout and stderr combined. `du` prints one diagnostic line to stderr for every unreadable directory, and the total only at the very end. When a volume has enough permission-denied entries, node kills the child with `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` before the total is printed. `stdoutOfFailure` then returns `""`, `measureBytes` returns `null`, and `measureStack` abandons the entire stack on every run. The stack stays at "Not measured" forever. The only signal is a `console.warn`.

**Fix:** Raise `maxBuffer`, or discard stderr.

```ts
execFileAsync(file, [...args], {timeout: DU_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024});
```

### WR-05: A redeployed probe-owned service keeps the previous container's health

**File:** `server/src/application/container-state-catch-up.ts:151-160`; `server/src/jobs/state-poller.ts:232-235,296-302`

**Issue:** For a probe-owned service, both the post-deploy catch-up and StatePoller carry the stored health forward ("a probe-owned service keeps its stored health") and also write the new container id. After a redeploy the stored health belongs to the old container.

- If the old container was `unhealthy`, the redeployed stack derives UNHEALTHY. `IncidentTracker` then keeps or opens an incident, and notifications fire for a container that has not been probed yet.
- This lasts until the first probe of the new container. That can be up to 30 seconds (stagger plus interval), plus a 60-second grace during which failures are ignored but a `starting` state must first be written.
- If the old container was `healthy`, a broken new container is reported as `healthy` for the same period.

The `isNewContainer` reset in `ServiceHealthService` only runs when a probe result arrives.

**Fix:** When the container id or start time changes for a probe-owned service, write `starting` immediately, either in `ContainerStateCatchUp.observe` or by emitting a probe-cleared event for that service.

### WR-06: `useServiceHealthEvents` has no stale-response guard and keeps the previous stack's data

**File:** `client/src/hooks/use-service-health-events.ts:23-48`; `client/src/hooks/use-stack-uptime.ts:55-57`

**Issue:** `useStackUptime` and `useStackUptimes` guard against out-of-order responses with a request counter. `useServiceHealthEvents` has no such guard, and the fix was missed here. Every `container_state` frame for the stack triggers an independent background fetch. A slow older response can therefore overwrite a newer one, and the history shows older data. When `stackId` changes, `events` is never reset, and a late response for the old stack can land after the new fetch started. The previous stack's events are shown under the new stack until the request returns.

`useStackUptime` has the same last-state issue on `stackId` change: `uptime` is not cleared, so the old stack's figures show while loading.

**Fix:** Copy the `latestRequest` ref pattern from `useStackUptime`, and reset `events` to `null` when `stackId` changes.

### WR-07: The "HTTP probe" badge is derived from any historic event

**File:** `client/src/routes/app/stacks/components/services-section.tsx:104-106`

**Issue:** `isProbed = serviceEvents.some((event) => event.source === "http-probe")`. History is retained for up to 365 days, and `ServiceHealthService.healthAfterClear` records a Docker-sourced transition when a probe is removed. After a user removes a probe block, older `http-probe` rows are still in the list, so the badge keeps claiming the service is HTTP-probed. In the other direction, a probe that was added to a healthy service and has produced no transition yet has no badge. The comment acknowledges there is no DB column, but `.some` over history is not an accurate substitute.

**Fix:** Expose the probe state explicitly (for example `probeConfigured` from the stack detail, computed on the server from `ProbedServiceRegistry`). As an interim fallback, look at the newest event only, for example `serviceEvents[0]?.source === "http-probe"`.

### WR-08: Each `useContainerEvents` call opens its own EventSource, and Phase 14 adds more

**File:** `client/src/hooks/use-service-health-events.ts:50`; `client/src/hooks/use-stack-uptimes.ts:41`; used by `client/src/routes/app/stacks/index.tsx` and `client/src/routes/app/dashboard.tsx`

**Issue:** `useContainerEvents` creates a new `EventSource("/api/events")` per hook instance. Phase 14 adds one on the stack Overview tab (alongside `useStack` and `useStackEvents`) and one on the Dashboard and Stacks pages (alongside `useStacks`). Browsers allow about 6 concurrent connections per origin on HTTP/1.1, and every SSE stream holds one for its lifetime. The stack detail page now holds several of these, and regular fetches queue behind them. The Phase 14 pages each add to that pool.

**Fix:** Share a single `EventSource` through a module-level subscriber set or a context provider, and have `useContainerEvents` subscribe to it. Alternatively, derive the refetch trigger from state a hook on the page already receives.

### WR-09: `DiskUsageJob.kickoff()` bypasses the job guard and can overlap the cron run

**File:** `server/src/jobs/disk-usage-job.ts:53-78`

**Issue:** `kickoff()` calls `this.run()` directly instead of going through `IntervalJob.runGuarded`. As a result, the post-boot scan never calls `recordRun` or `recordError` on the health reporter, so the job reports "never ran" until 00:15. There is also no in-flight guard. If boot lands shortly before 00:15, or the first scan takes minutes on large volumes, the cron run starts a second concurrent `du` pass. Both then run `recordStackUsage` for the same stack (delete then create). A concurrent pair can collide on the `(stackId, name)` unique constraint and fail that stack's write.

**Fix:** Add an `inFlight` guard (as `HealthProbeJob` has) around `run()`. Report the kickoff outcome to the health reporter, for example by exposing a protected `runGuarded` hook or reusing it.

### WR-10: Self-identification via `os.hostname()` fails whenever the Docktor container has a custom hostname

**File:** `server/src/infrastructure/probe-transport.ts:34-41,349-352,376-390`

**Issue:** The container id is assumed to equal `hostname()`. This fails with `hostname:` set in Docktor's compose file, with `network_mode: host`, or under some runtimes. In that case `inspectContainer(selfId)` throws and `withReachableAddress` returns `NETWORK_UNREACHABLE` for every probe. All probed services then turn `unhealthy` after three checks, with the generic message "couldn't reach the container's network". This happens even when a shared network exists, because the self-inspect precedes the network choice. The sweep silently returns 0 because the failure is swallowed.

**Fix:** Resolve the id from `/proc/self/cgroup` or `/proc/self/mountinfo` (the container id appears in the `hostname`/`resolv.conf` mount paths), or from `process.env.HOSTNAME` as a fallback. At minimum, log a distinct, actionable warning when the self-inspect fails.

### WR-11: StatePoller's 404 path attributes a probe-owned service's health clear to `docker-healthcheck`

**File:** `server/src/jobs/state-poller.ts:196-225` (call at line 207)

**Issue:** In the container-gone branch, `emitHealthTransition(... null)` runs unconditionally. For a probe-owned service this records `healthy -> cleared` with source `docker-healthcheck` and no message. `HealthProbeJob` then emits `container-not-running`, but the row is already null, so the correct `http-probe` attribution is never written. The history shows a probe-owned service's change as Docker's.

**Fix:** Guard with the same ownership check used elsewhere.

```ts
if (!this.probeOwnership.isProbeOwned(stack.id, serviceName)) {
    this.emitHealthTransition(stack.id, serviceName, stack.services, null)
}
```

## Info

### IN-01: `isAlreadyConnected` treats every HTTP 403 as success

**File:** `server/src/infrastructure/probe-transport.ts:124-127`

**Issue:** Docker returns 403 for "already exists", but also for connecting to the host network and for plugin or socket-proxy denials. A genuine authorization failure is swallowed as "already attached", the request is then sent unattached, and the result is a misleading `network-unreachable`.

**Fix:** Also match on the message (`already exists`) before swallowing a 403, and rethrow other 403s.

### IN-02: A single non-UTF-8 volume directory name permanently blocks a stack's measurement

**File:** `server/src/infrastructure/disk-usage-scanner.ts:76-85`; `server/src/jobs/disk-usage-job.ts:136-147`

**Issue:** `readdir` decodes names as UTF-8 and replaces invalid bytes. The re-encoded path passed to `du` does not exist, `du` prints nothing, and `measureBytes` returns `null`. The whole stack is skipped on every run (all-or-nothing, T-14-55). `StorageStatusAlerts` only looks at the newest `measuredAt` across all stacks, so one stack stuck at "Not measured" while others succeed never raises an alert.

**Fix:** Read names as buffers (`readdir(dir, {withFileTypes: true, encoding: "buffer"})`) or skip an unmeasurable volume with a warning. Consider surfacing a per-stack staleness hint.

### IN-03: `readHealthProbes` does not resolve YAML merge keys or aliases

**File:** `client/src/lib/compose-health-probe.ts:59-72`

**Issue:** The server parser uses `toJS()`, which resolves `<<: *anchor`. The client reads through `doc.getIn`, which does not. A service that inherits `x-docktor` through a merge key is probed by the server but shown as "off" in the Config tab. Enabling it there writes a duplicate local block. This is cosmetic and safe, since an aliased `x-docktor` is left unchanged, but it is inconsistent.

**Fix:** Use `doc.toJS()` for reading, or show a read-only "inherited" state for such services.

### IN-04: `formatBytes` can display `1024.0 KB` and the like

**File:** `client/src/lib/format-bytes.ts:12-21`

**Issue:** A value just under a unit boundary rounds up at the display precision. For example, 1,048,575 bytes gives `1024.0 KB`, and 1,073,741,823 bytes gives `1024.0 MB`.

**Fix:** Compare the rounded value to the base before choosing the unit, or round before the unit loop.

### IN-05: Layering and convention deviations

**Files:** `client/src/hooks/use-stack-uptimes.ts:4`; `client/src/routes/app/settings/components/health-retention-card.tsx:11,62,82`

**Issue:** `use-stack-uptimes.ts` imports its return type `StackListUptimes` from a component module (`stack-list.tsx`), which inverts the intended hooks-to-components dependency. Declare the type in the hook or in `lib/`. `HealthRetentionCard` calls `getHealthSettings` and `saveHealthSettings` directly from the component, against the "use a custom hook for fetching" rule. It copies the existing `ComposeChecksCard` pattern, so it fits the file's neighbours, but it adds to the debt.

**Fix:** Move the type, and extract a `useHealthSettings` hook.

### IN-06: Minor hardening for the HTTPS probe

**File:** `server/src/infrastructure/probe-transport.ts:261-264`

**Issue:** `rejectUnauthorized: false` is justified in the comment (the container IP never matches the certificate, and no credentials or body are sent). It is still a security hotspot. It is safe now because only a GET with fixed headers is sent. If custom request headers are ever added (for example an auth header), this becomes a credential leak.

**Fix:** Add an inline note next to the option stating that no request headers beyond `host` and `user-agent` may be added while verification is disabled. A regression test would also protect it.

---

_Reviewed: 2026-10-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
