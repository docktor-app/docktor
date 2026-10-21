---
phase: "18"
slug: "import-and-migration-flow"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-14"
---

# Phase 18 — Validation Strategy

> Per-phase validation contract. Source: `18-RESEARCH.md` § Validation Architecture.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x (server `unit` project; client jsdom + Testing Library); Playwright for client integration (CI only) |
| **Config file** | `server/vitest.config.ts`, `client/vitest.config.ts` |
| **Quick run (server)** | `yarn workspace @docktor/server exec vitest run --project unit <file> --coverage.enabled=false` |
| **Quick run (client)** | `yarn workspace @docktor/client exec vitest run <file> --coverage.enabled=false` |
| **Full suite** | `yarn test` — CI only (no full tsc/integration/Playwright on the VPS) |
| **Estimated runtime** | ~20 seconds per targeted file |

## Sampling Rate

- **After every task commit:** the single targeted unit file for that task
- **After every plan wave:** all unit files touched in the wave (coverage disabled)
- **Before `/gsd-verify-work`:** CI green on full suite + Playwright `chromium` and `mobile-chromium`
- **Max feedback latency:** 30 seconds

## Per-Task Verification Map

| Requirement | Behavior | Test Type | Automated Command | File Exists |
|-------------|----------|-----------|-------------------|-------------|
| STK-03 | `containerVisiblePaths` identity + bind-mount mapping | unit | `server: test/unit/domain/self-stack-paths.test.ts` | ❌ W0 |
| STK-03 | Self-stack adapter fail-open | unit | `server: test/unit/infrastructure/docker-self-stack.test.ts` | ❌ W0 |
| STK-03 | `OnboardingService.scan` drops own stack only | unit | `server: test/unit/application/onboarding-service.test.ts` | ✅ extend |
| STK-03 | Scanner ignores `pre-migration-backup` | unit | `server: test/unit/infrastructure/brownfield-scanner.test.ts` | ✅ extend |
| MIG-01/02 | `previewMigration` returns `UnifiedDiff`; `generateDiff` removed | unit | `server: test/unit/application/migration-service.test.ts`, `compose-rewriter.test.ts` | ✅ rewrite |
| MIG-01/02 | Dialog width, diff view, masked env preview | component | `client: test/unit/routes/setup/migration-wizard.test.tsx`, `test/unit/lib/env-mask.test.ts` | ❌ W0 |
| MIG-03 | Backup opt-in/out semantics | unit + component | `migration-service.test.ts`, `migration-wizard.test.tsx` | ✅ / ❌ W0 |
| MIG-04 | Stop old stack, rollback restarts only if stopped | unit + component | `migration-service.test.ts`, `external-stack-control.test.ts`, `migration-wizard.test.tsx` | ✅ / ❌ W0 |
| D-12 | Shared `backup`/`stopOldStack` schemas | unit | shared schema test | ❌ W0 |

## Wave 0 Requirements

- [ ] `server/test/unit/domain/self-stack-paths.test.ts`
- [ ] `server/test/unit/infrastructure/docker-self-stack.test.ts`
- [ ] `server/test/unit/infrastructure/external-stack-control.test.ts`
- [ ] `client/test/unit/lib/env-mask.test.ts`
- [ ] `client/test/unit/routes/setup/migration-wizard.test.tsx`
- [ ] shared schema test for migration preview/execute schemas
- [ ] Rewrite `migration-service.test.ts` onto port fakes (drop `spawn` mock)

## Manual-Only Verifications

All phase behaviors have automated verification (end-to-end and 360px no-clipping via Playwright in CI).

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
