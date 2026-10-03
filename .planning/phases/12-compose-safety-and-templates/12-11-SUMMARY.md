---
phase: 12-compose-safety-and-templates
plan: 11
subsystem: api
tags: [jobs, interval-job, templates, tone-badge, d-08]

requires:
  - phase: 12-compose-safety-and-templates
    provides: "12-07's Stack.templateRepoUrl/templatePath/templateCommitSha/templateContentHash/templateUpdateAvailable columns, TemplateRepository/TemplateService.syncStaleRepos(maxAgeMs), and domain/template-pin.ts's TemplatePin; 12-08's StackAlerts/deploy-warnings banner conventions reused for the badge's thin-wrapper shape"
provides:
  - "server/src/domain/template-pin.ts — isTemplateUpdated(pinnedHash, currentHash)"
  - "server/src/application/template-update-service.ts — TemplateUpdateService.refreshPinnedStacks(), PinnedStackStore/TemplateHashReader ports"
  - "server/src/jobs/template-repo-sync.ts — TemplateRepoSync (IntervalJob, */30 * * * *), templateRepoSync, TEMPLATE_SYNC_MAX_AGE_MS (6h) — registered last in jobs/index.ts"
  - "server/src/repositories/stack-repository.ts — findTemplatePinnedStacks(), setTemplateUpdateAvailable(id, value)"
  - "server/src/repositories/template-repository.ts — findVariantContentHashes()"
  - "client/src/components/domain/stack/template-updated-badge.tsx — TemplateUpdatedBadge, rendered in StackDetailHeader next to StackUpdateBadge"
affects: []

actuals:
  tokens: 9725
  tasks: 2
  commits: 2
  plan_head_before: 2ba4db349d5b2fbad17c1c98f105eb78dbc7a2bb
  plan_head_after: 7c974afbc2dbf7ffc45fe633f8fe66552711f316

tech-stack:
  added: []
  patterns:
    - "TemplateUpdateService depends only on two narrow ports (PinnedStackStore: find-pinned + set-flag; TemplateHashReader: current index hashes) — structurally incapable of touching a stack's compose/env files or any other column, making T-12-40 a compile-time fact, not a convention (verified by a fake whose every other method throws if invoked)"
    - "TemplateRepoSync follows UpdateChecker's exact job shape: IntervalJob subclass, lazy dynamic import() of the production application/index.ts singletons at run() time (keeps db.ts out of the unit-test module graph), registered last in jobs/index.ts after ProxyCertPoller"
    - "Each of TemplateRepoSync.run()'s two steps (syncStaleRepos, refreshPinnedStacks) gets its own independent try/catch so a failure in either can never prevent the other from running, and run() always resolves — IntervalJob.runGuarded sees a normal 'run' outcome even when both dependencies reject"
    - "isTemplateUpdated(pinnedHash, currentHash) treats a missing currentHash (removed variant, unconfigured repo) as 'not updated' by construction — re-pinning is never automatic, matching D-08's passive-badge-only guarantee"

key-files:
  created:
    - server/src/application/template-update-service.ts
    - server/src/jobs/template-repo-sync.ts
    - client/src/components/domain/stack/template-updated-badge.tsx
    - server/test/unit/domain/template-pin.test.ts
    - server/test/unit/application/template-update-service.test.ts
    - server/test/unit/jobs/template-repo-sync.test.ts
    - client/test/unit/components/domain/stack/template-updated-badge.test.tsx
  modified:
    - server/src/domain/template-pin.ts
    - server/src/repositories/stack-repository.ts
    - server/src/repositories/template-repository.ts
    - server/src/application/index.ts
    - server/src/jobs/index.ts
    - server/test/unit/jobs/index.test.ts
    - client/src/lib/stacks-api.ts
    - client/src/routes/app/stacks/components/stack-detail-header.tsx
    - client/test/unit/routes/stacks/stack-detail-header.test.tsx

