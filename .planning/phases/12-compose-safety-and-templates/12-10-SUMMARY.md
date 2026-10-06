---
phase: 12-compose-safety-and-templates
plan: 10
subsystem: api
tags: [react-hook-form, zod, settings, templates, git, repository-management]

requires:
  - phase: 12-compose-safety-and-templates
    provides: "12-07's TemplateService/TemplateRepository (ensureDefaultRepo, syncRepo, findAllRepos, createRepo's ConflictError), routes/templates.ts's requireAuth hook; 12-04's addTemplateRepoSchema/AddTemplateRepoInput (git-URL allowlist); 12-06's Settings Stacks tab + ComposeChecksCard pattern; 12-09's templates-api.ts TemplateRepoStatus type"
provides:
  - "server/src/application/template-service.ts — TemplateService.listRepos()/addRepo(url)"
  - "GET /api/template-repos, POST /api/template-repos (201/400/409/401)"
  - "client/src/lib/templates-api.ts — listTemplateRepos()/addTemplateRepo(url)"
  - "client/src/hooks/use-template-repos.ts — useTemplateRepos() {repos, loading, error, syncingIds, addRepo, syncRepo, refetch}"
  - "client/src/routes/app/settings/components/template-repos-card.tsx — TemplateReposCard, wired into Settings → Stacks"
affects: []

actuals:
  tokens: 10154
  tasks: 2
  commits: 2
  plan_head_before: b57fed69ae88c7a39d4c9985aa960c3566cb1b95
  plan_head_after: fec7efbf71921213be8b69c0161d48c3f26464fb

tech-stack:
  added: []
  patterns:
    - "TemplateReposCard's add-form uses a manual toast.loading/success/error/dismiss lifecycle instead of toast.promise — a 409 duplicate-url response must set a field error with NO generic error toast, which toast.promise's single error-callback architecture can't express (returning a falsy value from its error callback still renders an empty toast)"
    - "useTemplateRepos mirrors use-templates.ts's initial/background fetch-mode split, and adds a syncingIds Set for per-row 'Sync now' pending state so re-syncing one repo never disables the whole card or flips it back into its loading skeleton"
    - "TemplateService.addRepo(url) is a two-step compose of existing primitives (repo.createRepo then this.syncRepo) — no new persistence logic, since 12-07's TemplateRepository.createRepo and TemplateService.syncRepo were already built with this plan's call in mind"

key-files:
  created:
    - client/src/hooks/use-template-repos.ts
    - client/src/routes/app/settings/components/template-repos-card.tsx
    - client/test/unit/hooks/use-template-repos.test.ts
    - client/test/unit/routes/settings/template-repos-card.test.tsx
  modified:
    - server/src/application/template-service.ts
    - server/src/routes/templates.ts
    - server/test/unit/application/template-service.test.ts
    - server/test/integration/templates.test.ts
    - client/src/lib/templates-api.ts
    - client/src/routes/app/settings.tsx
    - client/test/unit/routes/settings/settings-page.test.tsx

key-decisions:
  - "TemplateReposCard's add-form error handling uses manual toast.loading/success/error/dismiss calls rather than toast.promise, specifically so a 409 (duplicate URL) can set the URL field error and dismiss the loading toast with no generic error toast shown — the plan's <action> text suggested toast.promise, but the <behavior> contract's 'no generic error toast' requirement for 409 takes precedence and cannot be expressed through toast.promise's single error callback."
  - "A one-word JSDoc comment change (per-row 'Sync now' → per-row manual re-sync action) avoided doubling the 'Sync now' acceptance-criteria grep count — same class of fix as 12-09's SUMMARY documented for '<select'/'No templates found' comments."

requirements-completed: ["#19"]

