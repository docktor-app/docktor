# Phase 18: Import and Migration Flow - Pattern Map

**Mapped:** 2026-10-14
**Files analyzed:** 27 (new/modified)
**Analogs found:** 25 / 27 (all analog paths verified git-tracked source; no mirror paths)

All paths are relative to the worktree root. Server imports are relative with `.js`; client uses `@/`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `server/src/application/ports/self-stack-port.ts` (new) | port | request-response | `server/src/application/ports/brownfield-scanner-port.ts` | exact |
| `server/src/application/ports/external-stack-control-port.ts` (new) | port | request-response | `server/src/application/ports/volume-migrator-port.ts` | exact |
| `server/src/domain/self-stack-paths.ts` (new) | domain util (pure) | transform | `server/src/domain/health-probe.ts` / `domain/port-conflicts.ts` (pure fns) | role-match |
| `server/src/infrastructure/docker-self-stack.ts` (new) | adapter | request-response | `server/src/infrastructure/probe-transport.ts` (lines 1-45: `SelfContainer`, hostname lookup, `inspectContainer`) | role-match |
| `server/src/infrastructure/external-stack-control.ts` (new) | adapter | request-response | `server/src/infrastructure/docker-executor.ts` (lines 1-32) + injectable runner from `socket-inspector.ts` | exact |
| `server/src/application/onboarding-service.ts` (mod `scan`, ctor) | service | request-response | itself (ctor param `scanner`, lines ~55-62) | exact |
| `server/src/infrastructure/brownfield-scanner.ts` (mod ignore list) | adapter | file-I/O | itself `SYSTEM_DIR_EXCLUDES` (lines 38-44) | exact |
| `server/src/application/migration-service.ts` (rework) | service | CRUD + file-I/O | itself (lines 1-283) | exact |
| `server/src/infrastructure/compose-rewriter.ts` + `ports/compose-rewriter-port.ts` (delete `generateDiff`) | adapter/port | transform | itself | exact |
| `server/src/routes/setup.ts`, `server/src/routes/imports.ts` (mod) | route | request-response | `routes/imports.ts` lines 50-101 | exact |
| `shared/src/validation/wizard.ts` or new `brownfield.ts` (+ `validation/index.ts` re-export) | schema | validation | `shared/src/validation/wizard.ts` | exact |
| `client/src/lib/env-mask.ts` (new) | utility | transform | masking block in `client/src/components/domain/stack/diff-confirm-dialog.tsx` lines 38-79 | exact (extract) |
| `client/src/components/domain/stack/diff-confirm-dialog.tsx` (mod, use helper) | component | transform | itself | exact |
| `client/src/lib/brownfield-types.ts`, `setup-api.ts`, `import-api.ts` (mod) | api client | request-response | `client/src/lib/stacks-api.ts` lines 120-140 (`UnifiedDiff`) | exact |
| `client/src/routes/setup/components/migration-wizard.tsx` (shell rewrite) | component | event-driven | itself (lines 1-60) | exact |
| `migration-step-indicator.tsx`, `migration-select-step.tsx`, `migration-review-step.tsx`, `migration-backup-step.tsx`, `migration-old-stack-step.tsx` (new) | components | event-driven | `diff-confirm-dialog.tsx` (ScrollArea + UnifiedDiffView + reveal button); existing `migration-wizard.tsx` step 1 content | role-match |
| `client/src/routes/setup/components/diff-viewer.tsx` | delete | | | |
| `brownfield-step.tsx`, `components/domain/stack/brownfield-import.tsx` (mod: params, toasts) | component | event-driven | themselves | exact |
| Tests: `self-stack-paths.test.ts`, `docker-self-stack.test.ts`, `external-stack-control.test.ts`, `migration-service.test.ts` (rewrite), `onboarding-service.test.ts` (extend), `brownfield-scanner.test.ts` (extend), `compose-rewriter.test.ts` (edit) | test | | `server/test/unit/infrastructure/socket-inspector.test.ts`, `server/test/unit/application/migration-service.test.ts`, `onboarding-service.test.ts` lines 422-450 | role-match |
| Client tests: `env-mask.test.ts`, `migration-wizard.test.tsx` (new), `diff-confirm-dialog.test.tsx` (regression), Playwright `setup-wizard.spec.ts` (update) | test | | `client/test/unit/components/domain/stack/diff-confirm-dialog.test.tsx` | role-match |

## Pattern Assignments

### `application/ports/self-stack-port.ts` and `external-stack-control-port.ts` (port)

**Analog:** `server/src/application/ports/brownfield-scanner-port.ts` (whole file) and `volume-migrator-port.ts`. Convention: JSDoc explaining why the port exists (D-07, application depends on port not infrastructure), 4-space indent, interface only.

