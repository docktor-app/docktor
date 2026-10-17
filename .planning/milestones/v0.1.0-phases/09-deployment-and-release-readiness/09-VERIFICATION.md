---
phase: 09-deployment-and-release-readiness
verified: 2026-09-19T21:00:00Z
status: passed
score: 8/8 must-haves verified
covered_files:
  - ".env.example"
  - ".github/workflows/ci.yml"
  - ".planning/WINDOWS.md"
  - ".planning/phases/09-deployment-and-release-readiness/09-01-PLAN.md"
  - ".planning/phases/09-deployment-and-release-readiness/09-01-SUMMARY.md"
  - ".planning/phases/09-deployment-and-release-readiness/09-02-PLAN.md"
  - ".planning/phases/09-deployment-and-release-readiness/09-02-SUMMARY.md"
  - ".planning/phases/09-deployment-and-release-readiness/09-03-PLAN.md"
  - ".planning/phases/09-deployment-and-release-readiness/09-03-SUMMARY.md"
  - ".planning/phases/09-deployment-and-release-readiness/09-04-PLAN.md"
  - ".planning/phases/09-deployment-and-release-readiness/09-04-SUMMARY.md"
  - ".planning/phases/09-deployment-and-release-readiness/09-05-PLAN.md"
  - ".planning/phases/09-deployment-and-release-readiness/09-05-SUMMARY.md"
  - ".planning/phases/09-deployment-and-release-readiness/09-06-PLAN.md"
  - ".planning/phases/09-deployment-and-release-readiness/09-06-SUMMARY.md"
  - ".planning/phases/09-deployment-and-release-readiness/09-07-PLAN.md"
  - ".planning/phases/09-deployment-and-release-readiness/09-07-SUMMARY.md"
  - ".planning/phases/09-deployment-and-release-readiness/09-08-PLAN.md"
  - ".planning/phases/09-deployment-and-release-readiness/09-08-SUMMARY.md"
  - ".planning/phases/09-deployment-and-release-readiness/09-UAT.md"
  - ".planning/phases/09-deployment-and-release-readiness/09-VALIDATION.md"
  - "Dockerfile"
  - "client/src/components/domain/stack/cert-status-badge.tsx"
  - "client/src/hooks/use-proxy-status.ts"
  - "client/src/lib/api.ts"
  - "client/src/lib/certificates-api.ts"
  - "client/src/lib/proxy-api.ts"
  - "client/src/routes/app/settings.tsx"
  - "client/src/routes/app/settings/components/certificates-card.tsx"
  - "client/src/routes/app/stacks/components/proxy-tab.tsx"
  - "docker-compose.yml"
  - "docs/deployment.md"
  - "package.json"
  - "server/prisma/prisma.config.ts"
  - "server/prisma/schema/proxy.prisma"
  - "server/src/application/certificate-service.ts"
  - "server/src/application/proxy-service.ts"
  - "server/src/domain/certificate-naming.ts"
  - "server/src/domain/certificate-validation.ts"
  - "server/src/infrastructure/certificate-filesystem.ts"
  - "server/src/jobs/proxy-cert-poller.ts"
  - "server/src/lib/auth.ts"
  - "server/src/lib/schema-sync.ts"
  - "server/src/lib/state-broadcaster.ts"
  - "server/src/repositories/certificate-repository.ts"
  - "server/src/repositories/proxy-repository.ts"
  - "server/src/routes/certificates.ts"
  - "shared/src/validation/proxy.ts"
