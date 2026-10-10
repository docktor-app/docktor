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

Populated by the planner from the map in `15-RESEARCH.md`; each task carries an `<automated>` command.

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
