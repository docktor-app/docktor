# Roadmap: Docktor

## Overview

Docktor v0.1.0 (the first public release, Phases 1-16) is shipped. This roadmap covers **v0.1.1 (Release Follow-ups)**, a small patch release on the single branch `release/v0.1.1`: fix the bugs found right after launch and polish the interface. No new product features. Phase numbering continues from the previous milestone, so v0.1.1 starts at Phase 17.

The 22 v0.1.1 requirements (BKP, MIG, STK, DASH, UI, A11Y, REL) fall into five delivery boundaries, run in order on one branch: server-side correctness fixes first (backup repository, port warnings), then the import and migration flow, then the sidebar redesign (sidebar sections, Templates page and version block are designed together), then the cross-cutting visual polish that should land on the finished navigation, and finally the release gate. Product scope lives in GitHub Issues (`docktor-app/docktor`); each requirement in REQUIREMENTS.md cites its source issue.

## Milestones

- ✅ **v0.1.0 First Release** - Phases 1-16 (shipped; archived)
- 🚧 **v0.1.1 Release Follow-ups** - Phases 17-21 (in progress)

## Phases

<details>
<summary>✅ v0.1.0 First Release (Phases 1-16) - SHIPPED</summary>

Full roadmap archived at `.planning/milestones/v0.1.0-ROADMAP.md`; phase directories (plans, summaries, verification, UAT) at `.planning/milestones/v0.1.0-phases/`; the v0.1.0 project memory (decisions, blockers, metrics) at `.planning/milestones/v0.1.0-STATE.md`.

What shipped, by phase (Phase 05.1 was an inserted stabilization phase):

- Phases 1-4: MVP completion (settings, container state poller, live log streaming), observability (file watcher, update checker), SMTP notifications, encrypted restic backup and restore
- Phases 5, 05.1, 6: first-run wizard and brownfield import with migration, stabilization of blockers found in testing, nginx-proxy + acme-companion proxy configuration
- Phases 7-9: data-safety hardening, live SSE state consistency, deployment docs, real Prisma migrations, cross-platform CI, custom TLS certificates
- Phases 10-11: backend architecture refactor (ports, job registry, domain-event bus) and UI rework (shadcn patterns, ToneBadge/StatusDot, dark mode, CodeMirror editors)
- Phases 12-15: compose safety and git-based templates, update-checker reliability, health/uptime/disk visibility, TOTP 2FA and auth hardening
- Phase 16: release readiness (startup environment check, MIT license, community health files, published images, documentation)

