# Phase 14: Health, Uptime and Disk Visibility - Context

**Gathered:** 2026-10-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can see whether a stack is actually healthy over time and how much disk
it's consuming, without reading raw logs or guessing. Three GitHub issues:

- **#23** — Optional per-service HTTP health probes (new status source for
  services with no Docker healthcheck) that feed the existing status model,
  plus retained per-stack and per-service health-transition history. Existing
  ERROR/UNHEALTHY notification behavior must be unaffected.
- **#24** — Per-stack uptime percentage over a configurable retention window,
  and an incident list (per unhealthy period with start/end/duration).
  Depends on #23's history work (same phase).
- **#27** — A sortable disk-usage view per stack and per volume with a total,
  going beyond the existing host-level low-disk warning.

Phases 10 (backend architecture: event bus, Job abstraction) and 11 (UI
patterns) are both merged; this phase's new server code lands on those.

</domain>

<decisions>
## Implementation Decisions

### HTTP health probes — config & scope (#23)
- **D-01:** Probe config lives in the compose file as a per-service
  `x-docktor: health-probe:` block (YAML remains the single source of truth).
  A small form on the stack's Config tab edits that same YAML — the save goes
  through the existing diff-confirm dialog (Phase 12 D-01/D-02/D-03), exactly
  like compose/.env edits. No DB-stored probe config. — **Reversibility:**
  reversible — removing the block or the form surface restores the previous
  behavior; no data-model change beyond reading the compose file.
- **D-02:** Expected status is **any 2xx/3xx (200–399)** — no explicit
  expected-code field. A response in 2xx/3xx is healthy; 4xx/5xx, timeout, or
  connection failure is unhealthy.
- **D-03:** Probes are **per-service only**; there is no stack-level probe
  concept. Stack health emerges automatically via the existing
  `deriveStackStatus()` aggregation over `Service.healthStatus` — unchanged
  logic, reused as-is.
- **D-04 (brownfield/adopted-in-place stacks):** no separate carve-out needed —
  probe config is compose-file-based, so adopted stacks opt in the same way.

