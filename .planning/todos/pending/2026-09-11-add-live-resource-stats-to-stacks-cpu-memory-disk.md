---
created: 2026-09-11T21:13:53.097Z
title: Add live resource stats to stacks (CPU, memory, disk)
area: observability
severity: minor
files:

  - client/src/routes/app/stacks/[id].tsx
  - client/src/routes/app/dashboard.tsx

audit_acknowledged:
  milestone: v1.0
  at: 2026-09-20
---

## Problem

Docktor currently has no live resource metrics for stacks — no CPU, memory,
or disk usage visibility per stack/service. User wants this surfaced in two
places: the stack detail view, and the dashboard (as part of the richer
dashboard stats rework tracked in
[[2026-08-28-redesign-dashboard-statistics]]).

## Solution

TBD. Needs a source for live metrics — likely Docker stats API
(`docker stats` / container stats endpoint) polled or streamed via the
existing `StatePoller`/SSE infrastructure rather than a new REST poll (see
CLAUDE.md real-time rules). Disk usage may need a different source (volume
size on the host) since it isn't part of container stats. Should land as a
domain-aware component in `components/domain/stack/` consumed by both the
stack detail page and a dashboard stat card.
