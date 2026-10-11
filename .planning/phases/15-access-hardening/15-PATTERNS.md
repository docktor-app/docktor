# Phase 15: Access Hardening - Pattern Map

**Mapped:** 2026-10-10
**Files analyzed:** 27 (new/modified)
**Analogs found:** 24 / 27 (all analog paths verified git-tracked)

All paths relative to repo root. Server imports use `.js` extension; client uses `@/` alias.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `server/prisma/schema/two-factor.prisma` (new) | model | CRUD | `server/prisma/schema/auth.prisma` (Session/Account) | exact |
| `server/prisma/schema/rate-limit.prisma` (new) | model | CRUD | `server/prisma/schema/auth.prisma` (Verification) | role-match |
| `server/prisma/schema/auth.prisma` (mod: `twoFactorEnabled`, `twoFactor` relation) | model | CRUD | itself | exact |
| `server/src/lib/auth.ts` (mod) | config | request-response | itself (hooks.before block, lines 46-77) | exact |
| `server/src/lib/auth-config.ts` (new, pure helpers) | utility | transform | `buildTrustedOrigins` in `server/src/lib/auth.ts:19-25` | exact |
| `server/src/lib/auth-middleware.ts` (mod: `requireSession` + gated `requireAuth`) | middleware | request-response | itself | exact |
| `server/src/lib/origin-guard.ts` (new) | middleware | request-response | `server/src/lib/auth-middleware.ts` + `buildTrustedOrigins` (pure fn + thin hook) | role-match |
| `server/src/lib/errors.ts` (mod: `ForbiddenError`) | utility | transform | `BadRequestError` / `ConflictError` (lines 17-27) | exact |
| `server/src/app.ts` (mod: `trustProxy`, originGuard hook, error handler `code`) | config | request-response | itself (setErrorHandler lines 96-124) | exact |
| `server/src/routes/auth.ts` (mod: IP header shim) | route | request-response | itself | exact |
| `server/src/routes/account.ts` (new) | route | request-response | `server/src/routes/settings.ts` | exact |
| `server/src/domain/two-factor-policy.ts` (new) | domain | transform | `server/src/domain/proxy-idempotency.ts` / `uptime.ts` (pure fns) | role-match |
| `server/src/application/account-security-service.ts` (new) | service | CRUD | `server/src/application/settings-service.ts` | exact |
| `server/src/repositories/account-security-repository.ts` (new) | repository | CRUD | `server/src/repositories/user-repository.ts` + `settings-repository.ts` | exact |
| `server/src/repositories/settings-repository.ts` (mod: new key) | repository | CRUD | itself (`SETTING_KEYS`) | exact |
| `server/src/repositories/index.ts` (mod: export singleton) | config | n/a | itself | exact |
| `server/src/application/index.ts` (mod: construct service) | config | n/a | `settingsService` line 60 | exact |
| `server/src/scripts/reset-two-factor.ts` (new) | utility/CLI | batch | none (no `scripts/` dir) | none |
| `shared/src/validation/account.ts` (new) + `index.ts` re-export | model (Zod) | transform | `shared/src/validation/auth.ts` | exact |
| `client/src/lib/auth-client.ts` (mod: `twoFactorClient`) | config | request-response | itself | exact |
| `client/src/lib/account-api.ts` (new) | service (API client) | request-response | `client/src/lib/settings-api.ts` | exact |
| `client/src/hooks/use-account-security.ts` (new) | hook | request-response | `client/src/hooks/use-backup-defaults.ts` | exact |
| `client/src/routes/app/account.tsx` (new page) | component (page) | request-response | `client/src/routes/app/settings.tsx` | exact |
| `client/src/routes/app/account/components/*` (two-factor-section, enroll-dialog, recovery-codes-dialog, mandatory-2fa-toggle) | component | request-response | `client/src/routes/app/settings/components/proxy-settings-card.tsx` | role-match |
| `client/src/routes/auth/components/login-form.tsx` (mod) + `two-factor-step.tsx` (new) | component | request-response | `login-form.tsx` | exact |
| `client/src/components/domain/auth/protected-route.tsx` (mod) | component | request-response | itself | exact |
| `client/src/components/app-sidebar.tsx` + `client/src/router.tsx` (mod: nav + route) | config | n/a | `navItems` (sidebar:17-23), `/settings/:tab` route (router:63-64) | exact |
| Tests (server unit: `test/unit/lib/auth-config.test.ts`, etc.; integration; client) | test | n/a | `server/test/unit/lib/auth.test.ts`, `server/test/integration/setup.ts`, `client/test/unit/routes/settings/*.test.tsx` | role-match |

