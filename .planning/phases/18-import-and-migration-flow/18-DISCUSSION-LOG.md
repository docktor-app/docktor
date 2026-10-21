# Phase 18: Import and Migration Flow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-14
**Phase:** 18-import-and-migration-flow
**Areas discussed:** Detecting Docktor's own stack, Real diff rendering, Backup step semantics, Stop old stack + wizard flow

---

## Detecting Docktor's own stack

| Option | Description | Selected |
|--------|-------------|----------|
| Own container's compose labels | Inspect own container, exclude matching compose path | ✓ |
| container_name 'docktor' | Parse compose files for the container name | |
| Image ghcr.io/docktor-app/docktor | Match by image | |

**User's choice:** Compose labels. When own container is unknown: fail open (list everything) over a heuristic fallback.

## Real diff rendering

| Option | Description | Selected |
|--------|-------------|----------|
| Server jsdiff hunks + UnifiedDiffView | Reuse existing generator and renderer | ✓ |
| Read-only CodeMirror with decorations | New extension work | |
| Both | Diff plus full file toggle | |

**User's choice:** jsdiff + UnifiedDiffView. `.env` preview: read-only CodeEditor with secrets masked.

## Backup step semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Copy kept in new stack dir | `pre-migration-backup/` | ✓ |
| Retain temp-dir copy | | |
| `<dir>.bak` sibling | | |

**User's choice:** Kept in the new stack. Default on; rollback needs no backup (original dir is never modified).

## Stop old stack + wizard flow

| Option | Description | Selected |
|--------|-------------|----------|
| `compose stop` before copy, if chosen | Default on, restartable | ✓ |
| `compose down` after success | | |
| Offer both | | |

**User's choice:** `compose stop`. Dialog flow: 4 steps (Select data, Review, Backup, Old stack) over a 3-step grouping.

## Claude's Discretion

Dialog widths, step indicator styling, warning copy, schema placement, self-container lookup port design.

## Deferred Ideas

Opt-in display of Docktor's own stack (issue #13); `compose down` variant.
