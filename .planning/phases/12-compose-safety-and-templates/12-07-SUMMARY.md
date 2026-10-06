---
phase: 12-compose-safety-and-templates
plan: 07
subsystem: api
tags: [prisma, migration, templates, git, repository, review-gate, d-05, d-08]

requires:
  - phase: 12-compose-safety-and-templates
    provides: "12-04's GitExecutor/gitExecutor, TemplateSourceReader/templateSourceReader, templateRepoUrlSchema/templateVariantParamsSchema/templateRepoParamsSchema and 12-05's StackService.createStack review-before-apply enforcement (previewNewStack/ConfirmationRequiredError), which createStackFromVariant reuses unchanged"
provides:
  - "server/prisma/schema/template.prisma — TemplateRepo/Template/TemplateVariant models"
  - "server/prisma/schema/stack.prisma — templateRepoUrl/templatePath/templateCommitSha/templateContentHash/templateUpdateAvailable/deployWarnings columns (the phase's single migration — plans 12-08/12-11 build on these columns without another schema change)"
  - "server/src/repositories/template-repository.ts — TemplateRepository + templateRepository singleton (ensureRepo, createRepo, findAllRepos, findRepoByIdOrThrow, recordSyncSuccess, recordSyncFailure, listTemplateIndex, findVariantByIdOrThrow)"
  - "server/src/application/template-service.ts — TemplateService + templateService singleton (ensureDefaultRepo, syncRepo, listTemplates, getVariant, createStackFromVariant, syncStaleRepos) and its TemplateServiceConfig/TemplateStackCreator/TemplateCatalog/TemplateRepoView/TemplateSummaryView/TemplateVariantView types"
  - "server/src/domain/template-pin.ts — TemplatePin"
  - "server/src/application/stack-service.ts — CreateStackOptions {templatePin?}; createStack(input, options?) now accepts and forwards a template pin"
  - "GET /api/templates, GET /api/templates/variants/:variantId, POST /api/templates/variants/:variantId/stacks, POST /api/template-repos/:repoId/sync"
affects: [12-08, 12-09, 12-10, 12-11]

actuals:
  tokens: 19032
  tasks: 3
  commits: 3
  plan_head_before: 34d78d1611b9dd5d4e6c9b31af35746079d395c7
  plan_head_after: 5f4cc8bcf6b01036edc164abd5fb64c65bf6c584

tech-stack:
  added: []
  patterns:
    - "TemplateRepo is a table from the first migration, not a setting with a list bolted on beside it (assumption-delta Signal 1, promoted) — the official repo is seeded as an ordinary isDefault row; listing/syncing/status-reporting all iterate rows uniformly"
    - "TemplateRepository.recordSyncSuccess replaces a repo's whole template/variant index in one $transaction — upsert by (repoId,slug)/(templateId,slug), then deleteMany anything no longer present — so a template/variant id is stable across re-syncs and a concurrent reader never observes a half-updated index"
    - "TemplateService.syncRepo wraps git-sync + validated-read + DB-persist in a single withKeyedLock(\"template-repo:\"+id) critical section, and never rethrows a git/read failure — it's recorded on the repo row via recordSyncFailure so one bad repo can never fail the whole catalog response"
    - "listTemplates() syncs any repo whose lastSyncAttemptAt is still null before responding (first-browse UX: the client's loading skeleton covers exactly one request, no polling) but never re-syncs an already-attempted repo on a later call"
    - "TemplateStackCreator (TemplateService's port onto StackService) is typed against the CURRENT createStack signature in this same plan's Task 2 commit, then widened to accept CreateStackOptions in Task 3's commit — avoiding a straw-man intermediate interface that would need rewriting one commit later"
    - "createStackFromVariant forwards the user's input (including an edited compose) unchanged into stacks.createStack(input, {templatePin}) — the single create path, so a ConfirmationRequiredError/428 for a dangerous template propagates exactly like a pasted-compose create (threat #2, T-12-25)"

