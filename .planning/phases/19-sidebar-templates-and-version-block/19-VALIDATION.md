---
phase: "19"
slug: "sidebar-templates-and-version-block"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-18"
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `19-RESEARCH.md` § Validation Architecture.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4 + jsdom 28 + @testing-library/react 16 (unit); Playwright (e2e, CI only) |
| **Config file** | `client/vitest.config.ts`, `client/playwright.config.ts` |
| **Quick run command** | `yarn workspace @docktor/client exec vitest run --coverage.enabled=false <test file>` |
| **Full suite command** | `yarn test:unit` (CI); `yarn test:integration` (CI only) |
| **Estimated runtime** | ~5 s per single file; full suite in CI |

## Sampling Rate

- **After every task commit:** single-file vitest run for touched files (no `tsc --build`, no Playwright locally — VPS rule)
- **After every plan wave:** CI (`yarn typecheck`, `yarn test:unit`, `yarn test:integration`)
- **Before `/gsd-verify-work`:** CI green
- **Max feedback latency:** 30 seconds locally

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-xx-xx | TBD | TBD | UI-06 | — | N/A | unit | `vitest run test/unit/lib/sidebar-nav.test.ts` | ❌ W0 | ⬜ pending |
| 19-xx-xx | TBD | TBD | UI-06 | — | N/A | component | `vitest run test/unit/components/app-sidebar.test.tsx` | ❌ W0 | ⬜ pending |
| 19-xx-xx | TBD | TBD | UI-01 | T-19 external links | `rel` contains `noopener` | unit | `vitest run test/unit/lib/app-version.test.ts test/unit/lib/project-links.test.ts` | ❌ W0 | ⬜ pending |
| 19-xx-xx | TBD | TBD | UI-01 | T-19 external links | `target=_blank` + `noopener noreferrer` | component | `vitest run test/unit/components/sidebar-version-block.test.tsx` | ❌ W0 | ⬜ pending |
| 19-xx-xx | TBD | TBD | UI-07 | — | N/A | component | `vitest run test/unit/routes/stacks/templates-page.test.tsx` | ✅ extend | ⬜ pending |
| 19-xx-xx | TBD | TBD | UI-01/06/07 | — | N/A | e2e (CI) | `sidebar.spec.ts`, `templates.spec.ts`, `mobile.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

- [ ] `client/test/unit/lib/sidebar-nav.test.ts` — UI-06
- [ ] `client/test/unit/lib/app-version.test.ts`, `project-links.test.ts` — UI-01
- [ ] `client/test/unit/components/app-sidebar.test.tsx` — UI-06
- [ ] `client/test/unit/components/sidebar-version-block.test.tsx` — UI-01
- [ ] `client/test/integration/sidebar.spec.ts` and `mobile.spec.ts` additions — UI-01/06/07
- [ ] `client/src/globals.d.ts` (`declare const __APP_VERSION__`) — needed for CI `tsc`

## Manual-Only Verifications

All phase behaviors have automated verification (visibility/overflow/44px targets via Playwright in CI).

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
