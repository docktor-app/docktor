# Phase 8: Live State Consistency - Research

**Researched:** 2026-09-13
**Domain:** SSE-based live UI state (Fastify + StateBroadcaster observer pattern; React SSE consumer hooks); verification/closure of already-shipped fixes
**Confidence:** HIGH

## Summary

This phase's three scoped todos are **not implementation gaps** — they are **verification gaps**.
Direct inspection of the working tree (not just the todo files, which describe the *original*
problem before Phase 05.1 fixed it) confirms all three backend/client wiring paths are already
code-complete and unit-tested, landed across Phase 05.1 plans 05.1-02, 05.1-04, and 05.1-06:

1. `config_error` — `Stack.configError` is persisted (`FileWatcher.handleFileChange`'s catch
   branch), broadcast over SSE (`ConfigErrorEvent`), consumed by `use-stack.ts`/`use-stacks.ts`,
   and rendered as a destructive `Alert` + red pill.
2. Env-file config-changed — both gaps from the todo (app-driven env write not flagging
   `configChanged`; external `.env` edits not watched at all) are closed: `FileWatcher` now
   watches `.env` via its own `lastEnvHash`, and `StackService.updateStack()`'s env branch
   unconditionally flags `configChanged` and publishes `config_changed`.
3. Manual-action SSE broadcasts — `StackService.transitionStatus()` is the single wrapper every
   action method (`deployStack`/`stopStack`/`restartStack`/`updateImages`/`upgradeServiceImage`)
   routes through, and it publishes `stack_status` after every DB write. `BackupService` has an
   equivalent broadcast at every transition (`initiateBackup`/`runBackup`/`initiateRestore`/
   `runRestoreProcess`/`abortBackup`). The addendum gap (`handleSaveCompose`/`handleSaveEnv` not
   calling `refetch()`) is also already fixed in `[id].tsx`.

What remains, per the approved UI-SPEC and per the 05.1 plan summaries' own admitted gaps, is:

- **One real code fix**: `BACKING_UP`/`RESTORING`/`MIGRATING` have no `animate-pulse` motion cue in
  `stack-status-badge.tsx`'s `statusColors` map, unlike `DEPLOYING`/`UPDATING`. CSS-class-only,
  zero new copy, locked by the UI-SPEC.
- **Six recorded `human_judgment: true` verification items** (D6/05.1-02, D9/05.1-06, D7/05.1-04)
  that could never be executed in those sessions because no running Docktor instance + browser was
  available. This phase's job is to close them — either by a human doing the live check, or by an
  automatable substitute (see Common Pitfalls below on why the existing Playwright e2e tier cannot
  do this out of the box).
- **One optional, explicitly out-of-scope-unless-it-surfaces** UX rough edge: `StackActions`'
  `BLOCKED_STATES` omits `UPDATING`/`MIGRATING`, so Deploy stays clickable during those (server
  still rejects via `assertTransition`, so no data-safety issue — just a confusing error toast).

