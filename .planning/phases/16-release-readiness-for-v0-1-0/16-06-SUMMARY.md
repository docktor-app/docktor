---
phase: 16-release-readiness-for-v0-1-0
plan: 06
subsystem: docs
tags: [vitepress, documentation, deployment-reference, docks-repo, github-actions]

requires:
  - phase: 16-release-readiness-for-v0-1-0
    provides: "16-01 startup warning codes and error format, 16-02 Release inputs (MIT, github docs link style, contact), 16-04 image tags and docker-compose.build.yml"
provides:
  - "docktor-app/docks main: buildable VitePress 1.6.4 site (home, Get started, Deployment and environment reference, Templates reference) with a build-only GitHub Actions workflow"
  - "Heading-anchor contract on reference/deployment: startup-checks, environment-variables, sign-in-protection, resetting-two-factor-authentication, stacks-directory-path, database-schema, image-tags, building-from-source, troubleshooting"
  - "docs/deployment.md and docs/templates.md in this repo reduced to pointer pages"
affects: [16-07 pointer updates and compose flip, 16-08 feature guides and Security page, 16-09 release candidate, 16-10 compose flip]

requirements-completed: ["#17"]

actuals:
  tokens: 13800
  tasks: 3
  commits: 1
plan_head_before: d66417f2fdaf49f8a9d67c07fec322f48af3ce1d
plan_head_after: 543ede87ac0d17d907bb40aa42203965bb3707f2

tech-stack:
  added: ["vitepress 1.6.4 (docktor-app/docks only; nothing added to this repo)"]
  patterns:
    - "Project name, repo URLs, copyright and the public site URL are constants at the top of .vitepress/config.mts; an empty DOCS_SITE_URL means github link style, base / and no sitemap"
    - "Reference headings use plain text so GitHub and VitePress slug them identically"

key-files:
  created:
    - "docktor-app/docks: package.json, package-lock.json, .gitignore, LICENSE, README.md"
    - "docktor-app/docks: .vitepress/config.mts, index.md, guide/get-started.md"
    - "docktor-app/docks: reference/deployment.md, reference/templates.md"
    - "docktor-app/docks: .github/workflows/build.yml"
  modified:
    - docs/deployment.md
    - docs/templates.md

key-decisions:
  - "Task 1 package-legitimacy checkpoint was answered by the user in-session (APPROVED vitepress@1.6.4); npm view was still run and shown: repository vuejs/vitepress, maintainers Evan You and Vue core team members, latest 1.6.4, no preinstall/install/postinstall script"
  - "Docs repo content was committed from the user-designated clone /home/raphael/workspace/docks, not a .docks/ clone inside this repo, so nothing had to be excluded or deleted here"
  - "Scaffold commit contains no links to the Reference pages (nav, sidebar, Get started) so each pushed commit builds with zero dead links; the links arrived with the reference commit"
  - "Public site URL is a single constant, DOCS_SITE_URL, empty for now (interim GitHub link style)"
  - "Pre-release-only troubleshooting rows (.env.local rename, pre-05.1 stacks path, decorative /data and /backups volumes) and the contributor-only 'authoring a schema change' text were dropped from the public reference"

patterns-established:
  - "Docs pages live only in docktor-app/docks; this repo keeps pointer pages at the old paths so existing links resolve"

