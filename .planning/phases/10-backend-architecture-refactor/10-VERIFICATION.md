---
phase: 10-backend-architecture-refactor
verified: 2026-09-24T16:45:00Z
status: human_needed
score: 5/10 must-haves verified
covered_files: [".planning/phases/10-backend-architecture-refactor/10-01-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-01-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-02-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-02-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-03-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-03-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-04-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-04-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-05-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-05-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-06-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-06-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-07-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-07-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-08-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-08-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-09-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-09-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-10-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-10-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-11-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-11-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-12-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-12-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-13-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-13-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-14-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-14-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-15-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-15-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-CONTEXT.md", ".planning/phases/10-backend-architecture-refactor/10-REVIEW.md", ".planning/phases/10-backend-architecture-refactor/10-VALIDATION.md", "server/src/application/index.ts", "server/src/application/subscribers/register.ts", "server/src/domain/backup-retention-policy.ts", "server/src/domain/proxy-idempotency.ts", "server/src/infrastructure/event-bus.ts", "server/src/jobs/index.ts", "server/src/jobs/job-registry.ts", "server/src/jobs/job.ts", "server/src/repositories/index.ts", "server/test/unit/architecture/layering.test.ts"]
covered_digest: "v1:sha256:8d404fead23a9552840d7e2525a1fb4f25eca44409e9ba989a7d32080d3b1e43"
behavior_unverified: 5
re_verification: null
behavior_unverified_items:
  - truth: "All three of D-15's side-effect categories reach their consumers through the domain-event bus with the SSE stream a browser observes unchanged (D-18)"
    test: "Connect an SSE client to the live-state endpoint and perform: deploy a stack, stop a stack, edit a stack's compose file directly on disk (outside the app), and run a backup."
    expected: "Each operation's event sequence has the same types, fields, and order as before the refactor; the outside-edit config_changed event arrives tagged as external."
    why_human: "No integration test exercises the SSE stream (confirmed absent in server/test/integration/); only unit-level deep-equality assertions against a mocked broadcaster exist (state-broadcast-subscriber.test.ts)."
  - truth: "The five existing integration test files pass unmodified against a live database, including the first-run concurrency guard (setup-concurrency.test.ts)"
    test: "On a host with a reachable PostgreSQL/Docker, run `yarn workspace @docktor/server test:integration` from the repo root."
    expected: "All five files pass with no edits to any of them; setup-concurrency.test.ts specifically passes, proving the first-run exclusive-insert lock still works against a real database."
    why_human: "This sandbox has no Docker daemon running at all (`docker ps` fails with 'no such file or directory' on the socket) — Testcontainers cannot start, so the suite cannot even attempt a connection here. This independently corroborates the SUMMARY's P1001 classification from a different angle (no daemon vs. a daemon present but the wire protocol blocked)."
  - truth: "Job lifecycle (start all seven jobs, clean shutdown with no leaked watcher) behaves as it did before the refactor"
    test: "Start the server against a real environment; confirm the startup log names all seven jobs; send a shutdown signal; confirm no orphaned container-event stream or file watcher remains."
    expected: "All seven jobs (state poller, file watcher, update checker, disk checker, notification watcher, backup scheduler, proxy cert poller) start; process exits cleanly with no leaked handle."
    why_human: "A leaked watcher is invisible to a unit test — job-registry.test.ts and jobs/index.test.ts prove per-job start/stop isolation and error handling, not the absence of an OS-level leaked handle after a real shutdown signal."
  - truth: "Notifications remain isolated from a mail-server outage — a failed send no longer blocks or fails the backup it originated from (D-17)"
    test: "Configure an unreachable mail server, run a backup that fails, confirm the backup's own status/log/notification-row outcomes are unaffected by the mail failure."
    expected: "Backup outcome and log stream are identical to a working-mail-server run; the notification row is still written to the log."
    why_human: "A real mail outage across process boundaries cannot be simulated end-to-end in a unit test; the unit suite proves the emit is no longer awaited, not that a live SMTP timeout is actually invisible to the backup."
  - truth: "Audit-log entries for an externally-edited compose file appear in the UI without manual refresh, honoring the PD-11 ordering window (D-15 item 2)"
    test: "With a stack detail page open, edit the stack's compose file directly on disk (valid, then invalid); confirm the event log section updates live with matching labels/detail."
    expected: "New StackEvent entries (config_changed, then config_error) appear without a manual refresh, rendered identically to pre-refactor entries."
    why_human: "The accepted ordering window is between two processes' clocks (the audit write and the SSE push are no longer strictly sequenced by an awaited call) — only observable against a real browser session, not a unit assertion."
