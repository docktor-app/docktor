---
status: complete
phase: 09-deployment-and-release-readiness
source: [09-01-SUMMARY.md, 09-02-SUMMARY.md, 09-03-SUMMARY.md, 09-04-SUMMARY.md, 09-05-SUMMARY.md, 09-06-SUMMARY.md, 09-07-SUMMARY.md, 09-08-SUMMARY.md]
started: 2026-09-18T16:10:46Z
updated: 2026-09-19T18:00:48Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Server boots without errors, any seed/migration completes, and a primary query (health check, homepage load, or basic API call) returns live data.
result: pass
reported: "i was able to start the app, but unfortunately, the database migration did not run" (original finding — see resolved gap G-09-1 below; fixed and re-verified live this session, commit 374b46b)

### 2. D1 (09-01) — .env.example header points operators at .env
expected: An operator following .env.example's own header comment ends up with a file named exactly .env — the same filename docker-compose.yml's env_file entry loads and docs/deployment.md instructs.
result: pass
source: automated
coverage_id: D1

### 3. D3 (09-01) — deployment-config todo closed with resolution
expected: The deployment-config todo is filed under completed/ with a resolution naming which prior phase shipped each defect, and the one drift this plan itself fixed.
result: pass
source: automated
coverage_id: D3

### 4. D4 (09-01) — .env.production access block reported, not hidden
expected: If the execution environment blocks access to .env.production, that blockage is reported as a named remaining gap with the exact edit, never silently skipped or claimed done.
result: pass
source: automated
coverage_id: D4

### 5. D2 (09-01) — docs/deployment.md fact-audit is accurate
expected: Every factual claim docs/deployment.md makes about docker-compose.yml, .env.example, and Dockerfile is confirmed true, with each checked fact and verdict recorded. (Judgment call: fact-matching prose against config is inherently a judgment call — the audit table in 09-01-SUMMARY.md documents the reasoning per section. Spot-check a few rows against the live files.)
result: pass

### 6. D3 (09-02) — CI todo closed with resolution
expected: CI todo closed with a resolution naming the job, both platforms, the server unit-test step, the integration-exclusion reason, and the Task 2 outcome.
result: pass
source: automated
coverage_id: D3

### 7. D1 (09-02) — cross-platform-unit CI job correctly configured
expected: cross-platform-unit CI job added (windows-latest + macos-latest matrix), running typecheck + client/shared/server unit suites with no Docker-dependent steps. (Judgment call: the job is correctly configured and ran real tests on both platforms — macos-latest passed, windows-latest failed on 3 genuine platform bugs, not misconfiguration. Confirm you agree "job works as designed and correctly caught real bugs" rather than "job is broken".)
result: pass

