---
status: diagnosed
trigger: "G-10-2 (10-UAT.md test 3): Opening a stack's Backups tab causes runaway, continuous network requests. User report: \"when opening the backup tab, infinite requests are fired, and the page gets super slow. I think there is still a bug.\""
created: 2026-09-25T00:00:00Z
updated: 2026-09-25T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — see Resolution
test: n/a (root cause confirmed via static trace of render/effect cycle + reference-equality reasoning)
expecting: n/a
next_action: none — goal is find_root_cause_only, handing back to caller for fix planning

## Symptoms

expected: Opening a stack's Backups tab loads backup history once, then polls at most every 3s, and only while a backup is actually IN_PROGRESS (or for a bounded 30s grace window after mount).
actual: Opening the Backups tab fires a continuous stream of `GET /api/stacks/:id/backups` requests at a rate bound only by network round-trip time (far faster than the intended 3000ms interval), making the page unresponsive.
errors: None (no crash/console error) — purely a performance/request-storm symptom.
reproduction: Open any stack detail page, click the Backups tab, watch Network tab in devtools — request volume climbs continuously with no plateau.
started: Not a Phase 10 regression — see Evidence (file unchanged since before Phase 10 began).

## Eliminated

- hypothesis: "SnapshotsSection's sortedData / getSnapshots stabilizes or destabilizes BackupHistory's reference equality"
  evidence: SnapshotsSection (client/src/routes/app/stacks/components/snapshots-section.tsx) is a sibling component composed alongside BackupHistory in BackupsTab, with its own independent state (`snapshots`) and its own effect scoped correctly to `[stackId]` only (line 50, exhaustive-deps intentionally disabled). It shares no state, props, or effect dependency with BackupHistory. Its `sortedData` local variable (line 36-38) is irrelevant to BackupHistory's loop.
  timestamp: 2026-09-25T00:00:00Z

## Evidence

- timestamp: 2026-09-25T00:00:00Z
  checked: client/src/routes/app/stacks/components/backup-history.tsx lines 44-107 (the effect) and lib/backups-api.ts's getBackups()
  found: |
    getBackups(stackId) -> apiFetch<BackupRecord[]>(...) -> res.json() (client/src/lib/api.ts:63).
    res.json() parses the HTTP response body fresh on every call, producing a brand-new array/object
    graph each time — there is no cache, memoization, or reference reuse anywhere in the fetch path.
    So `data !== backups` (previous state) by reference on literally every successful fetch, even if
    the byte content is identical to the previous response.
  implication: setBackups(data) at line 53 therefore ALWAYS updates state with a new reference, every
    single time fetchBackups() resolves — React's Object.is-based state bailout never triggers.

- timestamp: 2026-09-25T00:00:00Z
  checked: the effect's dependency array (line 107: `[stackId, backups]`) against what the effect body does
  found: |
    The effect both writes `backups` (via setBackups inside fetchBackups) AND declares `backups` as
    one of its own dependencies. Traced the full cycle:
      1. Effect runs (mount or backups-changed): cancelled=false; calls fetchBackups() unconditionally
         at line 84 (not gated by any condition, not inside the interval); also starts a fresh
         pollInterval (3s) and stopPollingTimeout (30s).
      2. fetchBackups() resolves -> setBackups(newRef) -> React marks `backups` dependency changed.
      3. React runs the effect's cleanup (cancelled=true; clears the interval/timeout that were just
         set up in step 1) then re-runs the effect fresh (step 1 again) — including the unconditional
         fetchBackups() call at line 84.
      4. That new fetchBackups() resolves -> setBackups(newRef) -> loop continues from step 2.
    Each iteration's request is fired as soon as the previous one's response is parsed and state is
    set — not throttled by the 3000ms poll interval (that interval is a *separate*, parallel source of
    requests, constantly being created and torn down, but the effect-rerun path dominates because it
    fires immediately on every state update rather than waiting 3s).
  implication: This is a confirmed, self-sustaining infinite loop with no terminating condition —
    matches "infinite requests / page gets super slow" exactly. Request cadence is bound only by
    server response latency, which is why it looks like a "storm" rather than steady 3s polling.

- timestamp: 2026-09-25T00:00:00Z
  checked: whether hasInProgress gating (lines 56, 59-75) or the 30s stopPollingTimeout (lines 92-100)
    prevents or throttles the loop
  found: |
    Neither does. hasInProgress only controls whether the *interval-based* poll continues/stops; it
    does not gate the unconditional line-84 call, which fires on every effect run regardless of
    backup status. The 30s stopPollingTimeout is also irrelevant to the loop's cadence because the
    effect (and therefore the timeout) is torn down and recreated on every backups-reference change —
    in practice the "stop after 30s" window keeps getting reset before it can ever fire, since the
    effect rarely goes 30s without backups changing reference. This is a secondary stale-closure
    symptom of the same root cause, not an independent bug.
  implication: No existing code path in the component throttles or terminates the loop once started.

- timestamp: 2026-09-25T00:00:00Z
  checked: `git log --follow -- client/src/routes/app/stacks/components/backup-history.tsx`
  found: File content has not changed since before Phase 10 (Backend Architecture Refactor) began —
    no Phase 10 plan/commit touched this file.
  implication: This is pre-existing client-side behavior, not a regression introduced by the Phase 10
    backend architecture refactor. It surfaced during Phase 10 UAT incidentally (user happened to open
    the tab while testing an unrelated notification scenario), but the defect itself predates the phase.

## Resolution

root_cause: |
  In client/src/routes/app/stacks/components/backup-history.tsx, the polling useEffect (lines 44-107)
  lists `backups` in its own dependency array (line 107: `[stackId, backups]`) while also being the
  thing that writes `backups` via `setBackups(data)` inside `fetchBackups()` (line 53). Because
  `getBackups()` -> `apiFetch()` -> `res.json()` returns a freshly-parsed array on every call (client/
  src/lib/api.ts:63), `backups` never achieves referential stability between fetches — React's
  Object.is dependency comparison sees a "change" after every single successful response, even when
  the underlying data is unchanged. Each such "change" tears down and re-runs the effect, and the
  effect unconditionally issues a new fetch as its very first action (line 84, `void fetchBackups()`,
  not gated by any interval or IN_PROGRESS check). The result is a self-sustaining request loop with
  no terminating condition, bound only by network round-trip time rather than the intended 3000ms
  poll cadence — i.e. a genuine infinite request loop, confirmed (not merely a theoretical risk).
  This is pre-existing behavior, unchanged since before Phase 10; it is not a Phase 10 regression.
fix: (not applied — goal is find_root_cause_only)
verification: (not applicable — no fix applied)
files_changed: []