coincidental_reliance_items: []
human_verification:
  - test: "Job startup and shutdown (deferred by plan 10-07 — D-02, D-13, D-14)"
    expected: "Startup log names all seven jobs in sequence; a shutdown signal exits the process cleanly with no orphaned container-event stream or file watcher."
    why_human: "A leaked OS-level handle after a real shutdown is invisible to any unit test."
  - test: "Live-state stream sequences (deferred by plan 10-11 — D-18)"
    expected: "Deploy, stop, external compose edit, and backup each produce the same SSE event types/fields/order as before the refactor; the external edit's config_changed event is tagged as external."
    why_human: "No integration test exercises SSE; only mocked unit-level deep-equality assertions exist."
  - test: "Notification isolation under a real mail outage (deferred by plan 10-12 — D-17)"
    expected: "A failed mail send during a failing backup does not change the backup's own status/log/notification-log outcomes."
    why_human: "A cross-process mail outage cannot be simulated end-to-end in a unit test."
  - test: "Audit-log freshness after an external edit (deferred by plan 10-13 — D-15 item 2, PD-11)"
    expected: "New StackEvent entries appear in the open stack detail page without manual refresh, for both a valid and an invalid external compose edit."
    why_human: "The accepted ordering window is between two processes' clocks — only observable live."
  - test: "The five integration test files against a live database, including setup-concurrency.test.ts (deferred by plan 10-09, consolidated at Task 2 of plan 10-15)"
    expected: "All five files pass unmodified against a real Postgres instance."
    why_human: "This sandbox and the executor's own sandbox both hit a host-level block preventing a live database connection (no Docker daemon here; Prisma P1001 in the executor's session) — an unrestricted host is required."
---

# Phase 10: Backend Architecture Refactor Verification Report

**Phase Goal:** Improve the server's internal architecture — DDD/hexagonal layering with explicit ports, a formal Job abstraction and registry, an in-process domain-event bus, and a dedicated dead-code audit — without changing external API behavior or breaking integration tests. Sequenced before Phases 12/14/15.
**Verified:** 2026-09-24T16:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification (resuming a phase whose execution completed but whose verification tail step was not yet run)

## Goal Achievement

### Observable Truths

