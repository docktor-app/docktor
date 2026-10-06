# Phase 12: Compose Safety and Templates - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-01
**Phase:** 12-Compose Safety and Templates
**Areas discussed:** Diff-before-apply flow (#18), Git-based templates (#19), Dangerous-config warnings (#20), Port-conflict detection (#21)

---

## Diff-before-apply flow (#18)

| Option | Description | Selected |
|--------|-------------|----------|
| Unified diff | GitHub-style single column with +/- lines | ✓ |
| Side-by-side | Old vs new in two columns | |
| You decide | Claude picks based on CodeMirror/ComposeEditor patterns | |

**User's choice:** Unified diff

| Option | Description | Selected |
|--------|-------------|----------|
| Skip for new stacks (recommended) | No diff on first save, nothing to compare against | ✓ |
| Show an "all new" diff on create too | Diff against an empty file for consistency | |

**User's choice:** Skip for new stacks

| Option | Description | Selected |
|--------|-------------|----------|
| One merged dialog (recommended) | Diff + any triggered warnings shown together | ✓ |
| Two separate dialogs | Diff-confirm first, then a distinct warning dialog if needed | |

**User's choice:** One merged dialog

| Option | Description | Selected |
|--------|-------------|----------|
| Always show (recommended) | No bypass, matches issue's literal wording | |
| Add a "don't ask again" / skip option | Weakens the safety guarantee | |

**User's choice:** Neither — free text: "make it configurable in the settings."
**Notes:** User wants a Settings-level global toggle to skip the diff confirmation, rather than an unconditional always-on dialog or a per-dialog dismiss. Captured as D-04.

---

## Git-based templates (#19)

| Option | Description | Selected |
|--------|-------------|----------|
| Create a new repo under docktor-app org | Seeded with a handful of templates as part of this phase | |
| I have a specific repo/URL in mind | User names it | ✓ |
| You decide — placeholder for now | Use a placeholder URL in config defaults | |

**User's choice:** "i have already created a new repo called docktor-app/templates"
**Notes:** Verified live via `gh repo view docktor-app/templates` during discussion.

| Option | Description | Selected |
|--------|-------------|----------|
| Subdirectories per variant | e.g. templates/nextcloud/default/, templates/nextcloud/with-redis/ | ✓ |
| One template.yml with named variant blocks | Single manifest, more compact but needs a variant-schema parser | |
| You decide | Claude picks based on #19's schema-validation requirement | |

**User's choice:** Subdirectories per variant

| Option | Description | Selected |
|--------|-------------|----------|
| Grid of cards with category filter + search box | Visual browsing, matches Phase 11 card patterns | ✓ |
| Simple searchable list | Lighter-weight, less visual | |
| You decide | Claude picks based on expected template count | |

**User's choice:** Grid of cards with category filter + search box

| Option | Description | Selected |
|--------|-------------|----------|
| Nothing automatic — just record what version was used | Pin is purely provenance metadata | |
| Surface a passive "template updated" badge | Informational only, no auto-apply, like the image-update badge | ✓ |

**User's choice:** Surface a passive "template updated" badge

---

## Dangerous-config warnings (#20)

| Option | Description | Selected |
|--------|-------------|----------|
| On edit-apply and on deploy | Catches in-app edits and externally-edited files via FileWatcher | ✓ |
| On edit-apply only | Externally-edited files wouldn't get re-checked until next editor open | |
| You decide | Claude picks based on cheapest wiring | |

**User's choice:** On edit-apply and on deploy

| Option | Description | Selected |
|--------|-------------|----------|
| New "Compose Checks" settings card | Dedicated card with a toggle per configurable check | ✓ |
| Fold into an existing settings section | Add toggles to general/advanced settings | |

**User's choice:** New "Compose Checks" settings card

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — visually distinct (e.g. red vs yellow) | Always-on checks get stronger (destructive) treatment | ✓ |
| No — same visual treatment for all | Uniform treatment since all checks warn-only | |

**User's choice:** Yes — visually distinct

| Option | Description | Selected |
|--------|-------------|----------|
| Strategy-pattern rule registry (recommended) | Each check its own class/function implementing a shared Rule interface; no runtime plugin loading | ✓ |
| Same, but note user/plugin-authored rules as a deferred idea | Build the registry now, explicitly capture the plugin aspiration as deferred | |

**User's choice:** Strategy-pattern rule registry
**Notes:** User's initial free-text request ("technical abstraction of rules/checks... easy to add new rules, also in the future maybe by the user or as a plugin") surfaced a scope conflict with PROJECT.md's Out-of-Scope "Plugin system" line. Claude flagged the conflict and re-asked with two options; user chose the in-scope Strategy-pattern registry without requesting the plugin-loading half. The plugin/user-authored-rules aspiration is still captured under Deferred Ideas since the user did raise it, even though they didn't select the option that explicitly logged it.

---

## Port-conflict detection (#21)

| Option | Description | Selected |
|--------|-------------|----------|
| Shell out to `ss`/`lsof` (recommended) | Consistent with existing shell-out-to-CLI pattern; falls back to "unknown process" | ✓ |
| Node-level socket probe only | Simpler, but can't name the culprit process | |

**User's choice:** Shell out to `ss`/`lsof`

| Option | Description | Selected |
|--------|-------------|----------|
| Automatically, right before every deploy | Matches issue wording directly | ✓ |
| User-triggered only (a "check ports" button) | User explicitly requests the check | |

**User's choice:** Automatically, right before every deploy

| Option | Description | Selected |
|--------|-------------|----------|
| Name the Docktor stack directly, with a link | More actionable for Docktor-internal conflicts | ✓ |
| Same generic message for both cases | Simpler, one code path | |

**User's choice:** Name the Docktor stack directly, with a link

---

## Claude's Discretion

None — every question in this discussion resolved to a concrete user choice; no area was left to "you decide."

## Deferred Ideas

- User-authored or plugin-loaded custom compose-check rules — raised during the Dangerous-config warnings discussion, deferred due to conflict with PROJECT.md's current Out-of-Scope "Plugin system" line. See CONTEXT.md Deferred Ideas for full rationale.
