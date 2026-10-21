---
phase: 21-release-v0-1-1
verified: 2026-10-21T15:00:00Z
status: passed
score: 12/12 must-haves verified
covered_files:
  - ".github/ISSUE_TEMPLATE/bug_report.yml"
  - ".planning/phases/21-release-v0-1-1/21-01-PLAN.md"
  - ".planning/phases/21-release-v0-1-1/21-01-SUMMARY.md"
  - ".planning/phases/21-release-v0-1-1/21-02-PLAN.md"
  - ".planning/phases/21-release-v0-1-1/21-02-SUMMARY.md"
  - "CHANGELOG.md"
  - "CONTRIBUTING.md"
  - "client/package.json"
  - "client/test/unit/lib/app-version.test.ts"
  - "docs/design.md"
  - "package.json"
  - "server/package.json"
  - "shared/package.json"
covered_digest: "v3:sha256:9fc187321724dd0751b89893412f9bb5c275110fb84c0125331ccf65307de44a"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 21: Release v0.1.1 Verification Report

**Phase Goal:** v0.1.1 is ready to tag: package versions say 0.1.1, the changelog records what changed, and CI is green on the release branch.
**Verified:** 2026-10-21
**Status:** passed
**Re-verification:** No, initial verification

Checks used the working tree (HEAD d908749), `git fetch` + `git ls-remote` for origin, and read-only `gh` calls against docktor-app/docktor. No builds or tests were run locally (CI evidence from GitHub was read instead).

## Goal Achievement