```typescript
/**
 * Port for ... Declared here rather than consumers importing the concrete
 * class, so application services stay unit-testable with a plain fake ...
 */
export interface BrownfieldScannerPort {
    scan(directories: string[]): Promise<ScanResult>;
}
```
New: `SelfStackPort { composeFilePaths(): Promise<readonly string[]> }`, `ExternalStackControlPort { stop(composePath): Promise<void>; start(composePath): Promise<void> }`.

### `infrastructure/docker-self-stack.ts` (adapter, request-response, fail-open)

**Analog:** `server/src/infrastructure/probe-transport.ts` lines 1-45.

**Imports + self lookup** (lines 4-9, 15-18, 30-45):
```typescript
import {hostname} from "node:os";
import type {DockerodeClientPort} from "../application/ports/dockerode-client-port.js";
import {isContainerized} from "../lib/stacks-dir.js";
import {dockerodeClient} from "./dockerode-client.js";

export interface SelfContainer { containerId(): Promise<string | null>; }
function createDefaultSelf(): SelfContainer {
    let resolved: Promise<string | null> | undefined;
    return {
        containerId: () => (resolved ??= isContainerized().then((containerized) => (containerized ? hostname() : null))),
    };
}
type ProbeDocker = Pick<DockerodeClientPort, "inspectContainer" | ...>;
```
Reuse/mirror: constructor-injected `Pick<DockerodeClientPort, "inspectContainer">` and `SelfContainer`; call `inspectContainer(id, AbortSignal.timeout(5000))` (port accepts `signal`, `dockerode-client-port.ts`). Read `info.Config.Labels["com.docker.compose.project.config_files"]` and `info.Mounts` (`Type/Source/Destination`). Wrap everything in try/catch returning `[]` + `console.warn` (D-02). Export singleton like `brownfieldScanner` (`brownfield-scanner.ts:156`: `export const brownfieldScanner = new BrownfieldScanner();`); `dockerodeClient` is a lazy Proxy (`dockerode-client.ts:118-131`) so importing it is safe at module scope.

### `domain/self-stack-paths.ts` (pure)

