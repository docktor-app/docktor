---
gsd_state_version: "1.0"
milestone: v0.2.0
milestone_name: Migration Hardening, Proxy & Access
current_phase: 22
current_phase_name: Migration Hardening
status: executing
stopped_at: Completed 22-05-PLAN.md
last_updated: "2026-10-22T18:03:19.050Z"
last_activity: 2026-10-22
last_activity_desc: Phase 22 execution started
state_head: b3d99aa18dd77bcaa354ee9faeb9866e555f0cb6
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 8
  completed_plans: 5
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-21)

**Core value:** Users can deploy, monitor, and manage Docker Compose stacks through a browser UI without needing SSH or Docker CLI access.
**Current focus:** Phase 22 — Migration Hardening

## Current Position

Phase: 22 (Migration Hardening) — EXECUTING
Plan: 6 of 8
Status: Ready to execute
Last activity: 2026-10-22 — Phase 22 execution started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (v0.2.0)
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

*Updated after each plan completion*

v0.1.0 metrics (133 plans across Phases 1-16) are preserved in `.planning/milestones/v0.1.0-STATE.md`; v0.1.1 metrics and decisions (45 plans across Phases 17-21) in `.planning/milestones/v0.1.1-STATE.md`.
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 22 P01 | 15 min | 3 tasks | 27 files |
| Phase 22 P02 | 25min | 2 tasks | 15 files |
| Phase 22 P03 | 55 min | 3 tasks | 24 files |
| Phase 22 P04 | 2 sessions | 3 tasks | 16 files |
| Phase 22 P05 | 1 session | 3 tasks | 27 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Roadmap decisions for v0.2.0:

- [Roadmap v0.2.0]: Six phases (22-27), numbering continues from v0.1.1 which ended at Phase 21; research proposed nine, merged under coarse granularity without crossing its ordering constraints
- [Roadmap v0.2.0]: All nine MIG requirements form one phase (22); plan-phase can split it at the seam between pre-flight correctness (resolver, verified stop, volumes, `~`) and rollback/UX (ledger, backup-before-stop, masking, toast, env allowlist, Linux CI)
- [Roadmap v0.2.0]: Migration and proxy go before auth so the Phase 24 route inventory covers every route they add; MIG-11 shared event schemas and the `AppError` cause change must precede the auth work
- [Roadmap v0.2.0]: OIDC-05 (better-auth 1.7.x upgrade) is mapped to Phase 24, not the OIDC phase, because it is a prerequisite for the whole access stream
- [Roadmap v0.2.0]: Access stream order is fixed: foundation dark-launched while all users are owner (24) → audit + stream authorization (25) → reset + user admin (26) → OIDC (27); RBAC-04 (SSE) sits with audit in 25 so it lands before any non-owner user exists
- [Roadmap v0.2.0]: Password reset and user administration share Phase 26 because the invite flow reuses the reset mail/link mechanism
- [Phase 22]: Docker/compose children receive only an allowlisted environment (no Docktor secrets, DOCKTOR_*, COMPOSE_*); ${VAR} resolves from the stack's .env — Compose gives the calling environment precedence over .env (#109)
- [Phase 22]: MigrationService takes Partial<MigrationServiceDependencies>; AppError subclasses take ErrorOptions — Later plans add ports without touching every builder; cause hygiene before Phase 24 (#108)
- [Phase 22]: Single shared maskSecrets in @docktor/shared (env, compose map/list, URL credentials) used by migration review, stack-edit dialog and server error text; masked values keep wrapping quotes
- [Phase 22]: Followed running operation missing from the server list is reported once as lost and dropped from the client store (row actionable again)
- [Phase 22]: failed/rolled_back toasts use a Docktor title; server error plus verified rollback outcome go in the description; rolled_back only from a verified rollback report
- [Phase 22]: 22-04: the compose project Docker runs (resolved from container labels) is the old stack's identity; every stop/start uses -p <resolved> and a stop that leaves containers running refuses before any copy, with no override (D-04)
- [Phase 22]: 22-04: ~ bind sources resolve only from the old containers' recorded bind mounts (suffix-checked, services must agree); every declared ~ source must resolve, kept ones are rewritten to the absolute host path
- [Phase 22]: 22-05: named volumes copied by real Docker name (name:, <project>_<key>, external literal), inspected first and mounted read-only; missing volume refused before the old stack stops
- [Phase 22]: 22-05: anonymous volumes never copied; acknowledgeAnonymousVolumes mandatory in the schema and enforced in preflight (D-05); external volumes default to staying

### Pending Todos

Product work is tracked in GitHub Issues (`docktor-app/docktor`), not `.planning/todos/`. The v0.1.0-era `.planning/todos/pending/` list is preserved in `.planning/milestones/v0.1.0-STATE.md`.

### Blockers/Concerns

- The execution host is shared with real unrelated Docker workloads: run no heavy local actions (full `tsc --build`, integration tests, Playwright, full builds); GitHub Actions CI runs them. Any live `docker compose` test must use a collision-proof, randomly generated project/directory name (05.1-03 incident).
- Open product decisions to ratify before planning Phase 24: viewer sees no logs, masked compose, no env; operator may trigger backups but not restore; roles are global (no per-stack table); notification recipients by role; external-mode switch blocked while `ProxyConfig` rows exist.
- Open decisions for later phases: #107 warm pre-stop copy vs honest "crash-consistent at best" (Phase 22); WebSocket field default OFF and "long-lived connections" semantics (Phase 23); OIDC provider config env-driven vs DB-backed (Phase 27); OIDC sessions exempt from mandatory 2FA only for users without a password credential (Phase 27).
- Research spikes: nginx-proxy `vhost.d` reload and idle-timeout behaviour (Phase 23); better-auth `admin` plugin `disabledPaths` vs `auth.api.*` (Phases 24 and 26); better-auth 1.7 OIDC `signIn.social`, `email_verified` per provider, 2FA for OIDC sessions (Phase 27).
- Docs site (`docktor-app/docks`) Backups guide labels SFTP/S3 settings "not used in v0.1.0" (16-08 decision); README and `docs/design.md` claim they work. Outside this repo.
- Older open concerns (db-push upgrade-path live verification, GitHub Actions SHA pinning, README screenshots/GIF still to record) are recorded in `.planning/milestones/v0.1.0-STATE.md`.

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| Features | Per-stack access scoping (seam built in Phase 24), ProxyProvider abstraction (#43), just-in-time OIDC user creation | Future requirements (see REQUIREMENTS.md) | 2026-10-21 | v0.2.0 |
| Demo | Public demo instance that resets hourly (#53) | Open in GitHub Issues | v0.1.0 close | v0.1.0 |
| Backlog | Phase 999.1: container-name variable follow-up from Phase 12 UAT | Backlog | 2026-10-04 | v0.1.0 |
| Features | Remote backups feature (#81), warning suppression (#83), uptime reset (#84), fresh template images (#82), YAML checks (#77), structured logging (#70); WebSocket proxy (#86), password reset (#79) and OIDC (#87) were deferred here and are now in v0.2.0 scope | Future requirements | 2026-10-14 | v0.1.1 |

## Session Continuity

Last session: 2026-10-22T18:03:18.849Z
Stopped at: Completed 22-05-PLAN.md
Resume file: None
