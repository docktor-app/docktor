---
phase: 16-release-readiness-for-v0-1-0
plan: 07
subsystem: docs
tags: [readme, docs-links, env-template, recording-script, two-factor-hint]
status: partial

requires:
  - phase: 16-release-readiness-for-v0-1-0
    provides: 16-02 release inputs (docs link style, quickstart ref), 16-03 docsUrl() helper, 16-05 CONTRIBUTING.md, 16-06 docs-site pages
provides:
  - "In-repo and login-page pointers to the old deployment guide now land on the docs site (D-16), except three comments in server/src/lib/environment-check.ts"
  - "POSTGRES_PASSWORD=CHANGE_ME_DB_PASSWORD in .env.example so the pull-based quickstart works"
  - "Recovery-mode hint on the 2FA login step is a docsUrl() link (new tab, rel noopener noreferrer), unit-tested"
  - "Corrected 16-RECORDING-SCRIPT.md (environment, recording-only compose override, sample data, masking, fixed file names, export)"
  - "Short README (72 lines) with hero GIF slot, three screenshot slots, pull-based quickstart and doc links"
affects: [16-09, 16-10]

requirements-completed: []

actuals:
  tokens: 6300
  tasks: 2
  commits: 2
plan_head_before: a30aa1f3bbcb2a79e13ced90fa1f596aeb6bbcb2
plan_head_after: c37136fd4666f0b150b90db3a45772ea85395278

tech-stack:
  added: []
  patterns:
    - "Non-client files build docs links by hand with the rule from 16-02 (github style: https://github.com/docktor-app/docks/blob/main/{path}.md#{anchor})"

key-files:
  created: []
  modified:
    - .env.example
    - Dockerfile
    - docker-compose.yml
    - docker-compose.dev.yml
    - server/src/scripts/reset-two-factor.ts
    - client/src/routes/auth/components/two-factor-step.tsx
    - client/test/unit/routes/auth/components/two-factor-step.test.tsx
    - .planning/phases/16-release-readiness-for-v0-1-0/16-RECORDING-SCRIPT.md
    - README.md

key-decisions:
  - "Task 2 (Recordly capture) deferred by the user: no image file was generated or placeholder-copied; the README links the final asset paths"
  - "README uses plain img tags for the screenshots because no -dark variants exist yet; switch to picture elements when they are added"
  - "Task 1 is one commit (RED confirmed failing first, then GREEN) because CLAUDE.md forbids committing failing tests"

coverage:
  - id: D1
    description: "Recovery-mode hint on the 2FA step links docsUrl(reference/deployment, resetting-two-factor-authentication) with target _blank and rel noopener noreferrer, absent in authenticator mode"
    requirement: "#17"
    verification:
      - kind: unit
        ref: "client/test/unit/routes/auth/components/two-factor-step.test.tsx#links the lost-everything hint to the docs section, in recovery mode only"
        status: pass
    human_judgment: false
  - id: D2
    description: ".env.example, compose files, Dockerfile and reset-two-factor.ts point at the docs site; .env.example contains POSTGRES_PASSWORD=CHANGE_ME_DB_PASSWORD; compose diff is comments only"
    requirement: "#17"
    verification:
      - kind: other
        ref: "git grep gate for docs/deployment.md and docs/templates.md outside .planning: only server/src/lib/environment-check.ts remains (3 comments, out of scope)"
        status: fail
      - kind: other
        ref: "grep -qx 'POSTGRES_PASSWORD=CHANGE_ME_DB_PASSWORD' .env.example"
        status: pass
    human_judgment: false
  - id: D3
    description: "16-RECORDING-SCRIPT.md matches the shipped app: no health route, stack-health.png and storage.png, /opt/docktor/backups bind mount, masking, fixed file names"
    requirement: "#54"
    verification:
      - kind: other
        ref: "grep checks for stack-health.png, storage.png, /opt/docktor/backups and equal health.png / stack-health.png counts (rest-ok)"
        status: pass
    human_judgment: true
    rationale: "Whether the shot list can be followed end to end on the built app is only confirmed when the maintainer records it"
  - id: D4
    description: "README is at most 120 lines, GIF before the first H2, quickstart pull-based, no workspace table or yarn dev"
    requirement: "#54"
    verification:
      - kind: other
        ref: "python3 README structure checks (length, GIF position, required links, banned strings): passed; asset-exists check not run to completion"
        status: unknown
    human_judgment: true
    rationale: "README renders with the real GIF and screenshots only after the maintainer records them (Task 2); the light/dark GitHub render is a human check"
  - id: D5
    description: "docs/assets/docktor-demo.gif, dashboard.png, stack-detail.png, backups.png recorded and committed (#54)"
    requirement: "#54"
    verification: []
    human_judgment: true
    rationale: "Manual Recordly capture (D-18); deferred by the user, files do not exist yet"

