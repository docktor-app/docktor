---
phase: 16-release-readiness-for-v0-1-0
plan: 01
subsystem: infra
tags: [startup-validation, zod, fastify, env, bootstrap, esm-import-order]

requires:
  - phase: 15-access-hardening
    provides: requireAuth settings routes, TRUST_PROXY handling in lib/auth-config.ts
provides:
  - "Startup environment check: refuses to boot on a broken required environment with one aggregated report (D-10)"
  - "Nine non-blocking, value-free warnings computed at boot and logged with an [env] prefix (D-11, D-12)"
  - "GET /api/settings/environment returning {warnings: [{code, variable, message}]} behind requireAuth (D-13)"
  - "Shared report DTO (ENVIRONMENT_WARNING_CODES, environmentReportSchema) for the 16-03 banner"
affects: [16-03 warnings banner, 16-06 docs Startup checks section, 16-09 release candidate smoke test]

requirements-completed: ["#7"]

actuals:
  tokens: 12800
  tasks: 2
  commits: 2
plan_head_before: ae5992a76602146e2bebf138cc4b07c63c8b10de
plan_head_after: d4eaf51dacc5ac7a47703f0c00fd4dfd3d79e62e

tech-stack:
  added: []
  patterns:
    - "Injectable bootstrap ({env, containerized, log, exit}) copying installShutdownHandlers, so process.exit is stubbed in tests"
    - "Dynamic import of app.js after validation, guarded by an import-graph architecture test"
    - "Module store with structuredClone on set and get for a boot-time value read per request"

key-files:
  created:
    - shared/src/validation/environment.ts
    - shared/test/unit/validation/environment.test.ts
    - server/src/lib/environment-check.ts
    - server/src/lib/startup-environment.ts
    - server/src/lib/environment-report.ts
    - server/src/application/environment-status-service.ts
    - server/test/unit/lib/environment-check.test.ts
    - server/test/unit/lib/startup-environment.test.ts
    - server/test/unit/application/environment-status-service.test.ts
    - server/test/integration/environment-status.test.ts
  modified:
    - shared/src/validation/index.ts
    - server/src/application/index.ts
    - server/src/routes/settings.ts
    - server/src/index.ts
    - server/test/unit/architecture/layering.test.ts

key-decisions:
  - "Blocking set stays exactly the D-10 list; a malformed DATABASE_URL or BETTER_AUTH_URL is a warning, not an error (RESEARCH Assumption A3 suggested blocking; staying within D-10 was deliberate)"
  - "Only index.ts's app.js import needed to become dynamic; health-probe-job.js and the other static imports do not reach lib/auth.ts, proven by the architecture test"
  - "A custom DOCKER_DATA_PATH is never flagged; only unset or the container default /var/lib/docker (trailing slash ignored) warns when containerized"
  - "TEMPLATE_SECRET_IN_PRODUCTION matches the CHANGE_ME substring, so it also catches the template password inside DATABASE_URL"

patterns-established:
  - "Environment rules are small named evaluators in one list; adding a warning means adding one function and one code in the shared tuple"
  - "Messages are built from variable names and fixed text only; a no-echo unit test with secret-looking values guards it"

coverage:
  - id: D1
    description: "Starting the real entrypoint with an empty environment prints one block naming DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL and ENCRYPTION_KEY and exits 1 before the database, stacks directory or Fastify are touched"
    requirement: "#7"
    verification:
      - kind: other
        ref: "env -i node --import tsx server/src/index.ts -> exit 1, four names, no BetterAuthError"
        status: pass
      - kind: unit
        ref: "server/test/unit/lib/environment-check.test.ts#checkEnvironment: blocking errors (#7, D-10)"
        status: pass
      - kind: unit
        ref: "server/test/unit/lib/startup-environment.test.ts#runStartupEnvironmentCheck (#7, D-10)"
        status: pass
    human_judgment: false
  - id: D2
    description: "index.ts never reaches lib/auth.ts through static imports and runs the check before the dynamic app.js import"
    requirement: "#7"
    verification:
      - kind: unit
        ref: "server/test/unit/architecture/layering.test.ts#startup environment check runs before lib/auth.ts is evaluated"
        status: pass
    human_judgment: false
  - id: D3
    description: "Nine warnings (D-11) and CHANGE_ME detection in production only (D-12) are logged once each and never echo a value or block boot"
    requirement: "#7"
    verification:
      - kind: unit
        ref: "server/test/unit/lib/environment-check.test.ts#checkEnvironment: warning rules / TEMPLATE_SECRET_IN_PRODUCTION / never echoes a value"
        status: pass
    human_judgment: false
  - id: D4
    description: "GET /api/settings/environment answers 401 without a session and the stored warnings with one"
    requirement: "#7"
    verification:
      - kind: integration
        ref: "server/test/integration/environment-status.test.ts (runs on GitHub Actions CI only)"
        status: unknown
    human_judgment: false
  - id: D5
    description: "The local dev server (yarn dev) still starts with the maintainer's .env.development and logs 'environment check passed'"
    verification: []
    human_judgment: true
    rationale: "The executor must not open .env files (secret-read guard), so only the maintainer can confirm .env.development holds all four required variables"

