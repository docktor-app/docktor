# Phase 10 — API Coverage Declaration

No external API integration: this phase is an internal restructuring of `server/src/` (DDD layering, infrastructure port interfaces, a `Job` abstraction/registry, an in-process domain-event bus, dead-code removal) with zero new external API, SDK, or service integrations.

## Why the detector fired (false positive)

`api-coverage.cjs` reported `detected: true` on one signal:

| Verb | Noun | Source phrase |
|------|------|----------------|
| `integration` | `api` | "…internal architecture **without changing external API** behavior or breaking **integration tests**. Sourced f…" (10-CONTEXT.md, Phase Boundary) |

Both matched terms come from the phase's *hard constraints* — a prohibition on changing the existing HTTP API contract, and a requirement that the existing `server/test/integration/` suite keep passing unmodified. Neither describes integrating an external API.

## Confirmation against phase scope

Re-read of the phase scope confirms no external-service capability exists to build a coverage matrix over:

- **D-01..D-11 (layering):** ports/interfaces over *existing internal* classes (`DockerExecutor`, `StackFilesystem`, `ResticExecutor`, the already-installed `nodemailer` transport, etc.). No new vendor is contacted.
- **D-12..D-14 (jobs):** wraps the already-installed `node-cron` (D-12 explicitly forbids swapping the library).
- **D-15..D-18 (event bus):** Node's built-in `events.EventEmitter`; D-16 explicitly rejects adding a pub/sub library.
- **10-RESEARCH.md "Standard Stack":** "No new libraries are introduced by this phase" and "**Installation:** None — no new packages for this phase."
- **10-RESEARCH.md "Package Legitimacy Audit":** "Not applicable. This phase adds zero new npm dependencies."

The pre-existing outbound integrations the refactor moves behind ports (Docker Engine API via `dockerode`, SMTP via `nodemailer`, container registries via `RegistryClient`, restic CLI) are already built, already covered by their existing unit tests, and gain no new capability in this phase — an interface is added in front of them, their call surface is unchanged.

---

*Written during `/gsd-plan-phase 10`, 2026-09-22.*
