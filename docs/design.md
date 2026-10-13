# Docktor – Technical Design Document (v2)

## Overview

Docktor is a self-hosting management platform that provides a UI-driven experience for deploying, updating, and managing
Docker-based applications using `docker-compose`. It targets end users who run a single VPS or local server and want to
self-host applications like Nextcloud, Vaultwarden, etc. without deep Docker expertise.

**Core principles:**

- **Data sovereignty & privacy first** — replaces reliance on third-party cloud services.
- **Single-host by design** — not a clustering tool. One server, one Docktor instance.
- **YAML-first** — the compose file is the source of truth, not the database.
- **User empowerment** — the tool should never restrict what Docker itself allows. It makes things easier, not more
  locked down.

---

## Status

This document describes the design of Docktor **v0.1.0**. Sections that describe an idea that is not built are marked
"Not implemented".

v0.1.0 ships these feature areas:

- **Stacks and compose editing** — create, edit, deploy, stop, restart and delete stacks; a compose and `.env` editor
  with a diff-and-warnings review step before an edit is applied.
- **Templates** — create a stack from templates read out of git repositories (see [Templates](#templates)).
- **Live status and logs** — event-driven container state with a reconciliation poll, per-service SSE log streaming.
- **Update checks** — registry polling for newer image versions with per-service upgrade.
- **Backups and restore** — per-stack local restic repositories (SFTP and S3 settings exist but are not used as a destination in v0.1.0), per-stack schedules and retention, snapshot restore.
- **Proxy and TLS** — a Docktor-managed `nginx-proxy` + `acme-companion` stack, per-service domains, Let's Encrypt or
  uploaded certificates.
- **Brownfield import** — scan the host for existing compose projects, adopt them in place or migrate them fully.
- **Health, uptime and storage** — optional HTTP health probes, per-stack uptime and incidents, host disk warnings and a
  per-stack, per-volume disk-usage view.
- **Notifications** — in-app notifications and SMTP email for stack errors, backup failures and low disk space.
- **2FA and sign-in protection** — optional or mandatory TOTP two-factor authentication, recovery codes, database-backed
  rate limiting on auth endpoints.

Product tracking lives in GitHub Issues and [milestones](https://github.com/docktor-app/docktor/milestones), not in this
document. User documentation lives in the [docks](https://github.com/docktor-app/docks) repository.

---

## First-Run Experience

A fresh instance (no user yet) redirects every page to the first-run wizard. Sign-up is closed once the first account
exists, so the wizard is the only way to create the admin account. The wizard covers:

1. **Account creation** — email + password for the single admin user.
2. **Base configuration** — instance name, base URL, timezone.
3. **Backup configuration** (optional) — restic repo location and password.
4. **Notification configuration** (optional) — SMTP settings.
5. **Proxy configuration** (optional) — ACME email and deployment of the managed reverse-proxy stack.
6. **Existing stack discovery** (optional) — brownfield scan, with adopt-in-place or migration of what it finds.

After the wizard, the user lands on the dashboard. All settings are editable later via the Settings page.

---

## Core Concepts

### Stack

A "Stack" represents a single `docker-compose` file with one or more Docker services (e.g., app + database). Physically
stored in a directory under the managed stacks directory (`/opt/docktor/stacks` by default, set with
`DOCKTOR_STACKS_HOST_DIR`; see [Docktor Deployment](#docktor-deployment)).

```
/opt/docktor/stacks/<stack-id>/
├── docker-compose.yml
├── .env
├── volumes/           # All service data — bind-mounted, never named Docker volumes
│   ├── app-data/
│   ├── db-data/
│   └── ...
└── logs/              # Docktor operational logs (deploy output, backup output, migration output)
```

**Stack ID:** User-provided name, slugified (lowercase, alphanumeric + hyphens, max 63 chars to stay compatible with
Docker Compose project names and DNS labels). Example: user enters "My Nextcloud" → stack ID becomes `my-nextcloud`.
Must be unique. Validated on creation.

### Template

A reusable blueprint for deploying a new stack. Includes a `docker-compose.yml`, optional `.env.example` and metadata,
organised as one or more variants. Templates live in plain git repositories that Docktor clones; there is no central
marketplace service (see [Templates](#templates)).

### Volume Strategy: Bind Mounts Only

**Requirement:** All persistent data must be bind-mounted into the stack's `volumes/` directory. Named Docker volumes
are not used.

**Rationale:** Backup simplicity (one directory = one stack), transparency (data on filesystem, not hidden in
`/var/lib/docker/volumes/`), portability (directory copy to migrate), and restic-friendly (direct backup, no
pre-processing).

```yaml
# Correct — bind mount into the stack's volumes/ directory
services:
  db:
    image: postgres:16
    volumes:
      - ./volumes/db-data:/var/lib/postgresql/data
  app:
    image: nextcloud:28
    volumes:
      - ./volumes/app-data:/var/www/html
```

```yaml
# Rejected — named Docker volumes
services:
  db:
    image: postgres:16
    volumes:
      - db-data:/var/lib/postgresql/data

volumes:
  db-data:
```

**Enforcement rules:**

The convention is enforced by the compose review (see [YAML Validation & Safety](#yaml-validation--safety)), which warns
but never blocks:

- **Relative bind mounts into `./volumes/`**: Accepted.
- **Named Docker volumes**: Flagged by the configurable "named volumes" check. Only the brownfield full migration
  converts named volumes to bind mounts automatically.
- **Absolute paths outside the stack directory**: Always flagged as a danger finding, and not included in backups.
- **Templates**: Expected to follow the bind-mount convention; the same compose checks apply when a template is turned
  into a stack.
- **Directory creation**: Docktor creates the stack directory itself; the `./volumes/` subdirectories are created by
  Docker Compose when the stack first starts.
- **Shared volumes across stacks**: Not supported; users must use absolute paths. Volume drivers/remote volumes not
  supported. Ownership/permissions documented per template.

---

## Stack Import: Greenfield vs. Brownfield

Docktor's early adopters likely already self-host via Docker Compose. Their setups won't match Docktor's conventions
(directory structure, volume strategy, env var layout). If Docktor only supports greenfield deployment, adoption requires
users to rebuild every existing stack manually.

Import is **guided, transparent, and non-destructive** — the user sees exactly what will change, approves each step, and
can abort without data loss.

### Import Modes

1. **Scan & Discover** — Search the host filesystem (through the read-only `/host` mount) for `docker-compose.yml`
   files. For each, show: directory path, service names, images, container state, and a compatibility assessment
   flagging what needs to change (named volumes, inline env vars, non-standard paths).

2. **Adopt in Place** (lightweight) — Register an existing directory as a stack in the DB without moving anything.
   Docktor monitors and manages it where it lives. Trade-off: no volume convention enforcement, incomplete backup
   coverage. Zero downtime, zero risk. Users can upgrade to full migration later.

3. **Full Migration** (recommended) — A guided wizard that stops the stack, copies data into the stack's directory,
   converts named volumes to bind mounts, extracts inline env vars to `.env`, rewrites compose paths, and restarts.
   Includes rollback on failure and user-initiated cleanup of old volumes/directories.

---

## Implementation Stack

### Architecture: Single Process

Docktor runs as a **single Fastify server** that handles everything: API, background jobs, SSE streams, and serving the
frontend. There is no separate frontend server.

**Why not Next.js for everything?** Docktor needs persistent background processes running continuously — file watcher,
container state tracking (Docker events plus a reconciliation poll), cron jobs for backups and update checks, SSE streams for live logs. Next.js is built
around request/response and doesn't support long-lived server processes alongside route handling without fighting the
framework.

**Why not Next.js as the frontend?** Docktor is a private dashboard behind auth — no SEO, no public pages, no crawlers.
SSR provides zero benefit but adds hydration complexity and larger bundles. A simple SPA is the right tool.

**Why Fastify + Vite React SPA?** Fastify natively handles everything Docktor's backend needs (HTTP, SSE, background
processes, static file serving). Vite builds the React SPA into static files at compile time. Fastify serves these files
via `@fastify/static`. In development, Vite's dev server provides HMR. In production, it's a single process serving a
single port.

### Technology Choices

| Layer                 | Technology                            | Rationale                                                                                               |
|-----------------------|---------------------------------------|---------------------------------------------------------------------------------------------------------|
| Runtime               | **Node.js (LTS) with TypeScript**     | Strong Docker SDK support, async I/O for log streaming, type safety throughout                          |
| Server framework      | **Fastify**                           | Schema-based validation, high performance, plugin ecosystem, native SSE support, serves static frontend |
| Frontend              | **React + Vite** (SPA)                | Fast builds, HMR in dev, outputs static bundle. No SSR overhead.                                       |
| UI library            | **shadcn/ui + Tailwind CSS**          | Accessible, composable components without heavy dependencies                                            |
| YAML editor           | **CodeMirror 6**                      | Mature, extensible, good YAML mode support                                                              |
| Client-side routing   | **React Router**                      | Lightweight, standard SPA routing                                                                       |
| Real-time logs        | **SSE (Server-Sent Events)**          | Simpler than WebSockets for unidirectional log streaming                                                |
| ORM / DB              | **Prisma + PostgreSQL**               | Prisma multi-file schema, PostgreSQL for robust production use                                          |
| Docker interaction    | **dockerode**                         | Mature Node.js Docker client for inspect, log streaming, events                                         |
| Compose orchestration | Shell out to `docker compose` CLI     | Wrapped in a typed service layer; dockerode doesn't handle compose natively                              |
| File watching         | **chokidar**                          | Detects external edits to compose files, with a polling reconciliation fallback                         |
| Job scheduler         | **node-cron**                         | Update checks, backup scheduling, disk and health jobs. All runs in the same process.                   |
| Auth                  | **better-auth**                       | Lightweight, session-based, with the TOTP two-factor plugin; fits the single-user model                 |

### Infrastructure / System-Level

| Concern           | Technology                                                                    |
|-------------------|-------------------------------------------------------------------------------|
| Reverse proxy     | **nginx-proxy + acme-companion**, deployed and owned by Docktor — see the Proxy section |
| Backup engine     | **Restic** invoked via CLI from the backend                                   |
| Templates         | **git** CLI, shelled out to clone and update template repositories            |
| Container runtime | **Docker Engine + Docker Compose v2** (plugin)                                |
| Packaging         | Multi-arch image (linux/amd64, linux/arm64) at `ghcr.io/docktor-app/docktor`, run through Docker Compose |
| OS target         | Any Linux host with Docker Engine and Compose v2; Debian/Ubuntu LTS is the primary target |

### Project Structure

```
docktor/
├── server/                    # Fastify backend (TypeScript)
│   ├── src/
│   │   ├── index.ts           # Server entry point (startup checks, migrations, jobs)
│   │   ├── app.ts             # createApp factory: plugins, auth, error handler, static SPA
│   │   ├── generated/         # Prisma client (generated)
│   │   ├── routes/            # HTTP boundary: Zod validation, auth, delegates to application
│   │   ├── application/       # Use-case services (stacks, backups, proxy, templates, health, ...)
│   │   ├── domain/            # Pure business rules (state machine, retention, uptime, ...)
│   │   ├── repositories/      # All Prisma queries
│   │   ├── infrastructure/    # Adapters: docker, compose, restic, git, SMTP, registry, filesystem
│   │   ├── jobs/              # Background jobs (state poller, file watcher, schedulers, probes)
│   │   └── lib/               # Technical utilities (auth, crypto, errors, startup checks)
│   ├── prisma/
│   │   ├── prisma.config.ts   # Prisma configuration (PostgreSQL, multi-file schema)
│   │   └── schema/            # One .prisma file per concern (base, auth, stack, service,
│   │                          #   proxy, backup, notification, template, two-factor, ...)
│   ├── package.json
│   └── tsconfig.json
├── client/                    # React SPA (Vite)
│   ├── src/
│   │   ├── main.tsx           # SPA entry point
│   │   ├── router.tsx         # React Router data router
│   │   ├── routes/            # Page components plus per-page section components
│   │   ├── components/        # ui (shadcn), common (generic), domain (feature-specific)
│   │   ├── hooks/             # Custom hooks: single source of server state
│   │   └── lib/               # API clients, auth client, utilities
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── shared/                    # Shared Zod schemas and inferred types
│   ├── src/validation/        # Schemas used by both server and client
│   └── package.json
├── docs/                      # Contributor docs (this file) and the template repository format
├── Dockerfile                 # Multi-stage, multi-arch image build
├── docker-compose.yml         # Docktor's own deployment (app + Postgres)
├── docker-compose.build.yml   # Override that builds the image from source
├── docker-compose.dev.yml     # Development database (Postgres only)
└── tsconfig.json              # Root TypeScript config (project references)
```

The layering rules between these directories are described in [CLAUDE.md](../CLAUDE.md).

### Build & Deployment

The [Dockerfile](../Dockerfile) is a multi-stage build:

1. **client-build** runs on the build platform (it only produces static JS and CSS, so it never needs emulation). It
   installs dependencies with Yarn, builds `@docktor/shared`, then builds the Vite SPA.
2. **server-build** runs once per target platform, because its `node_modules` (including the Prisma CLI used for
   migrations at container start) is copied into the final image. It runs `prisma generate` first, then builds shared and
   compiles the server with `tsc`.
3. **restic-install** downloads a pinned restic release binary for the target architecture and verifies it against the
   release's `SHA256SUMS` in the same layer, so an unverified binary can never be picked up. Only the binary is copied
   out, which keeps `bzip2` out of the final image.
4. **Runtime** starts from `node:22-slim`, installs `git`, `iproute2` and `lsof`, and installs the Docker CLI and the
   Compose plugin as pinned, sha256-verified downloads per architecture. It copies in the compiled server, shared
   package, Prisma schema and the built client, and starts `node dist/server/index.js`. Fastify serves the SPA through
   `@fastify/static` and the API under `/api/`.

The image is built for linux/amd64 and linux/arm64 and published to `ghcr.io/docktor-app/docktor` by CI. The server
applies pending Prisma migrations on startup (`DOCKTOR_DB_AUTO_MIGRATE`, on by default). Building from source is
supported through `docker-compose.build.yml`.

### Development Workflow

Contributors follow the setup steps in [CONTRIBUTING.md](../CONTRIBUTING.md). In development, both the Vite dev server
and Fastify run simultaneously, started by a single `yarn dev` in the repository root:

- `yarn dev` first builds `@docktor/shared` once, then starts the server (`tsx watch`, configuration from
  `.env.development`) and the client (`vite`) side by side through `concurrently`.
- **Vite dev server** (`localhost:5173`): Serves the React SPA with HMR. API requests are proxied to Fastify via
  `client/vite.config.ts`:
  ```typescript
  // client/vite.config.ts
  export default defineConfig({
    server: {
      proxy: { '/api': 'http://localhost:3000' }
    }
  });
  ```
- **Fastify** (`localhost:3000`): Handles API routes, background jobs, SSE streams. It serves the built SPA only when
  `NODE_ENV=production`; in development Vite handles that.
- **Shared schemas** are consumed from the built output of `@docktor/shared` (`shared/dist`). `yarn dev` builds it once
  at start; after changing a schema, rebuild it (`yarn workspace @docktor/shared build`) or run
  `yarn workspace @docktor/shared dev` for a `tsc --watch` build.

---

## Docktor Deployment

### Architecture: Docker Managing Docker

Docktor itself runs as a Docker Compose stack. This creates a recursive situation: a container that manages other
containers and needs access to both the Docker daemon and the host filesystem. This is solved entirely through bind
mounts and the Docker socket — no Docker-in-Docker (DinD) required.

```
┌─── Host Filesystem ─────────────────────────────────────┐
│                                                          │
│  /var/run/docker.sock          (Docker daemon)           │
│  /opt/docktor/stacks/          (all managed stacks)      │
│  ./dev-data/docktor/db/        (Postgres data, next to   │
│                                 docker-compose.yml)      │
│                                                          │
│  ┌─── Docktor Container (ghcr.io/docktor-app/docktor) ──┐│
│  │  Port 3000 → Fastify (API + React SPA + jobs)        ││
│  │                                                      ││
│  │  Mounts:                                             ││
│  │    /var/run/docker.sock → Docker API access          ││
│  │    /opt/docktor/stacks  → read/write stacks, mounted ││
│  │                           at the SAME path as on the ││
│  │                           host                       ││
│  │    /host (read-only)    → host root, for brownfield  ││
│  │                           scans and disk monitoring  ││
│  │  Tools: docker CLI + compose plugin, restic, git     ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ┌─── Postgres container (postgres:18) ────────────────┐ │
│  │  Docktor's own database                              │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─── Stack: Nextcloud ────────────────────────────────┐ │
│  │  /opt/docktor/stacks/nextcloud/                      │ │
│  │    ├── docker-compose.yml                            │ │
│  │    ├── .env                                          │ │
│  │    └── volumes/                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Docktor's Own Compose File

[docker-compose.yml](../docker-compose.yml) in the repository root is the source of truth for the deployment; it is not
duplicated here. In short:

- **`docktor` service**: image `ghcr.io/docktor-app/docktor:latest`, published on port `3000:3000`, configuration from
  the `.env` file next to the compose file (see [.env.example](../.env.example) for every variable).
- **Docker socket**: `/var/run/docker.sock` is mounted so Docktor can drive the host's Docker daemon.
- **Stacks volume**: `${DOCKTOR_STACKS_HOST_DIR:-/opt/docktor/stacks}` is mounted at the identical path inside the
  container, and `DOCKTOR_STACKS_DIR` is derived from the same variable, so the two sides cannot drift apart.
- **Host root**: `/:/host:ro` gives Docktor a read-only view of the host filesystem.
- **`db` service**: `postgres:18`, with its data under `./dev-data/docktor/db`, and a health check that gates Docktor's
  start. The password comes from `POSTGRES_PASSWORD` in `.env`.

[docker-compose.build.yml](../docker-compose.build.yml) overrides the image with a locally built one for people who
build from source.

### Key Design Decisions

- **Docker socket, not DinD**: Docktor mounts the host's Docker socket. Managed containers are siblings on the host, not
  nested children. Same pattern as Portainer and Traefik. Docker socket access is effectively root — documented clearly.
- **The stacks directory is mounted at the same path on host and in the container**: `docker compose` inside the
  container resolves each stack's relative `./volumes/` bind mounts against its own filesystem view and sends the
  resulting absolute paths to the host daemon. If the two sides differ, the daemon creates the data in the wrong place.
  Docktor asserts the mapping at startup and refuses to run against a mismatched stacks directory.
- **Path translation**: Because the paths are identical, no explicit translation is needed for stack operations. The
  read-only `/:/host:ro` mount is used for brownfield scanning and so that disk monitoring sees the host's real
  filesystem (`DOCKER_DATA_PATH=/host/var/lib/docker`) instead of the container's own.
- **Not self-managed**: Docktor does not appear in its own UI. Updates are handled from the host with
  `docker compose pull && docker compose up -d`; migrations run automatically on start.
- **Getting started**: There is no installer script. The documented install is the compose file and `.env.example`; see
  the docs-site [Get started](https://github.com/docktor-app/docks/blob/main/guide/get-started.md) page.

---

## Database Schema

The source of truth for the schema is `server/prisma/schema/*.prisma` (multi-file Prisma schema with PostgreSQL).

### Model Summary

| Model        | Purpose                                      | Key Fields                                                            |
|--------------|----------------------------------------------|-----------------------------------------------------------------------|
| User         | Admin account (better-auth managed)          | id, email, name, createdAt                                            |
| Session      | Auth sessions (better-auth managed)          | id, userId, token, expiresAt                                          |
| Account      | Auth provider accounts (better-auth managed) | id, userId, providerId, accountId                                     |
| Verification | Auth verification tokens                     | id, identifier, value, expiresAt                                      |
| Stack        | A managed docker-compose stack               | id (slug), displayName, hostPath, status, lastKnownHash, configChanged |
| Service      | Parsed service from a stack's compose file   | stackId, serviceName, image, containerId, containerState, healthStatus |
| ProxyConfig  | Reverse proxy mapping for a service          | stackId, serviceName, domain, internalPort, tlsEnabled                |
| Backup       | A restic backup snapshot record              | stackId, resticSnapshotId, sizeBytes, trigger, status                 |
| StatusLog    | Append-only audit trail of state transitions | stackId, fromStatus, toStatus, message, output                       |
| Deployment   | Record of each deploy/update                 | stackId, templateId, composeHash, success, errorMessage               |
| StackEvent   | Config and update events per stack           | stackId, type (config_changed, config_error, update_available), message |
| ImageUpdateCheck | Cached registry lookup per image reference | imageRef, latestTag, latestDigest, currentDigest, hasUpdate          |
| ServiceHealthEvent | Per-service health transitions (Docker healthcheck or HTTP probe) | stackId, serviceName, fromStatus, toStatus, source |
| StackIncident | Unhealthy periods per stack, for uptime and incidents | stackId, triggerType, createdAt, resolvedAt                     |
| StackVolumeUsage | Last measured size of each `volumes/` subdirectory | stackId, name, sizeBytes, measuredAt                             |
| Notification | In-app notification, with whether an email was sent | type, stackId, message, emailSent                                  |
| Certificate  | Uploaded custom TLS certificate              | domainPattern, certificate chain, privateKey (AES-256-GCM encrypted; written to disk at mode 0600 for the proxy) |
| TemplateRepo, Template, TemplateVariant | Template git repositories and their parsed catalogue | url, headCommitSha, slug, name, category      |
| TwoFactor    | TOTP secret and recovery codes (encrypted)   | userId, secret, backupCodes                                           |
| RateLimit    | Persistent auth rate-limit counters          | key, count, lastRequest                                               |
| Setting      | Global key-value configuration               | key, value, encrypted                                                 |
| Registry     | Reserved for registry credentials; not used by any feature yet (see Registry Configuration) | name, url, username, password (encrypted), isDefault |

### Key Design Decisions

- **Stack ID is the primary key** — it's the slugified name and also the directory name. No surrogate key needed.
- **Service model stores parsed data** — extracted from compose file on parse. Also stores runtime container state
  updated by the poller.
- **JSON fields for complex data** — Ports and volumes are stored as JSON strings. This avoids many-to-many join tables
  for data that's always read/written as a unit.
- **Setting model is key-value** — flexible for adding new settings without migrations. Encrypted flag marks values that
  need decryption before use (SMTP password, restic password and repository credentials).
- **StatusLog is append-only** — never updated or deleted (except via retention cleanup). Provides a complete audit
  trail.

---

## Compose File Parsing & File Watching

### Source of Truth Principle

The `docker-compose.yml` on disk is always authoritative. The database stores derived metadata only. This means external
edits (e.g., via SSH) are a supported workflow, not a bug.

### File Watcher

A background process using **chokidar** (Node.js) monitors each stack's `docker-compose.yml` (and `.env`) under the
managed stacks directory:

- On change detection: re-hash file (SHA256), compare to `lastKnownHash` in DB.
- If hash differs: re-parse, update DB metadata, flag stack as "config changed" in the UI. A file that no longer parses
  records a `config_error` on the stack instead of being silently ignored.
- Polling interval as fallback: every 60 seconds, reconciliation loop hashes all compose files to catch any events
  missed by the filesystem watcher (e.g., NFS mounts where inotify is unreliable). The image defaults the watcher to
  polling mode (`DOCKTOR_FS_POLLING=true`) because Docker Desktop bind mounts do not propagate inotify events; it can be
  turned off on a native Linux host.

### What to Extract on Parse

- Service names
- Image names and tags
- Published ports
- Environment variables
- Volume mounts — **validated against bind-mount convention** (see Volume Strategy)
- Health check definitions (if present)
- The optional per-service `x-docktor: health-probe:` block (see Status & Health Checks)

### Cache Strategy

- Store `lastParsedAt` and `lastKnownHash` per stack (the `.env` file's hash is tracked separately).
- Re-parse only if hash changes.

---

## UI & User Interaction

### Stack Management

- Create a stack by pasting YAML, from a template, or by importing an existing compose project.
- View/edit the compose file (CodeMirror) and the `.env` file (table or raw editor) with syntax validation.
- Saving an edit to an existing stack shows a unified diff together with any compose-check warnings in one confirmation
  step (see [YAML Validation & Safety](#yaml-validation--safety)).
- Deploy stack (creates directory, writes files, runs `docker compose up -d`).
- Visual indicator when on-disk config differs from last-deployed state.

### Logs

Live streaming via SSE: dockerode's container log stream pushes lines to the frontend. Each service gets its own stream;
the UI shows a combined view with service-name prefixes and per-service filtering. Docker's `json-file` logging driver
with rotation (`max-size: 10m`, `max-file: 5`) handles persistence. The `logs/` directory in the stack is reserved for
Docktor's operational logs (deploy output, backup output), not container logs.

### Status & Health Checks

Status is derived from container state (`docker inspect`) and Docker's native `HEALTHCHECK`. A service can opt in to an
HTTP health probe with an `x-docktor: health-probe:` block in the compose file; when present, the probe replaces the
Docker healthcheck as that service's only health signal. Probes run every 30 seconds from Docktor's container, count any
2xx/3xx response as healthy, and mark a service unhealthy after 3 consecutive failures (with a startup grace period).
Stack health is aggregated from the services' health.

The StatusLog records stack status transitions, and service health transitions are kept as `ServiceHealthEvent` rows
(pruned after a configurable retention). Per-stack uptime percentage and the list of unhealthy incidents (start, end,
duration) are computed from these records.

### Stack Lifecycle State Machine

**States:**

| State        | Meaning                                                                             |
|--------------|-------------------------------------------------------------------------------------|
| `DRAFT`      | Stack created in DB, compose file written, but never deployed.                      |
| `DEPLOYING`  | `docker compose up -d` is currently running.                                        |
| `RUNNING`    | All containers are up. No healthcheck defined, or healthcheck not yet evaluated.    |
| `HEALTHY`    | All containers are up and all healthchecks pass.                                    |
| `UNHEALTHY`  | One or more containers report unhealthy via Docker HEALTHCHECK.                     |
| `STOPPED`    | All containers are stopped (user-initiated via `docker compose stop`).              |
| `ERROR`      | Deploy failed, or one or more containers are in a crash loop / exited unexpectedly. |
| `UPDATING`   | Pulling new images and recreating containers.                                       |
| `BACKING_UP` | Backup in progress (the stack keeps running; optional pre/post hooks run around it). |
| `RESTORING`  | Restore from backup in progress.                                                    |
| `MIGRATING`  | Brownfield full migration in progress.                                              |

**Transitions:**

```
                    ┌──────────────────────────────────────┐
                    │                                      │
  ┌───────┐   deploy   ┌───────────┐   success   ┌─────────┐
  │ DRAFT │──────────►│ DEPLOYING │────────────►│ RUNNING │
  └───────┘           └───────────┘              └────┬────┘
                           │                          │
                        failure                  healthcheck
                           │                      passes
                           ▼                          │
                      ┌───────┐                  ┌────▼─────┐
                      │ ERROR │◄─── unhealthy ──│ HEALTHY  │
                      └───┬───┘                  └────┬─────┘
                          │                           │
                       deploy                    healthcheck
                       (retry)                     fails
                          │                           │
                          ▼                      ┌────▼──────┐
                    ┌───────────┐                │ UNHEALTHY │
                    │ DEPLOYING │                └───────────┘
                    └───────────┘

  From RUNNING/HEALTHY/UNHEALTHY:
    ── stop ────────► STOPPED
    ── update ──────► UPDATING ──► RUNNING/HEALTHY or ERROR
    ── backup ──────► BACKING_UP ──► (previous state)
    ── restore ─────► RESTORING ──► DEPLOYING ──► RUNNING/HEALTHY or ERROR

  From STOPPED:
    ── deploy ──────► DEPLOYING ──► RUNNING/HEALTHY or ERROR

  From ERROR:
    ── deploy ──────► DEPLOYING (user retries after fixing the issue)
    ── stop ────────► STOPPED
```

**Auto-transitions** (no user action): RUNNING↔HEALTHY↔UNHEALTHY↔ERROR based on healthcheck and container state
changes. BACKING_UP returns to previous state on completion. Container state is event-driven (Docker events) with a
60-second reconciliation poll as a safety net.

The transition table in `server/src/domain/stack-status-machine.ts` is authoritative; the diagram above shows the main
paths.

### Operation Locking via State

The state machine prevents conflicting concurrent operations. The UI disables buttons accordingly:

| Current state                       | Allowed actions                                   |
|-------------------------------------|---------------------------------------------------|
| `DRAFT`                             | Deploy, Update, Delete                            |
| `DEPLOYING`                         | (none — wait)                                     |
| `RUNNING` / `HEALTHY` / `UNHEALTHY` | Deploy, Stop, Restart, Update, Backup, Restore    |
| `STOPPED`                           | Deploy (start), Update, Backup, Restore, Delete   |
| `ERROR`                             | Deploy (retry), Stop, Update, Restore, Delete     |
| `UPDATING`                          | (none — wait)                                     |
| `BACKING_UP`                        | (none — wait)                                     |
| `RESTORING`                         | (none — wait)                                     |
| `MIGRATING`                         | (none — wait)                                     |

A stack that is running must be stopped before it can be deleted. Stacks flagged `isProtected` (the managed proxy stack)
refuse stop, restart and delete through the normal actions.

### Disk Space Monitoring

Two mechanisms:

- **Host disk space**: a periodic check of the filesystem that holds Docker's data (`statfs` on `DOCKER_DATA_PATH`,
  normally `/host/var/lib/docker` through the read-only host mount). It raises a disk-space warning notification when free
  space drops below 10% or 2 GiB; both thresholds are settings (`disk.thresholdPercent`, `disk.thresholdBytes`).
- **Per-stack usage**: a daily job (00:15) sizes each stack directory and each subdirectory of its `volumes/` folder with
  `du -sk` and stores the result. The Storage page shows a sortable per-stack and per-volume breakdown with a total.

### Updates

Docktor checks registries for newer images using semver comparison, date-based comparison, or digest comparison as
fallback. Updates are never automatic — always user-initiated via an "Update" button.

---

## Networking

### Current Scope

Each stack gets its own default Docker bridge network (standard `docker compose` behavior). Services within a stack can
communicate freely. The one shared network is `docktor_proxy`, which the managed reverse proxy and every service that is
exposed through it join (see Proxy Configuration).

### Inter-Stack Communication — Not implemented

A Docktor-managed "shared" overlay network that stacks can opt into, where only explicitly declared connections are
allowed. Today, users who need inter-stack communication can manually add `external: true` networks to their compose
files.

---

## Proxy Configuration

### Philosophy

Rather than building a reverse proxy from scratch, Docktor builds on **nginx-proxy** and **acme-companion**, which
configure themselves from the environment of the containers they route to. They react to Docker events through the
socket, so Docktor needs no external API integration, which fits the YAML-first, event-driven architecture. (An earlier
design considered integrating with Nginx Proxy Manager; its REST API is undocumented, so it was dropped.)

### How It Works

1. Docktor deploys and owns a proxy stack (`nginx-proxy` plus `acme-companion`, with ports 80 and 443) during the first-run
   wizard or from Settings. The stack is flagged protected, so normal stop, restart and delete actions refuse it, and
   whether it shows in the dashboard is a setting (`proxy.showInDashboard`). If ports 80 or 443 are already taken, the
   deployment fails with a clear error rather than falling back to other ports.
2. When a user assigns a domain to a service, Docktor writes the routing variables (`VIRTUAL_HOST`, `VIRTUAL_PORT`, and
   `LETSENCRYPT_HOST` for ACME certificates) and the shared `docktor_proxy` network into that service's compose file, then
   redeploys it. The `ProxyConfig` table is derived from, and reconciled with, what is written in the compose file.
3. Certificates come from Let's Encrypt through `acme-companion` (the ACME email is the `proxy.acmeEmail` setting), or
   from a certificate the user uploads, including wildcard certificates, with an expiry warning. A background poller
   surfaces pending, issued and failed certificate state on the stack detail page.

### Exposure Rules

Per service, the user can define:

- **One or more domain names** (e.g., `cloud.example.com`); each domain is unique across the instance.
- **Internal service port** (e.g., `nextcloud:80`).
- **TLS:** on by default (automatic certificates), or an uploaded custom certificate.

Only services explicitly given a domain are routed. Supporting services (databases, Redis, etc.) remain on internal
Docker networks only. If a proxied service also publishes a host port directly, Docktor warns but leaves both in place.

Per-service public/private (LAN-only) restriction and raw Nginx configuration generation are **not implemented**.

---

## Secrets & Environment Variables

### Problem

`.env` files contain secrets (DB passwords, API keys) and sit in plaintext on disk. This is standard Docker practice but
is a risk if the host is compromised.

### Approach

- A stack's `.env` file remains on disk (consistent with how Docker Compose expects it) and is not copied into the
  database. Docktor writes it with the default file mode of its process; it does not tighten permissions beyond what the
  host provides.
- Docktor's own secrets are the exception: the SMTP password, restic repository password and credentials, and uploaded
  TLS private keys are stored in the database encrypted with AES-256-GCM, keyed by the `ENCRYPTION_KEY` environment
  variable (64 hexadecimal characters). The server refuses to start without it. TLS private keys are written to disk
  with mode `0600` for the proxy. Two-factor secrets and recovery codes are encrypted by better-auth using
  `BETTER_AUTH_SECRET`.
- Backups via restic are encrypted at rest, which covers the backup vector.
- Required deployment secrets (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ENCRYPTION_KEY`) are validated at
  startup. A missing or malformed value stops the server with a message that lists what to fix.

### Not implemented

- Optional integration with **Docker Secrets** for swarm-capable setups.
- Optional encryption of `.env` files at rest using a master key derived from the user's password (decrypted into memory
  on stack deploy).

> **Design note:** Storing a stack's secrets in the database was considered but rejected — it would make the DB a
> high-value target and duplicate what's already on the filesystem. Filesystem permissions on the host plus encrypted
> backups is the pragmatic path.

---

## Global Settings

Instance-level configuration is stored in the database (in the `Setting` key-value model) and is editable on the Settings
page. Deployment-level configuration (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ENCRYPTION_KEY`, the stacks
directory) is not a setting: it comes from the environment (`.env`, see [.env.example](../.env.example)) and is validated
when the server starts. `BETTER_AUTH_URL` and the `baseUrl` setting both feed the set of trusted origins for sign-in.

### Settings Categories

**General:**

| Key            | Type   | Description                                                             |
|----------------|--------|-------------------------------------------------------------------------|
| `instanceName` | string | Display name for this Docktor instance (e.g., "My Home Server")         |
| `baseUrl`      | string | External URL for Docktor (e.g., `https://docktor.example.com`)          |
| `timezone`     | string | IANA timezone (e.g., `Europe/Berlin`) for scheduling and log timestamps |

**Backup (Restic):**

| Key                                                     | Type               | Description                                                          |
|---------------------------------------------------------|--------------------|----------------------------------------------------------------------|
| `backup.repoType`                                       | string             | `local`, `sftp` or `s3`                                              |
| `backup.repoPath`                                       | string             | Repository location                                                  |
| `backup.sftpHost`, `backup.sftpUser`, `backup.sftpKey`  | string (key encrypted) | SFTP connection details                                          |
| `backup.s3Endpoint`, `backup.s3Bucket`, `backup.s3AccessKey`, `backup.s3SecretKey` | string (secret encrypted) | S3-compatible connection details |
| `backup.password`                                       | string (encrypted) | Repository encryption password                                       |
| `backup.defaultSchedule`                                | string             | Default cron expression (e.g., `0 2 * * *` for daily at 2 AM)        |
| `backup.defaultRetention`                               | JSON               | Retention policy (e.g., `{ "daily": 7, "weekly": 4, "monthly": 6 }`) |

**Notifications (SMTP):**

| Key                                                             | Type               | Description                                |
|-----------------------------------------------------------------|--------------------|--------------------------------------------|
| `smtp.host`, `smtp.port`, `smtp.encryption`, `smtp.username`    | string / number    | SMTP server connection                     |
| `smtp.password`                                                 | string (encrypted) | SMTP password                              |
| `smtp.from`                                                     | string             | Sender email address                       |
| `notify.stackError`, `notify.backupFailure`, `notify.diskWarning` | boolean          | Per-trigger toggles                        |
| `disk.thresholdPercent`, `disk.thresholdBytes`                  | number             | Low-disk warning thresholds (10%, 2 GiB)   |

**Proxy:** `proxy.acmeEmail` (Let's Encrypt registration email) and `proxy.showInDashboard`.

**Compose checks and health:** `diffConfirm.skip` (skip the review dialog when an edit introduces no new findings),
`composeChecks.<rule>.enabled` (per configurable check) and `health.retentionDays` (health history retention).

**Security:** `auth.requireTwoFactor` (instance-wide mandatory two-factor authentication).

---

## Registry Configuration

Docktor needs access to Docker registries to check for image updates.

### Public Registries

Works with publicly accessible images from Docker Hub, GHCR, and Quay.io. Update checks use the registry's HTTP API
(v2 manifest endpoint) to compare digests and list tags. Results are cached per image reference.

### Authenticated Registries — Not implemented

A Registry management page in Settings that adds registries with credentials (stored encrypted), used for pulling images,
querying tags during update checks, and accessing private template images. The `Registry` table exists in the schema but
no feature reads or writes it yet.

---

## YAML Validation & Safety

Docktor should never prevent users from doing what Docker itself allows, but ensures dangerous choices are made
*knowingly*. Every check only warns; none blocks a save or a deploy.

**Review step:** saving an edit to an existing stack shows a unified diff of the compose and `.env` changes together
with the findings, in one confirmation dialog. For a new stack there is nothing to diff, so only the findings are shown.
Checks run again right before every deploy, which also catches edits made outside Docktor. A setting can skip the dialog
when an edit introduces no new finding.

**Checks** are a rule registry (Strategy pattern): each rule implements one interface and is registered in a list, so a
new built-in rule is a one-file change. There is no mechanism for loading rules from outside.

| Check               | Severity | Configurable | Flags                                                              |
|---------------------|----------|--------------|--------------------------------------------------------------------|
| `privileged`        | danger   | no           | `privileged: true`                                                 |
| `dockerSocket`      | danger   | no           | A mount of the Docker socket                                       |
| `bindOutsideStack`  | danger   | no           | A bind mount that resolves outside the stack directory             |
| `namedVolume`       | warning  | yes          | Named Docker volumes instead of `./volumes/` bind mounts           |
| `inlineEnv`         | warning  | yes          | Hardcoded literal values in `environment:`                         |
| `missingEnvFile`    | warning  | yes          | A service that does not load the stack's `.env` file               |

**Other layers:**

1. **Syntax validation:** YAML parse errors are shown inline in the editor before deployment and recorded as a
   `config_error` if the file changes on disk.
2. **Port conflicts:** Before every deploy Docktor checks whether a published host port is already in use. A conflict
   with another managed stack names that stack; a conflict with another process is identified with `ss` or `lsof` where
   available and reported as "unknown process" otherwise.

---

## Notifications

Every notification is stored in the database and shown in the app. If SMTP is configured, it is also sent by email to
the instance's user address. Triggers:

- **Stack enters `ERROR` or `UNHEALTHY` state** — includes the stack name and state.
- **Backup failure** — includes stack name and error message.
- **Disk space warning** — triggered when available disk drops below the configured thresholds (default 10% or 2 GiB).

Each trigger type can be individually enabled or disabled in Settings (`notify.stackError`, `notify.backupFailure`,
`notify.diskWarning`).

---

## Backup & Restore

**What gets backed up:** The entire stack directory (`docker-compose.yml`, `.env`, `volumes/`), excluding `logs/` and
`backups/`. Absolute-path volumes outside the stack are not included (flagged at edit time by the compose checks).

**Engine:** Restic — encrypted, deduplicated, versioned snapshots. Target in v0.1.0: a per-stack local directory (SFTP and S3-compatible settings exist but are not yet used as a destination)
Snapshot metadata stored in the database. The restic binary is pinned and checksum-verified in the image.

**Consistency:** Backups run against the live stack without stopping it. Each stack can define an optional shell pre-hook
and post-hook, run from the stack directory, for application-aware backups (e.g., `pg_dump` before backup).

**Restore:** Select snapshot → stop stack → restic restore → redeploy.

**Scheduling:** Per-stack cron expressions via node-cron. Configurable retention policies (daily/weekly/monthly), applied
with `restic forget` after scheduled backups.

---

## Templates

A template is a blueprint for a new stack. Templates are not hosted by Docktor: there is no marketplace service and no
registry API. Docktor clones one or more plain git repositories (the default is `github.com/docktor-app/templates`; more
can be added in Settings) and reads a fixed folder layout out of them. Each template has one or more variants (for
example with and without Redis), each a self-contained compose file with metadata. The repository format is described in
[templates.md](templates.md).

The Templates page is a searchable card grid with a category filter. A stack created from a template pins the commit it
was created from, and a passive "template updated" badge appears when the repository has moved on; nothing is applied
automatically. Compose checks apply to template content like any other compose file. Private repositories and
credentials embedded in repository URLs are not supported.

---

## Security Summary

| Concern                      | Mitigation                                                                                        |
|------------------------------|---------------------------------------------------------------------------------------------------|
| Docker socket access         | Required for operation. Equivalent to root. Documented on the docs site's [Security](https://github.com/docktor-app/docks/blob/main/security.md) page. |
| Host filesystem              | Mounted read-only (`/:/host:ro`) for brownfield scans and disk monitoring. Remove or narrow the mount if you do not use those features. |
| Auth                         | Session auth via better-auth. Optional or instance-wide mandatory TOTP 2FA with recovery codes. Database-backed rate limiting on auth endpoints. HttpOnly, SameSite=Lax cookies, Secure on https. Self-registration closes once the first account exists. |
| HTTPS for UI                 | Docktor does not terminate TLS for its own UI. Put it behind a TLS-terminating reverse proxy, set `BETTER_AUTH_URL` to the https URL (which makes session cookies Secure) and set `TRUST_PROXY` so the sign-in rate limit sees real client IPs. The managed proxy stack serves the stacks Docktor manages. |
| CSRF                         | better-auth's origin check on `/api/auth/*`; Docktor's own Origin check on every other state-changing `/api` request (`server/src/lib/origin-guard.ts`); SameSite=Lax cookies; CORS off in production. No token layer. |
| Password reset               | Not available; reset endpoints are disabled. Lost 2FA is reset on the server, see the docs-site [reset procedure](https://github.com/docktor-app/docks/blob/main/reference/deployment.md#resetting-two-factor-authentication). Email reset is tracked in [#79](https://github.com/docktor-app/docktor/issues/79). |
| Secrets on disk              | A stack's `.env` stays on disk as Docker Compose expects, with the host's default file permissions. Uploaded TLS private keys are written with mode `0600`. |
| Secrets in DB                | SMTP password, restic password and repository credentials, and uploaded TLS private keys are AES-256-GCM encrypted with `ENCRYPTION_KEY`. Two-factor secrets are encrypted with `BETTER_AUTH_SECRET`. |
| Secrets in backups           | Restic encryption at rest.                                                                        |
| Arbitrary YAML               | Review step with diff and warnings; dangerous settings are flagged distinctly. Never blocks, always informs. |
| Template content             | Templates come from git repositories the user chose, and the same compose checks apply before deploy. |
| RBAC                         | Not implemented. Every signed-in user has full access; the single-user model suits the personal-server use case. |

---

## Future Roadmap (Not Implemented)

- RBAC and multi-user access control per stack
- Inter-stack networking with shared Docker networks
- Authenticated private registry support
- Docktor self-update via the UI
- Email-based password reset ([#79](https://github.com/docktor-app/docktor/issues/79))
- Plugin system for extensibility
- Form-based YAML abstraction (JSON Schema rendering)
- Metrics and dashboards (Prometheus/Grafana integration)
- OAuth or LDAP integration
- Docker Secrets integration
- Template signing and automated security scanning

---

## Summary

Docktor favors simplicity, file-based configuration, and user empowerment. It is designed for a single server, a single
user, and the principle that the tool should make Docker easier without making it less capable. The YAML-first approach
and bind-mount volume convention keep the system transparent and recoverable — if Docktor disappears, the user still has
working compose files and all their data in plain directories on disk.