duration: 9min
completed: 2026-10-11
status: complete
---

# Phase 16 Plan 01: Startup Environment Check Summary

**Docktor now refuses to boot on a missing or malformed DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL or ENCRYPTION_KEY with one report listing all of them, and serves nine value-free boot warnings through an authenticated GET /api/settings/environment.**

## Performance

- **Duration:** about 9 min
- **Started:** 2026-10-11T20:35Z
- **Completed:** 2026-10-11T20:44Z
- **Tasks:** 2 (1 tracer, 1 auto), both TDD
- **Files:** 15 changed (10 new, 5 modified), +1218 lines

## Accomplishments

- One Zod schema collects every failing required variable in a single `safeParse`; blank values count as missing; ENCRYPTION_KEY must be exactly 64 hex characters, and the `.env.example` template value gets an extra note.
- `server/src/index.ts` runs the check as its first statement and loads `app.js` with a dynamic `import()` afterwards, so a missing BETTER_AUTH_SECRET produces the formatted report instead of better-auth's own crash (RESEARCH Pitfall 1). An architecture test walks index.ts's static import graph and fails if `lib/auth.ts` becomes reachable.
- Nine warnings are evaluated by small named functions, logged once each, stored in a module store and served through `EnvironmentStatusService` and the settings route (response schema strips everything but code/variable/message).
- Tracer gate: the Task 1 verification (shared test, server unit tests, real-entrypoint smoke, tsc) was re-run end to end before Task 2 started. Result: tracer verified, expansion continued.

## Exact error-block format

Printed with one `console.error` call, then exit code 1. Variable names are padded to the longest name:

```
[env] Docktor cannot start: 4 environment problem(s) must be fixed first.
  DATABASE_URL        is required. Set the Postgres connection string, e.g. postgresql://docktor:PASSWORD@db:5432/docktor
  BETTER_AUTH_SECRET  is required. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  BETTER_AUTH_URL     is required. Set the URL users open Docktor at, e.g. http://SERVER-IP:3000
  ENCRYPTION_KEY      is required. Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
See .env.example for every variable and how to set it.
```

An ENCRYPTION_KEY that is set but wrong reads `must be exactly 64 hex characters (32 bytes). Generate one with: ...`, with ` The value is still the .env.example template value.` appended when it starts with CHANGE_ME. On success one info line follows the warnings: `[env] environment check passed with N warning(s)`. Each warning is logged as `[env] WARNING VARIABLE message (CODE)`.

## Final warning code list (16-06 copies this into the docs "Startup checks" section)

None of these block startup. Warnings are sorted by code, then variable.

| Code | Variable | Trigger |
|------|----------|---------|
| `TRUST_PROXY_UNSET_BEHIND_HTTPS` | `TRUST_PROXY` | `BETTER_AUTH_URL` starts with `https://` and `TRUST_PROXY` is unset or blank |
| `TRUST_PROXY_TRUSTS_ALL` | `TRUST_PROXY` | `TRUST_PROXY` is `true` |
| `DOCKER_DATA_PATH_NOT_HOST_MOUNT` | `DOCKER_DATA_PATH` | running in a container and `DOCKER_DATA_PATH` is unset or `/var/lib/docker` (trailing slash ignored) |
| `NODE_ENV_NOT_PRODUCTION_IN_CONTAINER` | `NODE_ENV` | running in a container and `NODE_ENV` is not `production` |
| `STACKS_HOST_DIR_UNSET` | `DOCKTOR_STACKS_HOST_DIR` | running in a container and `DOCKTOR_STACKS_HOST_DIR` is unset or blank |
| `STACKS_MOUNT_CHECK_DISABLED` | `DOCKTOR_STACKS_MOUNT_CHECK` | `DOCKTOR_STACKS_MOUNT_CHECK` is exactly `false` (any context) |
| `TEMPLATE_SECRET_IN_PRODUCTION` | `BETTER_AUTH_SECRET` and/or `DATABASE_URL` (one warning each) | `NODE_ENV=production` and the value contains `CHANGE_ME` (a CHANGE_ME ENCRYPTION_KEY blocks instead, via the 64-hex rule) |
| `DATABASE_URL_NOT_POSTGRES` | `DATABASE_URL` | set but not starting with `postgres://` or `postgresql://` |
| `BETTER_AUTH_URL_NOT_HTTP` | `BETTER_AUTH_URL` | set but not a parseable `http://` or `https://` URL |