duration: about 20min
completed: 2026-10-11
---

# Phase 16 Plan 07: README, docs pointers and recording script Summary

**PARTIAL: Tasks 1 and 3 are done and committed; Task 2 (the Recordly screenshots and GIF) is a pending human action, so the README's image links 404 until the four files exist, and #54 is not closed.**

## Performance

- **Duration:** about 20 min (start time not captured; estimated)
- **Completed:** 2026-10-11T21:47Z
- **Tasks:** 2 of 3 executed (Task 1 tracer, Task 3 auto); Task 2 checkpoint deferred by the user
- **Files:** 9 changed

## Accomplishments

- Task 1: the recovery-mode hint on the login 2FA step is now a link built with `docsUrl("reference/deployment", "resetting-two-factor-authentication")`, opening in a new tab with `rel="noopener noreferrer"`. The unit test was written first and failed (RED), then passed (18 of 18 in the file). Client `tsc -b` is clean.
- `.env.example` points every former `docs/deployment.md` reference at the matching docs-site page or anchor, the `BETTER_AUTH_SECRET` comment now says the server refuses to start and prints a report listing the variable, and `POSTGRES_PASSWORD=CHANGE_ME_DB_PASSWORD` sits after `DATABASE_URL` with a comment that it must equal the password inside it. The stale "change the password in docker-compose.yml" note was corrected to refer to `POSTGRES_PASSWORD`.
- `docker-compose.yml` (diff is comments only), `docker-compose.dev.yml`, `Dockerfile` and `server/src/scripts/reset-two-factor.ts` link the docs site instead of the old guide.
- `16-RECORDING-SCRIPT.md` rewritten: branch-build command, throwaway URL and admin, recording-only compose override bind-mounting `/opt/docktor/backups`, sample data (Gitea on an old tag, Nextcloud stopped, an `x-docktor` health probe, one manual backup, 60 s wait for the Storage scan), masking rules, a six-row screenshot table with fixed names (`stack-health.png` replaces the non-existent health view, `storage.png` added), the GIF timeline, and export limits.
- Task 3: README rewritten to 72 lines: pitch, GIF directly under it (before the first H2), eight feature bullets, three screenshots, a four-step pull-based quickstart from the `v0.1.0` tag, documentation, contributing, security and license sections. The workspace table, `yarn` commands and the CLAUDE.md link are gone.

## Pending human action: Task 2 (Recordly recording)

The user deferred this and will record on their own machine. Nothing was fabricated or copied as a placeholder. Follow `16-RECORDING-SCRIPT.md`, then add to `docs/assets/`:

| Required file | Content |
|---------------|---------|
| `docs/assets/docktor-demo.gif` | ~30 s core-flow GIF, under 5 MB |
| `docs/assets/dashboard.png` | Dashboard, 1440x900 |
| `docs/assets/stack-detail.png` | Stack detail > Overview |
| `docs/assets/backups.png` | Stack detail > Backups |