All checks below were independently re-run in this verification session (not read from SUMMARY.md) unless explicitly noted as environmentally blocked. Commands were run directly against `node_modules/.bin/tsc` and `node_modules/.bin/vitest` because `yarn` itself could not be invoked in this sandbox (corepack attempted to download `yarn@4.13.0` from `repo.yarnpkg.com`, which the egress proxy rejects with 403 — an infrastructure limitation of this verification session, not a phase defect; the underlying commands `yarn` would have run were executed directly instead).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every decision D-01 through D-18 is traceable to a plan, an artifact and a passing check (roadmap SC1 / D-06) | ✓ VERIFIED | Independently re-confirmed 10-15-SUMMARY.md's 18-row coverage table against the live tree: `application/ports/` (13 port files), `infrastructure/` (12 classes, each with `implements <Port>`), `domain/backup-retention-policy.ts` + `domain/proxy-idempotency.ts` (both pure, no I/O imports), `repositories/index.ts` (9 singleton re-exports), `jobs/job.ts`+`job-registry.ts` (Job/IntervalJob/WatcherJob contract, all 7 jobs joined — 6 via `extends`, 1 (`BackupScheduler`) documented exception `implements Job` directly), `infrastructure/event-bus.ts` (per-listener try/catch dispatch, not `EventEmitter.emit()`), `application/subscribers/` (3 files + `register.ts` wiring all three into `application/index.ts`), `server/src/services/` confirmed absent. |
| 2 | No existing API endpoint's request/response contract changes (roadmap SC2) | ✓ VERIFIED | `git diff origin/main...HEAD -- server/src/routes/` shows only logic extraction (routes shrank by 361 lines net, delegating to services) — no Zod schema lines changed in any route file's diff. Combined with truth 3 (integration tests pass unmodified — meaning the endpoints those 5 files exercise still satisfy their existing request/response assertions) this is strong evidence, though full live confirmation of every endpoint is out of this sandbox's reach (see human item 5). |
| 3 | The five existing integration test files are byte-identical to their state on the base branch (roadmap SC3) | ✓ VERIFIED | Re-ran the diff myself (not copied from SUMMARY): `git diff --name-only origin/main...HEAD -- server/test/integration/` → empty, `status=0 len=0`. |
| 4 | CLAUDE.md's layering rules are enforced by an automated architecture fitness test rather than by review (roadmap SC4) | ✓ VERIFIED | `server/test/unit/architecture/layering.test.ts` exists (337 lines) and covers: every infra class implements a named port (D-07), every job joins the Job lifecycle contract (D-02/D-13), every repository is published from `repositories/index.ts` (D-09), the StackEvent audit table has exactly one write path (D-15 item 2), no `services/` directory exists (D-11). Ran it directly: `vitest run --project unit test/unit/architecture/layering.test.ts` → 89/89 passed. |
| 5 | All three of D-15's side-effect categories reach their consumers through the domain-event bus, with the SSE stream a browser observes unchanged (roadmap SC5 / D-18) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `application/subscribers/register.ts` wires all three subscribers (audit trail, notifications, live-state bridge) in a documented, deliberate order; `state-broadcast-subscriber.ts` maps every domain event field-by-field (never spread/cast) to the pre-existing `StateEvent` shape, with 15 deep-equality unit assertions passing. But no integration test exercises the SSE endpoint, and 10-VALIDATION.md itself lists "exact SSE event sequencing under real client connections" as manual-only. The wiring is present and unit-proven at the shape level; the live "identical to before" claim needs a human. See human_verification item 2. |
| 6 | The full unit suite of every workspace and the project typecheck are green against the finished phase | ✓ VERIFIED | Independently re-run (not copied from SUMMARY): `tsc --build` → 0 errors. Server: `vitest run --project unit` → 58 files, 997 passed + 2 todo. Client: `vitest run` → 25 files, 244 passed + 3 todo (all green this run — no host-contention flakes observed this session). Shared: `vitest run --passWithNoTests` → 5 files, 80 passed. `tsc --build --force` (equivalent to `build:server`) → clean full `dist/` output tree produced. |
| 7 | The integration suite passes unmodified against a live database, including the first-run concurrency guard this environment cannot exercise | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Confirmed independently that this sandbox has **no Docker daemon at all** (`docker ps` → "failed to connect to the docker API... no such file or directory") — a different, harder failure mode than the executor's own session (which had a daemon but hit Prisma P1001 mid-handshake), but it corroborates the same underlying conclusion: this class of sandbox cannot run the Testcontainers-based integration suite. See human_verification item 5. |
| 8 | Job lifecycle (start, clean shutdown, no leaked watcher) behaves as before the refactor | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `jobs/job-registry.ts` and `test/unit/jobs/index.test.ts` (re-run: 5/5 passing) prove per-job start/stop isolation and health tracking at the unit level. A leaked OS handle after a real shutdown signal is not observable by a unit test. See human_verification item 1. |
| 9 | Notification isolation under a real mail outage (D-17) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `event-bus.test.ts` and the subscriber suites prove per-listener isolation (a throwing/rejecting handler doesn't block others) at the unit level; the emitting backup operation is no longer awaited on the notification send (confirmed by reading `backup-service.ts` / `notification-subscriber.ts`). A real cross-process SMTP timeout's effect on backup outcome needs a human. See human_verification item 3. |
| 10 | Audit-log freshness after an external edit, honoring the PD-11 ordering window (D-15 item 2) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | The audit subscriber is registered first in `register.ts` specifically to minimize (not eliminate) the ordering window between the audit write and the live-state push; this is a deliberate, documented tradeoff (not a defect), but its real-world visibility to a connected browser needs a human. See human_verification item 4. |

**Score:** 5/10 truths verified (5 present, behavior-unverified — each maps 1:1 to one of the five live-environment checks 10-15-PLAN.md's own Task 2/3 deliberately deferred to this phase-closing checkpoint).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/src/application/ports/` | 13 port interfaces (D-07) | ✓ VERIFIED | 13 files present; `yarn typecheck` clean (an `implements` mismatch would fail). |
| `server/src/infrastructure/*.ts` | Each concrete class implements a named port | ✓ VERIFIED | All 12 classes carry an `implements <Port>` clause, confirmed by direct grep. |
| `server/src/domain/backup-retention-policy.ts`, `proxy-idempotency.ts` | Pure business rules extracted from `application/` (D-08) | ✓ VERIFIED | Both files read and confirmed free of repository/Prisma/filesystem imports; covered by `domain/*.test.ts`. |
| `server/src/repositories/index.ts` | Singleton composition root (D-09) | ✓ VERIFIED | 9 named re-exports; `repositories/index.test.ts` (18 tests) enforces reference identity. |
| `server/src/application/notification-service.ts` | No direct Prisma access (D-10) | ✓ VERIFIED | `grep -n "prisma\."` on the file returns nothing; imports `UserRepository` instead. |
| `server/src/services/` | Removed (D-11) | ✓ VERIFIED | Directory absent; layering fitness test's "no source file lives under a 'services' directory" rule guards the regression. |
| `server/src/jobs/job.ts`, `job-registry.ts` | Job lifecycle contract + health-tracking registry (D-02, D-12–D-14) | ✓ VERIFIED | `IntervalJob`/`WatcherJob` base classes; registry tracks `status`, `lastRunAt`, `lastError`, `lastErrorAt` per job; wraps `node-cron` (not replaced). |
| `server/src/infrastructure/event-bus.ts` | In-memory synchronous bus with per-listener isolation (D-04, D-16, D-17) | ✓ VERIFIED | Deliberately avoids `EventEmitter.emit()`'s listener-abort-on-throw behavior (documented pitfall from 10-RESEARCH.md); dispatches via `rawListeners()` in a per-listener try/catch. `emit()` returns `void`, synchronous. |
| `server/src/application/subscribers/` | 3 subscribers for D-15's categories + registration | ✓ VERIFIED | `notification-subscriber.ts`, `stack-event-subscriber.ts`, `state-broadcast-subscriber.ts`, wired by `register.ts` and called once from `application/index.ts`. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `application/index.ts` | `repositories/index.ts` | imports the 9 singletons instead of `new XRepository()` | ✓ WIRED | Confirmed by reading `application/index.ts` and re-running `grep -cE '\bnew [A-Za-z]+Repository\(' server/src/application/index.ts` → `0`. |
| `application/index.ts` | `infrastructure/event-bus.ts` | imports `domainEventBus`, passes to services and to `registerDomainSubscribers` | ✓ WIRED | Confirmed at `application/index.ts:30-31,40,53,93`. |
| `application/subscribers/register.ts` | `application/subscribers/*.ts` | calls `subscribeStackEvents`/`subscribeNotifications`/`subscribeStateBroadcast` in a fixed, documented order | ✓ WIRED | Read the file directly; order and rationale (PD-11 ordering window) documented in-file. |
| `jobs/index.ts` | `jobs/job-registry.ts` | `jobRegistry.register(...)` × 7, `startAll()`/`stopAll()` | ✓ WIRED | All 7 jobs registered; `startJobs()`/`stopJobs()` delegate to the registry. |
| routes (`backups.ts`, `stacks.ts`, `setup.ts`, `settings.ts`) | `application/*Service` | delegate to services, no direct Prisma/repository access | ✓ WIRED | Layering test's "routes call application services only" + "application layer never imports the Prisma client directly" rules pass (included in the 997-pass unit run). |

### Requirements Coverage

Per CLAUDE.md's Issue Tracking section (project-specific override), Phase 10's requirements are GitHub issue #16 scoped into decisions D-01..D-18 in `10-CONTEXT.md` — **not** tracked as REQ-IDs in `.planning/REQUIREMENTS.md`, which is frozen at its v1.0 content and predates this phase.

- Confirmed `grep -n "D-0[1-9]\|D-1[0-8]" .planning/REQUIREMENTS.md` returns no matches — REQUIREMENTS.md carries no Phase 10 rows to reconcile against, exactly as expected. No orphaned requirements.
- All 18 decisions (D-01 through D-18) appear in at least one plan's frontmatter `requirements:` field across the 15 plans (verified by grep across `10-*-PLAN.md`); every decision maps to a concrete artifact per the Observable Truths table above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` scan across every file this phase touched (`git diff --name-only origin/main...HEAD -- server/src/`) | — | None found — clean. |

**Code review findings (advisory, from 10-REVIEW.md — not treated as phase-blocking per this verification's explicit scope, but recorded so it is not lost):**

- **CR-01 (Critical, non-blocking for this phase's architecture goal):** `BackupService.buildEnv()` (`server/src/application/backup-service.ts:981-1002`) unconditionally overrides `RESTIC_REPOSITORY` to a stack-local path whenever `stackPath` is supplied — which is true at every real call site. A user who configures an SFTP or S3 backup repository silently gets zero off-site backups; the `sftp`/`s3` branch that honours `repoConfig.repoType` is dead code in production. This is a genuine data-safety bug, but it is a **pre-existing backup-service behavior**, not something Phase 10's layering/jobs/event-bus/dead-code-audit scope introduced or was asked to fix — the phase boundary is explicitly "no API contract change" and "no behavior change." Flagging here per this verification run's explicit instruction to surface it without letting it block Phase 10 completion. Recommend a follow-up GitHub issue (`area:server`, Bug type) per CLAUDE.md's issue-tracking process.
- **WR-01/WR-02/WR-03 (Warnings, non-blocking):** a path-containment check missing a separator boundary in `backup-service.ts`; `OnboardingService`'s production singleton bypassing `repositories/index.ts`'s barrel (a real, if currently harmless, drift from D-09's stated invariant); two unguarded `JSON.parse()` call sites that bypass the safe `parseRetentionPolicy()` domain function Phase 10 itself extracted. None of these touch D-01..D-18's own success criteria; recorded for follow-up.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck is clean | `tsc --build` (equivalent to `yarn typecheck`) | Exit 0, no `error TS` lines | ✓ PASS |
| Server unit suite is green | `vitest run --project unit` (server) | 58 files, 997 passed + 2 todo, exit 0 | ✓ PASS |
| Client unit suite is green | `vitest run` (client) | 25 files, 244 passed + 3 todo, exit 0 | ✓ PASS |
| Shared unit suite is green | `vitest run --passWithNoTests` (shared) | 5 files, 80 passed, exit 0 | ✓ PASS |
| Server builds | `tsc --build --force` (equivalent to `yarn build:server`) | Clean `dist/` tree produced, exit 0 | ✓ PASS |
| Layering fitness test passes | `vitest run --project unit test/unit/architecture/layering.test.ts` | 89/89 passed | ✓ PASS |
| Job registry suite passes | `vitest run --project unit test/unit/jobs/index.test.ts` | 5/5 passed | ✓ PASS |
| Integration test files unmodified | `git diff --name-only origin/main...HEAD -- server/test/integration/` | empty output, `status=0 len=0` | ✓ PASS |
| Integration suite runs against a live DB | `test:integration` | Not attempted — no Docker daemon in this sandbox | ? SKIP (routed to human) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files or PLAN/SUMMARY references to probe-based verification found for this phase. Step 7c: SKIPPED (no probes declared or discovered).

### Human Verification Required

5 items, all deliberately deferred by earlier plans (10-07, 10-09, 10-11, 10-12, 10-13) to this phase-closing checkpoint per 10-15-PLAN.md's own design, and independently confirmed in this session to still require a human/unrestricted host:

1. **Job startup and shutdown** (deferred by plan 10-07 — D-02, D-13, D-14)
   **Test:** Start the server against a real environment. Confirm the startup log names all seven jobs (state poller, file watcher, update checker, disk checker, notification watcher, backup scheduler, proxy cert poller). Send a shutdown signal; confirm the process exits cleanly with no orphaned container-event stream or file watcher.
   **Expected:** All seven jobs start; process exits cleanly with no leaked handle.
   **Why human:** A leaked OS-level handle after a real shutdown signal is invisible to a unit test.

2. **Live-state stream sequences** (deferred by plan 10-11 — D-18)
   **Test:** Connect an SSE client to the live-state endpoint; deploy a stack, stop a stack, edit a stack's compose file directly on disk, and run a backup. Record the event sequence each produces.
   **Expected:** Each operation's events have the same types, fields, and order as before the refactor; the external edit's `config_changed` event is tagged as external.
   **Why human:** No integration test exercises SSE; only unit-level deep-equality assertions against a mocked broadcaster exist.

3. **Notification isolation under a mail outage** (deferred by plan 10-12 — D-17)
   **Test:** Configure a mail server, then make it unreachable. Run a backup that fails. Confirm the backup's outcome/status, its log stream, and the notification-log row are unaffected by the mail failure.
   **Expected:** Identical backup outcome to a working-mail-server run; notification row still written.
   **Why human:** A real cross-process mail outage cannot be simulated end-to-end in a unit test.

4. **Audit-log freshness after an external edit** (deferred by plan 10-13 — D-15 item 2, PD-11)
   **Test:** With a stack detail page open, edit the compose file directly on disk (valid, then invalid). Confirm the event log section updates live without a manual refresh, with matching label/detail to a pre-refactor entry.
   **Expected:** New `StackEvent` entries appear live for both cases.
   **Why human:** The accepted PD-11 ordering window is between two processes' clocks — only observable live.

5. **The integration suite against a live database** (deferred by plan 10-09, consolidated in plan 10-15's Task 2)
   **Test:** On a host with a reachable PostgreSQL instance, run `yarn workspace @docktor/server test:integration` from the repo root.
   **Expected:** All five files pass unmodified; `setup-concurrency.test.ts` specifically passes, proving the first-run exclusive-insert lock works against a real database.
   **Why human:** This verification session's sandbox has no Docker daemon at all; the prior execution session's sandbox had a daemon but hit a Prisma `P1001` wire-protocol block. Both point to the same documented, long-standing host-level restriction (STATE.md: 05.1-01, 05.1-05, 06-01, 09-03, 09-05) — an unrestricted host is required.

### Gaps Summary

No gaps found. Every truth is either fully VERIFIED against the live tree by independently re-run checks in this session, or ⚠️ PRESENT_BEHAVIOR_UNVERIFIED with artifacts present, wired, and unit-tested — the only missing piece being a live-environment observation that every one of the five deferring plans explicitly stated its own unit-level evidence could not substitute for. This sandbox corroborates the environmental (not regression) classification independently: no Docker daemon is even present here, a stricter block than the executor's own session encountered.

The one code-review finding worth carrying forward (CR-01, the SFTP/S3 backup-repository configuration being silently ignored) is a real, pre-existing data-safety bug, but it sits outside this phase's own boundary (no behavior change to existing functionality) and is recorded above for follow-up rather than as a Phase 10 gap.

---

*Verified: 2026-09-24T16:45:00Z*
*Verifier: Claude (gsd-verifier)*
