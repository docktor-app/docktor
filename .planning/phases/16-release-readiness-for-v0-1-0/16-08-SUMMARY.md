---
phase: 16-release-readiness-for-v0-1-0
plan: 08
subsystem: docs
tags: [vitepress, documentation, feature-guides, security-page, docks-repo]

requires:
  - phase: 16-release-readiness-for-v0-1-0
    provides: "16-06 docks scaffold, Get started, reference/deployment anchors (startup-checks, sign-in-protection, resetting-two-factor-authentication, image-tags, environment-variables, stacks-directory-path, troubleshooting), 16-02 SECURITY.md"
provides:
  - "docktor-app/docks main: guide/introduction, security, and eight feature guides (stacks, templates, backups, proxy, import, updates, health, account-security), all in the sidebar and the home page tiles"
  - "Security page (security.md) that README, SECURITY.md and the in-app banner can link to: Docker socket, /host mount, network exposure and TRUST_PROXY, accounts, secrets at rest, images, reporting"
affects: [16-07 pointer updates (docs/templates.md already links features/templates, which now resolves), 16-09 release candidate review, README claims about SFTP/S3 backups]

requirements-completed: ["#17"]

actuals:
  tokens: 16800
  tasks: 3
  commits: 0
plan_head_before: 2260430f35bbc3017ec2e23e9af00948927ee637
plan_head_after: 2260430f35bbc3017ec2e23e9af00948927ee637

tech-stack:
  added: []
  patterns:
    - "Each pushed docks commit builds with zero dead links: pages are cross-linked only once the target exists (guides added in three commits, links restored as targets landed)"
    - "Guides use the app's real labels read from the client components, and state limits explicitly instead of repeating design intent"

key-files:
  created:
    - "docktor-app/docks: guide/introduction.md, security.md"
    - "docktor-app/docks: features/stacks.md, templates.md, backups.md, proxy.md, import.md, updates.md, health.md, account-security.md"
  modified:
    - "docktor-app/docks: .vitepress/config.mts (nav Guide/Features/Security/Reference; sidebar Guide, Features with 8 pages, Reference, Security)"
    - "docktor-app/docks: index.md (8 linked feature tiles), guide/get-started.md (Security link in the warning, Next steps for all guides)"
    - "docktor-app/docks: reference/deployment.md (Backups section corrected)"

key-decisions:
  - "Backups guide documents what the code does, not the design intent: every backup goes to <stack>/backups regardless of the repository type chosen in Settings; SFTP and S3 are labelled 'not used as a backup destination in v0.1.0'"
  - "Guides omit features that have no UI or no producer in v0.1.0: aborting a backup, removing a template repository, password change, Update Available entries in the Activity timeline"
  - "Docs repo content was committed from /home/raphael/workspace/docks (user clone); no .docks/ clone was made or deleted"

coverage:
  - id: D1
    description: "docks main has guide/introduction.md, security.md and the eight features/*.md pages, each linked from the sidebar, and docs:build passes with no dead links on the pushed head"
    requirement: "#17"
    verification:
      - kind: other
        ref: "npm run docs:build in /home/raphael/workspace/docks before each push (build complete, no dead links); script check of every internal link and heading anchor across all pages printed bad 0"
        status: pass
      - kind: other
        ref: "GitHub Actions 'Build docs' on main: success for d51d96d, 849eb1c, d81b41b"
        status: pass
      - kind: other
        ref: "plan Task 1/2/3 gh api checks: pages exist, >= 30 lines, remote head equals local head, nav-ok printed"
        status: pass
    human_judgment: false
  - id: D2
    description: "security.md explains that the Docker socket is host-root-equivalent and /host:ro exposes the whole disk, covers 2FA, rate limiting and TRUST_PROXY, CSRF, TLS proxy, secrets at rest, image pinning, and links SECURITY.md and the sign-in-protection, startup-checks and image-tags anchors"
    requirement: "#17"
    verification:
      - kind: other
        ref: "grep -c -E 'docker.sock|Docker socket' on the page fetched via gh api prints 4; SECURITY.md link and the three anchors present"
        status: pass
    human_judgment: true
    rationale: "Operators make security decisions from this page; a human should read it once for tone and completeness"
  - id: D3
    description: "Guides describe only shipped behaviour"
    requirement: "#17"
    verification: []
    human_judgment: true
    rationale: "Statements were checked by reading client components and server code, not by running the app. Import (adopt in place outside the stacks directory, relative bind mounts in Migrate) and the backup schedule/retention behaviour should be confirmed on a live install in 16-09"

duration: about 15min (21:47Z to 22:02Z by the recorded clocks)
completed: 2026-10-11
status: complete
---

# Phase 16 Plan 08: Introduction, feature guides and Security page Summary

