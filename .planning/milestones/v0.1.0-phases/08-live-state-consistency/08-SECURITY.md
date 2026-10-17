---
phase: "08"
slug: "live-state-consistency"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-20"
---

# Phase 08 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| server status enum -> browser DOM | `stack.status` arrives over REST/SSE, used as a lookup key into module-private maps; result rendered into a `class` attribute (plans 08-01, 08-04) | Server-controlled status enum only |
| agent process -> shared Docker host | Diagnostic probes (plan 08-01 Task 2) ran on a host also running unrelated production workloads | Docker CLI commands, no payload data |
| probe output -> committed summary | Captured command output quoted into a committed file (plan 08-01) | Exit codes, byte counts, port/address tokens — no credentials |
| server internal event bus -> SSE clients | `config_changed`'s new `source` field crosses from two trusted server-side publishers into every subscribed browser tab (plan 08-02) | `source: "app" \| "external"` enum |
| authenticated PATCH /api/stacks/:id body -> compose parser | User-controlled compose text now reaches a typed error path instead of an unguarded one (plan 08-02) | Compose YAML content (already-authenticated) |
| authenticated SSE stream (/api/events) -> browser toast decision | `event.source` read from the stream decides whether a toast fires (plan 08-03) | `source` enum, UI-only branch |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-08-01 | Denial of Service | Diagnostic probes on shared Docker host (08-01 Task 2) | high | mitigate | Action restricted to `docker info`/`ps`/`inspect`/`exec` and at most `docker compose -f docker-compose.dev.yml up -d` on its own isolated project; `--remove-orphans` and this repo's own `docker-compose.yml` forbidden. Verified against 08-01-SUMMARY.md: "No container was created or removed beyond the already-running `docktor-db-dev` service... no `docker compose` command in this session targeted this repository's own `docker-compose.yml`, and `--remove-orphans` was never passed." | closed |
| T-08-02 | Information Disclosure | Probe output quoted into committed summary (08-01) | medium | mitigate | `.env.development` never read or quoted (permission-denied by design); summary records only exit codes, byte counts, port, and bridge address. Verified — 08-01-SUMMARY.md's probe evidence contains no credential or `.env` content. | closed |
| T-08-03 | Tampering | `animate-pulse` class reaching DOM via `Badge`'s `className` pass-through (08-01) | low | accept | Class string selected by exact key lookup into a module-private literal map; unrecognized status falls through to empty string + React-escaped text. No attacker-controlled substring can reach `class`. | closed |
| T-08-04 | Repudiation | Closing 3 bug records before live UAT confirmation (08-01) | medium | mitigate | Each `## Resolution` names the closing plan/call-sites and states a failing UAT item reopens it via normal gap closure. Verified — `08-UAT.md` was subsequently run (8 items, 4 pass / 3 issues / 1 skipped) and the 3 issues (G-08-2, G-08-6, G-08-7) were routed through exactly this gap-closure mechanism (plans 08-02/08-03/08-04), confirming the disposition held. | closed |
| T-08-02-01 | Spoofing | `config_changed`'s `source` field (08-02) | low | accept | Set exclusively by two hardcoded server call sites, never derived from request input. Verified in code: `server/src/application/stack-service.ts:598` writes `source: "app"`; `server/src/jobs/file-watcher.ts:273,325` writes `source: "external"` — no client-writable path to this field. | closed |
| T-08-02-02 | Information Disclosure | `BadRequestError` message on invalid compose YAML (08-02) | low | accept | Message is the YAML parser's own structural complaint, no path/environment detail — same disclosure class already accepted for `FileWatcher`'s `config_error` path (05.1-06). | closed |
| T-08-02-03 | Tampering | Invalid compose content written to disk before parse error thrown (08-02) | low | accept | Existing, unchanged behavior per the YAML-first architecture decision (CLAUDE.md: compose file on disk is source of truth). This plan changes only the HTTP response shape. | closed |
| T-08-03-01 | Spoofing | `event.source` read from SSE stream to decide toast visibility (08-03) | medium | mitigate | `/api/events` gated by `requireAuth` (pre-existing, untouched); malicious authenticated client can only affect its own tab's toast, no cross-session/data/write impact. Verified in code: `server/src/routes/events.ts:6` — `app.addHook("onRequest", requireAuth)`. | closed |
| T-08-04-01 | Tampering | `animate-pulse`/blue utility classes via `Badge`'s `className` pass-through (08-04) | low | accept | Same exact-key-lookup mechanism as T-08-03 (08-01) — only two literal values changed, not the lookup mechanism. | closed |
| T-08-SC | Tampering | npm/pip/cargo installs (all 4 plans) | high | mitigate | Zero packages installed across the phase. Verified: `git log --name-only` across all 08-01..08-04 commit ranges shows no `package.json`/`yarn.lock` changes. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-08-01 | T-08-03 | Status-enum-to-CSS-class lookup via literal map cannot be tampered with; no attacker-controlled substring reaches `class` | Plan 08-01 threat model | 2026-09-20 |
| AR-08-02 | T-08-02-01 | `source` field set only by two hardcoded server call sites, never client-derived | Plan 08-02 threat model | 2026-09-20 |
| AR-08-03 | T-08-02-02 | Compose parser error message is the same already-accepted disclosure class as the shipped `config_error` path | Plan 08-02 threat model | 2026-09-20 |
| AR-08-04 | T-08-02-03 | Unchanged pre-existing YAML-first-source-of-truth behavior | Plan 08-02 threat model | 2026-09-20 |
| AR-08-05 | T-08-04-01 | Same accepted lookup mechanism as T-08-03, two literal values changed | Plan 08-04 threat model | 2026-09-20 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-20 | 10 | 10 | 0 | /gsd-secure-phase orchestrator (L1 grep-depth verification against implementation; register_authored_at_plan_time: true for all 4 plans, so short-circuit rule applied — no auditor subagent spawn needed) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-20
