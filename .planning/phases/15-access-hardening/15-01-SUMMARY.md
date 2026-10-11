---
phase: 15-access-hardening
plan: 01
subsystem: auth
tags: [better-auth, totp, two-factor, rate-limit, prisma, fastify, zod]

requires:
  - phase: 05-onboarding
    provides: better-auth instance, setup wizard that creates the first user
provides:
  - TwoFactor and RateLimit Prisma models, User.twoFactorEnabled, generated migration
  - DB-backed better-auth rate limiter (5 per 15 min on sign-in and 7 other strict auth paths) keyed by an unforgeable client IP
  - TRUST_PROXY parsing (default off) feeding Fastify trustProxy
  - twoFactor plugin (TOTP, 10 single-use recovery codes, 30-day trust device, password re-entry)
  - closed reset/OTP/TOTP-URI endpoints (404)
  - shared Zod schemas for the 2FA code forms and password confirmation
  - integration helpers (TEST_ORIGIN, extractCookie, signIn, enrollTwoFactor) and RFC 6238 test helper
affects: [15-02, 15-03, 15-04, 15-05, 15-06]

actuals:
  tokens: 10800
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Pure auth configuration helpers in lib/auth-config.ts, unit-tested, consumed by lib/auth.ts and app.ts"
    - "Private client-IP header stamped from request.ip on every /api/auth request, the only header better-auth trusts"
    - "Rate-limit integration tests opt in with DOCKTOR_AUTH_RATE_LIMIT=on set inside vi.hoisted"

key-files:
  created:
    - server/prisma/schema/two-factor.prisma
    - server/prisma/schema/rate-limit.prisma
    - server/prisma/migrations/20261011102429_add_two_factor_and_rate_limit/migration.sql
    - server/src/lib/auth-config.ts
    - shared/src/validation/account.ts
    - shared/test/unit/validation/account.test.ts
    - server/test/helpers/totp.ts
    - server/test/unit/helpers/totp.test.ts
    - server/test/unit/lib/auth-config.test.ts
    - server/test/integration/auth-rate-limit.test.ts
    - server/test/integration/two-factor.test.ts
  modified:
    - server/prisma/schema/auth.prisma
    - server/src/lib/auth.ts
    - server/src/routes/auth.ts
    - server/src/app.ts
    - shared/src/validation/index.ts
    - server/test/unit/lib/auth.test.ts
    - server/test/integration/setup.ts
    - .planning/WINDOWS.md

key-decisions:
  - "Migration generated via Branch B (prisma migrate diff against a scratch copy of HEAD's schema), never hand-edited; not applied to a live database"
  - "Limiter is off under NODE_ENV=test unless DOCKTOR_AUTH_RATE_LIMIT=on, so existing integration suites keep passing unmodified"
  - "Strict budget covers 8 exact paths (adds /verify-password to the 7 named in RESEARCH); no wildcard rules"
  - "AuthUser / AuthSession types exported from lib/auth.ts for 15-02"
  - "session.cookieCache deliberately left unconfigured (off) with a comment citing GHSA-xg6x-h9c9-2m83"

patterns-established:
  - "Cookie-bearing /api/auth test requests must carry Origin: TEST_ORIGIN because the origin check now runs under NODE_ENV=test"
  - "extractCookie returns null for cleared cookies (empty value) and takes the last Set-Cookie for a name"

requirements-completed: ["#45", "#46"]

duration: 12min
completed: 2026-10-11
status: complete
plan_head_before: 9836e35f46f44b92f25997642fec26222bfa8e93
plan_head_after: 057c6324792ce0e9880058861e91785a28938527
commits: 2
---

# Phase 15 Plan 01: Rate limiting and TOTP two-factor baseline Summary

**better-auth's DB-backed limiter (5 sign-ins per 15 min per unforgeable client IP) plus the twoFactor plugin with TOTP, single-use recovery codes and a 30-day trusted-device cookie, with the unused reset/OTP/URI endpoints closed.**

## Performance

- **Duration:** about 12 min
- **Tasks:** 2 of 2
- **Commits:** 2 task commits (`0977e06`, `057c632`)

## Accomplishments

- Task 1 (tracer): `TwoFactor` and `RateLimit` models, `User.twoFactorEnabled`, generated migration, pure `lib/auth-config.ts` (`CLIENT_IP_HEADER`, `parseTrustProxy`, `isAuthRateLimitEnabled`, `buildRateLimitConfig`, strict-path constants), `routes/auth.ts` overwriting `x-docktor-client-ip` from `request.ip`, Fastify `trustProxy` from `TRUST_PROXY` (default off), limiter config in `lib/auth.ts`. Integration suite `auth-rate-limit.test.ts` covers 429 + `X-Retry-After`, persisted counter row, spoofed `X-Forwarded-For` / forged header, `TRUST_PROXY=1` separation of two clients, and counting of successful sign-ins.
- Task 2: `twoFactor({issuer: "Docktor", trustDeviceMaxAge: 2592000})`, `disabledPaths` for `/two-factor/send-otp`, `/two-factor/verify-otp`, `/two-factor/get-totp-uri`, `/request-password-reset`, `/reset-password`, `advanced.disableOriginCheck: false`, `AuthUser`/`AuthSession` types. Shared `account.ts` schemas, `totpFromUri()` test helper, and `two-factor.test.ts` covering enrollment, the second step, recovery codes (single use), trusted device, wrong-password rejection, closed endpoints and the absence of a recovery-code viewer. `auth-rate-limit.test.ts` gained the wrong-TOTP brute-force case.