coverage:
  - id: D1
    description: "docktor-app/docks main holds a VitePress 1.6.4 site whose docs:build succeeds with no dead links, a README with build and serve instructions, and a build-only workflow with contents: read"
    requirement: "#17"
    verification:
      - kind: other
        ref: "npm run docs:build in /home/raphael/workspace/docks (build complete, no dead links), run before each push"
        status: pass
      - kind: other
        ref: "GitHub Actions 'Build docs' on main: success for b51980a and 70c494f"
        status: pass
    human_judgment: false
  - id: D2
    description: "Get started walks from an empty host to the setup wizard using raw.githubusercontent.com/docktor-app/docktor/v0.1.0 files and the published image; no raphaelmue URL remains"
    requirement: "#17"
    verification:
      - kind: other
        ref: "grep -c 'raw.githubusercontent.com/docktor-app/docktor/' guide/get-started.md prints 2; grep -c raphaelmue prints 0"
        status: pass
    human_judgment: true
    rationale: "The quickstart cannot run end to end until the v0.1.0 tag exists and the compose file on it pulls the GHCR image (16-07, 16-10); 16-09 and 16-10 exercise it"
  - id: D3
    description: "reference/deployment documents every server environment variable, the four blocking startup rules, all nine warning codes with fixes, and carries all nine anchor-contract headings"
    requirement: "#17"
    verification:
      - kind: other
        ref: "plan Task 3 reference check run against the content fetched from docks main via gh api (prints reference-ok)"
        status: pass
    human_judgment: false
  - id: D4
    description: "docs/deployment.md and docs/templates.md here are pointer pages of at most 30 lines linking the docks pages and anchors"
    requirement: "#17"
    verification:
      - kind: other
        ref: "plan Task 3 pointer check (prints pointers-ok); grep -c raphaelmue docs/deployment.md prints 0"
        status: pass
    human_judgment: false
  - id: D5
    description: "Tag table, warning triggers and defaults on the reference pages match what the released image does"
    verification: []
    human_judgment: true
    rationale: "The tag table comes from reading publish.yml (16-04 never ran it) and the image was not run here; confirm against the 16-09 release candidate"

duration: about 25min
completed: 2026-10-11
status: complete
---

# Phase 16 Plan 06: Docs site scaffold and deployment reference Summary

**The Docktor docs now live in docktor-app/docks as a VitePress 1.6.4 site (home, Get started, a deployment and environment reference re-verified against server/src, and a templates reference), built by a contents-read-only workflow; this repo keeps two short pointer pages.**

## What was pushed to docktor-app/docks main

Authorized by the user for this session: initial commit on `main` and `git push -u origin main`, nothing else. No tags, releases, repository settings, Pages or other repositories were touched.

| Commit | Message | Content |
|--------|---------|---------|
| `b51980a` | `docs(site): scaffold the Docktor documentation site` | package.json, package-lock.json, .gitignore, LICENSE (MIT, Copyright (c) 2026 Docktor contributors), README.md, .vitepress/config.mts, index.md, guide/get-started.md, .github/workflows/build.yml |
| `70c494f` | `docs(reference): migrate deployment and template references` | reference/deployment.md, reference/templates.md, Reference nav and sidebar group, links from Get started |

Remote main head equals local HEAD (`70c494f2efd4e77c498be73dc64d8169223c4538`). GitHub Actions "Build docs" ran on both pushes and concluded `success`.

## Final page and anchor map

| Site path | Source | Notes |
|-----------|--------|-------|
| `/` | index.md | hero plus four plain-text feature tiles (no feature links until 16-08) |
| `/guide/get-started` | guide/get-started.md | requirements, directories, fetch files from tag `v0.1.0`, CHANGE_ME values, `docker compose up -d`, setup wizard, upgrading |
| `/reference/deployment` | reference/deployment.md | H2s in order: Requirements, Environment variables, Startup checks, Image tags, Building from source, Upgrading, Sign-in protection, Resetting two-factor authentication, Stacks directory path (H3 Stacks directory persistence), Database schema, Backups, Troubleshooting |
| `/reference/templates` | reference/templates.md | layout, template.yml, variant.yml, limits, conventions, versions |

Anchors the other plans link to, all present: `#startup-checks`, `#environment-variables`, `#sign-in-protection`, `#resetting-two-factor-authentication`, `#stacks-directory-path`, `#database-schema`, `#image-tags`, `#building-from-source`, `#troubleshooting`.

In this repo, `docs/deployment.md` (16 lines) and `docs/templates.md` (7 lines) link the docks pages in the interim GitHub style (`https://github.com/docktor-app/docks/blob/main/{path}.md`). `docs/templates.md` also links `features/templates.md`, which 16-08 creates; that link is a 404 until then.

