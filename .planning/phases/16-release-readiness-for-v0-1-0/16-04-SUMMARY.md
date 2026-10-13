---
phase: 16-release-readiness-for-v0-1-0
plan: 04
subsystem: infra
tags: [docker, multi-arch, ghcr, github-actions, buildx, restic, supply-chain]

requires:
  - phase: 16-release-readiness-for-v0-1-0
    provides: "16-01 startup environment check (the image smoke test asserts its error block)"
provides:
  - "Dockerfile that builds from a clean checkout for linux/amd64 and linux/arm64, every downloaded binary sha256-verified per architecture"
  - "docker-compose.build.yml from-source override (docktor:local, pull_policy build)"
  - "PR docker-image job: clean-checkout amd64 build plus empty-environment smoke (exit 1, four variable names)"
  - "Reusable ci.yml (workflow_call + pull_request) and CI-gated publish.yml pushing to ghcr.io/docktor-app/docktor"
affects: [16-06 docs, 16-07 compose flip to GHCR image, 16-09 release candidate, 16-10 package visibility]

requirements-completed: []

actuals:
  tokens: 14000
  tasks: 3
  commits: 3
plan_head_before: c1ce450d2a2810c9cf80cc02a1315a34e55ce661
plan_head_after: 4850c56ba0ddcb157d0fed13162734230aa6a65b

tech-stack:
  added: []
  patterns:
    - "TARGETARCH case statement mapping to per-arch asset names and digests inside a single verify-and-install RUN"
    - "Reusable CI (workflow_call) gating a separate publish workflow; named secrets, never secrets: inherit"
    - "Untrusted/dynamic values (image digest) reach shell scripts through env variables only"

key-files:
  created:
    - docker-compose.build.yml
    - .github/workflows/publish.yml
  modified:
    - Dockerfile
    - .dockerignore
    - .github/workflows/ci.yml

key-decisions:
  - "Task 2 (user decision, answered in-session): option call-suppress-zero. Reusable workflow_call gate; the bare major tag X is published only when X is not 0 (deviates from D-05's literal text while the major version is 0)"
  - "latest is an explicit raw tag enabled only for non-prerelease v* tags (flavor latest=false), not latest=auto"
  - "X.Y is also restricted to stable tags (no '-' in the ref) so prereleases publish only their full version, rather than relying on metadata-action's implicit prerelease handling"
  - "Action commit-SHA pinning is NOT done: GitHub API access was denied for the session (see Action pins)"

patterns-established:
  - "Per-arch pins live next to the case statement that selects them; bumping a version means recomputing every arch's digest"

status: partial
completed: 2026-10-11
---

# Phase 16 Plan 04: Multi-arch image and CI-gated GHCR publish Summary

**The Dockerfile now builds from a clean checkout for amd64 and arm64 with per-arch sha256 verification, every PR proves the image rejects an empty environment, and publish.yml pushes CI-gated multi-arch images to GHCR; the one part not done is pinning the third-party actions to commit SHAs, which is blocked and pending.**

## Status: partial, one blocker for the maintainer

All three tasks were authored and committed. The plan's supply-chain truth "every docker/* action and actions/checkout in the job holding packages: write is pinned to a full commit SHA" is **not met**. Every action in `publish.yml` and the two docker/* actions in the new `ci.yml` job are on their major tags (`@v4`, `@v6`, `@v7`) with a `PIN-PENDING` comment. The plan's verify gates that check for 40-hex SHAs fail until this is resolved. The workflows have not been run, so no unpinned action has executed. Do not cut the 16-09 release candidate before this is resolved.

## Action pins

Resolution needs `gh api repos/docker/<action>/commits/<major-tag> --jq .sha`, but `gh` returned HTTP 403 ("GitHub access to this repository is not enabled for this session") for every call. I did not try another client or route to the same API, and I did not write SHAs from memory, because a wrong or invented SHA in a `packages: write` job is worse than a visible placeholder.

