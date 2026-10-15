# Requirements: Docktor — Milestone v0.1.1 (Release Follow-ups)

**Defined:** 2026-10-14
**Core Value:** Users can deploy, monitor, and manage Docker Compose stacks through a browser UI without needing SSH or Docker CLI access.

Patch release on branch `release/v0.1.1`: bug fixes and interface polish only, no new product features. Product scope lives in GitHub Issues (`docktor-app/docktor`); each requirement below cites its source issue. The v0.1.0 requirements are archived with `.planning/milestones/v0.1.0-phases/`.

## v0.1.1 Requirements

### Backup (BKP)

- [x] **BKP-01**: Backup, restore and snapshot listing use the configured SFTP or S3 repository when the repository type is `sftp` or `s3`, and only use the stack-local path for `local` ([#68](https://github.com/docktor-app/docktor/issues/68))
- [x] **BKP-02**: Existing local-repository backups behave exactly as before ([#68](https://github.com/docktor-app/docktor/issues/68))
- [x] **BKP-03**: The SFTP/S3 branch of repository environment construction is covered by unit tests ([#68](https://github.com/docktor-app/docktor/issues/68))

### Migration (MIG)

- [ ] **MIG-01**: User sees the migration diff in a larger dialog that is readable ([#72](https://github.com/docktor-app/docktor/issues/72))
- [ ] **MIG-02**: User sees a real line diff of the compose changes, rendered with the shared code editor ([#72](https://github.com/docktor-app/docktor/issues/72))
- [ ] **MIG-03**: User can opt out of the pre-migration backup, which is its own explicit step rather than an implicit copy made only on rename ([#72](https://github.com/docktor-app/docktor/issues/72))
- [ ] **MIG-04**: User can stop/undeploy the old stack as part of migration, so the new draft stack does not run alongside it ([#72](https://github.com/docktor-app/docktor/issues/72))

### Stacks and Compose (STK)

- [x] **STK-01**: Deploying or redeploying a stack shows no port warning when the only user of the port is the stack's own container ([#76](https://github.com/docktor-app/docktor/issues/76))
- [x] **STK-02**: A port held by another stack or an external process still produces the warning ([#76](https://github.com/docktor-app/docktor/issues/76))
- [x] **STK-03**: "Import existing stack" does not offer Docktor's own stack ([#13](https://github.com/docktor-app/docktor/issues/13))

### Dashboard (DASH)

- [ ] **DASH-01**: The "Backups Configured" card states exactly what it counts, or counts what its label says ([#85](https://github.com/docktor-app/docktor/issues/85))
- [ ] **DASH-02**: A stack with a manual snapshot but no schedule is not silently invisible on the dashboard ([#85](https://github.com/docktor-app/docktor/issues/85))

### Interface (UI)

- [ ] **UI-01**: User sees the running version (injected at build time, not hard-coded) and GitHub and docs links above the sidebar account menu, working collapsed and on mobile ([#88](https://github.com/docktor-app/docktor/issues/88))
- [ ] **UI-02**: Every status label across dashboard, stack list, stack header, services table and activity timeline uses one casing, from one shared mapping ([#89](https://github.com/docktor-app/docktor/issues/89))
- [ ] **UI-03**: Dashboard KPI numbers and a defined set of labels use a self-hosted monospace font defined in the design tokens ([#90](https://github.com/docktor-app/docktor/issues/90))
- [ ] **UI-04**: The tab bar shows no scrollbar at desktop and tablet widths, and stays usable on narrow screens ([#91](https://github.com/docktor-app/docktor/issues/91))
- [ ] **UI-05**: Forms use one shared label-to-input and field-to-button spacing rule ([#92](https://github.com/docktor-app/docktor/issues/92))
- [ ] **UI-06**: Sidebar entries are grouped under labelled sections, with nested routes keeping the active highlight ([#93](https://github.com/docktor-app/docktor/issues/93))
- [ ] **UI-07**: A Templates sidebar entry opens a standalone catalog page whose "Use template" starts the create-stack flow ([#94](https://github.com/docktor-app/docktor/issues/94))
- [ ] **UI-08**: All data tables share one restyled look matching the shadcn blocks, keeping sorting, status pills and row actions ([#95](https://github.com/docktor-app/docktor/issues/95))

### Accessibility (A11Y)

- [ ] **A11Y-01**: The stack actions trigger, theme toggle, certificate delete button and table pagination buttons have a 44px touch target below `md` and keep the compact size at `md` and up ([#71](https://github.com/docktor-app/docktor/issues/71))

### Release (REL)

- [ ] **REL-01**: Package versions are bumped to 0.1.1, the changelog is updated, and CI is green on `release/v0.1.1`

## Future Requirements

Deferred to a later release (tracked in GitHub Issues, not in this roadmap).

- Remote backups as a new feature, e.g. [#81](https://github.com/docktor-app/docktor/issues/81)
- Compose warning suppression [#83](https://github.com/docktor-app/docktor/issues/83), WebSocket proxy support [#86](https://github.com/docktor-app/docktor/issues/86), uptime reset [#84](https://github.com/docktor-app/docktor/issues/84), always-fresh template images [#82](https://github.com/docktor-app/docktor/issues/82), YAML check improvements [#77](https://github.com/docktor-app/docktor/issues/77)
- Password reset by email [#79](https://github.com/docktor-app/docktor/issues/79), OIDC and authorization [#87](https://github.com/docktor-app/docktor/issues/87)
- Structured server logging [#70](https://github.com/docktor-app/docktor/issues/70)

## Out of Scope

| Feature | Reason |
|---------|--------|
| New product features | v0.1.1 is a patch release: fixes and polish only |
| Auth changes (#79, #87) | Features, belong in v0.2.0 |
| Editing `components/ui/` (shadcn-managed) | Project rule; the SidebarTrigger touch target stays out of #71 |
| Settings cards migration to react-hook-form | Separate refactoring target, not part of #92 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BKP-01 | Phase 17 | Complete |
| BKP-02 | Phase 17 | Complete |
| BKP-03 | Phase 17 | Complete |
| STK-01 | Phase 17 | Complete |
| STK-02 | Phase 17 | Complete |
| STK-03 | Phase 18 | Complete |
| MIG-01 | Phase 18 | Pending |
| MIG-02 | Phase 18 | Pending |
| MIG-03 | Phase 18 | Pending |
| MIG-04 | Phase 18 | Pending |
| UI-01 | Phase 19 | Pending |
| UI-06 | Phase 19 | Pending |
| UI-07 | Phase 19 | Pending |
| UI-02 | Phase 20 | Pending |
| UI-03 | Phase 20 | Pending |
| UI-04 | Phase 20 | Pending |
| UI-05 | Phase 20 | Pending |
| UI-08 | Phase 20 | Pending |
| DASH-01 | Phase 20 | Pending |
| DASH-02 | Phase 20 | Pending |
| A11Y-01 | Phase 20 | Pending |
| REL-01 | Phase 21 | Pending |

**Coverage:**
- v0.1.1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-14*
*Last updated: 2026-10-14 after roadmap creation (traceability mapped to Phases 17-21)*
