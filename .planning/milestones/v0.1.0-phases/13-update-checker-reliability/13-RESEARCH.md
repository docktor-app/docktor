# Phase 13: Update Checker Reliability - Research

**Researched:** 2026-10-06
**Domain:** Server-side bug fixes to existing update-detection and container-status-reporting logic (Fastify/Prisma backend, React client) — no new architecture, no new external packages.
**Confidence:** HIGH (every claim below is grounded by reading the actual current source this session; no web research was needed or available — `brave_search`/`exa_search`/`firecrawl` are all disabled for this project per `init.phase-op`)

## Summary

This phase is pure codebase archaeology, not technology selection. CONTEXT.md already locked every design decision (D-01 through D-11); this research's job was to verify those decisions against the actual current file contents/line numbers and surface integration risks the planner needs to sequence correctly. All nine integration points named in CONTEXT.md's `<canonical_refs>` were opened and read this session; every line number CONTEXT.md cited was independently confirmed correct (see per-decision notes below). No package installs, no schema migrations are needed — the `ImageUpdateCheck` Prisma model already has every column the pruner needs, and `isMovingTag` is a plain boolean added to an existing unvalidated-response route.

Three technical findings go beyond what CONTEXT.md states and materially affect task sequencing:

1. **The #34 catch-up must emit the *per-service* `stack.container_state_changed` event, not just `stack.status_changed`.** The client's two hooks that would show the fix (`use-stack.ts`, `use-stacks.ts`) patch a specific service's `containerState`/`healthStatus` keyed by `serviceName` only in response to a `container_state` SSE event. `StatePoller.reconcile()` — the function whose *pattern* the catch-up is modeled on — does **not** emit this event; it only emits the coarser `stack.status_changed`, and only when the aggregate status actually changes. If the catch-up copies `reconcile()`'s emission shape instead of `handleEvent()`'s, the per-service "unknown" badges that #34 is about will not clear. This is the single most important finding of this research — see Pitfall 1.
2. **No new client-side status risk**: because `deployStack`/`updateImages`/`upgradeServiceImage` already run the *entire* operation (including the DB transition) synchronously before the HTTP response returns, and the UI's own `onAction`/`refetch` callback fires right after that response resolves, the catch-up running inside the service method (before return) means the *acting* browser tab gets the fix "for free" via its own post-action refetch — the SSE emission is what fixes every *other* connected tab/view (dashboard, stack list) within the same few seconds.
3. **`StackService` does not currently depend on `DockerodeClientPort`** (it depends on `DockerExecutorPort`, a different, CLI-oriented port). The catch-up needs `Pick<DockerodeClientPort, "listContainers">` as a new constructor dependency. This is low-risk — `dockerodeClient` is already imported and used elsewhere in `application/index.ts` for `portConflictService`/`deployPreflightService`/`logService` — but it is a new 10th constructor parameter on `StackService`, with exactly one production call site (`application/index.ts:71`) and exactly one test call site (`stack-service.test.ts:111`) to update.

**Primary recommendation:** Build the #34 catch-up as a small new private method on `StackService` that mirrors `StatePoller.handleEvent()`'s per-container update-and-emit loop (not `reconcile()`'s batch-and-maybe-emit-once loop), scoped to the one stack just deployed, using the extracted shared `deriveStackStatus`. Implement #33 and #29 largely as CONTEXT.md already specifies — both are small, additive, and have no surprises beyond what's flagged in Pitfalls below.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stack-level "update available" badge aggregation | Browser / Client (already built) | API / Backend (data source: `withServiceUpdateInfo`) | Pure presentation over already-enriched `services[].updateAvailable`; no new backend work (D-01). |
| Moving-tag detection (`isMovingTag`) | API / Backend | — | Single source of truth must live server-side per D-06; client never hard-codes tag names. |
| Upgrade-dialog moving-tag state/copy | Browser / Client | — | Pure presentation branch on a server-provided boolean; no business logic. |
| "Update Images" shortcut from the dialog | Browser / Client | API / Backend (existing `updateImages` endpoint) | Reuses the existing stack-level mutation; the dialog is just a second call site, not a new capability. |
| Post-deploy status catch-up | API / Backend | Database / Storage (Service/Stack rows) | Must run inside the same request/transaction-adjacent flow as `deployStack`/`updateImages`/`upgradeServiceImage`, which already own all other post-deploy DB writes (CLAUDE.md: routes never touch repos directly; this logic belongs in the application layer, reusing a domain-layer pure derivation). |
| Live propagation of the catch-up's findings | API / Backend (emit) → Browser / Client (SSE consume, already built) | — | Phase 8's existing SSE pipeline (`domainEventBus` → `state-broadcast-subscriber` → `StateBroadcaster` → `/api/events` → `useContainerEvents`) already covers this; D-09 explicitly forbids any client change. |
| Stale `ImageUpdateCheck` row pruning | API / Backend (new job) | Database / Storage (`deleteMany`) | A background job + repository method, same tier as every other scheduled job (`DiskChecker`, `UpdateChecker`). No client surface at all. |

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| #29 | Prune stale `ImageUpdateCheck` rows for retired image+tag combinations | New `ImageUpdateCheckPruner` `IntervalJob` + new repository method; exact reference-set construction verified against `update-checker.ts`'s `findAllImageRefs` (see Code Examples, Pitfall 4) |
| #31 | Stack-level "update available" badge shown aggregated (stack list, dashboard, detail header) | Verified already shipped — `stack-list.tsx:35`, `stack-detail-header.tsx:75`, `dashboard.tsx:63` (via `StackList`) — see Verification Pass below |
| #32 | Badge distinguishes a concrete newer tag from a moving-tag digest change | Verified already shipped — `service-update-badge.tsx:9-15` (`describeServiceUpdate`) — see Verification Pass below |
| #33 | Upgrade dialog shows distinct, correct message for moving-tag services | `service-upgrade-dialog.tsx:162-169` is the exact wrong branch to replace; `isMovingTag` must be added to `getUpgradeCandidates`'s return type and the client's `ServiceTagsResponse` interface (see Code Examples) |
| #34 | Service status reflects reality within a few seconds, not up to 60s | Root-caused precisely (see Summary finding 1 and Pitfall 1); fix is a new `StackService` private method + a new `DockerodeClientPort` dependency |

