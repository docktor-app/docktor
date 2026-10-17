# Phase 13: Update Checker Reliability - Pattern Map

**Mapped:** 2026-10-06
**Files analyzed:** 9 (new: 2, modified: 7)
**Analogs found:** 9 / 9

Note: #31 and #32 require **zero file changes** (verify-and-close only, per CONTEXT.md D-01/D-02 and RESEARCH.md's Verification Pass). They are excluded from the tables below; the planner should simply schedule a confirmation task against the already-shipped components (`stack-update-badge.tsx`, `service-update-badge.tsx`, `stack-list.tsx`, `stack-detail-header.tsx`, `dashboard.tsx`).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/domain/stack-state-derivation.ts` (NEW) | domain/utility | transform | `server/src/domain/stack-status-machine.ts` | exact (pure domain module, type-only `StackStatus` import) |
| `server/src/domain/image-update-detection.ts` (MODIFY — add `MOVING_TAGS`/`isMovingTag`) | domain/utility | transform | itself (existing file, add to it) | exact — same file already hosts `buildImageRefFromService` |
| `server/src/jobs/image-update-check-pruner.ts` (NEW) | job | batch | `server/src/jobs/disk-checker.ts` | exact (IntervalJob, lazy-production-repo-behind-Job-facade) |
| `server/src/repositories/image-update-check-repository.ts` (MODIFY — add `deleteManyOrphans`) | repository | CRUD (delete) | itself (existing file, add alongside `upsert`/`findByImageRef`) | exact |
| `server/src/repositories/stack-repository.ts` (MODIFY — add shared ref-finder, Open Question #1 recommendation) | repository | CRUD (read) | `server/src/jobs/update-checker.ts`'s private `findAllImageRefs` (logic to extract, not a file analog) | role-match |
| `server/src/application/stack-service.ts` (MODIFY — `getUpgradeCandidates` + catch-up + ctor) | service | request-response / event-driven | itself (existing file; `deployStack`/`handleEvent`-style patterns) | exact |
| `server/src/jobs/state-poller.ts` (MODIFY — import extracted `deriveStackStatus`) | job | event-driven | itself | exact |
| `server/src/jobs/update-checker.ts` (MODIFY — import extracted `MOVING_TAGS`) | job | batch | itself | exact |
| `server/src/jobs/index.ts` (MODIFY — register pruner) | config/registry | event-driven (startup) | itself | exact |
| `client/src/lib/stacks-api.ts` (MODIFY — `isMovingTag` field) | utility (API client) | request-response | itself | exact |
| `client/src/routes/app/stacks/components/service-upgrade-dialog.tsx` (MODIFY — new branch) | component | request-response | itself | exact |
| `server/test/unit/jobs/image-update-check-pruner.test.ts` (NEW) | test | batch | `server/test/unit/jobs/disk-checker.test.ts` | exact |

## Pattern Assignments

### `server/src/domain/stack-state-derivation.ts` (NEW — domain, transform)

**Analog:** `server/src/domain/stack-status-machine.ts` (pure domain module pattern) + the function being extracted, `server/src/jobs/state-poller.ts:49-76` (`deriveStackStatus`).

**Extraction target** — move this function verbatim into the new module:
```typescript
// Source: server/src/jobs/state-poller.ts:49-76 (read during research)
// deriveStackStatus(services): precedence order —
//   restarting/dead container → ERROR
//   all containers exited → STOPPED
//   any container unhealthy → UNHEALTHY
//   all containers healthy (with a health check) → HEALTHY
//   default → RUNNING
// Pure function: no I/O, no Prisma, type-only StackStatus import — matches
// stack-status-machine.ts's existing contract exactly.
```

**Core pattern:** keep the function pure and exported; `state-poller.ts` and the new `StackService` catch-up both `import {deriveStackStatus} from "../domain/stack-state-derivation.js"`. Do not duplicate the precedence logic anywhere else (Don't-Hand-Roll table in RESEARCH.md).

---

### `server/src/domain/image-update-detection.ts` (MODIFY — add `MOVING_TAGS`/`isMovingTag`)

**Analog:** itself — already the shared home for `buildImageRefFromService` (94 lines, pure, no I/O).

**Extraction target:**
```typescript
// Source: server/src/jobs/update-checker.ts:15 (module-local MOVING_TAGS set, read this
// session) — move verbatim into domain/image-update-detection.ts, export both the Set
// and a small `isMovingTag(tag: string): boolean` helper. update-checker.ts and
// stack-service.ts's getUpgradeCandidates both import from here — no client-side copy.
```

---

### `server/src/jobs/image-update-check-pruner.ts` (NEW — job, batch)

**Analog:** `server/src/jobs/disk-checker.ts:12-15,111-149` (lazy-production-repo-behind-a-Job-facade pattern) + base class `server/src/jobs/job.ts:43-89` (`IntervalJob`).

**Imports/base-class pattern:**
```typescript
// Source: server/src/jobs/job.ts:43-89 (read this session)
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

**Core pattern (lazy-repo Job facade, mirrors disk-checker.ts):**
```typescript
// Source: server/src/jobs/disk-checker.ts:12-15,111-149 (read this session)
export const imageUpdateCheckPruner: Job = {
    name: "ImageUpdateCheckPruner",
    kind: "interval",
    start: async () => { /* lazily construct, then start() */ },
    stop: () => { /* ... */ },
    setHealthReporter: (reporter) => { /* ... */ },
}
```

**Reference-set rule to reproduce exactly (D-11) — never hand-copy, call the extracted shared method instead:**
```typescript
// Source: server/src/jobs/update-checker.ts:239-252 (currently private/unexported — see
// Pitfall 4 in RESEARCH.md). Recommended home: StackRepository.findDistinctServiceImageRefs()
// (Open Question #1, Option (a)) — both update-checker.ts's createProductionRepo() and the
// pruner's production repo call this one method; buildImageRefFromService mapping applied
// by each caller.
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

**Cron convention to follow:** `DiskChecker`'s daily `cronExpression` (vs. `UpdateChecker`'s staggered one); `runImmediatelyOnStart` left to discretion (A2 in RESEARCH.md recommends `true`).

**Test analog:** `server/test/unit/jobs/disk-checker.test.ts` — mock-injection pattern (construct job with mocked repo methods, assert the delete call receives the correct ref set).

---

### `server/src/repositories/image-update-check-repository.ts` (MODIFY — add `deleteManyOrphans`)

**Analog:** itself, existing `upsert`/`findByImageRef`/`findByImageRefs` methods (lines 14-66).

**Core CRUD pattern:**
```typescript
// Source: server/src/repositories/image-update-check-repository.ts (add alongside
// existing methods, same class, same style — no new abstractions)
async deleteManyOrphans(currentRefs: string[]): Promise<{count: number}> {
    return prisma.imageUpdateCheck.deleteMany({
        where: {imageRef: {notIn: currentRefs}},
    })
}
```
**Rule enforced:** Prisma access only lives here — the job and service never import Prisma directly (CLAUDE.md repository rule).

---

### `server/src/application/stack-service.ts` (MODIFY — three changes)

**Analog:** itself (937 lines; `getUpgradeCandidates`, `deployStack`, constructor are all existing code to extend).

**1. `getUpgradeCandidates` return-shape extension (D-06):**
```typescript
// Source: server/src/application/stack-service.ts:264-279 (read this session)
async getUpgradeCandidates(
    id: string,
    serviceName: string,
): Promise<{currentTag: string; latestTag: string | null; candidates: string[]}> {
    const stack = await this.getStack(id)
    if (!stack) throw new NotFoundError("Stack not found")
    const svc = stack.services.find((s) => s.serviceName === serviceName)
    if (!svc) throw new NotFoundError("Service not found")
    const imageRef = buildImageRefFromService(svc.image, svc.imageTag)
    const row = imageRef ? await this.updateChecks.findByImageRef(imageRef) : null
    const {latestTag, candidates} = this.decodeUpgradeCandidates(row)
    return {currentTag: svc.imageTag ?? "latest", latestTag, candidates}
    // NEW: add isMovingTag: MOVING_TAGS.has(svc.imageTag ?? "latest") to this return object
    // (import MOVING_TAGS from domain/image-update-detection.ts, not a local copy)
}
```

**2. Constructor — 10th param (new `DockerodeClientPort` dependency):**
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
Production wiring to update: `server/src/application/index.ts:71` — append `dockerodeClient` (already imported at line 31) as the 10th positional argument.

**3. Catch-up method — event-driven emission pattern (D-07/D-08/D-09), called from `deployStack`/`updateImages`/`upgradeServiceImage` on BOTH success and failure branches, AFTER the existing `transitionStatus` call:**

Model this on `handleEvent()`'s per-container loop, NOT `reconcile()`'s batch-and-maybe-emit-once loop (RESEARCH.md Pitfall 1 — this is the single most important rule):
```typescript
// Source: server/src/jobs/state-poller.ts:241-286 (handleEvent, read this session) —
// THIS emission shape, one per service, every time:
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
Explicitly do NOT copy `reconcile()`'s shape (`server/src/jobs/state-poller.ts:289-365`) — it only emits `stack.status_changed`, at most once for the whole stack, and never emits `container_state_changed`, which is the only event `use-stack.ts`/`use-stacks.ts` key per-service badge patches on.

**Pitfall 2 (intentional, do not "fix"):** on the failure branch, calling `repo.updateStackStatus(id, derivedStatus)` unconditionally after `transitionStatus(..., "ERROR", ...)` CAN overwrite `ERROR` with whatever `deriveStackStatus` computes from real containers — this already happens today via the 60s reconcile tick; the catch-up just makes it happen in seconds. Do not special-case this away.

**Pitfall 3 (edge case to handle explicitly):** a service with zero matching containers after the compose command returns must still get `repo.updateServiceState(..., containerState: "exited", healthStatus: null)` and still emit its own `container_state_changed` — don't silently skip services that reconcile()'s container-iteration loop would also miss.

**DockerodeClientPort usage:**
```typescript
// Source: server/src/jobs/state-poller.ts:292 (read this session) — the exact call to reuse
docker.listContainers(true)
// then filter by Labels["com.docker.compose.project"] === stackId
```

**Test analog for constructor change:** `server/test/unit/application/stack-service.test.ts:101-111` — single `beforeEach` constructs `StackService` with all current params `as any`; add a `createMockDockerode()` helper and pass it as the 10th arg (Pitfall 5 — this is the only test call site; sequence it with the signature change itself).

---

### `server/src/jobs/state-poller.ts` (MODIFY — import extraction)

**Analog:** itself. Replace the private `deriveStackStatus` function (lines 49-76) with an import from `domain/stack-state-derivation.ts`. Behavior-preserving — both call sites (`StatePoller` and the new catch-up) must derive identically; add a parity unit test in `server/test/unit/jobs/state-poller.test.ts` if useful.

---

### `server/src/jobs/update-checker.ts` (MODIFY — import extraction)

**Analog:** itself. Replace the module-local `MOVING_TAGS` set (line 15) with an import from `domain/image-update-detection.ts`. Also extract `findAllImageRefs` (lines 239-252) to the shared `StackRepository` method and call that instead of the local private copy.

---

### `server/src/jobs/index.ts` (MODIFY — register the new job)

**Analog:** itself — exact registration pattern already used for `diskChecker` and six other jobs.

```typescript
// Source: server/src/jobs/index.ts:1-22 (full file read this session)
import {imageUpdateCheckPruner} from "./image-update-check-pruner.js"
// ...
jobRegistry.register(imageUpdateCheckPruner)
// Order comment at lines 11-14 documents why registration order is preserved —
// append after the existing jobs, don't reorder them.
```

---

### `client/src/lib/stacks-api.ts` (MODIFY — add `isMovingTag`)

**Analog:** itself.
```typescript
// Source: client/src/lib/stacks-api.ts:262-266 (read this session)
export interface ServiceTagsResponse {
    currentTag: string;
    latestTag: string | null;
    candidates: string[];
    // NEW: isMovingTag: boolean;
}
```
No client-side Zod duplication needed — this is a response type, not request validation (CLAUDE.md's "no duplicate Zod schemas" rule concerns request validation; this is a plain interface matching an API client convention already used in this file).

---

### `client/src/routes/app/stacks/components/service-upgrade-dialog.tsx` (MODIFY — new moving-tag branch)

**Analog:** itself — insert a new conditional branch among the existing three, in the existing `state.status === "ready"` rendering.

**Current (wrong) branch being replaced/guarded:**
```tsx
// Source: client/src/routes/app/stacks/components/service-upgrade-dialog.tsx:162-169
{state.status === "ready" &&
    state.data.candidates.length === 0 &&
    !state.data.latestTag && (
        <p className="text-sm text-muted-foreground">
            The registry has not been checked for this image yet. Checks run on a
            staggered schedule — check back later.
        </p>
    )}
```

**Insertion point and guard (D-04, per RESEARCH.md's verified branch order):**
```tsx
// Insert BEFORE the "candidates.length === 0 && !latestTag" branch, since a checked
// moving-tag service ALSO has candidates:[] and latestTag:null by design.
{state.status === "ready" && state.data.isMovingTag && (
    /* moving-tag copy: explain current tag is moving (e.g. "latest"), always points
       at newest image, no fixed version to select. Disabled Upgrade (confirm) button.
       Active "Update Images" button (D-05) — calls the updateImages API client
       directly, per RESEARCH.md Assumption A3, mirroring stack-actions.tsx's existing
       direct-import pattern — then closes the dialog. */
)}

{/* EXISTING fallback — add !state.data.isMovingTag guard so it still fires only for
    the genuine "registry check failed" case, keeping the existing test green */}
{state.status === "ready" &&
    state.data.candidates.length === 0 &&
    !state.data.latestTag &&
    !state.data.isMovingTag && (
        <p className="text-sm text-muted-foreground">
            The registry has not been checked for this image yet. Checks run on a
            staggered schedule — check back later.
        </p>
    )}
```

**Direct-API-call pattern to copy for the "Update Images" button (D-05/A3):** `client/src/routes/app/stacks/components/stack-actions.tsx` (partial read, confirms direct-import-and-call of the `updateImages` API client function rather than threading a callback prop through `OverviewTab` → `ServicesSection` → `ServiceUpgradeDialog`).

**Arrow visibility — do not touch (D-03):**
```tsx
// Source: client/src/routes/app/stacks/components/services-section.tsx:107 — this
// condition already renders the Upgrade arrow for any updateAvailable service and
// must NOT be narrowed for moving-tag services.
{svc.updateAvailable && ( /* ... */ )}
```

**Existing regression test to keep green:**
`client/test/unit/routes/stacks/service-upgrade-dialog.test.tsx:106-118` ("renders a distinct message when the image has never been checked") asserts on the fallback string for `{latestTag: null, candidates: []}` with no `isMovingTag` — the new `!state.data.isMovingTag` guard is required for this test to keep passing.

---

## Shared Patterns

### Repository-only Prisma access
**Source:** `server/src/repositories/image-update-check-repository.ts`, `server/src/repositories/stack-repository.ts`
**Apply to:** `image-update-check-pruner.ts`, `stack-service.ts`'s catch-up method — neither may import `prisma`/`db.ts` directly; both call repository methods.

### Pure domain extraction (no I/O, type-only imports)
**Source:** `server/src/domain/stack-status-machine.ts`, `server/src/domain/image-update-detection.ts`
**Apply to:** `stack-state-derivation.ts` (new), the `MOVING_TAGS`/`isMovingTag` addition to `image-update-detection.ts`. Both `deriveStackStatus` and `MOVING_TAGS` move from a jobs/-layer private scope to domain/, imported by every consumer — never re-implemented.

### IntervalJob + lazy-production-repo Job facade
**Source:** `server/src/jobs/job.ts` (base class), `server/src/jobs/disk-checker.ts` (concrete pattern)
**Apply to:** `image-update-check-pruner.ts`.

### Domain event bus → SSE (per-entity emission)
**Source:** `server/src/jobs/state-poller.ts:241-286` (`handleEvent`), `server/src/domain/events.ts:24-37` (`StackContainerStateChangedEvent`), `server/src/application/subscribers/state-broadcast-subscriber.ts`
**Apply to:** `stack-service.ts`'s new catch-up method — must emit the identical per-service event shape `handleEvent()` uses, never `reconcile()`'s batched/status-only shape. Client already consumes this event (`client/src/hooks/use-stack.ts:54-64`, `use-stacks.ts:46-60`) — no client change needed.

### Error handling
No new error paths — `NotFoundError` usage in `getUpgradeCandidates` is unchanged; the catch-up and pruner run in background/application-layer contexts with no HTTP boundary, so CLAUDE.md's "no HTTP status logic outside app.ts/lib/errors.ts" rule isn't implicated by this phase's new code.

## No Analog Found

None — every file in scope has an exact or role-match analog already in the codebase (this phase is explicitly "stop having a second copy of something that already exists," not new architecture, per RESEARCH.md's Key Insight).

## Metadata

**Analog search scope:** `server/src/jobs/`, `server/src/domain/`, `server/src/repositories/`, `server/src/application/`, `client/src/lib/`, `client/src/routes/app/stacks/components/`, corresponding test directories.
**Files scanned:** 13 (all confirmed git-tracked via `git ls-files`)
**Pattern extraction date:** 2026-10-06
