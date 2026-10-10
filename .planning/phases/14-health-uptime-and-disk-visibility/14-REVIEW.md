---
phase: 14-health-uptime-and-disk-visibility
reviewed: 2026-10-10T12:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - client/src/routes/app/stacks/components/service-health-timeline.tsx
  - server/src/index.ts
  - server/src/lib/graceful-shutdown.ts
  - server/src/jobs/health-probe-job.ts
  - server/src/application/service-health-service.ts
  - server/src/application/subscribers/service-health-history-outbox.ts
  - server/src/application/subscribers/service-health-history-subscriber.ts
  - server/src/repositories/service-health-event-repository.ts
  - server/src/infrastructure/dockerode-client.ts
  - server/src/lib/db-pool-config.ts
  - server/src/lib/db.ts
  - docs/deployment.md
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 14: Code Review Report (gap-closure plans 14-18, 14-19, 14-20)

**Reviewed:** 2026-10-10T12:00:00Z
**Depth:** standard
**Files Reviewed:** 12 source files (tests read for reliability only)
**Status:** issues_found

## Summary

Scope was the source changed by commits tagged (14-18), (14-19) and (14-20). The client layout fix (14-18), the graceful shutdown (14-19) and the early-advance logic in `ServiceHealthService` (14-20) hold up under tracing. The per-stack keyed lock serialises `applyProbeResult` and `applyProbeCleared`, so the early-advance/restore pair cannot race with another writer of `entries`. The shutdown budget is consistent (4.5 s of probe job work inside a 5 s step, plus 2.5 s for the server, inside the 9 s hard stop) and `stop()` is idempotent.

The defects are in the new history outbox and in the pool and Docker timeout configuration. None is a data-loss or security blocker in the normal path, but each undermines a stated guarantee.

## Structural Findings (fallow)

None provided.

## Narrative Findings (AI reviewer)

## Warnings

### WR-01: Outbox head-of-line blocking on a permanently failing write

**File:** `server/src/application/subscribers/service-health-history-outbox.ts:124-139`
**Issue:** `drain()` stops at the first failing head and retries only that head, so one write that can never succeed blocks every later history row. `ServiceHealthEvent.stackId` is a cascading foreign key (`server/prisma/schema/service-health-event.prisma:16`). If a stack is deleted between a `service.health_changed` event and its write, the insert fails with an FK violation. That is not an outage. `record()` then queues the write for any error. The poison head is retried every 15 s and every new transition for all stacks queues behind it. Delivery resumes only after 200 further events push the poison entry out through `enqueue()`'s drop-oldest. In the meantime no health history is recorded for any stack. The retry failure is also invisible (see IN-01).
**Fix:** Distinguish permanent from transient failures and drop the former with a log line. For example, treat Prisma `P2003` (FK violation) and `P2002` as permanent.
```ts
} catch (err) {
    if (isPermanentWriteError(err)) {   // e.g. err.code === "P2003"
        console.warn(`${LOG_PREFIX} dropping unwritable transition`, err);
        this.queue.shift();
        continue;
    }
    this.armTimer();
    return;
}
```
Alternatively cap the retries per entry (attempt counter) and drop the entry at the limit.

### WR-02: Capacity drop during an in-flight drain removes the wrong entry

**File:** `server/src/application/subscribers/service-health-history-outbox.ts:103-112, 124-138`
**Issue:** `drain()` reads `head = this.queue[0]`, awaits `repo.record(...)`, then calls `this.queue.shift()` unconditionally. While that await is pending, `record()` can call `enqueue()` on a full queue (200 entries), which shifts the same head off the front. When the write then succeeds, the unconditional `shift()` removes the next entry, which has not been written. That row is silently lost with no warning, and the dropped head is written. This is rare (it needs a full queue and a slow write) but it is exactly the overload situation the queue exists for.
**Fix:** Remove the entry by identity after a successful write.
```ts
await this.repo.record({...head.input, createdAt: head.handledAt});
const index = this.queue.indexOf(head);
if (index !== -1) this.queue.splice(index, 1);
```

### WR-03: `connectionTimeoutMillis` also bounds the wait for a free pooled connection

**File:** `server/src/lib/db-pool-config.ts:4, 19-20, 31`
**Issue:** The doc comment says the setting bounds "a connect". In pg-pool (`node_modules/pg-pool/index.js:198-217`) the same option is also applied to callers queued for a client when the pool is full (`_isFull()`), and they fail with `timeout exceeded when trying to connect`. Before this change the value was 0, so queued callers waited indefinitely. With `max` left at 10 and idle reaping disabled, any burst or long-running transaction that holds all 10 connections for more than 10 s now produces hard query failures (backup runs, StatePoller reconciles and request traffic together), where previously they would have queued. The comment's claim ("fails in at most 10 s instead of waiting without limit") is accurate only for the connect case, and the side effect is undocumented and untested.
**Fix:** Either accept and document the pool-wait bound, or raise `max` and/or use a separate larger bound. At minimum correct the comment and add a unit case documenting that queued checkouts also time out.

## Info

### IN-01: Failed outbox retries are silent

**File:** `server/src/application/subscribers/service-health-history-outbox.ts:133-136`
**Issue:** `catch {` in `drain()` neither logs nor records the error. The first failure is logged in `record()`, but a retry that keeps failing for hours (WR-01) produces no output, so there is nothing to diagnose it from.
**Fix:** Log at `warn` with the error and the queue size, rate-limited, for example once per retry cycle.

### IN-02: `streamDocker` is not guaranteed to be unbounded

**File:** `server/src/infrastructure/dockerode-client.ts:31`
**Issue:** The comment states that no timeout may ever apply to the event and follow-log streams, but `createDockerInstance()` passes no options, and docker-modem fills `timeout` from `process.env.DOCKER_CLIENT_TIMEOUT` (`node_modules/docker-modem/lib/modem.js:72-74`, merged at line 107 with `Object.assign`). If an operator sets that variable, the stream instance receives the idle-socket timeout and the event stream is destroyed between events. The touched file also still carries `(this.streamDocker as any)` (line 35) and `catch (err: any)` (line 105), which project guidelines ask to be replaced when the module is touched.
**Fix:** Pass `{timeout: 0}` explicitly for the stream instance, or ignore the env var by always setting the option. Replace `as any` with a typed option object (`getEvents` accepts `abortSignal` through the existing pattern used for `connectNetwork`).

### IN-03: A flagged unwritten probe state overrides a later observer reset

**File:** `server/src/application/service-health-service.ts:317-322` (`previousState`)
**Issue:** While `existing.unwritten` is true the remembered probe state wins over the stored health. The earlier rule, which re-seeded from the row when a Docker start event or the post-deploy catch-up reset it, is bypassed during that window. Consequence: a row reset to `starting` while a write is outstanding is overwritten by the stale remembered `unhealthy` on the next probe result. The window is limited to one failed read or write, so this is low impact, but the comment on `previousState` does not mention the exception.
**Fix:** Document the exception, or clear `unwritten` in the observer-reset paths (`handleProbeCleared` already deletes the entry), or compare against the row's `containerId`/`startedAt` as well.

---

_Reviewed: 2026-10-10T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
