# Phase 14: Health, Uptime and Disk Visibility - Research

**Researched:** 2026-10-07
**Domain:** Background-job health probing, status-history/incident persistence, `du`-based disk accounting, on a Fastify 5 + Prisma 7 + React 19 DDD monorepo
**Confidence:** MEDIUM-HIGH (in-repo facts verified by reading source this session; Docker-networking behaviour cited from docs; three locked-decision premises were found to be factually wrong and are flagged below)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**HTTP health probes - config & scope (#23)**
- **D-01:** Probe config lives in the compose file as a per-service `x-docktor: health-probe:` block (YAML remains the single source of truth). A small form on the stack's Config tab edits that same YAML - the save goes through the existing diff-confirm dialog (Phase 12 D-01/D-02/D-03), exactly like compose/.env edits. No DB-stored probe config. - **Reversibility:** reversible - removing the block or the form surface restores the previous behavior; no data-model change beyond reading the compose file.
- **D-02:** Expected status is **any 2xx/3xx (200-399)** - no explicit expected-code field. A response in 2xx/3xx is healthy; 4xx/5xx, timeout, or connection failure is unhealthy.
- **D-03:** Probes are **per-service only**; there is no stack-level probe concept. Stack health emerges automatically via the existing `deriveStackStatus()` aggregation over `Service.healthStatus` - unchanged logic, reused as-is.
- **D-04 (brownfield/adopted-in-place stacks):** no separate carve-out needed - probe config is compose-file-based, so adopted stacks opt in the same way.

**HTTP health probes - execution & status integration (#23)**
- **D-05:** The probe runs as Node `fetch` from Docktor's own container to the **target container's IP on its compose network**: the probe URL's `localhost` (or `127.0.0.1`) host is resolved to the inspected container's network IP before fetching. No curl/wget dependency is assumed inside target images, and internal compose networks work without published ports. Requires Docker's inter-bridge routing (on by default for user-defined networks; a `internal: true` network can't be reached - that case is the user's own constraint, and counts as a failed probe per D-07's fail-closed rule).
- **D-06:** Cadence: **30s per service**, one `IntervalJob`, staggered per service to avoid a thundering herd (mirrors Docker healthcheck's default interval).
- **D-07:** When a service has both an `x-docktor` probe AND a Docker healthcheck, the **probe overrides** - it becomes the service's sole health signal for `Service.healthStatus`. Services without a probe keep Docker-healthcheck-derived status exactly as today. (No OR/AND combination logic.)
- **D-08:** A service is marked unhealthy only after **3 consecutive probe failures**, plus a **60s startup grace period** after a container (re)start (slow-booting apps aren't instantly flagged). Probe-execution errors (inspect/routing failures) count as a failed probe - **fail-closed**. Mirrors Docker's `start_period` + 3-failed-checks semantics.

**Uptime & incidents (#24)**
- **D-09:** Downtime = time spent in **UNHEALTHY or ERROR**. STOPPED, DRAFT, and transitional states are neither up nor down and are excluded from both the numerator and denominator of the uptime percentage (partially-stopped maintenance doesn't tank the number). Consistent with `NotificationWatcher`, which already treats ERROR + UNHEALTHY as the two alert-worthy degradations.
- **D-10:** Retention window: **30-day global default**, configurable in Settings (1-365 days), **no per-stack override**. The uptime % and incident list are computed over this window; older rows are pruned by a scheduled job.
- **D-11:** Incidents use the **existing, scaffolded-but-unused `StackIncident` model** (`triggerType`, `createdAt` = start, `resolvedAt` = end; duration = resolvedAt - createdAt). One row per unhealthy/error episode per stack. Stack-level status transitions continue to use the existing `StatusLog` (already surfaced on the activity timeline) - no rework of that model.
- **D-12:** Per-service health history is **retained in a new per-service health-event table** (serviceId, fromStatus, toStatus, source: `docker-healthcheck` | `http-probe`, createdAt). Surfaced as a compact per-service health timeline in the stack detail's Services section. This satisfies #23's "visible per stack and per service".

**Disk usage (#27)**
- **D-13:** Measurement: a scheduled job runs `du` on each stack directory and each volume subdirectory (`DOCKTOR_STACKS_DIR/<stack>/volumes/*`), writing the existing `Stack.volumeSizeBytes`/`volumeSizeAt` fields plus new per-volume rows. This matches the bind-mounts-only constraint (all app data lives under `./volumes/`) and the project's shell-out-to-CLI pattern. Cadence: **daily**, matching the existing `DiskChecker`.
- **D-14 - backups are included in the disk view:** the Storage view also shows the **backup repository** (`DOCKTOR_BACKUP_DIR`, the restic repo) as its own distinct section/row, sized via `du`, and it counts toward the grand total - so the user sees the whole disk picture (per-stack app data + per-volume breakdown + backups), not just stacks.

**Views (#24, #27)**
- **D-15:** One new top-level **Storage** page: a sortable table of stacks (Size column) with expandable per-volume rows, a **Backups** section (D-14), and a grand total at the top. Plus a compact per-stack disk figure on the stack detail page.
- **D-16:** Uptime lives where stacks already are - no separate "Health" nav page this phase: a per-stack uptime % column on the dashboard's stack rows, and on each stack detail's Overview tab an **Uptime card** (percentage + window) and an **incident list** (start | end | duration), fed by the StackIncident rows.

### Claude's Discretion
- Exact UI shape of the per-service health timeline markers (D-12), the Storage page's layout details in the du job, and the prune-job mechanics beyond what D-10 specifies.
- Exact storage of per-volume rows (new Prisma model vs JSON column) and the probe history table's exact fields - planner decides the cleanest fit to the existing `repositories/` + Prisma patterns.

### Deferred Ideas (OUT OF SCOPE)
- **CPU / memory live resource stats** (from the `add-live-resource-stats` todo) - only the *disk* part of that vision is in scope (#27). CPU/memory have no roadmap phase.
- **`container-status-unknown-after-deploy`** todo - an observability bug (status shows "unknown" up to 60s after deploy/redeploy). Not required by #23/#24/#27.
- Reviewed todos not folded: `2026-09-11-add-live-resource-stats-to-stacks-cpu-memory-disk.md` (disk part folded into #27, CPU/memory deferred) and `2026-08-28-container-status-unknown-after-deploy.md` (deferred).
</user_constraints>

<phase_requirements>
## Phase Requirements

Requirements are GitHub issues (REQUIREMENTS.md is frozen at v1.0 and carries no IDs for this phase).

| ID | Description | Research Support |
|----|-------------|------------------|
| #23 | Optional per-service HTTP health probes feeding the existing status model + retained per-stack/per-service health-transition history; existing ERROR/UNHEALTHY notifications unaffected | Probe execution recipe (node:http + lookup), network-reachability finding (D-05 premise refuted), reconcile-clobber finding, health-event table keyed by (stackId, serviceName), event wiring that preserves NotificationWatcher |
| #24 | Per-stack uptime % over configurable retention window + incident list (start/end/duration), depends on #23 history | Pure `computeUptime` over StatusLog, StackIncident writer with keyed lock (NULL-distinct unique pitfall), retention setting + prune job, batch uptime endpoint |
| #27 | Sortable per-stack/per-volume disk usage view with a total; beyond host-level low-disk warning | `du` recipe and error tolerance, startup-blocking pitfall, backup-location finding (D-14 premise refuted), BigInt serialization pitfall, Storage page structure |
</phase_requirements>

## Summary

The phase is almost entirely brownfield integration: the job abstraction (`IntervalJob`), event bus, `deriveStackStatus()`, `StatusLog`, the empty `StackIncident` scaffold, and the unused `Stack.volumeSizeBytes/volumeSizeAt` columns already exist. No new npm packages are needed (`node:http`, `yaml`, `du`, existing `node-cron`, `dockerode`, `zod`). The work is: one new probe job + a pure evaluation/uptime/incident domain layer + three small repositories + two Prisma models + a handful of REST endpoints + five client surfaces (Storage page, dashboard uptime column, Overview uptime card/incident list, per-service health timeline, Config-tab probe form) + one Settings card.

**Research found three premises in the locked decisions that are factually wrong against this codebase / Docker docs. The decisions' intent is preserved below, but the planner must not implement them literally, and the user should be told before execution:**

1. **D-05 (network reachability).** Docker installs rules so containers on *different* bridge networks can only talk via published ports - there is no default "inter-bridge routing". Docktor runs on its own compose network; a managed stack has its own default network. A Node request from Docktor's container to the target container's network IP will therefore time out in the standard deployment. A reachability mechanism is required (recommended: short-lived `network connect` of Docktor's own container to the target network, then `disconnect`). See *Finding 1*.
2. **D-14 (backup location).** `DOCKTOR_BACKUP_DIR` is not read anywhere in `server/src`, and is not set in `docker-compose.yml` or the `Dockerfile`. The local restic repository is `<stackPath>/backups` - one repo *inside each stack directory*. The "Backups" section must therefore be a per-stack `du` of `<stack>/backups`, and the grand total must be `volumes + backups` (not the whole stack-dir total) to avoid double counting. See *Finding 2*.
3. **D-12 (`serviceId` key).** `replaceServices()` does `service.deleteMany` + `createMany` on every deploy, minting new `Service.id` values. A health-event table keyed to `Service.id` with a FK would lose (cascade) or orphan all history on each deploy. Key it by `(stackId, serviceName)`. See *Finding 3*.

Two further existing defects block the phase goal and must be fixed inside it: `StatePoller.reconcile()` overwrites every service's `healthStatus` with `null` every 60s (so probe-derived - and even Docker-derived - health is clobbered and HEALTHY/UNHEALTHY flaps to RUNNING), and `GET /api/stacks` returns raw Prisma rows so the first non-null `Stack.volumeSizeBytes` (a `BigInt`) will make JSON serialization throw. See *Findings 4 and 5*.

**Primary recommendation:** Build `HealthProbeJob` (5s tick, per-service `nextDueAt`, in-flight guard) as a pure producer that emits a new `service.probe_completed` event; an application service applies the pure `evaluateProbe()` rule, persists `Service.healthStatus`, appends `ServiceHealthEvent`, re-derives stack status via the unchanged `deriveStackStatus()`, and re-emits the *existing* `stack.container_state_changed` event so SSE and `NotificationWatcher` behave identically. Fix `reconcile()` to inspect real container health first. Compute uptime from `StatusLog` with a pure function, write `StackIncident` rows from an idempotent per-stack-locked subscriber, and measure disk with per-path `du -sk` in a daily job that never blocks `startAll()`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Probe config storage (`x-docktor`) | Filesystem (compose YAML) | API (read/parse) | D-01: YAML is source of truth; no DB column |
| Probe config editing form | Browser / Client | API (existing PUT + preview) | Form edits the compose buffer; existing diff-confirm save path applies it |
| Probe execution (HTTP request, IP resolution, attach) | API / Backend (job + infrastructure adapter) | Docker daemon | Needs Docker socket + routable network from Docktor's process |
| Probe-result evaluation (3 failures, grace) | API / Backend - domain (pure) | - | Pure rule, unit-testable, no I/O |
| Service/stack health status write | API / Backend (application service + repository) | - | Single writer of `Service.healthStatus` for probed services |
| Health-event + incident persistence | Database / Storage | API (subscribers) | Retained history; subscribers react to bus events |
| Uptime % computation | API / Backend - domain (pure) over `StatusLog` | Database | Reads transitions, never stores a derived percentage |
| Retention setting + prune | API (settings service + job) | Database | Global setting 1-365 days; scheduled prune |
| Disk measurement (`du`) | API / Backend (job + infrastructure adapter) | OS | Shell-out-to-CLI project pattern |
| Storage / uptime / incident views | Browser / Client | API (read endpoints) | Page composition rules; sorting is client-side (small N) |

## Standard Stack

No new external packages. Everything is already installed and used elsewhere in the repo.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:http` / `node:https` | Node 22 (image `node:22-slim`) | Probe request with `lookup` override | Keeps `Host: localhost:<port>` while connecting to the container IP; `fetch` ignores a `Host` override (verified experimentally below) |
| `node-cron` | 3.0.3 [VERIFIED: node_modules/node-cron/package.json] | 5s-tick `IntervalJob`, daily jobs | Already the `IntervalJob` base; 6-field second-granularity expressions validate (`*/5 * * * * *` -> true) |
| `dockerode` | 4.0.9 [VERIFIED: node_modules/dockerode/package.json] | `inspectContainer` (IP, `State.StartedAt`), `getNetwork().connect/disconnect` | Existing `DockerodeClientPort`; types expose `NetworkConnectOptions {Container?, EndpointConfig?}` |
| `yaml` | server ^2.7.0 / client 2.9.1 [VERIFIED: package.json files] | Parse `x-docktor`; surgical Document-API edits in the form | Same approach as `compose-proxy-editor.ts` (`parseDocument`/`setIn`/`deleteIn`) |
| `zod` | ^4.3.6 | Probe-config + settings schemas in `@docktor/shared` | CLAUDE.md: all validation schemas live in shared |
| Prisma | 7.4.0 [VERIFIED: node_modules/prisma/package.json] | Two new models + migration | Existing; migrations via `prisma migrate dev`, never hand-edited |
| GNU `du` | coreutils (present in `node:22-slim` Debian base; 8.32 locally) | Disk measurement | D-13 shell-out pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `withKeyedLock` (`server/src/lib/keyed-mutex.ts`) | in-repo | Serialize incident open/close per stack | Every incident write (see Pitfall 6) |
| react-hook-form + `standardSchemaResolver` | in-repo | Probe form, retention settings card | Pattern copied from `compose-checks-card.tsx` |
| `ToneBadge` / `StatusDot` / `Section` / `Page` primitives | in-repo | All new UI | CLAUDE.md UI rules |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:http` + `lookup` | `fetch` (D-05 wording) | `fetch` cannot override `Host` and offers no per-request resolver without importing `undici` as a new dependency; virtual-host apps would see `Host: <ip>:<port>` and may 404 -> false unhealthy |
| Ephemeral attach/detach | Persistent attach of Docktor to every probed network | Persistent attach makes `docker compose down -v` fail to remove the network ("network has active endpoints"); orphan networks accumulate |
| Ephemeral attach/detach | Helper container per probe (`docker run --network <net> <selfImage> curl`) | Matches `socket-inspector.ts` precedent and needs no attach, but spawns a container per probe per 30s |
| `du -sk` per path | Node `fs` walk | Slow and CPU-heavy on large volumes; `du` is the D-13 decision |

**Installation:** none. (`yarn install` is unchanged.)

**Version verification:** no packages added; installed versions read from `node_modules/*/package.json` this session.

## Package Legitimacy Audit

No external packages are installed by this phase, so the `package-legitimacy` gate was not run and no `checkpoint:human-verify` install task is required.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | - | - | - | - | - | - |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 compose YAML (x-docktor.health-probe)                    Docker daemon (socket)
        |  read + hash-cache                                   ^   |
        v                                                      |   | inspect (IP, StartedAt, Networks)
 +-----------------+   5s tick, per-service nextDueAt    +-----+---+------+
 | HealthProbeJob  |------------------------------------>| ProbeTransport  |  (infrastructure)
 | (IntervalJob)   |  list probed+running services        | attach? -> node:http GET (lookup=IP)
 +--------+--------+                                      | -> detach (finally)
          | emit service.probe_completed {stackId, service, containerId, startedAt, ok, reason}
          v
 +----------------------------- domain event bus -----------------------------+
 |  ServiceHealthService (subscriber, application)                             |
 |   evaluateProbe(prevState, result, startedAt, now) [pure]                   |
 |   -> Service.healthStatus (repo)  -> ServiceHealthEvent row (source http-probe)
 |   -> deriveStackStatus(all services) [unchanged] -> updateStackStatus -> StatusLog
 |   -> emit stack.container_state_changed (existing)  + service.health_changed (new)
 +------------+---------------------------------+-----------------------------+
              |                                 |
   existing consumers (unchanged)       new consumers
   - NotificationWatcher (ERROR/UNHEALTHY timers)   - IncidentTracker (per-stack lock)
   - state-broadcast-subscriber -> SSE                 observeStackStatus -> StackIncident open/close
                                                      - HealthHistory (docker-healthcheck rows)
 StatePoller.handleEvent / reconcile / ContainerStateCatchUp
   -> inspect real health; if service has probe config keep probe status, else write docker health
   -> emit service.health_changed {source: docker-healthcheck} when value differs

 READ SIDE (REST, requireAuth)
  GET /api/uptime/stacks            -> { windowDays, stacks: [{stackId, percent|null}] }   (dashboard column)
  GET /api/stacks/:id/uptime        -> { percent, windowDays, since, incidents[] }
  GET /api/stacks/:id/health-events -> per-service transitions (limit, optional serviceName)
  GET /api/storage                  -> { totalBytes, measuredAt, stacks[{volumes[], backupBytes}] }
  GET/PUT /api/settings/health      -> { retentionDays }

 DISK: DiskUsageJob (daily, non-blocking first run) -> du -sk per <stack>/volumes/* and <stack>/backups
        -> Stack.volumeSizeBytes/At (sum of volumes) + StackVolumeUsage rows + backup size
 PRUNE: HealthHistoryPruner (daily) -> ServiceHealthEvent, resolved StackIncident, (StatusLog w/ anchor)
```

### Recommended Project Structure
```
shared/src/validation/health.ts            # healthProbeSchema, healthSettingsSchema, response types
server/src/domain/health-probe.ts          # constants + evaluateProbe() + isProbeSuccess()
server/src/domain/uptime.ts                # classifyStatus(), computeUptime()
server/src/domain/incident-tracking.ts     # decideIncidentAction()
server/src/domain/events.ts                # + service.probe_completed, service.health_changed
server/src/lib/compose-health-probe.ts     # parseHealthProbes(content) (server) - mirror editor on client
server/src/infrastructure/probe-transport.ts   # node:http request + network attach/detach
server/src/infrastructure/disk-usage-scanner.ts# du wrapper (execFile, injectable runner)
server/src/application/ports/                  # probe-transport-port.ts, disk-usage-scanner-port.ts
server/src/application/service-health-service.ts
server/src/application/incident-tracker.ts
server/src/application/uptime-service.ts
server/src/application/storage-service.ts
server/src/application/subscribers/health-subscriber.ts   # registered in register.ts
server/src/repositories/service-health-event-repository.ts
server/src/repositories/stack-incident-repository.ts
server/src/repositories/stack-disk-usage-repository.ts
server/src/jobs/health-probe-job.ts, disk-usage-job.ts, health-history-pruner.ts
server/src/routes/health.ts, storage.ts                   # + settings route additions
server/prisma/schema/service-health-event.prisma, stack-disk-usage.prisma
client/src/lib/health-api.ts, storage-api.ts, compose-health-probe.ts
client/src/hooks/use-stack-uptime.ts, use-stack-uptimes.ts, use-service-health-events.ts, use-storage.ts
client/src/routes/app/storage.tsx + routes/app/storage/components/*
client/src/routes/app/stacks/components/uptime-card.tsx, incident-list.tsx,
    service-health-timeline.tsx, health-probe-form.tsx
client/src/routes/app/settings/components/health-retention-card.tsx
```

### Pattern 1: Producer job -> pure domain rule -> subscriber (Phase 10 shape)
**What:** The job does I/O only and emits an event; a pure function decides; an application service persists and re-emits. Mirrors how `DiskChecker` emits `disk.threshold_crossed` and `notification-subscriber.ts` consumes it.
**When to use:** Probe results, health transitions, incident open/close.

### Pattern 2: Tick scheduler instead of one cron per service
**What:** `IntervalJob` only accepts a single cron expression. Use `cronExpression = "*/5 * * * * *"`, keep `Map<serviceKey, {nextDueAt, failures, containerId, startedAt}>`, probe only services whose `nextDueAt <= now`, initialise `nextDueAt = now + (hash(key) % 30_000)` (D-06 stagger), and guard with an `inFlight` boolean because `IntervalJob.runGuarded()` does **not** prevent overlapping runs. Set `runImmediatelyOnStart = false`.
**Example:**
```typescript
// Source: server/src/jobs/job.ts (IntervalJob) - subclass contract
export class HealthProbeJob extends IntervalJob {
    readonly name = "HealthProbeJob"
    protected readonly cronExpression = "*/5 * * * * *"
    protected readonly runImmediatelyOnStart = false
    private inFlight = false
    protected async run(): Promise<void> {
        if (this.inFlight) return
        this.inFlight = true
        try { await this.probeDueServices(Date.now()) } finally { this.inFlight = false }
    }
}
```

### Pattern 3: Probe request preserving Host header (verified)
**What:** `node:http` with a `lookup` override connects to the container IP while the URL (and therefore `Host`) keep `localhost:<port>`; redirects are not followed (so a 302 is seen as 302, i.e. healthy per D-02).
**Example:**
```typescript
// Verified in /tmp experiment this session (Node 24.14): server saw "localhost:<port>" and status 302 was returned unfollowed.
import http from "node:http"
export function probeOnce(url: string, ip: string, timeoutMs: number): Promise<{status: number} | {error: string}> {
    return new Promise((resolve) => {
        const req = http.request(url, {
            method: "GET",
            timeout: timeoutMs,
            // Node >=20 may call lookup with {all: true}; answer both shapes.
            lookup: (_host, opts, cb) =>
                (opts as {all?: boolean}).all ? cb(null, [{address: ip, family: 4}] as never) : cb(null, ip, 4),
        }, (res) => { res.resume(); resolve({status: res.statusCode ?? 0}) })
        req.on("timeout", () => req.destroy(new Error("timeout")))
        req.on("error", (e) => resolve({error: e.message}))
        req.end()
    })
}
```
Healthy iff `200 <= status <= 399` (D-02). Never read or store the response body (`res.resume()` only).

### Pattern 4: Compose `x-docktor` block
Compose spec allows `x-` extension fields inside a service and ignores them [CITED: docs.docker.com/reference/compose-file/extension/ - "They also can be used within any structure in a Compose file where user-defined keys are not expected." / "Compose ignores any fields that start with `x-`"]. Recommended shape (planner discretion on exact field names):
```yaml
services:
  web:
    image: nginx
    x-docktor:
      health-probe:
        url: http://localhost:8080/health   # container-internal port, not the published host port
        timeout: 5                          # optional, seconds, 1-30, default 5  [ASSUMED]
```
`parseComposeContent()` (`lib/compose-parser.ts`) only reads `image`, `ports`, `volumes`, so the extra key never breaks the existing parser. Do **not** add the probe to `ParsedService`/DB (D-01).

### Pattern 5: Client form edits the compose buffer, not the API
`ConfigTab` receives `files: StackConfigFiles` with `composeContent` + `setComposeContent`. The probe form reads the current buffer with a client `compose-health-probe.ts` (yaml `parseDocument`), and on change writes back via `files.setComposeContent(next)` using `doc.setIn(["services", name, "x-docktor", "health-probe", ...])` / guarded `deleteIn` (exactly the `compose-proxy-editor.ts` technique, which preserves comments/quoting). The existing Save button then routes through `previewStackChange` -> `DiffConfirmDialog` unchanged (D-01). Disable the form while the YAML does not parse. Wrap nothing new in `UnsavedChangesGuard` - the compose buffer's dirty flag already covers it.

### Anti-Patterns to Avoid
- **One `cron.schedule` per service:** leaks handles across compose edits; use the tick map.
- **Job writing `Service.healthStatus`/StatusLog directly:** violates the producer/subscriber rule in CONTEXT canonical refs.
- **Computing uptime from `StackIncident` durations:** incidents may include neutral time (e.g. DEPLOYING mid-outage); compute from `StatusLog` intervals (Finding 6).
- **Storing probe config in `Service` columns:** contradicts D-01. If a UI "HTTP probe" badge is wanted, derive it from the latest `ServiceHealthEvent.source` or a read of the compose file, not a new config column.
- **Static route `/api/stacks/uptime` or `/api/stacks/storage`:** Stack ids are slugified user names; a stack named `uptime` would be shadowed by the static route. Use `/api/uptime/stacks` and `/api/storage`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML edit preserving comments | String splicing / re-stringify | `yaml` Document API as in `compose-proxy-editor.ts` | Comments/quoting preserved; precedent exists |
| Per-stack serialization | New mutex | `withKeyedLock(stackId, fn)` | Already unit-tested; used by ProxyService |
| Stack status aggregation | New health->status mapping | `deriveStackStatus()` | D-03: unchanged logic; keeps `NotificationWatcher` identical |
| Notification on unhealthy | A second notifier | Re-emit existing `stack.container_state_changed` | `NotificationWatcher` already subscribes; ERROR/UNHEALTHY unaffected (#23 criterion 4) |
| SSE for live updates | New event type | Existing `container_state` SSE frame (carries `healthStatus`, `stackStatus`) | `use-stack.ts` already patches service health from it; refetch uptime/incidents when `stack.status` changes |
| Settings persistence | New table | `Setting` key `health.retentionDays` via `settingsRepository.getMany/upsert` | Same as `composeChecks.*` keys |
| Form + validation | Ad-hoc state | react-hook-form + shared Zod + `standardSchemaResolver` | CLAUDE.md UI rule; `ComposeChecksCard` is the template |
| Disk size walk | Recursive `fs.stat` | `du -sk` via `execFile` | D-13; avoids CPU spikes |

**Key insight:** every "new" behaviour here is a new *input* to machinery that already exists (status derivation, event bus, notification watcher, SSE, diff-confirm). The risk is in the seams (reconcile overwrite, BigInt JSON, deploy wiping Service rows, network isolation), not in the new algorithms.

## Findings That Contradict or Extend Locked Decisions

### Finding 1: D-05's network premise is false - reachability needs a mechanism
[CITED: docs.docker.com/engine/network/drivers/bridge/] "By default, the Docker bridge driver automatically installs rules in the host machine so that containers connected to different bridge networks can only communicate with each other using published ports." Repo corroboration: `socket-inspector.ts` documents that Docktor's own container is on the default bridge network and sees only its own sockets, and already runs helper containers via the Docker socket for that reason [VERIFIED: server/src/infrastructure/socket-inspector.ts header comment: "inside Docktor's own container (default bridge network) a local `ss`/`lsof` only sees Docktor's own sockets"].

Consequence: in the documented `docker-compose.yml` deployment, probing `http://<container-ip>:<port>` from Docktor fails for every stack not sharing a network with Docktor.

Options (all keep "Docktor-side Node HTTP request, no curl in the target"):

| # | Mechanism | Pros | Cons |
|---|-----------|------|------|
| A | Ephemeral: before probing, `network.connect({Container: <self>})` to the service's network if Docktor is not already on a shared network; `disconnect` in `finally` | No lingering endpoint; `down -v` unaffected except during a ~second window | 2 extra Docker API calls per probe; a crash between connect/disconnect leaves an attachment (needs a startup sweep) |
| B | Persistent attach on first probe | Fewer API calls | Breaks `docker compose down -v` network removal; orphan networks |
| C | Helper container per probe (`socket-inspector` pattern) | No attach | A container spawn per probe per 30s |
| D | Require published port + gateway | Simple | Contradicts D-05's "no published ports" goal |

**Recommendation: A**, with: self id = `os.hostname()` (precedent `socket-inspector.ts` passes `hostname()` to `docker inspect`); network preference order = (1) a network Docktor is already attached to, (2) `<project>_default`, (3) first network with an `IPAddress`; treat HTTP 403 "already exists in network" on connect as success; a startup sweep that disconnects Docktor from networks labelled `com.docker.compose.project=<managed stack id>`; when `/.dockerenv` is absent (running `yarn dev` on the host) skip attach and use the IP directly (works on a Linux host, will fail on Docker Desktop - the developer's Windows setup - so expect probes to be unhealthy in that environment; integration-test with a real local HTTP server plus a fake Docker client instead). `network_mode: host|service:x` and `internal: true` networks yield no routable IP -> fail-closed with an explicit reason string recorded on the health event. **This needs user confirmation before execution (Assumptions A1/A2).**

### Finding 2: D-14's backup location is wrong
[VERIFIED: server/src/application/backup-service.ts:985-989]
```
        // Always use stack-local backup directory
        if (stackPath) {
            base.RESTIC_REPOSITORY = path.resolve(stackPath, "backups")
```
All three `buildEnv(...)` call sites pass `stack.hostPath` (lines 236, 405, 663), and restic excludes `./backups` from the backup itself (`restic-executor.ts:150`). `DOCKTOR_BACKUP_DIR` appears only in `.env.development` and planning docs, never in `server/src`. So: size `<stackPath>/backups` per stack (a "Backups" section with one row per stack, plus a backups subtotal), and define grand total = Σ volumes + Σ backups. sftp/s3 repositories consume no local disk and are simply absent. `Stack.volumeSizeBytes` is documented as "last measured size of ./volumes/" [VERIFIED: server/prisma/schema/stack.prisma "volumeSizeBytes  BigInt? // last measured size of ./volumes/"] - write the volumes sum there, not the whole stack dir. Adopted-in-place stacks (`isAdoptedInPlace`) may not use `./volumes/` at all; when `<stack>/volumes` is missing, fall back to bind-mount host paths from `Service.volumes` that resolve inside the stack directory (planner discretion; else show "not measured"). *(Resolved during planning: no fallback. A missing `volumes` folder measures as 0 bytes. See Open Question 3.)*

### Finding 3: Health history must not be keyed to `Service.id`
[VERIFIED: server/src/repositories/stack-repository.ts:120-143] `replaceServices` runs `prisma.service.deleteMany({where: {stackId}})` then `createMany` inside a transaction, on every deploy. New rows get new `cuid()` ids [VERIFIED: server/prisma/schema/service.prisma `id String @id @default(cuid())`]. Use:
```prisma
model ServiceHealthEvent {
  id          String   @id @default(cuid())
  stackId     String
  stack       Stack    @relation(fields: [stackId], references: [id], onDelete: Cascade)
  serviceName String
  fromStatus  String?   // "healthy" | "unhealthy" | "starting" | null
  toStatus    String?
  source      HealthSource
  message     String?   // e.g. "3 consecutive failures: connect ETIMEDOUT", probe reason
  createdAt   DateTime @default(now())
  @@index([stackId, serviceName, createdAt])
  @@index([createdAt])
}
enum HealthSource { DOCKER_HEALTHCHECK HTTP_PROBE }
```
(Prisma enum values are SCREAMING_SNAKE per CLAUDE.md; map to the D-12 `docker-healthcheck`/`http-probe` strings in the DTO.) Add `serviceHealthEvents ServiceHealthEvent[]` to `Stack`.

### Finding 4: `StatePoller.reconcile()` clobbers health every 60s
[VERIFIED: server/src/jobs/state-poller.ts:284-290 and 294-303] reconcile writes and derives with a hardcoded null:
```
                    await repo.updateServiceState({
                        stackId: stack.id,
                        serviceName: svcName,
                        containerId: container.Id,
                        containerState: container.State,
                        healthStatus: null,
                    })
...
                    if (matchingContainer) {
                        return {containerState: matchingContainer.State, healthStatus: null}
                    }
```
and the unit test pins it [VERIFIED: server/test/unit/jobs/state-poller.test.ts:196-197 `healthStatus: null,`]. Net effect today: a HEALTHY/UNHEALTHY stack is re-derived as RUNNING at the next 60s reconcile (`deriveStackStatus` needs a non-null health to return HEALTHY/UNHEALTHY). `NotificationWatcher` treats RUNNING as recovery (it clears the 120s UNHEALTHY timer), so with reconcile active an UNHEALTHY episode can be erased before it alerts, and incidents/uptime would close prematurely. Whether Docker re-emits `health_status` periodically is not verified here (A5), so the severity today is uncertain, but the write is certain.

**Required in this phase:** make reconcile call `inspectContainer` per matched container (as `handleEvent` already does) and pass `info.State.Health?.Status ?? null`; then apply the probe override (see Pattern in diagram). `ContainerStateCatchUp.observe()` already does this correctly [VERIFIED: server/src/application/container-state-catch-up.ts `healthStatus: info.State.Health?.Status ?? null`] and its `list`-fallback path (`healthStatus: null` when inspect fails) should preserve the stored value instead. Update the pinned test. This is in scope because #23 criterion 4 ("existing ERROR/UNHEALTHY notification behavior is unaffected") and #24 accuracy both depend on stable health state.

### Finding 5: BigInt breaks JSON serialization once `volumeSizeBytes` is populated
[VERIFIED: server/src/application/stack-service.ts:181-186 `listStacks()` returns `this.repo.findAll()` rows via `withServiceUpdateInfo`, spreading `...stack`; `findByIdWithRelations` likewise] and no BigInt serializer exists in `app.ts` (grep for `BigInt|bigint` finds only `backup-repository.toDto` converting `sizeBytes` and the disk-checker/event types). Reproduced: `JSON.stringify({a:1n})` -> `Do not know how to serialize a BigInt`. Writing `Stack.volumeSizeBytes` (D-13) will therefore 500 `GET /api/stacks` and `GET /api/stacks/:id`. Fix in the same plan as the disk job: map stacks through a small DTO helper in `StackService` (convert `volumeSizeBytes` to `number` - safe to 2^53 bytes, ~8 PiB - or string, planner choice; number is easier for client sorting) **before** the first write lands, and add a regression test that serializes a stack with a non-null BigInt.

### Finding 6: Incident/uptime correctness details
- `StackIncident` has `@@unique([stackId, triggerType, resolvedAt])` [VERIFIED: server/prisma/schema/notification.prisma] but Postgres treats NULLs as distinct [CITED: postgresql.org/docs/current/ddl-constraints.html - "By default, two null values are not considered equal in this comparison"], so the constraint does **not** prevent two open (`resolvedAt IS NULL`) incidents for the same stack/trigger. Prisma cannot express a partial unique index and migrations must not be hand-edited, so serialize with `withKeyedLock(stackId, ...)` plus find-open-then-create inside the lock. Do not use `upsert` on this unique key (null is not matchable in a compound unique `where`).
- Bus handlers are not awaited and `ContainerStateCatchUp` emits one `stack.container_state_changed` per service in one tick, so N handlers for the same stack run concurrently - another reason for the lock. Make the tracker state-based and idempotent (like `NotificationWatcher.handleStatusChange(stackId, stackStatus)`), subscribing to both `stack.status_changed` (payload `status`) and `stack.container_state_changed` (payload `stackStatus`), with a small in-memory `Map<stackId, openIncidentId|null>` cache to avoid a DB read on every container event.
- Rule: status in {UNHEALTHY, ERROR} and no open incident -> open (`triggerType` = the status); open incident and status UNHEALTHY<->ERROR -> keep it open (one episode); status in {RUNNING, HEALTHY, STOPPED} -> close (`resolvedAt = now`); transitional/DRAFT -> no change.
- Uptime % must come from `StatusLog`, not incidents: up = {RUNNING, HEALTHY}, down = {UNHEALTHY, ERROR}, neutral = everything else (D-09). Need the status in force at window start (the newest `StatusLog` row at/before `windowStart`; clamp the start to the stack's first log row). `percent = up / (up + down)`; return `null` (render "-") when `up + down == 0`. This is "as observed by Docktor": time with Docktor itself down carries the last status forward.
- Prune: `ServiceHealthEvent` and resolved `StackIncident` older than the window; `StatusLog` older than the window **but keep the newest row before the cutoff per stack** as the anchor (planner decision; StatusLog also feeds the activity timeline, so say so in the plan).
- Verbatim status values these rules rely on [VERIFIED: server/prisma/schema/stack.prisma enum StackStatus]: `DRAFT`, `DEPLOYING`, `RUNNING`, `HEALTHY`, `UNHEALTHY`, `STOPPED`, `ERROR`, `UPDATING`, `BACKING_UP`, `RESTORING`, `MIGRATING`. Transitional set [VERIFIED: server/src/domain/stack-state-derivation.ts:9-15]: `"DEPLOYING"`, `"UPDATING"`, `"BACKING_UP"`, `"RESTORING"`, `"MIGRATING"`. Service-level health values consumed by `deriveStackStatus` [VERIFIED: stack-state-derivation.ts:43-50]: `"unhealthy"`, `"healthy"`, `null`; probes should emit exactly `"healthy" | "unhealthy" | "starting"` (the badge in `service-status-badge.tsx` already renders `"healthy"`/`"unhealthy"` and falls back to "running" otherwise; `"starting"` yields RUNNING at stack level via the default branch).

### Finding 7: Startup blocking
[VERIFIED: server/src/jobs/job-registry.ts startAll: "Starts every registered job sequentially ... `await job.start()`"] and `IntervalJob.start()` awaits `run()` when `runImmediatelyOnStart` is true [VERIFIED: job.ts:61-68]; `startJobs()` runs inside Fastify's `onReady` hook [VERIFIED: app.ts]. A `du` pass over large volumes with `runImmediatelyOnStart = true` would delay every later job and the HTTP listener for minutes. Use `runImmediatelyOnStart = false` for both the probe job and the disk job, register the disk job last, and trigger the first disk scan without awaiting it (e.g. facade `start()` does `await job.start(); void kickoff()` after a short delay). A fresh install otherwise shows an empty Storage page for up to 24h.

## Common Pitfalls

### Pitfall 1: Probes silently fail in the standard deployment
**What goes wrong:** Every probed service goes UNHEALTHY after ~90s; `NotificationWatcher` emails after 2 more minutes.
**Why:** Cross-network isolation (Finding 1) + fail-closed D-08.
**How to avoid:** Implement the attach mechanism; record the failure reason (`no route`, `timeout`, `refused`, `no ip`) in `ServiceHealthEvent.message` so users can tell "app down" from "Docktor can't reach it".
**Warning signs:** All services of a stack flip together; message reads `ETIMEDOUT`.

### Pitfall 2: `fetch` Host header
**What goes wrong:** App behind name-based routing returns 404/421 for `Host: 172.x.x.x:8080`.
**How to avoid:** `node:http` + `lookup` (verified: `fetch` with `headers: {Host}` still sent `127.0.0.1:<port>`; `http.request` with `lookup` sent `localhost:<port>`).

### Pitfall 3: Redirect following hides 3xx
**What goes wrong:** Following a 302 to a login page that 404s marks a healthy app unhealthy (D-02 says 3xx is healthy).
**How to avoid:** `http.request` does not follow redirects; if `fetch` were used it needs `redirect: "manual"` (verified: status 302 returned).

### Pitfall 4: Stale probe status after the probe is removed or the container stops
**What goes wrong:** `Service.healthStatus` keeps `"unhealthy"` from the last probe; `deriveStackStatus` reports UNHEALTHY for a service that is exited or no longer probed.
**How to avoid:** Probe job skips non-running services and, on transition to not-running or no-probe, clears `healthStatus` (null) through the same transition path (emits a `ServiceHealthEvent` with `toStatus` null). Reconcile (after Finding 4's fix) then restores Docker health for un-probed services.

### Pitfall 5: Grace period and counter reset
**What goes wrong:** A restarted container inherits the previous container's failure count or the previous `"healthy"`.
**How to avoid:** Track `State.StartedAt` from `inspectContainer`; when it (or `containerId`) changes, reset counters, set `"starting"`, and ignore failures for 60s (a success still flips straight to `"healthy"`). Counters are in-memory; a Docktor restart resets them (acceptable, document it).

### Pitfall 6: Duplicate open incidents
See Finding 6: keyed lock + find-open-then-create; unique key does not protect you.

### Pitfall 7: Existing Playwright guard fails every spec that touches new endpoints
`client/test/integration/fixtures.ts` registers a catch-all `**/api/**` abort and throws at test end if any request was unstubbed [VERIFIED: fixtures.ts `_apiRouteGuard` - "Unstubbed API request(s) reached the network"]. The dashboard (uptime column) and stack Overview (uptime card, incidents, health events) gain new fetches, so every existing spec visiting those pages needs default stubs. Add central default stubs for the new endpoints in `fixtures.ts` (like `/api/events`) or the whole e2e suite goes red. Same for unit tests that render `Dashboard`/`OverviewTab`/`ServicesSection`/`ConfigTab` - new hooks must be mockable and defaults provided.

### Pitfall 8: `du` exit code non-zero on unreadable subtrees
Docktor runs as root in its container (no `USER` in the Dockerfile [VERIFIED: grep `USER` -> only `CMD`]) so permission errors are rare, but `du` still exits 1 on any unreadable entry or a file vanishing mid-scan. With `execFile` promisified, the rejection object carries `stdout`; parse it and keep the number instead of discarding the whole measurement. Use `--` before the path, one `du` invocation **per path** (a single call with several args de-duplicates hard links across args), `execFile` argv arrays only (never a shell), and a generous timeout (minutes) - a timeout keeps the previous stored size and logs. On Windows dev hosts `du` is absent: log once and skip.

### Pitfall 9: Symlinked volume subdirectories
`readdir` entries under `volumes/` may be symlinks to elsewhere. Use `lstat`/`withFileTypes` and only measure real directories inside the stack path (`getStackPath()` already throws on escape); skip symlinks to avoid measuring (or leaking the size of) arbitrary host paths via the `/:/host:ro` mount.

### Pitfall 10: Service rows are replaced on deploy
Anything keyed by `Service.id` (including in-memory probe state) is invalidated by `replaceServices`. Key by `stackId + "/" + serviceName`, re-read services each tick.

### Pitfall 11: Changing `x-docktor` may recreate containers on next `up`
Whether Compose includes extension fields in the service config hash was not verified (A3). If it does, adding/removing a probe plus Deploy recreates the container (restart blip). Mention in form helper text only if confirmed during implementation; the probe itself starts within one tick of the compose file changing with no redeploy, because the job re-reads the file.

### Pitfall 12: Fastify route shadowing
See Anti-Patterns: do not add `/api/stacks/<static-word>` GET routes.

## Code Examples

### Pure probe evaluation (domain)
```typescript
// Source: derived from D-06/D-08; constants are the locked decision values
export const PROBE_INTERVAL_MS = 30_000
export const PROBE_FAILURE_THRESHOLD = 3
export const PROBE_STARTUP_GRACE_MS = 60_000

export type ProbeHealth = "healthy" | "unhealthy" | "starting"
export interface ProbeState { readonly consecutiveFailures: number; readonly health: ProbeHealth }

export function isProbeSuccess(status: number): boolean {
    return status >= 200 && status <= 399   // D-02
}

export function evaluateProbe(
    prev: ProbeState,
    result: {ok: boolean},
    ctx: {startedAtMs: number; nowMs: number},
): ProbeState {
    if (result.ok) return {consecutiveFailures: 0, health: "healthy"}
    const failures = prev.consecutiveFailures + 1
    const inGrace = ctx.nowMs - ctx.startedAtMs < PROBE_STARTUP_GRACE_MS
    if (inGrace) return {consecutiveFailures: 0, health: "starting"}        // failures in grace do not count (D-08)
    return {
        consecutiveFailures: failures,
        health: failures >= PROBE_FAILURE_THRESHOLD ? "unhealthy" : prev.health,
    }
}
```

### Uptime from StatusLog transitions (domain)
```typescript
// Source: D-09 classification; statuses verbatim from stack.prisma enum StackStatus
type Class = "up" | "down" | "neutral"
export function classifyStatus(status: string): Class {
    if (status === "RUNNING" || status === "HEALTHY") return "up"
    if (status === "UNHEALTHY" || status === "ERROR") return "down"
    return "neutral"
}
export interface Transition { readonly toStatus: string; readonly at: Date }
export function computeUptime(
    transitions: readonly Transition[],   // ascending by `at`; first entry = status in force at/before windowStart
    windowStart: Date,
    now: Date,
): {percent: number | null; upMs: number; downMs: number} {
    let up = 0, down = 0
    for (let i = 0; i < transitions.length; i++) {
        const from = Math.max(transitions[i]!.at.getTime(), windowStart.getTime())
        const to = Math.min(transitions[i + 1]?.at.getTime() ?? now.getTime(), now.getTime())
        if (to <= from) continue
        const c = classifyStatus(transitions[i]!.toStatus)
        if (c === "up") up += to - from
        else if (c === "down") down += to - from
    }
    return {percent: up + down === 0 ? null : (up / (up + down)) * 100, upMs: up, downMs: down}
}
```

### Settings key (follow `composeChecks.*`)
```typescript
// Source: server/src/application/settings-service.ts compose-check pattern
export const HEALTH_SETTING_KEYS = {RETENTION_DAYS: "health.retentionDays"} as const
// shared: healthSettingsSchema = z.object({retentionDays: z.number().int().min(1).max(365)})
// default 30 when the key is absent (D-10)
```

### `du` call
```typescript
// execFile (argv array, no shell). Source pattern: server/src/infrastructure/socket-inspector.ts CommandRunner
const run = promisify(execFile)
async function sizeBytes(dir: string): Promise<number | null> {
    try {
        const {stdout} = await run("du", ["-sk", "--", dir], {timeout: 10 * 60_000})
        return Number.parseInt(stdout.split("\t")[0] ?? "", 10) * 1024
    } catch (err) {
        const out = (err as {stdout?: string}).stdout        // du exits 1 on unreadable entries but still prints a total
        const kb = Number.parseInt((out ?? "").split("\t")[0] ?? "", 10)
        return Number.isNaN(kb) ? null : kb * 1024
    }
}
```

### Client uptime formatting
Render `percent === null` as an en dash with a "No data in window" tooltip; otherwise one decimal (`99.9%`). Use `ToneBadge` tones (green >= 99.9, yellow >= 99, red below) - never hand-rolled pill classes.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Docker healthcheck only | Docker healthcheck + optional external HTTP probe | this phase | Probe overrides per service (D-07) |
| Host-level free-space check only | Per-stack/per-volume `du` view | this phase | `DiskChecker` unchanged |

**Deprecated/outdated:** `DOCKTOR_BACKUP_DIR` as a runtime path - referenced in docs/`.env.development` only; not read by server code (Finding 2).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Ephemeral connect/disconnect of Docktor's own container (identified via `os.hostname()`) to the target compose network is the right reachability mechanism, rather than persistent attach or a helper container | Finding 1 | Probes unreachable or `down -v` interference; user may prefer another option - **confirm with user** |
| A2 | `docker compose down -v` leaves a network behind (warning or error) when a foreign container is still attached; exact exit-code behaviour not tested | Finding 1 / Pitfall 1 | Delete-stack flow could throw; `deleteStack` already swallows `docker.down` errors |
| A3 | Compose may or may not include `x-` extension fields in the service config hash (container recreate on change) | Pitfall 11 | Extra container restart on Deploy after editing the probe |
| A4 | Restrict probe URL host to `localhost`, `127.0.0.1`, `[::1]` (all resolved to the container IP), scheme `http`/`https`, no userinfo | Security / Zod schema | Without it a compose author can make Docktor (which has the Docker socket and `/:/host:ro`) issue requests to arbitrary hosts (SSRF); this *narrows* D-05's "localhost or 127.0.0.1" wording - confirm |
| A5 | Docker emits `health_status` events only on transitions (not periodically); determines how visible the reconcile-clobber bug is today (the code write is verified regardless) | Finding 4 | Severity of existing bug misjudged; fix is required either way |
| A6 | For `https` probes skip certificate verification (liveness check to a container IP, certs will not match) | Pattern 3 | Security-conscious users may want verification; make it a conscious default |
| A7 | Probe `timeout` field optional, 1-30s, default 5s; no other fields (cadence fixed at 30s per D-06) | Pattern 4 | Planner may drop the field entirely |
| A8 | BigInt DTO conversion to `number` rather than string | Finding 5 | Client type change only |
| A9 | Pruning `StatusLog` older than the window (keeping one anchor row per stack) alongside `ServiceHealthEvent`/resolved `StackIncident` | Finding 6 | Shortens the existing activity timeline history for old entries; alternative is to leave `StatusLog` unpruned |
| A10 | `du -sk` (disk blocks) rather than `du -sb` (apparent bytes) is the right "disk consumption" measure | Pitfall 8 / examples | Sparse files/compression make numbers differ from `ls`-style sizes |
| A11 | Incident `triggerType` stores the *initial* status (`"UNHEALTHY"` or `"ERROR"`) and one episode spans UNHEALTHY<->ERROR flips | Finding 6 | Different incident granularity than the user pictured |

## Open Questions (RESOLVED)

All five questions are settled. Each entry keeps the original question and adds its resolution and the plan that implements it.

1. **Reachability mechanism (D-05 premise).** — **RESOLVED** (user decision, CONTEXT.md Post-Research Amendments 2026-10-07, "D-05 amended (reachability)")
   - Known: Docker blocks cross-bridge IP traffic by default; Docktor is on its own network.
   - Unclear (at research time): whether the user accepts Docktor transiently joining stack networks (A1), or prefers a helper container.
   - Recommendation (at research time): surface to the user as a pre-planning confirmation; plan around option A and isolate it behind `ProbeTransportPort` so it can be swapped.
   - **Resolution:** the user confirmed option A. Docktor joins the target stack network for the duration of each probe, then leaves it. There is no helper container and no permanent attachment. 14-06 creates `ProbeTransportPort`. 14-09 Task 2 implements the refcounted ephemeral attach, the network preference order and the crash-safe startup sweep. 14-09's human check verifies `docker compose down` with Docktor attached (A2).
2. **Backup row semantics (D-14).** Per-stack `<stack>/backups` rows + subtotal vs. one aggregate row. Recommendation: Backups section lists per-stack rows with a subtotal; no new env var. — **RESOLVED** (user decision, CONTEXT.md Post-Research Amendments, "D-14 amended")
   - **Resolution:** local backups live at `<stack>/backups`. The Backups section has one row per stack, and the grand total is volumes + backups, so nothing is counted twice. `DOCKTOR_BACKUP_DIR` is not read. 14-02 adds `Stack.backupSizeBytes` and serves the per-stack backups list and totals from `GET /api/storage`. 14-14 sizes `<stack>/backups` behind an lstat check. 14-05 renders the Backups section and the subtotal.
3. **Adopted-in-place stacks without `./volumes/`.** Recommendation (at research time): fall back to `Service.volumes` bind paths inside the stack dir, else display "not measured". — **RESOLVED** (planner decision within CONTEXT.md's Claude's Discretion for the du job and RESEARCH Finding 2's "planner discretion"; recorded in 14-02's must_haves, objective and Task 1 action step 9)
   - **Resolution:** there is no `Service.volumes` fallback. Measurement covers exactly D-13's `<stack>/volumes/*`.
   - A stack whose `volumes` directory is missing is recorded as **measured: 0 bytes, no volume rows**. 14-05 shows it with the UI-SPEC copy "No volumes found in this stack's volumes folder.".
   - "Not measured" is reserved for a measurement that could not run (`du` missing, timed out, or printed no total). In that case the stack keeps its previously stored values (14-14).
   - Rationale:
     - (a) D-13 locks the measurement targets, and PROJECT.md's constraint is "Bind mounts only: named Docker volumes are rejected; all data in `./volumes/` subdir".
     - (b) The existing brownfield path already moves data under that folder. `migration-service.ts` creates `<stack>/volumes`, and `compose-rewriter.ts` rewrites converted binds to `./volumes/...`.
     - (c) `Stack.isAdoptedInPlace` is read nowhere in `server/src`, so every stack lives under `getStackPath(id)` and there is no adopted-in-place code path to special-case.
     - (d) `Service.volumes` stores raw compose short-syntax strings: unresolved relative paths and named volumes (`compose-parser.ts` `parseVolumes`). A fallback would have to resolve paths written by the compose author, which are untrusted, before passing them to `du`. That adds path-traversal surface for an edge case outside D-13.
   - Reversibility: reversible. A later fallback is a scanner/job-only change with no schema impact.
4. **Where the "HTTP probe" indicator in the Services table comes from** without a DB probe column. Recommendation: derive "source" from the latest `ServiceHealthEvent.source` returned by the health-events endpoint; show a neutral badge only when HTTP_PROBE events exist. — **RESOLVED** (14-01 + 14-03 + 14-06)
   - **Resolution:** the indicator is derived from `ServiceHealthEvent.source`. 14-01 creates the D-12 `source` column, and 14-06 writes `http-probe` entries. 14-03 Task 2 renders the neutral `HTTP probe` ToneBadge in the Services table Status cell. It appears only when the service's history returned by `GET /api/stacks/:id/health-events` contains at least one `http-probe` entry. No DB probe column is added (D-01).
5. **Issue #23 text mentions "expected status code"; D-02 deliberately drops it.** Follow D-02; note the deviation in the plan so the issue can be updated. — **RESOLVED** (locked decision D-02)
   - **Resolution:** D-02 applies: any 200-399 response is healthy, and there is no expected-code field. 14-06 implements `isProbeSuccess` (200-399). The deviation from the issue text is recorded in 14-08's **Implements** note and in 14-06's `<output>` so #23 can be updated.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | server/client | yes | 24.14.0 locally; image uses `node:22-slim` | - |
| Yarn | workspaces | yes | 4.13.0 | - |
| Docker CLI | testcontainers integration tests, manual probe checks | yes | 29.8.0 (context `desktop-linux`) | skip integration tests |
| GNU `du` | disk job | yes locally (8.32); present in Debian-based runtime image | - | Windows-native dev: job logs and skips |
| PostgreSQL | integration tests | via `@testcontainers/postgresql` (needs Docker) | postgres:17 in tests | - |
| `psql` | - | no | - | not needed |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `du` on native Windows (dev only) - job must degrade gracefully; probe reachability on Docker Desktop when Docktor runs on the host (Finding 1).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 (server unit + integration projects, client jsdom) + Playwright ^1.58.2 (client e2e) |
| Config file | `server/vitest.config.ts` (projects `unit`, `test/integration`), `client/vitest.config.ts`, `client/playwright.config.ts` |
| Quick run command | `yarn workspace @docktor/server vitest run --project unit <file>` / `yarn workspace @docktor/client vitest run <file>` |
| Full suite command | `yarn test` (all workspaces); `yarn workspace @docktor/server test:integration`; `PLAYWRIGHT_PORT=5182 yarn workspace @docktor/client test:integration` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| #23 | `x-docktor.health-probe` parsing + Zod schema (valid, invalid host/scheme/userinfo) | unit | `yarn workspace @docktor/server vitest run --project unit test/unit/lib/compose-health-probe.test.ts` | Wave 0 |
| #23 | `evaluateProbe`: 3 failures, grace, success reset, 2xx/3xx boundary (199/200/399/400) | unit | `... test/unit/domain/health-probe.test.ts` | Wave 0 |
| #23 | Probe transport: Host header preserved, redirect not followed, timeout, refused (real local `http` server + fake docker) | unit | `... test/unit/infrastructure/probe-transport.test.ts` | Wave 0 |
| #23 | HealthProbeJob: stagger, in-flight guard, skips non-running/transitional, clears status on removal | unit | `... test/unit/jobs/health-probe-job.test.ts` | Wave 0 |
| #23 | Probe override: reconcile/handleEvent keep probe status for probed services, write Docker health otherwise; reconcile no longer writes `null` | unit | `... test/unit/jobs/state-poller.test.ts` (update pinned expectation at line ~196) | exists, must change |
| #23 | NotificationWatcher unaffected: probe-driven UNHEALTHY emits `stack.container_state_changed` and still notifies after 120s | unit | `... test/unit/jobs/notification-watcher.test.ts` + new end-to-end bus test (precedent in state-poller.test.ts) | partial |
| #23 | ServiceHealthEvent written for both sources; keyed by (stackId, serviceName), survives `replaceServices` | integration | `yarn workspace @docktor/server test:integration` (new `health.test.ts`) | Wave 0 |
| #23 | Config-tab probe form edits YAML via diff-confirm; comments preserved | client unit | `yarn workspace @docktor/client vitest run test/unit/routes/stacks/health-probe-form.test.tsx` | Wave 0 |
| #24 | `computeUptime` incl. neutral exclusion, null when no data, window clamp, anchor | unit | `... test/unit/domain/uptime.test.ts` | Wave 0 |
| #24 | IncidentTracker: open/close/escalation idempotent, concurrent container events yield one open row | unit | `... test/unit/application/incident-tracker.test.ts` | Wave 0 |
| #24 | Retention setting 1-365 default 30; prune job keeps anchor | unit + integration | `... test/unit/jobs/health-history-pruner.test.ts` | Wave 0 |
| #24 | Uptime/incident endpoints; `/api/uptime/stacks` batch; stack named `uptime` still resolves | integration | integration `health.test.ts` | Wave 0 |
| #24 | Uptime card, incident list, dashboard column render (null, 100%, incident duration) | client unit | `yarn workspace @docktor/client vitest run test/unit/routes/stacks/uptime-card.test.tsx` | Wave 0 |
| #27 | du scanner: parses KiB, tolerates exit 1 with stdout, skips symlinks, per-path invocation | unit | `... test/unit/infrastructure/disk-usage-scanner.test.ts` | Wave 0 |
| #27 | DiskUsageJob: `runImmediatelyOnStart=false`, non-blocking kickoff, total = volumes + backups | unit | `... test/unit/jobs/disk-usage-job.test.ts` | Wave 0 |
| #27 | `GET /api/stacks` still serializes with non-null `volumeSizeBytes` (BigInt regression) | integration | integration `stacks.test.ts` addition | exists, extend |
| #27 | Storage page: sort by size, expand volumes, backups section, grand total | client unit + e2e | `yarn workspace @docktor/client vitest run test/unit/routes/storage-page.test.tsx`; `test/integration/storage.spec.ts` | Wave 0 |
| all | Layering rules still hold (no Prisma in application, routes call services only) | unit | `... test/unit/architecture/layering.test.ts` | exists |

### Sampling Rate
- **Per task commit:** the single new/changed test file plus `tsc --build` (CLAUDE.md: zero type errors before commit)
- **Per wave merge:** `yarn workspace @docktor/server test:unit` and `yarn workspace @docktor/client test:unit`
- **Phase gate:** `yarn test` green, server integration green, Playwright green on both projects (`PLAYWRIGHT_PORT` per CLAUDE.md), before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] New unit files listed above (domain, infrastructure, jobs, application, client)
- [ ] Central default stubs for new endpoints in `client/test/integration/fixtures.ts` (Pitfall 7)
- [ ] Update pinned `healthStatus: null` expectation in `server/test/unit/jobs/state-poller.test.ts` once reconcile inspects health
- [ ] Prisma migration generated via `prisma migrate dev` (new models/enum); never hand-edited
- [ ] `yarn workspace @docktor/shared build` runs automatically via the workspace `test` scripts; the `shared-schema-parity` test fails if shared dist is stale

## Security Domain

`security_enforcement` is not set in `.planning/config.json` (absent = enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no new auth surface) | existing better-auth |
| V3 Session Management | no | existing |
| V4 Access Control | yes | every new route file adds `app.addHook("onRequest", requireAuth)` (pattern in `routes/stacks.ts`, `routes/settings.ts`); stack-scoped reads resolve the stack first (404 on unknown id) |
| V5 Input Validation | yes | Zod in `@docktor/shared` for probe block (host allow-list, scheme, port, no userinfo, timeout bounds), settings (`retentionDays` int 1-365), route params via `stackParamsSchema` |
| V6 Cryptography | no | - |
| V12 Files/Resources | yes | `du` via `execFile` argv (no shell), paths from `getStackPath()` (escape-checked), skip symlinks |
| V14 Configuration | yes | no new env vars; do not log response bodies |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSRF via compose-authored probe URL (Docktor has Docker socket + host mount) | Spoofing / Info disclosure | Host allow-list (`localhost`/`127.0.0.1`/`[::1]`) resolved only to the inspected container's own IP; never DNS-resolve other hosts; discard response body (A4) |
| Command injection in disk job | Tampering | `execFile("du", ["-sk", "--", path])`; volume names come from `readdir`, never from user input at request time |
| Symlink traversal exposing host sizes | Info disclosure | `lstat`/`withFileTypes`, only real directories under the stack path |
| Probe flood / thundering herd | DoS | 30s per service, jittered start, concurrency cap, per-probe timeout <= 30s, in-flight guard |
| Lingering network attachment of Docktor to a stack network | Elevation / availability | `finally` detach + startup sweep (Finding 1) |
| Settings tampering (retention) | Tampering | Zod bounds 1-365; behind `requireAuth` |

## Project Constraints (from CLAUDE.md)

Actionable directives the planner must verify against (repo `CLAUDE.md`; the user-level `~/CLAUDE.md` RuFlo rules are generic and do not override these):
- Layering: routes call application services only; repositories are the only Prisma touchpoint (new `service-health-event`, `stack-incident`, `stack-disk-usage` repositories, singletons exported from `repositories/index.ts`); domain stays pure; DI via constructor params; services never import route/HTTP types. The architecture test `test/unit/architecture/layering.test.ts` enforces much of this.
- Jobs: new jobs extend `IntervalJob`, lazily import production repositories (db.ts out of unit-test graph), registered in `jobs/index.ts`.
- Typed errors only (`NotFoundError`, etc.); HTTP status codes only in `lib/errors.ts` and `app.ts`.
- All request validation via Zod schemas in `@docktor/shared` (`shared/src/validation/`, re-exported through `index.ts`); never duplicate schemas in server/client.
- Prisma: new models in their own `.prisma` file under `server/prisma/schema/`; migrations via `prisma migrate dev`, never edited by hand; transactions for multi-table writes; no raw SQL unless Prisma cannot express it.
- Strict TypeScript, no `any`/unchecked casts, explicit return types on exported functions, `<Name>Props` + `Readonly<Props>` for components, `tsc --build` before commit.
- TDD: tests alongside implementation; server integration tests hit a real DB; client hook tests mock `fetch`/API clients.
- Client: pages are orchestrators (~80 lines), one component per section (co-locate under `routes/app/<page>/components/`), hooks own server state, no direct fetch in components, `apiFetch<T>()` only, forms via react-hook-form + Zod resolver, `ToneBadge`/`StatusDot` for pills, flat `Section` primitives (Card only for distinct groupings), dark-mode counterparts for every light color utility, never edit `components/ui/`, Playwright runs use `PLAYWRIGHT_PORT`.
- No barrel `index.ts` for a single module; import conventions (`@/` in client, relative `.js` in server).
- Commit format `type(scope): description`, one logical change per commit; implementation plans reference GitHub issues #23/#24/#27 at the top and PRs close them.
- `.planning/` is how, GitHub issues are what/why: do not capture new work in `.planning/todos/`.

## Suggested Plan Slicing (non-binding; STATE.md says 3 plans)

1. **14-01 (#23)**: shared schema + parser, domain rules, probe transport/port, `HealthProbeJob`, `ServiceHealthService` + subscribers, `ServiceHealthEvent` model + repo, reconcile fix, Config-tab probe form, per-service timeline, fixtures stubs. (TDD wave: domain -> transport -> job -> service -> UI.)
2. **14-02 (#24)**: retention setting + card, `computeUptime`, `StackIncident` repo + `IncidentTracker`, prune job, uptime/incident endpoints, dashboard column + Overview uptime card/incident list. Depends on 14-01's reconcile fix and events.
3. **14-03 (#27)**: BigInt DTO fix first, `StackDiskUsage` model + repo, `du` scanner + non-blocking job, `/api/storage`, Storage page + nav item + stack-detail disk figure.

14-03 is independent of 14-01/14-02 and can run in parallel with them.

## Sources

### Primary (HIGH confidence)
- In-repo source read this session: `server/src/jobs/{job,job-registry,state-poller,disk-checker,notification-watcher,index,image-update-check-pruner}.ts`, `server/src/domain/{events,stack-state-derivation}.ts`, `server/src/application/{index,container-state-catch-up,stack-service,backup-service,settings-service}.ts`, `server/src/application/subscribers/*`, `server/src/repositories/{stack-repository,settings-repository,index}.ts`, `server/src/infrastructure/{event-bus,docker-executor,dockerode-client,socket-inspector,stack-filesystem}.ts`, `server/src/lib/{keyed-mutex,compose-parser,compose-proxy-editor,stacks-dir}.ts`, `server/src/app.ts`, `server/src/routes/{stacks,settings}.ts`, `server/prisma/schema/*.prisma`, `Dockerfile`, `docker-compose.yml`, client router/sidebar/dashboard/stack page/overview/services/config tab/hooks, `client/test/integration/fixtures.ts`, server test layout.
- Local experiments (Node 24.14): `fetch` ignores `Host` override; `fetch` `redirect:"manual"` returns 302; `http.request` + `lookup` preserves `Host`; `JSON.stringify` of BigInt throws; `node-cron.validate('*/5 * * * * *')` is true.
- [Docker bridge network driver docs](https://docs.docker.com/engine/network/drivers/bridge/) - different bridge networks communicate only via published ports; `docker network connect` for multi-network containers.
- [Compose extension docs](https://docs.docker.com/reference/compose-file/extension/) - `x-` fields allowed within structures where user keys are not expected; ignored by Compose.
- [PostgreSQL unique constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) - NULLs distinct by default.

### Secondary (MEDIUM confidence)
- Web search corroborating Docker isolation rules and "network has active endpoints" behaviour with attached containers (forums.docker.com, Baeldung).

### Tertiary (LOW confidence)
- Compose hash inclusion of extension fields, Docker `health_status` event periodicity, and `compose down` exit code under foreign attachment: not verified (A2, A3, A5).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new packages; versions read from installed `node_modules`.
- Architecture: MEDIUM-HIGH - seams verified by reading code; the reachability mechanism (A1) is a recommendation needing user sign-off.
- Pitfalls: HIGH for in-repo defects (reconcile null, BigInt, replaceServices, startAll blocking, Playwright guard, NULL-distinct unique), MEDIUM for Docker behaviours.

**Research date:** 2026-10-07
**Valid until:** 2026-11-06 (stable internal architecture; re-verify Docker network behaviour claims if Docker/Compose versions change)