## Pattern Assignments

### `server/src/lib/auth.ts` (config, request-response)

**Analog:** itself. Note `lib/` already uses a *local* `SettingsRepository` instance to avoid a circular import (lines 7-11); reuse that for any new settings read in `lib/`.

**Imports + hook pattern to extend** (lines 1-5, 57-76):
```typescript
import {betterAuth} from "better-auth";
import {prismaAdapter} from "better-auth/adapters/prisma";
import {APIError, createAuthMiddleware} from "better-auth/api";
import {prisma} from "./db.js";
import {SettingsRepository, SETTING_KEYS} from "../repositories/settings-repository.js";
...
    hooks: {
        before: createAuthMiddleware(async (ctx) => {
            if (ctx.path !== "/sign-up/email") return;
            const userCount = await prisma.user.count();
            if (userCount > 0) {
                throw new APIError("FORBIDDEN", {message: "Self-registration is disabled; setup has already been completed"});
            }
        }),
    },
```
Add: `plugins: [twoFactor(...)]`, `rateLimit`, `advanced`, `disabledPaths`, an `after: createAuthMiddleware(...)` hook (session revocation, path-switch on `ctx.path`), and extend `before` with the disable-while-mandatory guard (same `ctx.path` early-return style). Existing `before` must keep its early-return so other paths are unaffected.

### `server/src/lib/auth-config.ts` (utility, transform)

**Analog:** `buildTrustedOrigins` (auth.ts:13-25) is the project's pure-helper-next-to-config style, tested in `server/test/unit/lib/auth.test.ts`:
```typescript
export function buildTrustedOrigins(envUrl: string | undefined, settingBaseUrl: string | null): string[] {
    const origins = new Set<string>();
    if (envUrl) origins.add(envUrl);
    ...
    return [...origins];
}
```
Copy: small exported pure functions (`parseTrustProxy`, `resolveUseSecureCookies`, `buildRateLimitConfig`, `isAuthRateLimitEnabled`, `CLIENT_IP_HEADER`) with explicit return types; unit test mirrors `describe/it/expect` from `auth.test.ts` (imports only the function, no DB).

### `server/src/lib/auth-middleware.ts` (middleware, request-response)

**Analog:** itself (whole file, 28 lines):
```typescript
declare module "fastify" { interface FastifyRequest { session: Session; user: User; } }

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    const session = await auth.api.getSession({headers: fromNodeHeaders(request.headers)});
    if (!session) { return reply.status(401).send({error: "Unauthorized"}); }
    request.session = session.session;
    request.user = session.user;
}
```
Refactor: extract this body into `requireSession`; `requireAuth` = `requireSession` + `isEnrollmentRequired(...)` (domain fn) throwing `ForbiddenError`. Use `typeof auth.$Infer.Session.user` in the module augmentation (research Pattern 3) instead of a cast. Routes keep `app.addHook("onRequest", requireAuth)` unchanged; `routes/account.ts` uses `requireSession`.

### `server/src/lib/errors.ts` (utility)

**Analog:** lines 17-27:
```typescript
export class BadRequestError extends AppError {
    constructor(message = "Bad request") { super(message, 400); }
}
```
Add `ForbiddenError extends AppError` (403) with an optional `code` (e.g. `TWO_FACTOR_ENROLLMENT_REQUIRED`); extend `AppError` or the subclass with `code?: string`.

### `server/src/app.ts` (config)

**Error handler to extend** (lines 96-99):
```typescript
app.setErrorHandler((error: FastifyError | AppError, _request, reply) => {
    if (error instanceof AppError) {
        return reply.status(error.statusCode).send({error: error.message});
    }
```
Forward optional `code` in this one place only (status codes live only here + errors.ts). Add `trustProxy: parseTrustProxy(process.env.TRUST_PROXY)` to Fastify options and the `originGuard` `onRequest` hook next to the existing first-run redirect hook (read app.ts hook registration before editing).

