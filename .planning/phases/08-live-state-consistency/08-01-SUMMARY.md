---
phase: 08-live-state-consistency
plan: 01
subsystem: ui
tags: [react, vitest, sse, docker, testing-library, tailwind]

# Dependency graph
requires:
  - phase: 05.1-stabilization-fix-blockers-and-majors-surfaced-during-testin
    provides: SSE broadcast wiring for stack_status/config_changed/config_error, config-error persistence and client handling, env-file watching
provides:
  - "animate-pulse motion cue on BACKING_UP/RESTORING/MIGRATING stack status badges"
  - "Regression-locked unit test suite for the whole StackStatusBadge status palette"
  - "Recorded reachability verdict (Branch B) settling whether this execution environment can run the phase's six live-verification items"
  - "Self-contained six-item (V1-V6) plus two-judgement-call (V7-V8) live-verification script for the phase's UAT"
  - "Three stale todo files closed with stamped frontmatter and Resolution sections naming what closed them"
  - "STATE.md corrected: Pending Todos no longer lists the three closed items; Phase 02 config_error blocker annotated RESOLVED"
affects: [08-live-state-consistency UAT, future phases reading STATE.md's Pending Todos / Blockers]

# Actuals (#2632)
actuals:
  tokens: 5900
  tasks: 3
  commits: 3
  plan_head_before: 4e662e03aabb389fe0f0e6c58fdbf051668b1d98

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "statusColors/statusConfig stay two independently-keyed Record<string,...> maps — extend by adding a key, never merge"
    - "Presentational status-badge testing convention (render + screen.getByText + className.toContain/.not.toContain + data-variant attribute assertion), matching cert-status-badge.test.tsx"

key-files:
  created:
    - client/test/unit/components/domain/stack/stack-status-badge.test.tsx
  modified:
    - client/src/components/domain/stack/stack-status-badge.tsx
    - .planning/STATE.md
    - .planning/todos/completed/2026-08-28-config-error-ui-indication-missing.md
    - .planning/todos/completed/2026-08-28-env-file-changes-dont-flag-config-changed.md
    - .planning/todos/completed/2026-08-28-manual-actions-dont-broadcast-sse.md

key-decisions:
  - "Branch B taken: both TCP-payload probes (127.0.0.1:5432 and the container's own bridge address) returned rc=124 bytes=0 — the same limitation STATE.md already records for 05.1-01/05.1-05/05.1-06/06-01/06-07. No live browser pass was attempted; all six items handed to phase UAT as a self-contained script."
  - "Host-contention test flake (4 unrelated client test files, different specific tests across two consecutive full-suite runs) attributed to environment per Task 1's own precondition, not to this plan's change — confirmed by re-running all 4 files in isolation (28/28 pass, exit 0)."
  - "Todos closed now (not after UAT) per plan decision PD-5 — each Resolution states a failing UAT item reopens it through normal gap closure, so the closure is a claim about the code, not the live behavior."

patterns-established: []

requirements-completed:
  - "n/a — phase scoped by three todo files, not by REQUIREMENTS.md IDs: .planning/todos/pending/2026-08-28-config-error-ui-indication-missing.md, .planning/todos/pending/2026-08-28-env-file-changes-dont-flag-config-changed.md, .planning/todos/pending/2026-08-28-manual-actions-dont-broadcast-sse.md"

coverage:
  - id: D1
    description: "BACKING_UP/RESTORING/MIGRATING badges gain animate-pulse, keep outline variant and gray/no-color look; DEPLOYING/UPDATING unchanged; unknown status still falls through cleanly"
    verification:
      - kind: unit
        ref: "client/test/unit/components/domain/stack/stack-status-badge.test.tsx — 24/24 assertions pass, including the three maintenance-state pulse checks and two blue-state regression locks"
        status: pass
      - kind: other
        ref: "yarn typecheck — silent exit 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "Three stale todo files closed (moved to .planning/todos/completed/ with stamped completed/status frontmatter and a ## Resolution section each); STATE.md's Pending Todos list and Phase 02 blocker entry corrected"
    verification:
      - kind: other
        ref: "ls .planning/todos/pending/*.md | wc -l -> 19 (was 22); grep -l 'status: completed' / '^## Resolution' on all three completed files -> 3/3; awk Pending-Todos-bullet-count -> 23 (was 26); grep for new todo path in STATE.md -> 1"
        status: pass
    human_judgment: false
  - id: D3
    description: "V1 (closes 05.1-02 D6, first half) — two browser tabs on the same stack both show the Deploying badge live with no reload during a Deploy, and both return to running when it finishes"
    verification: []
    human_judgment: true
    rationale: "Requires a running Docktor instance + two real browser tabs. Reachability probe returned Branch B (rc=124 bytes=0 at both addresses) — the dev server cannot boot in this session. Same limitation documented for 05.1-01/05.1-05/05.1-06/06-01/06-07."
  - id: D4
    description: "V2 (closes 05.1-02 D6, second half) — saving compose then env on one tab shows the config-changed banner on the other tab with no reload, for both saves"
    verification: []
    human_judgment: true
    rationale: "Same Branch B reachability limitation as D3 — no running instance/browser available in this session."
  - id: D5
    description: "V3 (closes 05.1-04 D7, first half) — with the backup repo cleared, Backup Now produces an error toast naming the missing repository, no status change, no new Backups row"
    verification: []
    human_judgment: true
    rationale: "Same Branch B reachability limitation — no running instance/browser available in this session."
  - id: D6
    description: "V4 (closes 05.1-04 D7, second half; exercises this plan's Task 1) — running a backup moves the badge to Backing Up and back live with no reload, pulsing gray/outline (not blue) while Backing Up"
    verification: []
    human_judgment: true
    rationale: "Same Branch B reachability limitation — no running instance/browser available in this session. The pulse itself is proven at the unit level (D1); only the live DOM/SSE round trip is unproven."
  - id: D7
    description: "V5 (closes 05.1-06 D9, first half) — editing a running stack's .env file directly on disk surfaces the config-changed indicator (list pill + detail banner) within the watcher's detection window, no reload"
    verification: []
    human_judgment: true
    rationale: "Same Branch B reachability limitation — no running instance/browser available in this session."
  - id: D8
    description: "V6 (closes 05.1-06 D9, second half) — a YAML syntax error in a running stack's compose file surfaces a red config-error indicator (list pill + detail banner with parser message) with no reload; fixing the file clears both"
    verification: []
    human_judgment: true
    rationale: "Same Branch B reachability limitation — no running instance/browser available in this session."
  - id: D9
    description: "V7 — judgement call: does the pulsing gray Backing Up badge read as work-in-progress rather than stuck, and is keeping it gray (not blue like Deploying) the right distinction? 'Leave it as shipped' is a valid answer."
    verification: []
    human_judgment: true
    rationale: "Subjective design judgment call requiring a human to view the live badge; cannot be settled by an automated assertion."
  - id: D10
    description: "V8 — judgement call: did the Deploy button staying clickable during UPDATING/MIGRATING (server rejects, error toast, no data-safety issue) actually cause user confusion during the passes above? 08-UI-SPEC.md marks this row unresolved-by-design; only a 'yes' promotes it to a follow-up todo."
    verification: []
    human_judgment: true
    rationale: "Depends entirely on the human's live experience during V1-V6; not answerable from source inspection or automated tests."

duration: 30min
completed: 2026-09-14
status: complete
---

# Phase 8 Plan 1: Live State Consistency Closeout Summary

**Added `animate-pulse` motion to the three maintenance-state stack badges (BACKING_UP/RESTORING/MIGRATING), regression-locked the whole status palette with a new 24-assertion unit test file, settled this session's live-verification reachability as Branch B (blocked, matching 05.1's precedent) via a re-measured TCP-payload probe, and closed out the phase's three stale todo files with stamped resolutions pointing at the Phase 05.1 plans that actually fixed them.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-09-14T08:30:21Z
- **Tasks:** 3
- **Files modified:** 6 (1 component, 1 new test, 3 todo renames+edits, STATE.md)

## Accomplishments

- `BACKING_UP`, `RESTORING`, and `MIGRATING` badges now carry `animate-pulse`, keeping their existing `outline` variant and gray/no-color look — no maintenance state was promoted into the blue "user action" bucket UI-SPEC reserves for `DEPLOYING`/`UPDATING`.
- New `client/test/unit/components/domain/stack/stack-status-badge.test.tsx` regression-locks all 11 `statusConfig` labels, the three maintenance-state pulse cases, the two blue-state regression locks, the green/red/gray non-pulsing states, and the unknown-status fallback — 24/24 assertions pass.
- This session's ability to run the phase's six live-verification items itself was settled by measurement, not assumption: `docker info` succeeds and `docker exec docktor-db-dev psql -U docktor -d docktor -c 'select 1'` returns a row (database is healthy), but a Postgres SSLRequest frame written to both `127.0.0.1:5432` and the container's own bridge address `172.19.0.2:5432` went unanswered for the full 10-second cap at each address. Branch B applies — no live pass was attempted.
- All six previously-stranded `human_judgment: true` items (05.1-02 D6, 05.1-04 D7, 05.1-06 D9) plus two judgement calls (the new pulse's subjective read, and the deferred `BLOCKED_STATES` gap) are restated below as a single self-contained verification script for the phase's UAT.
- The three scoped todo files are closed (`.planning/todos/completed/`), each carrying a `## Resolution` section naming the plan that closed its code gap, the call sites, and the UAT item(s) that will confirm the live behavior. STATE.md's Pending Todos list dropped from 26 to 23 bullets, and the stale Phase 02 `config_error` blocker entry is annotated RESOLVED in place.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "a maintenance-state badge visibly signals work in progress"** (TDD tracer)
   - `a357b68` — `test(08-01): add failing test for stack status badge pulse states` (RED — 3/24 assertions fail for the right reason)
   - `bea2e23` — `feat(08-01): add pulse animation to maintenance-state badges` (GREEN — 24/24 pass; no refactor commit needed, the 3-line change was already minimal and consistent with the existing map pattern)
2. **Task 2: Settle reachability, hand the six items to UAT** — no source-code commit; probe evidence and the verification script are recorded in this SUMMARY.md, committed together with Task 3's edits below (both are documentation-only deliverables with no ordering dependency between them).
3. **Task 3: Close the three stale todos and correct STATE.md** - `f9edc56` — `docs(08-01): close three stale todos and correct STATE.md's pending list`

**Plan metadata:** recorded below (final commit, after self-check and state updates).

_Note: Task 1 is `type="tracer" tdd="true"` — RED then GREEN, no refactor commit was needed._

## Task 2 — Reachability Probe Evidence and Live-Verification Script

### Probe results (verbatim)

```
docker_rc=0
1
```
(`docker info` succeeded, exit 0, and named a Server Version — the daemon is reachable.)

```
DB_IP=172.19.0.2
127.0.0.1 rc=124 bytes=0
172.19.0.2 rc=124 bytes=0
```

Corroborating check: `docker exec docktor-db-dev psql -U docktor -d docktor -c 'select 1'` returned one row (`?column? / 1`) — the database itself is healthy and reachable via `docker exec`.

### Branch taken: **Branch B**

Neither address answered the Postgres SSLRequest payload within the 10-second cap (`rc=124 bytes=0` at both `127.0.0.1:5432` and the container's own bridge address `172.19.0.2:5432`). This is the expected outcome and matches the same limitation STATE.md already records for 05.1-01, 05.1-05, 05.1-06, 06-01, and 06-07: the Docker daemon and the database itself are reachable and healthy, but this agent's network namespace cannot complete a TCP payload exchange with the published/bridge port. `yarn dev`'s server process therefore cannot boot in this session, and no page can be loaded — so no live pass (headless or browser) was attempted. All six verification items below are handed to a human on an unrestricted host, exactly matching 05.1's own precedent (whose four human_verification items were confirmed by the user on 2026-09-11).

No container was created or removed beyond the already-running `docktor-db-dev` service (it was already up before this session's precondition check ran); no `docker compose` command in this session targeted this repository's own `docker-compose.yml`, and `--remove-orphans` was never passed.

### The six-item live-verification script (for the phase's UAT)

**Setup (about five minutes, on a terminal where the TCP-payload block does not apply):**

- S1. Start the dev database: `docker compose -f docker-compose.dev.yml up -d` (bare Postgres 18, container `docktor-db-dev`, its own Compose project). Already running is fine.
- S2. Apply the schema: `yarn db:push`. Without this, V5/V6 below will silently do nothing (STATE.md [Phase 05.1-06]).
- S3. Start the app: `yarn dev`, open `http://localhost:5173`. Note the stacks directory the server logs at boot — V5/V6 edit files there.
- S4. Have one stack deployed and running, and a backup repository configured in Settings (needed for V3/V4).

**V1 — closes 05.1-02 D6, first half.** Open the same stack's detail page in two browser tabs. Press Deploy in tab A. Expected: both tabs show the Deploying badge while the deploy runs, with no manual refresh anywhere in tab B, and both return to the running state when it finishes.

**V2 — closes 05.1-02 D6, second half.** With both tabs still open, edit and save the compose text in tab A's Compose tab, then do the same on the Env tab. Expected: the yellow "Configuration has changed since last deployment. Re-deploy to apply changes." banner appears in tab B without a reload, for both the compose save and the env save.

**V3 — closes 05.1-04 D7, first half.** In Settings, clear the backup repository configuration. On a running stack, press Backup Now. Expected: an error toast that names the missing repository, the stack's status badge does not change, and the Backups tab gains no new row.

**V4 — closes 05.1-04 D7, second half; exercises this plan's Task 1.** Restore the backup repository configuration and run a backup. Expected: the status badge moves to "Backing Up" and back to its previous status live with no page reload — and while it reads "Backing Up" the badge visibly pulses, fading in and out exactly the way "Deploying" does, while staying gray/outline rather than turning blue.

**V5 — closes 05.1-06 D9, first half.** With the stack running, edit its `.env` file directly on disk in the stacks directory from S3, outside the app. Expected: within the file watcher's detection window the config-changed indicator appears with no reload — both the yellow pill in the stack list and the yellow banner on the detail page.

**V6 — closes 05.1-06 D9, second half.** Introduce a YAML syntax error into that stack's `docker-compose.yml` on disk. Expected: a red indicator appears with no reload — a "config error" pill in the stack list and a red banner on the detail page carrying the parser's own message — and fixing the file clears both.

**Two judgement calls:**

**V7.** Does the pulsing "Backing Up" badge read as "work in progress" rather than "stuck"? Is keeping it gray, rather than blue like "Deploying", the right distinction between a maintenance operation and a user-initiated action — or would you rather they look the same? "Leave it as shipped" is a valid answer and is recorded as a decision.

**V8.** While a stack is Updating or Migrating, the Deploy button stays clickable; the server rejects the action and you get an error toast, so nothing unsafe happens. Did that actually confuse you during the passes above? Answering "no, leave it" closes the row; answering "yes" promotes it to a follow-up todo rather than a silent drive-by fix.

Report per item: pass or fail, and what you saw.

## Files Created/Modified

- `client/test/unit/components/domain/stack/stack-status-badge.test.tsx` - New unit test file; 24 assertions covering all 11 statuses, the three maintenance-state pulse cases, both blue regression locks, and the unknown-status fallback
- `client/src/components/domain/stack/stack-status-badge.tsx` - Added `BACKING_UP`/`RESTORING`/`MIGRATING` to `statusColors`, each valued exactly `"animate-pulse"`
- `.planning/todos/completed/2026-08-28-config-error-ui-indication-missing.md` - Moved from pending, stamped, `## Resolution` added (points at 05.1-06, names V6)
- `.planning/todos/completed/2026-08-28-env-file-changes-dont-flag-config-changed.md` - Moved from pending, stamped, `## Resolution` added (points at 05.1-02 and 05.1-06, names V2 and V5)
- `.planning/todos/completed/2026-08-28-manual-actions-dont-broadcast-sse.md` - Moved from pending, stamped, `## Resolution` added (points at 05.1-02 and 05.1-04, names V1, V3, V4)
- `.planning/STATE.md` - Pending Todos list corrected (26 -> 23 bullets); Phase 02 `config_error` blocker entry annotated RESOLVED

## Decisions Made

- Branch B (blocked TCP payload path) taken per the re-measured probe — matches the planning-time measurement exactly (`rc=124 bytes=0` at both addresses). No headless or browser live pass was attempted; all six items handed to UAT.
- Full client test suite showed intermittent failures in 4 files unrelated to this plan's changes (`proxy-tab.test.tsx`, `service-upgrade-dialog.test.tsx`, `stack-actions.test.tsx`, `stack-detail-page.test.tsx`), with different specific failing tests across two consecutive runs — classic host-contention flake, not a regression. Re-ran all 4 files in isolation: 28/28 pass, exit 0. Per Task 1's own `<precondition>`, this is not attributed to this task. `uptime`/`free -m` showed load average 2.02-4.13 (well under the ~24 four-cores-per-6 threshold) but swap fully allocated (0 free of 2047MB) on a host with 199 days uptime and ~1.5GB available memory — consistent with accumulated stale swap pages rather than active thrashing.
- Todos closed now, not after UAT (plan decision PD-5) — each `## Resolution` states a failing UAT item reopens it through normal gap closure.

## Deviations from Plan

None - plan executed exactly as written. Task 2's SUMMARY.md content and Task 3's todo/STATE.md edits were both completed before this file's final write and commit (documentation-only deliverables with no execution-order dependency between them); the plan's task numbering is preserved in the narrative above and in the Task Commits section.

## Issues Encountered

- Full client test suite (`yarn workspace @docktor/client test`) showed transient failures in 4 unrelated files across two runs (host-contention flake, load avg 2-4 on 6 cores, swap fully allocated) — see Decisions Made. All 4 files pass cleanly in isolation (28/28). This plan's own new/changed test file (`stack-status-badge.test.tsx`) passed reliably in every run (24/24).
- TCP-payload-to-Docker-published-port block reconfirmed for this session (same class as 05.1-01/05.1-05/05.1-06/06-01/06-07) — `docker info` and `docker exec ... psql` both succeed, but a raw SSLRequest frame gets no response at either `127.0.0.1:5432` or the container's bridge address within 10s. Branch B taken; no live pass possible in this session.

## User Setup Required

None - no external service configuration required. A human on an unrestricted host must run the six-item verification script (V1-V6 plus judgement calls V7-V8) above before this phase's UAT can close.

## Next Phase Readiness

- The one real code gap this phase's scope actually had (`animate-pulse` on maintenance-state badges) is shipped, tested, and typechecked clean.
- All three of this phase's scoped todos are closed with resolutions naming what fixed them.
- STATE.md's Pending Todos list and Phase 02 blocker entry are corrected to match reality.
- Blocker: the six-item live-verification script above (V1-V6, V7-V8) has not been executed by a human yet — this phase's UAT cannot close until that happens, matching every prior phase's precedent (05.1, 06-03, 06-06) for this same environment limitation.

## Self-Check: PASSED

All claimed files found on disk (`client/test/unit/components/domain/stack/stack-status-badge.test.tsx`, `client/src/components/domain/stack/stack-status-badge.tsx`, the three completed todo files, this SUMMARY.md). All claimed commit hashes found in `git log --oneline --all` (`a357b68`, `bea2e23`, `f9edc56`, `f1295f5`).

---
*Phase: 08-live-state-consistency*
*Completed: 2026-09-14*