### Observable Truths (ROADMAP success criteria + PLAN must-haves)

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | SC1: root, shared, server, client versions are 0.1.1 | VERIFIED | `"version": "0.1.1"` on line 3 of all four package.json; diff vs plan base 51315d13 is exactly one line per manifest (0.1.0 to 0.1.1); yarn.lock untouched. |
| 2  | SC1 (sidebar half): sidebar version block shows 0.1.1; a guard fails on drift | VERIFIED | `client/src/lib/app-version.ts` reads `__APP_VERSION__`, defined from client/package.json in `client/vite.config.ts:14` and `vitest.config.ts:12`; `app-sidebar.tsx:72` passes `APP_VERSION` to `SidebarVersionBlock`. `client/test/unit/lib/app-version.test.ts` compares root/shared/server manifests with `APP_VERSION`. CI Playwright log (run 39605684405): `sidebar.spec.ts:104 ... the expanded sidebar shows the client/package.json version and both project links above the account menu (2.3s)` passed. |
| 3  | SC2: CHANGELOG.md has a 0.1.1 entry, each tied to its GitHub issue | VERIFIED | Keep a Changelog layout with `[Unreleased]`, `[0.1.1] - 2026-10-21`, `[0.1.0] - 2026-10-13` and compare/release refs. Every one of the 21 entries is a single line with an issue link; link text number equals URL number (script check: 0 mismatches, 0 entries without a link). Issues referenced: 13, 68, 71, 72, 76, 85, 88-96, 105 (marked "partly addresses ... stays open"), 106; all exist on GitHub. Open follow-ups #100-#104, #107-#110 are not presented as shipped. |
| 4  | Changelog covers the planned issue set (#13, #68, #71, #72, #76, #85, #88-#96, #106) | VERIFIED | `grep -o 'issues/N'` yields all sixteen plus #105. |
| 5  | CONTRIBUTING Releasing procedure starts with the version bump and changelog step | VERIFIED | `CONTRIBUTING.md` line 158, step 1: bump the four `version` fields, add the section to `CHANGELOG.md` with date and one issue link per entry, merge after green CI; later steps renumbered 2-6. |
| 6  | docs/design.md describes v0.1.1 as shipped | VERIFIED | Line 21 "design of Docktor **v0.1.1**"; no `0.1.0` string remains; per-stack SFTP/S3 backup repositories (line 31, ~834); `backup.sftpPort` row (line 738); own-port exclusion (lines 808-809); migration modes, defaults (backup default off) and background operation (lines 160-193); Templates section. |
| 7  | Bug report version placeholder reads 0.1.1 and points to the sidebar | VERIFIED | `.github/ISSUE_TEMPLATE/bug_report.yml:14-16`: description "Shown at the bottom of the sidebar above your account menu...", placeholder `"0.1.1, edge or sha-1a2b3c4"`. |
| 8  | README quickstart stays on v0.1.0 (PD) because compose/env files are unchanged | VERIFIED | `git diff v0.1.0 HEAD --stat -- docker-compose.yml .env.example README.md` is empty. |
| 9  | origin/release/v0.1.1 holds the release commit by fast-forward, no tag | VERIFIED | `origin/release/v0.1.1` = b9f12743ea61cfa2a1cb23d2134ccb972934a8e6 (the release commit itself, 0 commits ahead); contains all 9 planned files' changes. Local HEAD d908749 is 1 docs-only commit ahead (SUMMARY for 21-02), unpushed, as documented in the plan. |
| 10 | PR #99 body summarises 0.1.1, links CHANGELOG, has exactly the 13 `Closes` lines and no other closing keyword | VERIFIED | PR #99 OPEN, not draft, base main, head release/v0.1.1 @ b9f1274. Regex scan for close/fix/resolve + `#N` returns exactly `Closes #68, 71, 76, 85, 88, 89, 90, 91, 92, 93, 94, 95, 96`. #13/#72/#106 (already CLOSED), #105 and follow-ups #100-#104, #107-#110 (OPEN) carry no keyword. CHANGELOG link present. |
| 11 | SC3: every CI job green on the release head (build-and-test incl. Playwright, windows, macos, docker-image, sonarqube) | VERIFIED | Check-runs on b9f1274: build-and-test success, cross-platform-unit (windows-latest) success, cross-platform-unit (macos-latest) success, docker-image success, sonarqube success. CI run 39605684405: event pull_request, headSha b9f1274, conclusion success, all five jobs success. |
| 12 | No v0.1.1 tag on origin, nothing published | VERIFIED | `git ls-remote --tags origin` lists only v0.1.0, v0.1.0-rc.1, v0.1.0-rc.2; no `v0.1.1*`. publish.yml only triggers on main and `v*` tags. |

**Score:** 12/12 truths verified (0 behavior-unverified, 0 overrides)

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `package.json`, `shared/package.json`, `server/package.json`, `client/package.json` | VERIFIED | version 0.1.1 |
| `client/test/unit/lib/app-version.test.ts` | VERIFIED | Substantive (compares four versions), wired through vitest define |
| `CHANGELOG.md` | VERIFIED | Contains `## [0.1.1] - 2026-10-21`, issue links |
| `CONTRIBUTING.md` | VERIFIED | Contains CHANGELOG.md step |
| `docs/design.md` | VERIFIED | Contains `backup.sftpPort` |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | VERIFIED | placeholder 0.1.1 |

### Key Link Verification

| From | To | Status | Details |
|------|----|--------|---------|
| client/vite.config.ts | client/package.json | WIRED | `__APP_VERSION__: JSON.stringify(version)` line 14 |
| app-version.test.ts | root/shared/server manifests | WIRED | `manifestVersion("shared/package.json")` etc. |
| CHANGELOG 0.1.1 section | GitHub issues | WIRED | one link per entry, all numbers match |
| PR #99 head | ci.yml pull_request trigger | WIRED | run 39605684405 event pull_request on b9f1274 |

### Behavioral Spot-Checks

Not run locally (shared host, per project memory and phase constraints). Behavioral proof comes from CI on the release head: the guard unit test runs inside the green build-and-test job, and the Playwright sidebar version test passed.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| REL-01 | 21-01, 21-02 | Versions bumped to 0.1.1, changelog updated, CI green on release/v0.1.1 | SATISFIED | Truths 1-3, 11 |

No orphaned requirements for Phase 21.

### Anti-Patterns Found

None blocking. No TBD/FIXME/XXX markers introduced by the phase's changed files (docs/manifests/one test).

### Notes (informational, not gaps)

- ROADMAP.md line 49 still shows `[ ] Phase 21`, the Progress table says "2/2 In Progress", and REQUIREMENTS.md still has REL-01 as Pending. These are bookkeeping updates for the orchestrator's phase-complete step.
- Local HEAD (d908749) is one docs-only commit ahead of origin/release/v0.1.1 (b9f1274); those planning commits and this report need pushing, after which CI should be re-confirmed (release-day handoff step 2). The code CI proved is unchanged.
- The CHANGELOG date (2026-10-21) must be corrected before tagging if the tag is cut on a later day (handoff step 1).
- Tagging, merging, README quickstart bump and docs-site update are deliberately left to the maintainer (PD-1).

### Human Verification Required

None. Merge and tag are maintainer release-day actions outside this phase's scope.

---

_Verified: 2026-10-21_
_Verifier: Claude (gsd-verifier)_