## Accomplishments

- **Package gate.** `npm view vitepress@1.6.4` showed repository `vuejs/vitepress`, maintainers from the Vue core team, `latest` 1.6.4 (`next` is the 2.0 alpha) and no install-time script. Installed with `npm install --save-dev --save-exact vitepress@1.6.4` from registry.npmjs.org; the lockfile carries registry URLs and integrity hashes. Only two lockfile packages declare install scripts: `esbuild` (standard platform-binary step) and `fsevents` (optional, macOS).
- **Site config.** Title, description, `cleanUrls`, `srcExclude: ["README.md"]`, local search, edit link, MIT footer. Name, repo URLs, copyright and `DOCS_SITE_URL` are constants at the top of config.mts, so a rename or a move to a real domain is a single edit; with the constant set, the base path and sitemap follow.
- **Deployment reference re-verified.** All 19 variables from `git grep process.env` in server/src plus `POSTGRES_PASSWORD` are tabled with defaults checked against the code and the Dockerfile `ENV` lines. Documented from 16-01: the four blocking rules and the exact report format, all nine warning codes with trigger and fix, the dismissible banner. From 16-04: tags per event, amd64 and arm64, `docker-compose.build.yml` and `docktor:local`. The 2FA reset procedure, TRUST_PROXY sign-in protection and the Docker-socket and `/host:ro` warnings are present.
- **Corrections found while re-verifying.** `BETTER_AUTH_URL` is now required (no dev-only fallback applies); `ENCRYPTION_KEY` now blocks startup instead of failing on first use; the image presets `DOCKTOR_DB_AUTO_MIGRATE=true`, so the deprecated `DOCKTOR_DB_AUTO_PUSH` alias has no effect there (stated explicitly); troubleshooting item 1 is rewritten around the startup report and the wrong `raphaelmue` clone URL is gone; two rows were added for the `POSTGRES_PASSWORD` mismatch cases.
- **Templates reference.** Every limit (16 KiB manifests, 256 KiB compose, 64 KiB env and icon, 500 variants), the slug pattern, icon pattern, field limits and the content hash scope were checked against `template-source-reader.ts` and `shared/src/validation/templates.ts`; they were unchanged. One statement was corrected: named Docker volumes are flagged by the compatibility check, not "unsupported".
- **Tracer gate.** The Task 2 verification was re-run end to end before Task 3 (build passed, remote head equal to the pushed commit, `guide/get-started.md` present, vitepress pinned 1.6.4), so expansion continued.

## Task Commits

1. **Task 1: package legitimacy checkpoint** - no commit; answered by the user in-session, metadata shown and confirmed
2. **Task 2 (tracer): docs site scaffold** - docks `b51980a`
3. **Task 3: reference pages** - docks `70c494f`, and in this repo `543ede8` (`docs(docs): point deployment and template guides to the docs site`)

**Plan metadata:** this SUMMARY plus STATE.md and ROADMAP.md (docs: complete plan). Commit count measured in this repo from `plan_head_before` to HEAD before this SUMMARY: 1. The docks commits live in the other repository and are listed above.

## Files Created/Modified

- This repo: `docs/deployment.md`, `docs/templates.md` (pointer pages).
- docktor-app/docks: the 11 files in the table above.

## Decisions Made

See `key-decisions` above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Scaffold built only if it did not link to pages that did not exist yet**
- **Found during:** Task 2
- **Issue:** The plan has Task 2 produce a nav entry and Get started links pointing at `/reference/deployment`, which Task 3 creates. VitePress fails the build on dead links, so the first pushed commit (and its CI run) would have been red.
- **Fix:** The scaffold commit leaves out the Reference nav entry, the Reference sidebar group and the two deep links in Get started (the text names the sections instead); the second commit adds them. Both commits build cleanly and both CI runs are green.
- **Files:** `.vitepress/config.mts`, `guide/get-started.md` (docks)
- **Commits:** `b51980a`, `70c494f`

