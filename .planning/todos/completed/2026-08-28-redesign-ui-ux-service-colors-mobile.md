---
created: 2026-08-28T12:01:53.982Z
title: Redesign UI/UX — service colors, tab layout, mobile support
area: ui
severity: minor
files:

  - client/src/routes/app/stacks/[id].tsx
  - client/src/components/domain/stack/log-viewer.tsx

audit_acknowledged:
  milestone: v1.0
  at: 2026-09-20
completed: 2026-09-30
status: completed
---

## Problem

User feedback: the current UI is "very basic and not very ux friendly."
Specific asks bundled here (split out from a larger request — see also
[[2026-08-28-add-yaml-env-editor]], [[2026-08-28-redesign-dashboard-statistics]],
[[2026-08-28-frontend-refactor-audit]], [[2026-08-28-configurable-compose-linting]]):

- Assign each service in a stack a consistent color, and carry that color
  through into the log viewer (`log-viewer.tsx`) so log lines are visually
  attributable to their service at a glance.
- Redesign the stack detail page's tab layout (`[id].tsx` — currently
  Overview/Compose/Environment/Logs/Backups via shadcn `Tabs`).
- Support mobile devices — current layout has not been designed/tested for
  small viewports.

## Solution

TBD. Needs a design pass (colors: derive from a fixed palette keyed by
service name, or let users pick per-service; tabs: consider whether all 5
tabs still make sense post-redesign; mobile: audit current layout's
responsiveness component by component).

## Resolution

Closed by Phase 11 (UI Rework). Tab layout and consistent status/badge
colors were resolved by **D-11** (single ToneBadge/StatusDot scheme applied
across **11-02**, **11-06**, **11-08**) and the tab-layout merge decisions
**D-01**/**D-02** (Config tab merges the former Compose/Environment tabs,
landed in **11-01**). Mobile support — the explicit "audit current layout's
responsiveness component by component" ask — is **D-17**, closed by this
plan (**11-13**): a Playwright `mobile-chromium` project plus a
component-by-component 390px light/dark audit, with core-flow breaks fixed
inline and cosmetic findings filed as GitHub issues (see #71). Per-service
log-line coloring (a distinct ask from "service colors" in the tab/mobile
sense) remains deferred as decision D-12 and was not introduced here, per
this phase's explicit prohibition on filing or implementing deferred
color work.
