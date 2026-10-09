---
phase: 14-health-uptime-and-disk-visibility
verified: 2026-10-09T09:00:00Z
status: human_needed
score: 11/13 must-haves verified
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
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-15-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-15-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-16-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-16-SUMMARY.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-17-PLAN.md"
  - ".planning/phases/14-health-uptime-and-disk-visibility/14-17-SUMMARY.md"
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
  - "server/src/jobs/job.ts"
  - "server/src/jobs/state-poller.ts"
  - "server/src/lib/compose-health-probe.ts"
  - "server/src/lib/stacks-dir.ts"
  - "server/src/lib/with-deadline.ts"
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
covered_digest: "v3:sha256:2dff3ae2dad99a60cf60271d2e92e2f2201694c0aae40ff73b5b51f756bd2995"
behavior_unverified: 1
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 9/13
  gaps_closed:
    - "D-02 / D-06 / D-08 fail-closed cadence (CR-01): every probe-path Docker call, every probe, every start() pre-step and every tick is now bounded (closed by 14-15)"
    - "D-08 container identity (WR-01, WR-05, WR-11): probe results apply only to the current container and a new or restarted container starts as `starting` (closed by 14-16)"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
behavior_unverified_items:
  - truth: "Amended D-05 (14-09): Docktor connects its own container to the target's network for the duration of one probe and disconnects afterwards (refcounted, crash-safe sweep), and Delete Stack still completes while an attachment is active"
    test: "On a dedicated Docker host with a collision-proof compose project name, run Docktor in a container, add a probe to a service on a network Docktor does not share, and watch docker network inspect during and after a probe. Then restart Docktor mid-attachment and delete the stack while probes are active. Also pause the Docker daemon (or block its socket) for more than 10 seconds and confirm the next probe records a failed probe instead of stalling."
    expected: "Docktor appears on the network only for the request and is gone afterwards; the startup sweep removes a leftover endpoint with alias docktor-health-probe; the delete flow completes; a stalled daemon yields a recorded network-unreachable probe and probing resumes when it recovers"
    why_human: "Unit tests drive a fake Docker client. The real Docker network attach/detach, the 403 already-connected case, compose down while attached and real dockerode abortSignal cancellation cannot be proven without a live daemon. Logged as unrun-verify #30 in .planning/WINDOWS.md."
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
**Verified:** 2026-10-09T09:00:00Z
**Status:** human_needed
**Re-verification:** Yes, after gap closure (plans 14-15, 14-16, 14-17)

## Goal Achievement

Both gap clusters from the first report are closed in the source, not just in the SUMMARY files. No client, shared or Prisma file changed since the first report (`git diff 58debc9 HEAD` touches only 13 `server/src` files), so the client-side and schema findings carry over without regression. No truth is FAILED. The status is `human_needed` because the visual backstop checks, the live-database migration check and the live-Docker check for amended D-05 are still open; none of them can be proven by grep or unit tests.

### Previous Gaps: Closure Check

