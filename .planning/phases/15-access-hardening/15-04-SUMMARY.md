---
phase: 15-access-hardening
plan: 04
subsystem: auth
tags: [csrf, origin-guard, cookies, better-auth, two-factor-reset, fastify, docs]

requires:
  - phase: 15-access-hardening
    provides: "15-01 limiter config and trusted-origin resolver, 15-02 AccountSecurityRepository/Service and ForbiddenError(code)"
provides:
  - "Origin guard (createOriginGuard/decideOrigin/normalizeOrigin) refusing cross-origin state changes on every /api route outside /api/auth/ (D-14)"
  - "resolveUseSecureCookies: the Secure cookie flag follows the https scheme of BETTER_AUTH_URL, never NODE_ENV (D-15)"
  - "AccountSecurityService.resetTwoFactor(email) and the on-box reset-two-factor script (D-09)"
  - "Operator docs: TRUST_PROXY, Sign-in protection, Resetting two-factor authentication, Troubleshooting 12-14; corrected security summary and CONCERNS"
  - "GitHub issue #79 (email password reset), area:auth, Issue Type Feature"
affects: [15-05, 15-06]

actuals:
  tokens: 18500
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Pure decision function plus thin Fastify onRequest hook taking a structural request type (unit-testable without Fastify)"
    - "On-box CLI as composition root with lazy imports, kept off lib/db.js by a layering rule"

key-files:
  created:
    - server/src/lib/origin-guard.ts
    - server/src/scripts/reset-two-factor.ts
    - server/test/unit/lib/origin-guard.test.ts
    - server/test/unit/lib/auth-cookie-config.test.ts
    - server/test/unit/scripts/reset-two-factor.test.ts
    - server/test/integration/auth-csrf.test.ts
    - server/test/integration/auth-cookies.test.ts
    - server/test/integration/auth-cookies-https.test.ts
    - server/test/integration/two-factor-reset.test.ts
  modified:
    - server/src/app.ts
    - server/src/lib/auth.ts
    - server/src/lib/auth-config.ts
    - server/src/repositories/account-security-repository.ts
    - server/src/application/account-security-service.ts
    - server/test/unit/lib/auth-config.test.ts
    - server/test/unit/application/account-security-service.test.ts
    - server/test/unit/architecture/layering.test.ts
    - docs/deployment.md
    - docs/design.md
    - .env.example
    - .planning/codebase/CONCERNS.md

key-decisions:
  - "Guard rejects when an Origin header is present and not trusted/self, or when it is absent and Sec-Fetch-Site is not same-origin/none; requests with neither header pass (curl, scripts carry no ambient cookies)"
  - "The trusted-origin lookup (a settings read) only runs for unsafe /api requests that carry an Origin"
  - "Self origin is built from request.protocol and request.host, so the setup wizard and the SPA need no configuration"
  - "The reset script imports its dependencies lazily inside main(), so importing runResetTwoFactor in tests never opens a database connection"

patterns-established:
  - "Scripts under server/src/scripts reach data only through the repositories barrel (layering rule)"

requirements-completed: ["#46", "#45"]

duration: 2 sessions (interrupted by a rate limit)
completed: 2026-10-11
status: complete
plan_head_before: 9f337e5
plan_head_after: 827a7b35da6da3f5202a75d6562b4c6339c26d2f
commits: 3
---

# Phase 15 Plan 04: CSRF Origin guard, Secure-cookie derivation and on-box 2FA reset Summary

