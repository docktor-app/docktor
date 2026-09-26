# Phase 10: Backend Architecture Refactor - Context

**Gathered:** 2026-09-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Improve the server's internal architecture without changing external API behavior or breaking integration tests. Sourced from GitHub issue [#16](https://github.com/docktor-app/docktor/issues/16), which frames four candidate improvement areas as an open list, not a spec: event-driven architecture, DDD/hexagonal layering, job-handling reconsideration, and dead-code/boilerplate removal. This discussion decided all four are in scope, and how far to go on each.

Sequenced before Phases 12/14/15 so their new server-side code (template service, health-probe jobs, 2FA/rate-limiting) lands on the refactored structure instead of needing rework afterward. Independent of Phase 11 (UI Rework) — separate server/client tracks.

**Hard constraints (not up for discussion — locked by the issue and ROADMAP.md):**
- No existing API endpoint's request/response contract changes
- Existing integration tests (`server/test/integration/`, 5 files) pass unmodified
- Target layering conventions are already fully specified in `CLAUDE.md` (routes → application → domain → repositories → infrastructure/jobs/lib) — this phase enforces and deepens that layering, it does not redefine it

</domain>

<decisions>
## Implementation Decisions

### Scope — all four issue-#16 items are in, at their most ambitious variant
- **D-01:** DDD/hexagonal layering: full broader restructure, not just fixing found violations — explicit ports/interfaces for infrastructure dependencies, stricter DI conventions across the board.
- **D-02:** Job handling: formalize a shared Job abstraction/registry, not just cleanup.
- **D-03:** Dead-code removal: dedicated audit pass across the server workspace, not just opportunistic cleanup while touching files.
- **D-04:** Event-driven architecture: add a genuinely new internal domain-event bus, not just accept the current dockerode-events + StateBroadcaster/SSE setup as "event-driven enough."
- **D-05:** Structure as **one phase (10), planned as multiple sequential plan waves** — not split into separate roadmap phases. `/gsd-plan-phase 10` should sequence waves by dependency (the event bus depends on clean application-service boundaries from the layering work, so layering is understood to be the foundation; jobs and dead-code cleanup are more independent). No locked wave order beyond that — the planner decides based on actual dependencies found.
- **D-06:** No fallback/descope trigger if the broader restructure or event bus prove risky mid-implementation — full scope is committed to. — **Reversibility:** costly — if this proves wrong during planning/execution and a fallback becomes necessary, that's a scope renegotiation with the user, not a silent descope.

