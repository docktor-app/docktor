---
phase: "13"
slug: "update-checker-reliability"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-10-06"
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.18: server `unit` project (mocked deps) and `test/integration` project (testcontainers Postgres); client Vitest + @testing-library/react (jsdom). Playwright is not used by this phase. |
| **Config file** | `server/vitest.config.ts` (projects `unit`, `test/integration`), `client/vitest.config.ts`; no new config. |
| **Quick run command** | `yarn workspace @docktor/server test:unit <files>` / `yarn workspace @docktor/client test <files>` (exact per-task file lists below) |
| **Full suite command** | `yarn workspace @docktor/server test:unit && yarn workspace @docktor/client test && yarn workspace @docktor/server test:integration test/integration/stacks.test.ts test/integration/image-update-check-pruning.test.ts && yarn typecheck` |
| **Estimated runtime** | ~60s per task quick run (server unit subset ~15-25s, client subset ~15-30s, typecheck ~20s); integration files ~60-120s including the Postgres container start |

---

## Sampling Rate

- **After every task commit:** run that task's `<automated>` commands (server/client unit subsets + `yarn typecheck`; integration file where the task lists one).
- **After every plan wave:** run the full suite command above.
- **Before `/gsd-verify-work`:** the full suite must be green.
- **Max feedback latency:** 120 seconds (an integration file including container start-up); unit-only tasks stay under 60 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | #33 (D-04, D-06) | T-13-01, T-13-04 | isMovingTag is server-computed from currentTag only; the client never re-derives it | unit + integration | `yarn workspace @docktor/server test:unit test/unit/domain/image-update-detection.test.ts test/unit/application/stack-service.test.ts test/unit/jobs/update-checker.test.ts test/unit/architecture/layering.test.ts` · `yarn workspace @docktor/server test:integration test/integration/stacks.test.ts` · `yarn workspace @docktor/client test test/unit/routes/stacks/service-upgrade-dialog.test.tsx` · `yarn typecheck` | ✅ (extended; TDD RED first) | ⬜ pending |
| 13-01-02 | 01 | 1 | #33 (D-03, D-05), #31 (D-01), #32 (D-02) | T-13-02, T-13-03 | Shortcut reuses the guarded POST /update; the dialog closes on first click; stack-wide scope stated in copy | unit | `yarn workspace @docktor/client test test/unit/routes/stacks/service-upgrade-dialog.test.tsx test/unit/routes/stacks/stack-actions.test.tsx test/unit/routes/stacks/services-section.test.tsx test/unit/components/domain/stack/stack-update-badge.test.tsx test/unit/components/domain/stack/service-update-badge.test.tsx` · `yarn typecheck` | ✅ (extended) | ⬜ pending |
| 13-02-01 | 02 | 2 | #34 (D-07, D-09) | T-13-05, T-13-08 | Catch-up emits the per-service event shape only; derivation shared, not duplicated | unit | `yarn workspace @docktor/server test:unit test/unit/domain/stack-state-derivation.test.ts test/unit/application/container-state-catch-up.test.ts test/unit/application/stack-service.test.ts test/unit/jobs/state-poller.test.ts test/unit/architecture/layering.test.ts` · `yarn typecheck` | ❌ W0: `stack-state-derivation.test.ts` and `container-state-catch-up.test.ts` are created by this task (RED first) | ⬜ pending |
| 13-02-02 | 02 | 2 | #34 (D-07, D-08) | T-13-05, T-13-06, T-13-07, T-13-09 | Skip when transitional; never rejects; never masks the action's failure result | unit | `yarn workspace @docktor/server test:unit test/unit/application/stack-service.test.ts test/unit/application/container-state-catch-up.test.ts test/unit/jobs/state-poller.test.ts test/unit/application/proxy-service.test.ts` · `yarn typecheck` | ✅ (files exist after 13-02-01) | ⬜ pending |
| 13-03-01 | 03 | 2 | #29 (D-10, D-11) | T-13-10, T-13-11 | Prune set computed only from Service rows; no registry/Docker import in the pruner | unit + integration | `yarn workspace @docktor/server test:unit test/unit/jobs/image-update-check-pruner.test.ts test/unit/jobs/index.test.ts test/unit/jobs/update-checker.test.ts test/unit/architecture/layering.test.ts` · `yarn workspace @docktor/server test:integration test/integration/image-update-check-pruning.test.ts` · `yarn typecheck` | ❌ W0: `image-update-check-pruner.test.ts` and `image-update-check-pruning.test.ts` are created by this task (RED first) | ⬜ pending |
| 13-03-02 | 03 | 2 | #29 (D-10, D-11) | T-13-11, T-13-12 | A read failure never becomes an empty set; idempotent second run | unit + integration | `yarn workspace @docktor/server test:unit test/unit/jobs/image-update-check-pruner.test.ts test/unit/jobs/update-checker.test.ts test/unit/architecture/layering.test.ts` · `yarn workspace @docktor/server test:integration test/integration/image-update-check-pruning.test.ts` · `yarn typecheck` | ✅ (files exist after 13-03-01) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No framework install or shared fixtures are needed; Vitest, testing-library and the testcontainers integration harness already exist. The four new test files are each created RED-first by the TDD task that owns them, before any implementation, so no separate Wave 0 plan is needed:

