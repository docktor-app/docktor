# Phase 16: Release Readiness for v0.1.0 - Pattern Map

**Mapped:** 2026-10-11
**Files analyzed:** 20 code files (plus config/docs notes)
**Analogs found:** 17 / 20 (all analog paths verified git-tracked)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server/src/lib/environment-check.ts` | utility (pure Zod schema + evaluators) | transform | `server/src/lib/graceful-shutdown.ts` (pure, injectable) + Zod usage in `routes/settings.ts` | role-match |
| `server/src/lib/startup-environment.ts` | bootstrap | request-response (one-shot, injected exit/log) | `installShutdownHandlers` in `server/src/lib/graceful-shutdown.ts` | exact (DI shape) |
| `server/src/lib/environment-report.ts` | store | CRUD (module state) | none close | no analog |
| `server/src/application/environment-status-service.ts` | service | request-response | `server/src/application/storage-service.ts` | exact |
| `server/src/application/index.ts` (modify) | wiring | n/a | line 127 `storageService` | exact |
| `server/src/index.ts` (modify) | entrypoint | startup | itself (try/exit(1) block lines 17-24) | exact |
| `server/src/routes/settings.ts` (modify) | route | request-response | itself, `/api/settings/general` GET | exact |
| `shared/src/validation/environment.ts` + re-export in `index.ts` | schema | transform | `shared/src/validation/health.ts` | exact |
| `client/src/lib/environment-api.ts` | API client | request-response | `client/src/lib/storage-api.ts` | exact |
| `client/src/hooks/use-environment-warnings.ts` | hook | request-response + localStorage | `client/src/hooks/use-storage.ts` | exact |
| `client/src/components/domain/environment/environment-warnings-banner.tsx` | component | render | `components/ui/alert.tsx` + `common/tone-badge.tsx` | role-match |
| `client/src/components/app-layout.tsx` (modify) | layout | render | itself | exact |
| `client/test/integration/fixtures.ts` (modify) | test fixture | request-response stubs | itself (storage stub, lines 49-63) | exact |
| `client/test/integration/environment-banner.spec.ts` | test | e2e | `client/test/integration/storage.spec.ts` | role-match |
| `server/test/unit/lib/environment-check.test.ts`, `startup-environment.test.ts` | test | unit | `server/test/unit/lib/graceful-shutdown.test.ts` | exact |
| `server/test/unit/architecture/layering.test.ts` (add case) | test | file-scan | itself | exact |
| `server/test/unit/application/environment-status-service.test.ts` | test | unit | existing storage-service unit test | role-match |
| `client/test/unit/hooks/use-environment-warnings.test.ts` | test | unit | `client/test/unit/hooks/use-storage.test.ts` | exact |
| `.github/workflows/publish.yml` | CI | event-driven | `.github/workflows/ci.yml` | partial |
| `.github/workflows/ci.yml` (modify: `workflow_call`) | CI | event-driven | itself | exact |
| `Dockerfile`, `docker-compose.yml`, `docker-compose.build.yml` | config | n/a | themselves | see notes |

## Pattern Assignments

### `server/src/lib/startup-environment.ts` (bootstrap, injected exit/log)

**Analog:** `server/src/lib/graceful-shutdown.ts`, called at `server/src/index.ts:87-95`:
```typescript
installShutdownHandlers({
    steps: [...],
    hardDeadlineMs: SHUTDOWN_HARD_DEADLINE_MS,
    exit: (code) => process.exit(code),
    log: console,
});
```
Copy this: options object `{env, containerized, log, exit}`, `log` typed as `{info, warn, error}` (see `silentLog()` in `server/test/unit/lib/graceful-shutdown.test.ts:10-12`), returns the report. Use relative `.js` imports. It MUST NOT import `lib/auth.ts` transitively.

**Test pattern** (`graceful-shutdown.test.ts:1-16`): vitest `describe/it/vi`, imports `../../../src/lib/x.js`, injected `vi.fn()` log and exit.

### `server/src/lib/environment-check.ts` (pure utility)

Zod already used inline in routes (`routes/settings.ts:1-11`: `import {z} from "zod"`). Use one `z.object` + `safeParse`; map `issue.path[0]` to variable name. Reuse `isContainerized()` from `server/src/lib/stacks-dir.ts:18-25` (async, reads `/.dockerenv`); call it in `index.ts` and pass the boolean in, keeping the check pure. Keep `crypto.ts` messages untouched (asserted in `crypto.test.ts:39,44`).

### `server/src/index.ts` (modify)

Existing fail-fast block to mirror (lines 17-24):
```typescript
try {
    assertStacksDirMatchesHost();
    await ensureStacksDir();
    await assertStacksDirIsMounted();
} catch (err) {
    console.error(err);
    process.exit(1);
}
```
Change: line 1 `import {buildApp} from "./app.js"` becomes `const {buildApp} = await import("./app.js")` placed at the current `await buildApp()` site (line 66); the env check is the first executable statement. Top-level await is already in use. `healthProbeJob` import (line 2) appears safe (no auth.ts), confirm via the layering/import test.

### `server/src/application/environment-status-service.ts` (service)

**Analog:** `server/src/application/storage-service.ts:33-40`:
```typescript
export class StorageService {
    constructor(private readonly repo: Pick<StackDiskUsageRepository, "findStorageRows">) {}
    async getStorageOverview(): Promise<StorageOverview> {
```
Same constructor-injection style, with `Pick<>`/function port. Wire in `server/src/application/index.ts` next to line 127 (`export const storageService = new StorageService(stackDiskUsageRepository);`) and add the import beside line 36. Note files in `application/` use semicolons/4-space; `routes/settings.ts` uses no semicolons — match the file being edited.

### `server/src/routes/settings.ts` (modify)

**Analog (same file, lines 1-6, 48-53):**
```typescript
import {requireAuth} from "../lib/auth-middleware.js"
import {settingsService, notificationService} from "../application/index.js"
const settingsRoutes: FastifyPluginAsyncZod = async (app) => {
    app.addHook("onRequest", requireAuth)
    app.get("/api/settings/general", async () => {
        return settingsService.getGeneralSettings()
    })
```
Add `app.get("/api/settings/environment", async () => environmentStatusService.getReport())` and import the service from `../application/index.js`. Auth is inherited via the hook. Add an integration test beside existing settings integration tests (real DB).

### `shared/src/validation/environment.ts` (schema)

**Analog:** `shared/src/validation/health.ts:1-14` (`import {z} from "zod";`, exported schema + `export type X = z.infer<typeof xSchema>`). Re-export by adding `export * from "./environment.js";` to `shared/src/validation/index.ts` (list at lines 1-9 currently ends with `./health.js`). Run `yarn workspace @docktor/shared build` (parity test).

### `client/src/lib/environment-api.ts` (API client)

**Analog:** `client/src/lib/storage-api.ts:1-4, 38-40`:
```typescript
import {apiFetch} from "./api";
export async function getStorageOverview(): Promise<StorageOverview> {
    return apiFetch<StorageOverview>("/api/storage");
}
```
Use `EnvironmentReport` from `@docktor/shared` rather than redeclaring.

### `client/src/hooks/use-environment-warnings.ts` (hook)

**Analog:** `client/src/hooks/use-storage.ts:1-33` — `useState` + `useCallback load` + `useEffect(() => { void load(); }, [load])`, error string from `err instanceof Error ? err.message : "..."`. No SSE (static per boot; comment as use-storage does). Add localStorage dismissal keyed by warning `code`; the only existing localStorage use is `components/common/theme-provider.tsx` (reference for key naming/guarding). Expose `{warnings (undismissed), dismiss, dismissAll}`.

**Test analog:** `client/test/unit/hooks/use-storage.test.ts:1-30`:
```typescript
vi.mock("@/lib/storage-api", () => ({getStorageOverview: vi.fn()}));
const mockX = vi.mocked(getStorageOverview);
beforeEach(() => { mockX.mockReset(); });
const {result} = renderHook(() => useStorage());
await waitFor(() => expect(result.current.loading).toBe(false));
```

### `client/src/components/domain/environment/environment-warnings-banner.tsx`

No exact analog. Build from `components/ui/alert.tsx` (exports `Alert, AlertTitle, AlertDescription`; only `default`/`destructive` variants, do not edit) plus `ToneBadge tone="yellow"` (`components/common/tone-badge.tsx`, includes dark variants). Props: `Readonly<EnvironmentWarningsBannerProps>`. Any raw color utility needs a `dark:` counterpart. Domain component consumes the hook (hook per CLAUDE.md is allowed in domain components; no direct fetch). Unit test with RTL by role.

### `client/src/components/app-layout.tsx` (modify)

Current (lines 5-16): `SidebarProvider > AppSidebar + SidebarInset > <Outlet />`. Insert `<EnvironmentWarningsBanner />` in `SidebarInset` above `<Outlet />`. Imports use `@/components/...` alias.

### `client/test/integration/fixtures.ts` (modify)

**Analog (lines 49-63):**
```typescript
await page.route("**/api/storage", (route) =>
    route.fulfill({status: 200, contentType: "application/json",
        body: JSON.stringify({...}),
    }),
);
```
Add after the other defaults, with the same "RESEARCH Pitfall" comment style: `**/api/settings/environment` -> `{"warnings":[]}`. Catch-all at lines 27-30 aborts unstubbed `/api/**`; later-registered routes win, so the new spec can override. Run with `PLAYWRIGHT_PORT=5182`.

### `.github/workflows/ci.yml` / `publish.yml`

`ci.yml` triggers (lines 3-7): `push: branches: [main]`, `pull_request: branches: [main]`. Per RESEARCH: replace the `push` trigger with `workflow_call:` (keep `pull_request`). Job `build-and-test` uses `actions/checkout@v4`, `actions/setup-node@v4` node 22, `corepack enable`, `yarn install --immutable`; env `BETTER_AUTH_SECRET: ci-test-secret`, `NODE_ENV: test` (note: tests must not now require the other env vars at the bootstrap level, since unit tests never run `index.ts`). `publish.yml` skeleton is in RESEARCH "Publish workflow skeleton" (use as-is; no codebase analog for Docker publish). The Sonar step condition at ci.yml:143 depends on `github.event_name == 'push'`.

## Shared Patterns

- **Server imports:** relative with `.js` extension; group external, workspace (`@docktor/shared`), local.
- **Layering:** route -> application service -> injected port; no `process.env` in routes. Enforced by `server/test/unit/architecture/layering.test.ts` (rules declared as named cases in `RULES`; append a case that `startup-environment.ts`/`environment-check.ts` do not import `lib/auth`).
- **Client:** `@/*` alias, hook as single source of server state, `apiFetch<T>` only.
- **Errors:** startup path logs + `process.exit(1)` (as in `index.ts:22-23`), no HTTP errors involved.
- **Never emit env values** in report/log/API; names and fixed text only.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `server/src/lib/environment-report.ts` | module store | No module-level mutable store exists; keep trivial `let report` with get/set, default `{warnings: []}` |
| `.github/workflows/publish.yml` | CI | Only one workflow exists; use RESEARCH skeleton |
| `.github/ISSUE_TEMPLATE/*`, `PULL_REQUEST_TEMPLATE.md` | templates | None exist; see RESEARCH "Issue forms / templates" |

## Config/Docs Notes

- `Dockerfile`: remove `COPY .yarn .yarn` (lines 5, 18; no tracked `.yarn`), align corepack yarn to 4.13.0, add `ARG TARGETARCH` per stage with `case` blocks (RESEARCH "Code Examples" has verified checksums); keep each download in one `RUN`.
- `docker-compose.yml`: `build: context: .` -> `image: ghcr.io/docktor-app/docktor:latest`; remove stale comment at line 12; add `docker-compose.build.yml` override.
- `LICENSE` (MIT, "Copyright (c) 2026 Docktor contributors"), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Covenant 2.1), `SECURITY.md`, README shortening, `docs/deployment.md`/`templates.md` pointers, `docs/design.md` drift fixes, `docs/assets/`: plain files; source specifics in RESEARCH Pitfall 11 and community-files section. Contact email needs maintainer confirmation.
- `docks` repo (VitePress 1.6.4): separate repo, human-verify checkpoint before install.

## Metadata

**Analog search scope:** server/src (lib, application, routes), shared/src/validation, client/src (hooks, lib, components), client/test, server/test/unit, .github/workflows
**Pattern extraction date:** 2026-10-11
