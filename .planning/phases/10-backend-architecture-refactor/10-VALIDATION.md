---
phase: "10"
slug: "backend-architecture-refactor"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-22"
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest — `server/vitest.config.ts`, `projects` config with `unit` and `test/integration` named projects |
| **Config file** | `server/vitest.config.ts` |
| **Quick run command** | `yarn workspace @docktor/server test:unit` (runs `--project unit` only — no live DB needed) |
| **Full suite command** | `yarn workspace @docktor/server test` (runs both projects; `test:integration` needs a live Postgres) |
| **Estimated runtime** | ~30s unit / integration needs live Postgres, longer |

---

## Sampling Rate

- **After every task commit:** Run `yarn workspace @docktor/server test:unit`
- **After every plan wave:** Run `yarn workspace @docktor/server test` (requires live Postgres)
- **Before `/gsd-verify-work`:** Full suite must be green, including the 5-file integration suite unmodified (hard phase constraint)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Keyed by CONTEXT.md decision ID (this phase has no REQ-IDs — GitHub issue #16 is an open-list prompt scoped into D-01..D-18). The planner assigns these to concrete task IDs/waves; this table records what each decision must be verified against.

| Decision | Plan | Wave | Behavior | Test Type | Automated Command | File Exists | Status |
|----------|------|------|----------|-----------|--------------------|-------------|--------|
| D-09 | TBD | TBD | `repositories/index.ts` exports all 8 repository singletons | unit | new test file | ❌ W0 — no `repositories/` test dir exists | ⬜ pending |
| D-10 | TBD | TBD | `notification-service.ts` no longer imports `prisma` directly; uses a `UserRepository` | unit | `yarn workspace @docktor/server test:unit test/unit/application/notification-service.test.ts` | ✅ exists, needs update | ⬜ pending |
| D-07 | TBD | TBD | Each interfaced infra class (`DockerExecutor`, `StackFilesystem`, `ResticExecutor`, SMTP client, +) has a port interface; concrete class implements it | unit + type-level | `yarn typecheck` + existing service test files | ✅ existing tests cover behavior | ⬜ pending |
| D-12/D-13 | TBD | TBD | Job abstraction: `IntervalJob`/`WatcherJob` start/stop lifecycle | unit | new test file(s) for `job.ts`/`job-registry.ts`; rewrite of `jobs/index.test.ts` | ❌ W0 for base classes; ✅ existing file needs rewrite not update | ⬜ pending |
| D-14 | TBD | TBD | Registry tracks last-run/last-error/running-stopped per job | unit | new assertions in rewritten `jobs/index.test.ts` | ❌ W0 | ⬜ pending |
| D-15/D-16/D-17 | TBD | TBD | Event bus: emit/subscribe, per-listener isolation (a throwing subscriber must not block others) | unit | new `test/unit/infrastructure/event-bus.test.ts` | ❌ W0 — highest-priority new test; see Pitfall below | ⬜ pending |
| D-18 | TBD | TBD | `StateBroadcaster` (as bus subscriber) still publishes identical SSE event shapes at identical points | unit | existing `application/stack-service.test.ts`, `application/backup-service.test.ts`, extended to mock the bus and assert unchanged payload shape | ✅ unit coverage exists and should be extended; ⚠️ no integration test currently exercises SSE directly | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/unit/infrastructure/event-bus.test.ts` — covers D-15/D-16/D-17, specifically the per-listener isolation guarantee. **Research proved live this session that a bare `EventEmitter.emit()` does NOT isolate listeners** — a throwing subscriber aborts dispatch and any listener registered after it never runs. The new bus needs a per-listener try/catch dispatch loop, not a copy of `StateBroadcaster.publish()`'s current implementation.
- [ ] `test/unit/jobs/job.test.ts` (or equivalent) — covers D-12/D-13's base `Job` lifecycle contract
- [ ] `test/unit/jobs/job-registry.test.ts` (or a rewritten `jobs/index.test.ts`) — covers D-14's health tracking and stop-isolation
- [ ] `server/test/unit/repositories/` directory — does not exist yet; D-09's `repositories/index.ts` and D-10's new `UserRepository` are the first repository-layer tests in this codebase — establish the pattern (likely mirroring `application/*.test.ts`'s mock-Prisma-client style)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Exact SSE event sequencing under real client connections | D-18 | No integration test currently exercises SSE (`grep -n "SSE\|EventSource\|/api/events" server/test/integration/*.ts` returns no matches); Phase 08 validated this by manual/UAT pass, not automated integration coverage | Connect an SSE client to `/api/events` (or equivalent) before and after the event-bus rewiring; diff the observed event stream for a representative stack status transition and a backup-triggered status write |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (event bus, job base classes, repositories test dir)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