key-decisions:
  - "Task split follows the plan exactly: Task 1 (tracer) ships the straight-line refresh with no per-write try/catch; Task 2 adds the per-stack-write and per-job-step isolation as a separate, reviewable hardening commit rather than folding it into Task 1."
  - "TemplateUpdatedBadge's tooltip copy names the exact template path and states the stack is unchanged, matching D-08's required copy contract verbatim ('Docktor never applies template updates automatically') rather than paraphrasing it."
  - "pinKey() joins repoUrl and path with a NUL separator (\\u0000) rather than a printable delimiter like '/' or ':', since a repo URL or template path could in principle contain either of those characters — a NUL byte cannot appear in either field."

requirements-completed: ["#19"]

coverage:
  - id: D1
    description: "isTemplateUpdated(pinnedHash, currentHash) is a pure comparison: differing hash -> true, matching hash -> false, missing currentHash (removed variant/unconfigured repo) -> false"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "server/test/unit/domain/template-pin.test.ts (3 cases)"
        status: pass
    human_judgment: false
  - id: D2
    description: "TemplateRepoSync (IntervalJob, */30 * * * *) re-syncs every template repo whose last sync attempt is older than 6 hours (or never attempted) via TemplateService.syncStaleRepos(TEMPLATE_SYNC_MAX_AGE_MS), then refreshes templateUpdateAvailable for every pinned stack; registered last in jobs/index.ts"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "server/test/unit/jobs/template-repo-sync.test.ts (calls syncStaleRepos then refreshPinnedStacks in order; still refreshes when syncStaleRepos rejects; never rejects when both reject); server/test/unit/jobs/index.test.ts (TemplateRepoSync registered/started/stopped last, in order)"
        status: pass
      - kind: other
        ref: "grep -c 'extends IntervalJob' server/src/jobs/template-repo-sync.ts -> 1; grep -c 'templateRepoSync' server/src/jobs/index.ts -> 2"
        status: pass
    human_judgment: false
  - id: D3
    description: "D-08: a stack whose pinned variant now has a different content hash in the synced index shows a passive blue 'template updated' ToneBadge in its detail header with a tooltip naming the template path and stating the stack is unchanged"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/template-updated-badge.test.tsx (4 cases, incl. tooltip hover); client/test/unit/routes/stacks/stack-detail-header.test.tsx (2 new cases, badge renders next to StackUpdateBadge)"
        status: pass
      - kind: other
        ref: "grep -c 'tone=\"blue\"' template-updated-badge.tsx -> 1; grep -c 'template updated' -> 1; grep -c 'TemplateUpdatedBadge' stack-detail-header.tsx -> 2"
        status: pass
    human_judgment: false
  - id: D4
    description: "Issue #19/D-08 prohibition: a template update never changes an existing stack's files or pin — TemplateUpdateService can only write Stack.templateUpdateAvailable"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "server/test/unit/application/template-update-service.test.ts#'across a full refresh, the stack store receives only setTemplateUpdateAvailable calls — never any other write' (fake whose every other method throws)"
        status: pass
      - kind: other
        ref: "grep -cE 'writeCompose|writeEnv|StackFilesystem|stackService' server/src/application/template-update-service.ts -> 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "A pinned variant that disappeared from its repo, or a repo that was never configured/synced, never raises the badge (flag stays/becomes false); re-pinning is never automatic; one failing per-stack write or job step never blocks the rest"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "server/test/unit/application/template-update-service.test.ts (removed-variant -> false, unknown-repo -> false, one rejecting write still processes the remaining stacks and logs the stack id); server/test/unit/jobs/template-repo-sync.test.ts#'never rejects even when both dependencies reject'"
        status: pass
    human_judgment: false

duration: ~24min
completed: 2026-10-03
status: complete
---

# Phase 12 Plan 11: Background template refresh + passive "template updated" badge Summary