### `server/src/routes/auth.ts` (route)

**Analog:** itself (lines 15-18):
```typescript
app.all("/api/auth/*", async (request, reply) => {
    reply.hijack();
    return handler(request.raw, reply.raw);
});
```
Insert `request.raw.headers[CLIENT_IP_HEADER] = request.ip;` before `reply.hijack()`.

### `server/src/routes/account.ts` (route, request-response)

**Analog:** `server/src/routes/settings.ts`

**Imports/auth/schema pattern** (lines 1-5, 48-61):
```typescript
import type {FastifyPluginAsyncZod} from "fastify-type-provider-zod"
import {requireAuth} from "../lib/auth-middleware.js"
import {settingsService} from "../application/index.js"

const settingsRoutes: FastifyPluginAsyncZod = async (app) => {
    app.addHook("onRequest", requireAuth)
    app.get("/api/settings/general", async () => settingsService.getGeneralSettings())
    app.put("/api/settings/general", {schema: {body: updateGeneralSettingsSchema}},
        async (request) => settingsService.updateGeneralSettings(request.body))
```
Copy; swap to `requireSession`; body schema imported from `@docktor/shared` (settings.ts imports e.g. `healthSettingsSchema` from there, line 3, rather than inline when shared). Routes call `accountSecurityService` only (exported from `application/index.ts`). Register the route in `app.ts` alongside the others.

### `server/src/application/account-security-service.ts` (service, CRUD)

**Analog:** `server/src/application/settings-service.ts`

**Constructor-DI + key-constant + safe-parse pattern** (lines 1-8, 24-27, 444-458):
```typescript
import {BadRequestError} from "../lib/errors.js"
import type {SettingsRepository} from "../repositories/settings-repository.js"
export const HEALTH_SETTING_KEYS = {RETENTION_DAYS: "health.retentionDays"} as const
...
async getHealthSettings(): Promise<HealthSettings> {
    const values = await this.repo.getMany([HEALTH_SETTING_KEYS.RETENTION_DAYS])
    const raw = values[HEALTH_SETTING_KEYS.RETENTION_DAYS]
    if (raw === undefined) return {retentionDays: DEFAULT}
    const parsed = healthSettingsSchema.safeParse(...)
    ...
```
Note: this file inlines setting keys "to avoid loading db.ts at module level"; follow it (export a `TWO_FACTOR_SETTING_KEYS` const, e.g. `"auth.requireTwoFactor"`) so unit tests don't pull Prisma. Constructor takes `SettingsRepository` + `AccountSecurityRepository` types; wired as `new X(settingsRepository, accountSecurityRepository)` in `application/index.ts` (see line 60). Throw `BadRequestError`/`ForbiddenError`, never raw `Error`. Boolean setting stored as `"true"/"false"` string like other toggles (see `PROXY_SETTING_KEYS.SHOW_IN_DASHBOARD` handling in the same file). Unit test: `server/test/unit/application/settings-service.test.ts` (mocked repo).

### `server/src/repositories/account-security-repository.ts` (repository, CRUD)

**Analog:** `server/src/repositories/user-repository.ts` (whole file):
```typescript
import {prisma} from "../lib/db.js";
export class UserRepository {
    async count(): Promise<number> { return prisma.user.count(); }
}
export const userRepository = new UserRepository();
```
Copy: class + exported singleton, re-exported from `repositories/index.ts` (line style: `export {userRepository} from "./user-repository.js";`). Use `prisma.$transaction` for the reset (twoFactor delete, `user.twoFactorEnabled=false`, session delete, `verification` rows with identifier prefix `trust-device-`/`2fa-`).

### `server/src/domain/two-factor-policy.ts` (domain, transform)

No I/O; export pure `isEnrollmentRequired({mandatory, twoFactorEnabled})` and `canEnableMandatory({togglerHasTwoFactor})`. Follow style of existing pure domain files (`server/src/domain/uptime.ts`, `proxy-idempotency.ts`); tests in `server/test/unit/domain/`.

### `server/prisma/schema/two-factor.prisma`, `rate-limit.prisma`, `auth.prisma`

