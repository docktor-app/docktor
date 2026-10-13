---
phase: 08-live-state-consistency
plan: 03
subsystem: client-realtime-config-sync
tags: [sse, config-changed, use-stack, toast, react-hook]
requires:
  - phase: 08-live-state-consistency
    provides: "config_changed SSE events tagged source: \"app\" | \"external\" (companion plan 08-02-PLAN.md's server-side discriminator)"
provides:
  - "ConfigChangedEvent (client mirror) gains a required source: \"app\" | \"external\" field, byte-identical to the server's field"
  - "use-stack.ts's config_changed handler shows the \"changed externally\" toast only when event.source === \"external\"; the background refetch stays unconditional"
  - "Closes the client-visible half of UAT gap G-08-2 (major, test V2) — a user saving compose or env content through the app no longer sees a false 'changed externally' toast about their own edit"
affects: []
actuals:
  tokens: 1744
  tasks: 1
  commits: 2
tech-stack:
  added: []
  patterns:
    - "Origin-gated toast: the background refetch on a state-sync SSE event stays unconditional; only the user-facing toast is gated on the event's declared origin"
key-files:
  created: []
  modified:
    - client/src/hooks/use-container-events.ts
    - client/src/hooks/use-stack.ts
    - client/test/unit/hooks/use-stack.test.ts
    - client/test/unit/hooks/use-stack-events.test.ts
key-decisions:
  - "ConfigChangedEvent.source is required (not optional), matching the server's own required field, so a future third publisher can't ship an untagged broadcast that silently falls through to the safe no-toast path unnoticed"
  - "Every pre-existing config_changed event literal not asserting toast behavior was given source: \"app\" (not \"external\") — this incidentally keeps the silent-refresh path exercised across more scenarios, per the plan's explicit guidance"
patterns-established: []
requirements-completed:
  - "Closes the client half of UAT gap G-08-2 (major, test V2) diagnosed in 08-UAT.md against phase 08's ROADMAP scope item 2 (env file changes must flag config-changed) — .planning/todos/completed/2026-08-28-env-file-changes-dont-flag-config-changed.md. Server half (the source discriminator's origin) is closed by the companion plan 08-02-PLAN.md."
coverage:
  - id: D1
    description: "A config_changed event tagged source: \"external\" still shows the yellow \"Configuration file changed externally\" toast, unchanged copy and styling"
    requirement: "G-08-2 (client half)"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-stack.test.ts — \"a config_changed event shows a warning-styled (yellow) toast, matching the config-changed badge elsewhere\""
        status: pass
    human_judgment: false
  - id: D2
    description: "A config_changed event tagged source: \"app\" refreshes the tab's stack state (isRefreshing true then the fresh stack lands) with no toast at all"
    requirement: "G-08-2 (client half)"
    verification:
      - kind: unit
        ref: "client/test/unit/hooks/use-stack.test.ts — \"does not show a toast for an app-initiated (source: \\\"app\\\") config_changed event, but still refreshes silently\""
        status: pass
    human_judgment: false
  - id: D3
    description: "Full client unit test:unit run and monorepo typecheck stay green; this plan's own two touched test files pass cleanly"
    verification:
      - kind: unit
        ref: "yarn workspace @docktor/client test test/unit/hooks/use-stack.test.ts -> 17/17 passed; test/unit/hooks/use-stack-events.test.ts -> 11/11 passed"
        status: pass
      - kind: other
        ref: "yarn typecheck -> silent exit 0"
        status: pass
      - kind: unit
        ref: "yarn workspace @docktor/client test:unit -> 5 test files failed (proxy-tab.test.tsx, certificates-card.test.tsx, service-upgrade-dialog.test.tsx, stack-actions.test.tsx, stack-detail-page.test.tsx), all on 15000ms timeouts under severe host contention (uptime load avg 86 on this host during the run, swap fully exhausted); none of these five files are in this plan's declared scope or touch use-stack.ts/use-container-events.ts"
        status: unknown
    human_judgment: true
    rationale: "The full-suite run hit a pre-existing, previously-documented host-contention flake class (same as STATE.md's [Phase 06-05]/[Phase 08-01] entries) on files entirely outside this plan's scope, at a moment of extreme host load (86 load average on what STATE.md elsewhere describes as a 6-core host, swap exhausted). This plan's own two touched test files pass 28/28 in isolation and the acceptance-criteria greps/typecheck are all green, but a human should confirm the full suite is green on an unloaded host before treating D3 as fully closed."
duration: 18min
completed: 2026-09-19
status: complete
---

# Phase 08 Plan 03: Client-Side Config-Changed Toast Origin Gating Summary

**`use-stack.ts`'s "Configuration file changed externally" toast now fires only for `config_changed` events tagged `source: "external"`; an app-initiated save (same tab or any other open tab) refreshes state silently, closing the client half of UAT gap G-08-2.**