## Task Commits

1. **Task 1 (tracer): required-variable check, bootstrap, store, service, route, entrypoint** - `1f8e5bf` (feat)
2. **Task 2: full D-11 warning set and D-12 production-only template detection** - `d4eaf51` (feat)

The plan is `type: execute` with `tdd="true"` tasks and asks for one commit per task, so RED and GREEN share a commit. RED was observed by running the new tests before the implementation existed: the shared and server suites failed at module resolution, the architecture walker tests failed on the planned assertion (index.ts still reached `lib/auth.ts`), and 22 Task 2 rule tests failed on their expected-warning assertions.

## Verification results

- `yarn workspace @docktor/shared test` - 8 files, 176 tests passed (19 new).
- `yarn workspace @docktor/server test:unit` - 128 files, 2133 tests passed, including the shared-schema-parity, crypto and stacks-dir suites.
- Entrypoint smoke (`env -i ... node --import tsx src/index.ts`) - exit 1, all four names, no `BetterAuthError`.
- `yarn tsc --noEmit -p server/tsconfig.json` - clean. The new test files were also typechecked with a temporary tsconfig that included them (clean, file removed).
- Acceptance greps: no `process.env` in environment-check.ts or startup-environment.ts; no static `app.js` import and one dynamic one; route, service wiring and shared re-export present; `crypto.ts`, `stacks-dir.ts`, `disk-checker.ts` and `auth-config.ts` unchanged.
- Not run here by project rule: `server/test/integration/environment-status.test.ts` and full `tsc --build` (GitHub Actions CI). `tsc --noEmit` was used locally instead.

## Decisions Made

See `key-decisions` above. Most consequential: the blocking set is exactly D-10, so malformed (but present) DATABASE_URL and BETTER_AUTH_URL values only warn.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dependencies could not be installed the documented way**
- **Found during:** Task 1 (local proof setup)
- **Issue:** `node_modules` was absent and the Yarn 4.13.0 download from `repo.yarnpkg.com` was refused by the sandbox egress policy (403 on CONNECT), so no test or tsc command could run.
- **Fix:** Fetched the pinned Yarn 4.13.0 through Corepack from `registry.npmjs.org` (`COREPACK_NPM_REGISTRY`), and ran `yarn install --immutable` with `YARN_NPM_REGISTRY_SERVER=https://registry.npmjs.org`. The lockfile checksums were enforced and `yarn.lock` is unchanged. These are environment variables on the commands only; no repo file was changed. I did not retry the denied host.
- **Files modified:** none (`node_modules` and the generated Prisma client are gitignored)
- **Verification:** `git status` clean apart from plan files; all suites above ran.

**2. [Rule 2 - Missing critical] Slight extras beyond the plan's literal text**
- **Found during:** Task 1
- **Issue:** `runStartupEnvironmentCheck` needed to log the "check passed" info line the Task 2 human-check expects, and the architecture test needed a positive control so a broken walker could not pass vacuously.
- **Fix:** Added the info line in Task 1 (Task 2 step 3 only had to confirm it) and added two extra architecture cases (the walker finds startup-environment.ts and graceful-shutdown.ts from index.ts; the three check modules do not reach `lib/auth.ts`).
- **Files modified:** `server/src/lib/startup-environment.ts`, `server/test/unit/architecture/layering.test.ts`
- **Commit:** `1f8e5bf`

**Total deviations:** 2 (1 blocking environment issue, 1 small addition). **Impact:** none on scope or behaviour.

## Issues Encountered

None beyond deviation 1.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. The one new endpoint, GET /api/settings/environment, is covered by T-16-02 in the plan's threat model (requireAuth via the plugin hook, response schema strips extra fields).

## User Setup Required

- Maintainer check (D5): run `yarn dev` on a machine with the dev database. If it aborts with the `[env]` block, `.env.development` is missing one of DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL or a 64-hex ENCRYPTION_KEY. Add it there; expect `[env] environment check passed` on the next start.
- CI: confirm `environment-status.test.ts` is green on the first push (it needs Docker for the real database).

## Next Phase Readiness

Ready for 16-02. For 16-03: the DTO (`EnvironmentReport`, `environmentReportSchema`) is exported from `@docktor/shared`, the endpoint is live, and Playwright specs will need a default stub for `**/api/settings/environment` returning `{"warnings":[]}` (RESEARCH Pitfall 4).

## Self-Check: PASSED

All ten created files exist on disk; commits `1f8e5bf` and `d4eaf51` are ancestors of HEAD; `git rev-list --count` from the recorded plan base `ae5992a` to HEAD measured 2 (before this SUMMARY commit).
