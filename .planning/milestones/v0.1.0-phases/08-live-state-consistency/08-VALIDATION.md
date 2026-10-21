---
phase: "08"
slug: "live-state-consistency"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-09-13"
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (server: `vitest run` / `--project unit` / `--project test/integration`; client unit: Vitest + `@testing-library/react` + jsdom); Playwright for client e2e (hermetic — cannot exercise live SSE, see Common Pitfalls #2 in RESEARCH.md) |
| **Config file** | `server/vitest.config.ts`, `client/vitest.config.ts`, `client/playwright.config.ts` |
| **Quick run command** | `yarn workspace @docktor/server test:unit` / `yarn workspace @docktor/client test` |
| **Full suite command** | `yarn test` (root, `yarn workspaces foreach -A run test`) |
| **Estimated runtime** | ~60-90 seconds (unit tiers only) |

---

## Sampling Rate

- **After every task commit:** Run the task's own `<automated>` command (all 7 tasks across the phase's 4 plans carry one)
- **After every plan wave:** Run `yarn test`
- **Before `/gsd-verify-work`:** Full suite must be green, plus manual items closed via live human UAT
- **Max feedback latency:** ~90 seconds (unit suite)

---

## Per-Task Verification Map

This table was reconstructed against the phase's actual, current plan set (08-01 through 08-04 — the original draft referenced stale task IDs from an earlier planning iteration and did not match any PLAN.md on disk).

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-T1 | 01 | 1 | UI-SPEC: maintenance-state badge `animate-pulse` (tracer) | unit (TDD) | `yarn workspace @docktor/client test test/unit/components/domain/stack/stack-status-badge.test.tsx` | ✅ | ✅ green |
| 08-01-T2 | 01 | 1 | Diagnostic: live-reachability probe for six stranded verification items (handed to UAT) | automated (docker/TCP probe) | `docker info`; raw Postgres SSLRequest probe against loopback + bridge address | ✅ (evidence in 08-01-SUMMARY.md) | ✅ recorded |
| 08-01-T3 | 01 | 1 | Close 3 stale todos, make STATE.md accurate | automated (grep on STATE.md) | inline grep checks | ✅ | ✅ green |
| 08-02-T1 | 02 | 1 | Closes G-08-2 (server half) — tag `config_changed` broadcasts with `source: "app"\|"external"` | unit (TDD, RED→GREEN) | `yarn workspace @docktor/server test test/unit/jobs/file-watcher.test.ts test/unit/application/stack-service.test.ts` | ✅ | ✅ green |
| 08-02-T2 | 02 | 1 | Closes G-08-6 (blocker) + compounding bug — guard `updateStack`'s compose parse, sync env hash | unit (TDD, RED→GREEN) | `yarn workspace @docktor/server test test/unit/application/stack-service.test.ts`; `test:unit`; `yarn typecheck` | ✅ | ✅ green (721 passed) |
| 08-03-T1 | 03 | 1 | Closes G-08-2 (client half) — gate "changed externally" toast on `event.source` | unit (TDD, RED→GREEN) | `yarn workspace @docktor/client test test/unit/hooks/use-stack.test.ts test/unit/hooks/use-stack-events.test.ts`; `test:unit`; `yarn typecheck` | ✅ | ✅ green (17/17, 11/11) |
| 08-04-T1 | 04 | 1 | Closes G-08-7 (cosmetic) — promote `BACKING_UP` to blue+pulse per live V7 answer | unit (TDD, RED→GREEN) | `yarn workspace @docktor/client test test/unit/components/domain/stack/stack-status-badge.test.tsx`; `test:unit`; `yarn typecheck` | ✅ | ✅ green (24/24) |

*Status: ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity:** No 3 consecutive tasks lack an `<automated>` command — every task in every plan (08-01 through 08-04) has one. Nyquist requirement satisfied without gaps; no auditor dispatch or generated test files were needed.

---

## Wave 0 Requirements

All satisfied — `client/test/unit/components/domain/stack/stack-status-badge.test.tsx` existed from plan 08-01 and was extended (not recreated) by plan 08-04 for the `BACKING_UP` color promotion.

---

## Manual-Only Verifications

All four items below were originally hermetic-Playwright-unreachable (real SSE / real filesystem watcher required — see RESEARCH.md Pitfall 2) and were **closed via live human UAT** recorded in `08-UAT.md`, after the three code gaps below were fixed by this phase's gap-closure plans:

| Behavior | Requirement | UAT Test | Result |
|----------|-------------|----------|--------|
| Deploy/update badge visible live in a second browser tab without reload | manual-actions-dont-broadcast-sse | V1 | pass |
| Compose/env save in tab A does not spuriously show "changed externally" toast in tab B (G-08-2) | env-file-changes-dont-flag-config-changed | V2 | pass (after 08-02/08-03 fix; originally `issue`, major) |
| Backup badge live round-trip with pulse | manual-actions-dont-broadcast-sse | V3, V4 | pass |
| config-changed badge on external `.env` edit, no reload | env-file-changes-dont-flag-config-changed | V5 | pass |
| config_error red indicator on YAML syntax error, no 500 on save (G-08-6) | config-error-ui-indication-missing | V6 | pass (after 08-02 fix; originally `issue`, blocker) |
| `BACKING_UP` badge color judgement (G-08-7) | UI-SPEC live answer | V7 | pass (after 08-04 fix; originally `issue`, cosmetic) |

V8 (Deploy button clickability during UPDATING/MIGRATING) was explicitly deferred by the user to a follow-up todo — out of this phase's scope, not a validation gap.

---

## Validation Audit 2026-09-20

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 (none needed — all 7 tasks across 4 plans already carry automated verify commands) |
| Escalated | 0 |

Reconstructed the Per-Task Map against the phase's actual current plan set (the prior draft referenced non-existent task IDs from a stale planning iteration). Cross-referenced the three UAT gaps (G-08-2, G-08-6, G-08-7) against their closing plans (08-02, 08-03, 08-04) and confirmed each has RED→GREEN TDD commits with passing tests. Confirmed the post-merge full-suite run (5 unrelated files failed under host contention — load average 20-33 on the sampling host, verified pre-existing via isolated re-run: all 45 tests in those 5 files pass 45/45 when run without contention) does not implicate any file this phase's plans touched.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none — Wave 0 file already existed)
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-09-20