## Performance
- **Duration:** ~18min
- **Started:** 2026-09-19T22:19:43Z
- **Completed:** 2026-09-19T22:37:44Z
- **Tasks:** 1
- **Files modified:** 4

## Accomplishments
- Added a required `source: "app" | "external"` field to `ConfigChangedEvent` in `client/src/hooks/use-container-events.ts`, mirroring `server/src/lib/state-broadcaster.ts`'s field byte-identically, following the file's existing "hand-maintained mirror" comment convention (as already used for `ProxyCertStatusEvent`).
- Wrapped `use-stack.ts`'s `toast.warning('Configuration file changed externally', ...)` call in `if (event.source === "external")`, leaving `void fetchStack("background")` unconditional exactly as before — an app-initiated save now refreshes the tab's state with no toast, while an externally-detected change still shows the yellow toast unchanged.
- Updated every pre-existing `config_changed` event literal across `use-stack.test.ts` and `use-stack-events.test.ts` to satisfy the now-required `source` field, and added a new test proving the app-initiated silent-refresh path.

## Task Commits
1. **Task 1 RED: failing test for app-initiated toast gating** - `af5fef2` (test)
2. **Task 1 GREEN: gate the config-changed toast on event.source** - `a706fc7` (feat)

No refactor commit — the implementation (one interface field, one `if` guard) needed no cleanup pass.

## Files Created/Modified
- `client/src/hooks/use-container-events.ts` - `ConfigChangedEvent` gains the required `source: "app" | "external"` field with a mirror-convention comment
- `client/src/hooks/use-stack.ts` - `config_changed` branch's `toast.warning` call is now gated on `event.source === "external"`; the background refetch is untouched
- `client/test/unit/hooks/use-stack.test.ts` - existing warning-toast test tagged `source: "external"`; new silent-refresh test added; five other pre-existing `config_changed` literals tagged `source: "app"` for type conformance
- `client/test/unit/hooks/use-stack-events.test.ts` - three `config_changed` literals tagged `source: "app"` for type conformance (this hook does not read `source`, zero behavior change)

## Decisions Made
- `ConfigChangedEvent.source` made required (not optional), matching the server-side field from companion plan 08-02, so a future third publisher can't ship an untagged event that silently no-ops the toast without anyone noticing.
- Every non-toast-asserting `config_changed` test literal was tagged `source: "app"` (not `"external"`) per the plan's explicit instruction — keeps the silent-refresh path exercised across the broadest set of pre-existing scenarios.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0. **Impact:** none.

## Issues Encountered

The full `yarn workspace @docktor/client test:unit` run showed 5 failed test files (`proxy-tab.test.tsx`, `certificates-card.test.tsx`, `service-upgrade-dialog.test.tsx`, `stack-actions.test.tsx`, `stack-detail-page.test.tsx`), all failing on `Test timed out in 15000ms` errors. None of these files are in this plan's declared scope, and none touch `use-stack.ts` or `use-container-events.ts`. `uptime` during the run showed a load average of 86 with swap fully exhausted on this shared host — the same pre-existing host-contention flake class already documented in STATE.md ([Phase 06-05], [Phase 08-01]). Re-running the five failing files in isolation still showed failures, but with individual test durations exceeding two minutes each (vs. a 15s timeout), confirming the host itself, not the code, is the bottleneck at this moment. This plan's own two touched test files (`use-stack.test.ts`, `use-stack-events.test.ts`) pass cleanly in isolation (17/17 and 11/11), and `yarn typecheck` exits silently (0). Flagged as `human_judgment: true` under coverage D3 for a re-run confirmation on an unloaded host — out of this plan's scope to fix per the scope-boundary rule.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness

Both halves of UAT gap G-08-2 are now closed: the server-side origin tag (08-02-PLAN.md) and this plan's client-side toast gate. A user saving compose or env content through the app — in the same tab or any other open tab — now sees a silent state refresh instead of a false "changed externally" toast. No blockers for subsequent phase 08 work. A human should re-run `yarn workspace @docktor/client test:unit` on an unloaded host to confirm the 5 unrelated flaking files are unaffected, matching the precedent already set for prior host-contention incidents in this phase.

---
*Phase: 08-live-state-consistency*
*Completed: 2026-09-19*

## Self-Check: PASSED

- FOUND: `.planning/phases/08-live-state-consistency/08-03-SUMMARY.md`
- FOUND: `af5fef2` (test: RED — failing test for app-initiated toast gating)
- FOUND: `a706fc7` (feat: GREEN — gate the config-changed toast on event.source)
- FOUND: `client/src/hooks/use-container-events.ts`
- FOUND: `client/src/hooks/use-stack.ts`
