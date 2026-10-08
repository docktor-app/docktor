# Phase 14: Health, Uptime and Disk Visibility - Pattern Map

**Mapped:** 2026-10-07
**Files analyzed:** 46 new/modified (grouped where one analog covers several)
**Analogs found:** 44 / 46 (all analog paths verified git-tracked source; none are gitignored mirrors)

Post-Research Amendments in CONTEXT.md apply: probe hosts restricted to localhost/127.0.0.1/[::1]; ephemeral network attach/detach; backups are per-stack `<stack>/backups`; health events keyed by `(stackId, serviceName)`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `server/src/jobs/health-probe-job.ts` | job (IntervalJob, producer) | event-driven / batch | `server/src/jobs/disk-checker.ts` | role+flow |
| `server/src/jobs/disk-usage-job.ts` | job (IntervalJob) | batch / file-I/O | `server/src/jobs/disk-checker.ts` + `image-update-check-pruner.ts` | role-match |
| `server/src/jobs/health-history-pruner.ts` | job (IntervalJob) | batch / CRUD | `server/src/jobs/image-update-check-pruner.ts` | exact |
| `server/src/jobs/index.ts` (modify) | config/registry | - | itself (lines 16-24) | exact |
| `server/src/jobs/state-poller.ts` (modify: reconcile fix) | job | event-driven | itself (lines 253-329) + `application/container-state-catch-up.ts` | exact |
| `server/src/domain/health-probe.ts`, `uptime.ts`, `incident-tracking.ts` | domain (pure) | transform | `server/src/domain/stack-state-derivation.ts` | exact |
| `server/src/domain/events.ts` (modify) | domain types | pub-sub | itself | exact |
| `server/src/application/service-health-service.ts` | service | event-driven | `application/container-state-catch-up.ts` + `jobs/state-poller.ts` emit block | role-match |
| `server/src/application/incident-tracker.ts` | service (keyed-lock writer) | event-driven | `application/proxy-service.ts` (`withKeyedLock`) | role-match |
| `server/src/application/uptime-service.ts`, `storage-service.ts` | service | request-response/CRUD | `application/settings-service.ts` | role-match |
| `server/src/application/subscribers/health-subscriber.ts` | subscriber | pub-sub | `subscribers/stack-event-subscriber.ts` | exact |
| `server/src/application/subscribers/register.ts` (modify) | wiring | pub-sub | itself | exact |
| `server/src/application/index.ts` (modify) | composition root | - | itself | exact |
| `server/src/application/ports/probe-transport-port.ts`, `disk-usage-scanner-port.ts` | port | - | `ports/socket-inspector-port.ts`, `ports/dockerode-client-port.ts` | exact |
| `server/src/infrastructure/probe-transport.ts` | infra adapter | request-response | `infrastructure/socket-inspector.ts` (runner seam, `hostname()`) | role-match |
| `server/src/infrastructure/disk-usage-scanner.ts` | infra adapter | file-I/O / shell-out | `infrastructure/socket-inspector.ts` (CommandRunner) | exact |
| `server/src/lib/compose-health-probe.ts` | util (yaml read) | transform | `server/src/lib/compose-proxy-editor.ts` (`readServiceProxyEnv`) | exact |
| `server/src/repositories/service-health-event-repository.ts`, `stack-incident-repository.ts`, `stack-disk-usage-repository.ts` | repository | CRUD | `repositories/image-update-check-repository.ts` | exact |
| `server/src/repositories/index.ts` (modify) | barrel | - | itself | exact |
| `server/src/repositories/stack-repository.ts` (modify: BigInt DTO / health writes) | repository | CRUD | itself (`updateServiceState`, `updateStackStatus`) | exact |
| `server/src/routes/health.ts`, `storage.ts`; `routes/settings.ts` (modify) | route | request-response | `server/src/routes/settings.ts`, `routes/stacks.ts` | exact |
| `server/prisma/schema/service-health-event.prisma`, `stack-disk-usage.prisma` | model | - | `server/prisma/schema/status-log.prisma`, `notification.prisma` | exact |
| `shared/src/validation/health.ts` (+ `index.ts` export) | Zod schema | validation | `shared/src/validation/settings.ts` (`composeCheckSettingsSchema`) | exact |
| `client/src/lib/health-api.ts`, `storage-api.ts` | API client | request-response | `client/src/lib/settings-api.ts` | exact |
| `client/src/hooks/use-stack-uptime.ts`, `use-stack-uptimes.ts`, `use-service-health-events.ts`, `use-storage.ts` | hook | request-response + SSE refetch | `client/src/hooks/use-stack-events.ts` | exact |
| `client/src/lib/compose-health-probe.ts` | util | transform | `server/src/lib/compose-proxy-editor.ts` (yaml Document API) | role-match |
| `client/src/routes/app/storage.tsx` + `storage/components/*` | page + sections | request-response | `client/src/routes/app/dashboard.tsx` | exact |
| `routes/app/stacks/components/uptime-card.tsx` | component | request-response | `routes/app/dashboard/components/dashboard-stat-cards.tsx` + `components/common/stat-card.tsx` | role-match |
| `routes/app/stacks/components/incident-list.tsx`, `service-health-timeline.tsx` | component | request-response | `routes/app/stacks/components/activity-timeline.tsx` | role-match |
| `routes/app/stacks/components/health-probe-form.tsx` | component (form) | CRUD on compose buffer | `compose-checks-card.tsx` (RHF) + `config-tab.tsx` | partial |
| `routes/app/stacks/components/overview-tab.tsx`, `services-section.tsx`, `config-tab.tsx` (modify) | component | - | themselves | exact |
| `routes/app/settings/components/health-retention-card.tsx` | component (settings card) | CRUD | `compose-checks-card.tsx` | exact |
| `components/domain/stack/uptime-badge.tsx`; `stack-list.tsx`, `service-status-badge.tsx` (modify) | component | - | `stack-status-badge.tsx` / `stack-list.tsx` / `service-status-badge.tsx` | exact |
| `client/src/lib/format-bytes.ts`, `format-incident-duration.ts`, `uptime-format.ts` | util | transform | `client/src/lib/dashboard-stats.ts` / `backup-format.ts` | role-match |
| `app-sidebar.tsx` (modify, line 20 nav array), `router.tsx` (modify) | config | - | themselves | exact |
| tests under `server/test/unit/{jobs,domain,infrastructure,application}`, `client/test/unit/{hooks,routes}`, `client/test/integration/fixtures.ts` | test | - | `server/test/unit/jobs/image-update-check-pruner.test.ts`, `client/test/unit/hooks/use-stack-events.test.ts` | exact |