## Cookie names (for 15-03 and 15-05)

Derived from the better-auth 1.4.18 source (`createAuthCookie`, prefix `better-auth`, no `__Secure-` prefix over plain http). NOT observed in a live run, because integration tests were not run locally (see Verification). CI will confirm them:

- Session: `better-auth.session_token`
- Pending second step (10 min): `better-auth.two_factor`
- Trusted device (Max-Age 2592000): `better-auth.trust_device`

Other facts 15-02 to 15-06 should rely on: sign-in for a 2FA user clears the session cookie in the same response (`better-auth.session_token=` with an empty value, which `extractCookie` maps to null); `enable` does not re-issue the session (only the confirming `verify-totp` does); every cookie-bearing POST to `/api/auth/*` now needs an `Origin` in trustedOrigins in all environments.

## Migration path

Branch B: HEAD's schema copied to a scratch directory, `prisma migrate diff --from-schema <scratch> --to-schema server/prisma/schema --script`, output saved unedited as `server/prisma/migrations/20261011102429_add_two_factor_and_rate_limit/migration.sql`, then `prisma generate`. The SQL creates `TwoFactor`, `RateLimit` (unique `key`, `BIGINT lastRequest`), adds `User.twoFactorEnabled BOOLEAN DEFAULT false`, the index and the cascading foreign key. An unrun-verify entry was appended to `.planning/WINDOWS.md`.

## Verification

Run locally (targeted only, per the no-heavy-local-actions rule):

- `vitest run --project unit` for `auth-config.test.ts` (20), `auth.test.ts` (12), `totp.test.ts` (4), `layering.test.ts` (155): 191 passed.
- `shared` full unit suite: 152 passed (includes the new 15 account schema tests).
- `tsc --noEmit` on `server/src` (clean) and an ad hoc typecheck including all new/changed test files (clean, scratch tsconfig removed).
- `prisma validate`: valid. `prisma generate`: ok.
- Acceptance greps from the plan all return the expected counts (CLIENT_IP_HEADER 2, parseTrustProxy 2, buildRateLimitConfig 2, no `@fastify/rate-limit`, no `viewBackupCodes` in `server/src`, etc.).

Skipped locally, left to GitHub Actions CI (user rule: no integration suites or full `tsc --build` on the VPS):

- `yarn workspace @docktor/server test:integration` for `auth-rate-limit.test.ts` and `two-factor.test.ts`, and the whole existing integration suite (proves the NODE_ENV=test limiter default and the now-active origin check do not break existing suites).
- `yarn typecheck` / `tsc --build` across workspaces.

The integration tests were written against the better-auth 1.4.18 source but have never been executed; treat their first CI run as the real verification.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree started on a stale base**
- **Found during:** startup
- **Issue:** the worktree HEAD (`f7e4805`) predated the Phase 15 planning commits, so the PLAN did not exist on disk.
- **Fix:** fast-forwarded the (clean, commit-free) worktree branch to `9836e35` with `git merge --ff-only`.
- **Files modified:** none (only branch pointer)

**2. [Rule 3 - Blocking] No node_modules in the worktree**
- **Issue:** targeted tests could not run.
- **Fix:** created an untracked, gitignored `node_modules` of symlinks to the main checkout's packages (with `@docktor/*` pointing at the worktree's workspaces) and ran vitest/tsc directly; regenerated the gitignored Prisma client and `shared/dist` locally. Nothing from this setup is committed.

**3. [Rule 3 - Blocking] Extended `createTestUser()` in Task 1 instead of Task 2**
- **Issue:** Task 1's rate-limit test needs the user's email and password, which the plan lists under Task 2's helper work.
- **Fix:** returned `{cookie, email, password}` from `createTestUser()` in Task 1; the remaining helpers (`TEST_ORIGIN`, `extractCookie`, `signIn`, `enrollTwoFactor`) landed in Task 2 as planned.

**4. [Rule 2 - Missing critical] Extra test-only helpers and cases**
- Added `getSetCookies` and cookie-name constants to `setup.ts`, and a test asserting `/two-factor/view-backup-codes` answers 404 (backs the "no endpoint returns recovery codes" prohibition).

### Deferred / not done

- The plan's `<verify>` item for Task 1 that greps the migration SQL and runs `prisma validate` were run; the live-database apply was not (recorded in the windows ledger).
- The TDD RED run for Task 2's totp helper and shared schemas was written test-first but the implementation was created before the first run of those two files; the auth-config/auth unit tests were run RED before implementation in Task 1.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model. T-15-01 to T-15-07 are mitigated as specified; T-15-08 and T-15-09 accepted as planned.

## Issues Encountered

None blocking. The worktree Bash guard rejected compound commands and heredocs, so file edits used the Edit/Write tools.

## Self-Check: PASSED

- Files confirmed present: both Prisma model files, the migration SQL, `auth-config.ts`, `account.ts`, `totp.ts`, and the four new test files.
- Commits `0977e06` and `057c632` exist on the branch (`git rev-list --count 9836e35..HEAD` = 2).
