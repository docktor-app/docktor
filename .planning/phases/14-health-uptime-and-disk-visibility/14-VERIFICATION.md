---
phase: 14-health-uptime-and-disk-visibility
verified: 2026-10-08T21:15:00Z
status: gaps_found
score: 9/13 must-haves verified
covered_files:
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-01-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-01-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-02-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-02-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-03-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-03-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-04-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-04-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-05-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-05-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-06-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-06-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-07-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-07-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-08-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-08-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-09-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-09-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-10-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-10-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-11-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-11-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-12-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-12-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-13-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-13-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-14-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-14-SUMMARY.md"
  - "client/src/components/app-sidebar.tsx"
  - "client/src/components/common/empty-state.tsx"
  - "client/src/components/domain/stack/service-status-badge.tsx"
  - "client/src/components/domain/stack/stack-list.tsx"
  - "client/src/components/domain/stack/uptime-badge.tsx"
  - "client/src/hooks/use-now.ts"
  - "client/src/hooks/use-service-health-events.ts"
  - "client/src/hooks/use-stack-uptime.ts"
  - "client/src/hooks/use-stack-uptimes.ts"
  - "client/src/hooks/use-storage.ts"
  - "client/src/lib/compose-health-probe.ts"
  - "client/src/lib/format-bytes.ts"
  - "client/src/lib/format-incident-duration.ts"
  - "client/src/lib/health-api.ts"
  - "client/src/lib/health-format.ts"
  - "client/src/lib/settings-api.ts"
  - "client/src/lib/stacks-api.ts"
  - "client/src/lib/storage-api.ts"
  - "client/src/lib/storage-view.ts"
  - "client/src/lib/uptime-api.ts"
  - "client/src/lib/uptime-format.ts"
  - "client/src/router.tsx"
  - "client/src/routes/app/dashboard.tsx"
  - "client/src/routes/app/settings.tsx"
  - "client/src/routes/app/settings/components/health-retention-card.tsx"
  - "client/src/routes/app/stacks/components/config-tab.tsx"
  - "client/src/routes/app/stacks/components/health-probe-form.tsx"
  - "client/src/routes/app/stacks/components/incident-list.tsx"
  - "client/src/routes/app/stacks/components/overview-tab.tsx"
  - "client/src/routes/app/stacks/components/service-health-timeline.tsx"
  - "client/src/routes/app/stacks/components/services-section.tsx"
  - "client/src/routes/app/stacks/components/uptime-card.tsx"
  - "client/src/routes/app/stacks/index.tsx"
  - "client/src/routes/app/storage.tsx"
  - "client/src/routes/app/storage/components/storage-backups-section.tsx"
  - "client/src/routes/app/storage/components/storage-stacks-table.tsx"
  - "client/src/routes/app/storage/components/storage-status-alerts.tsx"
  - "client/src/routes/app/storage/components/storage-totals.tsx"
  - "server/prisma/schema/service-health-event.prisma"
  - "server/prisma/schema/stack-volume-usage.prisma"
  - "server/prisma/schema/stack.prisma"
  - "server/prisma/schema/status-log.prisma"
  - "server/src/app.ts"
  - "server/src/application/container-state-catch-up.ts"
  - "server/src/application/incident-tracker.ts"
  - "server/src/application/index.ts"
  - "server/src/application/ports/disk-usage-scanner-port.ts"
  - "server/src/application/ports/dockerode-client-port.ts"
  - "server/src/application/ports/probe-ownership-port.ts"
  - "server/src/application/ports/probe-transport-port.ts"
  - "server/src/application/probed-service-registry.ts"
  - "server/src/application/service-health-history-service.ts"
  - "server/src/application/service-health-service.ts"
  - "server/src/application/settings-service.ts"
  - "server/src/application/stack-service.ts"
  - "server/src/application/storage-service.ts"
  - "server/src/application/subscribers/incident-subscriber.ts"
  - "server/src/application/subscribers/probe-result-subscriber.ts"
  - "server/src/application/subscribers/register.ts"
  - "server/src/application/subscribers/service-health-history-subscriber.ts"
  - "server/src/application/uptime-service.ts"
  - "server/src/domain/disk-usage.ts"
  - "server/src/domain/events.ts"
  - "server/src/domain/health-probe.ts"
  - "server/src/domain/incident-tracking.ts"
  - "server/src/domain/service-health.ts"
  - "server/src/domain/uptime.ts"
  - "server/src/infrastructure/disk-usage-scanner.ts"
  - "server/src/infrastructure/dockerode-client.ts"
  - "server/src/infrastructure/probe-transport.ts"
  - "server/src/jobs/disk-usage-job.ts"
  - "server/src/jobs/health-history-pruner.ts"
  - "server/src/jobs/health-probe-job.ts"
  - "server/src/jobs/index.ts"
  - "server/src/jobs/state-poller.ts"
  - "server/src/lib/compose-health-probe.ts"
  - "server/src/lib/stacks-dir.ts"
  - "server/src/repositories/index.ts"
  - "server/src/repositories/service-health-event-repository.ts"
  - "server/src/repositories/stack-disk-usage-repository.ts"
  - "server/src/repositories/stack-incident-repository.ts"
  - "server/src/repositories/status-log-repository.ts"
  - "server/src/routes/health.ts"
  - "server/src/routes/settings.ts"
  - "server/src/routes/storage.ts"
  - "shared/src/validation/health.ts"
  - "shared/src/validation/index.ts"
