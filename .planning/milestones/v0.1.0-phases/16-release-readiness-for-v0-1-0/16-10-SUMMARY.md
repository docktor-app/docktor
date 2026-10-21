---
phase: 16-release-readiness-for-v0-1-0
plan: 10
subsystem: release
tags: [ghcr, compose, contributing, release-procedure, issue-housekeeping]

requires:
  - phase: 16-release-readiness-for-v0-1-0
    provides: "16-09 release candidate v0.1.0-rc.2 in GHCR"
provides:
  - "Public ghcr.io/docktor-app/docktor package (maintainer action)"
  - "docker-compose.yml pulling ghcr.io/docktor-app/docktor:latest"
  - "CONTRIBUTING.md: Building the image from source, Releasing"

requirements-completed: ["#11", "#53", "#42", "#55"]
---

# Plan 16-10: Public image, compose flip, release docs — Summary

## Results

- **Package public** (maintainer action). Anonymous check: token endpoint returns a token; tags list is `0.1.0-rc.1`, `0.1.0-rc.2`; the `0.1.0-rc.2` index lists linux/amd64 and linux/arm64.
- **Compose flip** (`aca396f`): the docktor service uses `image: ghcr.io/docktor-app/docktor:latest`, build section removed; only the image/build lines and the header comment changed. `docker-compose.build.yml` is unchanged (`docktor:local`, `pull_policy: build`). Structure check printed `compose-ok`.
- **Release docs** (`0156229`): CONTRIBUTING gains "Building the image from source" and "Releasing" (tag table from 16-04, rc-first procedure, never move or delete a published tag). README already pins the quickstart to `v0.1.0`, so no ref bump was needed yet.
- **GitHub housekeeping:** #53 removed from the v0.1.0 milestone, still open, deferral comment posted. #42 closing note posted. Private vulnerability reporting reads back `enabled: true`.
- **Old doc paths:** no tracked file outside `.planning` references `docs/deployment.md` or `docs/templates.md`.
- **`.env.production`:** maintainer stated it holds no secrets; decision **keep** (still tracked).

## Known gap until release day

Only the rc tags exist in GHCR, so `latest` does not exist yet and `docker compose up` from this compose file fails to pull until `v0.1.0` is tagged. Do not advertise the quickstart before the release tag.

## Closes list for the phase PR

Closes #7, #11, #17, #42, #54, #55, #57 (not #53).

## Human check on release day

1. After the phase PR merges, the Publish run on `main` is green and the registry lists `edge` and `sha-<short>`.
2. Tag `v0.1.0` on `main`; its run adds `0.1.0`, `0.1` and `latest` (no `0`).
3. On a clean amd64 host (and arm64 if available) follow the README quickstart: `docker compose up -d` pulls the image and the setup wizard loads at `BETTER_AUTH_URL`.
