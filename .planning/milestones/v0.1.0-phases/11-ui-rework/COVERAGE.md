# Phase 11 — API Coverage Declaration

No external API integration: this phase is a frontend UI rework of `client/` and adds zero new external API, SDK, or service integrations.

Scope: design tokens, `Section`/`ToneBadge`/`StatusDot` primitives, page decomposition, `CodeEditor`/`EnvEditor`, dark-mode and 390px responsive passes.

## Why the detector fired (false positive)

`api-coverage.verify-pre` reported `detected: true` on a single generic signal (`(surface)` / `api`). It matched Docktor's own internal REST API surface, which the client consumes through `apiFetch<T>()` against the same-origin `/api` backend — not a third-party service.

## Confirmation against phase scope

- **New dependencies** (`@uiw/react-codemirror`, `@codemirror/lang-yaml`, `@codemirror/lint`, `yaml`): pure npm/JS editor libraries that run in the browser. They contact no external service (11-RESEARCH.md: "No external service/CLI dependencies are introduced by this phase").
- **Data access:** unchanged — all calls go through `apiFetch<T>()` to Docktor's own backend.
- **Server (`server/`):** not the target of this phase; no new outbound integration is added.

Pre-existing outbound integrations (Docker Engine API, SMTP via `nodemailer`, ACME via acme-companion, restic with local/SFTP/S3 repositories) were built and covered in earlier phases (see `04-backup-restore/COVERAGE.md`, `06-proxy-configuration/COVERAGE.md`, `10-backend-architecture-refactor/COVERAGE.md`). This phase changes only how their settings and status are presented in the UI, not what is called.

---

*Written during `/gsd-verify-work 11`, 2026-10-01.*
