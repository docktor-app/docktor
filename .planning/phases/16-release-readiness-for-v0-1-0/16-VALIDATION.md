---
phase: "16"
slug: release-readiness-for-v0-1-0
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-11"
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 16-RESEARCH.md § Validation Architecture.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (server projects `unit` + `test/integration`; client vitest + testing-library), Playwright (client integration) |
| **Config file** | `server/vitest.config.ts`, `client/vitest.config.ts`, `client/playwright.config.ts` |
| **Quick run command** | `yarn workspace @docktor/server test:unit` / `yarn workspace @docktor/client test` |
| **Full suite command** | `yarn test && yarn test:integration && yarn typecheck` |
| **Estimated runtime** | ~120 seconds |

## Sampling Rate

- **After every task commit:** targeted vitest file(s) + `yarn typecheck`
- **After every plan wave:** `yarn workspace @docktor/server test:unit` and `yarn workspace @docktor/client test`; Playwright after the banner wave
- **Before `/gsd-verify-work`:** full suite green, multi-arch build green, rc-tag publish dry run
- **Max feedback latency:** 120 seconds

## Per-Task Verification Map

| Req | Behavior | Test Type | Automated Command | File Exists |
|-----|----------|-----------|-------------------|-------------|
| #7 | Required-var errors aggregated; warning rules fire/not fire | unit | `yarn workspace @docktor/server vitest run --project unit test/unit/lib/environment-check.test.ts` | ❌ W0 |
| #7 | Bootstrap exits 1 on errors, logs warnings otherwise; no early `lib/auth.ts` import | unit | `... test/unit/lib/startup-environment.test.ts` + architecture test | ❌ W0 |
| #7 | `GET /api/settings/environment` auth + shape | integration | `yarn workspace @docktor/server test:integration` | ❌ W0 |
| #7 | Hook dismissal by code; banner renders, dark classes | unit | `yarn workspace @docktor/client vitest run test/unit/hooks/use-environment-warnings.test.ts` | ❌ W0 |
| #7 | Existing specs unaffected; banner e2e | Playwright | `PLAYWRIGHT_PORT=5182 yarn workspace @docktor/client test:integration` | ❌ W0 |
| #11 | Clean-checkout multi-arch build; tags per D-05 | CI/manual | `docker buildx build --platform linux/amd64,linux/arm64 .`; rc tag dry run | ❌ |
| #42 | restic pinned, no apt-get | grep | `! grep -n "apt-get install.*restic" Dockerfile && grep -n "RESTIC_VERSION=0.19.1" Dockerfile` | ✅ |
| #17 | Docs site builds, no dead links | build | `npm run docs:build` (docks repo) | ❌ W0 |
| #54 | README assets exist | shell | `test -f docs/assets/docktor-demo.gif` | n/a |
| #55 | Community files + templates exist | shell | `ls CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md .github/ISSUE_TEMPLATE/*.yml .github/PULL_REQUEST_TEMPLATE.md` | n/a |
| #57 | MIT LICENSE | shell | `grep -q "^MIT License" LICENSE` | n/a |

## Wave 0 Requirements

- [ ] server unit tests: environment-check, startup-environment, environment-status-service, architecture import-order
- [ ] `server/test/integration/environment-status.test.ts`
- [ ] client hook + banner unit tests; `fixtures.ts` default stub + `environment-banner.spec.ts`
- [ ] `docks` repo scaffold with `docs:build`

## Manual-Only Verifications

| Behavior | Req | Why Manual | Instructions |
|----------|-----|------------|--------------|
| GHCR package public, rc tag publishes | #11 | needs maintainer GitHub settings | cut `v0.1.0-rc.1`, set package Public |
| Private vulnerability reporting enabled | #55 | repo setting | enable in Security settings |
| #53 removed from milestone | #53 | issue metadata | `gh api repos/docktor-app/docktor/issues/53 --jq .milestone` → null |
| Screenshots/GIF recorded | #54 | needs running app | follow 16-RECORDING-SCRIPT.md |

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
