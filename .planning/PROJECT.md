# Docktor

## What This Is

Docktor is a self-hosting management platform that provides a UI-driven experience for deploying, updating, and managing
Docker-based applications using `docker-compose`. It targets end users running a single VPS or local server who want to
self-host applications (Nextcloud, Vaultwarden, Gitea, etc.) without deep Docker expertise. The entire system runs as
a single Fastify server — API, background jobs, SSE streams, and static React SPA — deployed as a Docker Compose stack.

## Core Value

Users can deploy, monitor, and manage Docker Compose stacks through a browser UI without needing SSH or Docker CLI access.

## Requirements

### Validated

<!-- Shipped and confirmed working — inferred from existing codebase. -->

- ✓ User can sign up and log in with email + password (better-auth, session-based) — existing
- ✓ User session persists across browser refresh — existing
- ✓ User can create a stack by pasting a docker-compose YAML — existing
- ✓ User can view the dashboard with stack list, status counts, and recent stacks — existing
- ✓ User can view stack detail: services table, compose/env editors, action buttons — existing
- ✓ User can deploy a stack (`docker compose up -d`) — existing
- ✓ User can stop a stack (`docker compose stop`) — existing
- ✓ User can restart a stack (`docker compose restart`) — existing
- ✓ User can delete a stack — existing
- ✓ Stack status transitions are enforced by a 10-state state machine — existing
- ✓ Stack detail shows a "config changed" alert when compose file differs from last deploy — existing
- ✓ Database schema covers all planned models (Stack, Service, Backup, Settings, etc.) — existing
- ✓ Shared Zod validation schemas used by both client and server — existing
- ✓ File watcher detects external compose edits (chokidar + 60s polling fallback), flags "config changed" — Validated in Phase 02: Observability
- ✓ Update checker polls registries for newer images (semver/date/digest comparison), exposes per-service upgrade with a version picker — Validated in Phase 02: Observability
- ✓ StackEvent audit trail (config_changed, config_error, update_available) queryable per stack and shown in a dedicated Event Log card, distinct from the status-transition log — Validated in Phase 02: Observability (emerged from UAT gap G-02-16)
- ✓ Database schema managed via real Prisma migrations (`migrate deploy`), with zero-touch auto-baselining of a pre-migration `db push` install — Validated in Phase 09: Deployment and Release Readiness
- ✓ CI runs typecheck + unit tests on Windows and macOS (in addition to Linux), required on `main` branch protection — Validated in Phase 09: Deployment and Release Readiness
- ✓ User can upload a custom TLS certificate (with private key and optional CA bundle) per domain as an alternative to automatic ACME issuance, including wildcard support and an expiry warning — Validated in Phase 09: Deployment and Release Readiness

### Active

<!-- Current scope. Building toward these. -->

**MVP Completion:**
- [ ] Container state poller runs every 15s, updating stack/service status from `docker inspect`
- [ ] Live container log streaming via SSE (per-service, combined view with service-name prefixes)
- [ ] Basic settings page: instance name, base URL, timezone — stored in DB Settings model

**Post-MVP — Reliability & Observability:**
- [x] File watcher detects external compose edits (chokidar + 60s polling fallback), flags "config changed" — Validated in Phase 02: Observability
- [x] Update checker polls registries for newer images (semver/digest comparison), exposes update button — Validated in Phase 02: Observability

**Post-MVP — Notifications:**
- [x] SMTP notification for stack entering ERROR or UNHEALTHY state — Validated in Phase 03: Notifications
- [x] SMTP notification for disk space warnings (below 10% or 2 GB) — Validated in Phase 03: Notifications
- [ ] SMTP notification for backup failures — Deferred to Phase 04: Backup & Restore
- [x] Per-trigger enable/disable in Settings — Validated in Phase 03: Notifications

**Post-MVP — Backup & Restore:**
- [ ] User can configure restic repository (local path, SFTP, S3) and password via Settings
- [ ] User can trigger a manual backup for a stack
- [ ] Backup scheduling via per-stack cron expressions
- [ ] Configurable retention policies (daily/weekly/monthly)
- [ ] User can restore a stack from a restic snapshot

**Post-MVP — First-Run Wizard:**
- [ ] On first boot with no user, show wizard: account creation, base config, optional backup + notification config
- [ ] Optional brownfield scan step in wizard