## Pattern Assignments

### `server/src/jobs/health-probe-job.ts` (IntervalJob, producer)

**Analog:** `server/src/jobs/disk-checker.ts` (job shape, bus injection, lazy production wiring, `Job` facade) and `server/src/jobs/job.ts` (contract).

**Class + constructor injection + emit** (disk-checker.ts 12-30, 94-104):
```typescript
export class DiskChecker extends IntervalJob {
    readonly name = "DiskChecker"
    protected readonly cronExpression = "0 0 * * *"
    protected readonly runImmediatelyOnStart = true
    constructor(private readonly bus: Pick<EventBusPort, "emit">, ...) { super() }
    protected async run(): Promise<void> { await this.check() }
}
// emit with defence-in-depth try/catch
try { this.bus.emit("disk.threshold_crossed", {...}) } catch (emitErr) { console.error("[DiskChecker] bus emit failed", emitErr) }
```
Probe job overrides: `cronExpression = "*/5 * * * * *"`, `runImmediatelyOnStart = false`, own `inFlight` guard (`IntervalJob.runGuarded` does not prevent overlap, job.ts 80-88). Per-service `nextDueAt` map keyed `stackId/serviceName`.

**Lazy production facade (copy verbatim shape)** (disk-checker.ts 111-149): module-level `_checker`/`_healthReporter`, `createProductionChecker()` that `await import("../application/index.js")` (keeps db.ts out of unit-test graph), and `export const diskChecker: Job = {name, kind: "interval", start, stop, setHealthReporter}`.

Register in `jobs/index.ts` after existing lines 16-24: `jobRegistry.register(healthProbeJob)`; register disk job LAST (startAll awaits sequentially; research Finding 7).

---

### `server/src/jobs/disk-usage-job.ts` (IntervalJob, daily, non-blocking)