Deferred past v0.1.0 and still tracked in GitHub Issues: public demo instance (#53). Backlog item 999.1 below is unchanged.

</details>

### 🚧 v0.1.1 Release Follow-ups (In Progress)

**Milestone Goal:** A small patch release that fixes the bugs found right after v0.1.0 and polishes the interface, with no new product features.

**Phase Numbering:**

- Integer phases (17, 18, 19): Planned milestone work
- Decimal phases (17.1, 17.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 17: Backup Repository and Port-Check Fixes** - Backups use the configured SFTP/S3 repository, and deploy-time port warnings stop flagging a stack's own ports (completed 2026-10-14)
- [ ] **Phase 18: Import and Migration Flow** - Docktor's own stack is not offered for import, and the migration dialog shows a real diff with explicit backup and stop-old-stack choices
- [ ] **Phase 19: Sidebar, Templates and Version Block** - Labelled sidebar sections, a standalone Templates page, and the running version plus project links above the account menu
- [ ] **Phase 20: Visual Consistency, Dashboard Clarity and Touch Targets** - One status casing, monospace KPIs, scrollbar-free tabs, shared form spacing and table look, an honest "Backups Configured" card, and 44px mobile touch targets
- [ ] **Phase 21: Release v0.1.1** - Versions bumped to 0.1.1, changelog updated, CI green on `release/v0.1.1`

## Phase Details

### Phase 17: Backup Repository and Port-Check Fixes

**Goal**: Backups go where the user configured them to go, and deploy-time port warnings are accurate: no false alarm about a stack's own ports, no missed real conflicts
**Depends on**: Nothing (first phase of v0.1.1)
**Requirements**: BKP-01, BKP-02, BKP-03, STK-01, STK-02
**Success Criteria** (what must be TRUE):

  1. With an SFTP or S3 repository configured in Settings, a manual backup, a restore and the snapshot listing for a stack all operate against that configured remote repository instead of the stack-local path
  2. With a `local` repository, backup, restore and snapshot listing behave exactly as before, and snapshots created before this release are still listed and restorable
  3. The SFTP and S3 branches of repository environment construction are covered by unit tests, written before the fix, that fail if either branch builds the wrong repository location or credentials
  4. Deploying or redeploying a stack that publishes a host port shows no port warning when the only holder of that port is the stack's own container
  5. Deploying a stack whose host port is held by a different stack or an external process still shows the warning and names the holder

**Plans:** 3/3 plans complete

Plans:
**Wave 1**
- [x] 17-01-PLAN.md — Backup, restore and snapshot listing resolve the configured repository (per-stack S3/SFTP sub-repo, local unchanged, hard-fail on incomplete remote config) (wave 1)
- [x] 17-02-PLAN.md — Port check ignores the stack's own published sockets, real conflicts still name the holder (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 17-03-PLAN.md — SFTP authentication: per-run 0600 key file via sftp.command, accept-new host pinning, openssh-client in the image (wave 2, after 17-01)

Notes: server-side work (backup service and repository environment construction, port-conflict check). Source issues [#68](https://github.com/docktor-app/docktor/issues/68) and [#76](https://github.com/docktor-app/docktor/issues/76). Server unit tests mock repository, filesystem and Docker; integration tests run in CI, not locally. The docs site (`docktor-app/docks`) currently labels SFTP/S3 settings "not used in v0.1.0"; correcting it is outside this repo and should follow this phase.

### Phase 18: Import and Migration Flow

**Goal**: Users can import existing stacks without being offered Docktor's own stack, and can migrate one with a readable diff, an explicit choice about the pre-migration backup, and control over whether the old stack keeps running
**Depends on**: Phase 17 (sequencing on the single branch only; no code dependency)
**Requirements**: STK-03, MIG-01, MIG-02, MIG-03, MIG-04
**Success Criteria** (what must be TRUE):

  1. The "Import existing stack" scan results never include Docktor's own stack, while every other discovered stack is still offered
  2. The migration dialog opens larger than before, and its diff and steps are readable at desktop and phone widths without clipped content
  3. The migration shows a real line diff of the compose changes (added and removed lines individually marked), rendered with the shared code editor component
  4. The pre-migration backup is its own explicit step the user can opt out of: opting out creates no backup, opting in creates one whether or not the compose file is renamed
  5. The user can choose to stop (undeploy) the old stack as part of the migration, so the new draft stack does not run alongside it; if they decline, the old stack is left running

**Plans:** 2/5 plans executed

Plans:
**Wave 1**
- [x] 18-01-PLAN.md — Docktor's own stack excluded from the brownfield scan via its own container's compose labels and mounts (fail-open), scanner ignores pre-migration-backup (wave 1)
- [x] 18-02-PLAN.md — Brownfield request bodies on shared Zod schemas (incl. compose-path rule), preview returns a real UnifiedDiff, positional diff retired (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] 18-03-PLAN.md — Migrate honours required backup/stopOldStack: compose stop before copy via a new port, backup kept in pre-migration-backup/, non-destructive rollback with compose start (wave 2, after 18-01 and 18-02)
- [ ] 18-04-PLAN.md — Wider dialog with pinned header/footer, review step renders UnifiedDiffView with counters, masked read-only .env CodeEditor via shared env-mask helper (wave 2, after 18-02)

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] 18-05-PLAN.md — Four-step dialog: backup and old-stack steps with summary, flags sent through typed API clients, step indicator/focus/stale-preview guard, toasts, Playwright flow incl. 360px (wave 3, after 18-03 and 18-04)

**UI hint**: yes

Notes: STK-03 sits here rather than in Phase 17 because it is the same "Import existing stack" surface (`brownfield-import.tsx`, `BrownfieldScanner`) that launches the migration wizard. Source issues [#13](https://github.com/docktor-app/docktor/issues/13) and [#72](https://github.com/docktor-app/docktor/issues/72). `UnifiedDiffView` and `CodeEditor` already exist in `components/common/`; reuse them, do not add a second diff renderer.

### Phase 19: Sidebar, Templates and Version Block

**Goal**: Navigation is organised into labelled sections, Templates is a first-class destination, and the running version and project links sit above the account menu, all designed together as one sidebar
**Depends on**: Phase 18 (sequencing on the single branch only; no code dependency)
**Requirements**: UI-01, UI-06, UI-07
**Success Criteria** (what must be TRUE):

  1. Sidebar entries appear under labelled section headings, and on nested routes (for example a stack detail page) the parent entry keeps its active highlight
  2. A Templates entry in the sidebar opens a standalone catalog page, and "Use template" there starts the existing create-stack flow with that template
  3. Above the account menu the sidebar shows the running version, read from the build rather than hard-coded, together with working GitHub and docs links
  4. The version block and links stay usable when the sidebar is collapsed to icons and inside the mobile sidebar sheet

**Plans**: TBD
**UI hint**: yes

Notes: the three requirements share one component tree (`app-sidebar.tsx`, `nav-user.tsx`) and one set of layout constraints (collapsed, mobile, active-route matching), so they are planned and verified as a unit. `components/ui/sidebar.tsx` is shadcn-managed and is not edited. Source issues [#88](https://github.com/docktor-app/docktor/issues/88), [#93](https://github.com/docktor-app/docktor/issues/93), [#94](https://github.com/docktor-app/docktor/issues/94) (bundle [#96](https://github.com/docktor-app/docktor/issues/96)).

### Phase 20: Visual Consistency, Dashboard Clarity and Touch Targets

**Goal**: The interface reads as one consistent system: status labels, KPI typography, tabs, forms and tables follow shared rules, the dashboard's backup card is honest, and icon-only controls are comfortable to tap on a phone
**Depends on**: Phase 19 (the new Templates page and sidebar must exist so the shared rules apply to them too), Phase 17 (the backup behaviour the dashboard card reports)
**Requirements**: UI-02, UI-03, UI-04, UI-05, UI-08, DASH-01, DASH-02, A11Y-01
**Success Criteria** (what must be TRUE):

  1. The same status (for example running) reads with identical casing on the dashboard, stack list, stack header, services table and activity timeline, all driven by one shared mapping
  2. Dashboard KPI numbers and the defined set of labels render in a self-hosted monospace font defined in the design tokens, with no request to an external font host
  3. The "Backups Configured" card states exactly what it counts (or counts what its label says), and a stack that has a manual snapshot but no schedule is not silently invisible on the dashboard
  4. Forms across the app share one label-to-input and field-to-button spacing, and every data table shares one restyled look that matches the shadcn blocks while keeping sorting, status pills and row actions
  5. The stack tab bar shows no scrollbar at desktop and tablet widths and stays usable on narrow screens, and the stack actions trigger, theme toggle, certificate delete button and table pagination buttons have a 44px touch target below `md` and keep the compact size at `md` and up

**Plans**: TBD
**UI hint**: yes

Notes: client-side polish (`components/common/`, `components/domain/`, route components); `components/ui/` is not edited, so touch-target sizing is applied at call sites and the `SidebarTrigger` stays out of scope. Every light-only color utility needs a `dark:` counterpart, and status/config pills keep rendering through `ToneBadge` and `StatusDot`. Settings cards are not migrated to react-hook-form here (separate refactoring target). Source issues [#71](https://github.com/docktor-app/docktor/issues/71), [#85](https://github.com/docktor-app/docktor/issues/85), [#89](https://github.com/docktor-app/docktor/issues/89), [#90](https://github.com/docktor-app/docktor/issues/90), [#91](https://github.com/docktor-app/docktor/issues/91), [#92](https://github.com/docktor-app/docktor/issues/92), [#95](https://github.com/docktor-app/docktor/issues/95).

### Phase 21: Release v0.1.1

**Goal**: v0.1.1 is ready to tag: package versions say 0.1.1, the changelog records what changed, and CI is green on the release branch
**Depends on**: Phase 17, Phase 18, Phase 19, Phase 20 (the release gate closes the milestone, so it runs after every other phase)
**Requirements**: REL-01
**Success Criteria** (what must be TRUE):

  1. The root, `shared`, `server` and `client` package versions are all 0.1.1, and a build shows 0.1.1 in the sidebar version block from Phase 19
  2. A changelog entry for 0.1.1 lists the fixes and polish shipped in this release, each tied to its GitHub issue
  3. Every CI job is green on `release/v0.1.1`: build, typecheck and unit/integration/Playwright tests on Linux, unit tests on Windows and macOS, and the image build with its startup check

**Plans**: TBD

Notes: the repository has no changelog file yet, so this phase creates one. Heavy verification (integration tests, full builds) runs in GitHub Actions, not locally.

## Progress

**Execution Order:**
Phases execute in numeric order: 17 → 18 → 19 → 20 → 21

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 17. Backup Repository and Port-Check Fixes | 3/3 | Complete    | 2026-10-14 |
| 18. Import and Migration Flow | 2/5 | In Progress | - |
| 19. Sidebar, Templates and Version Block | 0/TBD | Not started | - |
| 20. Visual Consistency, Dashboard Clarity and Touch Targets | 0/TBD | Not started | - |
| 21. Release v0.1.1 | 0/TBD | Not started | - |

Phases 1-16 (v0.1.0) are complete and archived; see `.planning/milestones/v0.1.0-ROADMAP.md`.

## Backlog

### Phase 999.1: Follow-up — Phase 12 deferred UAT follow-up: Test 2 (BACKLOG)

**Goal:** Resolve the UAT checkpoint deferred during Phase 12 verification
**Source phase:** 12
**Deferred at:** 2026-10-04 during /gsd-verify-work 12 session completion
**Follow-ups:**
- [ ] Test 2: pass. However, I'd like to have some variables introduced like for container_name property. So user set the variable e.g. container-base-name to nextcloud and you will have nextcloud-server, nextcloud-db etc. (deferred 2026-10-04)