**2. [Plan adaptation] Docs working copy location and the `.docks` steps**
- **Found during:** Task 2
- **Issue:** The plan clones docks into `.docks/` inside this repo, adds a local exclude and deletes it at the end. The user supplied an existing empty clone at `/home/raphael/workspace/docks`.
- **Fix:** Worked in that clone; no exclude entry was needed and nothing was deleted (it is the user's clone). The plan's `.docks`-relative verify commands were run against that path.

**3. [Judgment] RAM requirement omitted from Get started**
- **Issue:** The plan asks for "about 1 GB RAM free" but says to check it against the deployment doc; the old doc and the code give no memory figure.
- **Fix:** Left out rather than invent a number.

**4. [Judgment] Content dropped from the public reference**
- Removed troubleshooting rows 7 to 9 of the old guide (decorative `/data` and `/backups` volumes, the pre-05.1 stacks-path move, the `.env.local` rename) because no v0.1.0 installation can have those histories; the `.env` filename rule stays in Get started. Removed the "live-verification note" that pointed at private planning files and the contributor-oriented "Authoring a schema change" text (CONTRIBUTING.md already covers `yarn db:migrate`).

**Total deviations:** 1 auto-fixed blocking issue, 3 plan adaptations or judgments. **Impact:** none on the plan's outcomes.

## Issues Encountered

- `git push` printed `fatal: expected 'acknowledgments', received 'packfile'` and `push negotiation failed; proceeding anyway` on the first push; the branch was created and the remote head matched. The warning is a negotiation quirk of pushing to an empty repository.
- `npm install` reported 3 vulnerabilities (2 moderate, 1 high) in transitive dev dependencies. They were not changed (`npm audit fix` is out of scope for an exact pin) and are build-time only; the site ships static files.

## Authentication Gates

None. `gh api repos/docktor-app/docks --jq .permissions.push` printed `true`, so the precondition held.

## Known Stubs

None. Pages that other plans add (Introduction, Features, Security) are deliberately not linked yet.

## Threat Flags

None beyond the plan's threat model. T-16-SC: mitigated (checkpoint answered, exact pin, lockfile committed, registry.npmjs.org only). T-16-22: the workflow has `permissions: contents: read`, no deploy step and no secrets. T-16-23: docs show generator commands and `CHANGE_ME` names only. T-16-24: the Docker-socket and `/host:ro` warnings are in both Get started and the reference; the link to the Security page arrives with 16-08.

## User Setup Required

- Build workflow actions in docks use the `@v4` tags (`actions/checkout`, `actions/setup-node`), as the plan specified; pin them to commit SHAs if you want the same policy as the 16-04 publish workflow.
- Decide the real docs host. When it exists, set `DOCS_SITE_URL` in `.vitepress/config.mts` and rewrite every GitHub-style docs link in this repo (the Release inputs table in 16-02-SUMMARY lists the style).
- Confirm the "Image tags" table against the first release-candidate run (16-09); it describes `publish.yml` as written, not an observed run.

## Next Phase Readiness

Ready for 16-07 (pointer updates in this repo, `POSTGRES_PASSWORD` in `.env.example`, compose flip) and 16-08 (introduction, feature guides, Security page, and the Features and Security entries in the sidebar). The quickstart documented here fetches files from tag `v0.1.0`, which does not exist until the release; the compose file on that tag must pull `ghcr.io/docktor-app/docktor:latest` and `.env.example` must carry `POSTGRES_PASSWORD` (16-07).

## Self-Check: PASSED

Files exist: `docs/deployment.md`, `docs/templates.md`, and in the docks clone `package.json`, `package-lock.json`, `.gitignore`, `LICENSE`, `README.md`, `.vitepress/config.mts`, `index.md`, `guide/get-started.md`, `reference/deployment.md`, `reference/templates.md`, `.github/workflows/build.yml`. Commit `543ede8` is an ancestor of HEAD here; docks `b51980a` and `70c494f` are ancestors of docks HEAD and the remote main head equals `70c494f`. `git rev-list --count` from the recorded base measured 1 before this SUMMARY commit.
