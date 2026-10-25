# Phase 20: Visual Consistency, Dashboard Clarity and Touch Targets - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-20
**Phase:** 20-Visual Consistency, Dashboard Clarity and Touch Targets
**Areas discussed:** Status casing rule, Backups Configured card, Mono font + table restyle, Forms/tabs/touch targets, Stack breadcrumb (added)

---

## Status casing rule

| Option | Description | Selected |
|--------|-------------|----------|
| Title Case | Running, Backing Up (recommended) | |
| lowercase | running, backing up | ✓ |
| UPPERCASE | RUNNING | |

**User's choice:** lowercase. Mapping structure: one module, two maps (recommended).

## Backups Configured card

| Option | Description | Selected |
|--------|-------------|----------|
| Two numbers | Scheduled + Backed up (recommended) | |
| Single 'Backed Up' card | Schedule OR snapshot | ✓ |
| Relabel only | Does not meet DASH-02 | |

**User's choice:** single merged card, labelled "Backup Coverage" as n/total. Data via a new field on the stack list response (recommended).

## Mono font + table restyle

**User's choice:** Geist Mono (recommended). Mono set: KPI numbers, stat-card labels and technical values (broader than recommended). Tables: restyle primitives and migrate all to DataTable (recommended); bordered rounded container (recommended).

## Forms, tabs, touch targets

**User's choice:** shared form layout primitives (recommended). Tab bar: hide the scrollbar, but user clarified it is the **vertical** scrollbar they see, not a horizontal one. Touch targets: per-site classes (recommended).

## Stack breadcrumb (scope addition)

**User's choice:** added from bundle #96 ("breadcrumb of a stack is not redirecting to the stack overview"). Failure case: stack-name crumb on a non-overview tab (recommended).

## Claude's Discretion

Exact spacing/styling values and call-site lists.

## Deferred Ideas

Settings cards react-hook-form migration; auditing other nested stack pages.
