# Phase 12: Compose Safety and Templates - Context

**Gathered:** 2026-10-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Creating and editing a stack comes with real safety nets: a diff-and-confirm step before any compose/.env edit is applied, warnings on dangerous or convention-violating configuration, upfront host-port-conflict detection before deploy, and a git-based template system to start a new stack from instead of a blank compose file. Four independent GitHub issues (#18, #19, #20, #21), each scoped not to block the user — warnings and diffs require confirmation but nothing in this phase prevents the user from proceeding if they choose to.

</domain>

<decisions>
## Implementation Decisions

### Diff-before-apply (#18)
- **D-01:** Diff is rendered as a unified diff (GitHub-style, single column with +/- lines), not side-by-side.
- **D-02:** The diff-confirm step is skipped on the very first save when creating a new stack (nothing to diff against) — it only applies to edits of an existing stack's compose/.env.
- **D-03:** Issue #18's diff-confirm dialog and issue #20's dangerous-config warning dialog are **merged into one dialog** — the diff and any triggered warnings (privileged/socket-mount/bind-outside-stack, named-volumes/inline-env/missing-env_file) are shown together in a single confirm step, warnings appearing in context next to the lines that caused them.
- **D-04:** Whether the diff-confirm dialog appears at all is **configurable in Settings** (a global toggle to skip it) — not unconditionally always-on, and not a per-dialog "don't ask again." — **Reversibility:** reversible — a settings toggle, easy to flip either direction later.

### Git-based templates (#19)
- **D-05:** The default official template repo is **`github.com/docktor-app/templates`** — already created by the user (verified to exist via `gh repo view`). This is the out-of-the-box default repo URL; issue #19 also requires users be able to add additional repos.
- **D-06:** A template's multiple configurations (e.g. Nextcloud with/without Redis) are structured as **subdirectories per variant** in the repo (e.g. `templates/nextcloud/default/`, `templates/nextcloud/with-redis/`), each a self-contained compose+metadata folder — simple, git-diffable, easy for template authors to add a new variant.
- **D-07:** Template browse/search UI is a **grid of cards with a category filter and search box** (visual browsing: icon, name, category, short description), consistent with the dashboard's existing card-based patterns from Phase 11.
- **D-08:** When a newer version of an already-used template becomes available, surface a **passive "template updated" badge** — informational only, no auto-apply — analogous to the existing per-service image-update badge. The pinned template version in the stack's metadata is otherwise unaffected.

### Dangerous-config warnings (#20)
- **D-09:** Checks run **both on edit-apply (via the merged D-03 dialog) and again right before deploy** — catches both in-app edits and externally-edited files picked up by FileWatcher that haven't gone through the dialog.
- **D-10:** Per-check enable/disable (named-volumes, inline-env-vars, missing-env_file — the configurable checks) is exposed via a **new dedicated "Compose Checks" settings card**, not folded into an existing card.
- **D-11:** The always-on checks (`privileged: true`, Docker-socket mount, bind-mount outside the stack directory) are **visually distinct** from the configurable warn-only checks — red/destructive `ToneBadge` tone for always-on checks vs. yellow/warning tone for configurable ones. All checks still warn-only, never block, per the issue.
- **D-12:** Checks are implemented as a **Strategy-pattern rule registry** — each check is its own class/function implementing a shared `Rule` interface (id, severity, `check(doc) → finding[]`), registered in a list. Adding a new built-in rule later is a one-file change. **No runtime plugin-loading mechanism** — this stays in-scope and does not conflict with PROJECT.md's "Plugin system" Out-of-Scope line. See Deferred Ideas below.

### Port-conflict detection (#21)
- **D-13:** A non-Docktor process holding a conflicting port is identified by **shelling out to `ss`/`lsof`** (Linux), consistent with the project's existing pattern of shelling out to system tools (`docker compose`, `restic`) rather than reimplementing socket enumeration in Node. Falls back to "unknown process" if the tool is unavailable or permission is denied.
- **D-14:** The port-conflict check runs **automatically, right before every deploy** (create, update+redeploy, restart) — not a user-triggered "check ports" button.
- **D-15:** A conflict with another **Docktor-managed stack** names that stack directly with a link to its detail page (more actionable). A conflict with a **non-Docktor process** shows a generic process name/PID message.

### Claude's Discretion
None — every question in this discussion was resolved to a concrete choice; no area was left to "you decide."

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §Phase 12: Compose Safety and Templates — goal, success criteria, dependencies (Phase 10, Phase 11)
- GitHub issue [#18](https://github.com/docktor-app/docktor/issues/18) — Show a diff before applying a compose/.env edit (full acceptance criteria + notes fetched during discussion)
- GitHub issue [#19](https://github.com/docktor-app/docktor/issues/19) — Support git-based stack templates (full acceptance criteria + notes fetched during discussion)
- GitHub issue [#20](https://github.com/docktor-app/docktor/issues/20) — Warn on dangerous or convention-violating compose configuration (full acceptance criteria + notes fetched during discussion)
- GitHub issue [#21](https://github.com/docktor-app/docktor/issues/21) — Detect host port conflicts before deploy (full acceptance criteria + notes fetched during discussion)

### Template source
- `github.com/docktor-app/templates` — the default official template repo (D-05), already created and live

### Project-level constraints
- `.planning/PROJECT.md` §Out of Scope — "Plugin system — adds complexity without near-term user benefit." Directly constrains D-12 (no runtime plugin-loading).
- `CLAUDE.md` §Design Patterns in Use — Strategy pattern guidance backs D-12's rule-registry design.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/src/infrastructure/compose-analyzer.ts` (`ComposeAnalyzer` class) — already extracts named volumes, bind mounts (including absolute-path/outside-stack detection via `BindMountInfo.type`), and inline env vars for the brownfield-adopt flow. This is the natural home to extend into the D-12 Strategy-pattern rule registry: wrap its existing extraction methods as rules, add new rules for `privileged`, Docker-socket mount, and missing-`env_file`.
- `client/src/components/ui/alert-dialog.tsx` and `client/src/components/domain/backup/restore-confirm-dialog.tsx` — existing confirm-dialog precedent for the D-03 merged diff+warning dialog.
- `client/src/components/domain/stack/compose-editor.tsx` / `env-editor.tsx` (Phase 11, CodeMirror-based) — the diff view (#18) sits alongside these existing editors; the `yaml` package (`^2.9.1`) is already a client dependency.
- `server/prisma/schema/setting.prisma` (`Setting` key-value model) — the D-04 "skip diff confirmation" toggle and D-10's per-check enable/disable can be stored here as JSON values under dedicated keys; no new Prisma model needed for settings storage.
- `components/common/tone-badge.tsx` + `components/common/status-dot.tsx` — required by CLAUDE.md for all status/config pill rendering; use directly for D-11's red/yellow severity distinction.

### Established Patterns
- **Warn-don't-block is a new stance, contrasted with Phase 6's D-11** (`assertStacksDirMatchesHost()`-style "fail loudly" for the proxy stack's own port 80/443 conflicts). Issues #20 and #21 explicitly generalize to non-blocking warnings for arbitrary stacks — do not reuse the fail-loudly pattern here, it's the opposite of what these issues ask for.
- **Shell-out-to-CLI pattern** (`docker compose` via exec, `restic` via `spawn`) — direct precedent for D-13's `ss`/`lsof` shell-out rather than a Node-native socket/process enumeration library.
- **Repository pattern** — any new template persistence (D-05/D-06) goes through a new repository in `server/repositories/`, per CLAUDE.md's architecture rules; Prisma queries never appear directly in the new template application service.

### Integration Points
- `server/src/application/stack-service.ts` `updateStack()` — the compose/.env save handler; this is where D-01/D-02/D-03's diff-and-warning confirmation hooks in.
- Deploy flow (wherever `docker compose up -d` is invoked from the application layer) — where D-09's deploy-time re-check and D-14's port-conflict check both hook in.
- New template service/repository layer (`server/src/application`, `server/src/repositories`) and stack-creation UI — no existing code to extend, per issue #19's own notes; this is greenfield within the existing layered architecture.

</code_context>

<specifics>
## Specific Ideas

- The user explicitly wants the compose-check rules structured as a clean technical abstraction ("easy to add new rules") — this shaped D-12's Strategy-pattern registry design directly.
- The user has already created and published the default template repo at `github.com/docktor-app/templates`, confirmed live during this discussion.

</specifics>

<deferred>
## Deferred Ideas

- **User-authored or plugin-loaded custom compose-check rules** — the user raised wanting rules extensible "maybe by the user or as a plugin" in the future. This is explicitly deferred: it conflicts with PROJECT.md's current "Plugin system" Out-of-Scope line, and raises its own unresolved questions (code loading, sandboxing, trust) that deserve a dedicated scoping discussion rather than being squeezed into this phase. D-12's Strategy-pattern registry makes adding new *built-in* rules easy but includes no mechanism for loading externally-authored ones. Revisit as its own future phase if still wanted.

### Reviewed Todos (not folded)
- `.planning/todos/pending/2026-08-28-configurable-compose-linting.md` — reviewed via the todo-phase matcher. Not folded as a separate item because it is already superseded by issue #20 itself: #20's own "Notes" section states it merges the vision doc's dangerous-config-warning idea with this exact todo. The todo's content is fully represented by #20's acceptance criteria and this discussion's D-09/D-10/D-12 decisions. Can be closed/archived once #20 ships.

</deferred>

---

*Phase: 12-Compose Safety and Templates*
*Context gathered: 2026-10-01*
