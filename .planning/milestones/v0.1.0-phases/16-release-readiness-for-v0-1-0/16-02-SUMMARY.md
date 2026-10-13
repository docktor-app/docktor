---
phase: 16-release-readiness-for-v0-1-0
plan: 02
subsystem: infra
tags: [license, mit, security-policy, code-of-conduct, github-issue-forms, pull-request-template]

requires:
  - phase: 16-release-readiness-for-v0-1-0
    provides: plan 01 startup environment check (no code dependency; same phase)
provides:
  - "MIT LICENSE (D-01/D-02) and license field MIT in all four package.json files"
  - "SECURITY.md disclosure policy routed to GitHub private vulnerability reporting with an email fallback (D-19)"
  - "CODE_OF_CONDUCT.md, Contributor Covenant 2.1 with the confirmed enforcement contact (D-19)"
  - "Bug report and feature request issue forms with native Issue Types, issue chooser config, PR template (D-19)"
  - "Release inputs table (docs URL scheme, contact address, quickstart ref) for later plans"
affects: [16-03, 16-05, 16-06, 16-07, 16-08, 16-09, 16-10]

requirements-completed: ["#57", "#55"]

actuals:
  tokens: 6500
  tasks: 3
  commits: 3
plan_head_before: e7e39e8dee3e19ad1ae0871539ae7916fe07f21b
plan_head_after: c3ac722c2118c61e6db27a0e864f8e02f57fa349

tech-stack:
  added: []
  patterns:
    - "Community health files at repo root and under .github/, checked by grep and a YAML structure script"

key-files:
  created:
    - LICENSE
    - SECURITY.md
    - CODE_OF_CONDUCT.md
    - .github/ISSUE_TEMPLATE/bug_report.yml
    - .github/ISSUE_TEMPLATE/feature_request.yml
    - .github/ISSUE_TEMPLATE/config.yml
    - .github/PULL_REQUEST_TEMPLATE.md
  modified:
    - package.json
    - server/package.json
    - client/package.json
    - shared/package.json

key-decisions:
  - "MIT with 'Copyright (c) 2026 Docktor contributors' and no CLA/DCO confirmed by the user for docktor and docks (D-01/D-02)"
  - "Docs links use the interim GitHub style (DOCS_LINK_STYLE=github); every docs link must be rewritten once a site is hosted"
  - "info@raphael-muesseler.de is the published security fallback and CoC enforcement contact"
  - "The chooser's 'Read the documentation' link points at guide/introduction.md, the fixed first docs page, because no index page path is fixed for the whole phase"

patterns-established:
  - "Docs links are built from DOCS_BASE_URL in the Release inputs table plus the fixed page paths"

coverage:
  - id: D1
    description: "LICENSE is the verbatim SPDX MIT text with the copyright line 'Copyright (c) 2026 Docktor contributors', and all four package.json files declare license MIT"
    requirement: "#57"
    verification:
      - kind: other
        ref: "grep -cx 'MIT License' LICENSE && grep -cx 'Copyright (c) 2026 Docktor contributors' LICENSE && grep -c 'THE SOFTWARE IS PROVIDED \"AS IS\"' LICENSE"
        status: pass
      - kind: other
        ref: "node -e check of license === 'MIT' in the four package.json files (prints ok)"
        status: pass
    human_judgment: false
  - id: D2
    description: "SECURITY.md names the private advisory URL, the confirmed email, supported versions and links the docs Security page; CODE_OF_CONDUCT.md is Covenant 2.1 with the contact and no front matter"
    requirement: "#55"
    verification:
      - kind: other
        ref: "grep checks for security/advisories/new, email address, 'Contributor Covenant', 'version 2.1', no INSERT CONTACT METHOD, no +++ front matter"
        status: pass
    human_judgment: false
  - id: D3
    description: "Bug and feature issue forms carry native types with ids and labels on every field, blank issues are off with exactly three contact links, the PR template mirrors CLAUDE.md"
    requirement: "#55"
    verification:
      - kind: other
        ref: "python3 yaml structure check (prints ok); grep for 'Closes #', 'tsc --build', 'type(scope): description' in the PR template"
        status: pass
    human_judgment: false
  - id: D4
    description: "GitHub accepts the top-level type key and renders the forms at /issues/new/choose"
    requirement: "#55"
    verification: []
    human_judgment: true
    rationale: "RESEARCH Assumption A9: only GitHub can confirm the type key renders; checked after the phase PR merges to main"

duration: about 15min
completed: 2026-10-11
status: complete
---

# Phase 16 Plan 02: Release identity Summary

**Docktor is MIT-licensed (Copyright (c) 2026 Docktor contributors) with a private-advisory security policy, Contributor Covenant 2.1, typed bug and feature issue forms, a locked-down issue chooser and a PR template that mirrors CLAUDE.md.**

## Release inputs

Task 1 (checkpoint:decision, blocking-human) was answered by the user in-session before execution started and was recorded here before Task 2. Later plans (16-03, 16-05, 16-06, 16-07, 16-08, 16-10) read this table.

| Input | Value |
|-------|-------|
| License | MIT confirmed for docktor-app/docktor and docktor-app/docks, "Copyright (c) 2026 Docktor contributors", no CLA/DCO (option "github" for docs) |
| DOCS_LINK_STYLE | github - interim links `https://github.com/docktor-app/docks/blob/main/{path}.md` |
| DOCS_BASE_URL | `https://github.com/docktor-app/docks/blob/main` |
| CONTACT_EMAIL | info@raphael-muesseler.de (user-supplied; published as the security fallback and the CoC enforcement contact) |
| QUICKSTART_REF | v0.1.0 (default; fetch docker-compose.yml/.env.example from the v0.1.0 tag) |