covered_digest: "v1:sha256:70ad11a5a8194002bcbbde4d93b390ace19a0fe65b52546cb7ad8fe7cb1bda86"
fingerprint_refresh:
  refreshed_at: "2026-09-20T00:00:00Z"
  reason: "Digest went stale from a final, same-effort documentation pass that landed slightly after this file's recorded timestamp (server/prisma/prisma.config.ts migrations.path addition, .env.example wording fix) — both already described in this phase's own SUMMARY files. No functional change to this phase's verified behavior; confirmed by diff review and a full unit test pass on main."
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "The D-05 upgrade-path (an existing db-push-era database with no _prisma_migrations table) is baselined live against a real database that predates the migrate cutover"
    addressed_in: "Not addressed in a later phase — explicitly and knowingly deferred by the developer during this phase's own UAT session (2026-09-19), recorded as WINDOWS.md entries #10/#11 and 09-UAT.md's deferred_follow_ups"
    evidence: "09-UAT.md test 12/26: 'Not blocking for now — user has not run the upgrade-path sequence against a live database.' v1.0.0 has not shipped yet, so no real self-hosted install exists that would exercise this branch; the fresh-database path (the one every real v1.0.0 install actually takes) was independently live-verified this session and a real bug (missing migrations.path) was found and fixed."
---

# Phase 9: Deployment and Release Readiness Verification Report

**Phase Goal:** Deployment documentation and process match what v1.0.0 actually ships, and the remaining release-process gaps are closed
**Verified:** 2026-09-19
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