covered_digest: "v3:sha256:df9e6616dec6ef8b106b58924b18b5c5f3d660802f3dcf8aedbd2626c9b08706"
behavior_unverified: 1
overrides_applied: 0
gaps:
  - truth: "D-02 / D-06 / D-08 (14-06, 14-09, 14-13): every probed service is probed on the 30-second cadence and any failure to get a response, including no response within the timeout, is recorded as a failed probe (fail-closed), so a stack's health is never silently left stale"
    status: failed
    reason: "CR-01 (open, critical, confirmed in code). The Docker API calls on the probe path (inspectContainer for the target and for Docktor itself, connectNetwork, disconnectNetwork) go straight to dockerode with no timeout; only the HTTP request itself is bounded. One hung daemon call leaves HealthProbeJob.run() awaiting forever, inFlight stays true, and every later 5s tick returns immediately with nothing logged and no error recorded. Because a probe-owned service's health is owned by the probe (D-07), StatePoller does not correct it either, so a service shown healthy can be down with no signal. A hung call in start() (sweepStaleAttachments or refreshOwnership) also blocks JobRegistry.startAll() and therefore later jobs and listen(). A hung disconnect blocks every later probe on that network through NetworkAttachments.detaching."
    artifacts:
      - path: "server/src/infrastructure/probe-transport.ts"
        issue: "inspectContainer (lines ~337, 352, 387), connectNetwork, disconnectNetwork are awaited with no deadline; only requestOnce has a timer"
      - path: "server/src/infrastructure/dockerode-client.ts"
        issue: "inspectContainer/connectNetwork/disconnectNetwork have no request timeout (grep for timeout in the file returns nothing)"
      - path: "server/src/jobs/health-probe-job.ts"
        issue: "run() sets inFlight and awaits Promise.all over the workers with no overall deadline; start() awaits sweepStaleAttachments and refreshOwnership unbounded"
    missing:
      - "A timeout wrapper (for example Promise.race with a 10s deadline) around every Docker call on the probe path, treated as a failed probe (network-unreachable) when it fires"
      - "An overall per-probe deadline in runDue, and a bounded start() pre-step"
      - "A reset of inFlight after a maximum tick duration as a last line of defence, plus a test that a never-settling Docker call does not stop later ticks"
  - truth: "D-08 (14-06): a new container (changed container id or start time) resets the service to `starting`, and a probe-driven health value always belongs to the container that is currently running"
    status: partial
    reason: "WR-01 and WR-05 (open, confirmed in code). ServiceHealthService.applyProbeResult guards on containerState === running but never compares row.containerId with event.containerId, so a result for a replaced container is written (including the old containerId) over the new container's Service row and records an http-probe history row for a container that no longer exists. Separately, after a redeploy StatePoller and ContainerStateCatchUp deliberately keep the stored (old container's) health for probe-owned services, so an old unhealthy value can keep the stack UNHEALTHY and keep or open an incident and notification, and an old healthy value masks a broken new container, until the first probe of the new container (up to about 30s plus the 60s grace). The isNewContainer reset only runs when a probe result arrives."
    artifacts:
      - path: "server/src/application/service-health-service.ts"
        issue: "applyProbeResult (lines ~113-138) has no row.containerId === event.containerId check; applyHealth writes event.containerId"
      - path: "server/src/application/container-state-catch-up.ts"
        issue: "observe() carries normalizeHealth(storedHealth) forward for probe-owned services even when the container id changed (lines ~151-160)"
      - path: "server/src/jobs/state-poller.ts"
        issue: "handleEvent and observeContainer keep stored health for probe-owned services when the container id changed"
    missing:
      - "Drop probe results whose containerId does not match the Service row's current containerId"
      - "Write `starting` immediately (or emit service.probe_cleared) for a probe-owned service whose container id or start time changed"