**The docks site now has an Introduction, a Security and Docker-socket page, and eight feature guides (stacks, templates, backups and restore, proxy and TLS, brownfield import, update checks, health and uptime, account security) written from the client and server code, linked from the sidebar, the home page tiles and Get started, with three green builds on docks main.**

## What was pushed to docktor-app/docks main

Authorized by the user for this session: plain `git push` to `main` of docktor-app/docks only. No tags, releases, repository settings, Pages or other repositories were touched. Nothing was pushed from this repository.

| Commit | Message | Content |
|--------|---------|---------|
| `d51d96d` | `docs(guides): add introduction, stacks guide and security page` | guide/introduction.md, features/stacks.md, security.md; config.mts nav (Guide, Features, Security, Reference) and sidebar groups; Get started: Security link in the Docker-socket warning and a Next steps section |
| `849eb1c` | `docs(guides): add templates, backups, proxy and import guides` | features/templates.md, backups.md, proxy.md, import.md; Features sidebar entries; stacks.md and security.md cross-links; reference/deployment.md Backups section corrected |
| `d81b41b` | `docs(guides): add update, health and account security guides` | features/updates.md, health.md, account-security.md; Features sidebar entries; home page now has eight linked tiles; Get started Next steps list all guides; security.md links the account guide |

Remote main head equals local HEAD (`d81b41b`). GitHub Actions "Build docs" concluded `success` for all three pushes. `docs:build` ran before each push; a script over all pages found no dead page link and no missing heading anchor.

## Accomplishments

