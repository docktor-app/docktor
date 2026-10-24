# Phase 22: Migration Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-22
**Phase:** 22-Migration Hardening
**Areas discussed:** Backup consistency, Unverifiable stop and anonymous volumes, Crash recovery behavior, Disk-space and secret-reveal UX

---

## Backup consistency (#107)

| Option | Description | Selected |
|--------|-------------|----------|
| Single copy after stop | Stop (verified) then backup then copy; consistent data | ✓ |
| Warm copy before stop + delta | rsync while running, final delta after stop | |
| Backup before stop, crash-consistent wording | Copy while running, honest wording | |

**Scope:** Old stack dir + selected bind sources ✓ (alternatives: include named volumes; keep compose dir only).
**Notes:** Conflicts with MIG-09 / SC#4 literal wording; user chose to amend the wording rather than keep "before stop".

---

## Unverifiable stop and anonymous volumes

| Option | Description | Selected |
|--------|-------------|----------|
| Hard refuse, no override | Abort before any copy, state why | ✓ |
| Refuse with re-verify | Manual stop then re-check | |
| Refuse with force override | Typed confirmation | |

**Anonymous volumes:** Flag and require acknowledgment ✓ (alternatives: block; copy automatically).

---

## Crash recovery behavior

**Boot with unfinished journal:** Auto-restore ✓ (alternatives: prompt user; auto only if safe).
**Wording:** Verified-only states ✓ (alternative: optimistic after command exit).

---

## Disk-space and secret-reveal UX

**Disk check:** Hard block with 10% margin ✓ (alternatives: exact size; warn only).
**Reveal:** One toggle, whole diff ✓ (alternative: per-value).

---

## Claude's Discretion

Ledger/journal format, step enum, `~` classification, resolver, env allowlist contents, toast mechanics.

## Deferred Ideas

Warm pre-stop copy, auto-copy of anonymous volumes, named-volume backups.