deferred: []
behavior_unverified_items:
  - truth: "Amended D-05 (14-09): Docktor connects its own container to the target's network for the duration of one probe and disconnects afterwards (refcounted, crash-safe sweep), and Delete Stack still completes while an attachment is active"
    test: "On a dedicated Docker host with a collision-proof compose project name, run Docktor in a container, add a probe to a service on a network Docktor does not share, and watch docker network inspect during and after a probe. Then restart Docktor mid-attachment and delete the stack while probes are active."
    expected: "Docktor appears on the network only for the request and is gone afterwards; the startup sweep removes a leftover endpoint with alias docktor-health-probe; the delete flow completes"
    why_human: "Unit tests drive a fake Docker client. The real Docker network attach/detach, the 403 already-connected case and compose down while attached cannot be proven without a live daemon. Logged as unrun-verify #30 in .planning/WINDOWS.md."
human_verification:
  - test: "Health history panel (14-03): expand a service History in light and dark theme at Pixel 7 width, with a 200-character probe failure message"
    expected: "Message wraps with break-words inside the h-48 ScrollArea, no horizontal overflow, legible stacking"
    why_human: "Backstop truth (long-text). Only overflow was measured by script. WINDOWS.md #23."
  - test: "HTTP Health Probes section (14-08): Config tab in light and dark at desktop and Pixel 7 width, long URL, invalid YAML swap, then Save through the diff-confirm dialog"
    expected: "Long URL scrolls inside the input, YAML error replaces the form, saved compose contains the x-docktor.health-probe block"
    why_human: "Backstop truth (long-text); reviewed from scripted Edge screenshots by the executor only. WINDOWS.md #24 and #25 (canonical Playwright command not run)."
  - test: "Storage page (14-05): light and dark, desktop and Pixel 7, with 80+ character stack and volume names"
    expected: "Names truncate with a title attribute, no horizontal scrolling, chevron rotation respects reduced motion, Tab order is sensible"
    why_human: "Backstop truth (overflow). WINDOWS.md #27."
  - test: "Stack Overview (14-07): light and dark, desktop and Pixel 7, with about 30 incidents including one ongoing"
    expected: "Uptime and incident tone contrast is acceptable, list scrolls vertically past 384px and horizontally on the phone, StatCards collapse to one column"
    why_human: "Backstop truth (overflow). WINDOWS.md #28."
  - test: "Settings, Health History card (14-10): light and dark, desktop and Pixel 7, lower the retention value"
    expected: "Validation appears on blur, the Shorten retention dialog shows the documented copy, Keep cancels without saving"
    why_human: "Visual check not performed by a person. WINDOWS.md #29."
  - test: "Apply the three Phase 14 migrations (add_service_health_events, add_stack_disk_usage, add_status_log_stack_created_index) to a live database and start the server"
    expected: "ServiceHealthEvent, StackVolumeUsage, the new Stack columns and the StatusLog (stackId, createdAt) index exist; syncDatabaseSchema() applies them at boot"
    why_human: "Generated with migrate diff and never applied to a live DB in the executor sandbox. WINDOWS.md #21, #22 and #26. The integration suites that use prisma db push could not run here either."
---

# Phase 14: Health, Uptime and Disk Visibility Verification Report

**Phase Goal:** Users can see whether a stack is actually healthy over time and how much disk it's consuming, without reading raw logs or guessing.
**Verified:** 2026-10-08T21:15:00Z
**Status:** gaps_found
**Re-verification:** No, initial verification

## Goal Achievement