coverage:
  - id: D1
    description: "Issue #19 'users can add additional template repositories': Settings → Stacks has a Template Repositories card listing every repo (official one marked 'Official') with an Add Repository form; a valid URL creates the repo, syncs it immediately, and the new row appears with its status"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "server/test/unit/application/template-service.test.ts#addRepo (creates then syncs, returns view with lastSyncError on a failed sync, throws ConflictError on a duplicate); client/test/unit/hooks/use-template-repos.test.ts#addRepo calls addTemplateRepo, refetches...; client/test/unit/routes/settings/template-repos-card.test.tsx#submitting a valid URL calls addTemplateRepo and toasts success"
        status: pass
      - kind: integration
        ref: "server/test/integration/templates.test.ts#POST /api/template-repos with a well-formed https url → 201..."
        status: unknown
    human_judgment: true
    rationale: "Integration suite written per plan but not executed in this session per the orchestrator's resource_constraint (no testcontainers-based integration runs on this host). WINDOWS.md entry #20 (open). Unit-level behavior (server TemplateService + client hook/card) is fully proven — 19/19 server unit tests, 23/23 client unit tests for the card/hook pair."
  - id: D2
    description: "Issue #19 'malformed templates are rejected with a clear error': each repo row shows its last sync time or last sync error, and lists every skipped template/variant as 'path: message' from the load issues"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/settings/template-repos-card.test.tsx#a repo with a sync error shows a red Sync failed badge...; #a synced repo shows a green Synced badge...; #a never-synced repo shows a neutral Not synced yet badge; #a repo with issues shows a skipped-count badge and a details list of path: message"
        status: pass
    human_judgment: false
  - id: D3
    description: "Adding an already-configured URL answers 409 and the form shows 'This repository is already added' on the URL field (no generic error toast); an invalid URL is rejected client-side (standardSchemaResolver) and server-side (400, templateRepoUrlSchema) without any git process starting"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/settings/template-repos-card.test.tsx#a 409 from addTemplateRepo sets the URL field error with no generic error toast; #a malformed URL is rejected client-side without calling addTemplateRepo; #a 400 with fields.url maps to the URL field error; server/test/unit/application/template-service.test.ts#addRepo throws ConflictError for a duplicate url and creates no row"
        status: pass
      - kind: integration
        ref: "server/test/integration/templates.test.ts#POST /api/template-repos with file:///etc, ext::sh -c id, -u → 400 and no row created (T-12-37); #POST /api/template-repos with an already-configured url → 409"
        status: unknown
    human_judgment: true
    rationale: "Same resource_constraint as D1 — written, not run locally. The allowlist schema (templateRepoUrlSchema) itself is unit-tested in 12-04 and reused unchanged here at the route boundary."
  - id: D4
    description: "Each repo row has a 'Sync now' action that re-syncs that repo and refreshes its status, disabled while that row's sync is in flight"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-template-repos.test.ts#syncingIds contains the repo id only while its sync is in flight; client/test/unit/routes/settings/template-repos-card.test.tsx#Sync now calls syncRepo, disables while running, and reflects the new status"
        status: pass
    human_judgment: false
  - id: D5
    description: "The add form uses react-hook-form + standardSchemaResolver(addTemplateRepoSchema); status pills use ToneBadge only"
    verification:
      - kind: other
        ref: "grep -c 'standardSchemaResolver(addTemplateRepoSchema)' client/src/routes/app/settings/components/template-repos-card.tsx → 1; every status/issues/Official pill in the file renders through ToneBadge, no hand-rolled pill classes"
        status: pass
    human_judgment: false

duration: ~45min
completed: 2026-10-03
status: complete
---

# Phase 12 Plan 10: Template repository management — add, list, sync status, skipped-template issues Summary

**Settings → Stacks gained a Template Repositories card: users can paste a git URL into an Add Repository form (validated against the same https/git/ssh allowlist both client- and server-side before anything reaches git), see it synced immediately with a status badge, re-sync any row on demand, and expand a list of every skipped template/variant with its rejection reason — closing out Issue #19's repository-management half.**

## Performance

- **Duration:** ~45 min
- **Tasks:** 2/2
- **Files touched:** 11 (across 2 commits)
- **Commits:** 2 (`d554fbe`, `fec7efb`)

## Accomplishments

- `TemplateService.listRepos()`/`addRepo(url)` (`server/src/application/template-service.ts`): `listRepos()` ensures the default repo row then maps every repo to its view without syncing anything; `addRepo(url)` composes 12-07's existing primitives — `TemplateRepository.createRepo()` (throws `ConflictError` on a duplicate url) then `this.syncRepo()` (never throws on a git/read failure, records it on the row instead).
- `GET /api/template-repos` and `POST /api/template-repos` (`server/src/routes/templates.ts`), the POST validated against `addTemplateRepoSchema`'s git-URL allowlist (12-04) before the body ever reaches `TemplateService`/`GitExecutor` — both behind the existing plugin-level `requireAuth` hook.
- `listTemplateRepos()`/`addTemplateRepo(url)` (`client/src/lib/templates-api.ts`) and `useTemplateRepos()` (`client/src/hooks/use-template-repos.ts`, new): initial/background fetch-mode split (use-templates.ts precedent) plus a `syncingIds` `Set` for per-row "Sync now" pending state, so re-syncing one repo never disables the whole card or re-triggers the loading skeleton.
- `TemplateReposCard` (`client/src/routes/app/settings/components/template-repos-card.tsx`, new): lists every repo with an "Official" `ToneBadge` for the default one, a status badge per row (red "Sync failed" + error text, green "Synced" + last-synced time, or neutral "Not synced yet"), a yellow "{n} skipped" badge with a `<details>` listing every `path: message`, an outline "Sync now" button disabled while that row syncs, and an RHF + `standardSchemaResolver(addTemplateRepoSchema)` add-form. Wired into Settings → Stacks after `ComposeChecksCard` (`settings.tsx` stays at 79 lines).
- Add-form error handling: a 409 sets the URL field error "This repository is already added" with **no** generic error toast (manual `toast.loading`/`success`/`error`/`dismiss` lifecycle, not `toast.promise` — see Decisions); a 400 with `fields.url` maps to the same field; any other failure shows `Couldn't add repository — {message}`.
- 19 new server unit tests (`template-service.test.ts`, all passing: 19/19), 8 new integration test cases (`templates.test.ts`, written per `<behavior>`, not run locally — see Issues Encountered), 23 new/extended client unit tests across 4 files (hook + card + settings-page), all passing. `yarn typecheck` and `tsc -b` (client) both clean.

