# Phase 10: Backend Architecture Refactor - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-22
**Phase:** 10-backend-architecture-refactor
**Areas discussed:** Scope: which of the 4 items, DDD/layering fix depth, Job handling approach, "Event-driven" meaning

---

## Scope: which of the 4 items

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — fix found violations | Fix concrete violations only (notification-service Prisma access, missing repositories/index.ts, empty src/services/) | |
| Yes — broader restructure | Explicit ports/interfaces for infra swapping, stricter DI conventions | ✓ |
| No — defer | Skip layering work this phase | |

**User's choice:** Yes — broader restructure

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — formalize an abstraction | Shared Job interface/registry | ✓ |
| Yes — just cleanup | Dedupe try/catch bootstrap, keep per-job node-cron | |
| No — defer | Leave job handling untouched | |

**User's choice:** Yes — formalize an abstraction

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — dedicated audit pass | Actively sweep for dead code as its own pass | ✓ |
| Yes — opportunistic only | Clean up only in files already touched | |
| No — defer | Skip entirely | |

**User's choice:** Yes — dedicated audit pass

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — add a domain event bus | New architectural piece decoupling side effects | ✓ |
| No — current handling is enough | dockerode + SSE already sufficient | |
| Not sure — discuss further | | |

**User's choice:** Yes — add a domain event bus

**Follow-up (sizing):**

| Option | Description | Selected |
|--------|-------------|----------|
| One phase, multiple plan waves | Single discuss/context, planner sequences waves | ✓ |
| Split into separate phases now | Separate roadmap entries per sub-effort | |

**User's choice:** One phase, multiple plan waves

**Follow-up (fallback):**

| Option | Description | Selected |
|--------|-------------|----------|
| Descope to the minimal version | Fall back to narrower scope if risky | |
| No fallback — commit to full scope | Push through regardless | ✓ |

**User's choice:** No fallback — commit to full scope

**Follow-up (priority):**

| Option | Description | Selected |
|--------|-------------|----------|
| Layering first, then event bus, then jobs, then dead code | Locked order | |
| Let the planner decide based on dependencies | No locked order | ✓ |

**User's choice:** Let the planner decide based on dependencies

**Notes:** This turned scope selection from a simple in/out check into a sizing conversation, since the user picked the most ambitious variant of all four items. Landed on: one phase (10) in the roadmap, broken into multiple dependency-ordered plan waves during `/gsd-plan-phase`, full commitment to scope with no descope trigger, and no locked priority order beyond the understood dependency that the event bus needs clean layering first.

---

## DDD/layering fix depth

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — interface everything | Every infra dependency gets a port/interface, even single-impl ones | ✓ |
| Only where it earns its keep | Interfaces only where there's a real reason | |

**User's choice:** Yes — interface everything

| Option | Description | Selected |
|--------|-------------|----------|
| Expand domain/ with more pure business rules | Pull retention/idempotency rules etc. out of application services | ✓ |
| Keep domain/ narrow | State machines only | |

**User's choice:** Expand domain/ with more pure business rules

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — create repositories/index.ts | Export singletons per CLAUDE.md convention | ✓ |
| No — leave as-is | Keep ad hoc instantiation in application/index.ts | |

**User's choice:** Yes — create repositories/index.ts

**Notes:** None beyond the selections — this area confirmed the full-restructure intent already set in Scope.

---

## Job handling approach

| Option | Description | Selected |
|--------|-------------|----------|
| Keep node-cron, wrap it | Job interface wraps node-cron internally | ✓ |
| Move to a more general scheduler | Replace node-cron for richer patterns | |

**User's choice:** Keep node-cron, wrap it

| Option | Description | Selected |
|--------|-------------|----------|
| Distinguish kinds explicitly | IntervalJob vs WatcherJob, common lifecycle contract | ✓ |
| One uniform interface | Single Job interface for all 7 | |

**User's choice:** Distinguish kinds explicitly

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — track per-job health state | Last run/error/status, groundwork for future health view | ✓ |
| No — keep current console.error isolation | Just consolidate duplicated try/catch | |

**User's choice:** Yes — track per-job health state

**Notes:** The health-state tracking is explicitly scoped as internal-only groundwork — no UI or endpoint added this phase; Phase 14 (health probes/uptime) may build on it later.

---

## "Event-driven" meaning

| Option | Description | Selected |
|--------|-------------|----------|
| Notifications | Move notification triggering onto the event bus | ✓ |
| StackEvent audit trail | Move StackEvent writes onto the event bus | ✓ |
| Status/state transitions | Move status-transition side effects (incl. StateBroadcaster) onto the event bus | ✓ |

**User's choice:** All three (multiSelect)

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory, synchronous | EventEmitter-style, no persistence | ✓ |
| Durable/persisted | DB/queue-backed, survives crash | |

**User's choice:** In-memory, synchronous

| Option | Description | Selected |
|--------|-------------|----------|
| Isolated, no retry | One subscriber's failure doesn't block others; no retry | ✓ |
| Isolated, with retry | Same isolation, plus retry/backoff | |

**User's choice:** Isolated, no retry

**Notes:** User confirmed readiness to move to context-writing after this area — all four selected gray areas covered.

---

## Claude's Discretion

- Exact interface/type names for Job kinds, event bus, and new domain modules.
- Specific additional findings the dead-code audit pass surfaces beyond `src/services/` (found during codebase scouting, not discussion).

## Deferred Ideas

None — discussion stayed within phase scope. 15 pending todos were reviewed (matched Phase 10 by keyword) but none folded in — all UI/feature-shaped, already tracked via GitHub issues.
