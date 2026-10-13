---
phase: 16-release-readiness-for-v0-1-0
plan: 09
subsystem: release
tags: [ghcr, publish-workflow, release-candidate, multi-arch, smoke-test]

requires:
  - phase: 16-release-readiness-for-v0-1-0
    provides: "16-04 publish workflow and Dockerfile, 16-01/03/05/07 phase code"
provides:
  - "ghcr.io/docktor-app/docktor:0.1.0-rc.2 (linux/amd64 + linux/arm64 index), pushed from a tag by the Publish workflow"
  - "Proof that CI gate, clean-checkout multi-arch build, GHCR push and per-platform smoke test work end to end"
affects: [16-10 public image, compose flip, release procedure docs]

requirements-completed: ["#11", "#42"]
---

# Plan 16-09: Release-candidate dry run — Summary

The release pipeline is proven from a tag. `v0.1.0-rc.2` ran the Publish workflow green: the reusable CI job, the multi-arch build, the GHCR push and the post-push smoke test on both platforms. Exactly one tag was published.

## Maintainer prerequisite answers (Task 1)

| Prerequisite | Answer |
|--------------|--------|
| Private vulnerability reporting | Enabled (`gh api repos/docktor-app/docktor/private-vulnerability-reporting` returned `{"enabled":true}`) |
| aarch64 docker CLI digest | Recomputed from a fresh download of `docker-27.5.1.tgz`; equals `e6b53725a73763ab3f988c73f8772eaed429754c1a579db5ff11f21990fd1817` |
| Tracked production env file | Maintainer states it holds no secrets. Decision recorded as **keep**; 16-10 may still untrack it if the maintainer asks |
| Publish approval | Given by the maintainer for rc.1, with fix-forward to rc.2+ under the same approval |

## Attempts

| Tag | Run | Result |
|-----|-----|--------|
| `v0.1.0-rc.1` | 38430261417 | Failure at the smoke step. CI jobs and the push succeeded; amd64 smoke passed; the arm64 pull of the same index digest failed with `docker: cannot overwrite digest` (classic image store). Image `0.1.0-rc.1` exists in GHCR and is never moved or deleted. |
| `v0.1.0-rc.2` | 38434083001 | Success. |

Fix between attempts: `2bd4c40 fix(ci): remove the pulled image between smoke-test platforms` (`docker image rm "${IMAGE}@${DIGEST}"` at the end of each platform iteration in `.github/workflows/publish.yml`).

## rc.2 result

- Jobs: `ci / build-and-test`, `ci / cross-platform-unit` (windows, macos), `ci / sonarqube`, `publish` all success; `ci / docker-image` skipped (PR-only).
- Published tag list: `ghcr.io/docktor-app/docktor:0.1.0-rc.2` only. No `latest`, `edge`, `0.1` or `0` (RESEARCH Assumption A6 verified).
- Index digest (smoke-tested): `sha256:5a73af0eee58c8769b6a4a91f046aca50379937af2091dbfebcd2398af3de63b`.
- Smoke, both `linux/amd64` and `linux/arm64`: restic 0.19.1, Docker 27.5.1, Compose v2.33.1, Prisma 7.4.0; an empty environment exits 1 with a report that names `ENCRYPTION_KEY` (#7). The arm64 restic build confirms the arch-aware pin (#42).

## Follow-ups for 16-10

- The package `ghcr.io/docktor-app/docktor` is still private; making it public is a 16-10 step.
- `0.1.0-rc.1` stays in the registry as a published-but-failed-smoke version; note it in the release procedure.
