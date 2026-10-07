---
status: diagnosed
trigger: "G-13-3 (13-UAT.md test 3): nginx:latest Upgrade dialog - \"I dont see the button and no alert.\""
created: "2026-10-07T07:58:00Z"
updated: "2026-10-07T07:58:00Z"
---

## Current Focus

hypothesis: CONFIRMED (by elimination + reproduction) - see Resolution. The Phase 13 code path is correctly wired; the dialog the user saw was not in the moving-tag branch because `isMovingTag` was falsy/absent in the payload it received.
test: n/a (goal: find_root_cause_only)
expecting: n/a
next_action: return ROOT CAUSE FOUND to caller; user re-runs test 3 with a Network-tab check of `/tags` (see Resolution.missing)

## Symptoms

expected: nginx:latest Upgrade arrow opens a dialog with moving-tag copy, a neutral Alert, a disabled Upgrade button and an Update Images button.
actual: User sees none of the Alert or the Update Images button.
errors: none reported
reproduction: Open a stack with an nginx service flagged "update available", click the Upgrade arrow in Services.
started: first time this surface was tested (new in 13-01)

## Eliminated

- hypothesis: "Client never renders the moving-tag view (wiring/branch/props defect)."
  evidence: |
    service-upgrade-dialog.tsx: selectReadyView() returns "moving-tag" first when data.isMovingTag is truthy; the Alert (variant default, Info icon),
    outline Update Images button and the disabled footer Upgrade are rendered under `readyView === "moving-tag"`. services-section.tsx is the only
    consumer and mounts the real dialog with currentTag = imageTag ?? "latest". A throwaway integrated test (real ServicesSection -> real dialog ->
    real getServiceTags/apiFetch, only global fetch mocked, payload {currentTag:"latest", latestTag:null, candidates:[], isMovingTag:true}) rendered
    "is a moving tag", role=alert, the Update Images button and a disabled Upgrade. Throwaway test deleted afterwards. Existing suites also pass
    (dialog 18 + services-section 14 = 32 tests).
  timestamp: "2026-10-07T07:57:00Z"

- hypothesis: "Server does not send isMovingTag (data not reaching the client)."
  evidence: |
    stack-service.ts getUpgradeCandidates() (lines 276-293) returns isMovingTag: isMovingTag(currentTag) with currentTag = svc.imageTag ?? "latest".
    GET /api/stacks/:id/services/:serviceName/tags (routes/stacks.ts:138) has only a params schema, so no response serializer can strip the field.
    findByIdWithRelations includes services:true (imageTag present). compose-parser maps `nginx:latest` -> imageTag "latest", `nginx` -> null (-> "latest").
    server/test/integration/stacks.test.ts asserts web=nginx:latest -> {currentTag:"latest", isMovingTag:true} and postgres:16 -> false against real
    Postgres; CI run 37589102220 (head 377ff2e, which contains the 0133f8a parse fix) passed, and `yarn workspace @docktor/server test` runs unit + integration.
  timestamp: "2026-10-07T07:57:00Z"

- hypothesis: "Layout/CSS hides the Alert or button."
  evidence: "Alert is a plain grid div (bg-card), button is a normal outline Button inside space-y-3 in DialogContent; both found by role in the DOM test. No overflow clipping or conditional class."
  timestamp: "2026-10-07T07:57:00Z"

## Evidence

- timestamp: "2026-10-07T07:57:00Z"
  checked: Throwaway seam test, variant B - same real components, server payload WITHOUT isMovingTag (what a pre-13-01 server returns)
  found: dialog shows "The registry has not been checked for this image yet..."; no role=alert; no Update Images button.
  implication: Reproduces the user's report exactly. A pre-Phase-13 server (or any response lacking isMovingTag: true) yields this with the new client; an old client yields the same screen by its own code.

- timestamp: "2026-10-07T07:57:00Z"
  checked: Throwaway seam test, variant C - payload {currentTag:"alpine", isMovingTag:false}
  found: same "not checked yet" screen; no Alert, no button.
  implication: Any floating tag outside MOVING_TAGS = {latest, edge, stable, main, master, nightly} (image-update-detection.ts:22, exact match) reproduces the symptom with fully correct new code. nginx's common floating tags (alpine, mainline, stable-alpine, latest-alpine) are not in the set.

- timestamp: "2026-10-07T07:57:00Z"
  checked: Local artifacts and environment
  found: client/dist is dated 2026-07-27 and contains no "moving tag" string; Docker daemon is not running on this machine (so UAT test 1 ran elsewhere); Phase 13 commits exist only on feature/phase-13-update-checker-reliability (main is at b2603f2, 2026-10-06). The UAT instance's build version is not recorded anywhere.
  implication: Cannot confirm which build the user's browser/server was running. Note UAT test 1 ("status unknown") was attributed to a stale browser cache although 13-02 is server-only, which weakly suggests the instance/bundle was changing during the session.

- timestamp: "2026-10-07T07:57:00Z"
  checked: Test-coverage seams
  found: services-section.test.tsx mocks the dialog; service-upgrade-dialog.test.tsx mocks @/lib/stacks-api. No committed test spans arrow click -> real dialog -> apiFetch.
  implication: Explains why unit tests pass while a deployment/payload mismatch is invisible to them (not a defect in itself).

## Resolution

root_cause: |
  No code defect found in the Phase 13 moving-tag path. The dialog shows the Alert and Update Images button only when the /tags payload carries
  `isMovingTag: true`; the user's screen shows neither, meaning that condition was not met in their session. Two causes produce exactly this screen,
  and the evidence available cannot tell them apart:
  (1) ENVIRONMENT (most likely): the UAT instance was serving a pre-Phase-13 client bundle or server (Phase 13 is only on the feature branch; no
      build/version marker exists to check; a stale bundle already bit this session on test 1). An old client shows the pre-13 "not checked yet"
      copy; an old server omits isMovingTag so the new client falls through selectReadyView to "unchecked".
  (2) DESIGN LIMIT (possible): the tested service's tag is a floating tag outside the closed 6-name MOVING_TAGS set (e.g. nginx:alpine, mainline,
      stable-alpine). The update-checker can flag such an image "update available" via digest, so the Upgrade arrow appears, but isMovingTag is false
      and the dialog still shows the misleading #33 "not checked yet" copy. This is a spec decision (D-06 closed set), not an implementation bug.
  Category: environment (stale build) and/or data (tag value) plus a latent design gap; not a code/wiring bug.
fix: n/a (diagnose-only)
verification: n/a
files_changed: []
