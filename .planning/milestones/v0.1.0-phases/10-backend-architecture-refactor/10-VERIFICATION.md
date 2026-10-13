---
phase: 10-backend-architecture-refactor
verified: 2026-09-25T09:30:00Z
status: passed
score: 10/10 must-haves verified
covered_files: [".planning/phases/10-backend-architecture-refactor/10-01-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-01-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-02-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-02-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-03-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-03-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-04-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-04-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-05-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-05-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-06-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-06-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-07-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-07-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-08-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-08-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-09-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-09-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-10-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-10-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-11-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-11-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-12-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-12-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-13-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-13-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-14-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-14-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-15-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-15-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-16-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-16-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-17-PLAN.md", ".planning/phases/10-backend-architecture-refactor/10-17-SUMMARY.md", ".planning/phases/10-backend-architecture-refactor/10-CONTEXT.md", ".planning/phases/10-backend-architecture-refactor/10-REVIEW.md", ".planning/phases/10-backend-architecture-refactor/10-UAT.md", ".planning/phases/10-backend-architecture-refactor/10-VALIDATION.md", "client/src/hooks/use-backup-history.ts", "client/src/routes/app/stacks/components/backup-history.tsx", "client/src/routes/app/stacks/components/backups-tab.tsx", "server/src/application/index.ts", "server/src/application/subscribers/register.ts", "server/src/domain/backup-retention-policy.ts", "server/src/domain/proxy-idempotency.ts", "server/src/infrastructure/event-bus.ts", "server/src/jobs/index.ts", "server/src/jobs/job-registry.ts", "server/src/jobs/job.ts", "server/src/jobs/state-poller.ts", "server/src/repositories/index.ts", "server/test/unit/architecture/layering.test.ts"]
covered_digest: "v1:sha256:a122bbd1c581ef8b229517b9a13c73624644ee7cc17b1506c307db55486da9b6"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/10
  gaps_closed:
    - "All three of D-15's side-effect categories reach their consumers through the domain-event bus with the SSE stream a browser observes unchanged (D-18) — closed via live UAT test 2 (deploy/stop event sequences observed correct) and UAT test 4 (external-edit config_changed/config_error confirmed live)"
    - "The five existing integration test files pass unmodified against a live database, including the first-run concurrency guard — closed via UAT test 5: user's own live run passed 12/16 proxy.test.ts cases plus all of the other four files (including setup-concurrency.test.ts); the 4 proxy.test.ts domain-assignment failures (G-10-4) were investigated exhaustively (35/35 passed twice via real Testcontainers in the debug session, unreproducible), then closed as environmental on the authoritative signal that the user's own GitHub Actions CI is green on this exact code"
    - "Job lifecycle (start all seven jobs, clean shutdown with no leaked watcher) behaves as it did before the refactor — closed via UAT test 1 pass, after code fix 10-16 Task 2 (G-10-1) made JobRegistry.startAll() log a started line for every job; user re-confirmed live that all seven job names now appear at startup"
    - "Notifications remain isolated from a mail-server outage — a failed send no longer blocks or fails the backup it originated from (D-17) — closed via UAT test 3 pass; the literal mail-outage scenario was not exercised (user instead tested an UNHEALTHY-container notification, which passed, plus fixed two unrelated bugs found along the way), but the isolation guarantee itself is also proven by the per-listener-isolation unit suite (event-bus.test.ts, notification-subscriber tests) and the user recorded 0 issues"
    - "Audit-log entries for an externally-edited compose file appear in the UI without manual refresh, honoring the PD-11 ordering window (D-15 item 2) — closed via UAT test 4 pass, no caveats recorded"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
advisory:
  - finding: "CR-01 (BackupService.buildEnv() silently ignores a configured SFTP/S3 backup repository, always writing restic to a stack-local path) — a genuine data-safety bug found by 10-REVIEW.md's code review, but confirmed pre-existing (not introduced by any of Phase 10's 17 plans, including the two gap-closure plans verified in this session)"
    category: security
    reason: "Outside this phase's explicit boundary (no behavior change to existing functionality; D-01..D-18 do not touch BackupService.buildEnv()). Per the verification task's instructions, this is already filed as GitHub issue #68 for follow-up — recorded here so it is not lost, not treated as a Phase 10 gap."
    evidence_status: "documented in 10-REVIEW.md and 10-UAT.md's Non-Blocking Advisory section; tracked externally as GitHub issue #68, outside verifier's ability to confirm issue metadata in this sandbox (no `gh` CLI available)"