## Verification Pass for #31/#32 (close-as-is)

Both were independently re-confirmed this session, matching CONTEXT.md D-01/D-02 exactly:

- `client/src/components/domain/stack/stack-update-badge.tsx:4-6` — `hasStackUpdate(services)` returns true if any service has `updateAvailable === true`; line 16 renders `<ToneBadge tone="blue">update available</ToneBadge>` when true, else `null`. `[VERIFIED: client/src/components/domain/stack/stack-update-badge.tsx:4-16]`
- Rendered at `client/src/components/domain/stack/stack-list.tsx:35` (`<StackUpdateBadge services={stack.services} />`) and `client/src/routes/app/stacks/components/stack-detail-header.tsx:75` (`<StackUpdateBadge services={stack.services}/>`). `[VERIFIED: client/src/components/domain/stack/stack-list.tsx:35; client/src/routes/app/stacks/components/stack-detail-header.tsx:75]`
- `client/src/routes/app/dashboard.tsx:7,63` imports and renders `<StackList stacks={recentStacks} .../>` under the "Recent Stacks" section (line 54), so the same badge appears there with zero dashboard-specific code. `[VERIFIED: client/src/routes/app/dashboard.tsx:7,54,63]`
- Badge-copy distinction (#32) lives in `client/src/components/domain/stack/service-update-badge.tsx:9-15`: `describeServiceUpdate(updateAvailable, latestTag)` returns `` `Update available → ${latestTag}` `` when a concrete `latestTag` exists, else `"Content updated"` when `updateAvailable` is true but `latestTag` is null (the moving-tag/digest-only case) — exactly the two strings CONTEXT.md's D-02 cites, verbatim. `[VERIFIED: client/src/components/domain/stack/service-update-badge.tsx:9-15]`

No code changes needed for #31/#32 — only closing the issues after this verification (the planner's task for these two issues is "confirm + close," not "implement").

## Standard Stack

No new libraries. Every piece of this phase is built from packages already in the repo:

| Library | Version (installed) | Purpose in this phase |
|---------|---------|---------|
| `node-cron` | `^3.0.3` | Scheduling the new `ImageUpdateCheckPruner` `IntervalJob`, same mechanism as every other job `[VERIFIED: server/package.json:26]` |
| `dockerode` (via `DockerodeClientPort`) | `^4.0.4` | `listContainers(true)` for the #34 catch-up — the exact same call `StatePoller.reconcile()` already makes `[VERIFIED: server/package.json:22; server/src/jobs/state-poller.ts:292]` |
| `vitest` | `^4.0.18` | Unit tests for the new job, the extended `StackService` methods, and the client dialog branch `[VERIFIED: server/package.json:41]` |
| `@prisma/client` (generated) / Prisma schema | existing `ImageUpdateCheck` model | No migration needed — `imageRef` is already `@unique`, sufficient for the pruner's `deleteMany({where: {imageRef: {notIn: [...]}}})` `[VERIFIED: server/prisma/schema/image-update-check.prisma:1-13]` |

**Installation:** none required.

## Package Legitimacy Audit

**N/A — this phase introduces zero new external packages.** Every dependency used (`node-cron`, `dockerode`, `vitest`) is already installed and in active use elsewhere in the codebase. No `package-legitimacy check` run was needed.

## Architecture Patterns

### System Architecture Diagram — #34 catch-up data flow

```
deployStack() / updateImages() / upgradeServiceImage()   [StackService, application/]
        │
        ├─ existing: transitionStatus(id, ..., "RUNNING" | "ERROR", msg)   ─┐
        │                                                                    │ (unchanged)
        ▼                                                                    │
  NEW: catchUpContainerState(id)  ◄───────────────────────────────────────────┘  runs on BOTH branches
        │
        ├─ docker.listContainers(true)              [DockerodeClientPort — NEW dependency]
        │        │
        │        ▼
        │  filter by Labels["com.docker.compose.project"] === id
        │        │
        │        ▼
        ├─ for each matched service:
        │     repo.updateServiceState({stackId, serviceName, containerId, containerState, healthStatus})
        │        │
        │        ▼
        ├─ deriveStackStatus(updatedServices)        [extracted to domain/, shared with StatePoller]
        │        │
        │        ▼
        ├─ repo.updateStackStatus(id, derivedStatus)  — no-op (returns null) if status unchanged
        │        │
        │        ▼
        └─ bus.emit("stack.container_state_changed", {stackId, serviceName, containerState,
                      healthStatus, stackStatus: derivedStatus, statusLog?})   — ONE per service
                 │
                 ▼
     domainEventBus ──► state-broadcast-subscriber.ts ──► stateEventBroadcaster.publish()
                 │
                 ▼
         GET /api/events (SSE)  ──►  useContainerEvents()  ──►  use-stack.ts / use-stacks.ts
                 │                                                (patch service by serviceName)
                 ▼
     Every connected browser tab's per-service badge updates within the same tick —
     no 60s wait, no reliance on the dropped Docker event that happened during DEPLOYING/UPDATING.
```

**Why the drop happens today (root cause, confirmed by reading the code):** `StatePoller.handleEvent()` unconditionally returns early when `TRANSITIONAL_STATES.has(stack.status)` (`server/src/jobs/state-poller.ts:203`). While `docker.up()`/`docker.composePull()` run inside `deployStack()`/`updateImages()`, the stack's status is `DEPLOYING`/`UPDATING` — so the real-time Docker "start" events StatePoller's own event stream receives during that window are silently dropped. Only `reconcile()`'s 60-second cron tick re-derives state for a stack **not** in a transitional status — and by the time `deployStack()` returns, the status is already `RUNNING`/`ERROR` (not transitional), so the *next* reconcile tick (up to 60s later) is the only thing that currently fixes it. `[VERIFIED: server/src/jobs/state-poller.ts:203,289-365]`

### Recommended Project Structure (new/changed files only)

```
server/src/
├── domain/
│   ├── image-update-detection.ts   # add isMovingTag(tag) / MOVING_TAGS here (D-06) — already the
│   │                                 shared home for buildImageRefFromService; zero I/O, matches
│   │                                 this file's existing contract
│   └── stack-state-derivation.ts   # NEW — deriveStackStatus extracted from state-poller.ts (D-09);
│                                      pure function, StackStatus type-only import, same pattern as
│                                      stack-status-machine.ts
├── jobs/
│   ├── state-poller.ts             # import deriveStackStatus from domain/ instead of local fn
│   ├── update-checker.ts           # import MOVING_TAGS/isMovingTag from domain/ instead of local Set
│   └── image-update-check-pruner.ts # NEW — IntervalJob, daily cron, following disk-checker.ts's
│                                      lazy-production-repo pattern (or update-checker.ts's simpler
│                                      lazy-repo-in-constructor pattern — see Open Questions)
├── repositories/
│   └── image-update-check-repository.ts  # add deleteManyOrphans(existingRefs: string[])
├── application/
│   ├── stack-service.ts            # add 10th ctor param (DockerodeClientPort pick); add
│                                      isMovingTag to getUpgradeCandidates's return; add the
│                                      catch-up private method, called from deployStack/updateImages/
│                                      upgradeServiceImage on both success and failure branches
│   └── index.ts                     # pass dockerodeClient (already imported) as the new ctor arg
└── jobs/index.ts                    # register the new pruner job

client/src/
├── lib/stacks-api.ts                 # add isMovingTag: boolean to ServiceTagsResponse
└── routes/app/stacks/components/
    └── service-upgrade-dialog.tsx   # replace lines 162-169 with an isMovingTag branch + an
                                        unchanged "generic not-checked-yet" branch for the
                                        non-moving-tag case (existing test at line 106 must still pass)
```

### Pattern: IntervalJob for the new pruner

**What:** A cron-scheduled job that does one `deleteMany` per tick, following the exact base-class contract every other scheduled job already uses.
**When to use:** Any "sweep and reconcile against a reference set" job with no event source to attach to (matches #29's requirements exactly — no per-mutation hook needed).
**Example (verified against the actual base class and the actual `DiskChecker`/`UpdateChecker` precedents):**
```typescript
// Source: server/src/jobs/job.ts:43-89 (IntervalJob base class, read this session)
export abstract class IntervalJob implements Job {
    readonly kind: JobKind = "interval"
    abstract readonly name: string
    protected abstract readonly cronExpression: string
    protected abstract readonly runImmediatelyOnStart: boolean
    protected abstract run(): Promise<void> | void
    // start()/stop()/setHealthReporter() are already implemented — a
    // subclass supplies only the three abstract members above.
}
```
```typescript
// Source: server/src/jobs/disk-checker.ts:12-15,111-149 (read this session) — the
// lazy-production-repo-behind-a-Job-facade pattern, needed here because the pruner's
// production repo needs BOTH imageUpdateCheckRepository (for the delete) AND a way to
// read the current distinct Service.image/imageTag set (D-11) without importing db.ts
// eagerly into the unit-test module graph.
export const imageUpdateCheckPruner: Job = {
    name: "ImageUpdateCheckPruner",
    kind: "interval",
    start: async () => { /* lazily construct, then start() */ },
    stop: () => { /* ... */ },
    setHealthReporter: (reporter) => { /* ... */ },
}
```
```typescript
// Source: server/src/jobs/update-checker.ts:232-252 (read this session) — the EXACT rule
// D-11 requires the pruner's reference set to reproduce. This logic currently lives as a
// PRIVATE, UNEXPORTED function inside update-checker.ts's createProductionRepo() — the
// planner must decide where to extract it so both jobs share one implementation (see
// Open Questions #1). Verbatim current logic:
async findAllImageRefs(): Promise<string[]> {
    const rows = await prisma.service.findMany({
        select: {image: true, imageTag: true},
        distinct: ["image", "imageTag"],
    })
    return rows
        .map((r) => buildImageRefFromService(r.image, r.imageTag))
        .filter((ref): ref is string => ref !== null)
}
```

### Pattern: per-service catch-up emission (the #34 fix)

**What:** Mirrors `StatePoller.handleEvent()`'s per-container inspect→write→derive→emit sequence, scoped to one stack's services, called synchronously inside the deploy-family methods.
**When to use:** Exactly the three call sites D-07 names — never a generic "refresh everything" helper.
**Example (verified against the actual event shape and the actual emit call):**
```typescript
// Source: server/src/jobs/state-poller.ts:241-286 (handleEvent, read this session) —
// this is the event shape and emission call the catch-up must reproduce per service,
// NOT reconcile()'s batched shape (reconcile() never emits container_state_changed at all —
// see server/src/jobs/state-poller.ts:289-365, read this session).
this.bus.emit("stack.container_state_changed", {
    stackId: stack.id,
    serviceName,
    containerState,
    healthStatus,
    stackStatus: derivedStatus,
    ...(statusLog && {
        statusLog: {
            id: statusLog.id,
            fromStatus: statusLog.fromStatus,
            toStatus: statusLog.toStatus,
            message: statusLog.message,
            createdAt: statusLog.createdAt.toISOString(),
        },
    }),
})
```
```typescript
// Source: client/src/hooks/use-stack.ts:54-64 and client/src/hooks/use-stacks.ts:46-60
// (read this session) — confirms the client ONLY updates a service's containerState/
// healthStatus in response to a "container_state" event keyed by serviceName. A
// "stack_status" event (what reconcile() emits) only patches the top-level `status`
// field, never a per-service containerState. This is why the catch-up must emit
// container_state_changed per service, not just status_changed.
if (event.type === "container_state") {
    setStack(prev => ({
        ...prev,
        status: event.stackStatus,
        services: prev.services.map(s =>
            s.serviceName === event.serviceName
                ? {...s, containerState: event.containerState, healthStatus: event.healthStatus}
                : s
        ),
    }))
}
```

### Pattern: moving-tag dialog state (the #33 fix)

**What:** A new branch in `ServiceUpgradeDialog`'s existing `state.status === "ready"` rendering, gated on the new `isMovingTag` field, placed so it takes priority over the existing "not checked yet" branch.
**Example (verified against the actual current branches, lines 153-169):**
```tsx
// Source: client/src/routes/app/stacks/components/service-upgrade-dialog.tsx:153-169
// (read this session) — the exact three branches that exist today, in order. The new
// moving-tag branch must be inserted BEFORE the "candidates.length === 0 && !latestTag"
// branch (line 162), since a checked moving-tag service also has candidates:[] and
// latestTag:null by design (checkImage() in update-checker.ts never populates latestTag/
// availableTags for a moving tag — see server/src/jobs/update-checker.ts:379-395, read
// this session) — exactly the collision CONTEXT.md's D-04 describes.
{state.status === "ready" && state.data.candidates.length > 0 && ( /* existing select, unchanged */ )}

{state.status === "ready" && state.data.candidates.length === 0 && state.data.latestTag && ( /* existing "already newest", unchanged */ )}

{/* NEW: insert here, BEFORE the generic fallback below */}
{state.status === "ready" && state.data.isMovingTag && ( /* moving-tag copy + disabled Upgrade + active "Update Images" button */ )}

{/* EXISTING fallback — must still fire for isMovingTag === false (registry-check-failed case, deliberately left as-is per Claude's Discretion) */}
{state.status === "ready" && state.data.candidates.length === 0 && !state.data.latestTag && !state.data.isMovingTag && (
    <p className="text-sm text-muted-foreground">
        The registry has not been checked for this image yet. Checks run on a
        staggered schedule — check back later.
    </p>
)}
```
The existing test `client/test/unit/routes/stacks/service-upgrade-dialog.test.tsx:106-118` ("renders a distinct message when the image has never been checked") asserts on exactly this fallback string for a `{latestTag: null, candidates: []}` response with no `isMovingTag` field (today's response shape). Adding the `!state.data.isMovingTag` guard is required to keep that test green while the new branch handles the moving-tag case. `[VERIFIED: client/test/unit/routes/stacks/service-upgrade-dialog.test.tsx:106-118]`

### Anti-Patterns to Avoid

- **Hiding the per-service Upgrade arrow for moving-tag services:** D-03 explicitly rejects this — the dialog's new state needs a reachable entry point, and `services-section.tsx:107`'s `{svc.updateAvailable && (...)}` condition is already correct and must not be narrowed.
- **Computing `MOVING_TAGS` membership on the client:** D-06 explicitly forbids this — the client must only branch on the server-provided `isMovingTag` boolean, never re-derive it from `currentTag` against a hardcoded list.
- **Reusing `StatePoller.reconcile()`'s emission pattern for the #34 catch-up:** confirmed above (Pitfall 1) to under-fix the bug — it would update the DB correctly but leave other open tabs' per-service badges stale until their own next reconcile tick.
- **Prune-at-mutation hooks:** explicitly rejected by D-10/the Discussion Log — do not add deletion logic to `upgradeServiceImage`/`updateStack`/`deleteStack`; the daily sweep is the single, sole mechanism.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deciding if a tag is "moving" (latest/edge/stable/main/master/nightly) | A second hardcoded list in the client or in the tags route | The single `MOVING_TAGS` set, moved to `domain/` and imported by both `UpdateChecker` and `StackService.getUpgradeCandidates` (D-06) | Two lists drift; `update-checker.ts`'s existing comment (lines 11-14) already documents *why* this set exists — don't duplicate that reasoning either |
| Deriving aggregate stack status from per-service container states | A second copy of the health-check-aware state machine inside `StackService` | The one `deriveStackStatus` function, extracted to `domain/` and imported by both `StatePoller` and the new catch-up (D-09) | `deriveStackStatus` already encodes a specific precedence order (restarting/dead → ERROR; all-exited → STOPPED; any-unhealthy → UNHEALTHY; all-healthy-with-a-health-check → HEALTHY; default → RUNNING) that a second hand-written copy would risk getting subtly wrong |
| Finding "which image refs are currently live" | A fresh Prisma query duplicating `update-checker.ts`'s `findAllImageRefs` logic inside the new pruner | Extract and share the existing logic (see Open Questions #1) | D-11 requires *byte-identical* behavior between what UpdateChecker persists against and what the pruner treats as "still live" — any divergence risks deleting a row an in-flight check is about to re-upsert, or an orphan that is never cleaned up |

**Key insight:** every piece of logic this phase touches already has exactly one correct implementation somewhere in the codebase (`MOVING_TAGS`, `deriveStackStatus`, `findAllImageRefs`'s ref-building rule). The entire phase is "stop having a second almost-identical copy of something that already exists," not "invent new logic."

## Common Pitfalls

### Pitfall 1: Catch-up emits the wrong event shape and silently under-fixes #34
**What goes wrong:** The catch-up is implemented by copying `StatePoller.reconcile()`'s loop (update DB, derive once, emit `stack.status_changed` only if the aggregate status changed) instead of `handleEvent()`'s per-container loop. The DB ends up correct (services' `containerState` columns are populated), and the *acting* tab looks fine (its own post-action `refetch()` reads the now-correct DB row via REST). But every *other* open browser tab — the dashboard, the stack list, a second tab on the same stack detail page — keeps showing "unknown" per-service badges, because `use-stack.ts`/`use-stacks.ts` only patch a service's `containerState` on a `container_state` event, which `reconcile()`-style emission never sends.
**Why it happens:** Both loops look superficially similar (update service rows, derive status, maybe emit); the difference is subtle (one emits per-container, the other emits-at-most-once-for-the-whole-stack) and easy to miss when pattern-matching on "the reconcile() function StatePoller already has."
**How to avoid:** Explicitly model the catch-up on `handleEvent()`'s emission (one `stack.container_state_changed` per service, every time, with the derived `stackStatus` embedded), not `reconcile()`'s. Add a unit test asserting `bus.emit` is called once per service in the stack, with `type`/payload shape matching `StackContainerStateChangedEvent` from `server/src/domain/events.ts:24-37`.
**Warning signs:** A manual multi-tab UAT test (open the stack list in tab A, deploy from tab B) still shows stale "unknown" badges in tab A for a few seconds/until the next 60s tick, even though the implementation "looks done" from a single-tab test.

### Pitfall 2: The catch-up can legitimately overwrite the `ERROR` status `deployStack` just set
**What goes wrong:** On the failure branch, `transitionStatus(id, "DEPLOYING", "ERROR", ...)` runs first, then the catch-up derives a status from real container states (which could compute `STOPPED`, `RUNNING`, or anything else `deriveStackStatus` can return — never literally `"ERROR"`, since that string isn't one of its outputs) and calls `repo.updateStackStatus(id, derivedStatus)`, which **will** overwrite the just-set `ERROR` if `derivedStatus !== "ERROR"` (which it always is, since `deriveStackStatus` cannot produce `"ERROR"` as a status-machine value the same way a deploy failure does — reread `deriveStackStatus`, `server/src/jobs/state-poller.ts:49-76`: its only statuses are `ERROR | STOPPED | UNHEALTHY | HEALTHY | RUNNING`, and its `"ERROR"` branch means "a container is restarting/dead," a different meaning than "the deploy command itself failed").
**Why this is NOT a new risk introduced by this phase:** This exact overwrite already happens today, just up to 60 seconds later — `reconcile()` is not skipped once status is `ERROR` (`ERROR` is not in `TRANSITIONAL_STATES`), so the next 60s tick already re-derives and overwrites a freshly-set `ERROR` with whatever the real containers show. This phase only makes that pre-existing eventual behavior happen within seconds instead of up to 60s — it does not change what the end state converges to. `[VERIFIED: server/src/jobs/state-poller.ts:41-47,289-365]`
**How to avoid / confirm:** Flag this explicitly in the plan's acceptance criteria so the executor doesn't "fix" it by skipping the status write on the failure branch — skipping it would be a *behavior change* (diverging from what 60s-later reconcile already does today), not a fix.

### Pitfall 3: A service with no matching container after a failed/partial deploy silently keeps stale `containerState`
**What goes wrong:** `StatePoller.reconcile()`'s loop only calls `repo.updateServiceState()` for containers it actually finds (`server/src/jobs/state-poller.ts:316-327`); a service whose container was never created (e.g., a compose file with 3 services where only 2 ever started) is used in the *in-memory* `updatedServices` array for status derivation purposes only (defaulting to `"exited"`, line 338) but its DB row's `containerState` is never written. If the catch-up copies this exact pattern, that service's badge can stay stuck on `"unknown"` (or whatever it was before `replaceServices()` wiped it) even after the catch-up runs.
**Why it happens:** `reconcile()`'s loop is a direct `for (const container of projectContainers)` — it iterates containers found, not services expected, so a missing container is invisible to the write path even though it's accounted for in the read path.
**How to avoid:** When building the catch-up, explicitly decide — and test — what happens for a stack service with zero matching containers after the compose command returns (success or failure branch). Recommend: still call `repo.updateServiceState(..., containerState: "exited", healthStatus: null)` for it (matching the in-memory default used for derivation) and still emit its `container_state_changed`, so the UI reflects "exited" rather than silently remaining on a stale/null value.
**Warning signs:** A deploy that partially fails (one service never starts) still shows that one service as "unknown" after the fix ships, while its siblings correctly show "running"/"exited".

### Pitfall 4: `findAllImageRefs`'s ref-building rule is currently private/unexported — it has exactly one call site today
**What goes wrong:** `update-checker.ts:239-252`'s `findAllImageRefs()` is a method on an object literal returned from a local async function (`createProductionRepo`), not an exported top-level function. D-11 requires the pruner to use the *identical* rule. If the planner doesn't notice this, the natural-looking shortcut is to write a second, hand-copied version of the same six lines inside the pruner's own repo — which is exactly the duplication D-11 is trying to prevent, and the two copies can drift silently (e.g., if `update-checker.ts`'s version later gains a filter the pruner's copy doesn't).
**Why it happens:** The function already does exactly what's needed; it's just not currently reachable from outside `update-checker.ts`.
**How to avoid:** Extract this logic once, to a location both `update-checker.ts` and the new pruner job can import (candidates: a new method on `StackRepository` since it queries `prisma.service`, matching that repository's existing `findAllStacks()`-style methods; or a small shared helper module). This is a genuine open decision CONTEXT.md leaves to plan-level detail — see Open Questions #1.
**Warning signs:** Code review finds two near-identical `prisma.service.findMany({distinct: ["image","imageTag"]})` blocks in two different files.

### Pitfall 5: Adding a 10th `StackService` constructor parameter breaks exactly one test file at exactly one line
**What goes wrong:** `server/test/unit/application/stack-service.test.ts:111` constructs `StackService` with all 9 current parameters positionally, each cast `as any`. Adding a 10th parameter (the `DockerodeClientPort` pick) without updating this line will fail every test in the file at the `beforeEach` (TypeScript arity error, or `undefined.listContainers` at runtime for the new tests that exercise the catch-up).
**How to avoid:** Update the single `beforeEach` (line ~101-111) to add a `createMockDockerode()` helper and pass it; no other test file constructs `StackService` directly (confirmed via grep — zero other matches). This is a one-line mechanical fix, not a design risk, but it must be sequenced as part of the same task that changes the constructor signature, or the whole suite goes red for every subsequent task.
**Warning signs:** `yarn workspace @docktor/server test:unit` fails broadly across `stack-service.test.ts` with constructor/arity errors immediately after the signature change, before any new test is even added.

## Code Examples

### Current (wrong) dialog branch being replaced

```tsx
// Source: client/src/routes/app/stacks/components/service-upgrade-dialog.tsx:162-169 (read this session)
{state.status === "ready" &&
    state.data.candidates.length === 0 &&
    !state.data.latestTag && (
        <p className="text-sm text-muted-foreground">
            The registry has not been checked for this image yet. Checks run on a
            staggered schedule — check back later.
        </p>
    )}
```

### Current `getUpgradeCandidates` return shape to extend

```typescript
// Source: server/src/application/stack-service.ts:264-279 (read this session)
async getUpgradeCandidates(
    id: string,
    serviceName: string,
): Promise<{currentTag: string; latestTag: string | null; candidates: string[]}> {
    const stack = await this.getStack(id);
    if (!stack) throw new NotFoundError("Stack not found");
    const svc = stack.services.find((s) => s.serviceName === serviceName);
    if (!svc) throw new NotFoundError("Service not found");
    const imageRef = buildImageRefFromService(svc.image, svc.imageTag);
    const row = imageRef ? await this.updateChecks.findByImageRef(imageRef) : null;
    const {latestTag, candidates} = this.decodeUpgradeCandidates(row);
    return {currentTag: svc.imageTag ?? "latest", latestTag, candidates};
    // NEW: add isMovingTag: MOVING_TAGS.has(svc.imageTag ?? "latest") to this return object
}
```

### Current client response type to extend

```typescript
// Source: client/src/lib/stacks-api.ts:262-266 (read this session)
export interface ServiceTagsResponse {
    currentTag: string;
    latestTag: string | null;
    candidates: string[];
    // NEW: isMovingTag: boolean;
}
```

### Current `StackService` constructor (9 params today)

```typescript
// Source: server/src/application/stack-service.ts:96-107 (read this session)
export class StackService {
    constructor(
        private readonly repo: StackRepository,
        private readonly fs: StackFilesystemPort,
        private readonly docker: DockerExecutorPort,
        private readonly events: StackEventReadRepo,
        private readonly bus: Pick<EventBusPort, "emit">,
        private readonly settings: Pick<SettingsService, "getProxySettings">,
        private readonly updateChecks: ImageUpdateCheckReadRepo,
        private readonly review: StackChangeReviewer,
        private readonly preflight: DeployPreflight,
        // NEW 10th param: private readonly dockerode: Pick<DockerodeClientPort, "listContainers">,
    ) {}
```

### Production wiring call site to update

```typescript
// Source: server/src/application/index.ts:71 (read this session) — dockerodeClient is
// already imported at line 31 and already used for other services in this same file.
export const stackService = new StackService(repo, fs, docker, stackEventRepository, domainEventBus, settingsService, imageUpdateCheckRepository, composeReviewService, deployPreflightService);
// NEW: append `, dockerodeClient` as the 10th argument.
```

### The reference-set construction the pruner must reproduce exactly (D-11)

```typescript
// Source: server/src/jobs/update-checker.ts:239-252 (read this session) — see Pitfall 4
// for why this needs extraction, not duplication.
async findAllImageRefs(): Promise<string[]> {
    const rows = await prisma.service.findMany({
        select: {image: true, imageTag: true},
        distinct: ["image", "imageTag"],
    })
    return rows
        .map((r: {image: string; imageTag: string | null}) =>
            buildImageRefFromService(r.image, r.imageTag),
        )
        .filter((ref): ref is string => ref !== null)
}
```

### The new repository method the pruner needs

```typescript
// server/src/repositories/image-update-check-repository.ts — add alongside the existing
// upsert/findByImageRef/findByImageRefs methods (lines 14-66, read this session). Pattern
// matches this class's existing style exactly — no new abstractions needed.
async deleteManyOrphans(currentRefs: string[]): Promise<{count: number}> {
    return prisma.imageUpdateCheck.deleteMany({
        where: {imageRef: {notIn: currentRefs}},
    });
}
```

## State of the Art

Not applicable in the usual "library X replaced library Y" sense — this phase makes no external-ecosystem changes. The only "old approach → current approach" shift is internal:

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Service status corrected only by the 60s `StatePoller.reconcile()` cron tick after a deploy-family operation | Corrected synchronously inside the deploy-family method itself, broadcast via the same SSE event `reconcile()`/`handleEvent()` already use | This phase (#34) | Status "reflects reality" within the same request, not up to 60s later — closes the gap OBS-03/OBS-04 (Phase 1, already-complete requirements) intentionally left for background reconciliation |
| `ImageUpdateCheck` rows accumulate forever (no deletion path exists anywhere in the codebase — confirmed by grep: zero `prisma.imageUpdateCheck.delete` call sites before this phase) | Daily sweep job deletes rows for retired image+tag combinations | This phase (#29) | Table stops growing unboundedly; no behavior change to the update-checking logic itself |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The best extraction point for the shared "find current distinct Service image+tag refs" logic is a new `StackRepository` method (vs. a standalone shared helper module) | Don't Hand-Roll / Open Questions #1 | Low — either location satisfies D-11's "identical rule" requirement; this is an organizational preference, not a correctness question. If the planner picks differently, no rework beyond the file the method lives in. |
| A2 | `ImageUpdateCheckPruner` should run on a daily cron (`"0 0 * * *"`, matching `DiskChecker`) with `runImmediatelyOnStart: true` rather than `UpdateChecker`'s `false` | Pattern: IntervalJob for the new pruner / Claude's Discretion (CONTEXT.md) | Low — CONTEXT.md explicitly leaves both the cron expression and the immediate-run flag to planner discretion; this is a recommendation, not a locked requirement. Wrong guess just means the pre-existing backlog (issue #29's stated motivation) waits one extra day to clear on first deploy. |
| A3 | The in-dialog "Update Images" button (D-05) should call the `updateImages` API client function directly (mirroring `stack-actions.tsx`'s existing direct-import pattern) rather than threading an `onUpdateImages` callback prop down through `OverviewTab` → `ServicesSection` → `ServiceUpgradeDialog` | Code Examples / D-05 implementation note | Low — CONTEXT.md explicitly defers this choice to plan-level detail. A callback-prop approach also works; it just requires touching three more files for no behavioral difference. |

**If this table is empty:** N/A — three low-risk organizational assumptions are logged above; none affect correctness or require user reconfirmation of a locked decision.

## Open Questions

1. **Where should the shared "current distinct Service image+tag refs" logic live?**
   - What we know: It must produce byte-identical output to `update-checker.ts:239-252`'s current (private) `findAllImageRefs()`, per D-11.
   - What's unclear: Whether to (a) add a method to `StackRepository` (natural fit — it already owns `prisma.service` queries like `findAllStacks()`), (b) export a standalone function from `update-checker.ts` itself (simplest diff, but keeps a jobs/-layer module as the source of truth for something a repository-layer concern), or (c) create a new small shared module.
   - Recommendation: Option (a) — add `StackRepository.findDistinctServiceImageRefs()` (or similar), have `update-checker.ts`'s `createProductionRepo()` and the new pruner's production repo both call it, and have `buildImageRefFromService`'s mapping applied by each caller (it's already a pure domain function, safe to call from both places without import-graph risk).

2. **Should the #34 catch-up call `repo.updateStackStatus()` unconditionally, or should it detect "stack status already matches the just-set transition" and skip the DB write/possible overwrite described in Pitfall 2?**
   - What we know: `repo.updateStackStatus()` already no-ops (returns `null`, no write, no event) when the derived status equals the current status — so calling it unconditionally is always safe from a "redundant write" perspective.
   - What's unclear: Whether the *product* intent is "derived-from-real-containers status should always win" (matching today's eventual 60s-later behavior exactly, per Pitfall 2) or whether the planner wants to special-case the failure branch to never downgrade an `ERROR` the deploy just set.
   - Recommendation: Call it unconditionally (matches D-08's own framing: "the failure case is exactly when reality matters most"), and add an explicit UAT/acceptance-criterion step for a deploy that fails with zero containers up, confirming the final status matches what `reconcile()` would already converge to today.

## Environment Availability

Skipped — this phase has no new external tool/service/runtime dependencies. Everything used (Docker Engine API via the already-running `dockerode` client, Postgres via the already-running Prisma client) is already required and verified by every prior phase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.0.18` (server unit), Vitest + `@testing-library/react` (client unit), Playwright (client integration — not used by this phase, no new spec needed) |
| Config file | `server/vitest.config.ts` (projects: `unit`, `test/integration`); `client/vitest.config.ts` |
| Quick run command | `yarn workspace @docktor/server test:unit` / `yarn workspace @docktor/client test:unit` |
| Full suite command | `yarn test` (runs all workspaces) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| #31/#32 | Badge appears on stack list/detail/dashboard; copy distinguishes concrete-tag vs moving-tag updates | unit (verification only, no new test) | `yarn workspace @docktor/client test:unit --run stack-update-badge service-update-badge` | ✅ `client/test/unit/components/domain/stack/stack-update-badge.test.tsx`, `service-update-badge.test.tsx` |
| #33 | Dialog shows distinct moving-tag state with disabled Upgrade + active Update Images button | unit | `yarn workspace @docktor/client test:unit --run service-upgrade-dialog` | ✅ `client/test/unit/routes/stacks/service-upgrade-dialog.test.tsx` (extend — existing "not checked yet" test at lines 106-118 must stay green) |
| #33 | `isMovingTag` correctly computed server-side for the tags endpoint | unit | `yarn workspace @docktor/server test:unit --run stack-service` | ✅ `server/test/unit/application/stack-service.test.ts` (extend `describe("getUpgradeCandidates", ...)` at line 1484) |
| #34 | Deploy/update/upgrade success and failure branches both run the catch-up and emit per-service events | unit | `yarn workspace @docktor/server test:unit --run stack-service` | ✅ extend `describe("deployStack", ...)` (line 517), `describe("updateImages", ...)` (line 862), `describe("upgradeServiceImage", ...)` (line 1042) |
| #34 | `deriveStackStatus` produces identical output whether called from `StatePoller` or the new catch-up | unit | `yarn workspace @docktor/server test:unit --run state-poller` | ✅ `server/test/unit/jobs/state-poller.test.ts` — add a parity test if the function moves to `domain/` |
| #29 | Pruner deletes only rows whose `imageRef` is absent from the current distinct Service image+tag set | unit | `yarn workspace @docktor/server test:unit --run image-update-check-pruner` | ❌ Wave 0 — new test file needed, no existing coverage for any `ImageUpdateCheckRepository` method today |

### Sampling Rate
- **Per task commit:** the relevant quick-run command above
- **Per wave merge:** `yarn test` (full suite, both workspaces)
- **Phase gate:** Full suite green before `/gsd-verify-work`; `tsc -b` with zero errors (CLAUDE.md requirement)

### Wave 0 Gaps
- [ ] `server/test/unit/jobs/image-update-check-pruner.test.ts` — new file, no existing coverage for the new job (follow `disk-checker.test.ts`'s mock-injection pattern: construct with mocked repo methods, assert `deleteManyOrphans` called with the correct ref set)
- [ ] `server/test/unit/application/stack-service.test.ts` — extend the single `beforeEach` (line ~101-111) with a `createMockDockerode()` helper before any new catch-up test can run (see Pitfall 5)
- [ ] No `server/test/unit/repositories/` directory exists at all today (repositories are presently covered indirectly through service-level unit tests with mocked repo interfaces, or not covered by dedicated unit tests) — the new `deleteManyOrphans` method has no established repository-unit-test precedent to follow; recommend either a thin unit test with a mocked Prisma client matching this file's existing style, or folding verification into the pruner job's own unit test via a mocked `ImageUpdateCheckReadRepo`-shaped interface (preferred, matches every existing job's test style)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth surface touched — all changed routes already sit behind existing `requireAuth` |
| V3 Session Management | No | Not touched |
| V4 Access Control | No | `getUpgradeCandidates`'s existing per-stack service-name scoping (NotFoundError guard, `server/src/application/stack-service.ts:271-272`) is unchanged; `isMovingTag` adds a field to an already-scoped response, not a new access path |
| V5 Input Validation | No new surface | No new request body/params — `isMovingTag` is server-computed output, not client input; the pruner takes no external input at all |
| V6 Cryptography | No | Not touched |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Pruner deletes a row an in-flight `UpdateChecker.checkImage()` is about to upsert (race) | — (data integrity, not a STRIDE security threat) | D-11's own framing: "a ref being checked is by definition in the current service set, so it is never pruned mid-check" — confirmed safe by construction, since the reference set the pruner computes is always a live read of `Service.image`/`imageTag`, and a service row only stops existing after `replaceServices()`/`deleteStack()` runs, which also means `UpdateChecker` would no longer find that ref in its own `findAllImageRefs()` scan either — no window exists where "being checked" and "about to be pruned" can both be true for the same ref. |

This phase has no new attacker-reachable surface — it is entirely internal bug-fixing of status-reporting and cleanup logic behind existing auth/scoping. No new threat model work is required beyond the race-condition reasoning above, which CONTEXT.md's D-11 already states and this research confirms by re-reading the actual query shapes involved.

## Sources

### Primary (HIGH confidence — all read directly, this session)
- `server/src/jobs/update-checker.ts` (449 lines, full read) — `MOVING_TAGS`, `selectUpgradeCandidates`, `checkImage`, `findAllImageRefs`
- `server/src/jobs/state-poller.ts` (369 lines, full read) — `deriveStackStatus`, `handleEvent`, `reconcile`, `TRANSITIONAL_STATES`
- `server/src/repositories/image-update-check-repository.ts` (67 lines, full read)
- `server/src/jobs/job.ts` (161 lines, full read) — `IntervalJob`/`WatcherJob` base classes
- `server/src/jobs/disk-checker.ts` (150 lines, full read) — lazy-production-repo Job-facade pattern
- `server/src/jobs/index.ts`, `server/src/jobs/job-registry.ts` (partial read) — job registration contract
- `server/src/application/stack-service.ts` (937 lines, full read) — `getUpgradeCandidates`, `withServiceUpdateInfo`, `deployStack`, `stopStack`, `restartStack`, `updateImages`, `upgradeServiceImage`, `transitionStatus`, constructor
- `server/src/application/index.ts` (partial read) — production wiring, confirms `dockerodeClient` already imported
- `server/src/application/ports/dockerode-client-port.ts`, `docker-executor-port.ts` (full read) — confirms these are two distinct ports
- `server/src/domain/events.ts` (163 lines, full read) — `DomainEventMap`, `StackContainerStateChangedEvent`
- `server/src/domain/image-update-detection.ts` (94 lines, full read) — `buildImageRefFromService`, confirmed natural home for `MOVING_TAGS`
- `server/src/domain/stack-status-machine.ts` (partial read) — precedent for a pure domain module with type-only `StackStatus` import
- `server/src/lib/state-broadcaster.ts` (90 lines, full read) — `StateBroadcaster`, `StateEvent` union
- `server/src/application/subscribers/state-broadcast-subscriber.ts`, `register.ts` (full read) — the domain-event-to-SSE bridge
- `server/src/repositories/stack-repository.ts` (partial read, ~330 lines) — `findByComposeProject`, `updateServiceState`, `updateStackStatus`, `transitionStatus`, `replaceServices`
- `server/prisma/schema/image-update-check.prisma` (full read) — confirmed no migration needed
- `client/src/routes/app/stacks/components/service-upgrade-dialog.tsx` (183 lines, full read)
- `client/src/routes/app/stacks/components/services-section.tsx` (172 lines, full read)
- `client/src/components/domain/stack/service-update-badge.tsx`, `stack-update-badge.tsx`, `service-status-badge.tsx` (full read)
- `client/src/hooks/use-stack.ts`, `use-stacks.ts`, `use-container-events.ts` (partial/full read) — confirmed per-service SSE patching behavior
- `client/src/lib/stacks-api.ts` (partial read) — `ServiceTagsResponse`, `updateImages`, `getServiceTags`
- `client/src/routes/app/stacks/components/stack-actions.tsx` (partial read) — precedent for direct API-client calls in a page-scoped component
- `server/test/unit/application/stack-service.test.ts`, `server/test/unit/jobs/disk-checker.test.ts`, `server/test/unit/jobs/update-checker.test.ts`, `client/test/unit/routes/stacks/service-upgrade-dialog.test.tsx` (grep + partial read) — existing test conventions and exact regression-risk lines
- `.planning/phases/13-update-checker-reliability/13-CONTEXT.md`, `13-DISCUSSION-LOG.md` — locked decisions and alternatives considered
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.planning/config.json` — project history and workflow toggles

### Secondary (MEDIUM confidence)
- None — no external documentation lookup was performed or available for this phase (no web-search providers configured; none needed, since this phase is 100% internal codebase work)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, every version read directly from `package.json`
- Architecture: HIGH — every integration point named in CONTEXT.md was opened and read this session; line numbers independently re-verified
- Pitfalls: HIGH — Pitfall 1 (the most important finding) is grounded in direct comparison of `handleEvent()` vs `reconcile()`'s emission code and both client hooks' event-handling code, not inference

**Research date:** 2026-10-06
**Valid until:** No external dependency volatility (no new packages); valid until the next phase that touches `StackService`'s constructor, `state-poller.ts`, or `update-checker.ts` materially changes their shape — recommend re-verifying line numbers at plan time if execution is delayed more than a few weeks past this research.
