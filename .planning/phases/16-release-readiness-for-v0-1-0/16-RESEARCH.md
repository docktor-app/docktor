# Phase 16: Release Readiness for v0.1.0 - Research

**Researched:** 2026-10-11
**Domain:** Release engineering for a self-hosted Fastify/React/Docker app: startup env validation, multi-arch GHCR publishing, VitePress docs site, OSS community files, README assets
**Confidence:** HIGH on repo-grounded findings and pinned-binary checksums; MEDIUM on GitHub Actions mechanics (action majors read from READMEs, workflow not executable in this session)

## User Constraints (from CONTEXT.md)

### Locked Decisions

**License (#57)**
- **D-01:** Docktor ships under **MIT**. `LICENSE` at repo root. — **Reversibility:** one-way — relicensing after the first public release needs consent from every contributor.
- **D-02:** Copyright line is **"Copyright (c) 2026 Docktor contributors"**. No CLA and no DCO sign-off; `CONTRIBUTING.md` states that contributions are accepted under the MIT license. (The CLA question in #57 is moot under MIT.)

**Demo instance (#53)**
- **D-03:** **No live demo for v0.1.0.** Try-before-install is served by README screenshots and the GIF (#54) plus the docs-site walkthrough. #53 is deferred past v0.1.0 and stays open; the issue should be moved out of the v0.1.0 milestone. If a demo is revisited later, the mocked-Docker-backend approach (swap the infrastructure adapter via the existing Strategy seam, behind a demo flag) is the preferred direction, not exposing a real Docker daemon. — **Reversibility:** reversible — nothing ships that blocks adding it later.

**Image publishing (#11)**
- **D-04:** Registry is **GHCR only**: `ghcr.io/docktor-app/docktor`. Auth via the workflow's `GITHUB_TOKEN`; no Docker Hub org or secrets.
- **D-05:** Tag scheme: a release tag `vX.Y.Z` publishes `X.Y.Z`, `X.Y`, `X` and **`latest`**. Every `main` commit publishes **`edge`** and `sha-<short>`. `latest` moves only on a deliberate release. — **Reversibility:** costly — published tag semantics become part of users' compose files.
- **D-06:** Publishing is a **separate workflow gated on CI success** (a broken commit is never published). It does not run in parallel with `ci.yml`.
- **D-07:** `docker-compose.yml` switches the `docktor` service from `build: context: .` to `image: ghcr.io/docktor-app/docktor:latest`. The README/docs keep a documented from-source build path for developers. `docker-compose.dev.yml` is unaffected.
- **D-08:** Images are **multi-arch: `linux/amd64` + `linux/arm64`**. The Dockerfile currently hardcodes `amd64` for restic, the docker CLI and the compose plugin; these must be parameterised per `TARGETARCH`, including the pinned `DOCKER_CLI_SHA256` (needs an arm64 digest) and the compose/restic checksum lookups. — **Reversibility:** reversible — can drop a platform later, though users on it would be stranded.
- **D-09:** The restic pin (#42) stays a pinned, checksum-verified download; only the architecture selection changes (see D-08). Version stays 0.19.1 unless research finds a newer current release.

**Startup environment validation (#7)**
- **D-10:** **Blocking (abort, non-zero exit, formatted error listing every problem at once):** `DATABASE_URL` missing, `BETTER_AUTH_SECRET` missing, `BETTER_AUTH_URL` missing, `ENCRYPTION_KEY` missing or not exactly 64 hex characters. `ENCRYPTION_KEY` blocks (rather than warns) because backups, SMTP, and 2FA secrets depend on it and failing later at use time is worse.
- **D-11:** **Non-blocking warnings:** optional-variable misconfigurations such as `TRUST_PROXY` unset (rate-limit bucket sharing behind a proxy), `DOCKER_DATA_PATH` pointing at the container's own filesystem instead of the host mount, and similar. Exact warning list is Claude's discretion, driven by `.env.example` and `docs/deployment.md`.
- **D-12:** **Placeholder detection:** a `CHANGE_ME*` value for a secret or key logs a loud warning when `NODE_ENV=production` only. It does not block, and does nothing in dev/test.
- **D-13:** Implementation is **one Zod env schema** (server-side, run before Fastify/Prisma init) producing a single structured report of errors and warnings. Warnings are **logged at boot and also surfaced in the UI as a dismissible banner** so installs whose owners never read container logs still see them. The banner needs an API surface (extend the existing settings/health route rather than adding a new auth model) and a client hook; it follows Phase 11 UI rules (`ToneBadge`/`Section`, dark-mode counterparts). — **Reversibility:** reversible.

**Documentation (#17)**
- **D-14:** End-user docs live in a **separate repo, `docktor-app/docks`**, as a **VitePress** site. The repo is currently empty (verified: no commits). The user hosts the built site themselves; static output must be easy to serve from any web server. Hosting/deploy automation is out of scope. — **Reversibility:** costly — URLs and the doc source of truth move out of this repo.
- **D-15:** Site content for v0.1.0: **Introduction** (purpose, who it's for), **Get started** (quickstart), **feature guides per area** (stacks and compose editing, templates, backups and restore, proxy and TLS, brownfield import, update checks, health and uptime, 2FA and account security), a **Security & Docker-socket page** (host-root-equivalent access, 2FA, rate limiting, reverse-proxy hardening — per #55's out-of-scope note, this is *not* `SECURITY.md`), and a refreshed **Deployment / environment reference**.
- **D-16:** Docs move out of this repo: `docs/deployment.md` and `docs/templates.md` are relocated to `docks` (re-verified against what phases 10–15 shipped, including image-pull compose, startup validation, 2FA reset procedure, arm64); this repo keeps short pointers where they were linked. `docs/design.md` (813 lines) is treated as **contributor/architecture material** and stays here, linked from `CONTRIBUTING.md`, after a check that it still matches the shipped design.
- **D-17:** The main-repo **README is clean and short**: what Docktor is, hero screenshot/GIF above the fold, a minimal quickstart (pull-based compose), links to the docs site and `CONTRIBUTING.md`. The workspace table and dev instructions move out to `CONTRIBUTING.md`.

**README visuals (#54)**
- **D-18:** Screenshots and the GIF are **recorded manually** with the screen recorder **Recordly**, not produced by a Playwright capture script. Key views: dashboard, stack detail, backups. Light and dark are both welcome. Claude provides a **shot list / recording script** (see `16-RECORDING-SCRIPT.md` in this phase directory) and the sample-data setup needed so the recording looks realistic. Assets are stored in the main repo (e.g. `docs/assets/`) so the README works without the docs site.

**Community health files (#55)**
- **D-19:** `SECURITY.md` points to **GitHub private vulnerability reporting** (must be enabled on the repo — a manual step for the maintainer) with the maintainer's email as fallback. `CODE_OF_CONDUCT.md` is **Contributor Covenant 2.1** with the same contact. Issue forms for bug reports and feature requests, plus a PR template mirroring CLAUDE.md's conventions (commit format, tests, `tsc --build`). `CONTRIBUTING.md` covers dev environment setup (moved from README), the test commands, and PR flow.

### Claude's Discretion
- Exact warning list and wording for D-11; severity naming in the report.
- Release workflow mechanics (trigger on `release: published` vs tag push, `docker/metadata-action` usage, build cache), provided D-04–D-08 hold.
- VitePress theme/nav structure and page granularity within D-15.
- Issue-form field layouts and PR template wording.
- Whether the UI banner for env warnings lives on the dashboard or in the app shell, as long as it is visible without navigating to Settings.

### Deferred Ideas (OUT OF SCOPE)
- **Public hourly-reset demo instance (#53)** — deferred past v0.1.0; prefer a mocked-Docker demo mode when revisited. Move the issue out of the v0.1.0 milestone.
- **Docs-site deploy automation / hosting** — maintainer self-hosts; no CI deploy built in this phase.
- **Docker Hub mirror** — GHCR only for now; add if users ask.
- **Playwright-scripted screenshot capture** — rejected for v0.1.0 in favour of manual recording; revisit if images go stale.
- **CLA/DCO** — not needed under MIT.

## Project Constraints (from CLAUDE.md)

Treated with the same authority as locked decisions. Directives that bite this phase:

- **Layering (server):** routes only call application services; services never import HTTP types; domain is pure; Prisma only in repositories; DI via constructor parameters. The env report endpoint therefore needs an application service, not a route reading `process.env`.
- **Zod lives in `@docktor/shared`** for anything crossing client/server (the env-warning DTO). Add to `shared/src/validation/` and re-export; do not duplicate.
- **Typed errors only** in business code; HTTP status codes only in `lib/errors.ts` and `app.ts`. (Startup abort is not an HTTP path; it logs and calls `process.exit(1)`, matching `server/src/index.ts`.)
- **TDD + both happy and error paths**; server unit tests mock deps, server integration tests hit a real DB (no mocked DB); client hooks tested with mocked `fetch`/API clients; components via `@testing-library/react` by role/label.
- **Strict TS, no `any`, no unchecked casts**, `Readonly<Props>`, explicit return types on exported functions, `*.test.ts` naming, kebab-case files.
- **Imports:** server relative with `.js` extension; client `@/*` alias; group external / workspace / local.
- **Client rules:** hooks are the single source of server state; domain components do not fetch directly; pills via `ToneBadge` + `StatusDot`; `Section` over `Card`; every light-only color utility needs a `dark:` counterpart; do not edit `components/ui/`.
- **Playwright:** `PLAYWRIGHT_PORT` env var for port collisions; runs inside the `_apiRouteGuard` fixture (see Pitfall 4).
- **Commits:** `type(scope): description`; run `tsc --build` before every commit; one logical change per commit; no barrel files for a single module.
- **Issue tracking:** product work in GitHub Issues; each `.planning/phases/*/PLAN.md` references the issue(s) it implements at the top; PRs close with `Closes #<n>`. New issues use native Issue Types (Bug/Feature/Chore/Documentation/Task), not `[BUG]` title prefixes or `type:*` labels.
- **Known refactor targets** (settings cards without react-hook-form) are not in this phase's scope; do not touch unless the banner work edits those files (it should not).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| #7 | Check environment variables before startup; errors (blocking) vs warnings | Zod env schema + injectable bootstrap run **before** `app.js` is imported (Pitfall 1); report DTO in shared; `GET /api/settings/environment`; banner in `AppLayout`; Playwright default stub (Pitfall 4) |
| #11 | Build and publish images on release tags and `main` commits | `publish.yml` calling reusable `ci.yml`, metadata-action tag matrix, QEMU multi-arch, GHCR visibility step, `.yarn` COPY blocker (Pitfall 2) |
| #17 | Documentation: purpose, features, setup, usage | New `docks` VitePress repo (1.6.4), content inventory from phases 1-15, drift list for `deployment.md`/`design.md` |
| #42 | Pin restic via explicit binary download | Already satisfied; verified 0.19.1 is still current and arm64 asset + checksum exist; only arch parameterisation remains |
| #53 | Public demo | DEFERRED (D-03). Only action: move issue out of milestone, keep open |
| #54 | README screenshots + GIF | Manual recording; script corrections found (Pitfall 9); asset size/`.dockerignore` handling |
| #55 | CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR templates | Contributor Covenant 2.1 source verified; PVR currently disabled (manual step); issue-form layout |
| #57 | License decided + LICENSE | MIT text (SPDX) verified; copyright line per D-02; `license` field in package.json files |
</phase_requirements>

## Summary

The phase is mostly assembly work around five real engineering items, and research turned up **three blockers the context did not know about**. First, the Dockerfile has `COPY .yarn .yarn` (lines 5 and 18) but no `.yarn` directory is tracked (`.gitignore` ignores `.yarn/*`, `git ls-files .yarn` is empty, and the directory is absent from a fresh checkout), so a clean-checkout `docker build` is expected to fail at that line, which would break both the CI publish job and the README's from-source path. Second, `server/src/index.ts` statically imports `./app.js`, whose import graph evaluates `lib/auth.ts` (reading `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` at module-evaluation time) before any code in `index.ts` runs — so an env check written in `index.ts`'s body is too late; it must run before that import (dynamic `import()`). Third, `ci.yml` has no tag trigger and the Playwright `_apiRouteGuard` aborts any unstubbed `/api/**` call, so (a) a `workflow_run`-gated publish never fires for release tags and (b) a banner fetch mounted in `AppLayout` fails every Playwright spec unless a default stub is added to `fixtures.ts`.

For multi-arch, restic 0.19.1 remains the current stable release and its arm64 asset and checksum exist; the docker CLI aarch64 tarball digest and the compose aarch64 checksum were computed this session and are given below. Because `node_modules` is copied from the server-build stage into the final image and the runtime runs the Prisma CLI (`schema-sync.ts`), the server-build stage must run per target platform (QEMU or native arm64 runner); only the client build (static output) can be pinned to `$BUILDPLATFORM`.

For the publish pipeline, recommend a **single `publish.yml` that calls `ci.yml` as a reusable workflow (`workflow_call`) and then builds/pushes**, which satisfies D-06 (sequential, never publishes a failing commit), makes `docker/metadata-action` see the real tag ref, and is testable from a branch. `workflow_run` is the alternative but carries tag/ref complications (Open Question 1). Everything user-visible that points at the docs site needs one decided docs URL (Open Question 2).

**Primary recommendation:** Do the Dockerfile fixes (`.yarn`, per-arch downloads) first and prove them with a local/CI `buildx --platform linux/amd64,linux/arm64` build; build the env validator as a pure, injectable module invoked before a dynamic `import("./app.js")`; publish via `publish.yml` -> reusable `ci.yml` -> QEMU multi-arch `build-push-action`; ship `v0.1.0-rc.1` first as a dry run; and keep all maintainer-only steps (enable PVR, make the GHCR package public, move #53 out of the milestone, close #42) in an explicit checklist plan.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Env validation + abort | API / Backend (process bootstrap, `index.ts`) | — | Must run before any module that reads env at import time; no HTTP involved |
| Env report storage + `GET /api/settings/environment` | API / Backend (application service + route) | — | Routes may only call services; endpoint behind `requireAuth` so config details are not public |
| Warning banner + dismissal | Browser / Client (hook + domain component in `AppLayout`) | — | Visible app-wide without visiting Settings; dismissal is per-browser UI state |
| Image build/publish | CI (GitHub Actions) | Registry (GHCR) | Runs after CI success; `GITHUB_TOKEN` auth only |
| Per-arch tool downloads | Build (Dockerfile) | — | Checksum-verified downloads stay in single RUN layers |
| Compose-pull deployment | Deployment config (`docker-compose.yml`) | Registry | Pull from GHCR; build-from-source via override file |
| End-user docs site | Separate repo `docks` (static build) | CDN/Static (maintainer's web server) | Static output, no server logic |
| README/CONTRIBUTING/community files | Repo root + `.github/` | — | Plain files; GitHub renders templates/forms |
| Screenshots/GIF | Repo assets (`docs/assets/`) | — | Must work without the docs site |

## Standard Stack

### Core

| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| zod | `^4.3.6` (already in `server/package.json`) | Env schema + report DTO | Already the project standard `[VERIFIED: server/package.json dependencies: "zod": "^4.3.6"]`; no new dependency for #7 |
| vitepress | `1.6.4` (npm `latest`) | `docks` docs site | Locked by D-14. `latest` dist-tag is 1.6.4; `next` is `2.0.0-alpha.20` — do **not** use alpha `[VERIFIED: npm view vitepress dist-tags]`. Requires Node >= 18 `[CITED: raw.githubusercontent.com/vuejs/vitepress/v1.6.4/docs/en/guide/getting-started.md line 11]` |
| docker/build-push-action | `@v7` | Build + push | README usage examples reference v7 `[CITED: github.com/docker/build-push-action README]` |
| docker/login-action | `@v4` | GHCR login with `GITHUB_TOKEN` | `[CITED: github.com/docker/build-push-action README]` |
| docker/setup-buildx-action | `@v4` | Buildx | `[CITED: same]` |
| docker/setup-qemu-action | `@v4` | arm64 emulation | `[CITED: same]` |
| docker/metadata-action | `@v6` | Tags + OCI labels | README examples use v6 `[CITED: github.com/docker/metadata-action]` |
| actions/checkout | `@v4` | Checkout | Already used in `ci.yml` `[VERIFIED: .github/workflows/ci.yml:18 "uses: actions/checkout@v4"]` |

### Supporting

| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| restic | 0.19.1 | Backups | Keep. Latest stable as of 2026-07-05, previous 0.19.0 (2026-06-09) `[CITED: github.com/restic/restic/releases]` |
| docker static CLI | 27.5.1 | Docker CLI in image | Keep pinned (out of scope to bump) `[VERIFIED: Dockerfile:85 "DOCKER_VERSION=27.5.1;"]` |
| docker compose plugin | v2.33.1 | Compose in image | Keep pinned `[VERIFIED: Dockerfile:87 "COMPOSE_VERSION=2.33.1;"]` |
| Contributor Covenant | 2.1 | `CODE_OF_CONDUCT.md` | Source text fetched from `EthicalSource/contributor_covenant` (89 lines, has Hugo `+++` front matter and `[INSERT CONTACT METHOD]` placeholder to replace) `[VERIFIED: raw.githubusercontent.com/EthicalSource/contributor_covenant/release/content/version/2/1/code_of_conduct.md]` |
| MIT license text | SPDX `MIT` | `LICENSE` | `[VERIFIED: raw.githubusercontent.com/spdx/license-list-data/main/text/MIT.txt]` begins "MIT License / Copyright (c) <year> <copyright holders>" |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| QEMU multi-arch in one job | Native arm64 runner per platform + `docker buildx imagetools create` manifest merge | Faster (no emulation) but more YAML. ARM runners (`ubuntu-24.04-arm`) are free and GA for public repos `[CITED: github.blog/changelog/2025-08-07-arm64-hosted-runners-for-public-repositories-are-now-generally-available]`; repo is public `[VERIFIED: gh api repos/docktor-app/docktor -> "private":false]`. Start with QEMU; switch if the arm64 leg exceeds ~25 min |
| `publish.yml` -> reusable `ci.yml` | `workflow_run` on CI | See Open Question 1 / Pitfall 3 |
| Tag push trigger | `release: published` trigger | Issue #11 says "a release is published with release tag". A human-created Release creates the tag (tag-push fires too). Tag push is simpler and works for `git push --tags` releases; recommend tag push `v*` |

**Installation (docks repo only; main repo adds no npm packages):**
```bash
# in docktor-app/docks
npm init -y && npm install -D vitepress@1.6.4
```

**Version verification:** `npm view vitepress version` -> `1.6.4` (dist-tags `{ latest: '1.6.4', next: '2.0.0-alpha.20' }`, modified 2026-09-04) `[VERIFIED: npm registry]`.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| vitepress | npm | long-lived (1.6.4 current; maintainers include yyx990803, posva, antfu) | unknown (seam could not fetch download counts) | github.com/vuejs/vitepress | [SUS] reason `unknown-downloads` only; no postinstall (`postinstall: null`) | Flagged — planner must add `checkpoint:human-verify` before install. In practice this is the official Vue-team package; the SUS verdict is an artefact of the download-count lookup failing |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** vitepress (planner inserts `checkpoint:human-verify` before install in the `docks` repo)

No other npm packages are introduced. GitHub Actions (`docker/*`, `actions/*`) are not npm packages; their majors are `[CITED]` from the upstream READMEs and should be re-confirmed against each action's Releases page when writing the workflow.

## Architecture Patterns

### System Architecture Diagram

```
 STARTUP (server/src/index.ts)
 process.env ──► runStartupEnvironmentCheck(env, isContainerized)
                   │  Zod schema: required vars ──► errors[]
                   │  evaluators:  optional vars ──► warnings[]
                   │  NODE_ENV=production + CHANGE_ME* ──► warnings[]
                   ├─ errors.length > 0 ──► print ONE formatted block (all problems) ──► exit(1)
                   └─ else ──► log warnings (console.warn) ──► setEnvironmentReport(report)
                                  │
                                  ▼
                   assertStacksDir* ─► syncDatabaseSchema ─► await import("./app.js") ─► buildApp ─► listen
                                                              (auth.ts evaluates HERE, after the check)

 RUNTIME (UI)
 Browser AppLayout ──► useEnvironmentWarnings() ──GET /api/settings/environment (requireAuth)──►
        routes/settings.ts ─► environmentStatusService.getReport() ─► lib/environment-report store
        ◄── {warnings:[{code,variable,message}]}
        ▼
   EnvironmentWarningsBanner (Alert + ToneBadge, dark: variants)
   dismissed codes persisted in localStorage; new/changed codes reappear

 RELEASE
 push main / tag v* ─► publish.yml
        job ci:      uses ./.github/workflows/ci.yml (secrets: inherit)
        job publish: needs ci ─► checkout ─► QEMU ─► buildx ─► login ghcr (GITHUB_TOKEN)
                       ─► metadata (edge+sha-* on main | X.Y.Z, X.Y, [X], latest on tag)
                       ─► build-push linux/amd64,linux/arm64 (gha cache)
                       ─► (optional) smoke: run image with empty env, expect exit 1 + "ENCRYPTION_KEY"
 user: docker compose up -d ─► pulls ghcr.io/docktor-app/docktor:latest

 DOCS
 docks repo (VitePress) ─► `vitepress build` (fails on dead links) ─► .vitepress/dist ─► maintainer's web server
```

### Recommended Project Structure

```
docktor/                                   (this repo)
├── LICENSE  CONTRIBUTING.md  CODE_OF_CONDUCT.md  SECURITY.md  README.md
├── .github/
│   ├── workflows/{ci.yml (add workflow_call), publish.yml}
│   ├── ISSUE_TEMPLATE/{bug_report.yml, feature_request.yml, config.yml}
│   └── PULL_REQUEST_TEMPLATE.md
├── docs/{design.md, assets/*.png *.gif}   (deployment.md/templates.md replaced by pointers)
├── docker-compose.yml                     (image: ghcr.io/...)
├── docker-compose.build.yml               (from-source override: build: context: .)
├── shared/src/validation/environment.ts   (report DTO schema)
└── server/src/
    ├── lib/environment-check.ts           (pure: schema + evaluators + formatter)
    ├── lib/startup-environment.ts         (injectable: {env, containerized, log, exit})
    ├── lib/environment-report.ts          (module store: set/get report)
    └── application/environment-status-service.ts
client/src/
    ├── lib/environment-api.ts   hooks/use-environment-warnings.ts
    └── components/domain/environment/environment-warnings-banner.tsx
docktor-app/docks/                         (separate repo)
├── package.json  .vitepress/config.mts  index.md
├── guide/{introduction,get-started}.md
├── features/{stacks,templates,backups,proxy,import,updates,health,account-security}.md
├── security.md  deployment.md
└── .github/workflows/build.yml (build on PR; no deploy)
```

### Pattern 1: Injectable bootstrap (matches `installShutdownHandlers`)

**What:** `runStartupEnvironmentCheck({env, containerized, log, exit})` returns the report or calls `exit(1)`. Same dependency-injection shape as the existing `installShutdownHandlers({steps, hardDeadlineMs, exit, log})` call in `index.ts` `[VERIFIED: server/src/index.ts:84-92]`, so it is unit-testable without `process.exit`.
**When to use:** the only entry point `index.ts` calls.

### Pattern 2: Dynamic import after validation

**What:** keep validation as the first executable statement, then load the app lazily.
**Why:** `index.ts` line 1 is `import {buildApp} from "./app.js";` `[VERIFIED: server/src/index.ts:1]`, `app.ts` line 25 is `import {resolveTrustedOrigins} from "./lib/auth.js";` `[VERIFIED: server/src/app.ts:25]`, and `auth.ts` lines 79-80 read `secret: process.env.BETTER_AUTH_SECRET,` / `baseURL: process.env.BETTER_AUTH_URL,` inside the module-level `betterAuth({...})` call `[VERIFIED: server/src/lib/auth.ts:74-80]`. Static imports are evaluated before the importing module's body, so the check must precede the import.

```typescript
// server/src/index.ts (shape; top-level await is already used in this file)
import {isContainerized} from "./lib/stacks-dir.js";           // no env reads at import time
import {runStartupEnvironmentCheck} from "./lib/startup-environment.js";
import {setEnvironmentReport} from "./lib/environment-report.js";

const report = runStartupEnvironmentCheck({
    env: process.env,
    containerized: await isContainerized(),
    log: console,
    exit: (code) => process.exit(code),
});
setEnvironmentReport(report);

// ... existing stacks-dir + schema-sync steps unchanged ...

const {buildApp} = await import("./app.js");   // auth.ts evaluates here, after validation
```
Also move `healthProbeJob`/`installShutdownHandlers` imports only if the planner finds they reach `auth.ts` (the `health-probe-job.ts` import list shown in this session contains ports/domain/infrastructure/lib only, so they appear safe `[VERIFIED: server/src/jobs/health-probe-job.ts:1-12]`; `lib/auth.js` is imported only by `onboarding-service.ts`, `app.ts`, `auth-middleware.ts`, `routes/auth.ts` `[VERIFIED: grep]`).

### Pattern 3: Zod schema as the single source for blocking errors

Zod collects every failing field in one `safeParse`, which gives "all problems at once" for free. Treat empty-string env values as missing (compose `env_file` makes `VAR=` an empty string).

```typescript
// server/src/lib/environment-check.ts  (illustrative; typecheck against zod 4 before relying on exact API names)
import {z} from "zod";

const HEX_64 = /^[0-9a-fA-F]{64}$/;
const blankToUndefined = (v: unknown): unknown => (typeof v === "string" && v.trim() === "" ? undefined : v);
const required = (message: string) => z.preprocess(blankToUndefined, z.string({error: message}));

export const requiredEnvSchema = z.object({
    DATABASE_URL: required("is required (Postgres connection string)")
        .refine((v) => /^postgres(ql)?:\/\//i.test(v), "must start with postgresql://"),
    BETTER_AUTH_SECRET: required("is required (generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")"),
    BETTER_AUTH_URL: required("is required (the URL users open, e.g. http://<server-ip>:3000)")
        .refine(isHttpUrl, "must be a valid http:// or https:// URL"),
    ENCRYPTION_KEY: required("is required").regex(HEX_64, "must be exactly 64 hex characters (32 bytes)"),
});
```
Each `issue.path[0]` is the variable name; format as `ERROR  ENCRYPTION_KEY  must be exactly 64 hex characters (32 bytes)`.

### Anti-Patterns to Avoid

- **Validating in the body of `index.ts` while `app.js` is statically imported** — runs after `auth.ts` has already read env (Pitfall 1).
- **Echoing env values in messages/logs/API** — report carries variable *names* and fixed text only (Security Domain).
- **A second EventSource/poller for warnings** — the report is static per boot; fetch once via REST.
- **Putting the report into `buildApp()` globals or reading `process.env` in the route** — violates the routes-call-services rule; use the service + store.
- **Changing `crypto.ts`** — keep its lazy checks and exact messages ("ENCRYPTION_KEY env var is required", "ENCRYPTION_KEY must be 32 bytes (64 hex chars)") because `crypto.test.ts` asserts them `[VERIFIED: server/test/unit/lib/crypto.test.ts:39,44]`. The startup check is additive defence.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image tag computation | Shell tag logic in YAML | `docker/metadata-action` (`type=edge`, `type=sha`, `type=semver`) | Handles `latest=auto`, OCI labels (links package to repo), prerelease rules |
| Multi-arch manifest | Manual `docker manifest create` | `build-push-action` with `platforms:` (or `imagetools create` for native runners) | Correct manifest lists + provenance |
| Reusing CI before publish | Copy-pasted CI steps | `workflow_call` on `ci.yml` | One definition of "green" |
| Env parsing/aggregation | Hand `if` chains | One Zod schema + `safeParse` | Collects all issues in one pass |
| Docs search/nav/dead-link check | Custom scripts | VitePress built-ins (`search: {provider: 'local'}`, dead-link build failure) | `ignoreDeadLinks` default is `false` so the build fails on dead links `[VERIFIED: vuejs/vitepress v1.6.4 docs/en/reference/site-config.md "ignoreDeadLinks ... Default: false"]` |
| Code of Conduct text | Paraphrasing | Verbatim Contributor Covenant 2.1 with contact filled in | License requires attribution/unmodified intent; reporting section is the only customisation |
| Checksum verification | Trusting TLS alone | Existing `sha256sum -c` pattern per tool | Binaries run with host-socket access (existing Dockerfile rationale) |
| Dismissed-banner storage | New server table/auth model | `localStorage` keyed by warning code | D-13 says no new auth model; per-browser dismissal is sufficient |

**Key insight:** every item here has a maintained upstream mechanism; the risk is not missing features but wiring order (import order, trigger scoping, per-arch checksum selection).

## Common Pitfalls

### Pitfall 1: Env check runs after `auth.ts` already read the env
**What goes wrong:** missing `BETTER_AUTH_SECRET` still crashes with the obscure `BetterAuthError` instead of the new formatted report.
**Why:** static ESM imports evaluate first (see Pattern 2 evidence).
**How to avoid:** validation module imported statically only if it has no env-reading transitive imports; load `./app.js` via `await import()` after the check. Add a unit test asserting `startup-environment.ts` does not import `auth.ts` (architecture tests already exist under `server/test/unit/architecture/`).
**Warning signs:** manual run `env -i node dist/server/index.js` prints a BetterAuthError stack instead of the report.

### Pitfall 2: `COPY .yarn .yarn` fails on a clean checkout
**What goes wrong:** `docker build` (CI publish and README from-source path) errors on a missing `.yarn` source.
**Evidence:** `Dockerfile:5: COPY .yarn .yarn` and `Dockerfile:18: COPY .yarn .yarn` `[VERIFIED: Dockerfile lines 5, 18]`; `.gitignore` line 5 `.yarn/*` with no committed exceptions (`git ls-files .yarn` empty, directory absent `[VERIFIED: ls/git this session]`); `.yarnrc.yml` is only `nodeLinker: node-modules` `[VERIFIED: .yarnrc.yml]`. Maintainer machines likely have a local ignored `.yarn/` so it works locally. That BuildKit errors on a non-wildcard missing COPY source is `[ASSUMED]` (no daemon available here to run it) — **prove it** with a clean `git clone` + `docker build` as the first task.
**How to avoid:** delete both `COPY .yarn .yarn` lines (nothing tracked to copy). Also note drift: `corepack prepare yarn@4.12.0` (Dockerfile:3,16) vs `"packageManager": "yarn@4.13.0"` in root `package.json` `[VERIFIED]` — align the Dockerfile to 4.13.0 (or drop `prepare` and let Corepack honour `packageManager`).

### Pitfall 3: Gating publish on CI that never runs on tags
**What goes wrong:** with `workflow_run` on CI, a `v0.1.0` tag publishes nothing: `ci.yml` triggers are `push: branches: [main]` and `pull_request: branches: [main]` only `[VERIFIED: .github/workflows/ci.yml:3-7]`. `workflow_run` also executes in the default-branch context, so `github.ref` is not the tag and `metadata-action`'s `type=semver` would need an explicit `value=` (`github.event.workflow_run.head_branch`) — mechanics I could not verify `[ASSUMED]`.
**How to avoid:** use the reusable-workflow design (Open Question 1): `ci.yml` gains `workflow_call:` and drops its own `push` trigger; `publish.yml` triggers on `push: branches: [main]` + `tags: ['v*']` and has `ci` then `publish (needs: ci)` jobs.
**Side effects to handle:** keep `pull_request` trigger so PR check names are unchanged (required-status-check names for PRs are unaffected). Branch-protection contexts could not be read (`gh api .../branches/main/protection` -> 403 "Resource not accessible by integration"), so the maintainer must confirm after the first run. The called workflow needs `secrets: inherit` (Sonar) and the caller must grant at least `contents: read`; `packages: write` only on the publish job.
**Warning signs:** Sonar "main" scan step is conditional on `github.ref == 'refs/heads/main' && github.event_name == 'push'` `[VERIFIED: ci.yml:143]`; under `workflow_call` the `github` context is the caller's `[ASSUMED: standard Actions behaviour]`, so it should still fire on main pushes and be skipped on tags — confirm in the first run.

### Pitfall 4: Playwright `_apiRouteGuard` fails every spec when the banner is added
**What goes wrong:** `AppLayout` renders on every authenticated page; a new `GET /api/settings/environment` call is unstubbed in all existing specs and is aborted.
**Evidence:** fixtures guard: `await page.route("**/api/**", (route) => { unstubbed.push(...); return route.abort("failed"); });` with the comment "any request that falls through unstubbed must fail the test loudly" `[VERIFIED: client/test/integration/fixtures.ts:19-33]`; precedent: Storage/health-events/uptime defaults were added centrally "RESEARCH Pitfall 7" `[VERIFIED: fixtures.ts]`.
**How to avoid:** add a default stub for `**/api/settings/environment` returning `{"warnings":[]}` in `fixtures.ts` in the same plan as the banner; add one spec that overrides it with a warning and asserts dismissal persists across reload. Also check unit tests that render `AppLayout` (none found by grep for `AppLayout|app-layout` in `client/test`).

### Pitfall 5: Per-arch binary names and checksum tables
**What goes wrong:** `TARGETARCH` is `amd64`/`arm64` but docker/compose use `x86_64`/`aarch64`; legacy (non-BuildKit) builds leave `TARGETARCH` empty; `ARG TARGETARCH` must be re-declared in every stage that uses it.
**How to avoid:** `case "${TARGETARCH}"` with an explicit failure branch; keep each download in one `RUN`.
Verified inputs (all `[VERIFIED: computed/downloaded this session 2026-10-11]`):

| Artifact | amd64 | arm64 |
|----------|-------|-------|
| `restic_0.19.1_linux_<arch>.bz2` (from `SHA256SUMS`) | `f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c` | `a5f64aaab53d51e311fa3829124c5b703f2d14cf187d8640b6be3b2b49376465` |
| `docker-compose-linux-{x86_64,aarch64}` v2.33.1 (from `checksums.txt`) | `3efda1ad6caed49dedd5644cadbf7e0c9cc3d74d8844ca5237b6a43ac1ef1a46` | `fa0e077510c852237b0da426d0daf6853446e7760145ce7665ec401892a4d0de` |
| `docker-27.5.1.tgz` (static CLI) | `4f798b3ee1e0140eab5bf30b0edc4e84f4cdb53255a429dc3bbae9524845d640` (equals existing pin at Dockerfile:86) | `e6b53725a73763ab3f988c73f8772eaed429754c1a579db5ff11f21990fd1817` (from `https://download.docker.com/linux/static/stable/aarch64/docker-27.5.1.tgz`) |

The arm64 docker CLI digest is **trust-on-first-use**: download.docker.com publishes no checksum manifest (as the Dockerfile comment states), so it was computed from one download over TLS. The x86_64 recomputation matched the existing pin, which is mild evidence the CDN artifact is stable. Planner: add a maintainer `checkpoint:human-verify` to recompute `e6b537...` independently.

### Pitfall 6: `node_modules` architecture in the final image
**What goes wrong:** if the server-build stage is pinned to `$BUILDPLATFORM`, `node_modules` (including the Prisma CLI's platform-specific engine binaries, which `schema-sync.ts` runs at container start via `resolvePrismaCliEntrypoint()` `[VERIFIED: server/src/lib/prisma-cli.ts]`) is copied into an arm64 image with the wrong architecture.
**How to avoid:** let `server-build` run per target platform (QEMU or native). Pin only `client-build` to `FROM --platform=$BUILDPLATFORM` (static JS output copied to `client-dist`). That Prisma 7's CLI still downloads per-platform schema-engine binaries is `[ASSUMED]` (search did not confirm) — the arm64 smoke test below is the real check: `docker run --platform linux/arm64 <img> node -e "require('child_process').execFileSync(process.execPath,[require.resolve('prisma/build/index.js'),'--version'],{stdio:'inherit'})"`.

### Pitfall 7: `{{major}}` tag on a 0.y.z release
**What goes wrong:** D-05 says a tag publishes `X.Y.Z`, `X.Y`, `X`; for `v0.1.0` that is Docker tag `0`, which metadata-action's README says "**should not** be generated" for major-zero (initial development, may break) `[CITED: github.com/docker/metadata-action README "Major version zero"]`. Users pinning `:0` would silently get breaking 0.x updates.
**How to avoid:** `type=semver,pattern={{major}},enable=${{ !startsWith(github.ref, 'refs/tags/v0.') }}`. This deviates from D-05's literal "X" only while major is 0 — flagged in Assumptions Log A1 for user confirmation.

### Pitfall 8: `latest` does not exist until the first release tag
**What goes wrong:** D-07 flips `docker-compose.yml` to `:latest`; until `v0.1.0` is tagged, `docker compose up` from `main` fails with "manifest unknown". Per D-05 `latest` moves only on a release.
**How to avoid:** order the work: merge publish workflow -> verify `edge` appears -> cut `v0.1.0-rc.1` (pre-release tags should not move `latest` `[ASSUMED]`: README only says semver callouts exist for prereleases) -> cut `v0.1.0` -> merge the compose flip and README quickstart in the same release PR window. Also first-publish GHCR packages are private by default `[CITED (third-party): oneuptime.com guides on GHCR]`: the maintainer must set the package to **Public** after the first push, or strangers' pulls fail with `denied`. Pass `labels: ${{ steps.meta.outputs.labels }}` so `org.opencontainers.image.source` links the package to the repo.

### Pitfall 9: Recording script details that will not work as written
Findings from `16-RECORDING-SCRIPT.md` vs the app:
- Row 5 "Health / uptime view": there is no dedicated health route. Sidebar items are Dashboard, Stacks, Storage, Settings `[VERIFIED: client/src/components/app-sidebar.tsx:19-22]`; stack tabs are `["overview", "config", "logs", "backups", "proxy"]` `[VERIFIED: client/src/lib/stack-tabs.ts:3]`. Re-point `health.png` to Stack -> Overview (uptime + incidents) and add a `storage.png` for disk usage.
- Local backup repository: per `docs/deployment.md` "a local-type restic repository at a host path ... must itself be reachable from inside the Docktor container — bind-mount it yourself" `[VERIFIED: docs/deployment.md:391-394]`. Add that bind mount to the recording environment's compose, otherwise the "run one manual backup" step fails.
- "Let one show update available": the update checker compares registry tags; deploy a stack with a deliberately old pinned image tag and wait for a check cycle before recording.
- Hide/mask: use a throwaway `BETTER_AUTH_URL` and no real secrets on screen (Settings views show base URL/SMTP).

### Pitfall 10: `.env.production` is tracked despite being gitignored
`git ls-files` lists `.env.production` while `.gitignore` also lists it `[VERIFIED: git ls-files / .gitignore]`. I deliberately did not open it (secret-read guard). Maintainer should confirm it is a placeholder template only; since the repo is already public, anything in it is already exposed. Decide: delete, or rename to `.env.production.example`. Not blocking.

### Pitfall 11: Doc drift that D-16's "re-verify" must fix (concrete list)
- `docs/deployment.md:34` clones `https://github.com/raphaelmue/docktor.git`; repo is `docktor-app/docktor` (`git remote -v`) `[VERIFIED]`.
- `docs/deployment.md` step 3 says "The first run builds the image (a few minutes)"; wrong after D-07. Troubleshooting #1 describes the BetterAuthError crash; replaced by the formatted startup report.
- `docs/deployment.md` env table lists `ENCRYPTION_KEY` as throwing "on first use" — now blocks at boot; add TRUST_PROXY/placeholder warnings and arm64 note.
- `docs/design.md`: "Progress" section still lists live log streaming and the settings page under "MVP — Up Next" (lines 36-41); the Dockerfile snippet says `apt-get install -y docker-compose-plugin restic` (lines 291-293, the exact practice #42 removed); "Docktor's Own Compose File" shows `image: docktor/docktor:latest`, `8443:3000`, `DOCKTOR_DATA_DIR`/`DOCKTOR_BACKUP_DIR` (dead variables per deployment.md troubleshooting #7); "Install Script" promises `curl -fsSL https://get.docktor.io | bash` which does not exist. `[VERIFIED: docs/design.md lines 262-310, 360-410]` These sections need rewriting or removal before it is linked from CONTRIBUTING.
- `docker-compose.yml:12` carries a stale comment `# image: docktor/docktor:latest` `[VERIFIED]` — replaced by the GHCR image.
- `.env.example` / compose comments reference `docs/deployment.md`; these become the docs-site URL (Open Question 2).

## Code Examples

### Per-arch restic stage (Dockerfile)
```dockerfile
# Source: adapted from the existing stage (Dockerfile:38-54); checksums verified this session
FROM node:22-slim AS restic-install
ARG TARGETARCH
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl bzip2 && \
    rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "${TARGETARCH}" in amd64|arm64) ;; \
      *) echo "Unsupported TARGETARCH '${TARGETARCH}' (BuildKit/buildx required)" >&2; exit 1 ;; esac; \
    RESTIC_VERSION=0.19.1; \
    ASSET="restic_${RESTIC_VERSION}_linux_${TARGETARCH}"; \
    cd /tmp; \
    curl -fsSLO "https://github.com/restic/restic/releases/download/v${RESTIC_VERSION}/${ASSET}.bz2"; \
    curl -fsSLO "https://github.com/restic/restic/releases/download/v${RESTIC_VERSION}/SHA256SUMS"; \
    grep " ${ASSET}.bz2\$" SHA256SUMS | sha256sum -c -; \
    bzip2 -d "${ASSET}.bz2"; \
    mv "${ASSET}" /usr/local/bin/restic; \
    chmod +x /usr/local/bin/restic; \
    rm -f SHA256SUMS
```

### Per-arch docker CLI + compose (final stage)
```dockerfile
ARG TARGETARCH
RUN set -eu; \
    DOCKER_VERSION=27.5.1; \
    COMPOSE_VERSION=2.33.1; \
    case "${TARGETARCH}" in \
      amd64) DOCKER_ARCH=x86_64;  DOCKER_CLI_SHA256=4f798b3ee1e0140eab5bf30b0edc4e84f4cdb53255a429dc3bbae9524845d640 ;; \
      arm64) DOCKER_ARCH=aarch64; DOCKER_CLI_SHA256=e6b53725a73763ab3f988c73f8772eaed429754c1a579db5ff11f21990fd1817 ;; \
      *) echo "Unsupported TARGETARCH '${TARGETARCH}'" >&2; exit 1 ;; \
    esac; \
    cd /tmp; \
    curl -fsSLO "https://download.docker.com/linux/static/stable/${DOCKER_ARCH}/docker-${DOCKER_VERSION}.tgz"; \
    echo "${DOCKER_CLI_SHA256}  docker-${DOCKER_VERSION}.tgz" | sha256sum -c -; \
    tar xzf "docker-${DOCKER_VERSION}.tgz" --strip-components=1 -C /usr/local/bin docker/docker; \
    mkdir -p /usr/local/lib/docker/cli-plugins; \
    curl -fsSLO "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-linux-${DOCKER_ARCH}"; \
    curl -fsSLO "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/checksums.txt"; \
    grep -E " \*docker-compose-linux-${DOCKER_ARCH}\$" checksums.txt | sha256sum -c -; \
    mv "docker-compose-linux-${DOCKER_ARCH}" /usr/local/lib/docker/cli-plugins/docker-compose; \
    chmod +x /usr/local/lib/docker/cli-plugins/docker-compose; \
    rm -f "docker-${DOCKER_VERSION}.tgz" checksums.txt
```
`checksums.txt` lines have the form `<sha> *docker-compose-linux-aarch64` (asterisk binary-mode marker), matching the existing grep `[VERIFIED: downloaded v2.33.1 checksums.txt this session]`.

### Publish workflow skeleton
```yaml
# Source: composed from docker/metadata-action + build-push-action README patterns; action majors per Standard Stack
name: Publish
on:
  push:
    branches: [main]
    tags: ["v*"]
concurrency:
  group: publish-${{ github.ref }}
  cancel-in-progress: ${{ github.ref_type == 'branch' }}   # never cancel a tag release
permissions:
  contents: read
jobs:
  ci:
    uses: ./.github/workflows/ci.yml
    secrets: inherit
  publish:
    needs: ci
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v4
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v6
        with:
          images: ghcr.io/docktor-app/docktor
          flavor: |
            latest=auto
          tags: |
            type=edge
            type=sha
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=semver,pattern={{major}},enable=${{ !startsWith(github.ref, 'refs/tags/v0.') }}
      - uses: docker/build-push-action@v7
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```
`ci.yml` change: replace `push: branches: [main]` with `workflow_call:` (keep `pull_request`). Add a build-only Docker check to PR CI (`push: false`, `platforms: linux/amd64`) so Dockerfile regressions (Pitfall 2) are caught before release; arm64 is exercised on `main`/tags only to bound PR time.

### From-source compose override (D-07 "documented build path")
```yaml
# docker-compose.build.yml
services:
  docktor:
    build:
      context: .
```
Usage: `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build`. Compose merges `build` with the `image:` name, so the local build is tagged as the GHCR name `[ASSUMED: standard Compose merge/`--build` behaviour]`.

### Report DTO (shared)
```typescript
// shared/src/validation/environment.ts  (re-export from validation/index.ts: currently exports auth, account, stacks, settings, backups, wizard, proxy, templates, health)
import {z} from "zod";
export const environmentIssueSchema = z.object({
    code: z.string(),       // stable id, e.g. "TRUST_PROXY_UNSET_BEHIND_HTTPS"; used as the dismissal key
    variable: z.string(),   // env var NAME only, never its value
    message: z.string(),
});
export const environmentReportSchema = z.object({warnings: z.array(environmentIssueSchema)});
export type EnvironmentIssue = z.infer<typeof environmentIssueSchema>;
export type EnvironmentReport = z.infer<typeof environmentReportSchema>;
```
Errors are never served (the process has exited), so the API DTO carries warnings only. Remember `server/test/unit/shared-schema-parity.test.ts` compares compiled `shared/dist` against `shared/src` `[VERIFIED: file read]`: run `yarn workspace @docktor/shared build` after adding the schema.

### Recommended warning set (D-11, discretion)
| code | Fires when | Rationale / evidence |
|------|-----------|----------------------|
| `PLACEHOLDER_SECRET` (per var) | `NODE_ENV=production` and `BETTER_AUTH_SECRET` or `DATABASE_URL` matches `CHANGE_ME` (ENCRYPTION_KEY with `CHANGE_ME_...` already fails the 64-hex error; give that error a placeholder-specific hint) | D-12. Template values: `BETTER_AUTH_SECRET=CHANGE_ME_GENERATE_A_RANDOM_SECRET`, `ENCRYPTION_KEY=CHANGE_ME_GENERATE_A_RANDOM_64_HEX_KEY`, `DATABASE_URL="postgresql://docktor:CHANGE_ME_DB_PASSWORD@db:5432/docktor"` `[VERIFIED: .env.example:63,91,39]` |
| `TRUST_PROXY_UNSET_BEHIND_HTTPS` | `TRUST_PROXY` unset **and** `BETTER_AUTH_URL` starts with `https://` | Docktor itself serves plain http, so https implies a TLS-terminating proxy. Firing on bare "unset" would nag every direct install and make the banner noise. `.env.example:74-80` explains the shared-bucket lockout |
| `TRUST_PROXY_TRUSTS_ALL` | `TRUST_PROXY=true` | `.env.example` says `"true"` trusts every hop; avoid (`auth-config.ts` doc comment) |
| `DOCKER_DATA_PATH_NOT_HOST_MOUNT` | containerized (`/.dockerenv`) and `DOCKER_DATA_PATH` unset or not under `/host` | Default is `/var/lib/docker` when unset `[VERIFIED: server/src/jobs/disk-checker.ts:126 process.env.DOCKER_DATA_PATH ?? (process.platform === "win32" ? "." : "/var/lib/docker")]`; `.env.example:137` sets `DOCKER_DATA_PATH=/host/var/lib/docker` |
| `NODE_ENV_NOT_PRODUCTION_IN_CONTAINER` | containerized and `NODE_ENV !== "production"` | `.env.example` says other values serve no frontend with no error; the image bakes `ENV NODE_ENV=production` `[VERIFIED: Dockerfile:107]` |
| `STACKS_HOST_DIR_UNSET` / `STACKS_MOUNT_CHECK_DISABLED` | `DOCKTOR_STACKS_HOST_DIR` unset / `DOCKTOR_STACKS_MOUNT_CHECK=false` | Already `console.warn`ed in `stacks-dir.ts:113,293`; include in the report so the banner shows them. Leave `stacks-dir.ts` untouched (its tests exist); the duplicate log line is acceptable, or planner may choose to omit |

Additional small extension beyond D-10's literal "missing": treat a malformed `BETTER_AUTH_URL`/`DATABASE_URL` (not http(s) / not postgres) as a blocking error since both would otherwise fail later and obscurely (Assumptions Log A3).

### Service + store (layering-compliant)
```typescript
// application/environment-status-service.ts
export class EnvironmentStatusService {
    constructor(private readonly readReport: () => EnvironmentReport) {}
    getReport(): EnvironmentReport { return this.readReport(); }
}
// application/index.ts: export const environmentStatusService = new EnvironmentStatusService(getEnvironmentReport);
// lib/environment-report.ts: module-level `let report = {warnings: []}`; set/get. Default empty so tests (which never run index.ts) see no warnings.
// routes/settings.ts (already has the requireAuth onRequest hook): app.get("/api/settings/environment", async () => environmentStatusService.getReport())
```
`routes/settings.ts` registers `requireAuth` for all its routes `[VERIFIED: server/src/routes/settings.ts:48-49]`, so adding the route there inherits auth without a new model, per D-13.

### Banner placement
`AppLayout` is `SidebarProvider > AppSidebar + SidebarInset > Outlet` `[VERIFIED: client/src/components/app-layout.tsx:5-16]`. Render `<EnvironmentWarningsBanner />` inside `SidebarInset` above `<Outlet />` so it shows on every page (satisfies "visible without navigating to Settings"). The component calls `useEnvironmentWarnings()` (hook owns fetch + localStorage dismissal) and renders `Alert` with `ToneBadge tone="yellow"` per warning, with `dark:` counterparts coming from `ToneBadge`'s variants `[VERIFIED: client/src/components/common/tone-badge.tsx yellow: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"]`. `components/ui/alert.tsx` has only `default` and `destructive` variants `[VERIFIED: alert.tsx]` and must not be edited; style the banner via className using dark-aware utilities.

### Issue forms / templates
- `.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml` with `name`, `description`, `body` (documented top-level keys `[CITED: docs.github.com issue forms syntax, via search results]`). Fields for bugs: Docktor version/image tag, arch, Docker/Compose version, what happened, expected, steps, logs (render as shell), checkbox "no secrets pasted".
- `config.yml`: `blank_issues_enabled: false`; `contact_links` -> Discussions (enabled: `has_discussions: true` `[VERIFIED: gh api]`) and the security advisory URL `https://github.com/docktor-app/docktor/security/advisories/new`.
- The native Issue Type: a top-level `type:` key in issue forms is `[ASSUMED]` (search results did not confirm it). Validate on the branch by opening `/issues/new/choose`; if it errors, omit it and let triage set the type (CLAUDE.md already documents this).
- PR template: summary, `Closes #`, checklist: `tsc --build`, tests added/updated, commit format `type(scope): description`, dark-mode counterparts for UI, no `any`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `apt-get install restic` (0.14.0, Debian 12) | pinned release binary + SHA256SUMS | Already done in repo | #42 satisfied; close with a note |
| Single-arch image | buildx multi-platform manifest | this phase | arm64 (Raspberry Pi / ARM VPS) users covered |
| Compose builds locally | compose pulls GHCR image | this phase | quickstart no longer needs a clone |
| `ARM runners paid` | free/GA ARM runners on public repos (Aug 2025) | 2025-08-07 | native arm64 build is an option `[CITED]` |
| VitePress 2 alpha | VitePress 1.6.4 stable | — | pin `1.6.4` |

**Deprecated/outdated:** `docs/design.md` Progress/Dockerfile/compose/install-script sections (Pitfall 11); `raphaelmue/docktor` URLs in docs.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Suppress Docker tag `0` for `v0.x.y` releases (deviates from D-05's literal "X") | Pitfall 7 | If the user wants `:0` published anyway, drop the `enable=` condition; low risk, but D-05 is "costly" reversibility so **confirm with user** |
| A2 | BuildKit fails `COPY .yarn .yarn` when `.yarn` is absent (no daemon here to run it) | Pitfall 2 | If it somehow succeeds, the removal is still harmless; first task is a clean-clone build |
| A3 | Malformed (not just missing) `BETTER_AUTH_URL`/`DATABASE_URL` should also block | Code Examples | Slightly wider blocking set than D-10's literal list; user may prefer warn-only |
| A4 | Prisma 7 CLI still downloads per-platform schema-engine binaries so server-build must be per-target | Pitfall 6 | If not, `--platform=$BUILDPLATFORM` for server-build could cut build time; arm64 smoke test settles it |
| A5 | In `workflow_call`, `github.event_name`/`github.ref` are the caller's, so Sonar conditions in `ci.yml` still work | Pitfall 3 | Sonar main scan might be skipped or run on tags; observable in first run |
| A6 | Pre-release tags (`v0.1.0-rc.1`) do not move `latest` and do not emit `{{major}}.{{minor}}` | Pitfall 8 | `latest` could move on an rc; check the rc run's tag list before cutting `v0.1.0` |
| A7 | Compose merges `build` + `image:` so `docker-compose.build.yml` tags the local build with the GHCR name | Code Examples | Override file may need an explicit `image:` line |
| A8 | GHCR packages created by a workflow are private until the maintainer makes them public | Pitfall 8 | If already public/inherits repo visibility, the manual step is a no-op |
| A9 | Issue forms accept a top-level `type:` key for native Issue Types | Issue forms | Invalid key could make the template fail to load; verify on the branch |
| A10 | The arm64 docker CLI digest `e6b537...` computed from one CDN download is correct | Pitfall 5 | A tampered/transient download would pin a bad hash; maintainer to recompute independently |
| A11 | Zod 4 API names used in the example (`z.string({error})`, `z.preprocess`, `.refine`) | Pattern 3 | Typecheck failure; trivial to adjust |
| A12 | `<picture>` with `prefers-color-scheme` sources renders light/dark README images on GitHub | README | Fallback: a single (light) image |
| A13 | GitHub Actions majors (`build-push v7`, `login v4`, `buildx v4`, `qemu v4`, `metadata v6`) are current | Standard Stack | Re-check each Releases page when authoring; an outdated major still works |

## Open Questions

1. **Gate mechanism for D-06: `workflow_call` vs `workflow_run`?**
   - What we know: CONTEXT's Integration Points allow either. `ci.yml` has no tag trigger (Pitfall 3); `workflow_run` runs in default-branch context.
   - What's unclear: whether the maintainer is willing to remove `push: [main]` from `ci.yml` (CI for main would then appear inside the "Publish" workflow run) and accept CI re-running for tags.
   - Recommendation: `workflow_call` as specced above. If the user insists on literal `workflow_run`, add `tags: ['v*']` to `ci.yml`'s push trigger, trigger publish on `workflow_run` completed + `conclusion == 'success'` + `event == 'push'`, check out `head_sha`, and pass `value=${{ github.event.workflow_run.head_branch }}` to the semver tag rules; note it cannot be tested before it exists on `main`.

2. **What is the public docs-site URL?**
   - What we know: maintainer self-hosts (D-14); README, `.env.example`, compose comments, `SECURITY.md`/`CONTRIBUTING.md` and error messages need to link to it.
   - Unclear: the hostname (not decided anywhere in context).
   - Recommendation: define it once (e.g., a constant in the plan and a single find/replace token), default to `https://github.com/docktor-app/docks` until hosted.

3. **Quickstart file source:** `raw.githubusercontent.com/.../main/docker-compose.yml` moves with development, but `latest` is a release image.
   - Recommendation: docs/README fetch compose and `.env.example` pinned to the release tag (`.../v0.1.0/...`) or attach both as release assets; update at each release.

4. **`docks` repo write access:** CONTEXT said read-only in the discuss session; this session's `gh api repos/docktor-app/docks` reports `permissions.push: true` and `size: 0` (empty) `[VERIFIED]`. Planner should still make the content plan a checkpoint for the maintainer, since credentials may differ between sessions.

5. **Maintainer contact email** for `SECURITY.md`/`CODE_OF_CONDUCT.md` fallback is not in context. `userEmail` in the session context is the user's, but must not be published without explicit confirmation — ask.

6. **Are PR required-status-check names pinned to current CI job names?** Unreadable (403). After first CI change confirm checks (`build-and-test`, `cross-platform-unit (...)`, `sonarqube`) still appear on PRs; PR-triggered runs from `ci.yml` itself keep their names.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | server/client builds, VitePress | ✓ | (engines `>=22.0.0`) | — |
| npm registry | vitepress install | ✓ | `vitepress` 1.6.4 resolves | — |
| docker CLI + buildx | local multi-arch build test | ✓ CLI 29.8.2, buildx v0.37.1 | — | **No daemon** here (`failed to connect to the docker API`): build tests run in CI or on the maintainer's machine |
| GitHub REST (`gh api repos/docktor-app/...`) | issue/PVR/branch facts | ✓ (GraphQL and non-repo paths blocked) | — | — |
| github.com release assets via curl | checksum computation | ✓ | — | — |
| docs.docker.com, docs.github.com, vitepress.dev | doc lookups | ✗ (DNS fails) | — | read upstream docs from `raw.githubusercontent.com` |
| Recordly (screen recorder) | #54 | n/a (maintainer's machine) | — | manual step |
| QEMU/arm64 runner | arm64 build | CI only | `ubuntu-24.04-arm` free on public repos | QEMU via `setup-qemu-action` |

**Missing dependencies with no fallback:** a local Docker daemon, so the Dockerfile cannot be build-tested in this environment; plans must make a real build (CI or maintainer) an explicit gate.
**Missing dependencies with fallback:** upstream doc hosts (use raw GitHub sources).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (server: projects `unit` and `test/integration`; client: vitest + @testing-library/react), Playwright for client integration |
| Config file | `server/vitest.config.ts`, `client/vitest.config.ts`, `client/playwright.config.ts` |
| Quick run command | `yarn workspace @docktor/server test:unit` / `yarn workspace @docktor/client test:unit`(client `test` script is `vitest run`) |
| Full suite command | `yarn test` + `yarn test:integration` + `yarn typecheck` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| #7 | Missing/blank/invalid required vars each produce an error; all reported at once; valid env -> no errors | unit | `yarn workspace @docktor/server vitest run --project unit test/unit/lib/environment-check.test.ts` | ❌ Wave 0 |
| #7 | Each warning rule fires/doesn't (TRUST_PROXY+https, DOCKER_DATA_PATH, NODE_ENV, placeholders only in production) | unit | same file | ❌ Wave 0 |
| #7 | Bootstrap calls `exit(1)` with formatted block on errors; returns report with warnings and logs them otherwise | unit (injected `exit`/`log`) | `... test/unit/lib/startup-environment.test.ts` | ❌ Wave 0 |
| #7 | Bootstrap module does not import `lib/auth.ts` (import-order guarantee) | unit/architecture | `... test/unit/architecture/*` | ❌ Wave 0 (add test beside existing architecture tests) |
| #7 | Service returns stored report; empty by default | unit | `... test/unit/application/environment-status-service.test.ts` | ❌ Wave 0 |
| #7 | `GET /api/settings/environment` requires auth, returns `{warnings}` | integration (real DB) | `yarn workspace @docktor/server test:integration` | ❌ Wave 0 |
| #7 | Hook fetches once, dismissal persists by code, new code reappears | unit (jsdom, mocked api) | `yarn workspace @docktor/client vitest run test/unit/hooks/use-environment-warnings.test.ts` | ❌ Wave 0 |
| #7 | Banner renders warnings by role, dismiss button, dark classes present | unit (RTL) | `... test/unit/components/domain/environment/*.test.tsx` | ❌ Wave 0 |
| #7 | Existing specs still pass with new endpoint; banner e2e | Playwright | `PLAYWRIGHT_PORT=5182 yarn workspace @docktor/client test:integration` | ❌ Wave 0 (`fixtures.ts` default stub + one spec) |
| #7 | Real container with empty env exits 1 and prints all four vars | smoke (CI) | `docker run --rm <image>; test $? -eq 1` + grep | ❌ optional CI step |
| #11 | Dockerfile builds clean-checkout for both arches; arm64 runs node + prisma CLI | CI/manual | `docker buildx build --platform linux/amd64,linux/arm64 .` then `docker run --platform linux/arm64 <img> node -e ...` (Pitfall 6) | ❌ (PR build-only job + rc dry run) |
| #11 | Tags produced as D-05 specifies (edge+sha on main; X.Y.Z, X.Y, latest on tag; no `0` while v0) | CI (rc tag) | inspect `gh api` package versions / metadata step output on `v0.1.0-rc.1` | ❌ manual checkpoint |
| #11 | Compose file pulls image: `docker compose config` shows `image: ghcr.io/docktor-app/docktor:latest` | shell | `docker compose -f docker-compose.yml config --images` | n/a |
| #42 | restic pinned, checksum-verified, arch-aware; no `apt-get install restic` | grep | `! grep -n "apt-get install.*restic" Dockerfile && grep -n "RESTIC_VERSION=0.19.1" Dockerfile` | ✅ |
| #17 | Docs site builds with zero dead links | build | `npm run docs:build` in `docks` (fails on dead links) | ❌ Wave 0 in `docks` |
| #17 | Pointer links in main repo resolve | shell | `grep -rn "docs/deployment.md\|docs/templates.md" --include=*.md --include=*.yml --include=*.example .` returns only intended pointers | n/a |
| #54 | README assets exist and referenced | shell | `test -f docs/assets/docktor-demo.gif && grep -c "docs/assets" README.md`; GIF size < 5 MB | n/a |
| #55 | Files exist; templates valid | shell + GitHub | `ls CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md .github/ISSUE_TEMPLATE/*.yml .github/PULL_REQUEST_TEMPLATE.md`; YAML parse; open `/issues/new/choose` | n/a |
| #57 | `LICENSE` is MIT with exact copyright line | shell | `grep -q "Copyright (c) 2026 Docktor contributors" LICENSE && grep -q "^MIT License" LICENSE` | n/a |
| #53 | Issue out of milestone, still open | manual | `gh api repos/docktor-app/docktor/issues/53 --jq .milestone` -> `null` | manual |

### Sampling Rate
- **Per task commit:** the task's targeted vitest file(s) plus `yarn typecheck` (`tsc --build`)
- **Per wave merge:** `yarn workspace @docktor/server test:unit` and `yarn workspace @docktor/client test`; Playwright after the banner wave
- **Phase gate:** full `yarn test`, `yarn test:integration`, `yarn typecheck`, a green multi-arch build, and an rc-tag publish dry run before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `server/test/unit/lib/environment-check.test.ts`, `startup-environment.test.ts`, `application/environment-status-service.test.ts`, architecture import-order test
- [ ] `server/test/integration/environment-status.test.ts` (follow `server/test/integration/setup.ts` helpers)
- [ ] `client/test/unit/hooks/use-environment-warnings.test.ts`, `client/test/unit/components/domain/environment/environment-warnings-banner.test.tsx`
- [ ] `client/test/integration/fixtures.ts` default `**/api/settings/environment` stub + `environment-banner.spec.ts`
- [ ] `docks` repo: scaffold + `docs:build` script (and optionally a PR build workflow)
- [ ] No new framework installs needed in the main repo

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no change (verify banner endpoint requires session) | existing `requireAuth` |
| V3 Session Management | no | — |
| V4 Access Control | yes | `/api/settings/environment` only under `requireAuth`; report exposes variable names and canned text only |
| V5 Input Validation | yes | Zod env schema; shared DTO for the API response |
| V6 Cryptography | yes | `ENCRYPTION_KEY` strict `^[0-9a-fA-F]{64}$`; never hand-roll; keep `crypto.ts` (aes-256-gcm `[VERIFIED: crypto.ts:3]`) unchanged |
| V8 Data Protection | yes | Never log or return env **values**; placeholder warnings name the variable only |
| V10/V14 Config & supply chain | yes | Checksum-verified binaries (restic, compose, docker CLI per arch); workflow `permissions` least-privilege (`contents: read`; `packages: write` on publish job only); actions pinned to major tags (consider SHA pinning later); `GITHUB_TOKEN` only, no long-lived registry secrets (D-04) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Secrets echoed in startup error/UI banner | Information disclosure | Messages built from variable name + fixed text; unit test asserts a secret-looking value never appears in formatted output |
| Shipping the `.env.example` placeholder secrets to production | Spoofing / EoP | D-12 production placeholder warning; `ENCRYPTION_KEY` placeholder already fails hex validation |
| Compromised/typo-squatted download in image build | Tampering | `sha256sum -c` per arch in a single `RUN`; arm64 docker CLI digest independently re-verified (A10) |
| Publishing an unvetted commit | Tampering | `publish` `needs: ci`; tags only from a successful CI run |
| Workflow script injection via `github.*` context interpolation | Tampering / EoP | Do not interpolate untrusted contexts into `run:`; existing Sonar step already interpolates `${{ github.head_ref \|\| github.ref_name }}` into `args` (PR-only; leave, but do not copy the pattern into publish) |
| Mutable `latest`/`edge` tags | Tampering | `latest` only from release tags; document pinning `X.Y.Z` for production; (optionally) enable build provenance |
| Docker socket = host root | EoP | Documented on the docs Security page (D-15); not a code change in this phase |
| Public vulnerability disclosure in issues | Information disclosure | `SECURITY.md` -> PVR (currently **disabled**: `gh api repos/docktor-app/docktor/private-vulnerability-reporting` -> `{"enabled":false}` `[VERIFIED]`); maintainer must enable before merging `SECURITY.md` |

## Manual / Maintainer-Only Checklist (give to planner as a `checkpoint:human-action` plan)

1. Enable private vulnerability reporting on `docktor-app/docktor` (currently disabled).
2. After the first publish, set the GHCR package `docktor` to **Public** (and confirm it is linked to the repo).
3. Provide the security/CoC contact email and the docs-site URL (Open Questions 2, 5).
4. Independently recompute the aarch64 docker CLI sha256 (A10).
5. Record screenshots/GIF with Recordly (script corrections in Pitfall 9); optimise PNG/GIF sizes before committing (assets are in git history forever).
6. Move #53 out of the "v0.1.0 - First Release" milestone (it is currently in it `[VERIFIED: gh api issues/53]`); keep it open. Close #42 with a link to the Dockerfile lines after the arch-aware change merges.
7. Confirm branch-protection required checks after the `ci.yml` change.
8. Cut `v0.1.0-rc.1`, inspect tags/arch/`latest`, then `v0.1.0`; then merge compose flip + README quickstart.
9. Confirm what `.env.production` (tracked) contains (Pitfall 10).
10. Give a `docks` push credential or have the maintainer push the scaffold/content.

## Suggested Plan Slicing (for the planner)

| Wave | Plan | Issues | Notes |
|------|------|--------|-------|
| 1 | Dockerfile: remove `.yarn` COPY, align yarn version, per-arch downloads, clean-clone build proof | #42, #11 | Gate for everything image-related |
| 1 | Server env validation: shared DTO, `environment-check`, `startup-environment`, `index.ts` dynamic import, tests | #7 | Independent of Docker work |
| 1 | LICENSE + community files + issue/PR templates + `license` fields | #57, #55 | Independent; SECURITY.md waits on PVR enabling |
| 2 | Service/route/store + client hook/banner + Playwright stub | #7 | Needs wave-1 server plan |
| 2 | `publish.yml` + `ci.yml` `workflow_call` + PR docker build job | #11 | Needs Dockerfile plan |
| 3 | `docks` repo: scaffold, content migration (re-verified), PR build workflow | #17 | Checkpoint for repo credentials; needs final env behaviour + image path |
| 3 | README rewrite + CONTRIBUTING (dev setup moved) + `design.md` drift fix + pointers in `.env.example`/compose comments + assets | #17, #54 | Needs docs URL; assets from maintainer |
| 4 | Release sequencing: rc tag, compose flip to GHCR + `docker-compose.build.yml`, maintainer checklist, #53/#42 housekeeping | #11, #53, #42 | Human gates |

## Sources

### Primary (HIGH confidence)
- Repo files read this session: `Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml`, `.env.example`, `.dockerignore`, `.gitignore`, `.yarnrc.yml`, `package.json`, `.github/workflows/ci.yml`, `README.md`, `docs/deployment.md`, `docs/design.md` (sections), `server/src/{index,app}.ts`, `server/src/lib/{auth,auth-config,crypto,db,db-pool-config,stacks-dir,prisma-cli}.ts`, `server/src/routes/{settings,health}.ts`, `server/src/jobs/disk-checker.ts` (line 126), `client/src/components/app-layout.tsx`, `client/test/integration/fixtures.ts`, `client/src/lib/stack-tabs.ts`, `client/src/components/app-sidebar.tsx`, `16-CONTEXT.md`, `16-RECORDING-SCRIPT.md`, `CLAUDE.md`
- GitHub REST via `gh api repos/docktor-app/docktor/...`: issues #7, #11, #17, #42, #53, #54, #55, #57; repo visibility, PVR status, labels; `docks` repo permissions/size
- `https://github.com/restic/restic/releases/download/v0.19.1/SHA256SUMS`; `https://github.com/docker/compose/releases/download/v2.33.1/checksums.txt`; `https://download.docker.com/linux/static/stable/{x86_64,aarch64}/docker-27.5.1.tgz` (sha256 computed)
- `raw.githubusercontent.com/vuejs/vitepress/v1.6.4/docs/en/{reference/site-config,guide/getting-started,guide/deploy}.md`
- `raw.githubusercontent.com/EthicalSource/contributor_covenant/release/content/version/2/1/code_of_conduct.md`; SPDX MIT text
- npm registry: `npm view vitepress`; `gsd_run query package-legitimacy check`

### Secondary (MEDIUM confidence)
- `github.com/docker/metadata-action` README (tag types, major-zero guidance, `latest=auto`)
- `github.com/docker/build-push-action` README (action majors v7/v4/v4/v4)
- GitHub changelog: arm64 hosted runners free for public repos / GA 2025-08-07 (via web search)

### Tertiary (LOW confidence)
- Third-party blogs on GHCR default-private packages; `workflow_run` example workflows; mintlify mirror claiming `migrate deploy` does not use the schema engine (contradicts A4's assumption, hence the smoke test)

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM-HIGH — checksums and versions verified by tool; action majors from READMEs only
- Architecture: HIGH — import-order, ci.yml triggers, Playwright guard and layering rules verified in source
- Pitfalls: HIGH for repo-grounded ones (1, 3, 4, 11); MEDIUM for build-behaviour ones (2, 6, 8) pending a real build

**Research date:** 2026-10-11
**Valid until:** 2026-11-10 for repo findings; action majors and restic version re-check at implementation time (7 days if a restic/docker release lands)