| Previous gap | Verdict | Evidence in the code (not the SUMMARY) |
| ------------ | ------- | -------------------------------------- |
| CR-01: unbounded Docker calls stall probing | CLOSED | `lib/with-deadline.ts` (`withDeadline`: timer + AbortController, late result ignored). `probe-transport.ts` routes all 7 Docker calls through `bounded()` (target inspect line 365, own inspect 383 and 423, connect 202, disconnect 230 and 391); a grep for `this.docker.` finds no unbounded call. A miss returns `NETWORK_UNREACHABLE` (failed probe), not a skip. `dockerode-client.ts` forwards `abortSignal` to `inspect`, `Network.connect` and `Network.disconnect`; I confirmed `node_modules/dockerode/lib/network.js` and `container.js` pass `abortSignal` through and `docker-modem` turns it into a request `signal` and strips it from the body. `health-probe-job.ts`: `probeService` wraps `transport.probe` in `withDeadline(timeoutMs + PROBE_DEADLINE_MARGIN_MS)` and records `network-unreachable` on a miss; `start()` bounds `sweepStaleAttachments` and `refreshOwnership` at 30s each; `run()` has an in-flight marker with a 5 min watchdog that reports via `IntervalJob.reportError` and starts a fresh tick, and the stale tick's `finally` only releases its own marker. |
| WR-01: probe result written to the wrong container's row | CLOSED | `service-health-service.ts` `applyProbeResult` now returns early when `row.containerId !== event.containerId`. |
| WR-05: old container's health carried across a redeploy | CLOSED | `domain/service-health.ts` adds `isReplacedContainer` and `probeOwnedHealth` (new running container becomes `starting`, new non-running becomes null). Used in `container-state-catch-up.ts` (`observe`, both the inspect and the inspect-failed paths), and in `state-poller.ts` (`handleEvent` on `action === "start"`, and `observeContainer` in reconcile with a single-container guard). Scaled services keep the stored value by design. `advance()` also reseeds from the row when the remembered health disagrees with it. |
| WR-11: 404-branch clear attributed to docker-healthcheck | CLOSED | `state-poller.ts` passes `this.healthSource(...)` to every `emitHealthTransition`, so a probe-owned clear or reset is attributed to `http-probe`. |
| WR-03, WR-04, WR-09 (disk scan) | CLOSED | `disk-usage-job.ts` `measureVolumes` calls `scanner.isRealDirectory(volumesDir)` before listing and returns `[]` for a symlinked or missing folder; `disk-usage-scanner.ts` sets `maxBuffer: 64 MiB` and warns on `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`; `kickoff()` returns `runGuarded()` and `run()` has a `scanning` guard. |
| 18 findings had no dispositions | CLOSED | `14-REVIEW-DISPOSITION.md` lists all 18, none `open`: 7 fixed (CR-01, WR-01, WR-03, WR-04, WR-05, WR-09, WR-11), 11 deferred with reasons. |

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | SC1 (#23): a service can optionally carry an HTTP health probe that feeds the same status model as Docker-healthcheck status | VERIFIED | Unchanged from the first report; `HealthProbeJob` registered, `ServiceHealthService.applyHealth` writes through the unchanged `deriveStackStatus`, Config form wired. Unit suites for jobs, application and domain pass (68 files, 1186 tests). |
| 2  | SC2 (#23): health transitions are retained and visible per stack and per service | VERIFIED (with warnings) | `ServiceHealthEvent`, single-writer subscriber, `GET /api/stacks/:id/health-events`, `useServiceHealthEvents` to `ServiceHealthTimeline`. WR-11 is now fixed. Open, deferred warnings: WR-06 (stale-response race in the hook), WR-07 (HTTP probe badge derived from any historic event). Both are cosmetic and self-correcting; neither breaks the criterion. |
| 3  | SC3 (#24): each stack shows an uptime percentage and an incident list over a retention window | VERIFIED | Unchanged; `computeUptime`, `UptimeService`, `IncidentTracker`, `HealthHistoryPruner`, `UptimeCard`, `IncidentList`, list column and retention card all wired. |
| 4  | SC4 (#27): disk usage viewable per stack and per volume, sortable, with a total | VERIFIED | `DiskUsageJob` to `StackVolumeUsage` to `GET /api/storage` to sortable `/storage` page. WR-03, WR-04, WR-09 now fixed; IN-02 (non-UTF-8 volume names) deferred as info. |
| 5  | D-01: probe config lives in the compose file and is edited through the Config tab with diff-confirm | VERIFIED | Unchanged. Visual check pending (human item). |
| 6  | D-07: a probe-owned service's health is owned by the probe | VERIFIED | `probeOwnership.isProbeOwned` guards remain in `state-poller.ts` and the catch-up. The WR-11 exception is gone; the only Docker-side writes for a probe-owned service are now the D-08 reset to `starting` or null on a new container, attributed to `http-probe`. |
| 7  | #23 SC4 preservation: NotificationWatcher and deriveStackStatus unchanged; probe-driven UNHEALTHY/recovery reaches the watcher through the existing event | VERIFIED | `probe-notification-preservation.test.ts` passes in the application suite; `stack-state-derivation.ts` and `notification-watcher.ts` are not in the gap-closure diff. |
| 8  | D-02 / D-06 / D-08 fail-closed cadence: a probe that gets no answer is a failed probe and probing continues every 30s regardless of Docker daemon behaviour | VERIFIED | See CR-01 closure above. Behavioral evidence: `health-probe-job-liveness.test.ts` ("keeps probing on later ticks after a Docker inspect that never settles", "records one failed probe when the transport never answers, and ignores a late answer", "lets the remaining pool workers drain the queue past one hung probe", start() resolves after 30s when sweep or ownership never settle, watchdog replaces a stuck tick and keeps the newer guard), `probe-transport-deadlines.test.ts` (abort signal fires, own-inspect hang fails closed with no connect or request, hung connect, late connect heals, hung disconnect does not block the next probe, sweep hangs) and `with-deadline.test.ts` (100% coverage). All pass. The earlier "no test for a never-settling Docker call" hole is closed. |
| 9  | D-08: a probe-driven health value always belongs to the container currently running, and a new container starts as `starting` | VERIFIED | See WR-01/WR-05 closure above. Behavioral evidence: `probe-container-identity.test.ts`, `state-poller-probe-identity.test.ts`, `service-health-service.test.ts` ("drops a successful result for a replaced container instead of turning the new one healthy", "starts over as `starting` when the container id changed"), `domain/service-health.test.ts`. All pass. |
| 10 | Amended D-05: ephemeral, refcounted network attach with crash-safe sweep and fallback outside a container | PRESENT_BEHAVIOR_UNVERIFIED | Code present and wired; now also deadline-bounded. Unit tests use a fake Docker. No live attach/detach evidence, and real dockerode request cancellation is only confirmed by reading the library source. Routed to human verification. |
| 11 | D-11 / D-10: one StackIncident per UNHEALTHY/ERROR episode; daily pruner keeps open incidents and StatusLog | VERIFIED | Unchanged; incident and pruner tests pass. |
| 12 | D-13 / D-14: the daily scan sizes `<stack>/volumes/*` and `<stack>/backups`, never follows symlinks, tolerates `du` exit 1, keeps previous values on failure, isolates per stack | VERIFIED | The WR-03 scope gap (the `volumes` folder itself) is closed; `disk-usage-job.test.ts` and `disk-usage-scanner.test.ts` pass. |
| 13 | Backstop truths (14-03 long-text, 14-05 overflow, 14-07 overflow, 14-08 long-text): layout holds at Pixel 7 width | UNCERTAIN (human) | Declared `verification: backstop`; overflow was measured by script only. Routed to human verification. |

**Score:** 11/13 truths verified (1 present but behavior-unverified, 1 awaiting human visual checks, 0 failed)

### Required Artifacts

`verify.artifacts` for plans 14-15 (5/5), 14-16 (5/5) and 14-17 (4/4) all pass; the artifacts of plans 14-01 to 14-14 were verified in the first report and are unchanged except for the server files in the gap-closure diff, re-read above. `with-deadline.ts` is new, 48 lines, substantive and imported by `probe-transport.ts` and `health-probe-job.ts`.

### Key Link Verification

`verify.key-links` for plans 14-15 (4/4), 14-16 (4/4) and 14-17 (2/2) all verified. Links from the first report are unchanged.

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `probe-transport.ts` | `with-deadline.ts` | `bounded()` around every Docker call | WIRED |
| `dockerode-client.ts` | dockerode `abortSignal` option | forwarded only when a signal is given | WIRED |
| `health-probe-job.ts` | `with-deadline.ts` | per-probe deadline and bounded `start()` steps | WIRED |
| `health-probe-job.ts` | `job.ts` | `reportError` from the watchdog | WIRED |
| `container-state-catch-up.ts`, `state-poller.ts` | `domain/service-health.ts` | `probeOwnedHealth`, `isReplacedContainer` | WIRED |
| `disk-usage-job.ts` | `job.ts`, `disk-usage-scanner.ts` | `kickoff()` to `runGuarded()`; `isRealDirectory` before `listVolumeDirectories` | WIRED |

### Data-Flow Trace (Level 4)

Unchanged from the first report; the gap-closure plans changed no rendered data source. All four traces (uptime, health events, storage overview, list uptimes) remain FLOWING.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Server type-check | `npx tsc --noEmit` in `server/` | exit 0, no errors | PASS |
| Phase-14 server units (jobs, application, domain, with-deadline, probe-transport, probe-transport-deadlines, dockerode-client, disk-usage-scanner) | `npx vitest run --project unit` on those paths | 68 files, 1186 tests passed | PASS |
| Never-settling Docker call does not stop probing | `health-probe-job-liveness.test.ts` (included in the run above) | passes | PASS |
| dockerode forwards `abortSignal` | read `node_modules/dockerode/lib/network.js` (lines 63, 103, 142) and `docker-modem/lib/modem.js` (139, 196) | forwarded as request `signal`, stripped from body | PASS |
| Client suite | not re-run | no client, shared or Prisma file changed since the first report, which recorded 101 files passing | PASS (carried over) |

The full server suite was not re-run; the known pre-existing Windows failures (`git-executor.test.ts`, `template-source-reader.test.ts`) are in `deferred-items.md` and are not phase gaps. Integration (testcontainers) and Playwright suites cannot run here (WINDOWS.md #21 to #30).

### Probe Execution

Step 7c: SKIPPED. No `scripts/*/tests/probe-*.sh` files exist and no plan declares a shell probe ("probe" here means the HTTP health probe feature).

### Requirements Coverage

REQUIREMENTS.md holds no rows for these items; the requirement IDs are the GitHub issues named in ROADMAP.md. Plans 14-15, 14-16 and 14-17 declare `#23`, `#23`/`#24` and `#27` respectively. No orphans.

| Requirement | Source Plans | Description | Status | Evidence |
| ----------- | ------------ | ----------- | ------ | -------- |
| #23 | 14-01, 14-03, 14-06, 14-08, 14-09, 14-11, 14-13, 14-15, 14-16 | HTTP health probes feeding the status model, with retained transition history | SATISFIED | Truths 1, 2, 6, 7, 8, 9 verified; amended D-05 live attach is a human item. |
| #24 | 14-04, 14-07, 14-10, 14-12, 14-16 | Per-stack uptime over a configurable window plus incident list | SATISFIED | Truths 3 and 11. The migrations still need applying on a live DB (human item). |
| #27 | 14-02, 14-05, 14-07, 14-14, 14-17 | Sortable disk usage per stack and per volume with a total | SATISFIED | Truths 4 and 12. |

### Anti-Patterns Found

Debt-marker scan (TBD, FIXME, XXX) over every file changed by the gap-closure plans: no hits. No stub or placeholder patterns in the new code. Remaining open review findings, all dispositioned `deferred` with reasons in `14-REVIEW-DISPOSITION.md`:

| File | Pattern | Severity | Impact |
| ---- | ------- | -------- | ------ |
| `probe-transport.ts` | WR-02 joins untrusted networks for one request; WR-10 self-id from hostname | Warning | Accepted design hardening (T-14-44); with a custom hostname every probe fails closed. Not a must-have violation, and worth a GitHub issue. |
| `use-service-health-events.ts`, `use-stack-uptime.ts` | WR-06 no stale-response guard | Warning | Cosmetic, self-corrects on the next fetch. |
| `services-section.tsx` | WR-07 HTTP probe badge derived from any historic event | Warning | Badge can be wrong after a probe is removed; needs a server-provided flag. |
| `use-service-health-events.ts`, `use-stack-uptimes.ts` | WR-08 one EventSource per hook | Warning | Browser connection-limit pressure; cross-cutting client work. |
| IN-01 to IN-06 | Info | Info | See 14-REVIEW.md. |

None of these falsifies a roadmap success criterion or a plan must-have, so they do not block the phase.

### Human Verification Required

See the `human_verification` and `behavior_unverified_items` frontmatter: six items (visual checks on the health history panel, probe form, Storage page, Overview incident list and retention card; applying the three migrations to a live database) plus the live-Docker check for amended D-05, which I extended to cover a stalled-daemon run now that real request cancellation is relied upon.

### Gaps Summary

No gaps remain. CR-01 (probe liveness) and WR-01/WR-05 (container identity) are fixed in the code and covered by behavioral tests that fail without the fix's mechanisms (never-settling Docker calls, replaced-container results). The disk-scan warnings are fixed too, and every review finding now has a disposition. What stays open is human-only: visual checks at phone width in both themes, a live migration run, and a live Docker run for the network attach path.

---

_Verified: 2026-10-09T09:00:00Z_
_Verifier: Claude (gsd-verifier)_
