---
phase: "9"
slug: "deployment-and-release-readiness"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-09-15"
validated: "2026-09-19"
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 (server, client, shared) + Playwright (client E2E) |
| **Config file** | `server/vitest.config.ts` (projects: `unit`, `test/integration`), `client/vitest.config.ts` (single unit project), `shared/vitest.config.ts` |
| **Quick run command** | `yarn workspace @docktor/server test:unit` / `yarn test:unit` (client+shared) |
| **Full suite command** | `yarn workspace @docktor/server test` (unit+integration combined) + `yarn test:integration` (client Playwright E2E) |
| **Estimated runtime** | ~30-90s unit; integration/E2E significantly longer (Docker-backed) |

---

## Sampling Rate

- **After every task commit:** Run `yarn typecheck && yarn workspace @docktor/server test:unit` (server-side changes) or `yarn test:unit` (shared/client changes)
- **After every plan wave:** Run `yarn workspace @docktor/server test` (unit+integration, where a Docker-backed dev environment is available)
- **Before `/gsd-verify-work`:** Full suite must be green, plus at least one live Windows and one live macOS CI run observed green before D-07's required-check status is applied in GitHub branch protection settings
- **Max feedback latency:** ~90 seconds (unit-only sampling)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Item | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-02 | 09-01 | 1 | 1 (docs drift) | `.env.example`/`.env.production` no longer reference `.env.local` | doc/manual grep | `grep -c "env\.local" .env.example` → 0 | ✅ (grep-based, no new test file needed) | ✅ green |
| 09-03-02 | 09-03 | 1 | 2 (D-03/D-04) | `syncDatabaseSchema()` runs `migrate deploy` and correctly classifies outcomes | unit | `yarn workspace @docktor/server test:unit test/unit/lib/schema-sync.test.ts` | ✅ `server/test/unit/lib/schema-sync.test.ts` (17 tests) | ✅ green |
| 09-03-02 | 09-03 | 1 | 2 (D-05) | Auto-baseline detection identifies a `db push`-only DB vs. fresh vs. already-migrated | unit | same file — `needsBaseline()`/`hasApplicationTables()` branch cases | ✅ `server/test/unit/lib/schema-sync.test.ts` (part of the 17 tests) | ✅ green |
| 09-02-01 | 09-02 | 1 | 3 (D-06/D-08) | New CI job runs typecheck + unit tests (client/shared/server) on `windows-latest`/`macos-latest`, excludes integration | CI/manual | live workflow run on a PR | N/A — verified via actual CI run, not a repo test file (run https://github.com/raphaelmue/docktor/actions/runs/35063784652: macos-latest SUCCESS, windows-latest FAILURE on 3 genuine platform bugs, tracked separately) | ✅ green (job itself; see Manual-Only below for the still-open platform bugs) |
| 09-06-02 | 09-06 | 3 | 4 (D-12) | Mismatched key/cert pair rejected; cert whose SAN doesn't cover domain pattern rejected | unit | `yarn workspace @docktor/server test:unit test/unit/domain/certificate-validation.test.ts` | ✅ `server/test/unit/domain/certificate-validation.test.ts` (10 tests) | ✅ green |
| 09-07-01/02 | 09-07 | 4 | 4 (D-13) | Expiry check flags near-expiry cert; `ProxyCertPoller.reconcile()` branches correctly on `certSource` | unit | `yarn workspace @docktor/server test:unit test/unit/jobs/proxy-cert-poller.test.ts` | ✅ `server/test/unit/jobs/proxy-cert-poller.test.ts` (24 tests, extended across two plans) | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Task IDs backfilled from the executed PLAN/SUMMARY files — the original draft's "TBD" placeholders are resolved now that all 8 plans have shipped.*

---

## Wave 0 Requirements

- [x] `server/test/unit/lib/schema-sync.test.ts` — updated/new tests covering `migrate deploy` argv, outcome classification, and D-05's `needsBaseline()` logic (09-03, 17 tests)
- [x] New unit test file for certificate validation (key/cert match, SAN/domain-pattern coverage, expiry extraction) — covers D-12/D-13's pure logic in isolation from Fastify/multipart plumbing (09-06, `certificate-validation.test.ts`, 10 tests)
- [x] `.github/workflows/ci.yml` correctness — proven via a live run (09-02: macos-latest green, windows-latest red on 3 genuine platform bugs unrelated to the job's own correctness; tracked separately, see below)

---

## Manual-Only Verifications

| Behavior | Item | Why Manual | Test Instructions | Status |
|----------|------|------------|-------------------|--------|
| Windows CI job passes (typecheck + unit tests) | 3 (D-06/D-07) | GitHub-hosted Windows runner behavior can only be observed via a live workflow run, not simulated locally | Open a PR after the workflow change merges; confirm the `windows-latest` job appears and goes green; then mark it required in GitHub branch protection settings | ⚠️ Job exercised live and correctly configured (real run https://github.com/raphaelmue/docktor/actions/runs/35063784652); currently red on 3 real, pre-existing Windows-only platform bugs (`stacks-dir.ts`, `brownfield-scanner.ts`, `proxy-cert-poller.ts`) — tracked as `.planning/todos/pending/2026-09-16-windows-ci-check-fails-on-real-platform-bugs.md`, not a Nyquist coverage gap |
| macOS CI job passes (typecheck + unit tests) | 3 (D-08) | Same as above — GitHub-hosted macOS runner | Same PR; confirm the `macos-latest` job appears and goes green | ✅ Confirmed green on the same live run |
| Existing self-hosted install auto-baselines cleanly on upgrade | 2 (D-05) | Requires a real Postgres DB previously synced via `db push` (schema present, no `_prisma_migrations` table) — not reproducible in a fresh test DB without deliberately seeding that exact pre-migration state | Stand up a DB via the pre-Phase-9 `db push` path, then boot the Phase-9 server binary against it and confirm the auto-baseline log output and a subsequent clean `migrate deploy` | ❌ Still unverified — 09-UAT.md tests 12/26 deferred this (fresh-database cold start was verified live 2026-09-19 and found/fixed a real bug, G-09-1, but that only exercises the *fresh*-database branch, not the `db push`-era upgrade/baseline branch). Also tracked as `.planning/WINDOWS.md` entries #10/#11 |
| Wildcard certificate correctly served by `nginx-proxy` under its resolved on-disk filename | 4 (D-10/D-11) | Depends on the actual `nginx-proxy` container reading the file from the shared volume — an integration-level, container-networking behavior | Upload a wildcard cert for `*.example.test` via the UI, confirm the file lands at the parent-domain-derived path in `volumes/certs/`, then curl an HTTPS subdomain through the proxy stack and inspect the served cert | ✅ Confirmed live 2026-09-19 against a real instance with a real domain — see `09-UAT.md` tests 33/39/46 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-09-19

## Validation Audit 2026-09-19

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

All six original Wave 0 items were already covered by tests shipped in the 8 executed plans (schema-sync.test.ts, certificate-validation.test.ts, proxy-cert-poller.test.ts, the CI job's own live run) — re-run and confirmed green during this audit rather than gap-filled. The Per-Task Verification Map's "TBD" placeholders are backfilled with the real plan/task IDs. Manual-Only Verifications updated with live results from this session's cold-start UAT retest (fixed a real bug, G-09-1 — see `09-UAT.md`) and the user's confirmed live pass of the wildcard-certificate/nginx-proxy checks (tests 33/39/46) against a real domain. One Manual-Only item remains genuinely open (the `db push`-era upgrade/auto-baseline path) — tracked in `09-UAT.md`'s deferred follow-ups and `WINDOWS.md` entries #10/#11, not counted as a Nyquist gap since it is explicitly scoped as manual-only, not missing automated coverage.