**Primary recommendation:** Plan this phase as (1) the one-line `statusColors` CSS fix with a new
`stack-status-badge.test.tsx` (no such test file exists yet — a genuine Wave 0 gap), (2) a
structured live-verification pass that closes out the 6 recorded human-judgment items — using this
environment's own reachable `docker`/`docker compose`/Postgres (verified below, unlike the prior
05.1 sessions) wherever a live check is actually executable, and (3) treat the `BLOCKED_STATES` gap
as `Claude's Discretion` / assumption-log territory, not a mandated fix.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stack status persistence + transition rules | API / Backend (domain + repositories) | — | `stack-status-machine.ts` (pure) + `StackRepository.transitionStatus()` own the single source of truth |
| SSE event emission on state change | API / Backend (`StateBroadcaster`, `StackService`, `BackupService`, `FileWatcher`) | — | Observer pattern; publish happens strictly after the DB write resolves |
| SSE transport | API / Backend (Fastify `reply.hijack()`/`reply.raw`, `/api/events` route) | — | Single-process, no separate SSE server per CLAUDE.md |
| SSE consumption + client cache update | Browser / Client (`useContainerEvents`, `useStack`, `useStacks`) | — | Hooks are "the single source of truth for server state" per CLAUDE.md |
| Visual status rendering (badges/pills/alerts) | Browser / Client (`StackStatusBadge`, `stack-list.tsx`, `[id].tsx`) | — | Pure derived render of state the parent query already fetched — no independent fetch lifecycle (confirmed by UI-SPEC's per-element probe) |
| File-change detection (compose/.env) | API / Backend (`FileWatcher` job, chokidar) | — | `jobs/` layer per CLAUDE.md |
| Live verification of the above (this phase's actual deliverable) | Human / manual QA, or a new e2e tier if one is built | API/Backend for the live daemon | Six items block on a running instance + real browser; no automated substitute exists today (see Pitfalls) |

## Phase Requirements

Not applicable — this phase has no REQUIREMENTS.md IDs (n/a per phase description). It is scoped
entirely by three todo files, cross-referenced below against what's still open.

| Todo | Backend fix location (confirmed present) | Client fix location (confirmed present) | What's genuinely still open |
|------|---|---|---|
| `2026-08-28-config-error-ui-indication-missing.md` | `FileWatcher.handleFileChange()` catch branch: `repo.setConfigError()` + `ConfigErrorEvent` publish (`server/src/jobs/file-watcher.ts:238-250`) | `use-stack.ts:82-86`, `use-stacks.ts:48`; `stack-status-badge.tsx` unaffected (config-error is a separate `Alert`/pill, not a `StackStatus`); `[id].tsx:218-225`, `stack-list.tsx:31-34` | 05.1-06 D9 human-judgment item: live YAML-syntax-error injection into a running stack, confirm red indicator appears with no reload, confirm it clears on fix |
| `2026-08-28-env-file-changes-dont-flag-config-changed.md` | `FileWatcher.handleEnvChange()` (`server/src/jobs/file-watcher.ts:285-325`, watched via `WATCHED_FILENAMES`); `StackService.updateStack()` env branch (`server/src/application/stack-service.ts:126-148`) | Same `config_changed` handling as compose path — no separate client code needed | 05.1-06 D9 human-judgment item: live external `.env` edit on a running stack, confirm config-changed badge appears within the watcher's detection window |
| `2026-08-28-manual-actions-dont-broadcast-sse.md` | `StackService.transitionStatus()` wrapper (`server/src/application/stack-service.ts:545-557`) — single call site used by every action method; `BackupService`'s equivalent broadcast (per 05.1-04-SUMMARY.md D5) | `useStack`/`useStacks` `stack_status` branches; `handleSaveCompose`/`handleSaveEnv` `refetch()` calls (`[id].tsx:123-145`) already present | 05.1-02 D6 + 05.1-04 D7 human-judgment items: live two-tab browser check (Deploy badge visible in both tabs mid-action; config-changed banner appears on the *other* tab without reload) and live Backup-badge-round-trip check |

## Standard Stack

No new packages are needed for this phase — every library involved is already declared and
version-pinned in the existing workspaces `[VERIFIED: package.json — read this session]`:

### Core (already in use, unchanged by this phase)
| Library | Version (declared) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastify | ^5.2.1 | HTTP + SSE transport (`reply.hijack()`) | Per CLAUDE.md, single-process server |
| chokidar | ^4.0.3 | Filesystem watching for compose/.env | Existing `FileWatcher` dependency |
| zod | ^4.3.6 | Shared validation schemas | `@docktor/shared` |
| react | ^19.2.4 | Client UI | Existing |
| sonner | ^2.0.7 | Toast notifications for SSE-pushed events | Existing, used by `use-stack.ts` |
| lucide-react | ^0.575.0 | `AlertTriangle` icon in config alerts | Existing |
| node-cron | ^3.0.3 | `FileWatcher`'s 60s reconcile fallback | Existing |

### Alternatives Considered
Not applicable — this phase adds no new capability, only closes verification/motion-cue gaps in an
existing implementation. No alternative-library decision exists to make.

**Installation:** None required — no `npm install`/`yarn add` needed for this phase's scope.

## Package Legitimacy Audit

**Not applicable.** This phase installs zero external packages — every dependency touched
(`fastify`, `chokidar`, `sonner`, `lucide-react`, `zod`) is a pre-existing, already-installed
dependency confirmed present in `package.json`/`server/package.json`/`client/package.json`
`[VERIFIED: package.json files — read this session]`. Skip the Package Legitimacy Gate entirely;
do not add a `checkpoint:human-verify` for installs that don't happen.

## Architecture Patterns

### System Architecture Diagram

```
 [File on disk: docker-compose.yml / .env]          [Browser action: Deploy/Stop/Restart/
        │  (external edit OR app-driven write)        Update/Backup/Restore/Compose-Save]
        ▼                                                     │
 ┌─────────────────┐                                          ▼
 │  FileWatcher     │ (chokidar watch + 60s reconcile) ┌──────────────────┐
 │  jobs/file-      │                                  │ Route (Fastify)  │  HTTP boundary,
 │  watcher.ts      │                                  │ routes/stacks.ts │  Zod validation
 └────────┬─────────┘                                  └────────┬─────────┘
          │ parse compose / diff .env hash                      │
          ▼                                                     ▼
 ┌─────────────────────────┐                          ┌──────────────────────┐
 │ repo.setConfigError() /  │                          │ StackService /        │
 │ repo.setConfigChanged()  │                          │ BackupService          │
 │ (Stack row write)        │                          │ .transitionStatus()    │
 └────────┬─────────────────┘                          │ (single choke point)   │
          │                                            └──────────┬─────────────┘
          │ this.broadcaster.publish(                              │ repo.transitionStatus()
          │   {type:"config_error"|"config_changed", ...})         │ (DB write) then
          ▼                                                        │ broadcaster.publish(
 ┌───────────────────────────────────────────────────┐              │  {type:"stack_status",...})
 │           StateBroadcaster (EventEmitter)          │◄────────────┘
 │           server/src/lib/state-broadcaster.ts       │
 └───────────────────────┬─────────────────────────────┘
                          │ SSE stream (GET /api/events, reply.hijack())
                          ▼
 ┌───────────────────────────────────────────────────┐
 │  useContainerEvents (EventSource, client)           │
 └───────────────────────┬─────────────────────────────┘
                          │ dispatched to every subscribed hook
          ┌───────────────┼────────────────┐
          ▼               ▼                ▼
   useStack(id)      useStacks()      (any other open tab's
   - setStack()       - refetch()      instance of the same
   - toast.warning/     on match        hooks — broadcast is
     toast.error                        global, not per-tab)
          │
          ▼
 ┌─────────────────────────────────────────┐
 │ Render: StackStatusBadge / config-error   │
 │ Alert+pill / config-changed Alert+pill    │
 │ stack-list.tsx, [id].tsx                  │
 └─────────────────────────────────────────┘
```

### Pattern: Single Broadcast Choke Point (existing convention — follow it, don't duplicate it)

**What:** Every status-mutating method funnels through exactly one private wrapper
(`StackService.transitionStatus()`, mirrored by an equivalent pattern in `BackupService`) that (1)
writes the DB, (2) publishes the SSE event, (3) catches and logs (never throws) a broadcaster
failure.
**When to use:** Any *new* state-mutating method added to `StackService`/`BackupService` during
this phase (e.g. if the `BLOCKED_STATES` gap is fixed) must call the existing wrapper — never call
`repo.transitionStatus()` or `broadcaster.publish()` directly from a new call site.
**Example (existing, verified this session):**
```typescript
// Source: server/src/application/stack-service.ts:545-557
private async transitionStatus(
    id: string,
    from: StackStatus,
    to: StackStatus,
    message?: string,
): Promise<void> {
    await this.repo.transitionStatus(id, from, to, message);
    try {
        this.broadcaster.publish({type: "stack_status", stackId: id, stackStatus: to});
    } catch (err) {
        console.error(`[StackService] failed to publish stack_status for "${id}":`, err);
    }
}
```

### Pattern: Non-throwing broadcaster guard
**What:** Every `broadcaster.publish()` call site is wrapped in its own try/catch that only logs —
a throwing SSE subscriber must never strand a stack in a transitional status.
**When to use:** Any new publish call site this phase might add (e.g. if the badge-pulse fix needed
a new event, which it doesn't — it's CSS-only).
**Example:**
```typescript
// Source: server/src/application/stack-service.ts:560-566
private publishConfigChanged(id: string, newHash: string): void {
    try {
        this.broadcaster.publish({type: "config_changed", stackId: id, newHash});
    } catch (err) {
        console.error(`[StackService] failed to publish config_changed for "${id}":`, err);
    }
}
```

### Recommended Project Structure
No new files/folders are needed. The one code change (badge pulse) lives in the existing file:
```
client/src/components/domain/stack/
├── stack-status-badge.tsx     # add animate-pulse to BACKING_UP/RESTORING/MIGRATING in statusColors
```
If a new test file is added (recommended — see Validation Architecture Wave 0 Gaps):
```
client/test/unit/components/domain/stack/
├── stack-status-badge.test.tsx   # new — does not exist today
```

### Anti-Patterns to Avoid
- **Adding a second broadcast mechanism:** Do not have the client poll or re-fetch on a timer to
  paper over an SSE gap that's already closed — every one of this phase's 3 todos already has a
  working broadcast path; introducing polling would contradict CLAUDE.md's "Do not poll the REST
  API for state that is available via SSE."
- **Reintroducing a hand-rolled pill style:** UI-SPEC explicitly flags `stack-list.tsx`'s
  config-error/config-changed pills as hand-rolled `<span>`s, not `Badge`. Do not add a *third*
  hand-rolled style if touching that file — prefer `Badge` for any new pill, but do not refactor the
  existing two pills unless the phase's own scope requires touching that file (it likely doesn't,
  since the badge-pulse fix is in `stack-status-badge.tsx`, not `stack-list.tsx`).
- **Recoloring `BACKING_UP`/`RESTORING`/`MIGRATING` to blue:** UI-SPEC explicitly reserves blue for
  user-initiated deploy/update actions; the maintenance states must stay gray/`outline` + gain only
  `animate-pulse`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Live UI updates without refresh | A new polling hook or a second SSE channel | The existing `StateBroadcaster` / `useContainerEvents` pipeline | Already covers all 3 todos' event types; a second mechanism would fragment the single source of truth CLAUDE.md mandates |
| Confirming a live SSE round-trip really works | A brand-new client-side "simulate SSE" test harness | `client/test/setup.ts`'s existing global `EventSource` stub (used by `use-stack.test.ts`/`use-stacks.test.ts`) for unit-level proof; a human/manual pass (or a from-scratch e2e tier, see Pitfalls) for the actual live proof | Unit-level SSE dispatch is already provably covered (20+ existing tests) — the gap is specifically *live*, not *unit*, so building more unit mocks doesn't close it |

**Key insight:** every "don't hand-roll" temptation in this phase collapses to the same warning —
the mechanism already exists and is already tested at the unit level; the only real risk is
duplicating it instead of verifying it.

## Common Pitfalls

### Pitfall 1: Treating this phase as a coding phase when it's a verification phase
**What goes wrong:** A planner reads the 3 todo titles literally ("don't broadcast SSE") and plans
tasks to *build* the broadcast wiring — duplicating `transitionStatus()`/`publishConfigChanged()`,
or adding new SSE event types that already exist.
**Why it happens:** The todo files describe the pre-05.1 bug; STATE.md's "Pending Todos" list still
shows them as open because 05.1's plans never closed the todo *files themselves* — only the
underlying code gaps, which is provable by grep/read (done above) but easy to miss if research
trusts the todo file text over the current code.
**How to avoid:** Confirmed this session — read every relevant source file directly, not just the
todo. Plan tasks as: (1) close the todo files (mark historical/resolved with a pointer to 05.1-02/
05.1-04/05.1-06), (2) execute the still-`human_judgment: true` verification items, (3) the one real
`animate-pulse` fix, (4) update STATE.md's Pending Todos list to drop the 3 items once closed.
**Warning signs:** A plan task titled "add SSE broadcast to deployStack()" — that already exists.

### Pitfall 2: Assuming the existing Playwright e2e tier can prove SSE liveness automatically
**What goes wrong:** Planning a new Playwright spec under `client/test/integration/` expecting it to
drive a real `FileWatcher`/chokidar/Postgres/EventSource round trip.
**Why it happens:** `client/test/integration/` looks like the natural home for an "SSE actually
works live" test.
**How to avoid:** `client/test/integration/fixtures.ts`'s `_apiRouteGuard` fixture aborts every
unstubbed `**/api/**` request and explicitly stubs `**/api/events` to return an empty
`text/event-stream` body `[VERIFIED: client/test/integration/fixtures.ts:20-38 — read this session]`.
Playwright's own `webServer` config only starts the Vite dev server, never the Fastify API
`[CITED: comment at fixtures.ts:8-11]`. This tier is deliberately hermetic — it cannot exercise a
real backend, real filesystem watcher, or real SSE stream without a from-scratch architecture change
(a new test tier that boots a real Fastify+Postgres+stacks-dir instance), which is out of proportion
for this phase. Plan the 6 human-judgment items as manual/human verification steps (matching 05.1's
own precedent), not as new automated e2e specs.
**Warning signs:** A plan task that says "write a Playwright test that edits `.env` on disk and
waits for the badge to update" without first addressing the route-guard/stubbed-SSE architecture.

### Pitfall 3: Re-litigating whether `configError`/`configChanged` are independent
**What goes wrong:** Assuming a config error should clear the config-changed flag (or vice versa),
and "fixing" `clearConfigChanged()` to not touch `configError`, or adding a redundant guard.
**Why it happens:** It's a plausible-looking simplification.
**How to avoid:** Already deliberately resolved in 05.1-06 — `configError` and `configChanged` are
independent booleans/fields on `Stack`, verified against `stack-status-machine.ts`
`[VERIFIED: server/prisma/schema/stack.prisma:20-27 — read this session]`:
```
20:  configChanged    Boolean     @default(false) // true = file changed since last deploy
22:  // Null when the file currently parses. Independent of configChanged — both
24:  configError      String?
27:  lastEnvHash      String?
```
`clearConfigChanged()` intentionally nulls both in one write (`server/src/repositories/stack-
repository.ts:242-247`) — this is correct and existing behavior, not a bug to fix.
**Warning signs:** A plan task proposing a "mutual exclusion" or "priority" rule between the two
flags.

### Pitfall 4: Fixing the `BLOCKED_STATES` gap without a decision checkpoint
**What goes wrong:** Silently adding `UPDATING`/`MIGRATING` to `StackActions`' `BLOCKED_STATES`
(`client/src/routes/app/stacks/components/stack-actions.tsx:33`) as an incidental drive-by fix.
**Why it happens:** It's adjacent, easy, and looks like an obvious correctness improvement.
**How to avoid:** UI-SPEC explicitly marks this `⚠ unresolved` and *not* one of the 3 scoped todos —
"fix only if the phase's own live-verification pass surfaces it as user-visible confusion, otherwise
defer." Treat as an assumption/discretion item, not a mandated task, unless CONTEXT.md (if one gets
created via `/gsd-discuss-phase`) locks a decision to include it.
**Warning signs:** A plan task silently expanding `BLOCKED_STATES` with no corresponding
CONTEXT.md decision or explicit user sign-off.

