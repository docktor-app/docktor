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

Client commands run as `cd client && ../node_modules/.bin/vitest run --coverage.enabled=false <files>`; server commands as `cd server && ../node_modules/.bin/vitest run --project unit --coverage.enabled=false <files>`; Playwright specs are only collected locally (`../node_modules/.bin/playwright test --list <spec>`) and run in CI. Paths below are relative to `client/test/` unless prefixed with `server/`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | UI-02 | T-20-01 | labels are React text; inherited keys never hit the map | unit | `unit/lib/status-labels.test.ts unit/components/domain/stack/stack-status-badge.test.tsx unit/components/domain/stack/stack-list.test.tsx unit/routes/stacks/incident-list.test.tsx` | ❌ W0 (status-labels) / ✅ rewrite | ⬜ pending |
| 20-01-02 | 01 | 1 | UI-02 | T-20-01 | N/A | unit + e2e (CI) | `unit/lib/status-labels.test.ts unit/components/domain/stack/service-status-badge.test.tsx unit/components/domain/stack/stack-status-badge.test.tsx unit/routes/stacks/activity-timeline.test.tsx`; grep exact "running" in `stacks.spec.ts`, `mobile.spec.ts` | ✅ rewrite | ⬜ pending |
| 20-01-03 | 01 | 1 | UI-09 | T-20-02 | internal router links only | unit + e2e (CI) | `unit/components/domain/stack/stack-breadcrumb.test.tsx unit/routes/stacks/stack-detail-header.test.tsx unit/routes/stacks/backup-detail-page.test.tsx`; `grep -c UI-09 .planning/REQUIREMENTS.md` | ❌ W0 (stack-breadcrumb) | ⬜ pending |
| 20-02-01 | 02 | 1 | UI-08 | T-20-03 | no raw HTML rendering in the table module | unit | `unit/components/common/data-table.test.tsx` | ❌ W0 | ⬜ pending |
| 20-02-02 | 02 | 1 | UI-08 | T-20-04 | N/A | unit | `unit/components/common/data-table.test.tsx` | ❌ W0 | ⬜ pending |
| 20-02-03 | 02 | 1 | UI-08 | T-20-03 | N/A | unit | `unit/components/common/data-table.test.tsx` | ❌ W0 | ⬜ pending |
| 20-03-01 | 03 | 1 | A11Y-01, UI-08 | T-20-06 | N/A | unit + e2e (CI) | `unit/lib/touch-target.test.ts unit/components/common/table-pagination.test.tsx`; grep named buttons in `integration/components/data/table/data-table.spec.ts` | ❌ W0 | ⬜ pending |
| 20-03-02 | 03 | 1 | A11Y-01 | T-20-05 | ≥ 8px between adjacent 44px targets | unit | `unit/routes/stacks/stack-actions.test.tsx unit/components/common/theme-toggle.test.tsx` | ✅ extend | ⬜ pending |
| 20-04-01 | 04 | 1 | UI-05 | T-20-07 | validation unchanged | unit | `unit/components/common/form-layout.test.tsx unit/routes/auth/components/login-form.test.tsx` | ❌ W0 (form-layout) | ⬜ pending |
| 20-04-02 | 04 | 1 | UI-05 | T-20-07 | invalid signup never calls signUp | unit | `unit/routes/auth/components/signup-form.test.tsx unit/routes/auth/components/two-factor-step.test.tsx unit/routes/stacks/create-stack-page.test.tsx unit/routes/stacks/health-probe-form.test.tsx` | ❌ W0 (signup-form) | ⬜ pending |
| 20-04-03 | 04 | 1 | UI-05 | — | N/A | unit | `unit/routes/setup/setup-step-layout.test.tsx unit/routes/proxy-step.test.tsx unit/routes/setup/migration-wizard.test.tsx` | ❌ W0 (setup-step-layout) | ⬜ pending |
| 20-05-01 | 05 | 1 | UI-03 | T-20-08, T-20-SC | font URLs same-origin; package pinned 5.3.x, no postinstall | unit | `unit/styles/font-token.test.ts` | ❌ W0 | ⬜ pending |
| 20-05-02 | 05 | 1 | UI-03 | T-20-09 | values rendered as text in `code` | unit | `unit/components/domain/stack/deploy-warnings-alert.test.tsx unit/components/sidebar-version-block.test.tsx unit/components/app-sidebar.test.tsx` | ✅ update | ⬜ pending |
| 20-06-01 | 06 | 1 | UI-04 | T-20-10 | N/A | unit | `unit/routes/stacks/stack-tab-bar.test.tsx unit/routes/stacks/stack-detail-page.test.tsx` | ❌ W0 (stack-tab-bar) | ⬜ pending |
| 20-06-02 | 06 | 1 | UI-04 | T-20-10 | no crash without scrollIntoView | unit | `unit/routes/stacks/stack-tab-bar.test.tsx unit/routes/stacks/stack-detail-page.test.tsx` | ❌ W0 | ⬜ pending |
| 20-07-01 | 07 | 2 | DASH-01, DASH-02 | T-20-11, T-20-12, T-20-13 | boolean only; protected filter before merge; one port call per request | unit (server + client) | server `test/unit/application/stack-service.test.ts test/unit/architecture/layering.test.ts`; client `unit/lib/dashboard-stats.test.ts unit/routes/dashboard/dashboard-stat-cards.test.tsx` | ❌ W0 (dashboard-stat-cards) / ✅ extend | ⬜ pending |
| 20-07-02 | 07 | 2 | DASH-01, DASH-02, UI-03 | T-20-14 | fixed where clause, no input | unit + integration (CI) | server `test/unit/repositories/backup-repository.test.ts`; client `unit/components/common/stat-card.test.tsx unit/routes/dashboard/dashboard-stat-cards.test.tsx unit/lib/dashboard-stats.test.ts`; CI `server/test/integration/stacks.test.ts` | ❌ W0 (backup-repository) | ⬜ pending |
| 20-07-03 | 07 | 2 | DASH-02 | — | N/A | unit + e2e (CI) | `unit/hooks/use-stacks.test.ts`; grep "Backup Coverage" in `integration/stacks.spec.ts` | ✅ extend | ⬜ pending |
| 20-08-01 | 08 | 2 | UI-08 | — | N/A | unit | `unit/routes/storage/storage-backups-section.test.tsx unit/routes/storage/storage-page.test.tsx` | ✅ update | ⬜ pending |
| 20-08-02 | 08 | 2 | UI-08 | T-20-15 | encoded stack links | unit | `unit/routes/storage/storage-stacks-table.test.tsx unit/routes/storage/storage-page.test.tsx unit/lib/storage-view.test.ts` | ✅ extend | ⬜ pending |
| 20-08-03 | 08 | 2 | UI-08 | T-20-16 | restore needs confirmation | unit | `unit/routes/stacks/backup-history.test.tsx unit/routes/stacks/snapshots-section.test.tsx unit/components/domain/stack/env-editor.test.tsx unit/components/domain/stack/brownfield-import.test.tsx` | ❌ W0 (snapshots-section) | ⬜ pending |
| 20-09-01 | 09 | 2 | UI-08, A11Y-01, UI-03 | T-20-18 | delete only after confirm | unit | `unit/routes/settings/certificates-card.test.tsx unit/routes/settings/settings-page.test.tsx` | ✅ update | ⬜ pending |
| 20-09-02 | 09 | 2 | UI-05, UI-08 | T-20-17, T-20-19 | certificate content never rendered | unit | `unit/routes/settings/certificates-card.test.tsx unit/routes/settings/notification-log-card.test.tsx unit/routes/settings/settings-page.test.tsx` | ❌ W0 (notification-log-card) | ⬜ pending |
| 20-09-03 | 09 | 2 | UI-05 | T-20-20 | 2FA flows unchanged | unit | `unit/routes/stacks/backup-schedule-dialog.test.tsx unit/routes/stacks/proxy-assign-dialog.test.tsx unit/routes/account/enroll-dialog.test.tsx unit/routes/account/disable-two-factor-dialog.test.tsx unit/routes/account/regenerate-codes-dialog.test.tsx` | ✅ extend | ⬜ pending |
| 20-10-01 | 10 | 2 | UI-08, UI-03, UI-02 | T-20-21, T-20-22 | text rendering; upgrade gate unchanged | unit | `unit/routes/stacks/services-section.test.tsx unit/components/domain/stack/service-update-badge.test.tsx unit/routes/stacks/service-health-timeline.test.tsx` | ✅ update | ⬜ pending |
| 20-10-02 | 10 | 2 | UI-08, UI-03 | T-20-23 | remove needs confirmation | unit | `unit/routes/stacks/proxy-domains-table.test.tsx unit/routes/proxy-tab.test.tsx` | ✅ update | ⬜ pending |
| 20-10-03 | 10 | 2 | UI-08 | T-20-21 | text rendering | unit | `unit/routes/stacks/incident-list.test.tsx unit/routes/stacks/uptime-card.test.tsx unit/routes/stacks/stack-detail-page.test.tsx` | ✅ update | ⬜ pending |
| 20-11-01 | 11 | 3 | UI-02, UI-03 | T-20-24, T-20-25 | zero non-origin requests | e2e (CI) | `playwright test --list test/integration/visual-consistency.spec.ts` | ❌ W0 | ⬜ pending |
| 20-11-02 | 11 | 3 | UI-04, UI-08, A11Y-01 | T-20-25 | N/A | e2e (CI) + guard | `playwright test --list test/integration/visual-consistency.spec.ts test/integration/mobile.spec.ts`; `git grep -l "@/components/ui/table" -- client/src` | ❌ W0 / ✅ extend | ⬜ pending |
| 20-11-03 | 11 | 3 | — (UI-SPEC CTA copy) | — | N/A | unit | `unit/routes/stacks/stack-actions.test.tsx unit/routes/settings/settings-page.test.tsx unit/routes/stacks/config-tab.test.tsx` | ✅ update | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