**A TemplateRepoSync background job (every 30 min, 6h per-repo staleness) keeps template repos fresh and flips a template-pinned stack's `templateUpdateAvailable` flag when its upstream variant's content hash changes — surfaced as a passive blue "template updated" badge in the stack header that never applies, suggests, or auto-applies the update.**

## Performance

- **Duration:** ~24 min
- **Tasks:** 2/2
- **Files touched:** 16 (across 2 commits)

## Accomplishments

- `isTemplateUpdated(pinnedHash, currentHash)` (domain, pure): differing hash → true, matching → false, missing `currentHash` (removed variant/unconfigured repo) → false — re-pinning is never automatic.
- `StackRepository.findTemplatePinnedStacks()` (only stacks with a complete pin) and `setTemplateUpdateAvailable(id, value)` (single-column write); `TemplateRepository.findVariantContentHashes()` (every currently-synced variant's `{repoUrl, path, contentHash}`).
- `TemplateUpdateService.refreshPinnedStacks()` (new): narrow `PinnedStackStore`/`TemplateHashReader` ports — structurally incapable of writing a stack's compose/env files or any column other than the flag (T-12-40). Compares each pinned stack's stored hash against the synced index and writes only when the computed value differs from the stored flag.
- `TemplateRepoSync` (new, `IntervalJob`, `*/30 * * * *`, `TEMPLATE_SYNC_MAX_AGE_MS` = 6h): calls `TemplateService.syncStaleRepos(TEMPLATE_SYNC_MAX_AGE_MS)` then `TemplateUpdateService.refreshPinnedStacks()`, lazily loading both production singletons at run time (UpdateChecker precedent, keeps `db.ts` out of the unit-test module graph). Registered last in `jobs/index.ts`, after `ProxyCertPoller`.
- Hardening (Task 2): each per-stack `setTemplateUpdateAvailable` write is wrapped in its own try/catch (logs the stack id, continues); `TemplateRepoSync.run()` wraps `refreshPinnedStacks()` in its own try/catch so the job always resolves — even when both `syncStaleRepos` and `refreshPinnedStacks` reject — keeping `IntervalJob`'s health reporting at a normal "run" outcome instead of recording an unhandled crash loop.
- Client: `Stack` gains `templateRepoUrl`/`templatePath`/`templateUpdateAvailable`; new `TemplateUpdatedBadge` (blue `ToneBadge` + tooltip naming the template path and stating the stack is unchanged — "Docktor never applies template updates automatically"), rendered in `StackDetailHeader` immediately after `StackUpdateBadge`.
- 23 new/extended tests (3 template-pin, 9 template-update-service, 5 template-repo-sync, 2 jobs/index extensions, 4 template-updated-badge, 2 stack-detail-header extensions) — all passing. `yarn typecheck`: clean across all three workspaces. Full server unit suite re-run clean (1326/1326).

## Task Commits

1. **Task 1 (tracer): End-to-end D-08 — job re-syncs a stale repo, a changed pinned variant flips the flag, the stack header shows "template updated"** — `bac556d` (feat)
2. **Task 2: Harden — per-repo isolation in the job, removed variants and unchanged stacks, and the no-auto-apply guarantee as tests** — `7c974af` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `server/src/domain/template-pin.ts` — `isTemplateUpdated`
- `server/src/application/template-update-service.ts` (new) — `TemplateUpdateService`, `PinnedStackStore`, `TemplateHashReader`
- `server/src/jobs/template-repo-sync.ts` (new) — `TemplateRepoSync`, `templateRepoSync`, `TEMPLATE_SYNC_MAX_AGE_MS`
- `server/src/jobs/index.ts` — registers `templateRepoSync` last
- `server/src/repositories/stack-repository.ts` — `findTemplatePinnedStacks()`, `setTemplateUpdateAvailable()`
- `server/src/repositories/template-repository.ts` — `findVariantContentHashes()`
- `server/src/application/index.ts` — `templateUpdateService` singleton
- `client/src/lib/stacks-api.ts` — `Stack.templateRepoUrl`/`templatePath`/`templateUpdateAvailable`
- `client/src/components/domain/stack/template-updated-badge.tsx` (new) — `TemplateUpdatedBadge`
- `client/src/routes/app/stacks/components/stack-detail-header.tsx` — renders `TemplateUpdatedBadge`
- Tests: `server/test/unit/domain/template-pin.test.ts` (new), `server/test/unit/application/template-update-service.test.ts` (new, 9 cases), `server/test/unit/jobs/template-repo-sync.test.ts` (new, 5 cases), `server/test/unit/jobs/index.test.ts` (extended), `client/test/unit/components/domain/stack/template-updated-badge.test.tsx` (new, 4 cases), `client/test/unit/routes/stacks/stack-detail-header.test.tsx` (extended, 2 cases)

## Decisions Made

See `key-decisions` in frontmatter. In short: Task 1/Task 2 split kept exactly as planned (straight-line tracer, then a separate hardening commit); the badge tooltip copy matches D-08's required contract verbatim; `pinKey()` joins repoUrl/path with a NUL separator since either field could in principle contain a printable delimiter.

## Deviations from Plan

None — plan executed exactly as written. Every `<behavior>` line in both tasks is covered by a dedicated test, every `<verify>` unit/typecheck command passed, and every `<acceptance_criteria>` grep matched exactly as specified.

## Issues Encountered

- **Radix Tooltip in jsdom:** `TemplateUpdatedBadge`'s tooltip test needed a `ResizeObserver` stub (Radix's `Tooltip.Content` positioning internals require one) and `userEvent.hover()` + `findAllByText` instead of a synchronous query — no existing test in the repo exercised a Tooltip-hover interaction to copy from; resolved by mirroring `stack-detail-header.test.tsx`'s existing `ResizeObserver` stub pattern.
- **Full client suite host-contention flake (not attributable to this plan):** `yarn workspace @docktor/client test` (full suite, 638 tests) showed 16 failures across 11 files — including this plan's own `template-updated-badge.test.tsx` and `stack-detail-header.test.tsx` — after the suite had been running ~10 minutes under this shared host's documented load. Re-running both files in isolation passed 8/8 immediately afterward (same class of flake documented in 06-05/08-01/12-08's SUMMARYs: `env-editor.test.tsx`, `theme-toggle.test.tsx`, `template-grid.test.tsx` and others unrelated to this plan also failed in the same full run). No code change was made in response — the isolated-run pass is the authoritative signal.
- **Integration/Playwright suites:** this plan introduced no new integration or Playwright test files (unlike 12-07 through 12-10) — `<verify>` for both tasks is unit-test-and-typecheck only, so there is nothing to add to WINDOWS.md for this plan.

## User Setup Required

None — no external service configuration, no new migration, and no new integration/Playwright tests requiring a live run.

## Next Phase Readiness

- This is the last plan (11/11) in Phase 12 (Compose Safety and Templates). All of the phase's `<must_haves>` across its 11 plans are now implemented: compose diff-before-apply (12-01/12-05/12-06), dangerous-config warnings (12-02/12-05/12-06), port-conflict detection (12-03/12-08), and git-based templates including background refresh and the passive update badge (12-04/12-07/12-09/12-10/12-11).
- Open WINDOWS.md items from this phase (#14 through #20) are all `unrun-verify` entries for integration/Playwright suites that could not run on this sandboxed host per the orchestrator's resource_constraint, plus #16 (the phase's one Prisma migration, generated via Branch B and not yet applied to a live database). None are blockers to closing the phase's plan sequence — they are live-verification gaps for a developer/CI on an unrestricted host, consistent with how every prior phase in this project has handled the same documented P1001 environmental block.
- No blockers for phase closeout.

---

*Phase: 12-compose-safety-and-templates*
*Completed: 2026-10-03*

## Self-Check: PASSED

All 16 created/modified files verified present on disk; both task commits (`bac556d`, `7c974af`) verified present in git history.