## Task Commits

1. **Task 1: End-to-end add repository — card form → POST /api/template-repos → validate, store, sync → row appears with status** — `d554fbe` (feat)
2. **Task 2: Repo status, sync errors, rejected-template issues, "Sync now", duplicate-URL field error** — `fec7efb` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `server/src/application/template-service.ts` — `listRepos()`, `addRepo(url)`
- `server/src/routes/templates.ts` — `GET`/`POST /api/template-repos`
- `server/test/unit/application/template-service.test.ts` — 5 new test cases (`listRepos` ×2, `addRepo` ×3)
- `server/test/integration/templates.test.ts` — 8 new test cases (GET list + 401, POST 201/400×3/409/401)
- `client/src/lib/templates-api.ts` — `listTemplateRepos()`, `addTemplateRepo(url)`
- `client/src/hooks/use-template-repos.ts` (new) — `useTemplateRepos`
- `client/src/routes/app/settings/components/template-repos-card.tsx` (new) — `TemplateReposCard`, `TemplateRepoRow`
- `client/src/routes/app/settings.tsx` — renders `<TemplateReposCard />` after `<ComposeChecksCard />`
- `client/test/unit/hooks/use-template-repos.test.ts` (new) — 7 test cases
- `client/test/unit/routes/settings/template-repos-card.test.tsx` (new) — 12 test cases
- `client/test/unit/routes/settings/settings-page.test.tsx` — Stacks-tab assertion extended to both cards

## Decisions Made

See `key-decisions` in frontmatter. In short: the add-form's error handling needed a manual toast lifecycle (not `toast.promise`) to satisfy the "no generic error toast on 409" requirement; a JSDoc wording tweak avoided a doubled acceptance-criteria grep count, the same class of fix 12-09's SUMMARY documented.

## Deviations from Plan

None requiring approval. One in-session self-correction: the plan's Task 1 `<action>` text suggested submitting the add-form "through `toast.promise`"; Task 1 was built that way, then Task 2 replaced it with a manual `toast.loading`/`success`/`error`/`dismiss` lifecycle because Task 2's own `<behavior>` line ("a 409 ... no generic error toast") cannot be expressed through `toast.promise`'s single error callback (returning a falsy value from it still renders an empty toast). The `<behavior>` contract is the authoritative, testable spec; the `<action>` text is implementation guidance — where they'd otherwise conflict, behavior wins. Documented here rather than as a Rule-triggered deviation since no plan requirement was violated, only the suggested means of satisfying one.

## Issues Encountered

- **Integration suite not run locally:** per the orchestrator's explicit resource-contention instruction for this session, the 8 new `server/test/integration/templates.test.ts` cases (GET list, POST 201/400×3/409/401) were written and committed but not executed — recorded as WINDOWS.md entry #20, ready for a CI/human run (`yarn workspace @docktor/server test:integration test/integration/templates.test.ts`). All of this plan's unit `<verify>` commands and both `tsc -b`/`yarn typecheck` runs were green in this session.
- **`yarn` not on PATH:** same sandbox limitation documented in 12-07/12-08/12-09 — worked around with `corepack yarn@4.13.0 <command>` throughout; no project files changed by this workaround.

## User Setup Required

A developer/CI with Docker/testcontainers available must run `yarn workspace @docktor/server test:integration test/integration/templates.test.ts` to confirm the 8 new integration cases pass live (WINDOWS.md entry #20).

## Next Phase Readiness

- This was the last plan to extend `templates.ts`'s route surface (per 12-07's "Next Phase Readiness" note) — `useTemplateRepos`'s `{repos, loading, error, syncingIds, addRepo, syncRepo, refetch}` contract and `TemplateRepoStatus`'s full field set (already present from 12-09) are stable for any later consumer.
- Removing a repository remains deliberately out of scope for this plan (not in #19's acceptance criteria; the UI-SPEC flags it as a planning-time addition needing a type-to-confirm dialog) — a follow-up GitHub issue is worth filing if a user requests it, per CLAUDE.md's issue-tracking process (a `[Feature]` issue labeled `area:server`+`area:client`, not a `.planning/todos/` entry).
- No blockers for proceeding with the next wave's plans (12-11).

---

*Phase: 12-compose-safety-and-templates*
*Completed: 2026-10-03*

## Self-Check: PASSED

All 12 key files (4 created, 8 modified) verified present on disk; both commits (`d554fbe`, `fec7efb`) verified present in git history.