**Analog:** `disk-checker.ts` (cron `"0 0 * * *"`, facade) with `runImmediatelyOnStart = false` and a non-awaited kickoff in the facade `start()` (`await _job.start(); void _job.kickoff()`). Inject a scanner port and repo via constructor like `ImageUpdateCheckPruner` (`constructor(store?)`, `getStore()` lazily imports `../repositories/index.js`, lines 31-40).

---

### `server/src/jobs/health-history-pruner.ts` (IntervalJob, prune)

**Analog:** `server/src/jobs/image-update-check-pruner.ts` (exact structure).

**Pattern** (lines 24-55):
```typescript
export class ImageUpdateCheckPruner extends IntervalJob {
    readonly name = "ImageUpdateCheckPruner"
    protected readonly cronExpression = "0 0 * * *"
    protected readonly runImmediatelyOnStart = true
    private readonly store: ImageUpdateCheckPrunerStore | null
    constructor(store?: ImageUpdateCheckPrunerStore) { super(); this.store = store ?? null }
    private async getStore() {
        if (this.store !== null) return this.store
        const {imageUpdateCheckRepository} = await import("../repositories/index.js")
        return imageUpdateCheckRepository
    }
    protected async run(): Promise<void> {
        // Deliberately not wrapped in try/catch: a failed read must reject the run
        ...
        if (pruned > 0) console.log(`[ImageUpdateCheckPruner] pruned ${pruned} stale row(s)`)
    }
}
export const imageUpdateCheckPruner = new ImageUpdateCheckPruner()   // already a Job: has name/kind/start/stop/setHealthReporter
```
Note the exported instance is itself registered (no facade needed because the class has no top-level db import). Never coerce a failed retention-setting read into a default that deletes data: read `health.retentionDays` first and let errors reject. Keep the newest StatusLog anchor row per stack (research Finding 6).
**Test analog:** `server/test/unit/jobs/image-update-check-pruner.test.ts` lines 1-50 (store fake with `vi.fn()`, `runOf(job)` calls protected `run()` via cast).

---

### `server/src/jobs/state-poller.ts` (modify: reconcile fix, Finding 4)

**Analog:** itself. Replace the hardcoded `healthStatus: null` at lines 284-290 and 294-303:
```typescript
await repo.updateServiceState({stackId: stack.id, serviceName: svcName, containerId: container.Id,
    containerState: container.State, healthStatus: null })          // <- inspect real health instead
...
if (matchingContainer) return {containerState: matchingContainer.State, healthStatus: null}   // <- same
```
Copy the correct health read from `server/src/application/container-state-catch-up.ts`: `healthStatus: info.State.Health?.Status ?? null` (via `docker.inspectContainer`), and keep stored value when inspect fails. Probe-overridden services (D-07) must keep the probe status. Update pinned expectation `server/test/unit/jobs/state-poller.test.ts` ~line 196.