### DDD/layering restructure depth
- **D-07:** Interface every infrastructure dependency, even single-implementation ones: `DockerExecutor`, `StackFilesystem`, `ResticExecutor`, the SMTP client all get an interface defined in application/domain, with the concrete class in `infrastructure/` implementing it.
- **D-08:** Expand `domain/` (currently just `stack-status-machine.ts`, 5 files total) by pulling more pure business rules out of `application/` services — e.g. backup retention policy math, proxy-config idempotency rules — into domain modules with no I/O. Application services then orchestrate domain + repositories rather than embedding the rules themselves.
- **D-09:** Create the missing `repositories/index.ts` (CLAUDE.md already mandates this pattern but it doesn't exist — repos are currently instantiated ad hoc inside `application/index.ts`). Export singleton repository instances from it; `application/index.ts` imports them instead of instantiating repos itself.
- **D-10:** Fix the concrete boundary violation found during scouting: `application/notification-service.ts` calls `prisma.user.findMany(...)` directly (line 76) — this must go through a repository (e.g. a `UserRepository`), not raw Prisma access from the application layer.
- **D-11:** Remove the dead `src/services/` directory (currently empty except `.gitkeep`) as part of this cleanup — leftover from before the current `application/`+`repositories/` split.

### Job handling approach
- **D-12:** Keep `node-cron` as the underlying scheduler — wrap it in a `Job` interface (start/stop/name), don't replace it with a different scheduling library. — **Reversibility:** reversible — the abstraction is a thin wrapper; the underlying library can be swapped later without touching call sites.
- **D-13:** Distinguish job *kinds* explicitly rather than one uniform interface: something like `IntervalJob` (pure cron-driven — `disk-checker`, `backup-scheduler`, `update-checker`, `proxy-cert-poller`) vs. `WatcherJob` (event-driven with a cron-based reconciliation fallback — `state-poller`, `file-watcher`), both implementing a common lifecycle contract so the registry in `jobs/index.ts` can manage them uniformly (start/stop/error-isolation), while each kind's internal scheduling semantics stay distinct.
- **D-14:** The job registry tracks per-job health state — last run, last error, running/stopped status — replacing the current duplicated try/catch-per-job in `jobs/index.ts`. This is internal state only (no new UI/endpoint in this phase); it's explicitly named as groundwork that Phase 14 (HTTP health probes + uptime view) could build on later, but this phase does not add any user-facing surface for it.

### "Event-driven architecture" — internal domain-event bus
- **D-15:** Three side-effect categories move onto the new event bus (application services emit domain events; existing direct call-outs are replaced by subscribers):
  1. **Notifications** — services currently call `notification-service` directly (stack ERROR/UNHEALTHY, disk space, backup failure) → move to: service emits domain event, `notification-service` subscribes.
  2. **StackEvent audit trail** — `stack-event-repository` writes (`config_changed`, `config_error`, `update_available`) currently happen inline in the causing service → move to: service emits domain event, an audit-log subscriber writes the `StackEvent` row.
  3. **Status/state transitions** — stack status-machine transitions currently call `StateBroadcaster` and other side effects inline → these move onto the event bus too, with `StateBroadcaster` becoming a subscriber like any other (not a special-cased inline call).
- **D-16:** The bus is **in-memory and synchronous** — a simple `EventEmitter`-style bus within the single Fastify process, no persistence/durability. Matches the existing single-process architecture (`CLAUDE.md`: "Single Fastify process: API + background jobs + SSE + static files") and the `StateBroadcaster` precedent. An event is lost if the process crashes mid-handler — accepted tradeoff, not a gap to close in this phase.
- **D-17:** Subscribers fail in isolation with no retry — each subscriber's handler is wrapped so one failing (e.g. SMTP down inside the notification subscriber) doesn't block other subscribers or the emitting operation. No retry/backoff logic is added.
- **D-18:** Constraint carried over from the phase boundary: since `StateBroadcaster` drives the live SSE state consistency validated in Phase 08, rewiring it onto the event bus must preserve the exact same observable SSE events at the same points — this is an internal wiring change, not a behavior change.

### Claude's Discretion
- Exact interface/type names for the Job kinds, event bus, and new domain modules are left to planning/implementation — no specific naming was locked during discussion.
- Whether the dead-code audit pass surfaces additional findings beyond `src/services/` (found during discussion) is open — the audit itself is in scope; its findings aren't predetermined.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase framing
- `CLAUDE.md` — already documents the target layered DDD architecture in full (routes/application/domain/repositories/infrastructure/jobs/lib rules, naming conventions, error-handling hierarchy, Repository/State-Machine/Observer pattern usage). This phase enforces and extends this document — do not treat it as aspirational, treat violations found against it as defects to fix.
- `.planning/ROADMAP.md` (Phase 10 section, "### Phase 10: Backend Architecture Refactor") — phase goal, dependencies (Phase 9), and draft success criteria.
- GitHub issue [#16](https://github.com/docktor-app/docktor/issues/16) ("[CHORE] Backend Refactoring") — the original open-list prompt this phase scopes; all four bullets are now locked in-scope per the Scope decisions above.

### Project context
- `.planning/PROJECT.md` — "Key architectural constraints" section (single Fastify process, YAML-first, bind-mounts-only, Stack ID = primary key = directory name) — none of this changes in this phase, but any refactor must respect it.
- `.planning/STATE.md` — confirms Phase 10 and 11 were deliberately resequenced ahead of Phases 12/14/15 so new server-side code lands on the reworked structure.

No other external specs/ADRs exist for this phase — requirements are fully captured in the decisions above plus the two documents already governing target architecture (CLAUDE.md, issue #16).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/state-broadcaster.ts` (`stateEventBroadcaster`) — existing Observer/Pub-Sub implementation; becomes a subscriber on the new domain-event bus rather than being replaced.
- `lib/errors.ts` typed error hierarchy (`AppError`, `NotFoundError`, `ConflictError`, `BadRequestError`) — already fits the DDD approach; reuse as-is for any new domain/application errors introduced during the restructure.
- `application/index.ts` — existing composition-root pattern (manual dependency wiring via `new XService(repo, ...)`) — the restructure extends this pattern with `repositories/index.ts` and new port interfaces, it doesn't replace the composition-root approach itself.

### Established Patterns
- Repository pattern already used consistently for the 6 existing repositories (`stack-repository.ts`, `settings-repository.ts`, `notification-repository.ts`, `backup-repository.ts`, `proxy-repository.ts`, `certificate-repository.ts`, `stack-event-repository.ts`) — the notification-service Prisma violation (D-10) is the outlier, not the norm.
- `jobs/index.ts` already has an isolation pattern (`startJob()` wrapper catching each job's startup failure independently) — D-14's per-job health tracking extends this existing idea rather than introducing a new concept.

### Integration Points
- `application/index.ts` is the central wiring point — new port interfaces, the event bus instance, and `repositories/index.ts` singletons all get wired together here.
- `jobs/index.ts` — `startJobs()`/`stopJobs()` becomes the job registry's responsibility once the Job abstraction (D-12/D-13/D-14) lands.
- `application/notification-service.ts`, `stack-event-repository.ts` writes, and the stack-status-machine's transition call sites are the three concrete places where inline side-effect calls get replaced by event emission (D-15).

### Known violations found during scouting (ground truth for D-10, D-11)
- `server/src/application/notification-service.ts:76` — `prisma.user.findMany({select: {email: true}})` called directly from the application layer.
- `server/src/services/` — empty directory except `.gitkeep`, dead leftover.
- `server/src/repositories/index.ts` — does not exist; CLAUDE.md mandates it.
- Route file sizes worth checking during the layering pass for logic that should already be in services: `routes/backups.ts` (427 lines), `routes/setup.ts` (262 lines), `routes/stacks.ts` (280 lines).
- 7 jobs, each independently wiring `node-cron`: `state-poller.ts`, `file-watcher.ts`, `update-checker.ts`, `disk-checker.ts`, `notification-watcher.ts`, `backup-scheduler.ts`, `proxy-cert-poller.ts`.

</code_context>

<specifics>
## Specific Ideas

No particular UI/UX references (this is a server-internal phase). The user's specific technical preferences, captured as decisions above: interface every infra dependency (not just where convenient), expand `domain/` rather than keep it minimal, distinguish job kinds rather than force a uniform interface, and keep the event bus deliberately simple (in-memory, no retry) rather than over-engineering durability/resilience that the single-process architecture doesn't currently need.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. The per-job health-state tracking (D-14) is noted as groundwork Phase 14 could build a UI on top of, but this phase does not add that UI itself.

### Reviewed Todos (not folded)
15 items in `.planning/todos/pending/` matched Phase 10 by keyword search but none were folded — all are UI/feature-shaped requests (dashboard redesign, update-available badges, resource stats, topology visualization, etc.), not internal backend-structure concerns, and are already tracked as GitHub issues per `CLAUDE.md`'s issue-tracking process. None belong in an API-contract-frozen architecture-only phase.

</deferred>

---

*Phase: 10-backend-architecture-refactor*
*Context gathered: 2026-09-22*