key-files:
  created:
    - server/prisma/schema/template.prisma
    - server/prisma/migrations/20261003072056_add_template_repos_and_deploy_warnings/migration.sql
    - server/src/lib/template-config.ts
    - server/src/repositories/template-repository.ts
    - server/src/application/template-service.ts
    - server/src/domain/template-pin.ts
    - server/src/routes/templates.ts
    - server/test/unit/application/template-service.test.ts
    - server/test/integration/templates.test.ts
  modified:
    - server/prisma/schema/stack.prisma
    - server/src/app.ts
    - server/src/application/index.ts
    - server/src/application/stack-service.ts
    - server/src/repositories/index.ts
    - server/src/repositories/stack-repository.ts
    - server/test/unit/repositories/index.test.ts
    - server/test/unit/application/stack-service.test.ts
    - server/test/integration/setup.ts
    - docs/deployment.md
    - .planning/WINDOWS.md

key-decisions:
  - "Migration generated via Branch B (from-schema-copy diff technique, 09-05 precedent): docktor-db-dev is reachable at the TCP level but the Postgres wire-protocol handshake never completes (P1001) — the same documented environmental block as 05.1-01/06-01/08-01/09-03/09-05/12-01. yarn db:generate and yarn typecheck both pass against the regenerated client; WINDOWS.md entry #16 (open) records the unapplied migration for a developer/CI to run yarn db:migrate against a live database."
  - "Template-repository and stack-repository tests use hand-rolled in-memory fakes (not vi.fn() mocks) for TemplateRepository, closely mirroring the real Prisma transaction's upsert/prune semantics — this is what makes the re-sync id-stability/pruning test (surviving template keeps its id, vanished template removed, new variant added) meaningful without a database."
  - "syncStaleRepos' own try/catch around each syncRepo() call is defense-in-depth, not the primary failure-isolation mechanism — syncRepo() already never rethrows a git/read failure (it's recorded via recordSyncFailure). The wrapping catch only matters for the unreachable case of an unexpected throw between findAllRepos() and the sync call itself, keeping 'one repo failing never blocks the next' true under every failure mode, not just the expected one."
  - "The phase's single Prisma migration lives entirely in this plan (12-07), per the phase's schema-push gate — deployWarnings (12-08) and templateUpdateAvailable (12-11) columns are created here even though their writers land in later plans, so no later plan in this phase edits stack.prisma again."

requirements-completed: ["#19"]

