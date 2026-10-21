# Phase 19: Sidebar, Templates and Version Block - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-18
**Phase:** 19-sidebar-templates-and-version-block
**Areas discussed:** Version string source, Docs link target, Create-flow entry point, Section structure

---

## Version string source

| Option | Description | Selected |
|--------|-------------|----------|
| package.json only | UI-SPEC D-06; no Docker/CI change | ✓ |
| package.json + dev marker | Dev builds show `-dev` | |
| Release tag via build arg | Touches Dockerfile and publish.yml | |

**User's choice:** package.json only

---

## Docs link target

| Option | Description | Selected |
|--------|-------------|----------|
| github.com/docktor-app/docks | UI-SPEC D-07 | |
| Other URL | User supplies docs-site URL | ✓ |

**User's choice:** Other: getdocktor.dev
**Notes:** Overrides UI-SPEC D-07 for the sidebar link only.

---

## Create-flow entry point

| Option | Description | Selected |
|--------|-------------|----------|
| Keep /stacks/create/templates | UI-SPEC D-04; existing tests stay valid | ✓ |
| Retarget to /templates | Old path becomes alias | |

**User's choice:** Keep /stacks/create/templates

---

## Section structure

| Option | Description | Selected |
|--------|-------------|----------|
| Platform + System | Dashboard/Stacks/Templates; Storage/Settings | ✓ |
| Three sections | Overview / Deploy / System | |
| Different grouping | User describes | |

**User's choice:** Platform + System

---

## Claude's Discretion

File extraction and layout within the UI-SPEC table.

## Deferred Ideas

- In-app docs links (`docs-links.ts`) to getdocktor.dev
- "New version available" notice