**A pure Origin guard now refuses cross-origin state changes on every Fastify route (better-auth already covers /api/auth/*), the Secure cookie flag follows the https scheme of BETTER_AUTH_URL instead of NODE_ENV, and operators get a one-command `reset-two-factor` script plus corrected security docs.**

## Performance

- **Tasks:** 3 of 3
- **Commits:** `0700373` (Task 1, tracer), `b91bffc` (Task 2), `827a7b3` (Task 3)

## Accomplishments

- Task 1 (tracer): `server/src/lib/origin-guard.ts` with `normalizeOrigin`, `decideOrigin`, `createOriginGuard`, `CROSS_ORIGIN_REJECTED_CODE`; registered as the first `onRequest` hook in `app.ts` with a shared `DEV_CLIENT_ORIGIN` for CORS and the guard. A hostile page, including one on another port of the same host, gets 403 `{"error":"Cross-origin request blocked","code":"CROSS_ORIGIN_REQUEST_REJECTED"}`. No CSRF token package was added.
- Task 2: `resolveUseSecureCookies` wired as `advanced.useSecureCookies`. `docs/design.md` security summary now describes the real CSRF mechanism, the auth mechanism and a Password reset row linking issue #79; CONCERNS.md marks both the rate-limiting and the CSRF entries as resolved with the actual mechanism and test files.
- Task 3: `AccountSecurityRepository.findUserIdByEmail/resetTwoFactor` (one `$transaction`: TwoFactor rows, `twoFactorEnabled=false`, all sessions, `trust-device-*` and `2fa-*` Verification rows), `AccountSecurityService.resetTwoFactor(email)`, `scripts/reset-two-factor.ts` (exit codes 0/1/2), layering rule for `scripts/`, deployment guide sections and `.env.example` entries.

## RESEARCH A4 (did the Fastify-route CSRF cases fail before the guard?)

Not observed. `auth-csrf.test.ts` was written first, but it is an integration suite (testcontainers Postgres) and may not run on this VPS (project rule: no integration tests locally). Instead the pure unit table `origin-guard.test.ts` was run RED (module missing) before the implementation, and a throwaway Fastify smoke script (since deleted) showed the guard returning 403 / 200 as expected for hostile, trusted, self and `Sec-Fetch-Site: same-site` requests. By inspection the pre-guard `buildApp()` had no Origin check on non-auth routes (only CORS off in production, which does not stop a cross-origin form POST), so A4 is expected to hold; the first CI run of `auth-csrf.test.ts` is the confirmation of the green side.

## Follow-up issue

[docktor-app/docktor#79](https://github.com/docktor-app/docktor/issues/79) "Let users reset a forgotten password by email", label `area:auth`, Issue Type set to Feature via the GraphQL mutation. No existing issue covered it (searched "password reset", "reset forgotten password", "forgot password", "reset password email"). Referenced from `docs/design.md` and `docs/deployment.md`.

## Verification

Run locally (targeted only, per the no-heavy-local-actions rule):

- `vitest run --project unit` for the whole server unit project: 125 files, 2047 tests passed (includes origin-guard, auth-config, auth-cookie-config, auth, account-security-service, reset-two-factor and layering).
- `tsc --noEmit -p server/tsconfig.json` clean; an ad hoc scratch tsconfig (removed, not committed) typechecked all new and changed test files including the five integration files.
- `tsx src/scripts/reset-two-factor.ts` with no argument prints the usage line and exits 2.
- Acceptance greps: `createOriginGuard` 2 and `DEV_CLIENT_ORIGIN` 4 in `app.ts`; no `@fastify/csrf-protection`; `useSecureCookies: resolveUseSecureCookies` 1 in `auth.ts`; 0 `NODE_ENV` inside `resolveUseSecureCookies`; `Fastify CSRF plugin` 0 in design.md and CONCERNS.md; `## Resetting two-factor authentication` heading and the `docker compose exec docktor node dist/server/scripts/reset-two-factor.js` command present; `TRUST_PROXY` in deployment.md and `.env.example`; 0 `resetTwoFactor` under `server/src/routes`; `$transaction` in the repository.

Skipped locally, left to GitHub Actions CI: `yarn workspace @docktor/server test:integration` for `auth-csrf`, `auth-cookies`, `auth-cookies-https`, `two-factor-reset` (written against the better-auth 1.4.18 source and existing helpers, never executed), the full `tsc --build`, and `yarn build` (proves `src/scripts` compiles into `dist`). The reverse-proxy human check in Task 3 (fail sign-in 6 times behind a proxy with `TRUST_PROXY=1`, then sign in from a second machine) is a UAT item and was not performed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree started on a stale base and had no node_modules**
- **Found during:** startup
- **Issue:** HEAD predated the 15-01..15-03 merge; no `node_modules`, `shared/dist` or generated Prisma client.
- **Fix:** `git merge --ff-only 9f337e5`; an untracked, gitignored `node_modules` of symlinks to the main checkout (with `@docktor/*` pointing at this worktree); built `shared/dist`; ran `prisma generate`. Nothing from this setup is committed.

**2. [Rule 1 - Bug] Flaky unit test caused by a cold better-auth import**
- **Found during:** Task 3 full unit run
- **Issue:** `auth-cookie-config.test.ts` re-imports better-auth per case and exceeded the 5 s default timeout when the whole suite ran in parallel.
- **Fix:** `{timeout: 30_000}` on the describe (folded into the Task 3 commit `827a7b3`).

### Notes (not deviations)

- One unrelated pre-existing flake appeared once in a repeat full-suite run (`template-source-reader.test.ts`, "caps variants at MAX_VARIANTS_PER_REPO"), while a typecheck ran concurrently; it passed on every other run. Not touched.
- The password-reset issue was created during Task 2 (instead of Task 3) so the design.md row could carry the final link in one commit.
- The reset script composes `AccountSecurityService` from the repositories barrel with lazy `import()` calls inside `main()`; the plan's wording of a top-level composition was adapted so tests stay free of a database client.
- `.planning/WINDOWS.md` was not appended for the unrun integration suites (the `windows` helper is not available in this agent shell); the CI run is the verification.

### TDD note

Task 1: unit table RED before implementation (module missing); the integration suite was written first but not runnable locally. Task 2: `resolveUseSecureCookies` table run RED (12 failures) before implementation. Task 3: service and script tests run RED (2 service failures, script module missing) before implementation.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-15-23 to T-15-27 and T-15-31 are mitigated as specified (integration proofs await CI); T-15-28 to T-15-30 accepted and documented as planned.

## Self-Check: PASSED

- Files present: `server/src/lib/origin-guard.ts`, `server/src/scripts/reset-two-factor.ts`, the three new unit tests and four new integration tests listed in the frontmatter.
- Commits `0700373`, `b91bffc`, `827a7b3` exist on the branch (`git rev-list --count 9f337e5..HEAD` = 3 before this summary commit).
- `server/tsconfig.scratch.json` and the smoke script were deleted; `git status` clean apart from this summary.