- **Introduction** (purpose, audience, principles, what it is not, how it works) from PROJECT.md and docs/design.md.
- **Security page** with the sections the plan lists: Docker socket, host filesystem mount, network exposure (TLS proxy, `TRUST_PROXY`, optional loopback publish), accounts, secrets at rest (`ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, rotation consequences), images and updates (the restic, Docker CLI and Compose downloads are checksum-verified in the Dockerfile), reporting (links SECURITY.md). It links the deployment reference anchors `sign-in-protection`, `startup-checks`, `image-tags`, `resetting-two-factor-authentication`, `upgrading`, `environment-variables`.
- **Eight feature guides** using the exact UI labels read from the client sources (tabs, buttons, dialogs, badges, settings cards).
- **Navigation:** nav (Guide, Features, Security, Reference), sidebar groups (Guide, Features with all eight pages in plan order, Reference, Security), eight linked home tiles, Get started Next steps.

## Statements omitted or labelled because the code does not support them

These are the plan's "could not be confirmed" items, plus corrections to design intent found while reading the code:

1. **SFTP and S3 backup targets (important).** `BackupService.buildEnv` sets `RESTIC_REPOSITORY` to `<stack hostPath>/backups` whenever the stack has a path, which is always (`Stack.hostPath` is required); the SFTP and S3 branches are an unreachable fallback. Settings still offers those types and stores their credentials. The backups guide says so plainly (warning box) and tells readers to copy `backups/` off the host themselves. Not fixed here (out of scope: no code change in this plan). **The README line "scheduled and manual backups to a local, SFTP or S3 repository" and docs/design.md "Targets: local directory, SFTP, S3-compatible storage" in this repo disagree with the shipped behaviour** and need either a product fix or a wording fix before the release (decision for the user/16-09). I corrected the docks home tile and the reference/deployment.md Backups section, which said a local repository path had to be bind-mounted (false: local backups need no path).
2. **Backup retention and default schedule.** Pruning uses the stack's own retention, else built-in 7/4/12; the "Keep daily/weekly/monthly" values in Settings, Backup, Default Backup Settings are not read at prune time. The default schedule is registered for stacks without their own only at server start (saving "Use global schedule" for a stack removes its cron task until the next restart). Documented as is, with a restart hint.
3. **Aborting a running backup:** a server function exists but no client calls it, so the guide does not mention it.
4. **"Filling variables" for templates:** there is no variable form; a variant's `.env.example` pre-fills the Environment Variables editor. Documented that way. Removing a template repository has no UI and is not mentioned.
5. **Password changes:** there is no password-change screen and no email reset (reset endpoints are disabled). The account guide says so; the plan's "password changes" item is therefore a statement of absence.
6. **Update Available in the Activity timeline:** `update_available` has no producer that writes the audit row (only a live SSE event), so the guide does not list it. A failed update check is only logged (`[UpdateChecker]`), never shown in the UI; the guide says that.
7. **Brownfield import** (read from code, not run): scan paths are container paths, so the host is reached through `/host/...`; adopt in place records that container path (risk outside the stacks directory); Migrate offers only named volumes and absolute bind mounts, so relative bind mounts are not copied. All three are written as cautions with the mechanism. Confirm on a live install.
8. Stack names, secrets, hostnames: only `example.com` placeholders and no contact address appear in the guides.

## Task Commits

All commits are in docktor-app/docks (this repository has none for the tasks):

1. **Task 1 (tracer): introduction, stacks guide, security page** - docks `d51d96d`
2. **Task 2: templates, backups, proxy, import** - docks `849eb1c`
3. **Task 3: updates, health, account security, home tiles, final link pass** - docks `d81b41b`

**Plan metadata:** this SUMMARY plus STATE.md and ROADMAP.md (docs: complete plan). `git rev-list --count` from `plan_head_before` to HEAD before this SUMMARY is 0, which is correct: `files_modified: []` for this repository.

## Files Created/Modified

Listed in the frontmatter; all paths are in docktor-app/docks. Totals: 14 files changed, 782 insertions, 8 deletions. No file in this repository changed except this SUMMARY and the planning state files.

## Decisions Made

See `key-decisions`. Tracer gate: the Task 1 `<verify>` (build passed, three pages present, socket text count 4, remote head equal to the pushed commit) was re-run end to end on the pushed head before Tasks 2 and 3 began, so expansion continued.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cross-links added only once their target page existed**
- **Found during:** Task 1
- **Issue:** The planned security.md link to `/features/account-security`, and links from stacks.md to the other guides, would be dead links in the first commit; VitePress fails the build on dead links, so the pushed commit would have gone red.
- **Fix:** Wrote the links as plain text first and restored them in the commit that added the target. All three pushed heads build and CI is green.
- **Files:** features/stacks.md, security.md, guide/get-started.md (docks)
- **Commits:** `d51d96d`, `849eb1c`, `d81b41b`

**2. [Rule 1 - Bug] Stale statements in docks pages corrected**
- **Found during:** Task 2 (backups source reading)
- **Issue:** reference/deployment.md (16-06) told readers to bind-mount a local restic repository path; the docks home tile promised "local path, SFTP or S3" backups. Both contradict `BackupService`.
- **Fix:** Rewrote the Backups section of the reference and the tile (tile now says "Back up each stack with restic ...").
- **Files:** reference/deployment.md, index.md (docks)
- **Commits:** `849eb1c`, `d81b41b`

**3. [Plan adaptation] Docs working copy and `.docks/` steps**
- The plan clones into `.docks/` and deletes it at the end. As in 16-06, the user's existing clone `/home/raphael/workspace/docks` was used (pulled first, already up to date); nothing was cloned or deleted, and the plan's `.docks`-relative verify commands were run against that path.

**4. [Judgment] Home page tiles grew from four to eight**
- The plan says to link each feature tile to its guide. The four existing tiles did not map one to one onto eight guides, so there is now one tile per guide.

**Total deviations:** 1 blocking fix, 1 bug fix, 2 adaptations. **Impact:** none on the plan's outcomes; the SFTP/S3 finding is a product-versus-claims gap for the user to decide.

## Issues Encountered

- A shell guard hook once blocked a grep whose pattern contained the string `.env` (it reads protected secret files by name). I re-ran the search with the Grep tool; no secret file was read.
- Nothing was run against a live Docktor instance in this plan; every claim comes from reading the client components and server code. Items 1, 2 and 7 above are the ones most worth confirming on the 16-09 release candidate.

## Authentication Gates

None. `gh api repos/docktor-app/docks --jq .permissions.push` printed `true`, so the precondition held.

## Known Stubs

None in the guides. Screenshots are deliberately not referenced (16-07's assets do not exist yet, so no image file is linked).

## Threat Flags

None beyond the plan's threat model. T-16-28 mitigated (security.md explains host-root reach, TLS proxy and restricting access; Get started links it). T-16-29 mitigated (`TRUST_PROXY` explained in security.md and account-security.md). T-16-30 mitigated by source checking, with the omissions above.

## User Setup Required

None for this plan. Follow-ups for you, in order of importance:

1. Decide what to do about SFTP/S3 backups: ship them working, or reword README.md and docs/design.md (and the Settings card, which still offers them) to match "stored in the stack folder".
2. Confirm on a live install the import cautions (adopt outside the stacks directory, relative bind mounts in Migrate) and the backup schedule/retention notes, then adjust the guides if reality differs.
3. When the docs host exists, set `DOCS_SITE_URL` in `.vitepress/config.mts` (unchanged from 16-06).

## Next Phase Readiness

Ready for 16-09. The docs site is complete for v0.1.0 scope; `docs/templates.md` in this repository already links `features/templates`, which now exists (it was a 404 until this plan).

## Self-Check: PASSED

Files exist in the docks clone: guide/introduction.md, security.md, features/{stacks,templates,backups,proxy,import,updates,health,account-security}.md, .vitepress/config.mts, index.md, guide/get-started.md. Docks commits `d51d96d`, `849eb1c` and `d81b41b` are ancestors of docks HEAD and the remote main head equals `d81b41b`. `git rev-list --count` in this repository from `plan_head_before` measured 0 before this SUMMARY, matching `files_modified: []`.