**Post-MVP — Brownfield Import:**
- [ ] Scan host filesystem for `docker-compose.yml` files with compatibility assessment
- [ ] Adopt-in-place: register an existing directory as a stack without moving anything
- [ ] Full migration wizard: stop → copy → convert volumes → rewrite paths → restart with rollback support

**Post-MVP — Proxy Configuration:**
- [ ] Docktor-managed `nginx-proxy` + `acme-companion` integration: configure domain/port/TLS exposure per service by writing routing env vars into its compose config
- [ ] Raw Nginx config generation for advanced users

### Out of Scope

- Marketplace — deferred; not in this roadmap cycle
- RBAC / multi-user access control — single-user model sufficient for personal server use case
- Inter-stack networking (Docker overlay networks) — users can use `external: true` manually
- Metrics dashboards (Prometheus/Grafana) — out of product scope
- OAuth / LDAP integration — better-auth email/password is sufficient
- Docker Secrets integration — filesystem + encrypted backups covers MVP security needs
- Plugin system — adds complexity without near-term user benefit
- Docktor self-update via UI — users run `docker compose pull && up -d` from host

## Context

Brownfield project with significant existing implementation. The foundation (auth, CRUD, state machine, dashboard, detail
page, create page) is fully built. The three remaining MVP items have partial implementations in untracked files
(`server/src/jobs/state-poller.ts`, `client/src/hooks/use-log-stream.ts`, settings routes/UI). These should be completed
before starting post-MVP phases.

Key architectural constraints:
- Single Fastify process: API + background jobs + SSE + static files (no separate frontend server in production)
- YAML-first: compose file on disk is source of truth; DB stores derived metadata only
- Bind mounts only: named Docker volumes are rejected; all data in `./volumes/` subdir
- Docker socket access: Docktor mounts host Docker socket (effectively root — documented in install guide)
- Stack ID = primary key = directory name = slugified user-provided name

## Constraints

- **Tech stack**: Node.js + TypeScript + Fastify + React + Vite + Prisma + PostgreSQL — locked
- **Docker interaction**: dockerode for inspect/log streaming; shell out to `docker compose` CLI for compose operations
- **Auth**: better-auth (email + password only for MVP) — no OAuth until post-MVP
- **Single-host**: Not a clustering tool; one server, one Docktor instance

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single Fastify process (not Next.js) | Needs persistent background jobs + SSE streams; Next.js doesn't support this well | — Pending |
| YAML-first (file = source of truth) | Supports external edits via SSH; DB is cache not master | — Pending |
| Bind mounts only (no named volumes) | Simplifies backup (one dir per stack), transparency, portability | — Pending |
| PostgreSQL via Prisma | Robust production DB, multi-file schema, type-safe queries | — Pending |
| SSE for log streaming (not WebSockets) | Simpler unidirectional streaming; sufficient for log display | — Pending |
| Restic for backups | Encrypted, deduplicated, supports local/SFTP/S3 targets | — Pending |
| Digest-based update detection (not pull-output text scraping) | Docker Compose CLI's stdout/stderr vocabulary for "already up to date" isn't a stable interface; comparing local image digests before/after pull is | Shipped Phase 02 — resolved UAT gap G-02-11 |
| `nginx-proxy` + `acme-companion` for reverse proxy (not Nginx Proxy Manager) | NPM's REST API is officially undocumented (community-reverse-engineered only); `nginx-proxy`/`acme-companion` are Docker-socket-reactive, need no external API integration, and fit the existing YAML-first/event-driven architecture | Shipped Phase 06 |
| Cut over from schemaless `prisma db push` to real `prisma migrate deploy`, with automatic baselining of an existing `db push` install | `db push` has no migration history, no rollback path, and no audit trail — untenable for a v1.0.0 release that self-hosters will upgrade in place | Shipped Phase 09 |
| Certificate-source field (`acme` \| `custom`) promoted onto every `ProxyConfig` row, not left implicit from a certificate link's presence/absence | A future third source, or a row with no explicit opinion, must never be ambiguous about who issues its certificate | Shipped Phase 09 |

---
*Last updated: 2026-09-19 after Phase 09 completion*
