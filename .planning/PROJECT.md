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
- ✓ Container state poller (event-driven + 60s reconciliation) and live per-service SSE log streaming with ANSI rendering and auto-reconnect — Validated in Phase 01: MVP Completion
- ✓ Settings page (instance name, base URL, timezone) persisted in DB — Validated in Phase 01: MVP Completion
- ✓ SMTP notification on backup failure, with per-trigger enable/disable — Validated in Phase 03: Notifications
- ✓ Restic-backed backup & restore: repository config, manual trigger, per-stack cron scheduling, retention policy, snapshot restore — Validated in Phase 04: Backup & Restore
- ✓ First-run setup wizard (account, settings, optional backup/notification/proxy config, optional brownfield scan) — Validated in Phase 05: Onboarding
- ✓ Brownfield import: host filesystem scan, compatibility assessment, adopt-in-place, and full migration wizard (stop → copy → convert volumes → rewrite paths → restart, with rollback) — Validated in Phase 05: Onboarding
- ✓ Docktor-managed `nginx-proxy` + `acme-companion` reverse proxy: per-service domain/TLS configuration, idempotent apply/remove, ACME settings in Settings — Validated in Phase 06: Proxy Configuration
- ✓ Managed stacks directory persists correctly across container recreation (single-variable-driven host/container mount, startup assertion) — Validated in Phase 07: Release Hardening
- ✓ State changes (config errors, config edits, manual deploy/stop/restart/update actions) reflect live in the UI via SSE without a manual refresh — Validated in Phase 08: Live State Consistency

### Active

<!-- Current scope. Building toward v0.1.0 (first public release) — see ROADMAP.md Phases 10-15. -->

Scope is now tracked in GitHub Issues (`docktor-app/docktor`, milestone "v0.1.0 - First Release"), not as REQ-IDs here — see CLAUDE.md "Issue Tracking". Phases 10-15 in ROADMAP.md cover:

- [ ] Compose diff-before-apply, dangerous-config warnings, port-conflict detection, git-based templates — Phase 10 (#18, #19, #20, #21)
- [ ] Update-checker/status bug fixes and cleanup — Phase 11 (#29, #31, #32, #33, #34)
- [ ] HTTP health probes + history, uptime view, disk usage view — Phase 12 (#23, #24, #27)
- [ ] TOTP 2FA and auth-endpoint hardening — Phase 13 (#45, #46)
- [ ] Backend architecture refactor (scope TBD via discuss-phase) — Phase 14 (#16)
- [ ] Docs, demo instance, license decision, image publishing, community health files — Phase 15 (#7, #11, #17, #42, #53, #54, #55, #57)

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

All planned v1 functionality is shipped and live-verified: real-time observability, notifications, encrypted
backup/restore, first-run onboarding with brownfield import, proxy/TLS configuration, and release-hardening work
(durable stacks-directory persistence, real Prisma migrations, cross-platform CI, custom TLS certificates, and
live SSE-driven UI state consistency). ~54K LOC across server/client/shared. v0.1.0 (the first public release)
has not shipped yet — ROADMAP.md Phases 10-15 scope the remaining work, sourced from GitHub issues curated into
the "v0.1.0 - First Release" milestone in `docktor-app/docktor`.

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
| Single Fastify process (not Next.js) | Needs persistent background jobs + SSE streams; Next.js doesn't support this well | ✓ Good — validated across Phases 1-9 |
| YAML-first (file = source of truth) | Supports external edits via SSH; DB is cache not master | ✓ Good — FileWatcher (Phase 02) and config-error surfacing (Phase 08) both depend on this |
| Bind mounts only (no named volumes) | Simplifies backup (one dir per stack), transparency, portability | ✓ Good — enabled restic backup design in Phase 04 |
| PostgreSQL via Prisma | Robust production DB, multi-file schema, type-safe queries | ✓ Good — cut over to real `prisma migrate deploy` in Phase 09 |
| SSE for log streaming (not WebSockets) | Simpler unidirectional streaming; sufficient for log display | ✓ Good — reused for state/backup/proxy-cert streams beyond logs |
| Restic for backups | Encrypted, deduplicated, supports local/SFTP/S3 targets | ✓ Good — Shipped Phase 04; pinned to a checksum-verified release in Phase 05.1 |
| Digest-based update detection (not pull-output text scraping) | Docker Compose CLI's stdout/stderr vocabulary for "already up to date" isn't a stable interface; comparing local image digests before/after pull is | Shipped Phase 02 — resolved UAT gap G-02-11 |
| `nginx-proxy` + `acme-companion` for reverse proxy (not Nginx Proxy Manager) | NPM's REST API is officially undocumented (community-reverse-engineered only); `nginx-proxy`/`acme-companion` are Docker-socket-reactive, need no external API integration, and fit the existing YAML-first/event-driven architecture | Shipped Phase 06 |
| Cut over from schemaless `prisma db push` to real `prisma migrate deploy`, with automatic baselining of an existing `db push` install | `db push` has no migration history, no rollback path, and no audit trail — untenable for a v1.0.0 release that self-hosters will upgrade in place | Shipped Phase 09 |
| Certificate-source field (`acme` \| `custom`) promoted onto every `ProxyConfig` row, not left implicit from a certificate link's presence/absence | A future third source, or a row with no explicit opinion, must never be ambiguous about who issues its certificate | Shipped Phase 09 |

---
*Last updated: 2026-09-20 — Phases 1-9 completion review, GitHub issue tracking adopted, ROADMAP.md Phases 10-15 scoped toward v0.1.0 (first public release)*