## Code Examples

### Existing SSE event union (client) — must stay byte-identical to the server's
```typescript
// Source: client/src/hooks/use-container-events.ts (read this session)
// comment at line 51: "server's StateEvent union, so field names must stay byte-identical."
export type StateEvent = ContainerStateEvent | StackStatusEvent | ConfigChangedEvent
    | ConfigErrorEvent | UpdateAvailableEvent | NotificationCreatedEvent | ProxyCertStatusEvent
```

### Existing badge-pulse pattern to extend (the one real fix this phase makes)
```typescript
// Source: client/src/components/domain/stack/stack-status-badge.tsx (current state, read this session)
const statusColors: Record<string, string> = {
    RUNNING: "bg-green-500/15 text-green-700 border-green-500/25",
    HEALTHY: "bg-green-500/15 text-green-700 border-green-500/25",
    ERROR: "bg-red-500/15 text-red-700 border-red-500/25",
    UNHEALTHY: "bg-red-500/15 text-red-700 border-red-500/25",
    DEPLOYING: "bg-blue-500/15 text-blue-700 border-blue-500/25 animate-pulse",
    UPDATING: "bg-blue-500/15 text-blue-700 border-blue-500/25 animate-pulse",
    STOPPED: "bg-gray-500/15 text-gray-700 border-gray-500/25",
    DRAFT: "bg-gray-500/15 text-gray-700 border-gray-500/25",
    // BACKING_UP / RESTORING / MIGRATING: absent → falls through to "" (no color, no motion)
    // UI-SPEC-mandated fix: add "animate-pulse" only (keep the outline/gray look, no color change)
};
```
Per the UI-SPEC (verbatim): `BACKING_UP: "animate-pulse"`, `RESTORING: "animate-pulse"`,
`MIGRATING: "animate-pulse"`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Manual actions relied on the next 60s `StatePoller.reconcile()` tick (which explicitly skips transitional states) to ever show a status change | `StackService.transitionStatus()`/`BackupService`'s equivalent broadcast `stack_status` immediately after every DB write | Phase 05.1 (plans 05.1-02, 05.1-04) | Deploy/Stop/Restart/Update/Backup/Restore are now live within the same request cycle, not up to 60s+ later |
| `.env` changes were invisible to `FileWatcher` entirely (only `docker-compose.yml` watched) | `FileWatcher` watches both filenames via an exact-basename Set (`WATCHED_FILENAMES`), with an independent `lastEnvHash` | Phase 05.1 (plan 05.1-06, building on 05.1-02) | External or in-app `.env` edits now flag `configChanged` and broadcast, matching compose-file behavior |
| `config_error` SSE events existed on the wire but had no client-side type/handler/render path | `ConfigErrorEvent` added to the client `StateEvent` union; `Stack.configError` persisted; red `Alert`/pill rendered | Phase 05.1 (plan 05.1-06) | Config parse errors are now visible in the UI, not just server logs/StackEvent audit rows |