**Analog:** `auth.prisma` Session model (relation with `onDelete: Cascade`) and Verification (id String @id):
```prisma
model Session {
  id        String   @id
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```
Use the models given in 15-RESEARCH.md Pattern 2 verbatim (own file per model; `User` gets `twoFactorEnabled Boolean? @default(false)` and `twoFactor TwoFactor[]`). Migration via `prisma migrate dev --create-only`, never hand-edit. `cleanDatabase()` in `server/test/integration/setup.ts` must add `rateLimit.deleteMany()`.

### `shared/src/validation/account.ts` (Zod)

**Analog:** `shared/src/validation/auth.ts`:
```typescript
import {z} from "zod";
export const loginSchema = z.object({
    email: z.email("Please enter a valid email address"),
    password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;
```
Copy for `passwordConfirmSchema`, `totpCodeSchema`, `mandatoryTwoFactorSchema`; re-export from `shared/src/index.ts`/`validation/index.ts`.

### `client/src/lib/account-api.ts` (API client)

**Analog:** `client/src/lib/settings-api.ts`:
```typescript
import {apiFetch} from "./api";
export async function getHealthSettings(): Promise<HealthSettings> { return apiFetch<HealthSettings>("/api/settings/health"); }
export async function saveHealthSettings(data: HealthSettings): Promise<HealthSettings> {
    return apiFetch<HealthSettings>("/api/settings/health", {method: "PUT", body: JSON.stringify(data)});
}
```
Better-auth calls (enable/disable/verify/regenerate) go through `authClient.twoFactor.*` (not apiFetch); only `/api/account/*` goes through `apiFetch`.

### `client/src/hooks/use-account-security.ts` (hook)

**Analog:** `client/src/hooks/use-backup-defaults.ts` (cancelled-flag effect, `{data, loading, error}` result interface):
```typescript
useEffect(() => {
    let cancelled = false;
    getBackupDefaults().then((d) => { if (cancelled) return; ...setLoading(false); })
        .catch((err: unknown) => { if (cancelled) return; setError(err instanceof Error ? err.message : "..."); ...});
    return () => { cancelled = true; };
}, []);
```
Add a `refresh()` so sections can refetch after enable/disable/toggle. Hook is the only data fetcher; sections get data via props/hook.

### `client/src/routes/app/account.tsx` (page)

**Analog:** `client/src/routes/app/settings.tsx` (lines 1-4, 25-43): `Page`/`PageHeader`(breadcrumbs with `BreadcrumbPage`)/`PageTitle`/`PageDescription`/`PageContent` from `@/components/common/layout/page`; compose section components from `@/routes/app/account/components/...`. Keep under ~80 lines; default export. Follow `15-UI-SPEC.md` for copy/layout. No inline helper components.

### `client/src/routes/app/account/components/*` (components, forms)

**Analog:** `client/src/routes/app/settings/components/proxy-settings-card.tsx` (lines 1-40, 55-68): react-hook-form + `standardSchemaResolver` + `toast.promise` + shadcn `Form/FormField/FormItem/FormControl/FormMessage`, `Switch`, `Skeleton`, `Alert`:
```typescript
const form = useForm<ProxySettingsInput>({
    resolver: standardSchemaResolver(proxySettingsSchema),
    defaultValues: {...},
});
toast.promise(saveProxySettings(...), {loading: "Saving...", success: "...", error: (err: Error) => err?.message ?? "Save failed"});
```
Prefer flat `Section`/`SectionHeader`/`SectionTitle` (`components/common/layout/section.tsx`) over `Card` per CLAUDE.md; `ToneBadge`/`StatusDot` for the enabled/disabled pill; dark: counterparts for any light colors. Note: ProxySettingsCard does its own fetching in-component (legacy); new components should take data from `useAccountSecurity` per CLAUDE.md rule. QR via `qrcode.react` `QRCodeSVG` (human-verify gate on install).

### `client/src/routes/auth/components/login-form.tsx` (+ `two-factor-step.tsx`)

**Analog:** itself. Core to extend (lines 25-41):
```typescript
const {error: signInError} = await signIn.email({email: values.email, password: values.password});
if (signInError) { setError(signInError.message ?? "Sign in failed"); setLoading(false); return; }
navigate("/");
```
Change to read `{data, error}`; if `data?.twoFactorRedirect` set `step="totp"` and render `TwoFactorStep` (own file; same `Card`/`Form`/`FormField` markup as lines 44-96, code input, recovery-code toggle, unchecked trust checkbox). On `signInError.status === 429` read `X-Retry-After` (NOT `Retry-After`) via `fetchOptions.onError` and show "try again in N minutes". Existing unit test: `client/test/unit/routes/auth/components/` (extend).

