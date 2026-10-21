---
phase: 21-release-v0-1-1
plan: 01
subsystem: release
tags: [release, changelog, versioning, docs]
status: complete

requires:
  - phase: 19
    provides: Sidebar version block reading client/package.json through the Vite/Vitest define
provides:
  - "Root, shared, server and client manifests at 0.1.1"
  - "Guard test: client (sidebar) version equals root, shared and server versions"
  - "CHANGELOG.md (Keep a Changelog) with the 0.1.1 entry, one issue link per entry"
  - "Releasing procedure step for version bump and changelog"
  - "docs/design.md and bug report form describing v0.1.1"
affects: [21-02]

commits: 6
plan_head_before: 51315d13a1645f202505dbc5380a000660485a2d

actuals:
  tasks: 3
  commits: 6

key-files:
  created: [CHANGELOG.md]
  modified: [package.json, shared/package.json, server/package.json, client/package.json, client/test/unit/lib/app-version.test.ts, CONTRIBUTING.md, docs/design.md, .github/ISSUE_TEMPLATE/bug_report.yml]

key-decisions:
  - "PD-1..PD-5 of the plan carried unchanged: no tag/publish, README quickstart stays on v0.1.0, example 0.1.0 references untouched, changelog dated 2026-10-21"
  - "Executed inline on the release-branch checkout (no subagent/worktree) at the user's request after the executor hit a rate limit"

requirements-completed: [REL-01]
---

# Phase 21 Plan 01: Version bump, changelog and docs Summary

All four manifests are at 0.1.1, a unit test keeps them from drifting, CHANGELOG.md records v0.1.1 (21 entries, each tied to its issue), and the design document and bug report form describe v0.1.1.

## Task results

1. **Version guard + bump.** The new test failed first. RED (client 0.1.1 while root, shared and server stayed 0.1.0): 1 failed, 2 passed in `app-version.test.ts`; not committed. After bumping all four, the app-version, sidebar-version-block and app-sidebar tests passed (23 tests). yarn.lock and the Phase 19 define are unchanged.
2. **CHANGELOG.md + Releasing step.** Covers #13, #68, #71, #72, #76, #85, #88-#96, #106; the #105 entry says "partly addresses" and the open follow-ups (#100-#104, #107-#110) are not listed. CONTRIBUTING.md Releasing gained step 1 (bump four manifests, write the changelog section, merge after green CI); later steps renumbered.
3. **Docs.** docs/design.md: Status v0.1.1, remote backup targets, `backup.sftpPort`, own-port exclusion, scan/import behaviour, migration modes and defaults (backup default off), Templates entry. Bug report placeholder is `0.1.1, edge or sha-1a2b3c4`.

## Verification

- Vitest (3 files, 23 tests) passed; versions-ok; wiring-unchanged; docs checks pass; quickstart pin still valid (`git diff v0.1.0 HEAD -- docker-compose.yml .env.example README.md` empty).
- Not run locally by design (shared host): typecheck, Playwright `sidebar.spec.ts`, full builds. CI on PR #99 proves those in plan 21-02.

## Deviations

- Executor subagent hit a session rate limit before any commit; the plan was executed inline by the orchestrator. Commit messages were rewritten once, before any push, to separate the Co-Authored-By trailer.
- The `yaml` module check of bug_report.yml was not run as a script; the two edited values were changed with exact-match replacements.

## Self-Check: PASSED