**Deprecated/outdated:** None — this phase's own history (the todo files) documents the *prior*
state; nothing currently shipped is itself deprecated.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `BLOCKED_STATES` gap (Deploy not disabled during `UPDATING`/`MIGRATING`) is out of this phase's mandatory scope and should only be fixed if the live-verification pass surfaces real user confusion | Common Pitfalls #4, UI-SPEC | If the user actually wants it fixed regardless, the plan under-delivers; low risk since UI-SPEC already frames this as discretionary and server-side `assertTransition()` prevents any data-safety consequence |
| A2 | The 6 recorded `human_judgment: true` items (D6/05.1-02, D9/05.1-06, D7/05.1-04) should be closed via manual/human verification in this phase's execution, not via a new automated e2e tier | Common Pitfalls #2 | If the team actually wants a permanent automated regression test for live SSE behavior, this phase would need to additionally scope a new test-tier architecture change (real Fastify+Postgres+filesystem harness), which is a materially bigger effort than a verification pass |
| A3 | This session's Docker daemon reachability (`docker info` succeeds, `docker compose version` succeeds) means a live human-verification pass CAN actually be executed during this phase's execution, unlike the 05.1 sessions which were fully blocked | Environment Availability | If the execution session runs in a differently-sandboxed environment (as 05.1's sessions were), the human-judgment items may again be undeliverable in-session and must fall back to a human on an unrestricted host, same as 05.1's own fallback pattern |

**If empty:** N/A — see table above; 3 assumptions logged, none about compliance/security/retention.

## Open Questions

1. **Can this phase's execution session actually reach a running Docktor instance to close the human-judgment items itself, or does it need a human handoff like 05.1 did?**
   - What we know: `docker info`, `docker compose version`, `node`, and `yarn` are all reachable in
     *this research session* (verified below) — a material difference from every 05.1 plan summary's
     documented "no running Docktor instance or browser is available in this sandboxed session."
   - What's unclear: Whether the *execution* session (a separate agent invocation) will have the
     same reachability, and whether a headless-browser check (e.g. via Playwright driven manually,
     or the `run` skill) can substitute for a literal human clicking through two browser tabs — the
     05.1 summaries specifically say "real browser tabs" are needed for the cross-tab check (D6).
   - Recommendation: Plan a task that first re-probes `docker info`/DB reachability at execution
     time; if reachable, attempt a scripted live check (start the app, use curl/EventSource or a
     one-off Playwright script *without* the hermetic `fixtures.ts` guard to observe the SSE stream
     and DOM); if not reachable, fall back to `checkpoint:human-verify` tasks exactly mirroring
     05.1-02 D6 / 05.1-04 D7 / 05.1-06 D9's phrasing, so the human doing the check has an exact
     script to follow.

2. **Should the 3 todo files in `.planning/todos/pending/` be deleted/archived, or left in place with an updated status?**
   - What we know: STATE.md's "Pending Todos" list still lists all 3 as open; the actual code gaps
     they describe are closed.
   - What's unclear: The project's convention for closing a todo once its promoted phase completes
     (not something this research agent should decide).
   - Recommendation: Defer to the planner/`gsd-progress` convention for todo lifecycle; likely
     resolved automatically when Phase 8 is marked complete and STATE.md is regenerated.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker daemon | Live verification of SSE/FileWatcher behavior against a real running stack | ✓ (this session) | Docker Engine 29.8.0 | Human on an unrestricted host, per 05.1 precedent, if execution session differs |
| Docker Compose | Deploying the app itself + test stacks for live verification | ✓ (this session) | v5.5.1 | — |
| Node.js | Running server/client dev processes | ✓ | v24.20.0 | — |
| Yarn | Monorepo scripts (`yarn dev`, `yarn test`) | ✓ | 4.13.0 | — |
| PostgreSQL | `yarn dev`'s server process, DB-backed integration tests | Not probed directly (credentials in `.env.development` are a protected secret file — not read this session); `docker compose` availability strongly suggests the project's own `docker-compose.dev.yml`-provisioned Postgres can be started on demand | — | If unreachable, same fallback as STATE.md's repeatedly-documented "network-restricted-environment limitation" — human verification on an unrestricted host |

**Missing dependencies with no fallback:** None identified — all core tooling is present in this
research session.

**Missing dependencies with fallback:** Live Postgres reachability is unconfirmed (not probed, per
secret-file read guard) — fallback is manual human verification exactly as 05.1 repeatedly used.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (server) | Vitest (`vitest run`, `vitest run --project unit` / `--project test/integration`) |
| Framework (client unit) | Vitest + `@testing-library/react` + jsdom |
| Framework (client e2e) | Playwright (`playwright test`) — hermetic, all `**/api/**` stubbed, SSE stubbed empty (see Pitfall 2) |
| Config files | `server/vitest.config.ts`, `client/vitest.config.ts`, `client/playwright.config.ts` |
| Quick run command | `yarn workspace @docktor/server test:unit` / `yarn workspace @docktor/client test` |
| Full suite command | `yarn test` (root, `yarn workspaces foreach -A run test`) |

### Phase Requirements → Test Map
No REQUIREMENTS.md IDs apply (n/a). Mapping against the 3 todo items instead:

| Todo (behavior) | Test Type | Automated Command | File Exists? |
|---|---|---|---|
| `config_error` persisted/broadcast/rendered | unit | `yarn workspace @docktor/server test:unit -- file-watcher` and `stack-service` | ✅ (`server/test/unit/jobs/file-watcher.test.ts`, `server/test/unit/application/stack-service.test.ts`) |
| `config_error` client handling | unit | `yarn workspace @docktor/client test -- use-stack use-stacks` | ✅ (`client/test/unit/hooks/use-stack.test.ts`, `use-stacks.test.ts`) |
| `.env` watch + config-changed flagging | unit | `yarn workspace @docktor/server test:unit -- file-watcher` | ✅ (`server/test/unit/jobs/file-watcher.test.ts` — `handleEnvChange()` describe, 8 tests) |
| Manual-action `stack_status` broadcast | unit | `yarn workspace @docktor/server test:unit -- stack-service backup-service` | ✅ (`server/test/unit/application/stack-service.test.ts`, `backup-service.test.ts`) |
| `handleSaveCompose`/`handleSaveEnv` refetch | unit | `yarn workspace @docktor/client test -- stack-detail-page` | ✅ (`client/test/unit/routes/stacks/stack-detail-page.test.tsx`) |
| `BACKING_UP`/`RESTORING`/`MIGRATING` pulse (new fix) | unit | `yarn workspace @docktor/client test -- stack-status-badge` | ❌ Wave 0 — file doesn't exist |
| Live cross-tab SSE proof (D6/05.1-02) | manual / human_judgment | none automatable today (see Pitfall 2) | n/a |
| Live config-error/config-changed proof (D9/05.1-06) | manual / human_judgment | none automatable today | n/a |
| Live backup badge round-trip (D7/05.1-04) | manual / human_judgment | none automatable today | n/a |

### Sampling Rate
- **Per task commit:** `yarn workspace @docktor/client test -- stack-status-badge` (once created)
- **Per wave merge:** `yarn test` (full monorepo suite)
- **Phase gate:** Full suite green, plus the 6 human-judgment items explicitly closed (either live
  self-verification or a documented human-verify checkpoint) before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `client/test/unit/components/domain/stack/stack-status-badge.test.tsx` — new file; covers the
  `animate-pulse` fix for `BACKING_UP`/`RESTORING`/`MIGRATING`, and should regression-lock that
  `DEPLOYING`/`UPDATING` stay blue+pulse while the maintenance trio stay `outline`/gray+pulse (no
  color change).
- [ ] No shared fixtures needed — this is a pure presentational-component test, one render per
  status string, same pattern as the existing `cert-status-badge.test.tsx`.
- [ ] Framework install: none — Vitest + Testing Library already configured for `client/`.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Phase touches no auth code path |
| V3 Session Management | No | — |
| V4 Access Control | No | No new routes; SSE endpoint auth is pre-existing and untouched |
| V5 Input Validation | No | No new user input surfaces; `configError`'s message is server-generated (YAML parser error text), not user-supplied at render time beyond what's already sanitized by React's default text escaping |
| V6 Cryptography | No | — |

**Rationale for "No" across the board:** this phase changes zero request-handling, zero auth, and
zero new persisted-then-rendered user input — it is a CSS/motion fix plus closing verification gaps
on already-shipped, already-reviewed (per 05.1's own D-items) code paths. `[ASSUMED]` in the sense
that no fresh STRIDE pass was run this session — deferred to the phase's own `security_enforcement`
config default (enabled) being satisfied trivially by the absence of new attack surface, rather than
by a dedicated new-threat analysis, since there is no new threat surface to analyze.

### Known Threat Patterns for this stack
Not applicable — no new endpoints, no new data flows crossing a trust boundary. The one previously
identified threat relevant to this domain (T-05.1-26, "env content/names/values never leave
`handleEnvChange()`, only stackId/hash are broadcast") is already mitigated and verified in the
existing code (`server/src/jobs/file-watcher.ts:276-283` docstring + confirmed behavior) — this
phase does not touch that code path.

## Sources

### Primary (HIGH confidence — read this session)
- `server/src/lib/state-broadcaster.ts` — full `StateEvent` union, confirms `ConfigErrorEvent`/`ConfigChangedEvent`/`StackStatusEvent` shapes
- `server/src/application/stack-service.ts` — `transitionStatus()`/`publishConfigChanged()` single-choke-point pattern, `updateStack()` env/compose branches
- `server/src/jobs/file-watcher.ts` — `handleFileChange()`/`handleEnvChange()`/`reconcile()`, `WATCHED_FILENAMES`
- `server/src/repositories/stack-repository.ts` — `setConfigChanged`/`setConfigError`/`clearConfigError`/`clearConfigChanged` (confirms independence + combined clear)
- `server/src/domain/stack-status-machine.ts` — `TRANSITIONS`/`ACTION_TARGET` (no `MIGRATING` action exists in this table — it's reached only via the brownfield-migration path, not one of the 7 `Action`s)
- `server/prisma/schema/stack.prisma` — `configChanged`/`configError`/`lastEnvHash` field declarations
- `client/src/hooks/use-stack.ts`, `use-stacks.ts`, `use-container-events.ts` — SSE consumption branches
- `client/src/components/domain/stack/stack-status-badge.tsx` — current `statusColors` gap (confirmed empty for BACKING_UP/RESTORING/MIGRATING)
- `client/src/routes/app/stacks/[id].tsx`, `client/src/components/domain/stack/stack-list.tsx` — Alert/pill rendering, `refetch()` calls
- `client/src/routes/app/stacks/components/stack-actions.tsx` — `BLOCKED_STATES` gap
- `client/test/integration/fixtures.ts` — hermetic Playwright architecture (route guard + stubbed SSE)
- `server/test/unit/application/stack-service.test.ts`, `server/test/unit/jobs/file-watcher.test.ts`, `client/test/unit/hooks/use-stack.test.ts`, `use-stacks.test.ts` — existing coverage confirmation
- `.planning/phases/05.1-stabilization-fix-blockers-and-majors-surfaced-during-testin/05.1-02-SUMMARY.md`, `05.1-04-SUMMARY.md`, `05.1-06-SUMMARY.md` — human_judgment ledger (D6, D9, D7)
- `.planning/phases/08-live-state-consistency/08-UI-SPEC.md` — approved design contract, scope reality check, badge-pulse fix specification
- `package.json`, `server/package.json`, `client/package.json` — dependency version confirmation
- Live probes this session: `docker info` (exit 0, Engine 29.8.0), `docker compose version` (v5.5.1), `node --version` (v24.20.0), `yarn --version` (4.13.0)

### Secondary (MEDIUM confidence)
- None used — this phase required no external/web research; it is entirely a codebase-archaeology task.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all versions read directly from package.json this session
- Architecture: HIGH — every claimed call site read directly with line numbers this session
- Pitfalls: HIGH — the Playwright hermeticity claim and the independent-flags claim are both read
  directly from source, not inferred
- Human-judgment closure path: MEDIUM — depends on execution-session environment reachability,
  which may differ from this research session (see Open Question 1)

**Research date:** 2026-09-13
**Valid until:** 30 days (stable, no external dependencies; codebase itself is the only moving part
and this phase's own execution is what will change it)
