# Phase 13: Update Checker Reliability - Context

**Gathered:** 2026-10-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Make update detection and container-status reporting accurate everywhere they're shown — no misleading badges, no stale database rows, no unnecessary "unknown" status windows — **without changing how update detection itself works** (the digest/semver/date comparison machinery in `update-checker.ts` is untouched, per issue #29/#32's explicit "out of scope: changing how update checks work"). Five narrow GitHub issues (#29, #31–34) scope the work, most of which is bug-fix rather than new capability.

Important scope finding from the codebase: **the client-side halves of #31 and #32 already shipped in Phase 11 (D-09/D-10).** The stack-level badge is wired into the stack list, the stack detail header, and the dashboard (which renders `StackList`), and `withServiceUpdateInfo` already enriches every list/detail payload with `updateAvailable`/`latestTag` in one batched query. The per-service badge already distinguishes `Update available → X` (concrete tag) from `Content updated` (moving-tag digest change). The genuinely unfinished work is **#33** (the upgrade dialog's wrong moving-tag message — the per-service Upgrade arrow for a moving tag currently opens a dialog that falsely claims "not checked yet"), **#34** (post-deploy status stuck "unknown" up to 60s because the StatePoller drops events while the stack is transitional and only the 60s reconcile catches up), and **#29** (stale `ImageUpdateCheck` rows never pruned).

</domain>

<decisions>
## Implementation Decisions

### Issue scope — #31/#32 verified-and-close
- **D-01:** Issue #31 (stack-level "update available" badge) is treated as **satisfied by Phase 11 D-09** and closed after a short verification pass in this phase. The badge is already rendered by `StackUpdateBadge` at `stack-list.tsx:35` and `stack-detail-header.tsx:75`; the dashboard gets the same treatment through `StackList` (dashboard.tsx renders `StackList` for "Recent Stacks"), and it already matches the "config changed" badge convention (ToneBadge in the status pill row). No new UI work. The phase must only verify the three surfaces show it and roll the closures.
- **D-02:** Issue #32 (badge distinguishing a concrete newer tag from a moving-tag digest change) is treated as **satisfied by Phase 11 D-10** copy (`Update available → X` vs. `Content updated`, in `service-update-badge.tsx`'s `describeServiceUpdate`) and closed after verification. **No badge copy or tone changes in this phase** — whatever the moving-tag experience becomes, the badge stays as-is.

### Moving-tag upgrade UX (#33, the joint design with #32)
- **D-03:** The per-service **Upgrade arrow stays visible** for moving-tag services. The misleading path is fixed in the dialog, not by hiding the affordance. This is what meets #33's acceptance criterion that the *dialog* has a distinct moving-tag state — a dialog state with no entry point would be dead UI. `services-section.tsx:107` renders the arrow for any `updateAvailable` service; that logic is unchanged.
- **D-04:** The upgrade dialog gains a **distinct moving-tag state**, separate from "not checked yet": the copy explains that the current tag is a moving tag (e.g. `latest`), that it always points at the newest image, and that there is no fixed version to select. The Upgrade (confirm) button is **disabled** in this state. This directly replaces the currently-wrong branch in `service-upgrade-dialog.tsx:162-169` ("The registry has not been checked for this image yet") which fires today for checked moving tags because `latestTag`/`candidates` are null by design.
- **D-05:** The moving-tag dialog state includes an active **"Update Images" button** that triggers the stack-level `updateImages` action — the same operation the header's Update Images button (`StackActions`) runs — and closes the dialog. The dialog thus owns a stack-scoped action it doesn't today; the planner decides whether that's a passed-in `onUpdateImages` callback (page composition) or a direct call to the updates API client. — **Reversibility:** reversible — additive wiring; the header action remains the canonical one.
- **D-06:** The server exposes **`isMovingTag: boolean`** on `GET /api/stacks/:id/services/:serviceName/tags` (`getUpgradeCandidates` in `stack-service.ts`), computed from the service's `currentTag`. To keep one source of truth, the `MOVING_TAGS` set (currently module-local in `update-checker.ts:15`) is **moved into a shared server module** (proposal: `server/src/domain/`) and imported by both `UpdateChecker` and the tags endpoint. Nothing moving-tag related is duplicated client-side — exactly what issue #33's note prescribes.

### Fast post-deploy status (#34)
- **D-07:** The post-completion status catch-up runs for the **deploy-family only**: `deployStack`, `updateImages`, `upgradeServiceImage` — the three operations that recreate/rewrite `Service` rows (clearing `containerState`) and exit the transitional state. `restartStack` and `stopStack` are explicitly **out of scope** (stop terminates on a clear state; restart keeps container IDs the event stream can follow after the stack leaves the transitional state). This matches issue #34's own suggested fix.
- **D-08:** The catch-up runs on **both branches** — after success (status → RUNNING) and after failure (status → ERROR). A failed deploy/update/upgrade shows the real container states (exited/crashed, whatever actually sits there) immediately rather than leaving "unknown" for up to 60s — the failure case is exactly when reality matters most. `docker listContainers(all)` still returns whatever is genuinely running, so polling reality on the failure branch is safe.
- **D-09:** The catch-up **reuses StatePoller's status derivation and live-event path**: `deriveStackStatus` (currently a private function in `state-poller.ts:49`) is extracted into a shared server module so the poller and the deploy catch-up apply the *same* derivation rule, and the catch-up emits the same `stack.container_state_changed` / `stack.status_changed` domain events the poller emits. The client already updates live from those SSE events (Phase 8 live-state), so **no client changes** are needed to satisfy "reflects reality within a few seconds". Do not duplicate the derivation logic in the application layer.

### Stale-row pruning (#29)
- **D-10:** Stale `ImageUpdateCheck` rows are pruned by a **dedicated daily sweep job**, not at mutation points. A new `IntervalJob` (proposal: `ImageUpdateCheckPruner`, following the `DiskChecker` cron pattern, e.g. daily) does one `deleteMany` of rows whose `imageRef` is not in the current distinct service image+tag set. This single code path catches **both new orphans and the pre-existing backlog** (issue #29's context is a table that has grown unboundedly since Phase 02). No prune-at-upgrade, no prune-at-delete, no hooks scattered through mutation paths.
- **D-11:** The prune's reference set must be built with the **identical rule UpdateChecker uses to persist refs** (distinct `Service.image` + `imageTag` via `buildImageRefFromService`, as in `UpdateCheckerRepo.findAllImageRefs`) so the job deletes only genuinely-orphaned refs. Safe by construction against racing the checker's upserts: a ref being checked is by definition in the current service set, so it is never pruned mid-check.

### Claude's Discretion
- Exact wording of the moving-tag copy (D-04) and its meter/tone; the dialog's disabled-Upgrade UX details.
- Exact daily cron expression / job name for the pruner (D-10) and whether it runs immediately on startup (contrast `UpdateChecker.runImmediatelyOnStart = false`).
- How the in-dialog "Update Images" button gets the stack action (D-05): callback prop vs. direct API call — plan-level detail.
- Considered and **left as-is**: a *non-moving* tag whose check ran but whose registry tag-list failed (`registryCheckError`) can also show `latestTag` null + `candidates` [] — the dialog's existing "not checked yet" copy covers that case as a generic "can't determine versions" message. Adding a fourth explicit state or exposing `checkError` would be out of scope creep; only the moving-tag state is added this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §Phase 13: Update Checker Reliability — goal, success criteria, dependency note (independent of other 10+ phases)
- GitHub issue [#29](https://github.com/docktor-app/docktor/issues/29) — Prune stale `ImageUpdateCheck` rows (full acceptance criteria + notes fetched during discussion)
- GitHub issue [#31](https://github.com/docktor-app/docktor/issues/31) — Stack-level "update available" badge (verify & close per D-01)
- GitHub issue [#32](https://github.com/docktor-app/docktor/issues/32) — Badge misleading when no `latestTag` (verify & close per D-02; "joint design" note satisfied by the #33 decisions)
- GitHub issue [#33](https://github.com/docktor-app/docktor/issues/33) — Upgrade dialog wrong message for moving-tag services (acceptance criteria + notes fetched during discussion)
- GitHub issue [#34](https://github.com/docktor-app/docktor/issues/34) — Service status "unknown" up to 60s after deploy (acceptance criteria + notes fetched during discussion)

### Prior decisions that bind this phase
- `.planning/phases/11-ui-rework/11-CONTEXT.md` §D-09 / §D-10 — the badge work this phase verifies-and-closes for #31/#32; also its `<deferred>` section records that #33 (upgrade-dialog moving-tag message) was deliberately not folded into Phase 11
- `.planning/PROJECT.md` §Key Decisions — "Digest-based update detection (not pull-output text scraping)" — the machinery D-03/D-10 must not disturb

### Existing code (integration points)
- `server/src/jobs/update-checker.ts` — `MOVING_TAGS` set (move to shared), the stagger/checkImage mechanics to leave untouched, `selectUpgradeCandidates`/`splitImageRef` (read-only references)
- `server/src/application/stack-service.ts` — `getUpgradeCandidates` (add `isMovingTag`), `deployStack`/`updateImages`/`upgradeServiceImage` (add catch-up), `withServiceUpdateInfo` (already feeds badge data)
- `server/src/jobs/state-poller.ts` — `deriveStackStatus` (extract to shared), `TRANSITIONAL_STATES` skip (line 203 event / line 310 reconcile) — the constraint #34 must work around without changing its purpose
- `server/src/repositories/image-update-check-repository.ts` — add the prune `deleteMany` (Prisma only here, per architecture rules)
- `client/src/routes/app/stacks/components/service-upgrade-dialog.tsx` — the dialog that gains the distinct moving-tag state + Update Images button
- `client/src/routes/app/stacks/components/services-section.tsx` — where the per-service Upgrade arrow renders (D-03 keeps it)
- `client/src/components/domain/stack/service-update-badge.tsx` / `stack-update-badge.tsx` — the Phase 11 badge components this phase verifies-and-closes (do not modify)
- `client/src/components/domain/stack/stack-list.tsx`, `client/src/routes/app/stacks/components/stack-detail-header.tsx`, `client/src/routes/app/dashboard.tsx` — the surfaces already showing the stack-level badge

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `service-update-badge.tsx` (`describeServiceUpdate`) + `stack-update-badge.tsx` (`hasStackUpdate`) — already wired; reuse for the verification pass, don't touch.
- `service-upgrade-dialog.tsx` — the dialog to extend; its `FetchState` union and existing `getServiceTags` fetch are the seam for the new moving-tag branch.
- `update-checker.ts` `MOVING_TAGS` — extract to `server/src/domain/` (alongside `image-update-detection.ts`) for D-06.
- `state-poller.ts` `deriveStackStatus` — extract to shared so the poller and the deploy-family catch-up share one rule (D-09).
- `image-update-check-repository.ts` — add a `deleteManyOrphans(existingRefs)`-style method kept behind the repository seam (D-10).
- `jobs/disk-checker.ts` + `jobs/job.ts` (`IntervalJob`, `cronExpression`) — the pattern for the new pruner job; `jobs/index.ts` (or job-registry) is where it registers.
- `dockerode-client.ts` `listContainers` — already used by StatePoller's reconcile; the deploy catch-up can share the `DockerodeClientPort` interface.

### Established Patterns
- **Repository pattern** — Prisma only in repositories; the pruner's `deleteMany` lives in `ImageUpdateCheckRepository`, never in the job or service.
- **IntervalJob/WatcherJob with cronExpression** + lazy production repo — precedent for the pruner job; check the `runImmediatelyOnStart` convention.
- **Domain event bus → SSE** (`stack.container_state_changed`, `stack.status_changed`, `stack.update_available`) — the catch-up's broadcast path (D-09). The client's `use-container-events`/`use-stack`/`use-stacks` already subscribe (Phase 8).
- **App-layer recovery guarantee** — `deployStack`'s comment: StatePoller unconditionally skips transitional statuses, so the app layer owns getting out of them; the catch-up continues that responsibility.
- **Single source of truth for tag semantics** — D-06 moves `MOVING_TAGS` server-side; the client never hard-codes moving-tag names.

### Integration Points
- `GET /api/stacks/:id/services/:serviceName/tags` → `getUpgradeCandidates` — response gains `isMovingTag` (D-06); shared `MOVING_TAGS` import.
- `service-upgrade-dialog.tsx` — new branch on `isMovingTag` → distinct copy + disabled Upgrade + Update Images button (D-04/D-05); the button needs the stack-level updateImages action.
- `stack-service.ts` `deployStack` / `updateImages` / `upgradeServiceImage` — invoke the catch-up after the status transition, on both success and failure branches (D-07/D-08), via shared derive + event emission (D-09).
- `state-poller.ts` — `deriveStackStatus` extraction (behavior-preserving: both call sites must derive identically).
- `jobs/index.ts` — register `ImageUpdateCheckPruner` (D-10).

</code_context>

<specifics>
## Specific Ideas

- The user explicitly confirmed the Phase-11 badge work is "verify & close as-is" — no badge copy/tone changes; the moving-tag conversation must not reintroduce badge refinements.
- The moving-tag dialog should make "Update Images" the *actionable* route out of the dialog (an active button, not just guidance text) — the user chose the richer in-dialog CTA over text-only.
- The stack-level "Update Images" action is the pre-existing, canonical way to pull moving-tag content; the dialog's button is a shortcut to it, not a new capability.

</specifics>

<deferred>
## Deferred Ideas

- **A fourth upgrade-dialog state for non-moving tags whose registry tag-list failed** — exposed `checkError`/registry-failure messaging in the dialog. Considered and deliberately left out (see Claude's Discretion): the existing generic copy covers it acceptably, and exposing error text is out of scope for a reliability-cleanup phase.

- **Prune-at-mutation / hybrid pruning** (event-driven at `upgradeServiceImage`/`updateStack`/`deleteStack` in addition to the daily sweep) — rejected in favor of the single daily sweep (D-10); revisit only if the table ever becomes a hot path.
</deferred>

---
*Phase: 13-update-checker-reliability*
*Context gathered: 2026-10-05*
