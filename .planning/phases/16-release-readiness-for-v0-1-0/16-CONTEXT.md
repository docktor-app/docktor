# Phase 16: Release Readiness for v0.1.0 - Context

**Gathered:** 2026-10-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Docktor becomes safe and appealing to point strangers at for the first public release. Deliverables, in terms of the GitHub issues they close:

1. **Hardened startup (#7):** environment is validated before the server starts; blocking errors vs non-blocking warnings.
2. **Published images (#11):** images built and published to GHCR on `main` commits and release tags, gated on CI.
3. **Documentation (#17):** a separate VitePress docs site (new repo `docktor-app/docks`) with introduction, get-started, feature guides, security and deployment pages; the main-repo README becomes short and clean.
4. **README visuals (#54):** screenshots and a short GIF, recorded manually.
5. **Community health files (#55):** `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue and PR templates.
6. **License (#57):** MIT, `LICENSE` file added.
7. **Restic pin (#42):** **already satisfied** in `Dockerfile` (restic 0.19.1 via checksum-verified binary download, own build stage). Phase work is limited to verifying it still holds and making it arch-aware (see D-09); close the issue.

**Descoped from this phase:** the public hourly-reset demo instance (#53) — see D-03 and Deferred Ideas. Roadmap success criterion 5 is deferred accordingly.

</domain>

<decisions>
## Implementation Decisions

### License (#57)
- **D-01:** Docktor ships under **MIT**. `LICENSE` at repo root. — **Reversibility:** one-way — relicensing after the first public release needs consent from every contributor.
- **D-02:** Copyright line is **"Copyright (c) 2026 Docktor contributors"**. No CLA and no DCO sign-off; `CONTRIBUTING.md` states that contributions are accepted under the MIT license. (The CLA question in #57 is moot under MIT.)

### Demo instance (#53)
- **D-03:** **No live demo for v0.1.0.** Try-before-install is served by README screenshots and the GIF (#54) plus the docs-site walkthrough. #53 is deferred past v0.1.0 and stays open; the issue should be moved out of the v0.1.0 milestone. If a demo is revisited later, the mocked-Docker-backend approach (swap the infrastructure adapter via the existing Strategy seam, behind a demo flag) is the preferred direction, not exposing a real Docker daemon. — **Reversibility:** reversible — nothing ships that blocks adding it later.

### Image publishing (#11)
- **D-04:** Registry is **GHCR only**: `ghcr.io/docktor-app/docktor`. Auth via the workflow's `GITHUB_TOKEN`; no Docker Hub org or secrets.
- **D-05:** Tag scheme: a release tag `vX.Y.Z` publishes `X.Y.Z`, `X.Y`, `X` and **`latest`**. Every `main` commit publishes **`edge`** and `sha-<short>`. `latest` moves only on a deliberate release. — **Reversibility:** costly — published tag semantics become part of users' compose files.
- **D-06:** Publishing is a **separate workflow gated on CI success** (a broken commit is never published). It does not run in parallel with `ci.yml`.
- **D-07:** `docker-compose.yml` switches the `docktor` service from `build: context: .` to `image: ghcr.io/docktor-app/docktor:latest`. The README/docs keep a documented from-source build path for developers. `docker-compose.dev.yml` is unaffected.
- **D-08:** Images are **multi-arch: `linux/amd64` + `linux/arm64`**. The Dockerfile currently hardcodes `amd64` for restic, the docker CLI and the compose plugin; these must be parameterised per `TARGETARCH`, including the pinned `DOCKER_CLI_SHA256` (needs an arm64 digest) and the compose/restic checksum lookups. — **Reversibility:** reversible — can drop a platform later, though users on it would be stranded.
- **D-09:** The restic pin (#42) stays a pinned, checksum-verified download; only the architecture selection changes (see D-08). Version stays 0.19.1 unless research finds a newer current release.

### Startup environment validation (#7)
- **D-10:** **Blocking (abort, non-zero exit, formatted error listing every problem at once):** `DATABASE_URL` missing, `BETTER_AUTH_SECRET` missing, `BETTER_AUTH_URL` missing, `ENCRYPTION_KEY` missing or not exactly 64 hex characters. `ENCRYPTION_KEY` blocks (rather than warns) because backups, SMTP, and 2FA secrets depend on it and failing later at use time is worse.
- **D-11:** **Non-blocking warnings:** optional-variable misconfigurations such as `TRUST_PROXY` unset (rate-limit bucket sharing behind a proxy), `DOCKER_DATA_PATH` pointing at the container's own filesystem instead of the host mount, and similar. Exact warning list is Claude's discretion, driven by `.env.example` and `docs/deployment.md`.
- **D-12:** **Placeholder detection:** a `CHANGE_ME*` value for a secret or key logs a loud warning when `NODE_ENV=production` only. It does not block, and does nothing in dev/test.
- **D-13:** Implementation is **one Zod env schema** (server-side, run before Fastify/Prisma init) producing a single structured report of errors and warnings. Warnings are **logged at boot and also surfaced in the UI as a dismissible banner** so installs whose owners never read container logs still see them. The banner needs an API surface (extend the existing settings/health route rather than adding a new auth model) and a client hook; it follows Phase 11 UI rules (`ToneBadge`/`Section`, dark-mode counterparts). — **Reversibility:** reversible.

### Documentation (#17)
- **D-14:** End-user docs live in a **separate repo, `docktor-app/docks`**, as a **VitePress** site. The repo is currently empty (verified: no commits). The user hosts the built site themselves; static output must be easy to serve from any web server. Hosting/deploy automation is out of scope. — **Reversibility:** costly — URLs and the doc source of truth move out of this repo.
- **D-15:** Site content for v0.1.0: **Introduction** (purpose, who it's for), **Get started** (quickstart), **feature guides per area** (stacks and compose editing, templates, backups and restore, proxy and TLS, brownfield import, update checks, health and uptime, 2FA and account security), a **Security & Docker-socket page** (host-root-equivalent access, 2FA, rate limiting, reverse-proxy hardening — per #55's out-of-scope note, this is *not* `SECURITY.md`), and a refreshed **Deployment / environment reference**.
- **D-16:** Docs move out of this repo: `docs/deployment.md` and `docs/templates.md` are relocated to `docks` (re-verified against what phases 10–15 shipped, including image-pull compose, startup validation, 2FA reset procedure, arm64); this repo keeps short pointers where they were linked. `docs/design.md` (813 lines) is treated as **contributor/architecture material** and stays here, linked from `CONTRIBUTING.md`, after a check that it still matches the shipped design.
- **D-17:** The main-repo **README is clean and short**: what Docktor is, hero screenshot/GIF above the fold, a minimal quickstart (pull-based compose), links to the docs site and `CONTRIBUTING.md`. The workspace table and dev instructions move out to `CONTRIBUTING.md`.

### README visuals (#54)
- **D-18:** Screenshots and the GIF are **recorded manually** with the screen recorder **Recordly**, not produced by a Playwright capture script. Key views: dashboard, stack detail, backups. Light and dark are both welcome. Claude provides a **shot list / recording script** (see `16-RECORDING-SCRIPT.md` in this phase directory) and the sample-data setup needed so the recording looks realistic. Assets are stored in the main repo (e.g. `docs/assets/`) so the README works without the docs site.

### Community health files (#55)
- **D-19:** `SECURITY.md` points to **GitHub private vulnerability reporting** (must be enabled on the repo — a manual step for the maintainer) with the maintainer's email as fallback. `CODE_OF_CONDUCT.md` is **Contributor Covenant 2.1** with the same contact. Issue forms for bug reports and feature requests, plus a PR template mirroring CLAUDE.md's conventions (commit format, tests, `tsc --build`). `CONTRIBUTING.md` covers dev environment setup (moved from README), the test commands, and PR flow.

### Claude's Discretion
- Exact warning list and wording for D-11; severity naming in the report.
- Release workflow mechanics (trigger on `release: published` vs tag push, `docker/metadata-action` usage, build cache), provided D-04–D-08 hold.
- VitePress theme/nav structure and page granularity within D-15.
- Issue-form field layouts and PR template wording.
- Whether the UI banner for env warnings lives on the dashboard or in the app shell, as long as it is visible without navigating to Settings.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap and issues
- `.planning/ROADMAP.md` §Phase 16 — goal and success criteria (criterion 5 deferred per D-03)
- GitHub issues `docktor-app/docktor` #7, #11, #17, #42, #53, #54, #55, #57 — acceptance criteria per item

### Existing docs to migrate or verify
- `docs/deployment.md` — deployment guide and env var reference; moves to `docks` (D-16)
- `docs/templates.md` — template docs; moves to `docks` (D-16)
- `docs/design.md` — architecture notes; stays here as contributor material (D-16)
- `README.md` — to be shortened (D-17)
- `.env.example` — authoritative list of env vars, required/optional, and `CHANGE_ME` placeholders (D-10–D-12)

### Build and release
- `Dockerfile` — restic/docker CLI/compose pinned downloads with checksums; hardcoded amd64 to parameterise (D-08, D-09)
- `docker-compose.yml` — switches to `image:` (D-07)
- `.github/workflows/ci.yml` — existing CI the publish workflow gates on (D-06)

### Prior phase decisions
- `.planning/phases/15-access-hardening/15-CONTEXT.md` — 2FA, `TRUST_PROXY`, rate limiting; the docs security page and env warnings (D-11) must reflect these

### Project conventions
- `CLAUDE.md` — layering rules, Zod-in-shared rule, UI rules (ToneBadge, Section, dark mode), commit format

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/src/lib/crypto.ts`: `ENCRYPTION_KEY` read lazily on first encrypt/decrypt, throwing a plain `Error`. Startup validation should replace the lazy failure's role without breaking its tests.
- `server/src/lib/auth-config.ts` / `server/src/lib/auth.ts`: read `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` straight from `process.env` (the missing-secret failure is an obscure `BetterAuthError`).
- `server/src/lib/db-pool-config.ts`, `stacks-dir.ts`: existing env-derived config with their own startup assertions — validate consistently with them.
- `server/src/index.ts` / `app.ts`: startup path and the `createApp` factory; the env check runs before app construction.
- `shared/src/validation/`: where any Zod schema shared with the client (e.g. the env-warning report shape) must live.

### Established Patterns
- Errors thrown from the typed hierarchy in `lib/errors.ts`; infrastructure errors wrapped with `cause`.
- Settings/health status reaches the UI via hooks (single source of truth) and, where live, SSE; avoid polling REST for live state.
- Dockerfile uses per-tool checksum-verified downloads in single RUN layers; keep that property when adding per-arch selection.

### Integration Points
- New publish workflow depends on `ci.yml` (`workflow_run` or reusable-workflow call).
- Env-warning banner connects the server health/settings route to a client hook and the app shell.
- Docs-site content must be sourced from the shipped feature set of phases 1–15.

</code_context>

<specifics>
## Specific Ideas

- The recording tool is **Recordly**; shot list lives in `16-RECORDING-SCRIPT.md`.
- Docs site built with **VitePress**, in the new repo `docktor-app/docks`, self-hosted by the maintainer.
- README should be "clean and short" — the user was explicit about this.
- Planning note: this session had read-only access to `docks`. Work that lands there (scaffold, pages) needs the repo attached with push access, or must be done by the maintainer.

</specifics>

<deferred>
## Deferred Ideas

- **Public hourly-reset demo instance (#53)** — deferred past v0.1.0; prefer a mocked-Docker demo mode when revisited. Move the issue out of the v0.1.0 milestone.
- **Docs-site deploy automation / hosting** — maintainer self-hosts; no CI deploy built in this phase.
- **Docker Hub mirror** — GHCR only for now; add if users ask.
- **Playwright-scripted screenshot capture** — rejected for v0.1.0 in favour of manual recording; revisit if images go stale.
- **CLA/DCO** — not needed under MIT.

</deferred>

---

*Phase: 16-release-readiness-for-v0-1-0*
*Context gathered: 2026-10-11*