- [ ] `server/test/unit/domain/stack-state-derivation.test.ts`: deriveStackStatus precedence table + isTransitionalStatus (#34, created by 13-02-01)
- [ ] `server/test/unit/application/container-state-catch-up.test.ts`: per-service emission, statusLog-once, edge cases (#34, created by 13-02-01, extended by 13-02-02)
- [ ] `server/test/unit/jobs/image-update-check-pruner.test.ts`: tracked set passed unchanged to deleteAllExcept, startup run, read-failure propagation (#29, created by 13-03-01)
- [ ] `server/test/integration/image-update-check-pruning.test.ts`: real-Postgres prune of orphans, live rows survive, idempotent rerun (#29, created by 13-03-01)
- [ ] `server/test/unit/application/stack-service.test.ts`: the single beforeEach construction gains the 10th `stateCatchUp` mock in the same task that changes the constructor (13-02-01, RESEARCH Pitfall 5)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Second open tab (stack list or dashboard) shows redeployed services' real states within a few seconds of a deploy, with no reload (backstop truth in 13-02) | #34 | Needs a real Docker daemon, a real deploy and two live browser tabs on the SSE pipeline. Unit tests prove the event shape and ordering but not end-to-end latency. | On a host with no unrelated production containers (STATE.md 05.1-03 incident), use a collision-proof random stack name: 1. Open the stack list in tab A. 2. In tab B, open the stack and click Redeploy. 3. Within ~5s, tab A shows every service as running (not "unknown") with no reload. 4. Repeat with Update Images, then with a compose edit that makes `up` fail: tab A shows the real exited/running states promptly, and tab B still shows the failure toast. |
| Moving-tag Upgrade dialog visual and copy (D-04/D-05) | #33 | Visual check of the UI-SPEC copy, outline button and neutral Alert in light and dark mode | 1. Open a stack with an `image: nginx:latest` service once UpdateChecker has flagged it (or seed an ImageUpdateCheck row with hasUpdate true). 2. Click the service's Upgrade arrow. 3. Confirm: the description says "latest is a moving tag…"; the neutral Alert explains Update Images is stack-wide; the Upgrade button is disabled; the outline "Update Images" button closes the dialog and shows the "Updating images..." toast. 4. Toggle dark mode and re-check contrast. |
| Pruner backlog clears on first boot of an upgraded install | #29 | Needs a database that has accumulated stale rows since Phase 02 | After deploying the build, check the server log for one `[ImageUpdateCheckPruner] pruned N stale row(s)` line at startup when orphans existed, then `SELECT count(*) FROM "ImageUpdateCheck"` equals the number of distinct image:tag refs in use. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (6/6 tasks; new test files are created RED-first inside their owning task)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has at least two automated commands)
- [x] Wave 0 covers all MISSING references (4 new files + the Pitfall-5 constructor update listed above)
- [x] No watch-mode flags (`vitest run` via the workspace scripts; no `--watch`)
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (set by /gsd-validate-phase after execution)
