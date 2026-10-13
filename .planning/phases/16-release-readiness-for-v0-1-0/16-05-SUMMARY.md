---
phase: 16-release-readiness-for-v0-1-0
plan: 05
subsystem: docs
tags: [contributing, design-notes, architecture, community-health]

requires:
  - phase: 16-release-readiness-for-v0-1-0
    provides: plan 02 CODE_OF_CONDUCT.md, SECURITY.md, LICENSE, PR template and the Release inputs table (docs URL scheme, contact address)
provides:
  - "CONTRIBUTING.md: setup, tests, commit format, PR flow, MIT inbound=outbound terms (D-02, D-17, D-19)"
  - "docs/design.md aligned with the v0.1.0 shipped design: image, deployment, workflow, proxy, secrets, settings, checks, backups, templates, security (D-16)"
affects: [16-06, 16-07, 16-10]

requirements-completed: ["#55", "#17"]

actuals:
  tokens: 10500
  tasks: 2
  commits: 2
plan_head_before: 3ba55ccb650346689af165f9f82b38e36aac29b9
plan_head_after: 6c10c4d4a66d70a69997f25748a56e2fdd942cfd

tech-stack:
  added: []
  patterns:
    - "Docs describe shipped behaviour and point at the source of truth (docker-compose.yml, Dockerfile, stack-status-machine.ts) instead of duplicating it"

key-files:
  created:
    - CONTRIBUTING.md
  modified:
    - docs/design.md

key-decisions:
  - "CONTRIBUTING tells contributors to set BETTER_AUTH_URL=http://localhost:3000 (the .env.example value); the Vite origin http://localhost:5173 is already a default trusted origin in server/src/lib/auth.ts, so no second URL is needed"
  - "design.md links the docs site with the interim DOCS_LINK_STYLE=github scheme (docks/blob/main/{path}.md); these links must be rewritten when a site is hosted"
  - "Genuinely unbuilt ideas stay in design.md marked 'Not implemented' (inter-stack networking, authenticated registries, Docker Secrets, RBAC) rather than being deleted"

patterns-established:
  - "design.md defers to docker-compose.yml, the Dockerfile and the state machine file as the authoritative sources"

coverage:
  - id: D1
    description: "CONTRIBUTING.md covers code of conduct, MIT contribution terms with no CLA or sign-off, ways to contribute, the workspace table, setup, every test command, commit format, PR flow and issue tracking; every relative link resolves"
    requirement: "#55"
    verification:
      - kind: other
        ref: "python3 structure check from 16-05-PLAN Task 1 <verify> (prints contributing-ok)"
        status: pass
    human_judgment: false
  - id: D2
    description: "docs/design.md no longer contains the apt-installed restic or compose plugin, the Docker Hub image, the curl-pipe installer host, the dead data and backup directory variables, the 8443 mapping, the 'MVP — Up Next' list or the docs/deployment.md pointer, and names ghcr.io/docktor-app/docktor"
    requirement: "#17"
    verification:
      - kind: other
        ref: "shell gate from 16-05-PLAN Task 2 <verify> (prints design-ok)"
        status: pass
    human_judgment: false
  - id: D3
    description: "A new contributor can follow the Development setup steps from a clean clone to a running dev stack"
    requirement: "#55"
    verification: []
    human_judgment: true
    rationale: "The steps were checked against package.json, docker-compose.dev.yml, .env.example and the startup environment check, but nobody ran them on a clean machine; 16-10 or the release owner should do one walkthrough"

duration: about 30min
completed: 2026-10-11
status: complete
---

# Phase 16 Plan 05: Contributor guide and design notes Summary

**CONTRIBUTING.md takes a contributor from clone to a green test run and a PR (Node 22, Corepack, dev Postgres, the four required env vars, every test command, commit format, PR flow, MIT inbound=outbound), and docs/design.md now describes the shipped v0.1.0 image, deployment, proxy, secrets, settings and checks instead of the original MVP plan.**

## Performance

- **Duration:** about 30 min (start time was not captured; estimated)
- **Completed:** 2026-10-11T21:25Z
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files:** 2 (1 new, 1 modified)

## Accomplishments

- CONTRIBUTING.md has the eleven H2 sections in the plan's order, with the workspace table moved from the README (D-17). The License section states contributions are accepted under the project's MIT license, with no contributor license agreement and no `Signed-off-by` line (D-02). Setup names only the variables (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, a 64-hex `ENCRYPTION_KEY`) and never a value (T-16-20).
- The tracer gate ran: Task 1's verification was re-run end to end before Task 2 started and passed, so expansion continued.
- docs/design.md: Progress replaced by a Status section, Install Script section removed (T-16-21), and every item in the plan's drift list corrected; the other sections were read against the code and corrected where false (below).
- No README edit (16-07 owns it) and no release or from-source image text (16-10 appends it).

## Sections reviewed in docs/design.md

