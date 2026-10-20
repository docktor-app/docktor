---
phase: "20"
slug: visual-consistency-dashboard-clarity-and-touch-targets
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-20"
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Full requirement-to-test map lives in `20-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 + jsdom + @testing-library/react (client unit); Vitest `unit` project (server); Playwright (e2e, CI only) |
| **Config file** | `client/vitest.config.ts`, `server/vitest.config.ts`, `client/playwright.config.ts` |
| **Quick run command** | `yarn workspace @docktor/client exec vitest run <file> --coverage.enabled=false` |
| **Full suite command** | `yarn test` (CI); Playwright + server integration run in GitHub Actions only |
| **Estimated runtime** | ~30 seconds per touched-directory run |

---

## Sampling Rate

- **After every task commit:** run the touched unit test file(s) with `--coverage.enabled=false`
- **After every plan wave:** run all `client/test/unit/**` for touched directories (+ `server --project unit` for the server plan)
- **Before `/gsd-verify-work`:** unit suites, server integration and Playwright (`chromium` + `mobile-chromium`) green in CI
- **Max feedback latency:** 60 seconds locally (no heavy local runs; see project memory)

---

## Per-Task Verification Map

Populated by the planner from `20-RESEARCH.md` § Phase Requirements -> Test Map (UI-02, UI-03, UI-04, UI-05, UI-08, UI-09, DASH-01, DASH-02, A11Y-01).

---

## Wave 0 Requirements

- [ ] `client/test/unit/lib/status-labels.test.ts` — UI-02
- [ ] `client/test/unit/components/common/data-table.test.tsx` — UI-08
- [ ] `client/test/unit/components/common/table-pagination.test.tsx` — A11Y-01
- [ ] `client/test/unit/components/common/form-layout.test.tsx` — UI-05
- [ ] `client/test/unit/components/domain/stack/stack-breadcrumb.test.tsx` — UI-09
- [ ] `client/test/unit/routes/dashboard-stat-cards.test.tsx` — DASH-01
- [ ] `server/test/unit/repositories/backup-repository.test.ts` — DASH-02
- [ ] `client/test/integration/visual-consistency.spec.ts` (+ touch-target cases in `mobile.spec.ts`) — UI-02/03/04/08/A11Y-01
- [ ] `scrollIntoView` optional-call guard for jsdom

---

## Manual-Only Verifications

All phase behaviors have automated verification (Playwright covers tab-bar scrollbar, font origin, touch targets, light/dark frame).

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
