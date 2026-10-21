# Phase 13: Update Checker Reliability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-05
**Phase:** 13-update-checker-reliability
**Areas discussed:** #31/#32 scope check, Moving-tag UX (#32+#33), #34 status catch-up, #29 prune strategy

---

## #31/#32 scope check

| Option | Description | Selected |
|--------|-------------|----------|
| Verify & close as-is | Treat Phase 11 D-09/D-10 badge work as satisfying #31/#32; close after short verification; Phase 13 effort goes to #33/#34/#29 | ✓ |
| Refine both issues | Keep #31/#32 open as working items — clickable badge, richer copy/tone, distinct moving-tag tone | |
| Close #31, keep #32 open | #31 demonstrably complete; #32 resolved together with #33 in the joint moving-tag design | |

**User's choice:** Verify & close as-is (Recommended)
**Notes:** The stack-level badge is wired at stack list, detail header, and dashboard (via `StackList`); `withServiceUpdateInfo` enriches payloads; dashboard already counts "Updates Available". Both issues close after a short verification pass. The "joint design" obligation attached to #32 is discharged by the #33 moving-tag decisions (badge copy itself unchanged).

---

## Moving-tag UX (#32+#33)

| Turn | Option | Description | Selected |
|------|--------|-------------|----------|
| Q1: Upgrade affordance | Keep arrow, fix dialog | Keep the per-service Upgrade arrow; dialog gets a distinct moving-tag state (disabled Upgrade) — satisfies #33's dialog AC | ✓ |
| Q1 | Hide arrow for moving tags | No arrow for moving tags; but then the mandated distinct dialog state has no entry point | |
| Q2: CTA | Text guidance only | Dialog copy points to the header's Update Images button; no cross-component wiring | |
| Q2 | In-dialog Update Images button | Dialog renders an active button that runs the stack-level updateImages action, then closes | ✓ |
| Q3: server exposure | Server flag via shared set | Add `isMovingTag` to the tags endpoint; move `MOVING_TAGS` from `update-checker.ts` into a shared server module; nothing duplicated client-side | ✓ |
| Q3 | Compute in client | Client hard-codes the moving-tag list against `currentTag`; no server change but list drifts in two places | |

**User's choice:** Keep arrow, fix dialog → In-dialog Update Images button → Server flag via shared set (all Recommended)
**Notes:** The moving-tag dialog state replaces the factually-wrong "not checked yet" message; the per-service arrow stays because #33 requires a dialog state that has a reachable entry point. The in-dialog button is a shortcut to the pre-existing, canonical stack-level Update Images action.

---

## #34 status catch-up

| Option | Description | Selected |
|--------|-------------|----------|
| Q1: Deploy-family only | Catch-up after deployStack, updateImages, upgradeServiceImage only; restart/stop out of scope | ✓ |
| Q1: + restart | Also restartStack, which collapses the same window there | |
| Q1: All operations | Also stopStack — widest coverage, more test surface | |
| Q2: Success only | Catch-up on success branch only; failures show the banner and wait for reconcile | |
| Q2: Success and failure | Catch-up on both branches — a failed deploy instantly shows real exit/crash states | ✓ |
| Q3: Shared derive + same SSE events | Extract deriveStackStatus to a shared module; catch-up emits container_state_changed/status_changed so the client updates live (Phase 8 SSE); no client changes | ✓ |
| Q3: Persist only, client refetches | App writes DB rows only; needs new client refetch wiring | |

**User's choice:** Deploy-family only → Success and failure → Shared derive + same SSE events (all Recommended)
**Notes:** The catch-up runs after the status transition on both branches; it polls reality via `docker listContainers(all)`, which is safe even when the compose operation failed. `restartStack`/`stopStack` have different mechanics and stay out.

---

## #29 prune strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Q1: Periodic sweep only | Daily job deletes rows whose imageRef isn't in the current distinct image+tag set; one code path, catches the pre-existing backlog | ✓ |
| Q1: Event-driven at mutation | Prune at upgradeServiceImage/updateStack/deleteStack; immediate but misses pre-existing orphans and needs hooks everywhere | |
| Q1: Hybrid | Event prune + periodic safety net; most robust, two mechanisms to test | |
| Q2: Own job, daily | Dedicated IntervalJob (DiskChecker pattern), daily; clean separation, isolated tests | ✓ |
| Q2: Piggyback on UpdateChecker | Sweep inside the checker's 5-min cron behind a daily timestamp gate; no new job but two concerns in one | |
| Q2: Own job, weekly | Same dedicated job, weekly cadence; minimal churn, orphans linger longer | |

**User's choice:** Periodic sweep only → Own job, daily (both Recommended)
**Notes:** The prune's ref set must be built with the identical rule UpdateChecker persists (distinct image+tag via `buildImageRefFromService`), so it never deletes a live ref and never races in-flight checks. No behavior change to update checking.

---

## Claude's Discretion

- Exact moving-tag dialog copy and tone (direction locked in D-04/D-05).
- Exact daily cron expression and job name for the pruner (D-10); whether it runs immediately on startup.
- How the in-dialog Update Images button obtains the stack action (callback prop vs. direct API call).
- Considered-and-left: no fourth dialog state for non-moving tags whose registry tag-list failed; the generic "can't determine versions" copy covers it.

## Deferred Ideas

- Fourth upgrade-dialog state exposing registry-failure/`checkError` for non-moving tags — left out as scope creep.
- Event-driven/hybrid pruning (prune-at-mutation in addition to the daily sweep) — rejected for a single-sweep code path.