Optional: `-dark` variants, `compose-editor.png`, `stack-health.png`, `storage.png`. When `-dark` files exist, change the README screenshots to `<picture>` elements with a `prefers-color-scheme: dark` source. The final asset list with sizes could not be reported because no asset exists yet; report it when the files land (also check each PNG is a real image under 1.5 MB).

Until then these README image links 404 (`docs/assets/docktor-demo.gif`, `dashboard.png`, `stack-detail.png`, `backups.png`). The README acceptance checks that need real files (every referenced asset exists, GIF under 5 MB) are pending; the structure checks (length, GIF position, required links, banned strings) pass. Also review all frames against the masking rules before committing them (T-16-25).

## Task Commits

1. **Task 1 (tracer): pointers, POSTGRES_PASSWORD, recovery-hint link, recording script** - `c30a096` (docs)
2. **Task 2: Recordly capture** - not done, deferred (no commit)
3. **Task 3: README rewrite** - `c37136f` (docs); the assets part of this task's commit is pending

Commit count measured from `plan_head_before` to HEAD before this SUMMARY: 2.

## Deviations from Plan

### Deferred (out of scope, needs a decision)

**1. [Scope] Three stale `docs/deployment.md` comments remain in `server/src/lib/environment-check.ts`**
- **Found during:** Task 1 verification (the old-pointer `git grep` gate)
- **Issue:** Lines 96, 125 and 166 mention `docs/deployment.md` ("Sign-in protection", the disk checker default, "Stacks directory persistence"). The file came from 16-01 and is not in 16-07's `files_modified`, and the plan's pointer list did not include it, so the gate prints it and the D-16 truth "no file outside .planning points at the old guide" is not yet met.
- **Action:** Not edited, per the instruction to stay within `files_modified`. It is a three-comment fix (point them at `reference/deployment#sign-in-protection`, `#stacks-directory-path` and the disk setting) that 16-10's repo-wide re-run of the gate will flag; a small follow-up edit or a 16-10 task item resolves it.
- **Verification:** the gate over everything else prints no other file.

**2. [Deviation] Task 1 is one commit, not RED/GREEN commits**
- CLAUDE.md forbids committing failing tests, so the RED run was confirmed locally (the new link assertion failed) and test plus implementation were committed together.

**3. [Note] Dockerfile pointer was at line 153, not 134** as the plan listed; the one comment there was updated.

**Total deviations:** 1 deferred scope item, 2 notes. **Impact:** D-16 gate has one remaining file.

## Issues Encountered

- `security.md` does not exist in the docks repo yet, so the README's Security docs link (and `docsUrl("security")` anywhere) 404s until that page is added.
- The README human check (light and dark render on GitHub) cannot run until the assets exist.

## Authentication Gates

None.

## Known Stubs

README image links to files that do not exist yet (see Pending human action). Intentional and tracked as Task 2; not wired to mock data.

## Threat Flags

None. T-16-26 (reverse tabnabbing) mitigated and unit-tested; T-16-27 mitigated by the `CHANGE_ME` `POSTGRES_PASSWORD` line and the README and Get started instructions; T-16-25 (screenshots leaking data) is open until the recording is reviewed against the masking rules.

## User Setup Required

Record and add the four required assets (above), then re-run the README asset check from the plan's Task 3 verify block.

## Next Phase Readiness

The plan is NOT complete: ROADMAP.md and the requirements (#54, #17) are intentionally left unmarked. Remaining for this plan: Task 2 assets, the `environment-check.ts` comment fix, and the README light/dark human check. The contact email (info@raphael-muesseler.de) and docs URLs are interim constants in the Release inputs table and are easy to change.

## Self-Check: PASSED

Commits `c30a096` and `c37136f` are ancestors of HEAD; all nine modified files exist; the two-factor unit test file passes (18 of 18) and client `tsc -b` exits 0. The plan itself remains partial (status: partial above).