With DOCS_LINK_STYLE=github a docs page at site path `/security` is `https://github.com/docktor-app/docks/blob/main/security.md`, and `/guide/get-started` is `.../guide/get-started.md`.

## Performance

- **Duration:** about 15 min (start time was not captured; estimated)
- **Completed:** 2026-10-11T21:07Z (last task commit)
- **Tasks:** 3 (1 decision checkpoint answered in advance, 1 tracer, 1 auto)
- **Files:** 11 changed in the plan's files_modified (7 new, 4 modified)

## Accomplishments

- LICENSE is the SPDX MIT text fetched at execution time with only the copyright line changed; no contributor-agreement text anywhere (D-02). `"license": "MIT"` added to root, server, client and shared package.json; `yarn.lock` unchanged.
- SECURITY.md: supported-versions table, GitHub private vulnerability reporting link with the email fallback, what to include, 7-day acknowledgement, and a scope note that links the docs Security page instead of covering Docker-socket hardening. It does not claim private vulnerability reporting is already enabled.
- CODE_OF_CONDUCT.md: Contributor Covenant 2.1 with the Hugo front matter removed and the Enforcement contact set; the Attribution section is intact.
- Issue forms: `bug_report.yml` (type Bug, required confirmation that secrets were removed, logs rendered as shell) and `feature_request.yml` (type Feature), no title prefixes and no labels. `config.yml` disables blank issues and lists the advisory form first, then Discussions, then the docs.
- PULL_REQUEST_TEMPLATE.md: Summary, `Closes #`, How was this tested, and a checklist covering commit format, TDD and `yarn test`, `tsc --build`, no `any`, shared Zod schemas, dark-mode counterparts and `ToneBadge`/`Section`, docs PR, and no secrets.
- Tracer gate: Task 2's verification was re-run end to end before Task 3 started (all passed), so expansion continued.

## Task Commits

1. **Task 1: public-release identity decision** - no commit (answered by the user in-session; recorded above)
2. **Task 2 (tracer): MIT license and fields** - `8022487` (docs)
3. **Task 2 (tracer): security policy and code of conduct** - `2c77b2c` (docs)
4. **Task 3: issue forms, chooser config, PR template** - `c3ac722` (docs)

**Plan metadata:** this SUMMARY plus STATE.md/ROADMAP.md (docs: complete plan). Commit count measured from `plan_head_before` to HEAD before this SUMMARY: 3.

## Files Created/Modified

- `LICENSE` - SPDX MIT text, 2026 Docktor contributors
- `package.json`, `server/package.json`, `client/package.json`, `shared/package.json` - `"license": "MIT"` (after `description` in the root, after `version` elsewhere)
- `SECURITY.md` - disclosure policy
- `CODE_OF_CONDUCT.md` - Contributor Covenant 2.1
- `.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`, `config.yml` - issue forms and chooser
- `.github/PULL_REQUEST_TEMPLATE.md` - PR checklist

## Decisions Made

See `key-decisions` above. The chooser's documentation link uses `guide/introduction.md` because that is the first fixed docs page. The PR template links CONTRIBUTING.md by absolute URL on `main`, which will resolve once plan 16-05 adds the file and the phase PR merges.

## Deviations from Plan

### Auto-fixed Issues

None to code. One acceptance criterion needs a note:

**1. [Criterion false positive] `grep -ciE 'CLA|DCO|signed-off-by' LICENSE` prints 1, not 0**
- **Found during:** Task 2 acceptance check
- **Issue:** The case-insensitive pattern `CLA` matches "CLAIM" in the verbatim MIT warranty text ("ANY CLAIM, DAMAGES OR OTHER LIABILITY"). It is not a contributor agreement.
- **Resolution:** No change; the plan requires every other MIT line verbatim. The intent of the criterion (no CLA, DCO or sign-off text, D-02) holds: a whole-word search (`grep -nwiE 'CLA|DCO|signed-off-by' LICENSE`) finds nothing.
- **Files modified:** none

**Total deviations:** 0 code deviations, 1 acceptance-criterion false positive. **Impact:** none.

## Issues Encountered

None.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. T-16-06 (public vulnerability reports) is mitigated by SECURITY.md, the advisory-first chooser and the bug form intro; T-16-07 (secrets in bug reports) by the required checkbox and the logs field description; T-16-08 by LICENSE and the license fields (CONTRIBUTING in 16-05 states inbound=outbound MIT).

## User Setup Required

- Before the release candidate (plan 16-09 lists it, 16-10 verifies it): enable GitHub private vulnerability reporting on docktor-app/docktor, otherwise the advisory link in SECURITY.md and the chooser returns an error.
- After the phase PR merges to main: open https://github.com/docktor-app/docktor/issues/new/choose. Expect the Bug report and Feature request forms plus three contact links and no blank-issue option; a draft bug should show Type = Bug. If GitHub reports a template error for the `type` key, remove that line from both forms (RESEARCH Assumption A9).

## Next Phase Readiness

Ready for 16-03. The Release inputs table above is the single source for the docs URL scheme, the contact address and the quickstart ref. All docs links must be rewritten once the site is hosted (DOCS_LINK_STYLE=github is interim).

## Self-Check: PASSED

All seven created files exist on disk; commits `8022487`, `2c77b2c` and `c3ac722` are ancestors of HEAD; `git rev-list --count` from `plan_head_before` to HEAD measured 3 before this SUMMARY commit.
