---
phase: "15"
slug: access-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-10"
---

# Phase 15 — Validation Strategy

> Per-phase validation contract. Full requirement-to-test map lives in `15-RESEARCH.md` § Validation Architecture.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4 (server unit + integration, client jsdom), Playwright ^1.58 (E2E) |
| **Config file** | `server/vitest.config.ts`, client vitest config, `client/playwright.config.ts` |
| **Quick run command** | `yarn workspace @docktor/server vitest run --project unit <file>` / `yarn workspace @docktor/client vitest run <file>` |
| **Full suite command** | `yarn test` (CI); integration + Playwright in CI only |
| **Estimated runtime** | ~30 seconds (single-file quick run) |

## Sampling Rate

- **After every task commit:** the single relevant unit test file
- **After every plan wave:** server + client unit suites
- **Before `/gsd-verify-work`:** full CI green (unit, Testcontainers integration, Playwright, typecheck)
- **Max feedback latency:** 60 seconds locally; integration/E2E delegated to CI (no heavy local runs)

## Per-Task Verification Map

Populated by the planner from the map in `15-RESEARCH.md`; each task carries an `<automated>` command (local, light) and, where integration or Playwright coverage applies, a `<ci_verify>` command that runs only in GitHub Actions (user rule: no integration suites or full builds on the VPS).

| Plan / Task | Local `<automated>` | CI-only suites |
|-------------|---------------------|----------------|
| 15-01 T1 (tracer) | migration greps, `prisma validate` (placeholder DATABASE_URL), server unit: auth-config, auth, layering | `test/integration/auth-rate-limit.test.ts` |
| 15-01 T2 | shared `account.test.ts`; server unit: helpers/totp, auth-config, auth, layering | `test/integration/two-factor.test.ts`, `auth-rate-limit.test.ts` |
| 15-02 T1 (tracer) | shared `account.test.ts`; server unit: two-factor-policy, errors, auth-middleware, account-security-service, account-routes, repositories/index, layering | `account-security.test.ts`, `setup-wizard-flow.test.ts`, `stacks.test.ts` |
| 15-02 T2 | server unit: two-factor-policy, auth, auth-config, layering | `two-factor-sessions.test.ts`, `two-factor.test.ts`, `account-security.test.ts` |
| 15-03 T1 (tracer) | client unit: login-form, two-factor-step | Playwright `auth.spec.ts` (existing) |
| 15-03 T2 | client unit: rate-limit, auth-errors, login-form, two-factor-step | — |
| 15-04 T1 (tracer) | server unit: origin-guard, layering | `auth-csrf.test.ts` + every existing suite |
| 15-04 T2 | server unit: auth-config, auth-cookie-config, auth; stale-claim grep | `auth-cookies.test.ts`, `auth-cookies-https.test.ts` |
| 15-04 T3 | server unit: account-security-service, scripts/reset-two-factor, layering; docs greps | `two-factor-reset.test.ts`; human-check: reverse proxy + TRUST_PROXY |
| 15-05 T1 (tracer) | client unit: account-api, use-account-security, account-page, enroll-dialog, recovery-codes-panel, nav-user | — |
| 15-05 T2 | checkpoint (blocking-human package legitimacy, qrcode.react) | — |
| 15-05 T3 | client unit: enroll-dialog, recovery-codes-panel; dependency grep | `yarn install --immutable`, build; human-check: real authenticator scan, dark-mode QR |
| 15-06 T1 (tracer) | client unit: mandatory-two-factor-row, account-page, protected-route, api | full Playwright suite (default account-security stub) |
| 15-06 T2 | client unit: regenerate-codes-dialog, disable-two-factor-dialog, account-page, enroll-dialog | — |
| 15-06 T3 | `playwright test --list two-factor.spec.ts` | `two-factor.spec.ts` (chromium + mobile-chromium) |

Typecheck (`yarn typecheck`) and `yarn build` run in CI for every plan.

## Wave 0 Requirements

- [ ] `server/test/helpers/totp.ts` — TOTP code generator helper
- [ ] `server/test/integration/setup.ts` — `cleanDatabase()` deletes `rateLimit`; enrol/sign-in/second-session helpers
- [ ] New unit tests: two-factor-policy, auth-middleware, account-security-service, auth-config, origin-guard
- [ ] Opt-in env hook to run one integration file with rate limiting enabled

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real authenticator app scans QR and codes verify | #45 | Needs physical authenticator | Enrol on staging, scan QR, log in with app code |
| Behaviour behind real reverse proxy (`TRUST_PROXY`) | #46 | Topology-dependent | Deploy behind Traefik, confirm per-client IP limiting |

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
