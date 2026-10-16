---
gsd_state_version: "1.0"
milestone: v0.1.1
milestone_name: Release Follow-ups
current_phase: 18
current_phase_name: Import and Migration Flow
status: executing
stopped_at: Completed 18-15-PLAN.md
last_updated: "2026-10-16T10:35:29.939Z"
last_activity: 2026-10-16
last_activity_desc: Phase 18 execution started
state_head: 55eff115b9f1827b88bfcd164e938943c2ee2865
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 20
  completed_plans: 18
  percent: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-14)

**Core value:** Users can deploy, monitor, and manage Docker Compose stacks through a browser UI without needing SSH or Docker CLI access.
**Current focus:** Phase 18 — Import and Migration Flow

## Current Position

Phase: 18 (Import and Migration Flow) — EXECUTING
Plan: 11 of 17
Status: Ready to execute
Last activity: 2026-10-16 — Phase 18 execution started

Progress: [██░░░░░░░░] 20%

## Performance Metrics

**Velocity:**

- Total plans completed: 3 (v0.1.1)
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 17 | 3 | - | - |

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

Last session: 2026-10-16T10:35:29.789Z
Stopped at: Completed 18-15-PLAN.md
Resume file: None