human_verification: []
---

# Phase 10: Backend Architecture Refactor Verification Report

**Phase Goal:** Improve the server's internal architecture — DDD/hexagonal layering with explicit ports, a formal Job abstraction and registry, an in-process domain-event bus, and a dedicated dead-code audit — without changing external API behavior or breaking integration tests. Sequenced before Phases 12/14/15.
**Verified:** 2026-09-25T09:30:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plans 10-16, 10-17) and a completed live UAT session (10-UAT.md: 5/5 passed, 0 issues)

## Goal Achievement

### Summary of this re-verification

The previous verification (2026-09-24, `status: human_needed`, score 5/10) left 5 truths as ⚠️ PRESENT_BEHAVIOR_UNVERIFIED because they required a live, human-operated environment that verification's own sandbox did not have (no Docker daemon, no browser, no real SMTP server). Since then:

1. Live UAT surfaced 4 real defects (G-10-1 through G-10-4). Three (G-10-1, G-10-2, G-10-3) were root-caused, fixed with TDD (RED confirmed, GREEN confirmed), and committed in plans **10-16** (`c529427`, `4075560`) and **10-17** (`fad393e`, `423e9bc`).
2. The fourth (G-10-4, a 4/16 failure in `proxy.test.ts` on the user's own live-database run) could not be reproduced despite an exhaustive debug session (direct call, HTTP injection, the unmodified test 4x, real Testcontainers, the full 5-file suite 35/35 twice) and was closed as environmental on the strength of the user's own GitHub Actions CI being green on this exact code.
3. The user re-ran all 5 original UAT tests live after the fixes landed and recorded **5/5 passed, 0 issues** in `10-UAT.md`.

This session independently re-ran the full automated gate against current `HEAD` (not copied from any SUMMARY) and confirms all four commits (`c529427`, `4075560`, `fad393e`, `423e9bc`) are present, the working tree is clean, and every previously-green check is still green.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every decision D-01 through D-18 is traceable to a plan, an artifact and a passing check (roadmap SC1 / D-06) | ✓ VERIFIED | Re-confirmed against the live tree: `application/ports/` (13 files), `infrastructure/*.ts` (12 classes, each `implements <Port>`), `domain/backup-retention-policy.ts` + `domain/proxy-idempotency.ts` (present, 8 domain files total), `repositories/index.ts` (9 named re-exports, confirmed by direct read), `jobs/job.ts`+`job-registry.ts` present, `infrastructure/event-bus.ts` present, `application/subscribers/` (4 files incl. `register.ts`), `server/src/services/` confirmed absent. `grep -oE "D-[0-9]+"` across all 17 plans' `requirements:` frontmatter returns D-01 through D-18, all present. |
| 2 | No existing API endpoint's request/response contract changes (roadmap SC2) | ✓ VERIFIED | No route/schema file touched by plans 10-16/10-17 (both are jobs/client-hook fixes only, confirmed by `git diff --name-only c529427^..423e9bc`). Prior verification's route-diff finding for plans 10-01..10-15 is unchanged (no new commits touch `server/src/routes/`). |
| 3 | The five existing integration test files are byte-identical to their state on the base branch (roadmap SC3) | ✓ VERIFIED | Re-ran independently this session: `git diff --name-only origin/main...HEAD -- server/test/integration/` → empty, 0 lines. |
| 4 | CLAUDE.md's layering rules are enforced by an automated architecture fitness test rather than by review (roadmap SC4) | ✓ VERIFIED | Re-ran independently: `vitest run --project unit test/unit/architecture/layering.test.ts` → **89/89 passed**. |
| 5 | All three of D-15's side-effect categories reach their consumers through the domain-event bus, with the SSE stream a browser observes unchanged (roadmap SC5 / D-18) | ✓ VERIFIED (human-confirmed) | UAT test 2 (result: pass): user exercised deploy + stop on a real stack via the SSE devtools tab, observed `stack_status` transitions, container-state transitions and `statusLog` matching `state-broadcast-subscriber.test.ts`'s asserted shapes — with the previously-noisy ~60s "heartbeat" now gone (a *direct, intended* consequence of 10-16's G-10-3 fix, confirmed absent). UAT test 4 (result: pass) separately confirmed the external-compose-edit `config_changed`/`config_error` audit path renders live with no manual refresh. Caveat honestly carried forward: the specific "backup run" SSE sub-case was not separately exercised by the user; nothing in this session's evidence contradicts it, and the underlying status-transition and audit-write code paths it would exercise are the same ones tests 2 and 4 already proved. |
| 6 | The full unit suite of every workspace and the project typecheck are green against the finished phase | ✓ VERIFIED | Independently re-run this session (not copied from any SUMMARY): `tsc --build` → exit 0, 0 errors. Server: `vitest run --project unit` → **58 files, 1009 tests, all passed** (up from 997+2 todo at the prior verification — the 10 new gap-closure tests, plus the 2 former `it.todo` placeholders becoming real tests). Client: `vitest run` → **27 files, 259 passed + 3 todo** (up from 25/244+3 todo — the new `use-backup-history` hook + component tests). Shared: `vitest run --passWithNoTests` → **5 files, 80 passed**. |
| 7 | The integration suite passes unmodified against a live database, including the first-run concurrency guard this environment cannot exercise | ✓ VERIFIED (human-confirmed, G-10-4 closed environmental) | UAT test 5 (result: pass): user ran `yarn workspace @docktor/server test:integration` on their own unrestricted host with a real Postgres. All four non-proxy integration files passed unmodified, including `setup-concurrency.test.ts`. `proxy.test.ts` showed 4/16 failures (all tracing to `POST /api/stacks/:id/services/:serviceName/proxy` returning 500), closed as `closed_environmental` (G-10-4) after a debug session could not reproduce the failure via direct call, `app.inject()`, 4x unmodified file reruns, and 2x full 5-file suite reruns through real Testcontainers (35/35 both times) — and the user independently confirmed their own GitHub Actions CI is green on this exact code. This sandbox still has no Docker daemon (`docker ps` → "Cannot connect to the Docker daemon" — reconfirmed this session), so the CI + user's own live run remain the only available live-DB evidence, which is what this truth needed. |
| 8 | Job lifecycle (start, clean shutdown, no leaked watcher) behaves as before the refactor | ✓ VERIFIED (human-confirmed) | UAT test 1 (result: pass), after 10-16 Task 2 fixed G-10-1 (`4075560`): `JobRegistry.startAll()` now logs `[JobRegistry] Started <name> (<kind>)` for every successfully-started job. Independently re-confirmed this session: `grep -n "console.log" server/src/jobs/job-registry.ts` shows exactly the one new line; `vitest run --project unit test/unit/jobs/index.test.ts` (re-run) pins all seven production job names in registration order, 6/6 tests passing. User re-confirmed live that all seven names now appear at startup. |
| 9 | Notification isolation under a real mail outage (D-17) | ✓ VERIFIED (human-confirmed, scenario substitution noted) | UAT test 3 (result: pass): the user did not exercise the literal "unreachable mail server + failing backup" scenario — instead tested an UNHEALTHY-container transition (notification delivered correctly) and, along the way, found and got fixed two unrelated defects (G-10-2 request storm, G-10-3 status-spam). The isolation guarantee D-17 actually asserts (a failing/unawaited notify() cannot fail the operation that emitted it) is proven at the unit level by `event-bus.test.ts`'s per-listener isolation tests and by direct reading of `backup-service.ts` (the notify emit is fire-and-forget, not awaited) — re-confirmed present this session. The user recorded 0 issues. |
| 10 | Audit-log freshness after an external edit, honoring the PD-11 ordering window (D-15 item 2) | ✓ VERIFIED (human-confirmed) | UAT test 4 (result: pass), no caveats recorded by the user. |

**Score:** 10/10 truths verified (0 present-but-behavior-unverified — all 5 previously-deferred human-verification items were closed by an actual live UAT session, `10-UAT.md`: 5/5 passed, 0 issues).

### Required Artifacts (regression check — all previously VERIFIED, quick existence re-check this session)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/src/application/ports/` | 13 port interfaces (D-07) | ✓ VERIFIED | 13 files present (re-counted). |
| `server/src/infrastructure/*.ts` | Each concrete class implements a named port | ✓ VERIFIED | 12 files with an `implements` clause (re-counted via grep). |
| `server/src/domain/*.ts` | Pure business rules, no I/O (D-08) | ✓ VERIFIED | 8 files present incl. `backup-retention-policy.ts`, `proxy-idempotency.ts`. |
| `server/src/repositories/index.ts` | Singleton composition root (D-09) | ✓ VERIFIED | 9 named re-exports, read directly this session. |
| `server/src/services/` | Removed (D-11) | ✓ VERIFIED | Directory absent (re-confirmed). |
| `server/src/jobs/job.ts`, `job-registry.ts` | Job lifecycle contract + registry (D-02, D-12-D-14) | ✓ VERIFIED | Both present; `job-registry.ts` now also logs a started line per job (10-16 addition). |
| `server/src/infrastructure/event-bus.ts` | In-memory synchronous bus (D-04, D-16, D-17) | ✓ VERIFIED | Present, unchanged by the gap-closure plans (explicit prohibition honored — confirmed via `git diff --name-only c529427^..423e9bc` not touching this file). |
| `server/src/application/subscribers/` | 3 subscribers + registration (D-15) | ✓ VERIFIED | 4 files present (3 subscribers + `register.ts`), unchanged by gap closure. |
| `client/src/hooks/use-backup-history.ts` | New hook owning Backups tab fetch/poll lifecycle (G-10-2 closure) | ✓ VERIFIED | Present; polling effect keyed `[stackId]` only (`grep -c '}, \[stackId\])'` → 1); exports `BACKUP_HISTORY_POLL_INTERVAL_MS`/`BACKUP_HISTORY_GRACE_WINDOW_MS`. |
| `client/src/routes/app/stacks/components/backup-history.tsx` | Renders from the hook, no own effects | ✓ VERIFIED | `grep -c 'from "react"'` → 0; calls `useBackupHistory(stackId, stackStatus)`. |

### Key Link Verification (regression + new links)

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `application/index.ts` | `repositories/index.ts` | imports 9 singletons | ✓ WIRED | Unchanged by gap closure; re-confirmed present. |
| `application/subscribers/register.ts` | `application/subscribers/*.ts` | fixed subscription order | ✓ WIRED | Unchanged by gap closure. |
| `jobs/index.ts` | `jobs/job-registry.ts` | `jobRegistry.register(...)` × 7 | ✓ WIRED | Unchanged registration; `startAll()` now also logs. |
| `state-poller.ts` `reconcile()` | `repositories/stack-repository.ts` `updateStackStatus()` | captured return value gates the emit | ✓ WIRED (new, G-10-3) | `grep -c 'const statusLog = await repo.updateStackStatus'` → 2 (both `handleEvent()` and `reconcile()`), `if (statusLog)` guard present at the `reconcile()` site — confirmed by direct read. |
| `job-registry.ts` `startAll()` | stdout | one `console.log` per successful start | ✓ WIRED (new, G-10-1) | `grep -c 'console.log'` → 1, template matches `[JobRegistry] Started ${job.name} (${job.kind})`. |
| `backups-tab.tsx` (`stackStatus` prop) | `backup-history.tsx` | `useBackupHistory(stackId, stackStatus)` | ✓ WIRED (new, G-10-2) | Confirmed by direct read: `backups-tab.tsx` passes `stackStatus` through; hook's second `useEffect` keyed `[stackId, stackStatus]` drives the refresh, ref-invoking the polling effect's own fetch function (no second `EventSource`, confirmed by `grep -c 'useContainerEvents' client/src/hooks/use-backup-history.ts` → 0). |

### Requirements Coverage

Per CLAUDE.md's Issue Tracking section (project-specific override), Phase 10's requirements are GitHub issue #16 scoped into decisions D-01..D-18 in `10-CONTEXT.md` — **not** tracked as REQ-IDs in `.planning/REQUIREMENTS.md`, which is frozen at its v1.0 content and predates this phase. This is intentional per the verification task's own instructions and is not treated as a gap.

- `grep -n "D-0[1-9]\|D-1[0-8]" .planning/REQUIREMENTS.md` returns no matches — no Phase 10 rows to reconcile, exactly as expected.
- All 18 decisions (D-01 through D-18) appear in at least one plan's frontmatter `requirements:` field across all 17 plans (verified by grep across `10-*-PLAN.md`, including the two new gap-closure plans, which both re-declare `D-02/D-13/D-14/D-15` and the G-10-2 closure respectively).
- No orphaned requirements found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` scan across every file touched by the gap-closure plans (`git diff --name-only c529427^..423e9bc`) | — | None found — clean. |

**Advisory (non-blocking, carried forward from 10-REVIEW.md, per the verification task's explicit instructions):**

- **CR-01:** `BackupService.buildEnv()` silently ignores a configured SFTP/S3 backup repository, always using a stack-local path. Confirmed pre-existing (not touched by any of Phase 10's 17 plans, including the two verified in this session). Already filed as GitHub issue #68 per the verification task's instructions; recorded here, not counted as a Phase 10 gap.
- **WR-01/WR-02/WR-03:** unchanged from the prior verification (path-boundary separator guard, `OnboardingService` composition-root bypass, unguarded `JSON.parse()` on retention-policy JSON) — none touch D-01..D-18's own success criteria.

### Behavioral Spot-Checks (all independently re-run this session against current HEAD)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck is clean | `tsc --build` | Exit 0, no `error TS` lines | ✓ PASS |
| Server unit suite is green | `vitest run --project unit` (server) | 58 files, 1009 passed, exit 0 | ✓ PASS |
| Client unit suite is green | `vitest run` (client) | 27 files, 259 passed + 3 todo, exit 0 | ✓ PASS |
| Shared unit suite is green | `vitest run --passWithNoTests` (shared) | 5 files, 80 passed, exit 0 | ✓ PASS |
| Layering fitness test passes | `vitest run --project unit test/unit/architecture/layering.test.ts` | 89/89 passed | ✓ PASS |
| G-10-1/G-10-3 fix tests pass | `vitest run --project unit test/unit/jobs/state-poller.test.ts test/unit/jobs/job-registry.test.ts test/unit/jobs/index.test.ts` | 3 files, 37/37 passed | ✓ PASS |
| G-10-2 fix tests pass | `vitest run test/unit/hooks/use-backup-history.test.ts test/unit/routes/stacks/backup-history.test.tsx` (client) | 2 files, 15/15 passed | ✓ PASS |
| Integration test files unmodified | `git diff --name-only origin/main...HEAD -- server/test/integration/` | empty output | ✓ PASS |
| All four gap-closure commits present on HEAD | `git log --oneline --all \| grep -E "c529427\|4075560\|fad393e\|423e9bc"` | all 4 found | ✓ PASS |
| Working tree clean | `git status --short` | empty | ✓ PASS |
| Integration suite runs against a live DB | `test:integration` | Not attempted in this sandbox — still no Docker daemon (`docker ps` reconfirmed failing) | Resolved via human UAT + CI signal (see Truth 7) |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files or PLAN/SUMMARY references to probe-based verification found for this phase. SKIPPED (no probes declared or discovered).

### Human Verification Required

None. All 5 items deferred by the prior verification were resolved by a live UAT session (`10-UAT.md`, status: complete, 5/5 passed, 0 issues) after the two code-level gap-closure plans (10-16, 10-17) landed. See `re_verification.gaps_closed` in the frontmatter for the mapping from each closed item to its UAT test and evidence.

### Gaps Summary

No gaps. This re-verification independently re-ran the full automated gate (typecheck, server/client/shared unit suites, the layering fitness test, and the specific gap-closure test files) against current `HEAD` rather than trusting any SUMMARY, and confirms:

- All four gap-closure commits (`c529427`, `4075560`, `fad393e`, `423e9bc`) are present and the working tree is clean.
- The server unit suite grew from 997+2 todo to 1009 passing (the two former `it.todo` placeholders plus new regression tests), the client suite from 244+3 todo to 259+3 todo — both fully green.
- No file outside each gap-closure plan's declared `files_modified` was touched (`git diff --name-only <plan's first commit>^..HEAD`).
- The five roadmap-level integration test files remain byte-identical to `origin/main`.
- No debt markers (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) were introduced.

The one item that could not be independently re-verified from this sandbox — the integration suite against a live database — was resolved the same way the phase's own plans designed it to be resolved: a human ran it on an unrestricted host (`10-UAT.md` test 5), one residual failure (G-10-4) was investigated exhaustively and closed as environmental on the strength of a green CI signal on the exact same code, per this verification task's explicit instruction to treat that closure as authoritative rather than as an open gap.

CR-01 (a pre-existing, out-of-scope data-safety bug in `BackupService.buildEnv()`) remains recorded as a non-blocking advisory, tracked externally as GitHub issue #68 per the verification task's instructions.

---

*Verified: 2026-09-25T09:30:00Z*
*Verifier: Claude (gsd-verifier)*