coverage:
  - id: D1
    description: "Assumption-delta Signal 1 (promote): TemplateRepo is modelled as a table from the start, the official repo is just the first isDefault row — no separate 'default repo URL' setting with a list bolted on beside it"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "server/test/unit/application/template-service.test.ts#first sync seeds the default repo...; server/prisma/schema/template.prisma's header comment"
        status: pass
    human_judgment: false
  - id: D2
    description: "D-05/#19 default repo configured out of the box: the first GET /api/templates creates the official repo row if missing and syncs it; DOCKTOR_DEFAULT_TEMPLATE_REPO_URL overrides the URL and an empty value disables the default repo"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "server/test/unit/application/template-service.test.ts#first sync seeds the default repo.../#creates no repo row when defaultRepoUrl() returns null"
        status: pass
    human_judgment: false
  - id: D3
    description: "#19 browse: GET /api/templates returns every synced template with name/description/category/icon and its variants, plus every repo's status (last sync time, last sync error, load issues); a never-attempted repo is synced before the response is sent, a failed repo is reported, never thrown"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "server/test/unit/application/template-service.test.ts#first sync seeds.../#records a sync failure without throwing.../#surfaces reader issues on the repo view"
        status: pass
      - kind: integration
        ref: "server/test/integration/templates.test.ts#GET /api/templates → 200 with the seeded template and variant summaries...; #GET /api/templates without a session cookie → 401"
        status: unknown
    human_judgment: true
    rationale: "Written per plan but not executed in this session per the orchestrator's resource_constraint (no testcontainers-based integration runs on this host to avoid resource contention). WINDOWS.md entry #17 (open) tracks this; unit-level behavior is fully proven."
  - id: D4
    description: "Re-syncing a repo never duplicates templates or variants: the index is replaced in one transaction by upserting on (repoId,slug)/(templateId,slug) and deleting rows no longer present, so template and variant ids stay stable across syncs"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "server/test/unit/application/template-service.test.ts#re-syncing with one template renamed away and one variant added keeps the surviving template's id, removes the vanished one, and adds the new variant"
        status: pass
    human_judgment: false
  - id: D5
    description: "TemplateService.syncRepo serializes per repo id with a keyed lock covering git sync, checkout read and DB write together"
    requirement: "#19"
    verification:
      - kind: other
        ref: "grep -c 'withKeyedLock' server/src/application/template-service.ts → 2 (syncRepo's lock wraps the sync/read/persist sequence)"
        status: pass
    human_judgment: false
  - id: D6
    description: "#19 pinning: a stack created from a variant stores templateRepoUrl, templatePath, templateCommitSha and templateContentHash in the same DB write that creates the stack"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "server/test/unit/application/template-service.test.ts#calls stacks.createStack with the user's input unchanged plus the template pin; server/test/unit/application/stack-service.test.ts#passes options.templatePin through to repo.create"
        status: pass
      - kind: integration
        ref: "server/test/integration/templates.test.ts#POST /api/templates/variants/:id/stacks with a clean compose → 201, stack row carries templatePath/templateContentHash"
        status: unknown
    human_judgment: true
    rationale: "Same resource_constraint as D3 — written but not executed locally. Unit-level contract (the pin reaches repo.create verbatim) is fully proven."
  - id: D7
    description: "Template-created stacks go through StackService.createStack, so the same compose checks and 428 confirmation as any other new stack apply (threat #2)"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "server/test/unit/application/template-service.test.ts#propagates a ConfirmationRequiredError from createStack unchanged"
        status: pass
      - kind: integration
        ref: "server/test/integration/templates.test.ts#POST /api/templates/variants/:id/stacks with a privileged compose and no confirmed flag → 428"
        status: unknown
    human_judgment: true
    rationale: "Same resource_constraint as D3/D6."
  - id: D8
    description: "All template routes require authentication (requireAuth onRequest hook)"
    requirement: "#19"
    verification:
      - kind: other
        ref: "grep -c 'requireAuth' server/src/routes/templates.ts → 2 (import + plugin-level onRequest hook covering every route in the file)"
        status: pass
      - kind: integration
        ref: "server/test/integration/templates.test.ts — a 401-without-cookie case for every one of the four routes"
        status: unknown
    human_judgment: true
    rationale: "Same resource_constraint as D3/D6/D7."
  - id: "Prohibition: MUST NOT create a stack from a template through any path that skips compose-check evaluation/confirmation"
    verification:
      - kind: unit
        ref: "grep -c 'this.stacks.createStack' server/src/application/template-service.ts → 1 (the single call site — no direct repository create for template stacks); server/test/unit/application/template-service.test.ts#propagates a ConfirmationRequiredError from createStack unchanged"
        status: pass
    human_judgment: false

duration: ~50min
completed: 2026-10-03
status: complete
---

# Phase 12 Plan 7: Server-side git-based templates — schema, sync, pinned creation Summary

