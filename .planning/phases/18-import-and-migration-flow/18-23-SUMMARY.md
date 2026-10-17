---
phase: 18-import-and-migration-flow
plan: 23
subsystem: api
tags: [docker-events, state-poller, ordering, ndjson, gap-closure, server]
requires:
  - phase: 18-import-and-migration-flow
    provides: StatePoller event stream and reconcile, withKeyedLock (lib/keyed-mutex.ts)
provides:
  - JsonLinesDecoder (buffered, UTF-8 safe, newline-delimited JSON with a line-length cap)
  - Per-compose-project ordered handling of Docker events and reconcile in StatePoller
  - Docker event filter without kill
affects: [18-25 (changes handleEvent and reconcile after this plan), G-18-23-stop-ui, MIG-04]
actuals:
  tokens: 14500
  tasks: 2
  commits: 4
plan_head_before: 42eae3f340e5d532fb1bd920298c3877599b8db6
plan_head_after: 2fe53f29a1dda9c0ecf93e8deceb6604a5b758a0
commits: 4
tech-stack:
  added: []
  patterns:
    - "One stateful decoder per stream (a reconnect gets an empty buffer)"
    - "Per-project serialisation of every writer of a project's service rows via withKeyedLock('state-poller:<project>')"
key-files:
  created:
    - server/src/lib/json-lines-decoder.ts
    - server/test/unit/lib/json-lines-decoder.test.ts
    - server/test/unit/jobs/state-poller-event-stream.test.ts
  modified:
    - server/src/jobs/state-poller.ts
    - server/src/infrastructure/dockerode-client.ts
    - server/test/unit/infrastructure/dockerode-client.test.ts
key-decisions:
  - "Event handling and reconcile of one compose project share the key state-poller:<project>; events without a project key by container id"
  - "kill is no longer subscribed: it fires while the container still runs; die covers every exit and stop follows it"
  - "The decoder caps a pending line at 1 MiB, drops it and skips to the next newline; warnings carry lengths only"
requirements-completed: []
status: complete
---

# Phase 18 Plan 23: Ordered live container state from Docker events Summary

A stop of a stack now ends with every stopped service exited and the stack STOPPED in the database and in the last live update, because Docker's events are decoded line by line and one project's events (and its 60 s reconcile) run strictly in the order Docker sent them (G-18-23-stop-ui).

## What was done

- **Task 1 (tracer):** `lib/json-lines-decoder.ts` (new) decodes the NDJSON event stream: bytes go through a `StringDecoder`, the trailing partial line stays pending, CRLF and blank lines are tolerated and a malformed line is skipped on its own. `StatePoller.startEventStream` creates one decoder per opened stream, and each decoded value that passes the module-private `isDockerEvent` guard goes to `dispatch`, which runs `handleEvent` under `withKeyedLock("state-poller:<project>")` without awaiting. The failing end-to-end test (kill, die, stop in one chunk, the kill inspect slowest) was committed first and now ends exited/STOPPED.
- **Task 2:** the decoder got `maxLineLength` (default 1 MiB): an over-long unterminated line is discarded, input is skipped to the next newline and decoding resumes. `reconcile`'s per-project body moved into `private async reconcileProject`, run under the same key as `dispatch`. `getEventStream` filters start, stop, die and health_status.

## Verification

- `vitest run --project unit` over json-lines-decoder, state-poller-event-stream, state-poller, state-poller-probe-identity, dockerode-client, keyed-mutex and jobs/index: all passed (82 tests in the plan's six files plus 6 in jobs/index).
- RED confirmed before each feature commit (both Task 1 tests failed with zero inspects; Task 2 failed on the decoder cap, the reconcile ordering and the exact event filter).
- Not run, per project memory: full `tsc --build`, server integration (`health-probe.test.ts` constructs a StatePoller), Windows/macOS unit jobs (CI).
- Human re-test still required: stop a managed stack from its detail page and watch status and services switch to stopped/exited without a reload (18-UAT.md G-18-23-stop-ui).

## Deviations from Plan

None - plan executed exactly as written.

One test-only detail: the event-stream test file shares the module-global lock chain across tests, so a test that fails while an inspect is still deferred can stall later tests that use the same project name; with all tests passing this does not occur.

### Process note

Commits were made on the orchestrator-assigned branch `worktree-bridge-cse_...`, which is not in the executor's `agent-*` branch allow-list (sequential mode on a named worktree); the protected-branch check passed.

## Known Stubs

None.

## Threat Flags

None. No new endpoints or trust boundaries. T-18-69 to T-18-72 are mitigated as planned (per-project ordering, line cap and per-line skipping, length-only warnings).

## Notes

- Requirements were not marked complete; the phase has not been re-verified (same convention as 18-19..18-22).
- Plan 18-25 changes `handleEvent` and `reconcile` next; both now run under the per-project key, which that plan must keep.

## Self-Check: PASSED

- Created files exist (json-lines-decoder.ts, json-lines-decoder.test.ts, state-poller-event-stream.test.ts).
- Commits 0b14f77, f2d7942, 2d57c48, 2fe53f2 are ancestors of HEAD.