| Section | Change |
|---------|--------|
| Progress | Replaced by "Status": feature areas shipped in v0.1.0, link to GitHub milestones and the docks repo |
| First-Run Experience | Present tense; added the proxy step and closed sign-up after the first account |
| Core Concepts, Volume Strategy | Stack path now the stacks directory (default `/opt/docktor/stacks`). Named volumes are a configurable warning, not "rejected with auto-convert"; marketplace/linter claim and the "directory creation on deploy" claim removed |
| Stack Import | "Post-MVP" banner removed (shipped); scan goes through the `/host` mount |
| Technology Choices, Infrastructure | Added chokidar and the two-factor plugin; proxy is nginx-proxy + acme-companion; git added; packaging is the multi-arch GHCR image; install script reference removed |
| Project Structure | Real server layers (routes, application, domain, repositories, infrastructure, jobs, lib), router.tsx, docs, compose files |
| Build & Deployment | Dockerfile snippet replaced with prose for the real stages (client-build on the build platform, per-platform server-build, checksum-verified restic stage, pinned sha256-verified docker CLI and compose plugin), multi-arch, GHCR |
| Development Workflow | yarn, `yarn dev` through concurrently, `.env.development`, shared consumed from `shared/dist` (built once; rebuild or watch after schema changes), Vite proxy claim verified against `client/vite.config.ts` |
| Docktor Deployment (diagram, compose file, decisions) | Shipped layout: GHCR image, 3000:3000, socket, identical-path stacks volume driven by `DOCKTOR_STACKS_HOST_DIR`, `/:/host:ro`, `postgres:18` under `./dev-data/docktor/db`; compose file linked, not duplicated; removed the 8443 mapping, base URL and data/backup directory variables, and the nonexistent `PathResolver` |
| Install Script | Removed; one sentence pointing at the docs-site Get started page |
| Database Schema | Model summary extended with the models added in phases 02-15; Registry marked unused |
| Compose Parsing and File Watching | `.env` hash, `config_error`, polling default in the image, `x-docktor` probe block |
| UI, Status and Health | Review dialog, templates, HTTP probes, uptime and incidents |
| State machine | BACKING_UP no longer stops containers; auto-transitions are event-driven with a 60 s reconciliation instead of a 15 s poll; operation-locking table rewritten from `TRANSITIONS` (running stacks cannot be deleted) |
| Disk Space Monitoring | Host check via `statfs` with settings thresholds; per-stack `du -sk` daily at 00:15, not hourly `du -sb`; removed the unimplemented "grows more than 20%" rule |
| Networking | MVP/post-MVP labels replaced; `docktor_proxy` described |
| Proxy Configuration | Rewritten for nginx-proxy + acme-companion, compose env-var writes, uploaded certificates; per-service public/private and raw Nginx generation marked not implemented |
| Secrets | Rewritten: `.env` is not chmod 600 (the code uses default modes); AES-256-GCM `ENCRYPTION_KEY` for Docktor's own secrets; contradiction with the old "secrets not in the DB" removed |
| Global Settings | Real keys (`instanceName`, `smtp.*`, `backup.*`, `notify.*`, `disk.*`, `proxy.*`, `diffConfirm.skip`, `composeChecks.*`, `health.retentionDays`, `auth.requireTwoFactor`) |
| Registry Configuration | Authenticated registries marked not implemented |
| YAML Validation and Safety | Rewritten for the rule registry: three always-on danger checks, three configurable warnings, merged diff dialog, port-conflict check; removed unimplemented `network_mode`/`cap_add` checks and the "I understand the risks" confirmation |
| Notifications | Three triggers plus in-app log; removed the unshipped "backup completed" email |
| Backup and Restore | Live backup with pre/post hooks (not stop-and-backup), `logs` and `backups` excluded, restore flow |
| Marketplace | Replaced by "Templates" (git repositories, variants, pinned commit, update badge), linking `docs/templates.md` |
| Security Summary | No TLS termination for the UI (reverse proxy plus `TRUST_PROXY`), 2FA reset link now the docs-site page, secrets rows corrected, template and RBAC rows updated |
| Future Roadmap | Renamed "Not Implemented"; shipped items removed |

## Task Commits

1. **Task 1 (tracer): CONTRIBUTING.md** - `eb458ac` (docs)
2. **Task 2: design.md drift corrections** - `6c10c4d` (docs)

**Plan metadata:** this SUMMARY plus STATE.md and ROADMAP.md (docs: complete plan). Commit count measured from `plan_head_before` to HEAD before this SUMMARY: 2.

## Files Created/Modified

- `CONTRIBUTING.md` - contributor guide (new, 127 lines)
- `docs/design.md` - architecture notes aligned with v0.1.0 (374 insertions, 319 deletions)

## Decisions Made

See `key-decisions` above. The docs-site links in design.md (`guide/get-started.md`, `reference/deployment.md#resetting-two-factor-authentication`, `security.md`) follow the Release inputs scheme from 16-02 and point at pages that 16-06 and 16-08 create.

## Deviations from Plan

None - plan executed exactly as written. Step 8 of Task 2 (read every remaining section against the code) turned up the extra corrections listed in the table above; they are the plan's own instruction, not deviations.

## Issues Encountered

None.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. T-16-20 is mitigated (the setup section names variables only; the PR template already carries the "no secrets" item). T-16-21 is mitigated (the Install Script section and the `get.docktor.io` hostname are gone; the gate greps for it).

## Out-of-scope observations (not changed)

- `docker-compose.yml`, `docker-compose.dev.yml`, `.env.example` and `README.md` still point at `docs/deployment.md` (10 references), and `docker-compose.yml` still builds locally with `image: docktor/docktor:latest` commented out. These are other plans' files (16-06/16-07 move the deployment guide to the docs site; the GHCR switch belongs to the publish work), so they were left alone.
- CONTRIBUTING.md and docs/design.md link the docks repo with the interim GitHub URL style; they need rewriting together with the other docs links once a site is hosted.

## User Setup Required

None for this plan. Recommended before the release: one clean-machine walkthrough of "Development setup" (see coverage D3).

## Next Phase Readiness

Ready for 16-06. 16-10 appends "Building the image from source" and "Releasing" to CONTRIBUTING.md; the file ends with the Issue tracking section, so those headings can be appended directly.

## Self-Check: PASSED

CONTRIBUTING.md exists on disk; commits `eb458ac` and `6c10c4d` are ancestors of HEAD; `git rev-list --count` from `plan_head_before` to HEAD measured 2 before this SUMMARY commit; both task `<verify>` commands print `contributing-ok` and `design-ok`; all relative links in both files resolve.