**One Prisma migration for the whole phase (template tables + Stack's template-pin/deploy-warnings columns), a TemplateRepository whose recordSyncSuccess replaces a repo's entire index in one transaction, a TemplateService that seeds and syncs the official repo through the 12-04 git/read adapters under a per-repo keyed lock, and four authenticated routes — including create-from-variant, which reuses StackService.createStack unchanged so a template-sourced compose gets the exact same compose-check/428-confirmation gate as a pasted one.**

## Performance

- **Duration:** ~50 min
- **Tasks:** 3/3
- **Files touched:** 19 (across 3 commits)

## Accomplishments

- `server/prisma/schema/template.prisma` (new): `TemplateRepo`/`Template`/`TemplateVariant` with cascading deletes and the two composite uniques (`repoId+slug`, `templateId+slug`). `stack.prisma` gained the four D-08 pin columns, `templateUpdateAvailable` (12-11), and `deployWarnings` (12-08) — the phase's single migration, generated via the Branch B from-schema-copy technique (the dev DB is TCP-reachable but the Postgres wire-protocol handshake never completes, the same documented environmental block as five prior phases). `yarn db:generate`/`yarn typecheck` both pass against the regenerated client; WINDOWS.md entry #16 tracks the unapplied migration.
- `TemplateRepository` (`server/src/repositories/template-repository.ts`): the only Prisma access for the three new tables. `recordSyncSuccess` replaces a repo's whole index in one `$transaction` — upsert every template/variant by its composite key, then prune anything no longer present — so ids survive a re-sync and a concurrent reader never sees a half-updated index. Registered in `repositories/index.ts` and its reference-identity test.
- `TemplateService` (`server/src/application/template-service.ts`): `ensureDefaultRepo()`/`syncRepo()`/`listTemplates()` (Task 2), then `getVariant()`/`createStackFromVariant()`/`syncStaleRepos()` (Task 3). `syncRepo` wraps git-sync + validated-read + persist in one `withKeyedLock("template-repo:"+id)` section and never rethrows a git/read failure — it's recorded on the repo row, so one bad repo can't break the whole catalog. `listTemplates()` syncs any never-attempted repo before responding (first-browse UX needs no polling) but never re-syncs an already-attempted one. The constructor takes the full dependency list (`repo, git, reader, stacks, config`) 12-09/12-10/12-11 need, so none of them reshape it.
- `createStackFromVariant(variantId, input)` forwards the caller's input (including an edited compose) unchanged into `stackService.createStack(input, {templatePin})` — the single create path. A dangerous template compose gets `ConfirmationRequiredError`/428 exactly like a pasted one (threat #2); `stack-repository.ts`'s `create()` writes the pin's four columns in the same insert that creates the stack.
- Four authenticated routes (`requireAuth` on the whole plugin): `GET /api/templates`, `GET /api/templates/variants/:variantId`, `POST /api/templates/variants/:variantId/stacks` (201), `POST /api/template-repos/:repoId/sync`.
- `docs/deployment.md` gained `DOCKTOR_DEFAULT_TEMPLATE_REPO_URL`/`DOCKTOR_TEMPLATE_CACHE_DIR` rows linking to `docs/templates.md`.
- 23 new/extended unit tests (14 template-service, 2 stack-service, plus the repositories-index addition) — full server unit suite: **1277/1277 passing**. `yarn typecheck`: clean across all three workspaces.

## Task Commits

1. **Task 1: [BLOCKING] Prisma schema for template repos, stack template pin and deploy warnings** — `88b08f5` (feat)
2. **Task 2: End-to-end GET /api/templates — seed, sync, persist, respond** — `e509376` (feat)
3. **Task 3: Variant detail, create-from-variant with version pin, manual/stale repo sync, deployment docs** — `5f4cc8b` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `server/prisma/schema/template.prisma` (new) — `TemplateRepo`/`Template`/`TemplateVariant`
- `server/prisma/schema/stack.prisma` — six new columns (template pin ×4, `templateUpdateAvailable`, `deployWarnings`)
- `server/prisma/migrations/20261003072056_add_template_repos_and_deploy_warnings/migration.sql` (new, Branch B generated)
- `server/src/lib/template-config.ts` (new) — `OFFICIAL_TEMPLATE_REPO_URL`, `getDefaultTemplateRepoUrl()`, `getTemplateCacheDir()`
- `server/src/repositories/template-repository.ts` (new) + `repositories/index.ts` — `TemplateRepository`/`templateRepository`
- `server/src/application/template-service.ts` (new) + `application/index.ts` — `TemplateService`/`templateService`
- `server/src/domain/template-pin.ts` (new) — `TemplatePin`
- `server/src/application/stack-service.ts` — `CreateStackOptions`, `createStack(input, options?)`
- `server/src/repositories/stack-repository.ts` — `create()` accepts `templatePin?`
- `server/src/routes/templates.ts` (new) + `app.ts` registration
- `docs/deployment.md` — two new env var rows
- `.planning/WINDOWS.md` — entries #16 (unapplied migration) and #17 (unrun integration tests)
- Tests: `server/test/unit/application/template-service.test.ts` (new, 14 cases), `server/test/unit/application/stack-service.test.ts` (+2 cases), `server/test/unit/repositories/index.test.ts` (+1 entry), `server/test/integration/templates.test.ts` (new, 11 cases, not run locally), `server/test/integration/setup.ts` (`cleanDatabase()` extended)

## Decisions Made

See `key-decisions` in frontmatter. In short: Branch B migration generation (same documented environmental TCP-vs-Postgres-protocol block as five prior phases); hand-rolled in-memory `TemplateRepository` fakes (not `vi.fn()` mocks) so the re-sync id-stability/pruning test is meaningful; `TemplateStackCreator`'s interface is deliberately typed against the pre-Task-3 `createStack` signature in Task 2's own commit, then widened in Task 3 — avoiding a throwaway intermediate type.

## Deviations from Plan

None — plan executed exactly as written. Every `<behavior>` line in both TDD tasks is covered by a dedicated test, every `<verify>` unit/typecheck command passed, and every `<acceptance_criteria>` grep matched. The plan's own Task 1 action text anticipated the Branch B database-unreachable fork and the exact WINDOWS.md recording instruction for it; Task 2/3's resource_constraint (no local integration runs this session) is an orchestrator-level instruction for this run, not a plan deviation — it is handled exactly the same way prior plans in this phase (12-01, 12-04, 12-05, 12-06) have handled the pre-existing P1001 environmental block: integration tests are written, not executed, and the gap is recorded in WINDOWS.md rather than asserted as passing.

## Issues Encountered

- **Migration generation (Branch A attempted, Branch B taken):** `docktor-db-dev` is up and its port is published; a raw TCP connect to `localhost:5432` succeeds, but the Postgres wire-protocol handshake never completes (`prisma migrate status` → P1001). Same class as 05.1-01/06-01/08-01/09-03/09-05/12-01. Generated the migration via `prisma migrate diff` between a scratch copy of the pre-change schema and the current schema, requiring a placeholder (non-functional) `DATABASE_URL` only because the schema engine refused to run with none set at all — no real credential or host was ever used. Recorded as WINDOWS.md entry #16.
- **`yarn` not on PATH / corepack `enable` failing with `EACCES`** on this sandbox (no write access to `/usr/local/bin`): worked around by invoking `corepack yarn@4.13.0 <command>` directly throughout the session instead of a bare `yarn` — functionally identical, no project files changed by this workaround.
- **Server unit suite (1277/1277) and `yarn typecheck` (clean)** both re-run after Task 3 to confirm no regression from the widened `createStack` signature and the new `stack-repository.ts`/`stack-service.ts` touches — none found.

## User Setup Required

A developer with access to an unrestricted host (reachable Postgres wire protocol) must:
1. Run `yarn db:migrate` (or `prisma migrate deploy`) to apply `20261003072056_add_template_repos_and_deploy_warnings` to a live database, then confirm the `TemplateRepo`/`Template`/`TemplateVariant` tables and the six new `Stack` columns exist (WINDOWS.md entry #16).
2. Run `yarn workspace @docktor/server test:integration test/integration/templates.test.ts` to confirm the 11 new integration cases pass live (WINDOWS.md entry #17).

## Next Phase Readiness

- Plan 12-08 writes `Stack.deployWarnings` (column already exists from this plan's migration) and can call `ComposeReviewService.evaluateCurrentStack` (12-05) as its pre-deploy re-check entry point.
- Plan 12-09 (template browsing UI) consumes `GET /api/templates`'s `TemplateCatalog` shape and `GET /api/templates/variants/:id`'s `TemplateVariantView` shape directly.
- Plan 12-10 (add a template repo) can call `TemplateRepository.createRepo()` (already implemented, throws `ConflictError` on a duplicate url) via a new route — no repository change needed.
- Plan 12-11 writes `Stack.templateUpdateAvailable` (column already exists) and calls `TemplateService.syncStaleRepos(maxAgeMs)` (already implemented) on its own job cadence.
- No blockers for proceeding with the next wave's plans.

---

*Phase: 12-compose-safety-and-templates*
*Completed: 2026-10-03*

## Self-Check: PASSED
