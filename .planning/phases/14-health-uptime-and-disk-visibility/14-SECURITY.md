---
phase: "14"
slug: health-uptime-and-disk-visibility
status: verified
threats_open: 0
asvs_level: 1
created: "2026-10-10"
---

# Phase 14 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser → Fastify API | Auth-protected health, uptime, storage and settings routes | Stack/service names, health messages, retention settings |
| Compose file → probe config | User-authored `x-docktor.health-probe` block | Probe URL (loopback-only), timeouts |
| Docktor → Docker daemon | Probe network attach/detach, inspect, events | Container IDs, network attachments |
| Docktor → stack container | Short-lived HTTP(S) liveness probe | Status code only; body discarded |
| Server → filesystem | `du` scans of stack volumes/backups | Directory sizes |
| Server → PostgreSQL | Health events, incidents, volume usage | History rows |

---

## Threat Register

62 unique threats (T-14-SC counted once across 20 plans): 58 mitigate, 4 accept. All CLOSED.
Evidence is `file:line` under `server/`, `client/`, `shared/`.

| Threat ID | Category | Component | Severity | Disposition | Mitigation (evidence) | Status |
|-----------|----------|-----------|----------|-------------|-----------------------|--------|
| T-14-01 | Info Disclosure | GET /stacks/:id/health-events | medium | mitigate | requireAuth `routes/health.ts:7`; 404 `service-health-history-service.ts:17`; `health.test.ts:154,159` | closed |
| T-14-02 | Tampering | health-events query params | medium | mitigate | Zod limit 1-200 `shared/validation/health.ts:9`; `health.test.ts:165` | closed |
| T-14-03 | DoS | unbounded history | low | mitigate | limit cap 200, indexes `service-health-event.prisma:26`, pruner 14-12 | closed |
| T-14-04 | Repudiation | history lost on Service recreate | medium | mitigate | keyed by stackId+serviceName, no FK; `health.test.ts:103` | closed |
| T-14-05 | Info Disclosure | GET /api/storage | medium | mitigate | `routes/storage.ts:6`; `storage.test.ts:183` (401) | closed |
| T-14-06 | Tampering / EoP | `du` invocation | high | mitigate | `execFile("du", ["-sk","--",path])` `disk-usage-scanner.ts:102`; `getStackPath` escape check `lib/stacks-dir.ts:72` | closed |
| T-14-07 | Info Disclosure | symlinks under volumes/ | medium | mitigate | Dirent `isDirectory()` `disk-usage-scanner.ts:97`; lstat `disk-usage-job.ts:161` | closed |
| T-14-08 | DoS | boot blocked by long `du` | medium | mitigate | no run on start, 60s unref'd timer `disk-usage-job.ts:38,57`; 10 min per-path timeout | closed |
| T-14-09 | DoS | /api/stacks 500 on BigInt | high | mitigate | serialization `stack-service.ts:122-128`; `storage.test.ts:115` | closed |
| T-14-10 | Tampering (XSS) | health timeline message | low | mitigate | React text node `service-health-timeline.tsx:83`; XSS payload test | closed |
| T-14-11 | DoS | SSE refetch storm | low | mitigate | same-stack events only `use-service-health-events.ts:50` | closed |
| T-14-27 | Spoofing / SSRF | probe URL host (client) | high | mitigate | loopback-only schema `shared/validation/health.ts:57`; `health-probe.spec.ts:116` | closed |
| T-14-28 | Tampering | compose integrity on form edit | medium | mitigate | yaml Document API `compose-health-probe.ts`; `confirmed` enforced `stack-service.ts:369` | closed |
| T-14-29 | Info Disclosure | uptime endpoints | medium | mitigate | requireAuth, 404 `uptime-service.ts:74`; `uptime.test.ts:207,213,240` | closed |
| T-14-30 | Tampering | retention setting | medium | mitigate | schema + auth `routes/settings.ts:49,130`; fallback 30d `settings-service.ts:451` | closed |
| T-14-31 | DoS | incident list size / uptime reads | low | mitigate | 200 cap `uptime-service.ts:7`; index `status-log.prisma:16` | closed |
| T-14-32 | Tampering / Repudiation | duplicate or lost incidents | medium | mitigate | keyed lock `incident-tracker.ts:36`; concurrency test | closed |
| T-14-33 | Tampering | HealthHistoryPruner data loss | high | mitigate | retention read first, `lt` never matches NULL `stack-incident-repository.ts:47`; `health-history-pruner.test.ts:74` | closed |
| T-14-34 | Tampering (XSS) | storage name rendering / links | medium | mitigate | no `dangerouslySetInnerHTML`; `encodeURIComponent` `storage-stacks-table.tsx:108` | closed |
| T-14-35 | Info Disclosure | /storage route | low | mitigate | inside `ProtectedRoute` `router.tsx:48` | closed |
| T-14-36 | Spoofing / SSRF | ProbeTransport | high | mitigate | re-validation `probe-transport.ts:357`; pinned lookup `:243`; `probe-transport.test.ts:241` | closed |
| T-14-37 | Info Disclosure | probe responses | medium | mitigate | `res.resume()` `:313`; fixed reason strings `domain/health-probe.ts:109` | closed |
| T-14-38 | DoS | probe scheduling | medium | mitigate | 30s/stagger, timeout 1-30s, in-flight guard `health-probe-job.ts:228` | closed |
| T-14-39 | Tampering | https probes skip cert verification | low | accept | see Accepted Risks | closed |
| T-14-40 | Tampering | concurrent probe results | medium | mitigate | keyed lock, write-before-emit `service-health-service.ts:103,269` | closed |
| T-14-41 | Tampering (XSS) | IncidentList / UptimeCard | low | mitigate | React text only; incident list component since removed (surface gone) | closed |
| T-14-42 | DoS | uptime refetch storm | low | mitigate | status-change-only refetch `use-stack-uptime.ts:59` | closed |
| T-14-43 | EoP / availability | lingering network attachment | medium | mitigate | release in `finally`, refcount, alias sweep `probe-transport.ts:171,378` | closed |
| T-14-44 | Info Disclosure | Docktor reachable during attach window | medium | accept | see Accepted Risks | closed |
| T-14-45 | Tampering | StatePoller overwriting probe health | medium | mitigate | `probed-service-registry.ts`; `state-poller.ts:247,315` | closed |
| T-14-46 | DoS | `compose down` racing attach | low | mitigate | transitional stacks skipped `health-probe-job.ts:264` | closed |
| T-14-47 | Tampering | retention card data loss | medium | mitigate | AlertDialog on decrease `health-retention-card.tsx:182`; `uptime-retention.spec.ts:165,185` | closed |
| T-14-48 | DoS | batch uptime refetch | low | mitigate | filtered events `use-stack-uptimes.ts:41` | closed |
| T-14-49 | DoS | reconcile inspect per container | low | mitigate | failure falls back `state-poller.ts:304`; test `:483` | closed |
| T-14-50 | Tampering | health clobbered to null | medium | mitigate | stored health kept `state-poller.ts:312`; test `:525` | closed |
| T-14-51 | DoS | many due probes in one tick | medium | mitigate | `PROBE_CONCURRENCY=8` `health-probe-job.ts:15` | closed |
| T-14-52 | Tampering | stale probe health after removal/stop | medium | mitigate | `probe_cleared` `health-probe-job.ts:301`; `handleProbeCleared` | closed |
| T-14-53 | Spoofing | broken block silently disabling probe | medium | mitigate | invalid-config failure, last good parse kept `:344,406` | closed |
| T-14-54 | Info Disclosure | symlinked `<stack>/backups` | medium | mitigate | lstat `disk-usage-scanner.ts:119` | closed |
| T-14-55 | Tampering | failed `du` overwriting good size | medium | mitigate | null skips record `disk-usage-job.ts:126` | closed |
| T-14-56 | DoS | one broken stack aborting scan | low | mitigate | per-stack try/catch `disk-usage-job.ts:123` | closed |
| T-14-57 | DoS | probe-path Docker calls | high | mitigate | `lib/with-deadline.ts`; all bounded `probe-transport.ts:120,365` | closed |
| T-14-58 | DoS | pending Engine requests | medium | mitigate | AbortSignal `dockerode-client.ts:46,64` | closed |
| T-14-59 | EoP / availability | late connect leaves attachment | medium | mitigate | 403 treated as attached, alias sweep `probe-transport.ts:141,387` | closed |
| T-14-60 | Repudiation | stalled tick with no signal | medium | mitigate | watchdog log `health-probe-job.ts:228` | closed |
| T-14-61 | DoS | boot blocked by `start()` pre-steps | high | mitigate | bounded steps `health-probe-job.ts:195` | closed |
| T-14-62 | Tampering | late result for replaced container | medium | mitigate | containerId guard `service-health-service.ts:149` | closed |
| T-14-63 | Tampering | old container health carried over | medium | mitigate | `domain/service-health.ts:47`; identity tests | closed |
| T-14-64 | Repudiation | 404 clear mis-attributed | low | mitigate | source by ownership `state-poller.ts:263` | closed |
| T-14-65 | DoS | replica id alternation flapping | low | mitigate | reset only when single container `state-poller.ts:330` | closed |
| T-14-66 | Info Disclosure | symlinked `<stack>/volumes` | medium | mitigate | `isRealDirectory` `disk-usage-job.ts:161` | closed |
| T-14-67 | DoS | `du` stderr flood | low | mitigate | 64 MiB maxBuffer `disk-usage-scanner.ts:46` | closed |
| T-14-68 | Tampering | concurrent scans racing | low | mitigate | `scanning` guard `disk-usage-job.ts:96` | closed |
| T-14-69 | Tampering | HealthEventRow message | low | mitigate | React text `service-health-timeline.tsx:83` | closed |
| T-14-70 | DoS | shutdown hang / SIGKILL leaves attachment | high | mitigate | `index.ts:84`; `lib/graceful-shutdown.ts` 9s hard deadline | closed |
| T-14-71 | Tampering | late results after sweep | medium | mitigate | `discardResults` `health-probe-job.ts:168` | closed |
| T-14-72 | DoS | crash leaves saved attachment | medium | accept | see Accepted Risks | closed |
| T-14-73 | DoS | unbounded history outbox | medium | mitigate | 200 cap `service-health-history-outbox.ts:22` | closed |
| T-14-74 | Repudiation | out-of-order/duplicate retries | medium | mitigate | head-first ordered retry `outbox.ts:79,124` | closed |
| T-14-75 | DoS | socket timeout cutting quiet streams | medium | mitigate | streams on untimed instance `dockerode-client.ts:30` | closed |
| T-14-76 | DoS | idle pooled connections | low | accept | see Accepted Risks | closed |
| T-14-SC | Tampering | dependency installs (all plans) | high | mitigate | package.json / yarn.lock unchanged since Phase 13 merge | closed |

*Status: open · closed*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-14-01 | T-14-39 | https probes don't verify the container cert (container IP never matches). Liveness only; no credentials or body sent, body discarded (`probe-transport.ts:289`). | plan 14 / auditor | 2026-10-10 |
| AR-14-02 | T-14-44 | Docktor reachable from stack containers for one probe request (1-30s). Inherent to amended D-05; only the auth-protected API is exposed. | plan 14-09 / auditor | 2026-10-10 |
| AR-14-03 | T-14-72 | Crash/SIGKILL can leave a saved attachment; Docker then refuses to start Docktor once that network is gone. Unfixable in-process; recovery in `docs/deployment.md:333`, startup sweep otherwise. | plan 14-19 / auditor | 2026-10-10 |
| AR-14-04 | T-14-76 | Idle pooled DB connections never reaped (`max` stays 10); Postgres has a single client (`db-pool-config.ts`). | plan 14-20 / auditor | 2026-10-10 |

Residual (non-blocking): the T-14-73 outbox is in-memory, so queued history writes are lost on restart; T-14-74 may duplicate a row if a committed write reported failure.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-10 | 62 | 62 | 0 | gsd-security-auditor (ASVS L1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-10