The feature surface exists, is wired end to end, type-checks, and its unit tests pass. All 14 plans produced real code, not stubs. The status is `gaps_found` because the open critical review finding CR-01 is confirmed in the source and falsifies a must-have (probing never silently stops, D-02/D-06 fail-closed), and the open warnings WR-01 and WR-05 are confirmed and falsify the "health belongs to the current container" part of D-08. The roadmap success criteria 1 to 4 hold under normal operation.

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | SC1 (#23): a service can optionally carry an HTTP health probe that feeds the same status model as Docker-healthcheck status | VERIFIED | `server/src/lib/compose-health-probe.ts` parses `x-docktor.health-probe`; `HealthProbeJob` emits `service.probe_completed`; `ServiceHealthService.applyHealth` writes `Service.healthStatus`, re-derives with the unchanged `deriveStackStatus` and re-emits `stack.container_state_changed` in StatePoller's shape. Registered in `jobs/index.ts` (`register(healthProbeJob)`), subscriber wired in `subscribers/register.ts` and `application/index.ts`. Config form wired in `config-tab.tsx` line 81. |
| 2  | SC2 (#23): health transitions are retained and visible per stack and per service | VERIFIED (with warnings) | `ServiceHealthEvent` model and migration; `subscribeServiceHealthHistory` is the single writer; `GET /api/stacks/:id/health-events` in `routes/health.ts` registered in `app.ts`; client `useServiceHealthEvents` to `ServicesSection` to `ServiceHealthTimeline`. Warnings: WR-06 (no stale-response guard in the hook, confirmed), WR-07 (HTTP probe badge derived from any historic event, confirmed at `services-section.tsx:106`), WR-11 (404 path attributes a probe-owned clear to docker-healthcheck, confirmed at `state-poller.ts:207`). |
| 3  | SC3 (#24): each stack shows an uptime percentage and an incident list over a retention window | VERIFIED | `domain/uptime.ts` `computeUptime` (up = RUNNING/HEALTHY, down = UNHEALTHY/ERROR, neutral excluded); `UptimeService` uses the `health.retentionDays` setting (default 30, 1-365); `GET /api/stacks/:id/uptime` and `GET /api/uptime/stacks`; `IncidentTracker` + `incident-subscriber` write one `StackIncident` per episode under `withKeyedLock`; `HealthHistoryPruner` registered; client `UptimeCard`, `IncidentList`, stack-list Uptime column and Settings retention card all wired (`overview-tab.tsx`, `dashboard.tsx:16`, `stacks/index.tsx:12`, `settings.tsx:75`). |
| 4  | SC4 (#27): disk usage viewable per stack and per volume, sortable, with a total | VERIFIED (with warnings) | `DiskUsageJob` (last registration, delayed non-blocking kickoff) writes `StackVolumeUsage` and `Stack.volumeSizeBytes/backupSizeBytes`; `GET /api/storage` returns stacks, backups and totals (volumes + backups, unmeasured excluded); client route `/storage`, sidebar item, sortable table with `aria-sort` and expandable per-volume rows. Warnings WR-03, WR-04, WR-09, IN-02 below. |
| 5  | D-01: probe config lives in the compose file and is edited through the Config tab form and diff-confirm, with nothing stored in the DB | VERIFIED | `health-probe-form.tsx` (293 lines) uses `setHealthProbe/removeHealthProbe` over the yaml Document API and `healthProbeFormSchema`; no probe column in any Prisma schema. 12 client test files (152 tests) incl. the form pass. Visual check pending (human item). |
| 6  | D-07: a probe-owned service's health is owned by the probe; StatePoller (events, reconcile) and the catch-up keep its stored health and emit no docker-healthcheck transition | VERIFIED | `probeOwnership.isProbeOwned` guards in `state-poller.ts` (handleEvent, observeContainer) and `container-state-catch-up.ts`; `HealthProbeJob` calls `ownership.replaceStack` per tick and in `start()`. Exception: the 404 branch (WR-11) emits unconditionally. |
| 7  | #23 SC4 preservation: NotificationWatcher and deriveStackStatus are unchanged and probe-driven UNHEALTHY/recovery reaches the watcher through the existing event | VERIFIED | `git log` shows `notification-watcher.ts` last changed in Phase 10 and `stack-state-derivation.ts` in Phase 13; `probe-notification-preservation.test.ts` (real bus, real watcher) passes. |
| 8  | D-02 / D-06 / D-08 fail-closed cadence: a probe that gets no answer is a failed probe, and probing continues every 30s regardless of Docker daemon behaviour | FAILED | CR-01, see gaps. HTTP-level timeouts, 3-failure threshold, 60s grace, 8-probe concurrency cap and invalid-block fail-closed all exist and pass tests, but a hung Docker call stops all probing silently. No test covers a never-settling Docker call. |
| 9  | D-08: a probe-driven health value always belongs to the container currently running, and a new container starts as `starting` | FAILED (partial) | WR-01 and WR-05, see gaps. The reset exists in `ServiceHealthService.advance` but is not applied to a stale result and not applied until a result arrives. |
| 10 | Amended D-05: ephemeral, refcounted network attach with crash-safe sweep and fallback outside a container | PRESENT_BEHAVIOR_UNVERIFIED | `NetworkAttachments`, `chooseNetwork`, `sweepStaleAttachments`, alias `docktor-health-probe` present and wired (`health-probe-job.ts start()`); 30 transport tests pass against a fake Docker. No live attach/detach evidence. Also exposed to CR-01 (a hung disconnect blocks later probes on that network) and WR-02 / WR-10 / IN-01. |
| 11 | D-11 / D-10: one StackIncident per UNHEALTHY/ERROR episode; daily pruner removes old events and resolved incidents but keeps open incidents and StatusLog | VERIFIED | `decideIncidentAction`, `IncidentTracker` (keyed lock, cached open row), `StackIncidentRepository.deleteResolvedBefore` (a `lt` comparison never matches NULL), `HealthHistoryPruner` reads retention first. 23 + 7 + incident-tracker tests pass. |
| 12 | D-13 / D-14: the daily scan sizes `<stack>/volumes/*` and `<stack>/backups`, never follows symlinked entries, tolerates `du` exit 1, keeps previous values on failure, isolates per stack | VERIFIED (with warnings) | `disk-usage-scanner.ts` (`execFile` argv with `--`, `isRealDirectory` via `lstat`, `parseDuBytes`), `disk-usage-job.ts` `recordStack` try/catch per stack, summary log line. Gap in scope: the `volumes` directory itself is not lstat-checked (WR-03, confirmed: `measureVolumes` calls `listVolumeDirectories` directly). |
| 13 | Backstop truths (14-03 long-text, 14-05 overflow, 14-07 overflow, 14-08 long-text): layout holds at Pixel 7 width | UNCERTAIN (human) | Declared `verification: backstop`; overflow was measured by script only. Routed to human verification. |

**Score:** 9/13 truths verified (1 present but behavior-unverified, 1 awaiting human visual checks, 2 failed)

### Required Artifacts

All artifacts declared in the plan frontmatter exist (checked with a path loop; none missing) and are substantive (line counts 14 to 410, real logic, no placeholders). Wiring and data flow:

| Artifact | Status | Details |
| -------- | ------ | ------- |
| `server/src/jobs/health-probe-job.ts` | VERIFIED, with CR-01 | Registered in `jobs/index.ts`; real transport, compose reader and bus in `createProductionHealthProbeJob`. |
| `server/src/application/service-health-service.ts` | VERIFIED, with WR-01 | Sole probe-health writer; subscribed via `subscribeProbeResults`. |
| `server/src/infrastructure/probe-transport.ts` | VERIFIED, with CR-01, WR-02, WR-10 | Pinned lookup, no redirects, body discarded, URL re-validated. |
| `server/src/jobs/disk-usage-job.ts`, `disk-usage-scanner.ts` | VERIFIED, with WR-03, WR-04, WR-09 | |
| `server/src/application/uptime-service.ts`, `domain/uptime.ts`, `status-log-repository.ts` | VERIFIED | Anchor row at or before window start plus in-window rows. |
| `server/src/routes/health.ts`, `storage.ts`, `routes/settings.ts` | VERIFIED | All behind `requireAuth` (`onRequest` hook), registered in `app.ts`. |
| `client/src/routes/app/storage.tsx` and 4 section components | VERIFIED | 57-line orchestrator; route and sidebar entry present. |
| `client/src/routes/app/stacks/components/{uptime-card,incident-list,service-health-timeline,health-probe-form}.tsx` | VERIFIED | Composed by `overview-tab.tsx` and `config-tab.tsx`. |
| `client/src/components/domain/stack/{stack-list,uptime-badge}.tsx`, `hooks/use-stack-uptimes.ts` | VERIFIED | Uptime column renders only when `uptimes` prop is given. |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `state-poller.ts` | `domain/events.ts` | `bus.emit("service.health_changed")` | WIRED |
| `subscribers/register.ts` | history, incident and probe-result subscribers | `registerDomainSubscribers` called from `application/index.ts` | WIRED |
| `health-probe-job.ts` | `probed-service-registry.ts` | `ownership.replaceStack` / `retainStacks` | WIRED |
| `service-health-service.ts` | `stack-state-derivation.ts` | `deriveStackStatus` | WIRED |
| `jobs/index.ts` | health-probe, pruner, disk jobs | `register(...)`, disk job last | WIRED |
| `routes/health.ts`, `storage.ts` | `application/index.ts` services | `listHealthEvents`, `getStackUptime`, `listStackUptimes`, `getStorageOverview` | WIRED |
| `overview-tab.tsx` | `useServiceHealthEvents`, `useStackUptime` | hooks feeding ServicesSection, UptimeCard, IncidentList | WIRED |
| `dashboard.tsx`, `stacks/index.tsx` | `useStackUptimes` to `StackList uptimes` | | WIRED |
| `router.tsx`, `app-sidebar.tsx` | Storage page | `/storage` route and nav item | WIRED |
| `config-tab.tsx`, `settings.tsx` | `HealthProbeForm`, `HealthRetentionCard` | | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| UptimeCard / IncidentList | `uptime` | `getStackUptime` to `StatusLog` + `StackIncident` Prisma reads | Yes | FLOWING |
| ServiceHealthTimeline | `eventsByService` | `/health-events` to `ServiceHealthEvent` rows written by subscriber | Yes | FLOWING |
| Storage page | `overview` | `/api/storage` to `StackVolumeUsage` / `Stack.*SizeBytes` written by the daily job | Yes, after the first scan (60s after boot, then 00:15) | FLOWING |
| StackList Uptime column | `byStackId` | `/api/uptime/stacks` | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase-14 server units (jobs, services, domain, transport, scanner, notification preservation) | `npx vitest run --project unit` on 28 files | 28 files, 447 tests passed | PASS |
| Phase-14 client units (storage, uptime, probe form, timeline, stack-list, retention card, hook) | `npx vitest run` on 12 files | 12 files, 152 tests passed | PASS |
| Server type-check | `npx tsc --noEmit` in `server/` | no errors | PASS |
| Client type-check | `npx tsc --noEmit` in `client/` | no errors | PASS |
| Orchestrator regression gate | client suite 101 files pass; server 4 failures in `git-executor.test.ts` and `template-source-reader.test.ts` | Windows timeouts, listed in `deferred-items.md`, in files this phase did not touch | PASS (pre-existing) |
| Never-settling Docker call does not stop probing | no such test exists | | FAIL (missing coverage, see CR-01) |

Integration (testcontainers) suites and Playwright could not be run in this environment; the 14-xx integration tests are written but unrun here (WINDOWS.md #21 to #30).

### Probe Execution

Step 7c: SKIPPED. No `scripts/*/tests/probe-*.sh` files exist and no plan declares a shell probe (the word "probe" in this phase means the HTTP health probe feature).

### Requirements Coverage

REQUIREMENTS.md holds no rows for these items; Phase 14's requirement IDs are the GitHub issues named in ROADMAP.md. All three are claimed by plans and by SUMMARY `requirements-completed`; there are no orphans.

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ------------ | ----------- | ------ | -------- |
| #23 | 14-01, 14-03, 14-06, 14-08, 14-09, 14-11, 14-13 | HTTP health probes feeding the status model, with retained transition history | BLOCKED in part | Feature exists and passes tests; CR-01 (silent probe stall) and WR-01/WR-05 (stale container health) are open defects against the fail-closed and new-container rules. |
| #24 | 14-04, 14-07, 14-10, 14-12 | Per-stack uptime over a configurable window plus incident list | SATISFIED | Truth 3 and 11. Needs the migrations applied on a live DB (human item). |
| #27 | 14-02, 14-05, 14-07, 14-14 | Sortable disk usage per stack and per volume with a total | SATISFIED (warnings) | Truth 4 and 12. WR-03/WR-04/WR-09/IN-02 should be fixed. |

### Anti-Patterns Found

Debt-marker scan (TBD/FIXME/XXX) over the reviewed implementation files: no unreferenced markers were found that I could attribute to this phase's files. Stub scan found no placeholder returns on rendered paths. The code review's findings are the real defects; all 18 are still `open` in `14-REVIEW-DISPOSITION.md` and I re-confirmed these against the source:

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `server/src/infrastructure/probe-transport.ts`, `dockerode-client.ts`, `jobs/health-probe-job.ts` | 178-407 / 30-47 / 129-140 | CR-01 Docker calls without timeout | Blocker | Silent permanent probe stall, possible boot block |
| `server/src/application/service-health-service.ts` | 113-138 | WR-01 no container id check | Blocker (D-08 partial) | Stale container id and history written |
| `container-state-catch-up.ts`, `state-poller.ts` | 151-160 / 232-302 | WR-05 old health carried across redeploy | Blocker (D-08 partial) | Wrong status, incident and notification for up to about 90s |
| `server/src/jobs/state-poller.ts` | 207 | WR-11 unconditional clear in 404 branch | Warning | History mis-attributed to docker-healthcheck |
| `server/src/jobs/disk-usage-job.ts` | 136-147 | WR-03 `volumes` dir not lstat-checked | Warning | Symlinked `volumes` leaks names and sizes outside the stacks tree |
| `server/src/infrastructure/disk-usage-scanner.ts` | 41-42 | WR-04 default 1 MiB maxBuffer | Warning | Stack permanently "Not measured" when many unreadable dirs |
| `server/src/jobs/disk-usage-job.ts` | 53-78 | WR-09 kickoff bypasses guard | Warning | Possible concurrent runs, health reporter shows "never ran" |
| `server/src/infrastructure/probe-transport.ts` | 34-41, 100-114 | WR-02 joins untrusted networks; WR-10 self-id from hostname | Warning | Exposure of Docktor listener; all probes fail with a custom hostname |
| `client/src/hooks/use-service-health-events.ts` | 23-48 | WR-06 no stale-response guard | Warning | Out-of-order overwrite, previous stack shown |
| `client/src/routes/app/stacks/components/services-section.tsx` | 104-106 | WR-07 badge from any historic event | Warning | Badge wrong after probe removal |
| `client/src/hooks/use-service-health-events.ts`, `use-stack-uptimes.ts` | 50 / 41 | WR-08 one EventSource per hook | Warning | Browser connection-limit pressure |
| IN-01 to IN-06 | various | Info | Info | See 14-REVIEW.md |

### Human Verification Required

See the `human_verification` and `behavior_unverified_items` frontmatter: six items (visual checks on the health history panel, probe form, Storage page, Overview incident list and retention card; and applying the three migrations to a live database), plus the live Docker attach/detach check for amended D-05. These do not change the verdict because `gaps_found` takes precedence, but they remain open after the gaps are closed.

### Gaps Summary

The phase delivered what its four success criteria describe, and it is wired through the server, the event bus and the client, with passing unit tests and clean type-checks. Two clusters of defects keep it from being verified as complete:

1. **CR-01, probe liveness (critical).** The probe engine bounds the HTTP request but not the Docker calls around it. A single hung `inspect`, `connect` or `disconnect` stops all probing for the life of the process with no log line, and because probe-owned services are taken away from Docker's healthcheck, nothing else corrects the stale value. This directly contradicts the "a service is never silently left looking healthy" intent behind D-02, D-06 and D-08. It also blocks startup if the hang happens in `start()`. This is the one that must be fixed before the phase is closed.
2. **Container identity (WR-01, WR-05).** Probe results are not tied to the current container, and a redeploy carries the previous container's health forward for probe-owned services. The status a user sees right after a deploy can be wrong for up to roughly 90 seconds, and it can open an incident or send a notification for a container that has not been probed.

Suggested closure plan (one focused plan): wrap Docker calls on the probe path with a deadline and add an in-flight watchdog plus a never-settling-call test (CR-01); add the containerId guard and the immediate `starting` write on container change (WR-01, WR-05). WR-03, WR-04, WR-09 and WR-11 are small, local fixes that fit the same plan. WR-02, WR-06 to WR-08, WR-10 and the info items can be triaged separately; they do not falsify a must-have. All 18 findings still need dispositions in `14-REVIEW-DISPOSITION.md`.

---

_Verified: 2026-10-08T21:15:00Z_
_Verifier: Claude (gsd-verifier)_
