---
schema_version: 1
open_count: 22
waived_count: 0
fixed_count: 8
total_count: 30
last_updated: 2026-10-08T14:22:59.073Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 05 | unrun-verify | server/test/integration/setup-concurrency.test.ts |  | Integration test cannot be executed in this sandboxed worktree: testcontainers postgres:17 TCP connect succeeds but protocol-level data never flows (confirmed with raw pg.Client and prisma db push both hanging/failing identically on the pre-existing, unmodified stacks.test.ts) — a Docker-outside-of-Docker networking limitation, not a code defect. tsc and all static acceptance criteria (getPrisma export, setting.deleteMany, no createTestUser, Promise.all present) pass. | open |  | 2026-08-31T13:32:33.722Z |  |
| 2 | 05.1 | unrun-verify | server/test/integration/setup.ts |  | yarn workspace @docktor/server test:integration could not be verified to exit 0 in this session — confirmed host-level TCP-to-Docker-published-port block (not a repo defect); see 05.1-01-SUMMARY.md Known Limitation | fixed |  | 2026-09-01T14:19:41.957Z | 2026-09-11T21:28:33.756Z |
| 3 | 05.1 | unrun-verify | .planning/phases/05.1-stabilization-fix-blockers-and-majors-surfaced-during-testin/05.1-02-SUMMARY.md |  | Manual two-browser-tab verification (plan 05.1-02 verification item 4: Deploy shows Deploying badge live in every open tab; compose/env save shows config-changed banner live without reload) could not be executed — no running Docktor instance/browser available in this session. All underlying unit-level behavior is proven (D1-D5). | fixed |  | 2026-09-02T07:47:09.421Z | 2026-09-11T21:28:52.125Z |
| 4 | 05.1 | unrun-verify | docker-compose.yml |  | D1 (relative bind mount lands at correct host path via DooD fix) was verified live once, but the live test itself caused a real-service incident (see 05.1-03-SUMMARY.md); needs re-verification in a properly isolated Docker host before being treated as a routine repeatable check | fixed |  | 2026-09-02T08:19:28.160Z | 2026-09-11T21:28:52.522Z |
| 5 | 05.1 | unrun-verify | server/src/application/backup-service.ts |  | D2 (restic archives the same physical path the containers write into) confirmed by code inspection only — not exercised via an actual restic backup+restore cycle against a real stack | fixed |  | 2026-09-02T08:19:29.253Z | 2026-09-11T21:28:52.920Z |
| 6 | 05.1 | unrun-verify | server/src/jobs/file-watcher.ts |  | Task 2 manual check (editing a running stack's .env file directly on disk shows the config-changed badge in the UI within the watcher's detection window) could not be executed — no running Docktor instance in this session. Unit-level behavior fully proven (42/42 file-watcher tests pass). | fixed |  | 2026-09-02T09:31:36.765Z | 2026-09-11T21:28:53.385Z |
| 7 | 05.1 | unrun-verify | client/src/routes/app/stacks/[id].tsx |  | Task 3 end-to-end check (introducing a YAML syntax error into a running stack's compose file makes a red indicator appear on both the stack list and detail page with no manual reload, and fixing the file clears it) could not be executed — no running Docktor instance/browser in this session. Unit-level behavior fully proven (20/20 hook tests pass). | fixed |  | 2026-09-02T09:31:37.929Z | 2026-09-11T21:28:53.844Z |
| 8 | 05.1 | unrun-verify | server/prisma/schema/stack.prisma |  | yarn db:push could not apply the two new fields (configError, lastEnvHash) to the live dev database — same documented host-level TCP-to-Docker-published-port block as 05.1-01/05.1-05 (raw TCP connects to docktor-db-dev:5432 but the Postgres protocol handshake never completes). yarn db:generate succeeded (schema is syntactically valid), and both workspaces type-check clean against the regenerated Prisma client. | open |  | 2026-09-02T09:31:39.036Z |  |
| 9 | 05.1 | unrun-verify | server/test/integration/imports.test.ts |  | New imports.test.ts (401 rejection x4, scan+adopt round-trip, T-05-09 410 regression guard) could not execute in this sandbox — same confirmed environmental P1001 TCP-to-Docker-published-Postgres-port block documented in 05.1-01/05.1-05 SUMMARYs. Code reviewed against passing sibling test files (stacks.test.ts, setup-wizard-flow.test.ts) but never run to green. | fixed |  | 2026-09-02T10:06:02.732Z | 2026-09-11T21:28:54.285Z |
| 10 | 09 | unrun-verify | server/src/lib/schema-sync.ts |  | Task 3 of 09-03-PLAN.md: live baselining (migrate resolve --applied 0_init, migrate deploy x2, migrate diff drift probe) against the dev DB could not run — TCP connect to localhost:5432 succeeds but the Postgres protocol handshake never completes (same class as 05.1-01/05.1-05/05.1-06/06-01/06-07/08-01/WINDOWS #1/#8, confirmed independently via raw pg.Client and prisma migrate status, both P1001/timeout). migrate deploy's real no-op stdout text is therefore still unverified against the classification regex in schema-sync.ts. A developer on an unrestricted host must run the 4-command sequence recorded in 09-03-SUMMARY.md. | open |  | 2026-09-16T08:06:44.168Z |  |
| 11 | 09 | unrun-verify | server/prisma/migrations/20260917083545_add_certificate/migration.sql |  | Plan 09-05 Task 3 Branch B: migration generated without a database (from-schema-copy diff technique, matches 09-03's entry #10 precedent) — TCP connect to localhost:5432 succeeds but the Postgres wire-protocol handshake never completes (confirmed via prisma migrate status P1001 and a raw pg.Client 8s timeout, same class as 05.1-01/05.1-05/05.1-06/06-01/06-07/08-01/09-03). No live database has this migration applied; the certSource backfill onto pre-existing ProxyConfig rows is therefore unverified. A developer on an unrestricted host must run: yarn db:migrate (will detect this migration as already written and pending) then verify every existing ProxyConfig row has certSource='acme' and migration history shows 0_init followed by this migration. | open |  | 2026-09-17T08:36:50.295Z |  |
| 12 | 09 | unrun-verify | client/src/routes/app/stacks/components/proxy-tab.tsx |  | Live end-to-end confirmation that a real proxy stack with a genuinely uploaded certificate serves HTTPS correctly (and acme-companion attempts no issuance for that domain) has not been exercised in any session across plans 09-06/09-07/09-08 — proven only via source-level logic, real compose-YAML parsing, and a real self-signed fixture certificate's expiry, never a live nginx-proxy/acme-companion deployment. A developer on an unrestricted host must upload a real cert through the browser, assign it to a domain, and confirm both HTTPS serving and no ACME issuance attempt. | open |  | 2026-09-17T18:41:50.828Z |  |
| 13 | 11 | deviation | client/test/integration/stacks.spec.ts |  | Pre-existing (11-06) strict-mode duplicate 'Running' text (header StackStatusBadge + Overview activity pill) breaks 'stack detail page shows stack info and services'; out of 11-09's scope (compose editor only) per deferred-items.md | fixed |  | 2026-09-29T16:28:10.380Z | 2026-09-30T22:04:55.792Z |
| 14 | 12 | unrun-verify | server/test/integration/compose-checks.test.ts |  | Branch B: testcontainers P1001 (can't reach published port) blocked a live run of the new Compose Checks settings API integration test in this sandbox; written and ready for CI/human re-run | open |  | 2026-10-02T18:47:23.790Z |  |
| 15 | 12 | unrun-verify | server/test/integration/stacks.test.ts |  | Branch B: testcontainers P1001 blocked a live run of the new create-path (POST /api/stacks/preview, privileged-create 428/201) integration tests in this sandbox; written and ready for CI/human re-run | open |  | 2026-10-02T18:47:24.128Z |  |
| 16 | 12 | unrun-verify | server/prisma/migrations/20261003072056_add_template_repos_and_deploy_warnings/migration.sql |  | Branch B: testcontainers/dev-db P1001 (can't reach localhost:5432) blocked applying this migration to a live database in this sandbox; generated via prisma migrate diff (from-schema-copy technique) against the pre-change schema, not hand-written. A developer on an unrestricted host must run yarn db:migrate (or prisma migrate deploy) to apply it and verify the TemplateRepo/Template/TemplateVariant tables and the six new Stack columns exist. | open |  | 2026-10-03T07:22:02.435Z |  |
| 17 | 12 | unrun-verify | server/test/integration/templates.test.ts |  | New Templates API integration tests (GET /api/templates, GET /api/templates/variants/:id, POST /api/templates/variants/:id/stacks incl. 428 on a privileged compose, POST /api/template-repos/:id/sync incl. 404, and 401-without-cookie on every route) were written per plan 12-07's <behavior> but deliberately NOT executed in this session — the orchestrator's resource_constraint for this run forbids starting the testcontainers-based integration suite on this host to avoid resource contention with other running services. Unit-level behavior (TemplateService, StackService) is independently proven (100% passing). A developer/CI must run yarn workspace @docktor/server test:integration test/integration/templates.test.ts to confirm these live. | open |  | 2026-10-03T07:34:04.198Z |  |
| 18 | 12 | unrun-verify | client/test/integration/stacks.spec.ts |  | Two new Playwright tests (pre-deploy warnings banner with Blog-stack link, and no-banner for a stack with no deployWarnings field) were written per plan 12-08's <behavior>/<action> but deliberately NOT executed in this session per the orchestrator's resource_constraint (no Playwright/integration suites on this host to avoid resource contention). Unit-level coverage of the same rendering logic (deploy-warnings-alert.test.tsx, deploy-warnings.test.ts) passed. A developer/CI must run PLAYWRIGHT_PORT=5214 yarn workspace @docktor/client test:integration stacks.spec.ts to confirm these live. | open |  | 2026-10-03T07:53:17.965Z |  |
| 19 | 12 | unrun-verify | client/test/integration/templates.spec.ts |  | New Playwright templates.spec.ts (tracer: browse -> single-variant Use Template -> prefilled create form -> checked create -> land on the stack; plus the multi-variant picker dialog, search-with-no-match empty state, and repo-sync-error Retry flows) was written per plan 12-09's <behavior>/<action> but deliberately NOT executed in this session per the orchestrator's resource_constraint (no Playwright/integration suites on this host to avoid resource contention). Unit-level coverage of the same logic (templates-api.test.ts, use-templates.test.ts, use-create-stack-source.test.ts, template-grid.test.tsx, template-variant-dialog.test.tsx, templates-page.test.tsx, create-stack-page.test.tsx — 31 tests) all pass, and tsc -b is clean. A developer/CI must run PLAYWRIGHT_PORT=5215 yarn workspace @docktor/client test:integration templates.spec.ts to confirm these live. | open |  | 2026-10-03T08:30:00.000Z |  |
| 20 | 12 | unrun-verify | server/test/integration/templates.test.ts |  | New POST/GET /api/template-repos integration tests for plan 12-10 (201 on a well-formed https url, 400 for file://, ext::, -u payloads with no row created, 409 for an already-configured url, 401 without a cookie on both routes) were written per the plan's <behavior> but deliberately NOT executed in this session — the orchestrator's resource_constraint for this run forbids starting the testcontainers-based integration suite on this host. Unit-level TemplateService.listRepos/addRepo behavior is independently proven (19/19 passing). A developer/CI must run yarn workspace @docktor/server test:integration test/integration/templates.test.ts to confirm these live. | open |  | 2026-10-03T13:49:11.471Z |  |
| 21 | 14 | unrun-verify | server/prisma/migrations/20261008073041_add_service_health_events/migration.sql |  | add_service_health_events migration generated via migrate diff (Branch B) but not applied to the dev database; the secret-read guard blocks commands naming the dev env file. syncDatabaseSchema() applies it at next boot. | open |  | 2026-10-08T07:35:14.437Z |  |
| 22 | 14 | unrun-verify | server/prisma/migrations/20261008074500_add_stack_disk_usage/migration.sql |  | add_stack_disk_usage migration generated via migrate diff (Branch B) but not applied to the dev database; syncDatabaseSchema() applies it at next boot. | open |  | 2026-10-08T07:46:46.171Z |  |
| 23 | 14 | unrun-verify | client/src/routes/app/stacks/components/service-health-timeline.tsx |  | 14-03 human-check not performed: eyeball the expanded health history in light and dark theme at Pixel 7 width (overflow measured by script; legibility and vertical stacking not visually reviewed) | open |  | 2026-10-08T08:08:04.656Z |  |
| 24 | 14 | unrun-verify | client/src/routes/app/stacks/components/health-probe-form.tsx |  | 14-08 human-check (HTTP Health Probes section in light/dark at desktop and Pixel 7 width, long URL scroll, YAML-error swap) was reviewed from scripted Edge screenshots by the executor only, not by a person | open |  | 2026-10-08T08:31:20.996Z |  |
| 25 | 14 | unrun-verify | client/test/integration/health-probe.spec.ts |  | 14-08 canonical Playwright command not run: browsers not installed, ran on system Edge; mobile-chromium project only matches mobile.spec.ts so phone width is emulated by setViewportSize on the chromium project | open |  | 2026-10-08T08:31:21.830Z |  |
| 26 | 14 | unrun-verify | server/prisma/migrations/20261008084300_add_status_log_stack_created_index/migration.sql |  | 14-04 migration add_status_log_stack_created_index generated via migrate diff (Branch B) and not applied to the dev database; integration suite exercises the index through prisma db push, syncDatabaseSchema() applies it at next boot | open |  | 2026-10-08T08:51:58.272Z |  |
| 27 | 14 | unrun-verify | client/src/routes/app/storage.tsx |  | 14-05 Task 2 human-check not performed by a person: Storage page in light and dark theme at desktop and Pixel 7 width (80+ char names truncate with title, no horizontal scroll, chevron rotation and reduced motion, Tab order). Overflow and truncation were measured by script at 412px in storage.spec.ts only | open |  | 2026-10-08T09:11:45.184Z |  |
| 28 | 14 | unrun-verify | client/src/routes/app/stacks/components/incident-list.tsx |  | 14-07 Task 2 human-check not performed by a person: stack Overview in light and dark theme at desktop and Pixel 7 width with 30 incidents (one ongoing): tone contrast of uptime value and incident count, vertical scroll past 384px, horizontal scroll on the phone, StatCards collapsing to one column. Overflow and scroll were measured by script at 412px in uptime.spec.ts only | open |  | 2026-10-08T09:41:48.843Z |  |
| 29 | 14 | unrun-verify | client/src/routes/app/settings/components/health-retention-card.tsx |  | 14-10 human-check not performed: Health History card and shorten-retention dialog in light/dark at desktop and Pixel 7 width, validation shown on blur | open |  | 2026-10-08T13:56:26.900Z |  |
| 30 | 14 | unrun-verify | server/src/infrastructure/probe-transport.ts |  | 14-09 human-check not performed: live probe attach/detach, startup sweep and Delete Stack with active probes on a dedicated Docker host with a collision-proof project name | open |  | 2026-10-08T14:22:59.073Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "05",
    "file": "server/test/integration/setup-concurrency.test.ts",
    "line": null,
    "description": "Integration test cannot be executed in this sandboxed worktree: testcontainers postgres:17 TCP connect succeeds but protocol-level data never flows (confirmed with raw pg.Client and prisma db push both hanging/failing identically on the pre-existing, unmodified stacks.test.ts) — a Docker-outside-of-Docker networking limitation, not a code defect. tsc and all static acceptance criteria (getPrisma export, setting.deleteMany, no createTestUser, Promise.all present) pass.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-31T13:32:33.722Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "05.1",
    "file": "server/test/integration/setup.ts",
    "line": null,
    "description": "yarn workspace @docktor/server test:integration could not be verified to exit 0 in this session — confirmed host-level TCP-to-Docker-published-port block (not a repo defect); see 05.1-01-SUMMARY.md Known Limitation",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-01T14:19:41.957Z",
    "resolved_at": "2026-09-11T21:28:33.756Z"
  },
  {
    "id": 3,
    "kind": "unrun-verify",
    "phase": "05.1",
    "file": ".planning/phases/05.1-stabilization-fix-blockers-and-majors-surfaced-during-testin/05.1-02-SUMMARY.md",
    "line": null,
    "description": "Manual two-browser-tab verification (plan 05.1-02 verification item 4: Deploy shows Deploying badge live in every open tab; compose/env save shows config-changed banner live without reload) could not be executed — no running Docktor instance/browser available in this session. All underlying unit-level behavior is proven (D1-D5).",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-02T07:47:09.421Z",
    "resolved_at": "2026-09-11T21:28:52.125Z"
  },
  {
    "id": 4,
    "kind": "unrun-verify",
    "phase": "05.1",
    "file": "docker-compose.yml",
    "line": null,
    "description": "D1 (relative bind mount lands at correct host path via DooD fix) was verified live once, but the live test itself caused a real-service incident (see 05.1-03-SUMMARY.md); needs re-verification in a properly isolated Docker host before being treated as a routine repeatable check",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-02T08:19:28.160Z",
    "resolved_at": "2026-09-11T21:28:52.522Z"
  },
  {
    "id": 5,
    "kind": "unrun-verify",
    "phase": "05.1",
    "file": "server/src/application/backup-service.ts",
    "line": null,
    "description": "D2 (restic archives the same physical path the containers write into) confirmed by code inspection only — not exercised via an actual restic backup+restore cycle against a real stack",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-02T08:19:29.253Z",
    "resolved_at": "2026-09-11T21:28:52.920Z"
  },
  {
    "id": 6,
    "kind": "unrun-verify",
    "phase": "05.1",
    "file": "server/src/jobs/file-watcher.ts",
    "line": null,
    "description": "Task 2 manual check (editing a running stack's .env file directly on disk shows the config-changed badge in the UI within the watcher's detection window) could not be executed — no running Docktor instance in this session. Unit-level behavior fully proven (42/42 file-watcher tests pass).",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-02T09:31:36.765Z",
    "resolved_at": "2026-09-11T21:28:53.385Z"
  },
  {
    "id": 7,
    "kind": "unrun-verify",
    "phase": "05.1",
    "file": "client/src/routes/app/stacks/[id].tsx",
    "line": null,
    "description": "Task 3 end-to-end check (introducing a YAML syntax error into a running stack's compose file makes a red indicator appear on both the stack list and detail page with no manual reload, and fixing the file clears it) could not be executed — no running Docktor instance/browser in this session. Unit-level behavior fully proven (20/20 hook tests pass).",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-02T09:31:37.929Z",
    "resolved_at": "2026-09-11T21:28:53.844Z"
  },
  {
    "id": 8,
    "kind": "unrun-verify",
    "phase": "05.1",
    "file": "server/prisma/schema/stack.prisma",
    "line": null,
    "description": "yarn db:push could not apply the two new fields (configError, lastEnvHash) to the live dev database — same documented host-level TCP-to-Docker-published-port block as 05.1-01/05.1-05 (raw TCP connects to docktor-db-dev:5432 but the Postgres protocol handshake never completes). yarn db:generate succeeded (schema is syntactically valid), and both workspaces type-check clean against the regenerated Prisma client.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-02T09:31:39.036Z",
    "resolved_at": null
  },
  {
    "id": 9,
    "kind": "unrun-verify",
    "phase": "05.1",
    "file": "server/test/integration/imports.test.ts",
    "line": null,
    "description": "New imports.test.ts (401 rejection x4, scan+adopt round-trip, T-05-09 410 regression guard) could not execute in this sandbox — same confirmed environmental P1001 TCP-to-Docker-published-Postgres-port block documented in 05.1-01/05.1-05 SUMMARYs. Code reviewed against passing sibling test files (stacks.test.ts, setup-wizard-flow.test.ts) but never run to green.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-02T10:06:02.732Z",
    "resolved_at": "2026-09-11T21:28:54.285Z"
  },
  {
    "id": 10,
    "kind": "unrun-verify",
    "phase": "09",
    "file": "server/src/lib/schema-sync.ts",
    "line": null,
    "description": "Task 3 of 09-03-PLAN.md: live baselining (migrate resolve --applied 0_init, migrate deploy x2, migrate diff drift probe) against the dev DB could not run — TCP connect to localhost:5432 succeeds but the Postgres protocol handshake never completes (same class as 05.1-01/05.1-05/05.1-06/06-01/06-07/08-01/WINDOWS #1/#8, confirmed independently via raw pg.Client and prisma migrate status, both P1001/timeout). migrate deploy's real no-op stdout text is therefore still unverified against the classification regex in schema-sync.ts. A developer on an unrestricted host must run the 4-command sequence recorded in 09-03-SUMMARY.md.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-16T08:06:44.168Z",
    "resolved_at": null
  },
  {
    "id": 11,
    "kind": "unrun-verify",
    "phase": "09",
    "file": "server/prisma/migrations/20260917083545_add_certificate/migration.sql",
    "line": null,
    "description": "Plan 09-05 Task 3 Branch B: migration generated without a database (from-schema-copy diff technique, matches 09-03's entry #10 precedent) — TCP connect to localhost:5432 succeeds but the Postgres wire-protocol handshake never completes (confirmed via prisma migrate status P1001 and a raw pg.Client 8s timeout, same class as 05.1-01/05.1-05/05.1-06/06-01/06-07/08-01/09-03). No live database has this migration applied; the certSource backfill onto pre-existing ProxyConfig rows is therefore unverified. A developer on an unrestricted host must run: yarn db:migrate (will detect this migration as already written and pending) then verify every existing ProxyConfig row has certSource='acme' and migration history shows 0_init followed by this migration.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-17T08:36:50.295Z",
    "resolved_at": null
  },
  {
    "id": 12,
    "kind": "unrun-verify",
    "phase": "09",
    "file": "client/src/routes/app/stacks/components/proxy-tab.tsx",
    "line": null,
    "description": "Live end-to-end confirmation that a real proxy stack with a genuinely uploaded certificate serves HTTPS correctly (and acme-companion attempts no issuance for that domain) has not been exercised in any session across plans 09-06/09-07/09-08 — proven only via source-level logic, real compose-YAML parsing, and a real self-signed fixture certificate's expiry, never a live nginx-proxy/acme-companion deployment. A developer on an unrestricted host must upload a real cert through the browser, assign it to a domain, and confirm both HTTPS serving and no ACME issuance attempt.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-17T18:41:50.828Z",
    "resolved_at": null
  },
  {
    "id": 13,
    "kind": "deviation",
    "phase": "11",
    "file": "client/test/integration/stacks.spec.ts",
    "line": null,
    "description": "Pre-existing (11-06) strict-mode duplicate 'Running' text (header StackStatusBadge + Overview activity pill) breaks 'stack detail page shows stack info and services'; out of 11-09's scope (compose editor only) per deferred-items.md",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-29T16:28:10.380Z",
    "resolved_at": "2026-09-30T22:04:55.792Z",
    "milestone": "v0.1.0"
  },
  {
    "id": 14,
    "kind": "unrun-verify",
    "phase": "12",
    "file": "server/test/integration/compose-checks.test.ts",
    "line": null,
    "description": "Branch B: testcontainers P1001 (can't reach published port) blocked a live run of the new Compose Checks settings API integration test in this sandbox; written and ready for CI/human re-run",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-02T18:47:23.790Z",
    "resolved_at": null,
    "milestone": "v0.1.0"
  },
  {
    "id": 15,
    "kind": "unrun-verify",
    "phase": "12",
    "file": "server/test/integration/stacks.test.ts",
    "line": null,
    "description": "Branch B: testcontainers P1001 blocked a live run of the new create-path (POST /api/stacks/preview, privileged-create 428/201) integration tests in this sandbox; written and ready for CI/human re-run",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-02T18:47:24.128Z",
    "resolved_at": null,
    "milestone": "v0.1.0"
  },
  {
    "id": 16,
    "kind": "unrun-verify",
    "phase": "12",
    "file": "server/prisma/migrations/20261003072056_add_template_repos_and_deploy_warnings/migration.sql",
    "line": null,
    "description": "Branch B: testcontainers/dev-db P1001 (can't reach localhost:5432) blocked applying this migration to a live database in this sandbox; generated via prisma migrate diff (from-schema-copy technique) against the pre-change schema, not hand-written. A developer on an unrestricted host must run yarn db:migrate (or prisma migrate deploy) to apply it and verify the TemplateRepo/Template/TemplateVariant tables and the six new Stack columns exist.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T07:22:02.435Z",
    "resolved_at": null,
    "milestone": "v0.1.0"
  },
  {
    "id": 17,
    "kind": "unrun-verify",
    "phase": "12",
    "file": "server/test/integration/templates.test.ts",
    "line": null,
    "description": "New Templates API integration tests (GET /api/templates, GET /api/templates/variants/:id, POST /api/templates/variants/:id/stacks incl. 428 on a privileged compose, POST /api/template-repos/:id/sync incl. 404, and 401-without-cookie on every route) were written per plan 12-07's <behavior> but deliberately NOT executed in this session — the orchestrator's resource_constraint for this run forbids starting the testcontainers-based integration suite on this host to avoid resource contention with other running services. Unit-level behavior (TemplateService, StackService) is independently proven (100% passing). A developer/CI must run yarn workspace @docktor/server test:integration test/integration/templates.test.ts to confirm these live.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T07:34:04.198Z",
    "resolved_at": null,
    "milestone": "v0.1.0"
  },
  {
    "id": 18,
    "kind": "unrun-verify",
    "phase": "12",
    "file": "client/test/integration/stacks.spec.ts",
    "line": null,
    "description": "Two new Playwright tests (pre-deploy warnings banner with Blog-stack link, and no-banner for a stack with no deployWarnings field) were written per plan 12-08's <behavior>/<action> but deliberately NOT executed in this session per the orchestrator's resource_constraint (no Playwright/integration suites on this host to avoid resource contention). Unit-level coverage of the same rendering logic (deploy-warnings-alert.test.tsx, deploy-warnings.test.ts) passed. A developer/CI must run PLAYWRIGHT_PORT=5214 yarn workspace @docktor/client test:integration stacks.spec.ts to confirm these live.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T07:53:17.965Z",
    "resolved_at": null,
    "milestone": "v0.1.0"
  },
  {
    "id": 19,
    "kind": "unrun-verify",
    "phase": "12",
    "file": "client/test/integration/templates.spec.ts",
    "line": null,
    "description": "New Playwright templates.spec.ts (tracer: browse -> single-variant Use Template -> prefilled create form -> checked create -> land on the stack; plus the multi-variant picker dialog, search-with-no-match empty state, and repo-sync-error Retry flows) was written per plan 12-09's <behavior>/<action> but deliberately NOT executed in this session per the orchestrator's resource_constraint (no Playwright/integration suites on this host to avoid resource contention). Unit-level coverage of the same logic (templates-api.test.ts, use-templates.test.ts, use-create-stack-source.test.ts, template-grid.test.tsx, template-variant-dialog.test.tsx, templates-page.test.tsx, create-stack-page.test.tsx — 31 tests) all pass, and tsc -b is clean. A developer/CI must run PLAYWRIGHT_PORT=5215 yarn workspace @docktor/client test:integration templates.spec.ts to confirm these live.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T08:30:00.000Z",
    "resolved_at": null,
    "milestone": "v0.1.0"
  },
  {
    "id": 20,
    "kind": "unrun-verify",
    "phase": "12",
    "file": "server/test/integration/templates.test.ts",
    "line": null,
    "description": "New POST/GET /api/template-repos integration tests for plan 12-10 (201 on a well-formed https url, 400 for file://, ext::, -u payloads with no row created, 409 for an already-configured url, 401 without a cookie on both routes) were written per the plan's <behavior> but deliberately NOT executed in this session — the orchestrator's resource_constraint for this run forbids starting the testcontainers-based integration suite on this host. Unit-level TemplateService.listRepos/addRepo behavior is independently proven (19/19 passing). A developer/CI must run yarn workspace @docktor/server test:integration test/integration/templates.test.ts to confirm these live.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T13:49:11.471Z",
    "resolved_at": null,
    "milestone": "v0.1.0"
  },
  {
    "id": 21,
    "kind": "unrun-verify",
    "phase": "14",
    "file": "server/prisma/migrations/20261008073041_add_service_health_events/migration.sql",
    "line": null,
    "description": "add_service_health_events migration generated via migrate diff (Branch B) but not applied to the dev database; the secret-read guard blocks commands naming the dev env file. syncDatabaseSchema() applies it at next boot.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-08T07:35:14.437Z",
    "resolved_at": null,
    "milestone": "v0.1.0"
  },
  {
    "id": 22,
    "kind": "unrun-verify",
    "phase": "14",
    "file": "server/prisma/migrations/20261008074500_add_stack_disk_usage/migration.sql",
    "line": null,
    "description": "add_stack_disk_usage migration generated via migrate diff (Branch B) but not applied to the dev database; syncDatabaseSchema() applies it at next boot.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-08T07:46:46.171Z",
    "resolved_at": null,
    "milestone": "v0.1.0"
  },
  {
    "id": 23,
    "kind": "unrun-verify",
    "phase": "14",
    "file": "client/src/routes/app/stacks/components/service-health-timeline.tsx",
    "line": null,
    "description": "14-03 human-check not performed: eyeball the expanded health history in light and dark theme at Pixel 7 width (overflow measured by script; legibility and vertical stacking not visually reviewed)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-08T08:08:04.656Z",
    "resolved_at": null,
    "milestone": "v0.1.0"
  },
  {
    "id": 24,
    "kind": "unrun-verify",
    "phase": "14",
    "file": "client/src/routes/app/stacks/components/health-probe-form.tsx",
    "line": null,
    "description": "14-08 human-check (HTTP Health Probes section in light/dark at desktop and Pixel 7 width, long URL scroll, YAML-error swap) was reviewed from scripted Edge screenshots by the executor only, not by a person",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-08T08:31:20.996Z",
    "resolved_at": null,
    "milestone": "v0.1.0"
  },
  {
    "id": 25,
    "kind": "unrun-verify",
    "phase": "14",
    "file": "client/test/integration/health-probe.spec.ts",
    "line": null,
    "description": "14-08 canonical Playwright command not run: browsers not installed, ran on system Edge; mobile-chromium project only matches mobile.spec.ts so phone width is emulated by setViewportSize on the chromium project",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-08T08:31:21.830Z",
    "resolved_at": null,
    "milestone": "v0.1.0"
  },
  {
    "id": 26,
    "kind": "unrun-verify",
    "phase": "14",
    "file": "server/prisma/migrations/20261008084300_add_status_log_stack_created_index/migration.sql",
    "line": null,
    "description": "14-04 migration add_status_log_stack_created_index generated via migrate diff (Branch B) and not applied to the dev database; integration suite exercises the index through prisma db push, syncDatabaseSchema() applies it at next boot",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-08T08:51:58.272Z",
    "resolved_at": null,
    "milestone": "v0.1.0"
  },
  {
    "id": 27,
    "kind": "unrun-verify",
    "phase": "14",
    "file": "client/src/routes/app/storage.tsx",
    "line": null,
    "description": "14-05 Task 2 human-check not performed by a person: Storage page in light and dark theme at desktop and Pixel 7 width (80+ char names truncate with title, no horizontal scroll, chevron rotation and reduced motion, Tab order). Overflow and truncation were measured by script at 412px in storage.spec.ts only",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-08T09:11:45.184Z",
    "resolved_at": null,
    "milestone": "v0.1.0"
  },
  {
    "id": 28,
    "kind": "unrun-verify",
    "phase": "14",
    "file": "client/src/routes/app/stacks/components/incident-list.tsx",
    "line": null,
    "description": "14-07 Task 2 human-check not performed by a person: stack Overview in light and dark theme at desktop and Pixel 7 width with 30 incidents (one ongoing): tone contrast of uptime value and incident count, vertical scroll past 384px, horizontal scroll on the phone, StatCards collapsing to one column. Overflow and scroll were measured by script at 412px in uptime.spec.ts only",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-08T09:41:48.843Z",
    "resolved_at": null,
    "milestone": "v0.1.0"
  },
  {
    "id": 29,
    "kind": "unrun-verify",
    "phase": "14",
    "file": "client/src/routes/app/settings/components/health-retention-card.tsx",
    "line": null,
    "description": "14-10 human-check not performed: Health History card and shorten-retention dialog in light/dark at desktop and Pixel 7 width, validation shown on blur",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-08T13:56:26.900Z",
    "resolved_at": null,
    "milestone": "v0.1.0"
  },
  {
    "id": 30,
    "kind": "unrun-verify",
    "phase": "14",
    "file": "server/src/infrastructure/probe-transport.ts",
    "line": null,
    "description": "14-09 human-check not performed: live probe attach/detach, startup sweep and Delete Stack with active probes on a dedicated Docker host with a collision-proof project name",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-08T14:22:59.073Z",
    "resolved_at": null,
    "milestone": "v0.1.0"
  }
]
````