### HTTP health probes — execution & status integration (#23)
- **D-05:** The probe runs as Node `fetch` from Docktor's own container to the
  **target container's IP on its compose network**: the probe URL's `localhost`
  (or `127.0.0.1`) host is resolved to the inspected container's network IP
  before fetching. No curl/wget dependency is assumed inside target images, and
  internal compose networks work without published ports. Requires Docker's
  inter-bridge routing (on by default for user-defined networks; a
  `internal: true` network can't be reached — that case is the user's own
  constraint, and counts as a failed probe per D-07's fail-closed rule).
- **D-06:** Cadence: **30s per service**, one `IntervalJob`, staggered per
  service to avoid a thundering herd (mirrors Docker healthcheck's default
  interval).
- **D-07:** When a service has both an `x-docktor` probe AND a Docker
  healthcheck, the **probe overrides** — it becomes the service's sole health
  signal for `Service.healthStatus`. Services without a probe keep
  Docker-healthcheck-derived status exactly as today. (No OR/AND combination
  logic.)
- **D-08:** A service is marked unhealthy only after **3 consecutive probe
  failures**, plus a **60s startup grace period** after a container
  (re)start (slow-booting apps aren't instantly flagged). Probe-execution
  errors (inspect/routing failures) count as a failed probe — **fail-closed**.
  Mirrors Docker's `start_period` + 3-failed-checks semantics.

### Uptime & incidents (#24)
- **D-09:** Downtime = time spent in **UNHEALTHY or ERROR**. STOPPED, DRAFT,
  and transitional states are neither up nor down and are excluded from both
  the numerator and denominator of the uptime percentage (partially-stopped
  maintenance doesn't tank the number). Consistent with `NotificationWatcher`,
  which already treats ERROR + UNHEALTHY as the two alert-worthy degradations.
- **D-10:** Retention window: **30-day global default**, configurable in
  Settings (1–365 days), **no per-stack override**. The uptime % and incident
  list are computed over this window; older rows are pruned by a scheduled job.
- **D-11:** Incidents use the **existing, scaffolded-but-unused `StackIncident`
  model** (`triggerType`, `createdAt` = start, `resolvedAt` = end; duration =
  resolvedAt − createdAt). One row per unhealthy/error episode per stack.
  Stack-level status transitions continue to use the existing `StatusLog`
  (already surfaced on the activity timeline) — no rework of that model.
- **D-12:** Per-service health history is **retained in a new per-service
  health-event table** (serviceId, fromStatus, toStatus, source:
  `docker-healthcheck` | `http-probe`, createdAt). Surfaced as a compact
  per-service health timeline in the stack detail's Services section. This
  satisfies #23's "visible per stack and per service".

### Disk usage (#27)
- **D-13:** Measurement: a scheduled job runs `du` on each stack directory and
  each volume subdirectory (`DOCKTOR_STACKS_DIR/<stack>/volumes/*`), writing
  the existing `Stack.volumeSizeBytes`/`volumeSizeAt` fields plus new
  per-volume rows. This matches the bind-mounts-only constraint (all app data
  lives under `./volumes/`) and the project's shell-out-to-CLI pattern.
  Cadence: **daily**, matching the existing `DiskChecker`.
- **D-14 — backups are included in the disk view:** the Storage view also
  shows the **backup repository** (`DOCKTOR_BACKUP_DIR`, the restic repo) as
  its own distinct section/row, sized via `du`, and it counts toward the grand
  total — so the user sees the whole disk picture (per-stack app data +
  per-volume breakdown + backups), not just stacks.

### Views (#24, #27)
- **D-15:** One new top-level **Storage** page: a sortable table of stacks
  (Size column) with expandable per-volume rows, a **Backups** section (D-14),
  and a grand total at the top. Plus a compact per-stack disk figure on the
  stack detail page.
- **D-16:** Uptime lives where stacks already are — no separate "Health" nav
  page this phase: a per-stack uptime % column on the dashboard's stack rows,
  and on each stack detail's Overview tab an **Uptime card** (percentage +
  window) and an **incident list** (start | end | duration), fed by the
  StackIncident rows.

### Claude's Discretion
- Exact UI shape of the per-service health timeline markers (D-12), the
  Storage page's layout details in the du job, and the prune-job mechanics
  beyond what D-10 specifies.
- Exact storage of per-volume rows (new Prisma model vs JSON column) and the
  probe history table's exact fields — planner decides the cleanest fit to the
  existing `repositories/` + Prisma patterns.

### Folded Todos
None — the phase-scope-matched todos were reviewed, not folded (see Deferred).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §Phase 14: Health, Uptime and Disk Visibility — phase
  goal, success criteria, dependencies (Phase 10, Phase 11; #24 internally
  depends on #23).
- GitHub issue [#23](https://github.com/docktor-app/docktor/issues/23) —
  "Optional HTTP health probes and status history" — acceptance criteria and
  notes (full text used in this discussion).
- GitHub issue [#24](https://github.com/docktor-app/docktor/issues/24) —
  "Per-stack uptime view" — acceptance criteria and notes.
- GitHub issue [#27](https://github.com/docktor-app/docktor/issues/27) —
  "Disk usage view per stack and volume" — acceptance criteria and notes.

### Architecture / project constraints
- `CLAUDE.md` — layered DDD rules (new job → `server/src/jobs/` Job
  abstraction; new data access → a repository; Probe job wiring goes through
  the Phase 10 domain-event bus as a producer emitting domain events with
  subscribers for status/history/notification; never raw Prisma from routes or
  jobs).
- `.planning/PROJECT.md` §Constraints — "YAML-first: compose file on disk is
  source of truth" (backing D-01), single Fastify process, bind-mounts-only,
  Stack ID = primary key.

### Existing code — must-read integration anchors
- `server/src/jobs/state-poller.ts` — `deriveStackStatus()` (D-03 reuse) and
  how `Service.healthStatus` is currently written; reconcile + event patterns
  a `HealthProbeJob` should mirror.
- `server/src/jobs/disk-checker.ts` — existing host-level daily disk job
  (D-13 cadence precedent; shell-out + domain-event emit pattern).
- `server/src/jobs/job.ts` — `IntervalJob` / `WatcherJob` / `JobHealthReporter`
  abstraction a new probe/disk/uptime job must extend.
- `server/src/domain/events.ts` — domain-event catalog; new events
  (e.g. `health.probe_result`, `stack.incident_opened/closed`) get added here
  with producers/subscribers wired per Phase 10's pattern.
- `server/prisma/schema/stack.prisma` + `status-log.prisma` +
  `notification.prisma` — `Stack.volumeSizeBytes`/`volumeSizeAt` (unused,
  seeding D-13), `StatusLog` (stack transitions, unchanged), and the empty
  `StackIncident` scaffold (triggerType/resolvedAt — the D-11 target).
- `shared/src/validation/stacks.ts` — where any new Zod schema for probe config
  inputs/params belongs (per CLAUDE.md, all request validation lives in
  `@docktor/shared`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `deriveStackStatus()` (`server/src/jobs/state-poller.ts`) — pure function the
  probe pipeline feeds; reused unchanged for the "stack derives" decision.
- `StackIncident` model (already in `notification.prisma`, unused) — the
  incident table is scaffolding done, needs the writer (probe/status-change
  subscriber) + reader (uptime/incident query).
- `Stack.volumeSizeBytes` / `Stack.volumeSizeAt` fields — already on the model,
  currently unwritten; D-13 fills them.
- Phase 10 event-bus + subscribers (`server/src/application/subscribers/`
  `register.ts`, `notification-subscriber.ts`, `stack-event-subscriber.ts`,
  `state-broadcast-subscriber.ts`) — the pattern for routing probe results into
  status/history/incident side effects.
- Job abstraction (`server/src/jobs/job.ts`) + `jobs/index.ts` registry — where
  the new HealthProbeJob / DiskUsageJob / incidents-prune job are registered.

### Established Patterns
- Shell-out-to-CLI (`docker compose`, `restic`, `ss`/`lsof`) — precedent for
  D-13's `du` usage.
- Domain-event bus emit/tune (Phase 10 D-15/D-16/D-17): services/jobs emit
  domain events; subscribers (notifications, audit trail, broadcaster) consume.
  New probe/incident side effects follow the same pattern; no direct hooking
  into `NotificationWatcher`'s in-memory logic.
- Page composition (Phase 11): orchestrator-route ≤80 lines, one section
  component per visual region — governs the new Storage page and the stack
  detail Uptime card/incident list components.
- ToneBadge/StatusDot for all status pills; react-hook-form + Zod for the
  probe-config form on the Config tab.

### Integration Points
- `server/src/jobs/` — `HealthProbeJob` (new `IntervalJob`, 30s, staggered),
  granular disk-scan job (daily), history/incident prune job.
- `server/src/domain/events.ts` + `server/src/infrastructure/event-bus.ts` —
  new domain events for probe results and incident open/close.
- `server/src/application/` — subscriber(s) writing `Service.healthStatus`,
  the per-service health-event log, `StackIncident` rows, and a
  probe-result→status reconciliation path that preserves `NotificationWatcher`
  behavior (ERROR/UNHEALTHY must keep firing exactly as today).
- `shared/src/validation/stacks.ts` — Zod schema for the `x-docktor:
  health-probe` block shape (parsed server-side; form inputs validated).
- `client/src/` — new `routes/app/storage.tsx` (Storage page) and sections;
  dashboard uptime column; stack detail Overview Uptime card + incident list;
  Config-tab probe form editing the compose `x-docktor` block.

</code_context>

<specifics>
## Specific Ideas

- The existing `StackIncident` model's shape (triggerType + resolvedAt) was
  created as scaffolded groundwork and lines up exactly with the incident-list
  requirement — reuse it rather than inventing a parallel model.
- The phase's two "forgotten" surfaces the user explicitly wanted covered:
  backups counted in the disk view (D-14), and downtime semantics that don't
  punish a user for intentionally stopping a stack (D-09).

</specifics>

<deferred>
## Deferred Ideas

- **CPU / memory live resource stats** (from the `add-live-resource-stats`
  todo) — only the *disk* part of that vision is in scope (#27). CPU/memory
  have no roadmap phase; the todo stays pending for a future observability
  phase.
- **`container-status-unknown-after-deploy`** todo — an observability bug
  (status shows "unknown" up to 60s after deploy/redeploy). Adjacent to this
  phase's status/history work but not required by #23/#24/#27; belongs with the
  other status/update-checker fixes rather than here.

### Reviewed Todos (not folded)
- `.planning/todos/pending/2026-09-11-add-live-resource-stats-to-stacks-cpu-memory-disk.md` —
  reviewed via the todo matcher; disk part folded into #27 scope, CPU/memory
  deferred (see Deferred).
- `.planning/todos/pending/2026-08-28-container-status-unknown-after-deploy.md` —
  reviewed; an observability bug outside this phase's requirements, deferred.

</deferred>

---
*Phase: 14-health-uptime-and-disk-visibility*
*Context gathered: 2026-10-06*
