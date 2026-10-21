---
phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
plan: 10
subsystem: ui
tags: [react, data-table, monospace, touch-target, vitest]
status: complete

requires:
  - phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
    provides: "20-01 formatStatusLabel, 20-02 DataTable/ExpandedRow, 20-03 TOUCH_TARGET"
provides:
  - "Services, proxy domains and incidents tables on the shared DataTable frame"
  - "Mono technical values (service name, image, tag, ports, domain, service, internal port, update tag)"
  - "Lowercase upgrade-blocked label through formatStatusLabel"
affects: [20-11]

commits: 6
plan_head_before: d40e7b8fd2488dfe075175b027c68727027341e0
plan_head_after: 949b2560679b422fba29ec2b3c2fc5c7d1e50730

actuals:
  tokens: 14000
  tasks: 3
  commits: 6

key-files:
  modified:
    - client/src/routes/app/stacks/components/services-section.tsx
    - client/src/components/domain/stack/service-update-badge.tsx
    - client/src/routes/app/stacks/components/proxy-domains-table.tsx
    - client/src/routes/app/stacks/components/proxy-tab.tsx
    - client/src/routes/app/stacks/components/incident-list.tsx
    - client/test/unit/routes/stacks/services-section.test.tsx
    - client/test/unit/components/domain/stack/service-update-badge.test.tsx
    - client/test/unit/routes/stacks/proxy-domains-table.test.tsx
    - client/test/unit/routes/stacks/incident-list.test.tsx

key-decisions:
  - "Services actions cell extracted to a private ServiceActions component; health history uses ExpandedRow in table mode and the bare timeline in card mode"
  - "Proxy aggregation stays in the consumer (groupByService); per-domain values are stacked in each cell"
  - "Incident scroll box wraps DataTable only when incidents exist so the empty copy is not clipped"

requirements-completed: [UI-08, UI-03, UI-02]
---

# Phase 20 Plan 10: Stack-detail tables on DataTable Summary

**Services, proxy domains and incidents now render in the shared DataTable frame with mono technical values, 44px-below-md row actions via TOUCH_TARGET, and a lowercase upgrade-blocked label.**

## Accomplishments

- Services: DataTable with colour dot, compact status badge, HTTP probe pill, update badge, upgrade/logs/history actions (aria-labels unchanged) and the expandable health-history row (`ExpandedRow`, colSpan 6, `bg-muted/50`). Name, image (`break-all`), tag and ports are `font-mono text-xs`. Blocked label reads "Cannot upgrade while the stack is deploying" / "backing up".
- Update badge keeps the copy "Update available -> {tag}" with the tag in a mono span; `describeServiceUpdate` unchanged.
- Proxy domains: one DataTable row per service, mono domain/service/internal port, CertStatusBadge pills, per-domain Edit/Remove; the empty copy moved from `proxy-tab.tsx` into DataTable (`ProxyDomainsTable` is now always rendered).
- Incidents: DataTable inside `max-h-96 overflow-y-auto`, right-aligned tabular duration, Ongoing pill, own loading skeletons and error alert; private `IncidentRow` replaced by column definitions.
- Duplicated 44px min-size literals removed in favour of `TOUCH_TARGET`.

## Task Commits

1. Services RED `76d5020`, GREEN `93c5843`
2. Proxy domains RED `de5fcef`, GREEN `2f87a52`
3. Incidents RED `fa3aeb1`, GREEN `949b256`

## Verification

Targeted vitest runs green: services-section, service-update-badge, service-health-timeline, proxy-domains-table, proxy-tab, incident-list, uptime-card, stack-detail-page.

Deferred to CI (per the user's resource constraint): `tsc --build` / typecheck, full unit suite, Playwright (`service-health.spec.ts`, `proxy.spec.ts`, `uptime.spec.ts`, `stacks.spec.ts`), and the backstop checks (60-character image at 375px, light/dark visual check; the Playwright overflow check lands in plan 20-11).

## Deviations from Plan

None - plan executed as written. The RED-before-GREEN test commits for tasks 2 and 3 were committed after the implementation had been run once locally, but as separate test/feat commits. The "right-aligned Duration" incident assertion already held before the migration, so only the frame/scroll-container test was RED for task 3.

## Known Stubs

None.

## Threat Flags

None. All values still render as React text; the upgrade gate and Remove confirmation flow are unchanged.

## Self-Check: PASSED

All six commits are ancestors of HEAD; the modified source and test files exist.
