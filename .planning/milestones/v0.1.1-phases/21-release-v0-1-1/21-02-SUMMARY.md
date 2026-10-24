---
phase: 21-release-v0-1-1
plan: 02
subsystem: release
tags: [release, ci, pull-request]
status: complete

requires:
  - phase: 21
    provides: "21-01 release commit (0.1.1 manifests, CHANGELOG.md)"
provides:
  - "origin/release/v0.1.1 fast-forwarded to the 0.1.1 release commit"
  - "PR #99 description with changes, CHANGELOG link and thirteen Closes lines"
  - "Green CI on the release head"
affects: []

commits: 0
actuals:
  tasks: 3
  commits: 0

key-decisions:
  - "PR description set via `gh api -X PATCH` because `gh pr edit` fails on the deprecated Projects (classic) GraphQL field"
  - "No tag, no merge, no publish (PD-1)"

requirements-completed: [REL-01]
---

# Phase 21 Plan 02: Push, PR #99 and green CI Summary

## Push

Fast-forward `a10c24a..b9f1274` to `origin/release/v0.1.1` (no force, no tags). CI run **39605684405** on head `b9f12743ea61cfa2a1cb23d2134ccb972934a8e6` (event pull_request).

## PR #99

Title, base (main) and draft state unchanged. Body has the Added/Changed/Fixed lists, a CHANGELOG.md link and `Closes #N` for 68, 71, 76, 85, 88, 89, 90, 91, 92, 93, 94, 95, 96 only; #105 and the open follow-ups carry no closing keyword.

## CI on b9f1274

| Check | Conclusion | Duration |
|---|---|---|
| build-and-test | SUCCESS | ~20 min |
| cross-platform-unit (windows-latest) | SUCCESS | ~8 min |
| cross-platform-unit (macos-latest) | SUCCESS | ~5.5 min |
| docker-image | SUCCESS | ~4 min |
| sonarqube | SUCCESS | ~1 min |

Playwright proof (build-and-test log): `✓   90 [chromium] › test/integration/sidebar.spec.ts:104:5 › Sidebar version block (UI-01) › the expanded sidebar shows the client/package.json version and both project links above the account menu (2.3s)`.

No `v0.1.1*` tag exists on origin.

## Release-day handoff

1. If the tag is cut on a later day than the CHANGELOG 0.1.1 date (2026-10-21), correct the date on the release branch and wait for CI.
2. Push the remaining GSD documentation commits to release/v0.1.1 and confirm CI is still green.
3. Merge PR #99 into main; confirm the Publish run is green and publishes `edge` and `sha-<short>`.
4. Tag `v0.1.1-rc.1` on main, confirm only `0.1.1-rc.1` with linux/amd64 and linux/arm64, then tag `v0.1.1` (publishes 0.1.1, 0.1, latest).
5. Bump the README quickstart curl URLs and the docks Get started page to v0.1.1.
6. Create the GitHub release v0.1.1 with the CHANGELOG 0.1.1 section as notes.
7. Update the docs site (docktor-app/docks) Backups guide that still calls the SFTP/S3 settings unused (STATE blocker).

## Deviations

None to the plan's outcome; PR body applied through the REST API (see key-decisions).

## Self-Check: PASSED
