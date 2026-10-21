# Phase 18: Import and Migration Flow - Context

**Gathered:** 2026-10-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can import existing stacks without being offered Docktor's own stack (STK-03), and can migrate one with a readable real line diff in a larger dialog (MIG-01, MIG-02), an explicit opt-out backup step (MIG-03), and an explicit choice to stop the old stack (MIG-04). Surface: the "Import existing stack" scan (`BrownfieldScanner`) and the migration dialog (`migration-wizard.tsx`), used by both the setup wizard and the post-setup import page. Source issues #13 and #72.

</domain>

<decisions>
## Implementation Decisions

### Docktor's own stack (STK-03)
- **D-01:** Detect Docktor's own stack by inspecting Docktor's own container at scan time and reading its Compose labels (`com.docker.compose.project.config_files` / `working_dir`). Any scanned compose path equal to that file is excluded from results. Independent of container name, image or location.
- **D-02:** If Docktor cannot identify its own container (not containerized, dev, bare metal) the scanner **fails open**: nothing is excluded and every stack is listed. No heuristic fallback (no `container_name`/image matching).
- **D-03:** Exclusion lives in the shared scan path (`OnboardingService.scan` / scanner port), so `routes/setup.ts` and `routes/imports.ts` get identical behaviour. Every other discovered stack must still be offered.

### Diff rendering (MIG-01, MIG-02)
- **D-04:** The preview endpoint returns a `UnifiedDiff` built with `computeUnifiedDiff` (`server/src/lib/unified-diff.ts`, jsdiff), the same shape the stack-edit review uses, and the client renders it with the existing `UnifiedDiffView`. Added and removed lines are individually marked. Retire the positional `ComposeRewriter.generateDiff` and the side-by-side `setup/components/diff-viewer.tsx`; do not add a second diff renderer.
- **D-05:** The extracted `.env` preview renders in a read-only `CodeEditor` (no language extension) with secret-looking keys masked and a reveal control, consistent with the stack-edit review dialog (`isSecretKey`, masking in `diff-confirm-dialog.tsx`).
- **D-06:** Dialog is enlarged (roughly `max-w-5xl`) and must be readable at phone width with no clipped content (scrolling diff, full-width on small screens).

### Pre-migration backup (MIG-03)
- **D-07:** Backup is its own explicit step, **default on**, user can opt out. Opt out creates no backup at all; opt in creates one whether or not the compose file is renamed.
- **D-08:** An opted-in backup is a copy of the old stack directory (compose, `.env`, bind-mount data) at `pre-migration-backup/` inside the new stack's directory. It survives a successful migration (no longer deleted), and is not placed in OS temp. Named Docker volumes are not part of it.
- **D-09:** Rollback no longer depends on a backup. The migration never modifies the original directory (only reads it and optionally stops containers), so failure rollback = remove the new stack dir and record, and restart the old containers if Docktor stopped them. Remove the destructive `rm originalDir` + restore from `MigrationService.migrate`.

### Stop old stack (MIG-04)
- **D-10:** Stopping is an explicit choice, **default on**, implemented as `docker compose stop` of the old stack before data is copied. Containers are stopped, not removed, so the old stack can be restarted. If the user declines, the old stack is left running and untouched, and the dialog warns that port conflicts are possible.
- **D-11:** On rollback, restart the old stack only if Docktor stopped it.

### Dialog flow
- **D-12:** Four steps: (1) Select data, (2) Review changes, (3) Backup, (4) Old stack, then Confirm & Migrate. `ConfirmMigrateParams` and both migrate endpoints gain `backup: boolean` and `stopOldStack: boolean`; Zod schemas go in `@docktor/shared`, not duplicated in the routes.

### Claude's Discretion
- Exact dialog widths/breakpoints, step indicator styling, copy text of warnings.
- Whether the shared Zod schemas replace the inline route schemas in this phase or only the new fields are added.
- How the self-container is looked up (existing `DockerExecutorPort` vs new narrow port), as long as it stays behind a port and is unit-testable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements and scope
- `.planning/ROADMAP.md` §Phase 18 — goal, success criteria, notes
- `.planning/REQUIREMENTS.md` — STK-03, MIG-01..MIG-04
- `CLAUDE.md` — layering, TDD, UI rules (ToneBadge, dark: variants, no `components/ui` edits)
- GitHub issues `docktor-app/docktor#13` and `#72` — original reports

### Prior phase
- `.planning/phases/17-backup-repository-and-port-check-fixes/17-CONTEXT.md` — only sequencing relation; no code dependency

No other external specs.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/src/lib/unified-diff.ts` (`computeUnifiedDiff`, `UnifiedDiff`): real diff generator already used by `compose-review-service.ts`.
- `client/src/components/common/unified-diff-view.tsx`: generic hunk renderer, keep domain-free.
- `client/src/components/common/code-editor.tsx`: themed CodeMirror wrapper (`readOnly` supported).
- `client/src/components/domain/stack/diff-confirm-dialog.tsx`: secret masking pattern to reuse for the `.env` preview.

### Established Patterns
- `MigrationService` takes ports via constructor (`DockerExecutorPort`, `VolumeMigratorPort`, `ComposeRewriterPort`, `StackFilesystemPort`); it still shells out to `docker compose stop/up` via private `spawn` helpers, which should move behind a port for testability.
- `BrownfieldScannerPort` is shared by setup and import routes via `OnboardingService.scan`.
- WR-09: `MigrationWizard` hands execution to the parent and closes immediately; parent owns toasts. Keep this.
- CR-02 path-confinement checks in `migrate()` must be preserved.

### Integration Points
- `server/src/infrastructure/brownfield-scanner.ts`, `server/src/application/onboarding-service.ts` (scan)
- `server/src/application/migration-service.ts`, `server/src/infrastructure/compose-rewriter.ts` (`generateDiff`)
- `server/src/routes/setup.ts` and `server/src/routes/imports.ts` (preview + migrate endpoints)
- `client/src/routes/setup/components/migration-wizard.tsx`, `brownfield-step.tsx`, `components/domain/stack/brownfield-import.tsx`, `lib/setup-api.ts`, `lib/import-api.ts`, `lib/brownfield-types.ts`

### Research flags
- The scanner runs inside the container, while the Compose label holds a host path. Researcher must determine how to map the label path to the scanned (container-visible) path, including the `DOCKTOR_STACKS_HOST_DIR` style mapping.
- The roadmap wording says "rendered with the shared code editor"; the decision is `UnifiedDiffView` (named in the same roadmap notes) plus `CodeEditor` for the `.env` preview.

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the decisions above.

</specifics>

<deferred>
## Deferred Ideas

- Issue #13's opt-in toggle to display Docktor's own stack read-only (like the proxy stack) and updating it: not in the roadmap, belongs in a future phase.
- `compose down` / undeploy-after-success variant for the old stack: not chosen.

</deferred>

---

*Phase: 18-Import and Migration Flow*
*Context gathered: 2026-10-14*