### 8. D2 (09-02) — branch protection requires both cross-platform-unit checks
expected: Both cross-platform-unit checks made required on the main branch protection rule (D-07). (This was a human-authorized GitHub setting change already applied and verified against the live GitHub API — confirm you're aware windows-latest is currently red and blocking all merges until the 3 platform bugs are fixed.)
result: pass

### 9. D1 (09-03) — 0_init baseline migration generated
expected: Baseline migration server/prisma/migrations/0_init/migration.sql generated via `prisma migrate diff --from-empty --to-schema server/prisma/schema --script` (not hand-written), containing a CREATE TABLE for every one of the 16 models.
result: pass
source: automated
coverage_id: D1

### 10. D2 (09-03) — schema-sync.ts cut over to prisma migrate deploy
expected: schema-sync.ts cut over to `prisma migrate deploy`, with D-05 auto-baseline branches, a post-baseline drift probe, the DOCKTOR_DB_AUTO_MIGRATE opt-out and its deprecated-alias precedence, and never-throws/argv-safety guarantees preserved.
result: pass
source: automated
coverage_id: D2

### 11. D3 (09-03) — db:push script removed
expected: root package.json's schemaless db:push convenience script removed; db:migrate/db:generate retained unchanged.
result: pass
source: automated
coverage_id: D3

### 12. D4 (09-03) — live database baseline (BLOCKED — Branch B)
expected: Baseline the current dev database live and pin migrate deploy's real no-op stdout to the classification regex. (Branch B was taken this session — TCP connects but the Postgres wire-protocol handshake never completes in this sandbox. No live command ran. A human on an unrestricted host must run the 4-command sequence in 09-03-SUMMARY.md and confirm the no-op output matches the NO_PENDING_MIGRATIONS_REGEX.) Note: the cold-start retest for G-09-1 proved only the fresh-database branch of schema-sync.ts; this test is specifically about the upgrade branch (needsBaseline + hasApplicationTables -> migrate resolve --applied -> migrate deploy -> drift probe) on a database previously synced via the old `db push` step, which remains unexercised live.
result: skipped
reason: "Deferred follow-up: not blocking for now — user has not run the upgrade-path (db push -> baseline) sequence against a live database; this remains open and distinct from the fresh-database path verified in test 1/G-09-1."

### 13. D1 (09-04) — Dockerfile ENV describes migrations, not schemaless push
expected: Dockerfile declares DOCKTOR_DB_AUTO_MIGRATE=true, retains DOCKTOR_DB_AUTO_PUSH as a deprecated alias, and its comment describes applying migrations and auto-baselining rather than the removed schemaless push.
result: pass
source: automated
coverage_id: D1

### 14. D2 (09-04) — 0_init migration reaches the built image
expected: server/prisma/migrations/0_init/migration.sql reaches the built image as a sibling of schema/, with no explicit COPY needed. Verified by actually building the server-build Docker stage and listing the resulting image's filesystem.
result: pass
source: automated
coverage_id: D2

### 15. D3 (09-04) — startup logs name DOCKTOR_DB_AUTO_MIGRATE
expected: server/src/index.ts's skipped/failed log strings name DOCKTOR_DB_AUTO_MIGRATE; applied/already-current still interpolate schemaSyncResult.detail; no control-flow or SchemaSyncOutcome switch-shape change; yarn typecheck exits 0.
result: pass
source: automated
coverage_id: D3

### 16. D4 (09-04) — .env.example documents DOCKTOR_DB_AUTO_MIGRATE
expected: .env.example documents DOCKTOR_DB_AUTO_MIGRATE and re-labels DOCKTOR_DB_AUTO_PUSH as a deprecated alias, with no existing variable's value changed.
result: pass
source: automated
coverage_id: D4

### 17. D5 (09-04) — docs/deployment.md Database schema section rewritten
expected: docs/deployment.md's Database schema section, variable table, first-boot log expectation, and troubleshooting row all describe the migration mechanism; the section states the automatic baseline has not yet been live-verified.
result: pass
source: automated
coverage_id: D5

### 18. D6 (09-04) — prisma-migrate todo closed
expected: Item-2 todo closed via gsd_run query todo complete, living only under completed/, with a Resolution section naming D-02/D-04/D-05 and the live-verification status; pending count dropped by exactly 1.
result: pass
source: automated
coverage_id: D6

### 19. D1 (09-05) — domainPatternRegex accepts/rejects correctly
expected: domainPatternRegex accepts plain hostnames and a single leading-wildcard pattern (*.example.com), rejects a bare/dangling asterisk, a non-leading wildcard, a double-wildcard, a hyphen-leading label, and a path-traversal-shaped value.
result: pass
source: automated
coverage_id: D1

### 20. D2 (09-05) — routing domain still rejects wildcards
expected: assignDomainSchema still rejects a wildcard in the domain field (routing hostname is never a wildcard) — hostnamePattern itself is unmodified.
result: pass
source: automated
coverage_id: D2

### 21. D3 (09-05) — certificate schemas validate correctly
expected: createCertificateSchema accepts a wildcard domainPattern and lowercases mixed-case input; certSourceSchema accepts acme/custom and rejects other values; certStatusSchema accepts all four values including the new expiring (D-13).
result: pass
source: automated
coverage_id: D3

### 22. D4 (09-05) — certSource/certificateId pairing rules enforced
expected: assignDomainSchema's certSource/certificateId superRefine enforces the three pairing rules (D-11 promote framing): custom requires certificateId, acme forbids it, custom requires tlsEnabled=true; certSource defaults to acme when absent.
result: pass
source: automated
coverage_id: D4

### 23. D5 (09-05) — Prisma schema carries the Certificate model
expected: server/prisma/schema/proxy.prisma carries the Certificate model (domainPattern unique, encrypted privateKey, certificate PEM, optional caBundle, required expiresAt, back-relation) and ProxyConfig.certSource/certificateId/certificate with onDelete: Restrict; yarn db:generate and yarn typecheck both exit 0.
result: pass
source: automated
coverage_id: D5

### 24. D6 (09-05) — no regressions in shared/server unit suites
expected: server unit suite (641/641) and shared unit suite (79/79, including the 26 new proxy tests) both pass after the schema extension — no existing consumer of assignDomainSchema/certStatusSchema broke.
result: pass
source: automated
coverage_id: D6

### 25. D7 (09-05) — add_certificate migration generated correctly
expected: add_certificate migration generated (not hand-written) on top of 0_init, containing exactly the expected three changes (Certificate CREATE TABLE + unique index, ProxyConfig certSource ADD COLUMN NOT NULL DEFAULT 'acme', certificateId ADD COLUMN + restricted-delete FK), no DROP TABLE; 0_init itself untouched.
result: pass
source: automated
coverage_id: D7

### 26. D8 (09-05) — migration applied to live database + certSource backfill (BLOCKED — Branch B)
expected: Whether the add_certificate migration has been applied to a live database, and the certSource backfill verified. (Branch B was taken — same TCP-to-Postgres-protocol block as test 12. No live command ran. A human on an unrestricted host must run `yarn db:migrate` then confirm `SELECT DISTINCT "certSource" FROM "ProxyConfig"` returns only 'acme' and `_prisma_migrations` shows both 0_init and add_certificate applied in order.) Note: the fresh cold-start retest already applied both 0_init and add_certificate cleanly. The remaining open piece is specifically the certSource='acme' backfill onto pre-existing ProxyConfig rows, which only applies to an upgrade scenario — a genuinely fresh database has no pre-existing rows to backfill.
result: pass

### 27. D1 (09-06) — certificate upload round-trip never leaks secrets
expected: A user can upload a certificate, key, and optional CA bundle over an authenticated multipart POST; the response contains only id/domainPattern/expiresAt, never privateKey/certificate/caBundle/any BEGIN-PEM substring.
result: pass
source: automated
coverage_id: D1

### 28. D2 (09-06) — invalid certificates rejected before persistence
expected: A mismatched key/certificate pair, malformed PEM content, or a certificate not covering the declared domain pattern is rejected with BadRequestError before anything is persisted or written to disk; no rejection reason contains any substring of the key/certificate material.
result: pass
source: automated
coverage_id: D2

### 29. D3 (09-06) — wildcard cert filename uses parent-domain naming
expected: certFileBaseName strips a leading wildcard label (parent-domain naming, matching nginx-proxy's own convention) and throws for path-traversal-shaped input.
result: pass
source: automated
coverage_id: D3

### 30. D4 (09-06) — private key encrypted at rest, decrypted once
expected: The private key is encrypted (AES-256-GCM via the existing crypto.ts helper) before it is persisted, and decrypted only once, immediately before the plaintext is written to a 0o600 key file under the proxy stack's certificates directory.
result: pass
source: automated
coverage_id: D4

### 31. D5 (09-06) — list/delete with referenced-certificate protection
expected: Certificates can be listed (metadata-only) and deleted; deleting a certificate still referenced by a proxy configuration is refused with a message naming every referencing domain rather than cascading or orphaning.
result: pass
source: automated
coverage_id: D5

### 32. D6 (09-06) — filesystem-write failure rolls back the DB row
expected: A file write failure after the database row is created rolls the row back (no orphaned DB-only certificate); every certificate route requires authentication via the same requireAuth hook every other authenticated route uses.
result: pass
source: automated
coverage_id: D6

### 33. D7 (09-06) — uploaded certificate lands on real proxy-stack disk (BLOCKED)
expected: Live end-to-end proof that an uploaded certificate actually lands on the mounted proxy-stack certificates directory under the filename nginx-proxy resolves, against a real running proxy stack. (Proven only via source-level containment/naming logic and unit tests with mocked filesystem I/O in this session — never exercised against a real Docker-mounted proxy stack. A human on an unrestricted host should upload a real cert through the API and confirm nginx-proxy serves it.)
result: pass

### 34. D1 (09-07) — ACME issuance suppressed for custom-certificate domains
expected: A domain whose certificate the user supplied never receives an ACME issuance environment variable, regardless of TLS state or mix with ACME-sourced domains on the same service — proven against mocks and against a real rendered compose document.
result: pass
source: automated
coverage_id: D1

### 35. D2 (09-07) — assignDomain validates and persists certSource explicitly
expected: assignDomain persists an explicit certSource on every row (never inferred from the certificate link's presence/absence), confirms a custom certificate exists before creating anything, and rejects an unknown certificate id before touching the compose file.
result: pass
source: automated
coverage_id: D2

### 36. D3 (09-07) — custom-sourced rows classified by file+expiry, not ACME log
expected: A custom-sourced row is classified by its linked certificate's file presence and expiry, never by tailing the ACME container's log; a wildcard certificate resolves via its own domain pattern; a missing file classifies failed, not pending.
result: pass
source: automated
coverage_id: D3

### 37. D4 (09-07) — expiry classification correct at all boundaries
expected: classifyCertificateExpiry is a pure, clock-injectable function correct at all four boundaries (far-future, inside-window, exactly-at-boundary, already-past), including proof against a real certificate's actual not-after date.
result: pass
source: automated
coverage_id: D4

### 38. D5 (09-07) — ACME rows unchanged, status vocabulary stable
expected: ACME-sourced rows keep byte-identical prior behavior; the proxy_cert_status event's status union carries exactly the four vocabulary members with no second event type; no path ending in .key is ever passed to the poller's filesystem port.
result: pass
source: automated
coverage_id: D5

### 39. D6 (09-07) — real proxy stack serves HTTPS with no ACME attempt (BLOCKED)
expected: Live end-to-end confirmation that a real proxy stack with a genuinely uploaded certificate serves HTTPS correctly and that acme-companion never attempts issuance for it. (Proven only against real compose YAML and a real self-signed fixture certificate in this session — never a live Docker-mounted proxy stack. A human on an unrestricted host should upload a real certificate, assign it to a domain, and confirm both HTTPS serving and no ACME issuance attempt in acme-companion's logs.)
result: pass

### 40. D1 (09-08) — apiFetch omits content-type for FormData
expected: A FormData request body reaches fetch with no content-type header (browser supplies the multipart boundary); a string body keeps the JSON content-type; a caller-supplied content-type header is never overwritten; a request with no body gets no content-type.
result: pass
source: automated
coverage_id: D1

### 41. D2 (09-08) — certificates-api.ts client never exposes secret fields
expected: certificates-api.ts's Certificate interface exposes only id/domainPattern/expiresAt/createdAt/updatedAt (no privateKey/certificate/caBundle member); getCertificates/uploadCertificate/deleteCertificate wrap the routes with no body stringification of the upload's FormData.
result: pass
source: automated
coverage_id: D2

### 42. D3 (09-08) — Settings Certificates card behaves correctly
expected: CertificatesCard renders a three-file upload form, a list with domain pattern/expiry/per-row expiry warning, an empty state, verbatim server rejection reasons, and delete behind a confirmation dialog naming blocking domains on conflict; no secret material ever enters component state.
result: pass
source: automated
coverage_id: D3

### 43. D4 (09-08) — "Expiring soon" badge renders correctly
expected: CertStatusBadge's expiring branch renders "Expiring soon" with the accompanying message when present, is visually distinct from all three prior branches (issued/failed/pending), and never uses the destructive variant.
result: pass
source: automated
coverage_id: D4

### 44. D5 (09-08) — proxy tab certificate-source picker works
expected: proxy-tab.tsx's assign form offers a certificate-source choice (default automatic, no picker shown), reveals a picker fed by getCertificates() naming each certificate by domain pattern when "one of my certificates" is chosen, explains where to add one when none exist, and the per-domain listing shows each domain's source alongside its status badge.
result: pass
source: automated
coverage_id: D5

### 45. D6 (09-08) — custom-TLS-certificates todo closed
expected: The item-4 todo is filed under .planning/todos/completed/ only, with a Resolution section naming D-09 through D-13 and at least one shipping plan per decision, the live-database status carried forward, and the live-HTTPS-serving user-acceptance-testing handoff.
result: pass
source: automated
coverage_id: D6

### 46. D7 (09-08) — full feature proven live end-to-end (BLOCKED)
expected: Live end-to-end confirmation that a real proxy stack with a genuinely uploaded certificate serves HTTPS correctly, and that acme-companion attempts no issuance for that domain. (Same live-environment gap as tests 33 and 39 — proven only via unit tests, real compose-YAML parsing, and a real self-signed fixture certificate's expiry in this session. A human on an unrestricted host must perform the full pass described in the todo's Resolution: upload a cert through the browser, assign it to a domain, confirm HTTPS serving and no ACME attempt.)
result: pass

## Deferred Follow-Ups

- test: 12
  idea: "Not blocking for now — the upgrade-path baseline sequence (db push -> migrate resolve --applied -> migrate deploy -> drift probe) against a live db-push-era database has not been run. Distinct from the fresh-database path verified by G-09-1's retest. Tracked as WINDOWS.md entry #10 / test 26's identical certSource-backfill counterpart (WINDOWS.md #11)."
  deferred_at: 2026-09-19

## Summary

total: 46
passed: 45
issues: 0
pending: 0
skipped: 1

## Gaps

- gap_id: G-09-1
  truth: "Kill any running server/service. Clear ephemeral state. Start the application from scratch. Server boots without errors, any seed/migration completes, and a primary query returns live data."
  status: failed
  reason: "User reported: i was able to start the app, but unfortunately, the database migration did not run"
  severity: blocker
  test: 1
  artifacts:
    - path: server/prisma/prisma.config.ts
      issue: "defineConfig() sets `schema: path.join(__dirname, \"schema\")` but never sets `migrations.path`. Prisma's config-based CLI defaults the migrations directory to a fixed relative path (not derived from `schema`'s location), which does not resolve to server/prisma/migrations for this project's server/prisma/{schema,migrations} layout."
  missing:
    - "Add `migrations: { path: path.join(__dirname, \"migrations\") }` to defineConfig() in server/prisma/prisma.config.ts, mirroring how `schema` is already resolved relative to __dirname."
  root_cause: |
    Confirmed live against the actual docker-compose deployment (docktor container, fresh empty
    docktor-db, image built from this phase's HEAD):

    1. `docktor` container logs show schema-sync correctly identified a fresh database
       (`[schema-sync] no migration history and no application tables — treating as a fresh
       database`), then ran `prisma migrate deploy --config=server/prisma/prisma.config.ts`.
    2. That CLI invocation's own combined stdout/stderr (logged verbatim by index.ts per
       09-04's `schemaSyncResult.detail` change) reads:
       "No migration found in prisma/migrations" ... "No pending migrations to apply." ...
       "Loaded Prisma config from server/prisma/prisma.config.ts." ... "Prisma schema loaded
       from server/prisma/schema."
    3. `docker exec docktor ls -la /app/server/prisma/migrations/` confirms both
       0_init/ and 20260917083545_add_certificate/ genuinely exist in the built image, as
       siblings of schema/ — exactly where 09-03/09-04 generated and verified them.
    4. `docker exec docktor readlink /proc/1/cwd` confirms the running process's CWD is
       /app — so Prisma's config-based migrate CLI, lacking an explicit `migrations.path` in
       prisma.config.ts, fell back to a literal `prisma/migrations` relative to CWD
       (`/app/prisma/migrations`, which does not exist) instead of the schema-relative
       `server/prisma/migrations` (`/app/server/prisma/migrations`, which does).
    5. `@prisma/config`'s own type definitions (server/../node_modules/@prisma/config)
       confirm `migrations?: { path?: string; ... }` is a real, supported config field —
       schema-sync.ts's config just never sets it.

    Consequence: `syncDatabaseSchema()` classifies the CLI's "No pending migrations to apply"
    output as outcome "already-current" (it matches NO_PENDING_MIGRATIONS_REGEX) even though
    zero tables were ever created. The server then starts with a completely empty database:
    BackupRecovery, DiskChecker, BackupScheduler, and StatePoller/FileWatcher's reconcile loop
    all immediately fail with Prisma P2021 "table does not exist" (Backup, Setting, Stack),
    and keep failing on every recurring interval.

    This is the exact live-database gap flagged as unverified throughout the phase
    (WINDOWS.md #10, 09-03-SUMMARY.md Task 3, 09-05-SUMMARY.md Task 3) — but it turns out the
    real defect is not in the sandboxed TCP-block class of gap those entries describe; it is a
    genuine, reproducible code bug in prisma.config.ts that a live run now confirms. It would
    have affected the Branch-B "upgrade an existing db push install" path too (same missing
    migrations.path breaks `migrate resolve --applied` and the drift probe identically), so
    WINDOWS.md #10 and #11 are downstream of this same root cause, not independent gaps.
  debug_session: ""
  status: resolved
  resolved_by: "374b46b — fix(09): set migrations.path in prisma.config.ts so migrate deploy finds server/prisma/migrations"
  resolved_at: 2026-09-19T11:00:31Z
  resolution: |
    Added `migrations: { path: path.join(__dirname, "migrations") }` to
    server/prisma/prisma.config.ts's defineConfig() call, alongside the existing `schema` field.

    Re-verified live: stopped and removed both containers, deleted dev-data/docktor/db's
    contents (genuine cold start, not a reused volume), rebuilt the image, and ran
    `docker compose up -d` again. docktor's logs now read:
      "[schema-sync] applied: ..." / "2 migrations found in prisma/migrations" /
      "Applying migration `0_init`" / "Applying migration `20260917083545_add_certificate`" /
      "All migrations have been successfully applied."
    No P2021/"does not exist" errors anywhere in the full container log (previously present on
    every BackupRecovery/DiskChecker/BackupScheduler/StatePoller cycle). BackupScheduler now
    reports "Registered 0 backup schedule(s)" instead of crashing. `GET /api/setup/status`
    returns `{"setupComplete":false}` — a live, Setting-table-backed response, not an error.

    This also resolves the root cause behind WINDOWS.md #10 and #11 (the Branch-B "unverified
    live baseline/migration apply" gaps carried since 09-03/09-05) — both were blocked on DB
    reachability from the original sandboxed session, but the actual defect was this config gap,
    not connectivity. A developer should still re-run 09-03-SUMMARY.md's 4-command baseline
    sequence and 09-05's certSource-backfill check against a database that went through the old
    `db push` path (not a genuinely fresh one like this retest), since that branch of
    schema-sync.ts's logic (needsBaseline + hasApplicationTables + migrate resolve --applied)
    is still unexercised live — this retest only proves the fresh-database path.