Majors used (taken from the plan's Standard Stack, A13 not re-confirmed against `releases/latest`):

| Action | Major | Where |
|--------|-------|-------|
| actions/checkout | v4 | publish.yml |
| docker/setup-qemu-action | v4 | publish.yml |
| docker/setup-buildx-action | v4 | publish.yml, ci.yml (docker-image) |
| docker/login-action | v4 | publish.yml |
| docker/metadata-action | v6 | publish.yml |
| docker/build-push-action | v7 | publish.yml, ci.yml (docker-image) |

To finish: for each row, confirm the current major with `releases/latest`, resolve `commits/<major-tag>`, replace `@vN` with `@<40-hex> # vN`, and delete the `PIN-PENDING` comments. Then this check must print `pinned-ok`: `test "$(grep -hE 'uses: docker/' .github/workflows/ci.yml .github/workflows/publish.yml | wc -l)" -ge 7 && test "$(grep -hE 'uses: docker/' .github/workflows/ci.yml .github/workflows/publish.yml | grep -cvE '@[0-9a-f]{40}')" -eq 0`. There are 7 docker/* uses today.

## Task 2 decision

Recorded as answered by the user in this session: option `call-suppress-zero`. Reusable `workflow_call` gate; publish X only when X is not 0.

## Tags each event produces

| Event | Tags |
|-------|------|
| push to main | `edge`, `sha-<short>` |
| tag `v0.1.0` | `0.1.0`, `0.1`, `latest` (no `0`) |
| tag `v1.2.3` | `1.2.3`, `1.2`, `1`, `latest` |
| tag `v0.1.0-rc.1` | `0.1.0-rc.1` only |

This table comes from reading the rules in `publish.yml`, not from a run of metadata-action. The semver `{{version}}` rule for a prerelease and the `sha-` prefix default are the behaviours to confirm on the first real run (16-09 rc output).

## Accomplishments

- **Clean-checkout fix (Pitfall 2).** Evidence: `git ls-files .yarn` printed nothing (the directory holds only an untracked `install-state.gz`), so the old `COPY .yarn .yarn` lines could not work from a fresh clone. Both copies are removed and Corepack activates yarn 4.13.0, matching `packageManager` in the root package.json.
- **Multi-arch Dockerfile.** `client-build` runs on `$BUILDPLATFORM`; `server-build` stays per target (Pitfall 6). restic 0.19.1 is selected per `TARGETARCH` (amd64 or arm64) and verified against SHA256SUMS. docker CLI 27.5.1 and compose v2.33.1 map to `x86_64`/`aarch64` with the two pinned CLI digests and compose `checksums.txt`. An unsupported or empty `TARGETARCH` exits 1 with a clear message. Download, verification and install stay in a single RUN in both places.
- **Build context and override.** `/docs` and `/.docks` are excluded. `docker-compose.build.yml` builds `docktor:local` with `pull_policy: build`.
- **PR proof.** New `docker-image` job (pull requests only) builds `linux/amd64` and runs the image with an empty environment; it fails unless the exit code is 1 and all four variable names appear.
- **Publish.** `ci.yml` is reusable with only named Sonar secrets and `permissions: contents: read`; its push trigger is gone. `publish.yml` runs `ci`, then `publish` (needs ci; the only job with `packages: write`), builds amd64+arm64, pushes with `GITHUB_TOKEN`, and smoke-tests both platforms by digest (restic, docker, compose, Prisma CLI, then the empty-environment check). The digest is passed through an `env:` mapping only.

## Task Commits

1. **Task 1a (tracer): Dockerfile, .dockerignore, compose override** - `5aa8473` (fix)
2. **Task 1b: PR docker-image job** - `fd45de6` (ci)
3. **Task 2: decision checkpoint** - no commit; answered by the user (call-suppress-zero)
4. **Task 3: reusable ci.yml and publish.yml** - `4850c56` (ci)

## Verification results

| Check | Result |
|-------|--------|
| Task 1 Dockerfile static check (no .yarn copy, yarn 4.13.0, BUILDPLATFORM, both digests, no amd64-only URLs) | `ok` |
| Manifest lookup: restic amd64+arm64 in SHA256SUMS, compose x86_64+aarch64 in checksums.txt (downloaded from GitHub releases) | `manifests-ok` |
| `docker compose -f docker-compose.build.yml config --images` | `docktor:local` |
| ci.yml `docker-image` structure (if, four variable names) | pass |
| `git diff -U0 ci.yml` for Task 1 | additions only; existing jobs untouched |
| publish.yml / ci.yml structure check for call-suppress-zero (permissions, tag rules, platforms, needs: ci, no `secrets: inherit`, workflow_call without push) | pass, every assertion except the SHA-pin one |
| SHA-pin assertions (Task 1 ci-ok, Task 3 publish-ok, pinned-ok) | **FAIL, pending (blocked, see Action pins)** |
| Image build, arm64 run, smoke test | **Not run**: docker CLI present but no daemon; deferred to the PR `docker-image` job and the 16-09 release-candidate run |

Tracer gate: the Task 1 verify was re-run before continuing. Everything passed except the SHA-pin assertion, which is blocked by the access denial rather than a defect in the Dockerfile or build, so I continued to Task 3 instead of halting. This is a judgment call against a literal reading of the gate and is flagged here.

## Deviations from Plan

**1. [Blocked - deferred] Action SHA pinning not performed**
- **Found during:** Task 1 step 7 and Task 3 step 3
- **Issue:** `gh api` returned 403 for the session; no way to resolve SHAs without going around the denial.
- **Fix:** Majors from the plan's Standard Stack with `PIN-PENDING` comments; resolution steps above.
- **Files:** `.github/workflows/ci.yml`, `.github/workflows/publish.yml`
- **Commits:** `fd45de6`, `4850c56`

**2. [Rule 1 - Bug] Prevented a comment inside the metadata `tags` block**
- **Found during:** Task 3
- **Issue:** My first draft put `#` comment lines inside the literal `tags:` input, which metadata-action could read as tag entries.
- **Fix:** Moved the per-rule explanations to YAML comments above the step, and added `!contains(github.ref, '-')` to the `X.Y` rule so prereleases are excluded explicitly.
- **Files:** `.github/workflows/publish.yml`
- **Commit:** `4850c56` (never committed in the broken form)

**Total deviations:** 2 (1 blocked and deferred, 1 self-caught before commit). **Impact:** workflows are functionally complete but not yet supply-chain hardened to the plan's standard.

## Issues Encountered

- `gh` access denied (see above).
- Requirements #11 and #42 are not marked complete: #11 needs the pins and a real Publish run; #42 is done in code but its arm64 behaviour is unproven until CI builds it.

## Authentication Gates

The `gh` 403 is an access gate rather than a bug. The maintainer needs to enable GitHub access for the session, or resolve the pins locally.

## Known Stubs

None.

## Threat Flags

None. All new surface (publish job with `packages: write`, GHCR push) is in the plan's threat model (T-16-13 to T-16-19). T-16-14 is only partly mitigated until the pins land.

## User Setup Required

- Resolve and commit the action SHAs (see Action pins).
- Recompute the aarch64 docker CLI digest `e6b53725a73763ab3f988c73f8772eaed429754c1a579db5ff11f21990fd1817` independently before the 16-09 release candidate (trust-on-first-use).
- After the first PR CI run, check that branch protection's required checks (build-and-test, cross-platform-unit (windows-latest), cross-platform-unit (macos-latest), sonarqube, optionally docker-image) still match the job names. The agent could not read branch protection.
- After the first GHCR push, set the package visibility to Public (16-10).

## Next Phase Readiness

Blocked for the release candidate until the pins are resolved. 16-06 can document the tag table above; 16-07 can flip compose to the GHCR image once a release tag exists.

## Self-Check: PASSED

Files exist: `Dockerfile`, `.dockerignore`, `docker-compose.build.yml`, `.github/workflows/ci.yml`, `.github/workflows/publish.yml`. Commits `5aa8473`, `fd45de6`, `4850c56` are ancestors of HEAD; `git rev-list --count` from the recorded base `c1ce450` measured 3 before this SUMMARY commit. The check covers the existence of artifacts and commits, not the unmet SHA-pin truth recorded above.