This phase has no REQUIREMENTS.md-tracked IDs (confirmed: `grep` for "Phase 9"/"phase-09" against `.planning/REQUIREMENTS.md` returns nothing) and no ROADMAP `success_criteria` array — it is scoped by exactly 4 promoted todo items, per ROADMAP.md §Phase 9 and every plan's frontmatter. Must-haves below are derived from that scope plus each plan's own `must_haves` blocks (Option C / merged-frontmatter path).

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Scope item 1: deployment docs (`.env.example`, `docker-compose.yml`, `docs/deployment.md`) match what actually ships | ✓ VERIFIED | `.env.example` line 3 reads "Copy this file to `.env`" (matches `docker-compose.yml`'s `env_file: - .env`); `docs/deployment.md` audited section-by-section in 09-01 (one drift found and fixed: `DOCKTOR_FS_POLLING` default); todo `2026-08-27-document-deployment-config-clean-env-and-docker-compose.md` closed under `completed/` with a resolution tracing all 8 original defects |
| 2 | Scope item 2: schema management cut over from `prisma db push` to `prisma migrate deploy`, image/docs/env updated to match, and the cutover actually works on a fresh install | ✓ VERIFIED | `server/prisma/prisma.config.ts` sets `migrations.path`; `package.json` has no `db:push` script; `Dockerfile` declares `DOCKTOR_DB_AUTO_MIGRATE=true`; `docs/deployment.md` §Database schema rewritten; **live-verified this session**: a genuine cold docker-compose start with a cleared Postgres volume found `syncDatabaseSchema()` was silently applying zero tables (missing `migrations.path` — a real bug, not the previously-suspected sandbox networking block), fixed in commit `374b46b`, and re-verified live — `0_init` and `20260917083545_add_certificate` both apply cleanly and `GET /api/setup/status` returns a real Setting-table-backed response. Todo `2026-09-01-adopt-prisma-migrate-post-mvp.md` closed |
| 3 | Scope item 3: CI runs typecheck + unit suites on Windows and macOS, both required on `main`, and the checks are actually green (not just configured) | ✓ VERIFIED | `cross-platform-unit` job present in `.github/workflows/ci.yml` with `[windows-latest, macos-latest]` matrix and an explicit `yarn workspace @docktor/server test:unit` step; `gh api .../branches/main/protection` confirms both check names are required; the first real run found 3 genuine Windows-only bugs (not misconfiguration), which were root-caused and fixed (todo `2026-09-16-windows-ci-check-fails-on-real-platform-bugs.md`, closed); **the latest CI run on this branch (35458988461) is green on all four jobs**, confirmed live via `gh run view --json jobs` |
| 4 | Scope item 4: custom TLS certificates — upload, validate, store, suppress ACME, monitor expiry, and surface all of it in the UI | ✓ VERIFIED | Full server stack present and wired (`Certificate` Prisma model, `certificate-validation.ts`, `certificate-naming.ts`, `certificate-filesystem.ts`, `certificate-repository.ts`, `certificate-service.ts`, `routes/certificates.ts` registered in `app.ts`); ACME suppression filters `renderProxyEnvForService`'s issuance host to TLS-enabled-AND-`certSource==='acme'` rows only; `ProxyCertPoller` classifies custom rows by file+expiry, never the ACME log; client wired (`certificates-api.ts`, `CertificatesCard` rendered in `settings.tsx`, cert-source picker + "Expiring soon" badge in `proxy-tab.tsx`); todo `2026-09-07-add-support-for-custom-tls-certificates.md` closed with a resolution naming D-09 through D-13 |
| 5 | Auth fix found during UAT: `trustedOrigins` reads the Settings/wizard Base URL, not just `BETTER_AUTH_URL` | ✓ VERIFIED | `server/src/lib/auth.ts`'s `resolveTrustedOrigins()` reads `SettingsRepository.get(SETTING_KEYS.BASE_URL)` and merges it with `process.env.BETTER_AUTH_URL`, wrapped in try/catch so a pre-migration boot can't throw; shipped in commit `a5bfeaf` |
| 6 | No debt markers or stub implementations survive in the phase's touched files | ✓ VERIFIED | `grep -nE 'TBD\|FIXME\|XXX'` across all core schema-sync/certificate/proxy-tab/settings files returns nothing |
| 7 | All unit suites pass with no regressions | ✓ VERIFIED | `yarn typecheck` exits 0 with no output; server 712/712 (2 todo) pass; client 243/243 (3 todo) pass; shared 80/80 pass — matches the counts asserted in the phase's own commits |
| 8 | All four scope-item todos (plus the Windows-bugs todo the phase's own CI work surfaced) are closed; no phase-09-scoped todo remains pending | ✓ VERIFIED | All 5 relevant todo files live under `.planning/todos/completed/`; none remain under `.planning/todos/pending/` |

**Score:** 8/8 truths verified (0 present-but-behavior-unverified)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | D-05's auto-baseline branch (an existing `db push`-era database with no `_prisma_migrations` table) has not been exercised live | Not addressed by a later phase — explicitly deferred by the developer in this phase's own UAT session | `09-UAT.md` test 12/26 (deferred, not blocking); `.planning/WINDOWS.md` entries #10/#11 (status: open). No real v1.0.0 install exists yet that would take this branch — every install through this release takes the fresh-database path, which **was** live-verified this session (and its one real bug was found and fixed). This is a genuine, disclosed, low-risk residual gap tracked for the first real upgrade rather than a hidden one. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.env.example` | header points at `.env` | ✓ VERIFIED | line 3 confirmed |
| `docs/deployment.md` | Database schema section describes migrate deploy + auto-baseline + drift probe | ✓ VERIFIED | full section read, matches shipped `schema-sync.ts` behavior |
| `server/prisma/migrations/0_init/`, `.../*_add_certificate/` | generated baseline + incremental migration | ✓ VERIFIED | both present, both applied cleanly in this session's live cold-start test |
| `server/prisma/prisma.config.ts` | `migrations.path` set | ✓ VERIFIED | lines 6-8 |
| `.github/workflows/ci.yml` | `cross-platform-unit` matrix job | ✓ VERIFIED | present, green on latest run |
| `server/src/routes/certificates.ts` | authenticated CRUD for certificates | ✓ VERIFIED | registered in `app.ts` line 133 |
| `client/src/routes/app/settings/components/certificates-card.tsx` | upload/list/delete UI | ✓ VERIFIED | rendered in `settings.tsx` line 1119 |
| `client/src/routes/app/stacks/components/proxy-tab.tsx` | certSource picker + expiring badge | ✓ VERIFIED | `certSource`/`getCertificates` present |
| `server/src/lib/auth.ts` | `trustedOrigins` reads Settings Base URL | ✓ VERIFIED | `resolveTrustedOrigins()` present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `docker-compose.yml` `env_file: - .env` | Compose `${VAR}` interpolation | filename match | WIRED | `.env.example` header corrected to match |
| `server/src/index.ts` | `syncDatabaseSchema()` | boot sequence | WIRED | live cold-start confirmed tables are created |
| `renderProxyEnvForService` | acme-companion issuance variable | `certSource` filter | WIRED | unit + real-YAML proof (09-07 Task 3) shows `LETSENCRYPT_HOST` absent for all-custom services |
| `ProxyCertPoller` | on-disk certificate file | `certFileBaseName(certificate.domainPattern)` | WIRED | unit-proven never to use the row's own hostname for custom rows |
| `client/src/lib/api.ts` `apiFetch` | multipart upload | FormData content-type omission | WIRED | unit-locked regression test |
| CI workflow | GitHub branch protection | required status checks | WIRED | confirmed live via `gh api` — both check names present and currently green |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Server unit suite green | `yarn workspace @docktor/server test:unit` | 712 passed, 2 todo, 0 failed | ✓ PASS |
| Client unit suite green | `yarn workspace @docktor/client test` | 243 passed, 3 todo, 0 failed | ✓ PASS |
| Shared unit suite green | `yarn test:unit` (client+shared) | 80/80 shared, 0 failed | ✓ PASS |
| Full workspace typecheck | `yarn typecheck` | exit 0, no output | ✓ PASS |
| Latest CI run on this branch | `gh run view 35458988461 --json jobs` | build-and-test / cross-platform-unit (windows) / cross-platform-unit (macos) / sonarqube all `success` | ✓ PASS |
| Branch protection reflects D-07 | `gh api repos/.../branches/main/protection` | both `cross-platform-unit` checks listed as required | ✓ PASS |
| Migration fix present | `grep migrations.path server/prisma/prisma.config.ts` | present | ✓ PASS |
| Auth fix present | read `server/src/lib/auth.ts` | `resolveTrustedOrigins()` reads Settings Base URL | ✓ PASS |

### Requirements Coverage

N/A — phase explicitly scoped by 4 promoted todo items, not REQUIREMENTS.md IDs. Confirmed no orphaned requirements: `grep -n "Phase 9\|phase-09"` against `.planning/REQUIREMENTS.md` returns no matches.

### Anti-Patterns Found

None. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers found in any core file this phase touched. No stub returns, no hardcoded empty responses feeding rendered UI.

**Non-blocking observation:** the working tree carries one uncommitted, unstaged change to `docker-compose.yml` (adds `ports: - 5432:5432` to the `db` service) — a leftover from this session's live-database debugging, not part of any phase commit. It does not affect the verified state of the phase's shipped commits and should simply be discarded or committed separately by the developer, not treated as a phase deliverable.

### Human Verification Required

None. The phase's own end-to-end UAT (`09-UAT.md`, 45/46 passed, 1 explicitly non-blocking deferral) was already performed live by the developer against a real docker-compose deployment and a real domain this session, and found/fixed two real bugs (`374b46b`, `a5bfeaf`), both confirmed present in the codebase by this verification. The one remaining open item (the db-push-era upgrade/auto-baseline branch) was already surfaced to and consciously deferred by the developer in that same session — re-flagging it here as a fresh human-verification item would duplicate a decision already made and recorded (see Deferred Items above).

### Gaps Summary

No gaps. All four scope items are implemented, wired, unit-tested, and — for the two items whose correctness could only be learned from a real deployment (the migration cutover and the CI matrix) — live-verified this session, with the one real bug found in each area (prisma.config.ts's missing `migrations.path`; auth.ts's static trustedOrigins) fixed and re-verified. The single remaining open item (db-push-era upgrade baselining) is a disclosed, low-risk, explicitly-deferred edge case that cannot affect any real v1.0.0 install, since no install exists yet that predates the migrate cutover.

---

*Verified: 2026-09-19*
*Verifier: Claude (gsd-verifier)*