No I/O; no import of infrastructure/repositories (layering test `server/test/unit/architecture/layering.test.ts`). Use `path.posix` (Windows CI). Copy the algorithm from RESEARCH.md Pattern 1 (`containerVisiblePaths`). Compare with `\` to `/` normalisation (`toPosixComparable` in `server/test/unit/infrastructure/brownfield-scanner.test.ts`).

### `infrastructure/external-stack-control.ts` (adapter)

**Analog:** `server/src/infrastructure/docker-executor.ts` lines 1-32 and `socket-inspector.ts` lines 14-31.

```typescript
import {execFile} from "node:child_process";
import {promisify} from "node:util";
const execFileAsync = promisify(execFile);
// docker-executor.ts
return execFileAsync("docker", ["compose", ...args], {cwd: getStackPath(stackId), timeout: 120_000});
// socket-inspector.ts - injectable seam so tests need no child_process mock
export type CommandRunner = (file: string, args: readonly string[]) => Promise<{stdout: string}>;
const defaultRunner: CommandRunner = (file, args) => execFileAsync(file, [...args], {timeout: 5_000});
```
Phase 18 adaptation: runner also takes `{cwd, timeout}`; argv `["compose","-f",composePath,"stop"|"start"]`, `cwd: path.dirname(composePath)`. Use `start`, not `up -d`, for rollback. Never a shell. Test pattern: `socket-inspector.test.ts` (fake runner, no `vi.mock("node:child_process")`).

### `application/onboarding-service.ts` (scan filter)

**Analog:** itself. Ctor trailing optional ports, lines ~55-62:
```typescript
private readonly userRepo: Pick<UserRepository, "count"> = userRepository,
// D-07: narrow port, not the concrete BrownfieldScanner ...
private readonly scanner: BrownfieldScannerPort = brownfieldScanner,
```
Add `private readonly selfStack: SelfStackPort = dockerSelfStack` as the **last** param (positional tests keep compiling). Import style: `import {brownfieldScanner} from "../infrastructure/brownfield-scanner.js"; import type {...} from "./ports/brownfield-scanner-port.js";`. Filter body: RESEARCH.md "Self-stack scan filter". Do not touch `skippedDirectories`. Test extension: `server/test/unit/application/onboarding-service.test.ts` `describe("scan (brownfield scan delegation)")` lines 422-450 (mockScanner `scan: vi.fn()` at line 24); note the existing test asserts `result` `toBe(scanResult)`, so keep returning the same object when `selfPaths.length === 0`.

### `infrastructure/brownfield-scanner.ts`

Add `"**/pre-migration-backup/**"` to `SYSTEM_DIR_EXCLUDES`:
```typescript
private readonly SYSTEM_DIR_EXCLUDES = ["**/proc/**","**/sys/**","**/dev/**","**/node_modules/**","**/.git/**"];
```
Extend `brownfield-scanner.test.ts`.

### `application/migration-service.ts` (service, CRUD + file-I/O)

**Analog:** itself. Keep: ctor DI style (lines 41-48), `VOLUME_NAME_PATTERN` + `assertWithin` (CR-02, lines 19-34), steps 3-7 (create dir, volumes, bind copy, rewrite, record). Tabs are used in this file; match them.

Ctor to extend:
```typescript
constructor(
    private readonly docker: DockerExecutorPort = dockerExecutor,
    private readonly migrator: VolumeMigratorPort = volumeMigrator,
    private readonly rewriter: ComposeRewriterPort = composeRewriter,
    private readonly stackFs: StackFilesystemPort = new StackFilesystem(),
    private readonly stackRepo: StackRepository = stackRepository,
    // NEW trailing: private readonly oldStack: ExternalStackControlPort = externalStackControl,
) {}
```
Preview (lines 55-64) becomes `computeUnifiedDiff(original, result.rewrittenCompose)` from `../lib/unified-diff.js`, return `{diff: UnifiedDiff; extractedEnv}`.

Remove: `import os`, `import {spawn}`, tmpdir backup (lines 94-100), `stopContainersAtPath`/`startContainersAtPath` (lines 252-274), `fs.rm(originalDir)`+restore (lines 238-246), CR-04 cleanup (lines 215-224). Rollback block to keep (lines 226-237): best-effort `stackFs.removeDirectory(stackId)` and `stackRepo.delete(stackId).catch(() => {})`. Backup copy: prefer `this.migrator.copyDirectory(originalDir, path.join(newStackPath, "pre-migration-backup"))` (port, fakeable) — guard Pitfall 4 (newStackPath inside originalDir) with `BadRequestError`. Error type: `import {BadRequestError} from "../lib/errors.js"`. Rest per RESEARCH.md Pattern 3. Note existing silent `catch { fs.mkdir }` in Step 5 is a known pre-existing issue (Pitfall 5), not in scope.

**Test analog:** `server/test/unit/application/migration-service.test.ts` lines 1-40: mock factories `createMockDocker()`, `createMockMigrator()`, `createMockRewriter()`, `createMockStackFs(newStackPath)`. Delete the `vi.mock("node:child_process")` block and `spawn`/`EventEmitter` imports; add `createMockOldStack() => ({stop: vi.fn(), start: vi.fn()})`.

### `routes/setup.ts` and `routes/imports.ts`

**Analog:** `server/src/routes/imports.ts` lines 50-101: inline `z.object` bodies duplicated in 4 places, `Object.entries(...) as [string, boolean][]` cast. Replace with shared schemas (`schema: {body: migrationExecuteSchema}`), drop the cast, pass `backup`/`stopOldStack` through. Handlers stay thin, call `migrationService` only.

### `shared/src/validation/wizard.ts` (or new `brownfield.ts`)

**Analog:** `shared/src/validation/wizard.ts` (header: `import {z} from "zod";`; pattern `export const wizardStep1Schema = z.object({...}); export type WizardStep1Input = z.infer<typeof wizardStep1Schema>;`). Re-export via `shared/src/validation/index.ts` (`export * from "./wizard.js";` list; a new file needs a new line). Schemas verbatim from RESEARCH.md "Shared schemas"; `backup`/`stopOldStack` required, no defaults. Server consumes compiled `shared/dist`: rebuild shared before server tests.

### `client/src/lib/env-mask.ts` (extract)

**Analog:** `diff-confirm-dialog.tsx` lines 38-79:
```typescript
const SECRET_MASK = "••••••••";
const ENV_KEY_VALUE_PATTERN = /^(export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;
function maskSecretLine(line, revealSecrets) {
    if (revealSecrets) return line;
    const match = ENV_KEY_VALUE_PATTERN.exec(line.text);
    if (!match || !isSecretKey(match[2]!)) return line;
    const prefix = match[1] ?? "";
    return {...line, text: `${prefix}${match[2]}=${SECRET_MASK}`};
}
```
`isSecretKey` is imported from `@/lib/env-file` (regex `/password|secret|key|token/i`, line ~109). New module exposes string-level `maskEnvText(content, reveal)` / `envTextHasSecret(content)` (split on `\n`, map the same logic); the dialog's line/hunk wrappers call the shared per-line function. Regression net: `client/test/unit/components/domain/stack/diff-confirm-dialog.test.tsx`.

### `migration-review-step.tsx` (component)

**Analog:** `diff-confirm-dialog.tsx` lines 225-248 (reveal Button + ScrollArea + UnifiedDiffView):
```tsx
{hasSecret && (<Button type="button" variant="ghost" size="sm" className="w-fit"
    onClick={() => setRevealSecrets((prev) => !prev)}>{revealSecrets ? "Hide secret values" : "Show secret values"}</Button>)}
<ScrollArea className="max-h-[60vh]">
    <UnifiedDiffView hunks={displayedHunks} annotations={annotations} ariaLabel="Review diff" />
</ScrollArea>
```
Imports: `UnifiedDiffView` from `@/components/common/unified-diff-view` (keep domain-free; `readOnly` `CodeEditor` from `@/components/common/code-editor` for `.env`); counters via `ToneBadge` (`@/components/common/tone-badge`, exports `ToneBadge({tone, pulse, className, ...props})`). Props: `Readonly<XxxProps>`, dark: variants on any light color class. Reset reveal state on close and Back (T-12-02 pattern: `useEffect(() => { if (!open) setRevealSecrets(false); }, [open])`, lines 99-103).

### `migration-wizard.tsx` (shell) and step components

**Analog:** current `migration-wizard.tsx` lines 1-60. Keep: injected `previewMigration` prop, WR-09 (`onConfirmMigrate` once, then `onClose`; never set state after), `directoryDisplayName(stack.directory)` init, `namedVolumeSelections` / `bindMountSelections` initial-state lambdas (lines 40-60), imports from `@/components/ui/{dialog,button,input,label,checkbox,alert}`. Change: `step` type to `1|2|3|4`; `ConfirmMigrateParams` gains `backup: boolean; stopOldStack: boolean`; `DialogContent` class `sm:max-w-5xl` (base is `sm:max-w-lg`, `components/ui/dialog.tsx:62`, so unprefixed `max-w-3xl` never applied); header/footer pinned outside scrolling body. Switch from `@/components/ui/switch`. Do not reuse `wizard-stepper.tsx` (hard-wired to six setup steps). Replace `DiffViewer` import with `UnifiedDiffView`; delete `diff-viewer.tsx` and `parseDiffForViewer`. Add stale-response guard (Pitfall 7). Update client types: reuse `UnifiedDiff` from `@/lib/stacks-api` (lines 120-140) in `brownfield-types.ts` (`MigrationPreview.diff: UnifiedDiff`).

### Playwright / client tests

`client/test/integration/setup-wizard.spec.ts` (~lines 509-574) hard-codes "Next"/"Cancel"/string diffs and "Migrated"; update to `Preview Changes`, UnifiedDiff JSON, `Choose Backup`, `Choose Old Stack Action`, `Confirm & Migrate`, `Cancel Migration`. CI only.

## Shared Patterns

### Port + constructor DI with singleton default
**Source:** `onboarding-service.ts` ctor; `brownfield-scanner.ts:156`. **Apply to:** SelfStackPort, ExternalStackControlPort, MigrationService, OnboardingService. Trailing optional param, default singleton; tests inject plain fakes.

### Shell-outs only in infrastructure via `execFile` argv (no shell)
**Source:** `docker-executor.ts:20-23`, `socket-inspector.ts:14-31`. **Apply to:** external-stack-control; MigrationService must lose `node:child_process`/`node:os` imports.

### Fail-open / best-effort cleanup
**Source:** `migration-service.ts` rollback (try/catch around each cleanup step with `console.error`). **Apply to:** docker-self-stack adapter (return `[]`), rollback restart.

### Typed errors, no HTTP status outside `lib/errors.ts`/`app.ts`
**Source:** `import {BadRequestError} from "../lib/errors.js"` (migration-service). Use for new guards.

### Path confinement (CR-02)
**Source:** `migration-service.ts` lines 19-34 `VOLUME_NAME_PATTERN`, `assertWithin`. **Apply to:** all new path joins in migrate; add execFile-only treatment of `composePath`.

### Windows-safe path handling in tests
**Source:** `toPosixComparable` in `brownfield-scanner.test.ts`; use `path.posix` in pure domain code.

### UI rules
`ToneBadge` for pills, `dark:` counterpart for every light-only color, `Readonly<Props>`, no inline helper components, no edits under `components/ui/`, section components co-located in `routes/setup/components/`.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `migration-step-indicator.tsx` | component | No generic step indicator; `wizard-stepper.tsx` is setup-specific. Follow 18-UI-SPEC.md. |
| `server/src/domain/self-stack-paths.ts` | domain util | Algorithm given in RESEARCH.md Pattern 1; only style analogs (pure domain files) exist. |

## Metadata

**Analog search scope:** `server/src/{application,application/ports,infrastructure,routes,domain,lib}`, `shared/src/validation`, `client/src/{components,lib,routes/setup}`, existing unit tests.
**Files scanned:** ~25 read/grepped.
**Pattern extraction date:** 2026-10-14