**Emit block to reuse for probe-driven status change** (state-poller.ts 230-250):
```typescript
const statusLog = await repo.updateStackStatus(stack.id, derivedStatus)
this.bus.emit("stack.container_state_changed", {
    stackId: stack.id, serviceName, containerState, healthStatus, stackStatus: derivedStatus,
    ...(statusLog && {statusLog: {id: statusLog.id, fromStatus: statusLog.fromStatus, toStatus: statusLog.toStatus,
        message: statusLog.message, createdAt: statusLog.createdAt.toISOString()}}),
})
```
`ServiceHealthService` re-emits exactly this event so `NotificationWatcher` and SSE are unchanged (#23 criterion 4). Transitional-state guard: `if (isTransitionalStatus(stack.status)) continue` (line 274).

---

### `server/src/domain/health-probe.ts`, `uptime.ts`, `incident-tracking.ts` (pure domain)

**Analog:** `server/src/domain/stack-state-derivation.ts` (pure, typed against Prisma enum types, no I/O).

**Imports/shape** (lines 1-27): `import type {StackStatus} from "../generated/prisma/enums.js"`; exported constants as `ReadonlySet<string>`; pure `deriveStackStatus(services: ReadonlyArray<{containerState?: string|null; healthStatus?: string|null}>): StackStatus`. Reuse `isTransitionalStatus` (lines 17-19) for "neutral" classification. Service-level health strings consumed: `"healthy" | "unhealthy" | null` (lines 43-50); probe emits `"healthy" | "unhealthy" | "starting"` (`"starting"` falls to RUNNING default branch). Use the `evaluateProbe` / `computeUptime` code sketches in 14-RESEARCH.md "Code Examples" (constants 30s/3/60s). **Test analog:** `server/test/unit/domain/stack-state-derivation.test.ts`.

---

### `server/src/domain/events.ts` (modify)

**Analog:** itself. Add payload interfaces (past tense, no imports) and register in `DomainEventMap` (lines 149-162):
```typescript
export interface DomainEventMap {
    "stack.status_changed": StackStatusChangedEvent;
    "stack.container_state_changed": StackContainerStateChangedEvent;
    ...
    "disk.threshold_crossed": DiskSpaceThresholdCrossedEvent;
}
```
Add `"service.probe_completed"` and `"service.health_changed"` (and optionally incident opened/closed). Bigint is allowed in payloads (see `DiskSpaceThresholdCrossedEvent`).

---

### `server/src/application/subscribers/health-subscriber.ts` (+ `register.ts` modify)

**Analog:** `server/src/application/subscribers/stack-event-subscriber.ts`.

**Pattern** (lines 38-89): `export function subscribeX(bus: Pick<EventBusPort,"subscribe">, repo: NarrowRepoInterface): () => void`; push `bus.subscribe("event.name", (payload) => ...)` disposers into an array; handler returns the awaited promise from a `writeEvent`-style helper whose `try/catch` does `console.error(\`[stack-event-subscriber] failed to write ... "${eventName}":\`, err)` (no try/catch otherwise - bus isolates listeners, D-17). Narrow, write-only repo interfaces defined in the subscriber file.

**Register** (register.ts 32-45): extend `RegisterDomainSubscribersDeps`, call `subscribeHealth(bus, deps.health)` and add its disposer to the returned closure; document ordering in the doc comment. Deps are supplied in `application/index.ts` lines 108-112 (`registerDomainSubscribers(domainEventBus, {stackEventRepo: stackEventRepository, notificationService, broadcaster: stateEventBroadcaster})`).

---

### `server/src/application/incident-tracker.ts` (keyed-lock, idempotent)

**Analog:** `server/src/application/proxy-service.ts` lines 17, 212, 301 use `withKeyedLock(stackId, async () => {...})`.

**Lock primitive** (`server/src/lib/keyed-mutex.ts` 17-47): `withKeyedLock<T>(key: string, fn: () => Promise<T>): Promise<T>`; never poisons the chain on rejection. Inside the lock: find open (`resolvedAt: null`) incident, then create/close. Do NOT upsert on `@@unique([stackId, triggerType, resolvedAt])` (NULLs distinct; research Finding 6). State-based/idempotent like `NotificationWatcher.handleStatusChange(stackId, stackStatus)`; subscribe to both `stack.status_changed` (payload `status`) and `stack.container_state_changed` (payload `stackStatus`).

---

### `server/src/application/service-health-service.ts`, `uptime-service.ts`, `storage-service.ts`

**Analogs:** `application/container-state-catch-up.ts` (ctor deps: `dockerodeClient, repo, domainEventBus`; composed at `application/index.ts` line 75) for the health writer; `application/settings-service.ts` for settings-backed reads/writes.

**Settings key pattern** (settings-service.ts line 26-28): `COMPOSE_CHECK_SETTING_KEYS = {..., checkEnabled: (id) => \`composeChecks.${id}.enabled\`}`; reads via `this.repo.getMany(keys)` (line 116/328), writes via `this.repo.upsert(key, String(v))` (lines 133-139, 257). Use key `health.retentionDays`, default 30 when absent (D-10). Compose-check get/save pair (lines ~270-310) is the template for `getHealthSettings` / `saveHealthSettings`.

**Composition root** (`application/index.ts`): instantiate once and `export const xService = new XService(repo..., domainEventBus)`; add comment block citing the issue number like lines 72-77. Never construct repositories here; import singletons from `../repositories/index.js` (lines 4-15).

---

### `server/src/application/ports/*-port.ts`

**Analog:** `ports/socket-inspector-port.ts` (single-method interface + doc comment explaining D-07 "application depends on port, not infrastructure") and `ports/dockerode-client-port.ts` (add `getNetwork().connect/disconnect` / `inspectContainer` access for attach/detach; it currently exposes `inspectContainer`, `listContainers`, event/log streams only - extend the port and `infrastructure/dockerode-client.ts`).

---

### `server/src/infrastructure/disk-usage-scanner.ts` / `probe-transport.ts`

**Analog:** `server/src/infrastructure/socket-inspector.ts`.

**Injectable runner + execFile argv (no shell)** (lines 16-32):
```typescript
import {execFile} from "node:child_process";
import {hostname} from "node:os";
import {promisify} from "node:util";
const execFileAsync = promisify(execFile);
export type CommandRunner = (file: string, args: readonly string[]) => Promise<{stdout: string}>;
const defaultRunner: CommandRunner = (file, args) => execFileAsync(file, [...args], {timeout: 5_000});
```
Disk scanner: same seam with `["-sk", "--", dir]` and a long timeout; on rejection read `err.stdout` and keep the number (research Pitfall 8). Self container id: `hostname()` (socket-inspector.ts line 44 passes it to `docker inspect`). Fixed argv comment convention at lines 70-71. Probe transport request code: use the `http.request` + `lookup` sketch in 14-RESEARCH.md Pattern 3 (no existing analog for node:http probes). Only `lstat`/`withFileTypes` real directories; skip symlinks.

---

### `server/src/lib/compose-health-probe.ts`

**Analog:** `server/src/lib/compose-proxy-editor.ts` `readServiceProxyEnv` (lines 166-180) and error class (19-27).

**Read pattern:**
```typescript
const doc = parseDocument(content);
assertServiceExists(doc, serviceName);
const node = doc.getIn(["services", serviceName, "environment", key]);
return node === undefined || node === null ? null : String(node);
```
Use `doc.getIn(["services", name, "x-docktor", "health-probe"])`; return `[]`/null on YAML error rather than throwing so the job fails closed per service. `parseComposeContent()` (lib/compose-parser.ts) ignores the extra key - do not extend `ParsedService`.

---

### `server/src/repositories/{service-health-event,stack-incident,stack-disk-usage}-repository.ts`

**Analog:** `server/src/repositories/image-update-check-repository.ts`.

**Pattern** (lines 1-2, 15-17, 96-109): `import {prisma} from "../lib/db.js"`; class with async methods returning Prisma results; deletion method returns `result.count`; at the bottom `export const imageUpdateCheckRepository = new ImageUpdateCheckRepository()`. Add each singleton re-export to `repositories/index.ts` (lines 9-18 style: `export {xRepository} from "./x-repository.js";`). Multi-table writes use `prisma.$transaction([...])` as in `stack-repository.ts` `replaceServices` (lines 120-142) / `updateStackStatus` (301+). **Important:** `replaceServices` deletes and recreates all Service rows (new ids) - key health events by `(stackId, serviceName)`.

**BigInt DTO fix:** `stackService.listStacks()`/`findByIdWithRelations` spread raw Prisma rows; map `volumeSizeBytes` (`BigInt?` in `stack.prisma` line 34) to `number | null` before the first disk write lands, with a serialization regression test (research Finding 5).

---

### `server/prisma/schema/service-health-event.prisma`, `stack-disk-usage.prisma`

**Analog:** `status-log.prisma` (model with `stackId` + `@relation(... onDelete: Cascade)`, optional status strings, `createdAt DateTime @default(now())`) and `notification.prisma` (enum + `@@index([stackId, createdAt])`, lines 1-31). Use the `ServiceHealthEvent` / `HealthSource` schema in 14-RESEARCH.md Finding 3 verbatim; add back-relation arrays to `Stack` next to `incidents StackIncident[]` (stack.prisma line 68). Migration via `prisma migrate dev`, never hand-edited. Enum values SCREAMING_SNAKE.

---

### `server/src/routes/health.ts`, `routes/storage.ts`, `routes/settings.ts` (modify)

**Analog:** `server/src/routes/settings.ts` and `routes/stacks.ts`.

**Imports + auth + thin handler** (settings.ts 1-5, 48-61, 104-119):
```typescript
import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod"
import {composeCheckSettingsSchema} from "@docktor/shared"
import {requireAuth} from "../lib/auth-middleware.js"
import {settingsService} from "../application/index.js"
const settingsRoutes: FastifyPluginAsyncZod = async (app) => {
    app.addHook("onRequest", requireAuth)
    app.get("/api/settings/compose-checks", async () => settingsService.getComposeCheckSettings())
    app.put("/api/settings/compose-checks", {schema: {body: composeCheckSettingsSchema}}, async (request) => {
        await settingsService.saveComposeCheckSettings(request.body)
        return settingsService.getComposeCheckSettings()   // return the saved value, not {success:true}
    })
}
```
Stack-scoped params: `schema: {params: stackParamsSchema}` and `request.params.id` (stacks.ts 44-52). Use `/api/uptime/stacks` and `/api/storage` (never `/api/stacks/<static>`; Fastify shadowing). Routes call application services only. Register the new route files where existing route plugins are registered in `app.ts` (not read; locate by grepping `settingsRoutes`).

---

### `shared/src/validation/health.ts`

**Analog:** `shared/src/validation/settings.ts` lines 68-77:
```typescript
export const composeCheckSettingsSchema = z.object({skipReview: z.boolean(), checks: z.object({...})});
export type ComposeCheckSettings = z.infer<typeof composeCheckSettingsSchema>;
```
Add `healthProbeSchema` (URL host allow-list, http/https, no userinfo, timeout int 1-30), `healthSettingsSchema = z.object({retentionDays: z.number().int().min(1).max(365)})`, and response types; re-export from `shared/src/validation/index.ts` (`shared/src/index.ts` re-exports that barrel). `server/test/unit/shared-schema-parity.test.ts` fails on stale dist.

---

### `client/src/lib/health-api.ts`, `storage-api.ts`; settings additions

**Analog:** `client/src/lib/settings-api.ts` lines 1-29:
```typescript
import {apiFetch} from "./api";
import type {ComposeCheckSettings} from "@docktor/shared";
export async function getComposeCheckSettings(): Promise<ComposeCheckSettings> {
    return apiFetch<ComposeCheckSettings>("/api/settings/compose-checks");
}
export async function saveComposeCheckSettings(data: ComposeCheckSettings): Promise<ComposeCheckSettings> {
    return apiFetch<ComposeCheckSettings>("/api/settings/compose-checks", {method: "PUT", body: JSON.stringify(data)});
}
```
Pure `(args) => Promise<T>`; API response types declared as interfaces in the api file. Imports use `@/` alias; `apiFetch` throws `ApiError` (`lib/api.ts`).

---

### `client/src/hooks/use-stack-uptime.ts`, `use-service-health-events.ts`, `use-storage.ts`, `use-stack-uptimes.ts`

**Analog:** `client/src/hooks/use-stack-events.ts` (exact).

**Pattern** (lines 5-62): `type FetchMode = "initial" | "background"`; one `fetchX(mode)` `useCallback` keyed on `stackId`; initial sets loading/error, background sets `isRefreshing` and only `console.warn`s on failure; `refetch` wraps `void fetchX("background")`; `useEffect(() => { fetchX("initial") }, [fetchX])`. SSE-triggered refetch uses `useContainerEvents((event) => {...; if (event.stackId !== stackId) return; void fetchX("background")})`. For uptime, refetch when `stack.status` changes (no new SSE type; UI-SPEC C). Replace the `catch (err: any)` in the analog with `unknown` narrowing (CLAUDE.md: no `any`). Batch uptime hook degrades silently to null on error (UI-SPEC F). **Test analog:** `client/test/unit/hooks/use-stack-events.test.ts`.

---

### `client/src/routes/app/storage.tsx` + `storage/components/*`

**Analog:** `client/src/routes/app/dashboard.tsx` (orchestrator, 68 lines).

**Pattern** (lines 1-68): imports `Page, PageContent, PageHeader, PageTitle` from `@/components/common/layout/page`, `Section, SectionHeader, SectionTitle` from `.../layout/section`, `Breadcrumb/BreadcrumbList/BreadcrumbItem/BreadcrumbPage`; page calls hooks, renders
```tsx
<Page><PageHeader breadcrumbs={<Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbPage>Dashboard</BreadcrumbPage>...</PageHeader>
<PageContent><DashboardStatCards .../><Section><SectionHeader><SectionTitle>...</Section></PageContent></Page>
```
`export default function`. Sections co-located in `routes/app/storage/components/` like `routes/app/dashboard/components/dashboard-stat-cards.tsx`. Use shadcn `Table` (not `DataTable`; UI-SPEC). Totals row via `StatCard` (`components/common/stat-card.tsx`: props `label, value, icon, loading?, valueClassName?`; value styling `text-2xl font-semibold tabular-nums`).

---

### Overview tab / services section / config tab (modify)

**`overview-tab.tsx`** (lines 18-39): `space-y-8` wrapper; hook calls at top (`useStackEvents`, `useStackTimeline`); add `<UptimeCard/>` above `ServicesSection`, `<IncidentList/>` after it, then `ActivityTimeline`. One `useServiceHealthEvents(stack.id)` call here, slices passed down.

**`services-section.tsx`**: add third icon button next to the logs button (lines 134-147 pattern, `Tooltip` + `Button size="icon" variant="ghost" className="min-h-11 min-w-11 md:min-h-9 md:min-w-9" aria-label=... ` with `aria-expanded`); expanded row = extra `TableRow` + `TableCell colSpan={6}` inside the `services.map` (use `Fragment` with key; currently `TableRow key={svc.id}` at line 74). Header currently has 6 columns (lines 63-70).

**`config-tab.tsx`**: mount `<HealthProbeForm composeContent={files.composeContent} onChange={files.setComposeContent}/>` in a new `Section` between the Compose and Environment `Section`s with `<Separator />` on each side (lines 60, 82 pattern). Dirty/Save/diff-confirm flow is untouched.

**Probe form (partial analog):** react-hook-form + `standardSchemaResolver` from `compose-checks-card.tsx` (lines 1-4, 49-55, 138-151 `FormField` + `Switch`); YAML edit via `yaml` Document API from `compose-proxy-editor.ts` (`doc.setIn(path, value)`, guarded `doc.hasIn(path)` before `doc.deleteIn(path)` at lines 110-115, prune empty map via `isMap(node) && node.items.length === 0` at lines 141-145, `doc.toString({lineWidth: 0})`). Needs a self-write vs external-edit re-seed guard (11-12 EnvEditor regression class; see `components/domain/stack/env-editor.tsx`) with its own regression test.

---

### `client/src/routes/app/settings/components/health-retention-card.tsx` (+ mount in `settings.tsx` after `TemplateReposCard`, line 73)

**Analog:** `compose-checks-card.tsx` (exact, CLAUDE.md names it target pattern).

**Pattern** (lines 46-86):
```tsx
const [loading, setLoading] = useState(true);
const form = useForm<ComposeCheckSettings>({resolver: standardSchemaResolver(composeCheckSettingsSchema), defaultValues: {...}});
useEffect(() => { let cancelled = false; async function load(){ ... form.reset(data) ... } void load(); return () => {cancelled = true}; }, []);
function handleSave(data) {
    toast.promise(saveComposeCheckSettings(data).then((saved) => form.reset(saved)), {
        loading: "Saving compose checks…", success: "Compose checks saved",
        error: (err: Error) => `Couldn't save compose checks — ${err?.message ?? "unknown error"}. Try again.`});
}
```
Loading branch renders `Card` + `Skeleton` rows (lines 88-107); form is `<Form {...form}><form onSubmit={form.handleSubmit(handleSave)}><CardContent/><CardFooter><Button type="submit">...`. Add AlertDialog gate when value decreases (UI-SPEC G). Note: the analog's load `catch {}` silently fails - UI-SPEC requires an Alert on load failure here.

---

### `stack-list.tsx` (modify), `uptime-badge.tsx`, `service-status-badge.tsx` (modify)

**`stack-list.tsx`** (lines 7-65): `columns: TableColumn<StackWithServices>[]` is a module-level const; the Uptime column needs the `uptimes` prop, so build columns inside the component (useMemo) only when `uptimes` is supplied; insert between "Status" and "Services" (lines 28-42). Status cell shows the `StackStatusBadge`/`ToneBadge` pattern (lines 29-37). `StackList` stays data-free; `Dashboard` and `stacks/index.tsx` each call `useStackUptimes()`.

**`service-status-badge.tsx`** (lines 14-47): add before the generic `running` branch (line 34): `if (containerState === "running" && healthStatus === "starting") return {label: "starting", tone: "yellow", dotPulse: false};`. Update its unit tests in the same plan.

---

### Server/Client tests and Playwright fixtures

- Job tests: `server/test/unit/jobs/image-update-check-pruner.test.ts` (fake store, call protected `run()`), `disk-checker.test.ts`.
- Domain tests: `server/test/unit/domain/stack-state-derivation.test.ts`.
- Integration: `server/test/integration/stacks.test.ts` / `compose-checks.test.ts` (real DB); add BigInt regression there.
- Client hooks: `client/test/unit/hooks/use-stack-events.test.ts`.
- `client/test/integration/fixtures.ts` has the catch-all `**/api/**` guard (`_apiRouteGuard`); add default stubs for every new endpoint (Pitfall 7).
- Architecture: `server/test/unit/architecture/layering.test.ts` must keep passing (no Prisma outside repositories/`lib/db.ts`).

## Shared Patterns

### Domain-event producer -> subscriber
**Source:** `server/src/jobs/disk-checker.ts` (emit with try/catch) + `server/src/application/subscribers/stack-event-subscriber.ts` (subscribe, per-handler error log) + `subscribers/register.ts`.
**Apply to:** HealthProbeJob, ServiceHealthService, IncidentTracker, health subscriber. Jobs never write status/history directly.

### Lazy production wiring (keep db.ts out of unit graph)
**Source:** `disk-checker.ts` 111-149 (`createProductionChecker`, `Job` facade) and `image-update-check-pruner.ts` 36-40 (`getStore()` dynamic import).
**Apply to:** all three new jobs.

### Auth on routes
**Source:** `server/src/routes/settings.ts` line 49: `app.addHook("onRequest", requireAuth)`.
**Apply to:** `routes/health.ts`, `routes/storage.ts`, new settings endpoints.

### Per-stack serialization
**Source:** `server/src/lib/keyed-mutex.ts` `withKeyedLock(key, fn)` (as used in `proxy-service.ts`).
**Apply to:** incident open/close; any per-stack read-modify-write.

### Repository singleton export
**Source:** `repositories/image-update-check-repository.ts` bottom + `repositories/index.ts`.
**Apply to:** three new repositories.

### Shell-out with argv, injectable runner
**Source:** `infrastructure/socket-inspector.ts` 16-32.
**Apply to:** disk scanner (and any docker CLI usage).

### Settings-backed config
**Source:** `settings-service.ts` key constants + `repo.getMany/upsert`; `routes/settings.ts` PUT returns freshly saved value; client `settings-api.ts`.
**Apply to:** `health.retentionDays`.

### Client forms/cards
**Source:** `compose-checks-card.tsx` (RHF + `standardSchemaResolver` + Skeleton + `toast.promise`).
**Apply to:** retention card, probe form.

### Hook state/refetch pattern
**Source:** `client/src/hooks/use-stack-events.ts`.
**Apply to:** every new client data hook.

### Status pills
**Source:** `ToneBadge` / `StatusDot` (`components/common/`), `StackStatusBadge`, `ServiceStatusBadge`. Never hand-roll pill classes; every light-only color utility needs a `dark:` pair (see `StatCard valueClassName` convention `text-{c}-600 dark:text-{c}-400`).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Probe HTTP request in `server/src/infrastructure/probe-transport.ts` | infra adapter | request-response | No existing `node:http` client with `lookup` override; use 14-RESEARCH.md Pattern 3 (verified experimentally). |
| Network attach/detach for reachability (Docktor joining target network) | infra adapter | request-response | `DockerodeClientPort` has no network connect/disconnect today; extend the port + `infrastructure/dockerode-client.ts`, isolate behind `ProbeTransportPort`. |
| Expandable sortable table (Storage stacks table) | component | request-response | `DataTable` has no sorting/expansion (UI-SPEC says do not use it); build on `components/ui/table` per UI-SPEC section B. |

## Metadata

**Analog search scope:** `server/src/{jobs,domain,application,application/subscribers,application/ports,infrastructure,repositories,routes,lib}`, `server/prisma/schema`, `shared/src/validation`, `client/src/{hooks,lib,components/domain/stack,routes/app}`, test directories.
**Files read:** ~30. Unverified items: `app.ts` route registration site, `client/src/router.tsx` contents (named per UI-SPEC), `app-sidebar.tsx` full structure (nav array at line 20 only).
**Pattern extraction date:** 2026-10-07
