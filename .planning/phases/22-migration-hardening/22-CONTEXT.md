# Phase 22: Migration Hardening - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the shipped brownfield migration wizard trustworthy: the old stack is verifiably stopped, every volume is copied faithfully, secrets stay masked, a backup exists before any data is touched, and a failure (or a Docktor restart mid-migration) puts the original stack back without losing data. Covers MIG-05 to MIG-13 (issues #100-#105, #107-#109). No new migration capabilities beyond these.

</domain>

<decisions>
## Implementation Decisions

### Backup consistency (#107)
- **D-01:** Take **one backup copy after the verified stop**, before any data copy or other destructive step. No warm pre-stop copy and no delta pass. Order: preflight (incl. disk check) → stop old stack → verify stopped → backup → copy → rewrite → record → deploy. Downtime includes the backup time. — **Reversibility:** costly — step order is encoded in the operation step enum / shared event schemas.
- **D-02:** **MIG-09 / ROADMAP SC#4 wording must be amended**: "backs up before stopping" becomes "backs up after the verified stop and before any data copy or destructive step; no data is changed before a backup exists". The planner updates REQUIREMENTS.md (MIG-09) and ROADMAP.md (Phase 22 SC#4) as part of the phase.
- **D-03:** Backup scope = **old stack directory plus the bind sources selected for copy**, extending today's `pre-migration-backup/`. Named volumes are not duplicated; the original volumes stay untouched and are the rollback source.

### Unverifiable stop and anonymous volumes (#102, #101)
- **D-04:** If the stop cannot be verified (project unresolved, containers still running after stop), the migration **hard-refuses before any copy** with a message naming the resolved project and the containers still running. **No override and no force option.**
- **D-05:** Anonymous volumes are **flagged in the review step** ("will start empty in the new stack") and the user must **explicitly acknowledge** to continue. They are not copied and migration is not blocked.

### Crash recovery and result wording (#100, #105)
- **D-06:** On boot, if the migration journal shows an unfinished operation, Docktor **auto-restores** the original stack (never `down -v`, never deletes volumes), restarts it, and records the operation as rolled back. The outcome is visible in the toast / operation list.
- **D-07:** Results state only **verified outcomes**: "restart requested" until the original containers are seen running, then "original stack restored and running". If not seen running within a timeout, end in a terminal failed state: "rolled back, but original stack is not running — check manually".

### Disk space and secret reveal (#107, #103)
- **D-08:** Disk check is a **hard block with a 10% margin**: required = size of everything to be copied (plus backup if chosen) × 1.1, measured **per destination filesystem** (stacks dir vs volume storage). A shortfall blocks before any downtime and shows needed vs available per filesystem.
- **D-09:** Masked secrets in the review diff use **one toggle for the whole diff** ("Show secrets"); always masked by default on each open. Masking covers map and list env forms and URL credentials via a shared `maskSecrets`.

### Claude's Discretion
- Rollback ledger/journal storage format, operation step enum changes, shared event schema shape.
- `~` bind classification, compose project resolver, error `cause` hygiene, path-hardening details, env allowlist contents (follow roadmap success criteria 5 and the Notes in ROADMAP.md).
- Toast terminal-state mechanics (reload, reconnect, leaving the page) beyond "always ends done, failed or rolled back".
- Plan split: roadmap suggests correctness first, then rollback/UX.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope
- `.planning/ROADMAP.md` §Phase 22 — goal, success criteria, notes (rollback must never run `down -v`; real-Docker tests run in GitHub Actions with collision-proof random project names)
- `.planning/REQUIREMENTS.md` — MIG-05 to MIG-13 (MIG-09 wording to be amended per D-02)
- `.planning/research/SUMMARY.md` — migration phases, pitfalls (rollback deleting volumes), shared `maskSecrets`/event schema reuse in Phases 24-25
- GitHub issues `docktor-app/docktor` #100, #101, #102, #103, #104, #105, #107, #108, #109

### Project rules
- `CLAUDE.md` — conventions, branch rule (`feature/phase-22-migration-hardening`), no heavy local builds/integration tests
- `server/CLAUDE.md`, `client/CLAUDE.md` — workspace rules (including the migration rule for Prisma)
- `.planning/codebase/CONCERNS.md`, `.planning/codebase/TESTING.md` — known risks and test layout

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/src/application/migration-service.ts` (~800 lines): `preflight`, `execute`, `moveOriginalBack`, `restartOldStack`, existing `pre-migration-backup/` handling (D-07 of earlier phase)
- `server/src/application/migration-operation-service.ts` and `server/src/domain/migration-operation.ts`: in-memory operation state, step reporting, pruning
- `server/src/infrastructure/volume-migrator.ts`, `external-stack-control.ts` (stop/start only), `compose-rewriter.ts`, `brownfield-scanner.ts`, `domain/bind-mount-sources.ts`, `domain/migration-target.ts`
- `server/src/routes/imports.ts`, `application/compose-review-service.ts` (review diff)

### Established Patterns
- Ports and adapters (`application/ports/*`), pure domain functions, Zod schemas in `@docktor/shared`
- No existing `down` other than the one that deletes volumes; a keep-volumes variant is needed

### Integration Points
- Startup path (`server/src/index.ts`) for journal recovery
- Shared event schemas and `maskSecrets` are reused by Phases 24-25; `AppError` cause change must land before Phase 24 adds error subclasses

</code_context>

<specifics>
## Specific Ideas

- Each GSD phase runs on its own branch `feature/phase-<N>-<slug>`; added to root `CLAUDE.md`.

</specifics>

<deferred>
## Deferred Ideas

- Warm pre-stop copy with final delta (lower downtime) — rejected for this phase; revisit only if downtime complaints arise.
- Automatically copying anonymous volumes — not in scope.
- Backing up named volumes as part of the pre-migration backup.

</deferred>

---

*Phase: 22-Migration Hardening*
*Context gathered: 2026-10-22*