New test files are written first (RED) inside the task that needs them; no separate Wave 0 plan.

- [ ] `client/test/unit/lib/status-labels.test.ts` — UI-02 (20-01-01)
- [ ] `client/test/unit/components/domain/stack/stack-breadcrumb.test.tsx` — UI-09 (20-01-03)
- [ ] `client/test/unit/components/common/data-table.test.tsx` — UI-08 (20-02-01)
- [ ] `client/test/unit/lib/touch-target.test.ts`, `client/test/unit/components/common/table-pagination.test.tsx` — A11Y-01 (20-03-01)
- [ ] `client/test/unit/components/common/form-layout.test.tsx`, `client/test/unit/routes/auth/components/signup-form.test.tsx`, `client/test/unit/routes/setup/setup-step-layout.test.tsx` — UI-05 (20-04)
- [ ] `client/test/unit/styles/font-token.test.ts` — UI-03 (20-05-01)
- [ ] `client/test/unit/routes/stacks/stack-tab-bar.test.tsx` — UI-04 (20-06-01)
- [ ] `client/test/unit/routes/dashboard/dashboard-stat-cards.test.tsx` — DASH-01 (20-07-01)
- [ ] `server/test/unit/repositories/backup-repository.test.ts` — DASH-02 (20-07-02)
- [ ] `client/test/unit/routes/stacks/snapshots-section.test.tsx` — UI-08 (20-08-03)
- [ ] `client/test/unit/routes/settings/notification-log-card.test.tsx` — UI-08 (20-09-02)
- [ ] `client/test/integration/visual-consistency.spec.ts` (+ `44px touch targets (A11Y-01)` in `mobile.spec.ts`) — UI-02/03/04/08/A11Y-01 (20-11)
- [ ] `scrollIntoView` optional-call guard for jsdom (20-06-02; no global stub in `test/setup.ts`)

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