### `client/src/lib/auth-client.ts`

**Analog:** itself (whole file 8 lines); add `plugins: [twoFactorClient()]` from `better-auth/client/plugins`; keep the destructured export line, add `twoFactor` export if needed.

### `client/src/components/domain/auth/protected-route.tsx`

**Analog:** itself (lines 15-35): add after the `!session` branch a check of `useAccountSecurity().enrollmentRequired` -> `<Navigate to="/account" replace />` (avoid redirect loop when already on `/account`). Note it uses `Readonly<ProtectedRouteProps>` and explicit `React.JSX.Element` return.

### `client/src/components/app-sidebar.tsx` / `client/src/router.tsx`

`navItems` array (sidebar lines 17-23): `{to: "/settings", label: "Settings", icon: Settings}` — add `{to: "/account", label: "Account", icon: UserRound/Shield}`. Router: add `<Route path="/account" element={<AccountPage />} />` beside lines 63-64 (inside the ProtectedRoute layout).

### Tests

- Server pure-unit: `server/test/unit/lib/auth.test.ts` style (import fn, `describe/it`).
- Server integration: `server/test/integration/setup.ts` (`startContainer`, Testcontainers Postgres, sets `NODE_ENV=test` + `BETTER_AUTH_SECRET`, `db push`, `buildApp`). Rate-limit and CSRF suites need `disableOriginCheck:false` and the opt-in rate-limit env (Pitfall 13) set before app import. Existing sign-up tests are in `setup-wizard-flow.test.ts` / `stacks.test.ts` (look at `createTestUser` helper there).
- Client: `client/test/unit/routes/settings/*.test.tsx` (card tests), `client/test/unit/routes/auth/components/`.
- Layering: `server/test/unit/architecture/layering.test.ts` — verify new `scripts/` and `lib/` files stay green.

## Shared Patterns

### Thin routes, typed errors
**Source:** `server/src/routes/settings.ts`, `server/src/lib/errors.ts`, `server/src/app.ts:96-99`. Routes -> application service only; throw `AppError` subclasses; HTTP status only in errors.ts/app.ts.

### Pure helper + thin wrapper
**Source:** `buildTrustedOrigins` / `resolveTrustedOrigins` (`server/src/lib/auth.ts:19-44`). Apply to `auth-config.ts`, `origin-guard.ts` (`decideOrigin` pure; hook calls `resolveTrustedOrigins()` for the trusted list so CSRF and auth share one source).

### Settings-backed flags
**Source:** `SETTING_KEYS` (`settings-repository.ts:3-7`) and `*_SETTING_KEYS` consts in `settings-service.ts` (lines 10-32). Mandatory-2FA key follows the latter (inline const, no db import), read via `getMany`/`get`.

### DI wiring
**Source:** `server/src/repositories/index.ts` (singleton re-exports) and `server/src/application/index.ts:59-60` (`new SettingsService(settingsRepository)`).

### Client forms
**Source:** `login-form.tsx` + `proxy-settings-card.tsx` — `useForm` + `standardSchemaResolver(sharedSchema)`, shadcn `Form` components, `toast` for async outcomes, `ApiError.fields` mapped to form errors.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `server/src/scripts/reset-two-factor.ts` | CLI | batch | No `scripts/` directory or CLI entrypoint exists; use RESEARCH.md Pattern 7 (call `AccountSecurityService.resetTwoFactor(email)`; built to `dist/server/scripts/`; check Dockerfile/tsconfig include it). |
| `server/test/helpers/totp.ts` | test helper | transform | No TOTP helper; use RESEARCH.md "Test helper" snippet. |
| Recovery-code download/copy UI | component | transform | No existing download-as-file pattern located; use UI-SPEC + plain Blob/anchor. |

## Metadata

**Analog search scope:** `server/src/{lib,routes,application,repositories,domain}`, `server/prisma/schema`, `server/test`, `client/src/{lib,hooks,routes,components}`, `shared/src/validation`
**Pattern extraction date:** 2026-10-10
