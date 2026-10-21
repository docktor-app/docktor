---
gsd_state_version: "1.0"
milestone: v0.1.1
milestone_name: Release Follow-ups
current_phase: 20
current_phase_name: Visual Consistency, Dashboard Clarity and Touch Targets
status: executing
stopped_at: Completed 20-09-PLAN.md
last_updated: "2026-10-21T03:52:21.723Z"
last_activity: 2026-10-21
last_activity_desc: Phase 20 execution started
state_head: b5a9df2b63aff6a0bddc40ead3ab1d2493e24569
progress:
  total_phases: 5
  completed_phases: 3
  total_plans: 43
  completed_plans: 41
  percent: 60
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-14)

**Core value:** Users can deploy, monitor, and manage Docker Compose stacks through a browser UI without needing SSH or Docker CLI access.
**Current focus:** Phase 20 — Visual Consistency, Dashboard Clarity and Touch Targets

## Current Position

Phase: 20 (Visual Consistency, Dashboard Clarity and Touch Targets) — EXECUTING
Plan: 10 of 11
Status: Ready to execute
Last activity: 2026-10-21 — Phase 20 execution started

Progress: [██████░░░░] 60%

## Performance Metrics

**Velocity:**

- Total plans completed: 32 (v0.1.1)
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 17 | 3 | - | - |
| 18 | 26 | - | - |
| 19 | 3 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

v0.1.0 metrics (133 plans across Phases 1-16) are preserved in `.planning/milestones/v0.1.0-STATE.md`.
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 17 P01 | 25min | 2 tasks | 4 files |
| Phase 17 P02 | 15min | 2 tasks | 4 files |
| Phase 17 P03 | 20min | 2 tasks | 6 files |
| Phase 18 P01 | 4 min | 3 tasks | 10 files |
| Phase 18 P02 | 8 min | 3 tasks | 10 files |
| Phase 18 P03 | 4 min | 3 tasks | 10 files |
| Phase 18 P04 | 3 min | 2 tasks | 9 files |
| Phase 18 P05 | 8 min | 3 tasks | 11 files |
| Phase 18 P06 | 28 min | 2 tasks | 8 files |
| Phase 18 P08 | 8 min | 2 tasks | 3 files |
| Phase 18 P09 | 8 min | 2 tasks | 12 files |
| Phase 18 P07 | 8 min | 3 tasks | 9 files |
| Phase 18 P10 | 5 min | 3 tasks | 6 files |
| Phase 18 P11 | 18 min | 3 tasks | 17 files |
| Phase 18 P12 | 10 min | 3 tasks | 13 files |
| Phase 18 P14 | 14 min | 3 tasks | 10 files |
| Phase 18 P15 | 30 min | 3 tasks | 10 files |
| Phase 18 P16 | 25 min | 2 tasks | 10 files |
| Phase 18 P17 | 15 min | 3 tasks | 16 files |
| Phase 18 P18 | 10min | 2 tasks | 3 files |
| Phase 18 P19 | 40min | 3 tasks | 9 files |
| Phase 18 P20 | 15min | 3 tasks | 8 files |
| Phase 18 P21 | 6 min | 2 tasks | 6 files |
| Phase 18 P22 | 6 min | 3 tasks | 16 files |
| Phase 18 P23 | 20min | 2 tasks | 6 files |
| Phase 18 P24 | 10min | 2 tasks | 4 files |
| Phase 18 P25 | 12min | 2 tasks | 8 files |
| Phase 18 P26 | 6min | 3 tasks | 12 files |
| Phase 19 P01 | 4 min | 2 tasks | 6 files |
| Phase 19 P02 | 8min | 2 tasks | 7 files |
| Phase 19 P03 | 20min | 3 tasks | 13 files |
| Phase 20 P01 | 10min | 3 tasks | 13 files |
| Phase 20 P02 | 10min | 3 tasks | 11 files |
| Phase 20 P03 | 8min | 2 tasks | 9 files |
| Phase 20 P04 | 6min | 3 tasks | 16 files |
| Phase 20 P05 | 10min | 2 tasks | 8 files |
| Phase 20 P06 | 10min | 2 tasks | 4 files |
| Phase 20 P07 | 12min | 3 tasks | 17 files |
| Phase 20 P08 | 15min | 3 tasks | 10 files |
| Phase 20 P09 | 8min | 3 tasks | 9 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Roadmap decisions for v0.1.1:

- [Roadmap v0.1.1]: Five phases (17-21), numbering continues from v0.1.0 which ended at Phase 16
- [Roadmap v0.1.1]: STK-03 (hide Docktor's own stack from "Import existing stack") is grouped with MIG-01..04 in Phase 18, not with the server fixes in Phase 17, because both live on the brownfield import surface (`brownfield-import.tsx`, `BrownfieldScanner`, migration wizard)
- [Roadmap v0.1.1]: UI-01, UI-06 and UI-07 form one phase (19): sidebar sections, Templates entry and version/links block share `app-sidebar.tsx` / `nav-user.tsx` and the collapsed + mobile constraints
- [Roadmap v0.1.1]: A11Y-01 (44px touch targets) and DASH-01/02 ride with the visual-polish phase (20) because they touch the same call sites (data-table pagination, dashboard cards); `components/ui/` stays untouched, so sizing is applied at call sites
- [Roadmap v0.1.1]: REL-01 is its own final phase (21) so the version bump, changelog and green-CI gate run after every other change lands on the branch
- [Phase 17]: Remote restic repos are per-stack sub-repos (s3 <bucket>/<stackId>, sftp <repoPath>/<stackId>); remote config errors hard-fail via BadRequestError, never falling back to local
- [Phase 17]: Plan 17-02: tier-3 port-conflict self-exclusion keyed on the deploying stack's own running containers (compose project = stack id), kept in pure domain function (D-06)
- [Phase 17]: SSH state for restic SFTP lives in <stacksDir>/.docktor/ssh so the host pin persists across container recreation; key file is 0600 per run and removed in finally
- [Phase 18]: 18-01: Own-stack exclusion is exact compose-file equality via Docktor's own bind mounts, fail-open with no name/image heuristic, filtered in OnboardingService.scan (D-01/D-02/D-03)
- [Phase 18]: 18-02: brownfield request bodies fully replaced by shared Zod schemas; composePath confined to compose file names (T-18-05); computeUnifiedDiff is the only server diff generator (D-04)
- [Phase 18]: migrate requires explicit backup and stopOldStack booleans with no schema default (D-12)
- [Phase 18]: A failed old-stack stop aborts migration fail-closed; rollback only removes what Docktor created and restarts via docker compose start iff it stopped the stack
- [Phase 18]: 18-04: migration dialog widened via sm:max-w-5xl; reveal-secrets state kept local to MigrationReviewStep so unmount resets the mask; env masking shared via client/src/lib/env-mask.ts
- [Phase 18]: 18-05: Migration step transitions use PREVIOUS_STEP/NEXT_STEP records; stale previews guarded by a request-id ref (bumped on request, close, open=false, unmount)
- [Phase 18]: 18-06: Only ENOENT on a bind-mount source means an empty volume; copy and other access errors roll back the migration
- [Phase 18]: 18-06: migrate() = execute(await preflight()); refusals are typed BadRequestError/ConflictError, step failures stay success:false; target dir created exclusively and record deleted only when recordCreated
- [Phase 18]: 18-08: ComposeRewriter edits the original text through yaml node-range splices (never stringify); env keeps map form with KEY: ${KEY}
- [Phase 18]: 18-09: skippedDirectories stays the count and always equals skipped.length; per-root reasons (not_found incl. ENOTDIR, permission_denied, system_directory) live in skipped[]
- [Phase 18]: 18-09: scan DTOs (DiscoveredStack with relativePaths, SkippedDirectory, ScanResult) declared once as Zod schemas in @docktor/shared; server scanner, port and client re-export them
- [Phase 18]: 18-07: own-stack refusal lives in MigrationService.preflight (after empty-slug check) and OnboardingService.adoptInPlace via shared own-stack-guard; fail-open per D-02
- [Phase 18]: 18-07: setup migrate routes use requireAdminAccount preHandler throwing BadRequestError; full session requirement after admin creation accepted as residual risk T-18-23
- [Phase 18]: 18-10: kept relative mounts are copied to their own relative path (newPath = originalPath, convert true); warning wording avoids claiming backups miss kept data because restic backs up the whole stack directory
- [Phase 18]: 18-10: stack directory mounts ('.') are keep-only and consume no ./volumes/ name; named volume names are reserved before bind-mount targets get -2/-3 suffixes
- [Phase 18]: 18-11: a compose file is already managed when its directory equals a stack's hostPath (separator-normalised, exact); scan rows always carry managedStack and adopt/migrate refuse them with ConflictError after the own-stack check
- [Phase 18]: 18-12: in-place migration forces the old-stack stop, renames the original aside (validated single-segment name, must not exist) and keeps it as the backup; rollback renames it back only into a free path, otherwise leaves it untouched with manual instructions
- [Phase 18]: 18-12: migration preview now requires displayName and returns target; client previewMigration callers must send it (plan 18-15)
- [Phase 18]: 18-14: migration operations are an in-memory process-local registry (finished pruned after 1 h, max 50); a restart ends running migrations anyway
- [Phase 18]: 18-14: in-flight guard holds stack:<slug> and compose:<path> keys synchronously before preflight, released in finally on refusal or run end
- [Phase 18]: 18-15: Aside name and backup choice held as nullable user edits (string|null, boolean|null) with derived effective values; Back and re-previews never clobber an explicit choice
- [Phase 18]: 18-15: Separate migrations default backup off (G-18-7 supersedes D-07 default-on); off-state warning replaced by a neutral note naming the untouched original path
- [Phase 18]: 18-15: In-place confirms with backup false and stopOldStack true; renamed original is the backup, no extra copy
- [Phase 18]: 18-16: operation service takes the event bus as a trailing constructor parameter (default domainEventBus); rolling_back is reported first in the rollback catch; listener failures are isolated in MigrationService.report
- [Phase 18]: 18-17: migration list is read on mount and on every EventSource open; stale/duplicate operation snapshots are dropped in useMigrationOperations (finished never back to running, running never to an earlier step)
- [Phase 18]: 18-17: migration toasts are one sonner toast per operation id; description notes derive from the operation (backup, stopOldStack, keptOriginalAt) so they survive a reload
- [Phase 18]: 18-18: copyDirectory uses archive-mode cp (merge form cp -a src/. dest for existing dirs); win32 fs.cp fallback only for CI
- [Phase 18]: 18-19: bind sources are host paths; inside a container they are read only through Docktor's own bind mounts, unreadable selected sources are refused (400) in preflight/preview, only visible-but-absent sources become empty dirs (emptySources)
- [Phase 18]: 18-19: all request-controlled paths (declared source, destinations, volume names) validated in preflight via copyDestinationViolations; execute keeps assertWithin as backstop
- [Phase 18]: 18-20: extracted env names are allocated per value (KEY, SERVICE_KEY, SERVICE_KEY_n); Docktor process env, COMPOSE_/DOCKER_ names, compose-referenced names and conflicting old .env keys are never used
- [Phase 18]: 18-20: old .env is read ENOENT-only in preview and execute; unreadable fails and rolls back
- [Phase 18]: 18-21: empty bind-mount sources render as escaped code text in a warning Alert on the review step (break-all, dark variants); no note for an empty list
- [Phase 18]: 18-22: directory identity (namespace-tagged host:/container: keys from spelling, realpath and own bind mounts) replaces path-string comparison for migration target classification and managed-stack detection; in-place originals are addressed through the writable stacks-folder spelling
- [Phase 18]: 18-23: Docker events and reconcile of one compose project run in order under withKeyedLock('state-poller:<project>'); kill is no longer subscribed
- [Phase 18]: 18-25: containers attributed to a stack by compose project AND compose directory via canonical identity; unlabelled containers and unknown mounts keep the project-only rule
- [Phase 18]: 18-26: refuse (not auto-rename) a stop-off migration whose old and new stack share the compose project name; prediction follows .env COMPOSE_PROJECT_NAME, name:, directory
- [Phase 19]: 19-01: sidebar section labels/order/items live only in sidebar-nav.ts; active state is segment-aware (no startsWith); mobile sheet closes via setOpenMobile(false) on nav Link click
- [Phase 19]: /templates and /stacks/create/templates share TemplateBrowsePage; header variant derives from pathname
- [Phase 19]: Zero-templates EmptyState suppressed when any repo has a lastSyncError (its alert explains the empty catalog)
- [Phase 19]: Version comes from client/package.json via Vite/Vitest define (no request); docs link targets getdocktor.dev; collapsed rail uses one Info dropdown button
- [Phase 20]: Status casing owned by formatStatusLabel in lib/status-labels.ts; badge files re-export (D-01/D-02)
- [Phase 20]: Stack-name breadcrumb always links to the stack overview via shared StackBreadcrumb (D-12, UI-09)
- [Phase 20]: 20-02: uncontrolled and controlled table sorting share one SortableHead; card layout in table-cards.tsx keeps Sort toolbar, expanded content and footer below md
- [Phase 20]: 20-03: single TOUCH_TARGET (max-md:size-11) applied per site via cn(); pagination buttons moved to icon-sm so the constant overrides the same size property
- [Phase 20]: 20-04: label-to-input gap stays 8px; FormStack is the single place to change the form rhythm; setup steps drop CardFooter for FormActions
- [Phase 20]: 20-05: Geist Mono family name is 'Geist Mono Variable'; --font-mono token set in @theme inline, font self-hosted via @fontsource-variable/geist-mono 5.3.0
- [Phase 20]: 20-06: stack tab bar extracted to StackTabBar; overflow-y-hidden + 4px padding wrapper, scrollIntoView optional-called (no global jsdom stub)
- [Phase 20]: 20-07: hasBackup derived from completed MANUAL/SCHEDULED Backup rows via StackBackupReadRepo port; merged in listStacks only; StatCard hint prop is generic
- [Phase 20]: 20-08: storage stacks fully migrated to DataTable with controlled sort and renderExpanded volume rows (no TableFrame fallback needed)
- [Phase 20]: 20-09: certificate file fields use FormItem + Label inside FormStack so the shared 8px label gap applies
- [Phase 20]: 20-09: dialog forms use FormStack + FormActions variant=dialog; backup-schedule switch rows shrink gap-3 to 8px under the descendant rule

### Pending Todos

Product work is tracked in GitHub Issues (`docktor-app/docktor`), not `.planning/todos/`. The v0.1.0-era `.planning/todos/pending/` list is preserved in `.planning/milestones/v0.1.0-STATE.md`.

### Blockers/Concerns

- Docs site (`docktor-app/docks`) Backups guide labels SFTP/S3 settings "not used in v0.1.0" (16-08 decision); README and `docs/design.md` claim they work. Update after Phase 17 ships BKP-01. Outside this repo.
- The execution host is shared with real unrelated Docker workloads: run no heavy local actions (full `tsc --build`, integration tests, Playwright, full builds); GitHub Actions CI runs them. Any live `docker compose` test must use a collision-proof, randomly generated project/directory name (05.1-03 incident).
- Older open concerns (db-push upgrade-path live verification, GitHub Actions SHA pinning, README screenshots/GIF still to record) are recorded in `.planning/milestones/v0.1.0-STATE.md`.

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| Demo | Public demo instance that resets hourly (#53) | Open in GitHub Issues | v0.1.0 close | v0.1.0 |
| Backlog | Phase 999.1: container-name variable follow-up from Phase 12 UAT | Backlog | 2026-10-04 | v0.1.0 |
| Features | Remote backups feature (#81), warning suppression (#83), WebSocket proxy (#86), uptime reset (#84), fresh template images (#82), YAML checks (#77), password reset (#79), OIDC (#87), structured logging (#70) | Future requirements (see REQUIREMENTS.md) | 2026-10-14 | v0.1.1 |

## Session Continuity

Last session: 2026-10-21T03:52:21.281Z
Stopped at: Completed 20-09-PLAN.md
Resume file: None
