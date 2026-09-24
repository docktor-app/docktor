# Roadmap: Docktor

## Overview

Docktor's foundation (auth, stack CRUD, state machine, dashboard, detail page) is fully shipped. This roadmap covers the path to **v0.1.0** (the first public release): completing the product from functional to compelling. Phases 1-9 are complete — observability, notifications, backup/restore, onboarding, proxy configuration, and release hardening are all shipped and live-verified. Phases 10-16 scope the remaining v0.1.0 work, sourced from GitHub issues in `docktor-app/docktor` milestone "v0.1.0 - First Release" (see CLAUDE.md "Issue Tracking" for how work is tracked going forward — GitHub Issues are now the source of truth for product scope, not `.planning/todos/` or `REQUIREMENTS.md`).

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: MVP Completion** - Complete the three remaining blockers: settings persistence, container state poller, and live log streaming (completed 2026-03-11 — retroactive checkbox correction: all 7 plans and VERIFICATION.md were done, only this checkbox bookkeeping was stale)
- [x] **Phase 2: Observability** - Detect external compose file changes and surface image update availability (completed 2026-08-28, including gap-closure plans 02-08 through 02-12)
- [x] **Phase 3: Notifications** - Alert users on container errors, disk warnings, and backup failures via SMTP (completed 2026-03-20)
- [x] **Phase 4: Backup & Restore** - Enable encrypted, versioned stack backups with manual and scheduled restore (completed 2026-08-31)
- [x] **Phase 5: Onboarding** - Guide new installs through setup with a first-run wizard and adopt existing stacks via brownfield import (completed 2026-04-08)
- [x] **Phase 6: Proxy Configuration** - Configure domain and TLS for services via a Docktor-managed nginx-proxy + acme-companion stack (completed 2026-09-12)
- [x] **Phase 7: Release Hardening: Data Safety and Core Workflows** - Verify managed stacks directory survives container recreation before v1.0.0 (completed 2026-09-13)
- [x] **Phase 8: Live State Consistency** - Make state changes (config errors, config edits, manual actions) reflect live in the UI without a manual refresh (completed 2026-09-20)
- [x] **Phase 9: Deployment and Release Readiness** - Clean up deployment docs and close remaining release-process gaps for v1.0.0 (completed 2026-09-19)
- [ ] **Phase 10: Backend Architecture Refactor** - Server-side architecture improvements without changing external API behavior, landed before other phases add new server-side code on top of the current structure — needs `/gsd-discuss-phase 10` to scope before planning ([#16](https://github.com/docktor-app/docktor/issues/16))
- [ ] **Phase 11: UI Rework** - Clean up the UI's component structure and visual design (shadcn patterns, less Card wrapping, tab-structure reconsideration, consolidated logs, consistent status indicators) before other phases add new UI on top of current patterns — needs `/gsd-discuss-phase 11` to scope before planning ([#15](https://github.com/docktor-app/docktor/issues/15))
- [ ] **Phase 12: Compose Safety and Templates** - Diff-before-apply, dangerous-config warnings, port-conflict detection, and git-based stack templates ([#18](https://github.com/docktor-app/docktor/issues/18), [#19](https://github.com/docktor-app/docktor/issues/19), [#20](https://github.com/docktor-app/docktor/issues/20), [#21](https://github.com/docktor-app/docktor/issues/21))
- [ ] **Phase 13: Update Checker Reliability** - Fix misleading update badges, wrong upgrade-dialog messaging, slow post-deploy status, and stale database rows ([#29](https://github.com/docktor-app/docktor/issues/29), [#31](https://github.com/docktor-app/docktor/issues/31), [#32](https://github.com/docktor-app/docktor/issues/32), [#33](https://github.com/docktor-app/docktor/issues/33), [#34](https://github.com/docktor-app/docktor/issues/34))
- [ ] **Phase 14: Health, Uptime and Disk Visibility** - HTTP health probes with history, per-stack uptime, and disk usage per stack/volume ([#23](https://github.com/docktor-app/docktor/issues/23), [#24](https://github.com/docktor-app/docktor/issues/24), [#27](https://github.com/docktor-app/docktor/issues/27))
- [ ] **Phase 15: Access Hardening** - TOTP 2FA and an auth-endpoint security audit (rate limiting, CSRF, cookies) ([#45](https://github.com/docktor-app/docktor/issues/45), [#46](https://github.com/docktor-app/docktor/issues/46))
- [ ] **Phase 16: Release Readiness for v0.1.0** - Docs, demo instance, license decision, published images, hardened startup, community health files — closes the milestone ([#7](https://github.com/docktor-app/docktor/issues/7), [#11](https://github.com/docktor-app/docktor/issues/11), [#17](https://github.com/docktor-app/docktor/issues/17), [#42](https://github.com/docktor-app/docktor/issues/42), [#53](https://github.com/docktor-app/docktor/issues/53), [#54](https://github.com/docktor-app/docktor/issues/54), [#55](https://github.com/docktor-app/docktor/issues/55), [#57](https://github.com/docktor-app/docktor/issues/57))

## Phase Details

### Phase 1: MVP Completion

**Goal**: Users can observe real-time container status and stream live logs, with instance configuration persisted in the database
**Depends on**: Nothing (builds on existing foundation)
**Requirements**: OBS-01, OBS-02, OBS-03, OBS-04, OBS-05, OBS-06, OBS-07, OBS-08, OBS-09, SET-01, SET-02, SET-03
**Success Criteria** (what must be TRUE):

  1. Stack and service status updates automatically in the UI without a page refresh when containers start, stop, die, or change health state
  2. User can open a log viewer for any service and see the last 100 lines immediately, followed by live output as it arrives
  3. Log viewer renders colored ANSI output and prefixes each line with the service name; user can filter by service in the combined view
  4. Browser reconnects to the log stream automatically if the SSE connection drops
  5. User can set instance name, base URL, and timezone on a Settings page and have those values survive a server restart

**Plans**: 7 plans

Plans:

- [x] 01-01-PLAN.md — Test scaffolds (Wave 0 RED state for all 12 requirements)
- [x] 01-02-PLAN.md — Server foundation: DockerodeClient, StateBroadcaster, Settings backend
- [x] 01-03-PLAN.md — StatePoller job: Docker event stream + 60s reconciliation + app wiring
- [x] 01-04-PLAN.md — Shared settings validation schemas + cmdk/Command component install
- [x] 01-05-PLAN.md — State SSE route + useContainerEvents + dashboard/detail live updates
- [x] 01-06-PLAN.md — Log SSE route + LogViewer component + Logs tab
- [x] 01-07-PLAN.md — Settings page UI + sidebar nav + router registration

### Phase 2: Observability

**Goal**: Users are passively informed when compose files change externally and when newer container images are available
**Depends on**: Phase 1
**Requirements**: FW-01, FW-02, FW-03, UPD-01, UPD-02, UPD-03, UPD-04
**Success Criteria** (what must be TRUE):

  1. When a compose file is edited via SSH while Docktor is running, the stack's "config changed" badge appears without the user refreshing the page
  2. Stack detail page shows an "update available" badge when a newer image version is found in the registry
  3. User can trigger an image pull and container recreate from the stack detail page; the update is never applied automatically
  4. Registry polling does not hit Docker Hub rate limits during normal operation (results cached, checks staggered)

**Plans**: 16/16 plans executed

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Test scaffolds (Wave 0 RED state for FW-01/02/03 and UPD-01/02/04)
- [x] 02-02-PLAN.md — DB schema (StackEvent + ImageUpdateCheck) + StateBroadcaster extension + repositories
- [x] 02-03-PLAN.md — FileWatcher job (chokidar + 60s reconcile) + jobs/index.ts registry
- [x] 02-06-PLAN.md — Gap closure: FileWatcher service sync + parser error handling
- [x] 02-07-PLAN.md — Gap closure: test mock fixes, compose-parser throw tests, Update Images UX feedback
- [x] 02-08-PLAN.md — Gap closure (UAT gap 1): runtime-state-preserving service sync in FileWatcher; parser sequence guard
- [x] 02-09-PLAN.md — Gap closure (UAT gap 4a): currentDigest, imageRef splitting, badge lookup key

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-04-PLAN.md — UpdateChecker job (staggered registry polling, semver/date/digest) + manifestInspect()
- [x] 02-10-PLAN.md — Gap closure (UAT gap 4b): RegistryClient tag listing, live latestTag comparison, tags route

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-05-PLAN.md — Stack detail badges (config changed, update available) + POST /update route + UI
- [x] 02-11-PLAN.md — Gap closure (UAT gap 5a): compose version rewrite, upgrade endpoint, rollback

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-12-PLAN.md — Gap closure (UAT gap 5b): version-selection dialog, services-tab extraction

**Re-verification gap closure — Wave 1** *(UAT 2026-08-28, plans 02-13 through 02-16)*

- [x] 02-13-PLAN.md — Gap closure (G-02-11): digest-based noUpdates detection replaces the pull-output text scrape
- [x] 02-14-PLAN.md — Gap closure (G-02-12): useStack background refresh no longer remounts the detail page

**Re-verification gap closure — Wave 2** *(blocked on 02-13)*

- [x] 02-15-PLAN.md — Gap closure (G-02-16): GET /api/stacks/:id/events + single StackEvent write path

**Re-verification gap closure — Wave 3** *(blocked on 02-14 and 02-15)*

- [x] 02-16-PLAN.md — Gap closure (G-02-16): stack events API client, hook, Event Log card, Status Log extraction

### Phase 3: Notifications

**Goal**: Users receive email alerts for critical events (container errors, disk pressure, backup failures) without needing to watch the UI
**Depends on**: Phase 1, Phase 2
**Requirements**: NOTF-01, NOTF-02, NOTF-03, NOTF-04, NOTF-05, NOTF-06
**Success Criteria** (what must be TRUE):

  1. User can configure SMTP connection details in Settings and verify them with a test send
  2. User receives an email when a stack enters ERROR or UNHEALTHY state, including stack name, state, and recent log lines
  3. User receives an email when disk space drops below 10% or 2 GB remaining
  4. User can individually enable or disable each notification trigger in Settings

**Plans**: 5 plans

Plans:

- [x] 03-01-PLAN.md — Prisma schema (Notification + StackIncident) + AES-256-GCM crypto module + RED test scaffolds
- [x] 03-02-PLAN.md — NotificationRepository + NotificationService + SMTP/trigger/log API routes
- [x] 03-03-PLAN.md — NotificationWatcher (StateBroadcaster subscriber) + DiskChecker (24h cron) + jobs registration
- [x] 03-04-PLAN.md — Settings page Tabs refactor + Notifications tab UI (SMTP, triggers, log)
- [x] 03-05-PLAN.md — Gap closure: UAT fixes for SMTP storage, disk checker Windows, threshold inputs, SSE refresh

### Phase 4: Backup & Restore

**Goal**: Users can take encrypted, versioned backups of any stack and restore from a snapshot without manual restic CLI knowledge
**Depends on**: Phase 1
**Requirements**: BCK-01, BCK-02, BCK-03, BCK-04, BCK-05, BCK-06, BCK-07, BCK-08, BCK-09, BCK-10, BCK-11
**Success Criteria** (what must be TRUE):

  1. User can configure a restic repository (local path, SFTP, or S3-compatible) and password in Settings; password is stored encrypted
  2. User can trigger a manual backup for any stack and see streaming progress output in the UI
  3. User can configure a per-stack backup schedule and retention policy; scheduled backups run automatically
  4. User can view a list of available snapshots for a stack and restore the stack from any selected snapshot
  5. A backup failure transitions the stack to ERROR state and triggers a notification if SMTP is configured

**Plans**: 17 plans (16 executed, 1 planned)

Plans:
**Wave 1**

- [x] 04-01-PLAN.md — Prisma schema (RESTORE trigger + logLines) + shared Zod schemas + RED test scaffolds
- [x] 04-07-PLAN.md — Gap closure: logLines database column sync + backup record validation
- [x] 04-08-PLAN.md — Gap closure: ResticExecutor throw on non-zero exit codes
- [x] 04-10-PLAN.md — Gap closure: stderr capture in backup logs
- [x] 04-11-PLAN.md — Gap closure: BackupScheduler crash fix + repository wiring
- [x] 04-12-PLAN.md — Gap closure: stackPath undefined handling
- [x] 04-13-PLAN.md — Gap closure: Windows path handling + repository field UI clarity
- [x] 04-14-PLAN.md — Fix circular backup issue causing snapshot corruption
- [x] 04-15-PLAN.md — Gap closure: SSE done payload carries terminal status, guaranteed `[error]` log line, abortBackup so a half-started backup cannot wedge the stack
- [x] 04-17-PLAN.md — Gap closure: broadcaster registered at backup-creation time (CR-02), bounded SSE reconnect plus a self-terminating record poll while disconnected (CR-01), non-blank backup title on IN_PROGRESS (CR-03)
- [x] 04-18-PLAN.md — Gap closure: SSE live branch replays the accumulated log to every new subscriber so a reconnect no longer blanks the visible backup log (WR-01)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-02-PLAN.md — ResticExecutor (spawn wrapper) + BackupRepository (Backup CRUD)
- [x] 04-05-PLAN.md — Client API client + SSE hook + Settings Backup tab + NOTF-05 toggle
- [x] 04-16-PLAN.md — Gap closure: backup detail page resyncs its record when the stream ends; stream status distinguishes failed from disconnected

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 04-03-PLAN.md — BackupService (backup/restore orchestration + NOTF-05) + BackupScheduler (per-stack cron)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 04-04-PLAN.md — Backup routes (trigger, restore, SSE stream, snapshots, settings endpoints)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 04-06-PLAN.md — Stack detail action bar refactor + Backups tab + backup detail page + route registration

### Phase 5: Onboarding

**Goal**: New users reach a fully configured instance through a guided wizard; existing self-hosters can adopt running stacks into Docktor without downtime
**Depends on**: Phase 1, Phase 2, Phase 4
**Requirements**: WIZ-01, WIZ-02, WIZ-03, WIZ-04, WIZ-05, WIZ-06, WIZ-07, BF-01, BF-02, BF-03, BF-04, BF-05
**Success Criteria** (what must be TRUE):

  1. On first boot with no user in the database, the browser shows a multi-step setup wizard instead of the login page
  2. After completing the wizard, a new user has an account, basic settings configured, and is redirected to the dashboard
  3. User can scan the host filesystem for existing docker-compose.yml files and see a compatibility assessment for each
  4. User can adopt a discovered stack in-place with zero downtime, and it immediately appears in the dashboard with live status
  5. User can run the full migration wizard to move a stack into Docktor's directory structure, with automatic rollback on failure

**Plans**: 10/10 plans executed (8 original + 2 gap closure)

Plans:
**Wave 1**

- [x] 05-01-PLAN.md — Shared wizard schemas + RED test scaffolds + E2E test scaffold (Wave 1)
- [x] 05-09-PLAN.md — Gap closure: client first-run gate so a fresh install lands on /setup, not /login (WIZ-01) (Wave 1)
- [x] 05-10-PLAN.md — Gap closure: executed coverage for migration rollback (BF-05) and the WR-07 concurrent-admin lock (Wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05-02-PLAN.md — BrownfieldScanner + ComposeAnalyzer infrastructure (Wave 2)
- [x] 05-03-PLAN.md — OnboardingService + setup routes + middleware redirect (Wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 05-04-PLAN.md — ComposeRewriter + VolumeMigrator + MigrationService (Wave 3)
- [x] 05-05-PLAN.md — Setup API client + WizardStepper + setup page shell (Wave 3)
- [x] 05-08-PLAN.md — CompatibilityBadge + DiffViewer components (Wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 05-06-PLAN.md — BrownfieldStep + MigrationWizard modal + adopt-in-place (Wave 4)
- [x] 05-07-PLAN.md — Wizard step components (AccountStep, SettingsStep, BackupStep, NotificationsStep) (Wave 3)

### Phase 05.1: Stabilization: fix blockers and majors surfaced during testing (INSERTED)

**Goal:** Fix the blockers and majors surfaced during Phase 1-5 testing/UAT that block a clean, safe self-hosted deployment, so Phase 6 (Proxy Configuration) starts from a working, documented, verifiable base. Scope is exactly 10 items: 3 blockers (broken integration/e2e tests, no schema sync on container startup, Docker-outside-of-Docker bind-mount path mismatch), 6 majors (deployment config documentation, `config_error` UI, missing SSE broadcasts on manual actions, backup-without-repo wedging a stack, env edits not flagging config-changed, unreachable post-setup brownfield import) and 1 minor (restic pinned to an outdated version).
**Requirements**: n/a — this phase is scoped by the todo list above, not by REQUIREMENTS.md IDs
**Depends on:** Phase 5
**Plans:** 12/12 plans complete

Plans:
**Wave 1**

- [x] 05.1-01-PLAN.md — Repair the server integration and Playwright e2e suites (B1)
- [x] 05.1-02-PLAN.md — Broadcast SSE status on manual stack actions; flag env writes as config-changed (M3, M5a)
- [x] 05.1-03-PLAN.md — Mount the stacks directory at an identical host/container path; pin restic (B3, N1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 05.1-04-PLAN.md — Reject backups without a configured repo; broadcast backup/restore status (M4, M3)
- [x] 05.1-05-PLAN.md — Guarded `prisma db push` on container startup (B2)
- [x] 05.1-06-PLAN.md — Persist and surface `config_error`; watch `.env` for external edits (M2, M5b)
- [x] 05.1-07-PLAN.md — Authenticated post-setup brownfield import routes and UI (M6)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 05.1-08-PLAN.md — Documented `.env.example`, self-host compose file, and deployment docs (M1)

**Gap closure (UAT)** *(all three independent — one parallel wave; run `/gsd-execute-phase 05.1 --gaps-only`)*

- [x] 05.1-09-PLAN.md — Resolve the Prisma CLI through Node's own binary so the integration suite runs on Windows (G-05.1-1)
- [x] 05.1-10-PLAN.md — Load the deployment env file from the name Compose interpolates, so a custom stacks directory actually mounts (G-05.1-2)
- [x] 05.1-11-PLAN.md — Create the managed stacks directory at boot instead of relying on bind-mount auto-creation (G-05.1-3)
- [x] 05.1-12-PLAN.md — Return OS-native path separators from the brownfield scan API so Windows clients match (G-05.1-4)

### Phase 6: Proxy Configuration

**Goal**: Users can configure domain and TLS exposure for any service directly from the stack detail page, without touching Nginx configuration manually
**Depends on**: Phase 1, Phase 5 (the First-Run Wizard the optional proxy step extends), Phase 05.1 (managed stacks directory and its path-escape guard)
**Requirements**: PRXY-01, PRXY-02, PRXY-03, PRXY-04, PRXY-05
**Success Criteria** (what must be TRUE):

  1. User can configure an ACME/Let's Encrypt email and proxy-stack settings in Settings; Docktor auto-deploys a managed `nginx-proxy` + `acme-companion` stack (offered as an optional First-Run Wizard step)
  2. User can assign one or more domains, an internal port, and a TLS setting to a service from the stack detail page; Docktor writes the corresponding routing/TLS env vars into that service's compose file and redeploys it
  3. User can remove a proxy configuration from the UI; the routing/TLS env vars are removed from the service's compose file and it is redeployed
  4. Proxy operations are idempotent: reconfiguring an existing domain updates the service's env vars rather than creating a duplicate

**Plans**: 7/7 plans executed (6/6 executed, 1 gap-closure plan pending)

Plans:
**Wave 1**

- [x] 06-01-PLAN.md — Tracer: assign one domain to one service end-to-end (schema, shared Zod, surgical compose editor, repository, service, authenticated routes) + the blocking schema push

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 06-02-PLAN.md — Remove a domain, adopt hand-written domains, idempotent re-assign, and serialized per-stack compose writes

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 06-03-PLAN.md — Protected system stacks, proxy settings, the nginx-proxy + acme-companion compose renderer, and deployProxyStack with the D-11 host-port pre-flight

**Wave 4** *(blocked on Wave 3 completion — 06-04 and 06-06 are independent of each other)*

- [x] 06-04-PLAN.md — ProxyCertPoller, the proxy_cert_status SSE event, and the useProxyStatus hook
- [x] 06-06-PLAN.md — Optional First-Run Wizard proxy step (step 6, terminal)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 06-05-PLAN.md — Client: Proxy tab, Settings > Proxy card, protected-stack action disabling, Playwright coverage

**Wave 6** *(gap closure — blocked on Wave 5 completion)*

- [x] 06-07-PLAN.md — G-06-3: build @docktor/shared before every test and dev entry point, pin the invalid-hostname 400 with a database-free route test, and fail loudly on a stale compiled shared

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. MVP Completion | 7/7 | Complete    | 2026-03-11 |
| 2. Observability | 16/16 | Complete    | 2026-08-30 |
| 3. Notifications | 5/5 | Complete   | 2026-03-20 |
| 4. Backup & Restore | 17/17 | Complete    | 2026-08-31 |
| 5. Onboarding | 11/10 | Complete    | 2026-08-31 |
| 6. Proxy Configuration | 7/7 | Complete    | 2026-09-12 |
| 7. Release Hardening: Data Safety and Core Workflows | 2/2 | Complete    | 2026-09-13 |
| 8. Live State Consistency | 4/4 | Complete    | 2026-09-20 |
| 9. Deployment and Release Readiness | 8/8 | Complete    | 2026-09-19 |

### Phase 7: Release Hardening: Data Safety and Core Workflows

**Goal:** Close the pre-v1.0.0 bug that silently loses stack data on container recreation
**Requirements**: n/a — this phase is scoped by the todo list below, not by REQUIREMENTS.md IDs
**Depends on:** Phase 6
**Plans:** 2/2 plans complete

Scope is exactly 1 item, promoted from `.planning/todos/pending/` as release-blocking for v1.0.0:

1. **[deployment, major]** `ensureStacksDir()` cannot distinguish a real bind mount from a plain container-layer directory (silent data-loss risk for a backup tool) — `.planning/todos/pending/2026-09-03-stacks-dir-mount-point-not-verified.md`

_Dropped 2026-09-12: "Brownfield import/adopt unreachable post-setup" was already shipped by Phase 05.1-07 — see `.planning/todos/completed/2026-08-28-setup-routes-unauthenticated-no-postsetup-import.md`. "Backup triggerable without configured repo, wedging BACKING_UP" was already shipped by plan 05.1-04 — see `.planning/todos/completed/2026-08-28-backup-without-config-wedges-stack.md`._

Plans:
**Wave 1**

- [x] 07-01-PLAN.md — Mount-point persistence check in `lib/stacks-dir.ts`, wired into the boot sequence, hardened for escaped paths / unverifiable hosts / operator opt-out, and documented in `docs/deployment.md` (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 07-02-PLAN.md — Real-container verification of the check plus a human review of the refusal message (wave 2, requires 07-01)

### Phase 8: Live State Consistency

**Goal:** State that is already correct on the server shows up live in the UI, without the user needing to refresh
**Requirements**: n/a — this phase is scoped by the todo list below, not by REQUIREMENTS.md IDs
**Depends on:** Phase 7
**Plans:** 4/4 plans executed (1 executed, 3 gap closure — UAT diagnosed 3 issues against the live-executed plan)

Scope is exactly 3 items, promoted from `.planning/todos/pending/` as release-blocking for v1.0.0 — all three are the same root theme (a state change happens correctly server-side but the UI doesn't reflect it without a manual reload):

1. **[observability, major]** `config_error` state has no client-side UI indicator (backend-only today) — `.planning/todos/pending/2026-08-28-config-error-ui-indication-missing.md`
2. **[observability, major]** Env file changes (via the app or externally) never set the config-changed badge — `.planning/todos/pending/2026-08-28-env-file-changes-dont-flag-config-changed.md`
3. **[observability, major]** Manual stack actions (deploy/stop/restart/update/backup/restore/compose-save) don't broadcast SSE status updates — `.planning/todos/pending/2026-08-28-manual-actions-dont-broadcast-sse.md`

Plans:

- [x] 08-01-PLAN.md — Add the missing in-progress motion cue to the BACKING_UP/RESTORING/MIGRATING badges with a new unit test, settle this session's live reachability by measurement, hand the six stranded 05.1 human-judgment verifications to UAT, and close the three stale todos

**Gap closure (UAT)** *(all three independent — one parallel wave)*

- [x] 08-02-PLAN.md — G-08-2 (server half) + G-08-6: tag config_changed broadcasts with source app/external, fix updateStack's unguarded compose parse (typed 400 + clearConfigError), sync lastEnvHash on app-driven env saves
- [x] 08-03-PLAN.md — G-08-2 (client half): gate the "changed externally" toast on event.source instead of firing for every config_changed event
- [x] 08-04-PLAN.md — G-08-7: promote BACKING_UP to the blue-plus-pulse treatment per the user's live UAT answer, leaving RESTORING/MIGRATING gray

### Phase 9: Deployment and Release Readiness

**Goal:** Deployment documentation and process match what v1.0.0 actually ships, and the remaining release-process gaps are closed
**Requirements**: n/a — this phase is scoped by the todo list below, not by REQUIREMENTS.md IDs
**Depends on:** Phase 8
**Plans:** 8/8 plans complete

Scope is exactly 4 items, promoted from `.planning/todos/pending/` as release-blocking for v1.0.0:

1. **[docs, major]** Document deployment config: clean `.env` and `docker-compose.yml` — `.planning/todos/pending/2026-08-27-document-deployment-config-clean-env-and-docker-compose.md`
2. **[deployment, major]** Adopt `prisma migrate` once MVP is complete — `.planning/todos/pending/2026-09-01-adopt-prisma-migrate-post-mvp.md`
3. **[testing, major]** CI has no Windows runner — platform-divergent defects reach contributors uncaught — `.planning/todos/pending/2026-09-03-ci-has-no-windows-runner.md`
4. **[proxy, major]** Add support for custom TLS certificates — `.planning/todos/pending/2026-09-07-add-support-for-custom-tls-certificates.md`

Plans:
**Wave 1** *(all three independent)*

- [x] 09-01-PLAN.md — Item 1: fix the env-template filename drift, audit the deployment guide against the shipped config, close the docs todo
- [x] 09-02-PLAN.md — Item 3: windows-latest + macos-latest unit-test matrix job, branch-protection checkpoint, close the CI todo
- [x] 09-03-PLAN.md — Item 2 tracer: generate the `0_init` baseline, cut the guarded startup step over to `migrate deploy` with D-05 auto-baselining, apply it live [BLOCKING]

**Wave 2** *(09-04 and 09-05 both blocked on 09-03)*

- [x] 09-04-PLAN.md — Item 2 surround: image ENV, startup logs, `.env.example`, deployment-guide schema section, close the migrate todo
- [x] 09-05-PLAN.md — Item 4 schema: `Certificate` model, `certSource`/`certificateId` linkage, shared wildcard + source + status schemas, incremental migration [BLOCKING]

**Wave 3** *(blocked on 09-05)*

- [x] 09-06-PLAN.md — Item 4 tracer: certificate upload end to end — validation, encryption at rest, on-disk materialisation, authenticated multipart routes

**Wave 4** *(blocked on 09-06)*

- [x] 09-07-PLAN.md — Item 4: D-11 ACME suppression via the certificate-source field, D-13 expiry classification in the cert poller

**Wave 5** *(blocked on 09-06 and 09-07)*

- [x] 09-08-PLAN.md — Item 4 client: multipart-capable API helper, Settings certificates card, certificate-source choice, expiring badge, close the TLS todo

### Phase 10: Backend Architecture Refactor

**Goal:** Improve the server's internal architecture — DDD/hexagonal layering with explicit ports, a formal Job abstraction and registry, an in-process domain-event bus, and a dedicated dead-code audit — without changing external API behavior or breaking integration tests. Sequenced before Phases 12/14/15 so their new server-side code (template service, health-probe jobs, 2FA/rate-limiting) lands on the refactored structure instead of needing rework afterward.
**Requirements**: GitHub issue [#16](https://github.com/docktor-app/docktor/issues/16), scoped into 18 decisions (D-01 through D-18) in `.planning/phases/10-backend-architecture-refactor/10-CONTEXT.md`
**Depends on:** Phase 9

Independent of Phase 11 (separate server/client tracks — can run in parallel). Later phases that add new server-side code should follow this one; see their own "Depends on" entries.
**Success Criteria** (what must be TRUE):

  1. Every decision D-01 through D-18 is implemented and traceable to an artifact in the tree and a passing check
  2. No existing API endpoint's request/response contract changes
  3. Existing integration tests (`server/test/integration/`, 5 files) pass unmodified
  4. CLAUDE.md's layering rules are enforced by an automated architecture fitness test rather than by review
  5. All three of D-15's side-effect categories — notifications, the `StackEvent` audit trail, and status/config broadcasts — reach their consumers through the in-process domain-event bus, with the SSE stream a browser observes unchanged (D-18)

**Plans:** 14/15 plans executed

Plans:
**Wave 1**

- [x] 10-01-PLAN.md — Layering contract proven end-to-end on the notification service: `repositories/index.ts`, the first port, the architecture fitness test

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 10-02-PLAN.md — Named port interfaces for the four infrastructure dependencies D-07 lists explicitly
- [x] 10-03-PLAN.md — The domain-event bus: event catalog, port, and in-memory implementation with per-subscriber failure isolation
- [x] 10-04-PLAN.md — The `Job` lifecycle contract, the two job kinds, and the health-tracking registry

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 10-05-PLAN.md — Ports for the remaining six infrastructure classes, plus the fitness rule that keeps the convention true

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 10-06-PLAN.md — Application services depend on ports only; pure business rules move down into `domain/`
- [x] 10-07-PLAN.md — All seven background jobs adopt the `Job` contract; `jobs/index.ts` becomes a registry

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 10-08-PLAN.md — `routes/stacks.ts` stops reaching past its layer; a new `LogService`

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 10-09-PLAN.md — The settings, notifications, setup and imports routes stop reaching past their layer

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 10-10-PLAN.md — `routes/backups.ts` cleaned, plus the routes rule in the fitness test

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 10-11-PLAN.md — Status and configuration broadcasts move onto the bus; the live-state broadcaster becomes a subscriber (D-15 item 3)

**Wave 9** *(blocked on Wave 8 completion)*

- [x] 10-12-PLAN.md — Notifications move onto the bus; a subscriber composes them (D-15 item 1)

**Wave 10** *(blocked on Wave 9 completion)*

- [x] 10-13-PLAN.md — The `StackEvent` audit trail moves onto the bus, plus one ordered subscriber registration (D-15 item 2)

**Wave 11** *(blocked on Wave 10 completion)*

- [x] 10-14-PLAN.md — The dedicated dead-code audit: the unreachable update-trigger method, the dead `src/services/` directory, and the workspace sweep (D-03, D-11)

**Wave 12** *(blocked on Wave 11 completion)*

- [ ] 10-15-PLAN.md — Phase gate: automated gate, decision-coverage table, live-database integration run, and the five deferred human checks

### Phase 11: UI Rework

**Goal:** [Needs scoping — run `/gsd-discuss-phase 11` before `/gsd-plan-phase 11`] Clean up the UI's component structure and visual design: adopt shadcn patterns consistently, refactor toward a clean component architecture (hooks, compound components, SRP), consolidate the three separate log tables (deployments/event/status) into a clearer surface, reduce unnecessary Card wrapping, reconsider whether tabs are the right page structure, use dialogs for add/edit flows (certificates, proxy config), unify inconsistent status-indicator sizing, and rework the backup/backup-detail pages to reuse the existing log-viewer component. Sequenced before Phases 12/14/15 so their new UI (template picker, diff dialog, health/uptime/disk views, 2FA enrollment) is built on the reworked patterns instead of needing re-skinning afterward.
**Requirements**: GitHub issue [#15](https://github.com/docktor-app/docktor/issues/15) — the issue itself is an open list ("there are more things to improve, this is just a small list"), not a concrete spec; success criteria here are placeholders pending discussion
**Depends on:** Phase 9

Independent of Phase 10 (separate client/server tracks — can run in parallel). Later phases that add new UI should follow this one; see their own "Depends on" entries.
**Success Criteria** (what must be TRUE) — **draft, confirm during discuss-phase:**

  1. TBD — concrete scope agreed from #15's list (log-table consolidation, Card-wrapping reduction, tab-structure decision, dialogs for add/edit flows, status-indicator sizing, backup-page rework, form layout/sizing)
  2. Deployments/event/status logs are consolidated into fewer, clearer surfaces
  3. Backup and backup-detail pages reuse the existing log-viewer component
  4. Status indicators (badges) use a single consistent sizing scheme across the app

**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 11 to break down)

### Phase 12: Compose Safety and Templates

**Goal:** Creating and editing a stack comes with real safety nets — a preview of what changes before it's applied, warnings on dangerous or convention-violating configuration, upfront port-conflict detection, and a git-based template to start from instead of a blank compose file.
**Requirements**: GitHub issues [#18](https://github.com/docktor-app/docktor/issues/18), [#19](https://github.com/docktor-app/docktor/issues/19), [#20](https://github.com/docktor-app/docktor/issues/20), [#21](https://github.com/docktor-app/docktor/issues/21) — not tracked in REQUIREMENTS.md; see CLAUDE.md "Issue Tracking"
**Depends on:** Phase 10, Phase 11

Needs Phase 10's backend structure and Phase 11's UI patterns for the new diff/warning dialogs and template picker. Independent of the other feature phases.
**Success Criteria** (what must be TRUE):

  1. Saving a compose or `.env` edit shows a diff and requires explicit confirmation before it's applied (#18)
  2. User can create a stack from a git-based template; a default official template repo is configured out of the box and additional repos can be added (#19)
  3. A compose file with `privileged: true`, a Docker-socket mount, or a host bind mount outside the stack directory triggers a confirmation dialog before it's applied; configurable checks flag named-volume usage, inlined env vars, and a `.env` file with no `env_file` reference — all warn, none block (#20)
  4. Deploying a stack whose compose file requests a host port already in use surfaces which stack or process holds it, without blocking deploy (#21)

**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 12 to break down)

### Phase 13: Update Checker Reliability

**Goal:** Update detection and container status reporting are accurate everywhere they're shown — no misleading badges, no stale database rows, no unnecessary "unknown" status windows.
**Requirements**: GitHub issues [#29](https://github.com/docktor-app/docktor/issues/29), [#31](https://github.com/docktor-app/docktor/issues/31), [#32](https://github.com/docktor-app/docktor/issues/32), [#33](https://github.com/docktor-app/docktor/issues/33), [#34](https://github.com/docktor-app/docktor/issues/34)
**Depends on:** Phase 9

These are narrow bug fixes to existing logic/UI, not new architecture, so this phase carries low rework risk and can run anytime — independent of every other Phase 10+ phase, including in parallel with the refactors.
**Success Criteria** (what must be TRUE):

  1. "Update available" is shown aggregated at the stack level (stack list, dashboard, detail header), not just per-service (#31)
  2. The "update available" badge visually distinguishes a concrete newer tag from a moving-tag digest change, never implying a pickable version that doesn't exist (#32)
  3. The upgrade dialog shows a distinct, correct message for moving-tag services instead of the misleading "not checked yet" (#33)
  4. Service status reflects reality within a few seconds after a deploy/update, not up to 60s (#34)
  5. `ImageUpdateCheck` rows for retired image+tag combinations are pruned (#29)

**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 13 to break down)

### Phase 14: Health, Uptime and Disk Visibility

**Goal:** Users can see whether a stack is actually healthy over time and how much disk it's consuming, without reading raw logs or guessing.
**Requirements**: GitHub issues [#23](https://github.com/docktor-app/docktor/issues/23), [#24](https://github.com/docktor-app/docktor/issues/24), [#27](https://github.com/docktor-app/docktor/issues/27)
**Depends on:** Phase 10, Phase 11

Needs Phase 10's backend structure for the new health-probe job and Phase 11's UI patterns for the new uptime/disk views. Independent of the other feature phases. Internally, the uptime-view issue depends on the health-probe issue's status-history work (both in this same phase).
**Success Criteria** (what must be TRUE):

  1. A stack/service can optionally be configured with an HTTP health-probe URL, feeding into the same status model as Docker-healthcheck-derived status (#23)
  2. Health-status transitions are retained as history, visible per stack and per service (#23)
  3. Each stack shows an uptime percentage and an incident list over a retention window (#24)
  4. Disk usage is viewable per stack and per volume, sortable, with a total (#27)

**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 14 to break down)

### Phase 15: Access Hardening

**Goal:** Authentication is treated as a real security boundary, matching the risk of Docktor's Docker-socket access.
**Requirements**: GitHub issues [#45](https://github.com/docktor-app/docktor/issues/45), [#46](https://github.com/docktor-app/docktor/issues/46)
**Depends on:** Phase 11

Needs Phase 11's UI patterns for the 2FA enrollment flow. The rate-limiting/CSRF/cookie audit half of this phase has no real dependency on the backend refactor and could technically start right after Phase 9, but the phase as a whole is gated on Phase 11 for its UI half. Independent of the other feature phases.
**Success Criteria** (what must be TRUE):

  1. User can enable mandatory-capable TOTP two-factor authentication, with recovery codes issued on enrollment (#45)
  2. Auth endpoints (login, password reset, etc.) have rate limiting (#46)
  3. CSRF protection and session-cookie security defaults (httpOnly/sameSite/secure) are verified or closed on the existing better-auth integration (#46)

**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 15 to break down)

### Phase 16: Release Readiness for v0.1.0

**Goal:** Docktor is safe and appealing to point strangers at for the first public release — accurate documentation, a live demo, a decided license, published images, a hardened startup path, and community health files.
**Requirements**: GitHub issues [#7](https://github.com/docktor-app/docktor/issues/7), [#11](https://github.com/docktor-app/docktor/issues/11), [#17](https://github.com/docktor-app/docktor/issues/17), [#42](https://github.com/docktor-app/docktor/issues/42), [#53](https://github.com/docktor-app/docktor/issues/53), [#54](https://github.com/docktor-app/docktor/issues/54), [#55](https://github.com/docktor-app/docktor/issues/55), [#57](https://github.com/docktor-app/docktor/issues/57)
**Depends on:** Phases 10, 11, 12, 13, 14, 15 (the documentation and demo work here should describe what's actually shipped, so this phase closes the milestone)
**Success Criteria** (what must be TRUE):

  1. Startup fails loudly (blocking) on a missing required env var and warns (non-blocking) on a missing optional one — e.g. `ENCRYPTION_KEY` for backups (#7)
  2. Docker images are built and published on release tags and on `main`-branch commits (#11)
  3. Documentation covers the app's purpose, features, setup, and usage (#17)
  4. Restic is pinned to a specific current release via explicit binary download, not `apt-get install` (#42)
  5. A public demo instance is live and resets hourly (#53)
  6. README has screenshots and a short GIF (#54)
  7. `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, and issue/PR templates exist (#55)
  8. Project license is decided and a `LICENSE` file reflecting it is added (#57)

**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 16 to break down)
