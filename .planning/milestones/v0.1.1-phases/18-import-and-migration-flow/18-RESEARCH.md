# Phase 18: Import and Migration Flow - Research

**Researched:** 2026-10-14
**Domain:** Brownfield import/migration (Fastify 5 + DDD server, React 19 dialog), Docker Compose self-detection, real line diff
**Confidence:** HIGH (all findings come from code read this session or from an empirical `docker inspect` probe; open items are flagged)

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

**Docktor's own stack (STK-03)**
- **D-01:** Detect Docktor's own stack by inspecting Docktor's own container at scan time and reading its Compose labels (`com.docker.compose.project.config_files` / `working_dir`). Any scanned compose path equal to that file is excluded from results. Independent of container name, image or location.
- **D-02:** If Docktor cannot identify its own container (not containerized, dev, bare metal) the scanner **fails open**: nothing is excluded and every stack is listed. No heuristic fallback (no `container_name`/image matching).
- **D-03:** Exclusion lives in the shared scan path (`OnboardingService.scan` / scanner port), so `routes/setup.ts` and `routes/imports.ts` get identical behaviour. Every other discovered stack must still be offered.

**Diff rendering (MIG-01, MIG-02)**
- **D-04:** The preview endpoint returns a `UnifiedDiff` built with `computeUnifiedDiff` (`server/src/lib/unified-diff.ts`, jsdiff), the same shape the stack-edit review uses, and the client renders it with the existing `UnifiedDiffView`. Added and removed lines are individually marked. Retire the positional `ComposeRewriter.generateDiff` and the side-by-side `setup/components/diff-viewer.tsx`; do not add a second diff renderer.
- **D-05:** The extracted `.env` preview renders in a read-only `CodeEditor` (no language extension) with secret-looking keys masked and a reveal control, consistent with the stack-edit review dialog (`isSecretKey`, masking in `diff-confirm-dialog.tsx`).
- **D-06:** Dialog is enlarged (roughly `max-w-5xl`) and must be readable at phone width with no clipped content (scrolling diff, full-width on small screens).

**Pre-migration backup (MIG-03)**
- **D-07:** Backup is its own explicit step, **default on**, user can opt out. Opt out creates no backup at all; opt in creates one whether or not the compose file is renamed.
- **D-08:** An opted-in backup is a copy of the old stack directory (compose, `.env`, bind-mount data) at `pre-migration-backup/` inside the new stack's directory. It survives a successful migration (no longer deleted), and is not placed in OS temp. Named Docker volumes are not part of it.
- **D-09:** Rollback no longer depends on a backup. The migration never modifies the original directory (only reads it and optionally stops containers), so failure rollback = remove the new stack dir and record, and restart the old containers if Docktor stopped them. Remove the destructive `rm originalDir` + restore from `MigrationService.migrate`.

**Stop old stack (MIG-04)**
- **D-10:** Stopping is an explicit choice, **default on**, implemented as `docker compose stop` of the old stack before data is copied. Containers are stopped, not removed, so the old stack can be restarted. If the user declines, the old stack is left running and untouched, and the dialog warns that port conflicts are possible.
- **D-11:** On rollback, restart the old stack only if Docktor stopped it.

**Dialog flow**
- **D-12:** Four steps: (1) Select data, (2) Review changes, (3) Backup, (4) Old stack, then Confirm & Migrate. `ConfirmMigrateParams` and both migrate endpoints gain `backup: boolean` and `stopOldStack: boolean`; Zod schemas go in `@docktor/shared`, not duplicated in the routes.

### Claude's Discretion
- Exact dialog widths/breakpoints, step indicator styling, copy text of warnings.
- Whether the shared Zod schemas replace the inline route schemas in this phase or only the new fields are added.
- How the self-container is looked up (existing `DockerExecutorPort` vs new narrow port), as long as it stays behind a port and is unit-testable.

### Deferred Ideas (OUT OF SCOPE)
- Issue #13's opt-in toggle to display Docktor's own stack read-only (like the proxy stack) and updating it: not in the roadmap, belongs in a future phase.
- `compose down` / undeploy-after-success variant for the old stack: not chosen.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STK-03 | "Import existing stack" does not offer Docktor's own stack (#13) | New `SelfStackPort` + filter in `OnboardingService.scan`; label/mount mapping verified empirically (see Pattern 1) |
| MIG-01 | Migration diff shown in a larger, readable dialog (#72) | Root cause of "never wider": primitive's `sm:max-w-lg` beats unprefixed `max-w-3xl`; use `sm:max-w-5xl` + pinned header/footer (UI-SPEC) |
| MIG-02 | Real line diff rendered with the shared editor components (#72) | `computeUnifiedDiff` + `UnifiedDiffView` (diff), read-only `CodeEditor` (`.env`); retire `generateDiff` and `diff-viewer.tsx` |
| MIG-03 | Backup is its own explicit opt-out step (#72) | `backup: boolean` end-to-end; `fs.cp` to `<newStack>/pre-migration-backup/`; remove tmpdir backup + restore-by-`rm` |
| MIG-04 | User can stop the old stack as part of migration (#72) | `stopOldStack: boolean`; new `ExternalStackControlPort` (`stop` / `start` by compose file path); rollback restarts only if stopped |
</phase_requirements>

## Summary

All five requirements are implementable with libraries already in the repo: **no new packages are needed** (`diff ^9.0.0` is already a server dependency and already wrapped by `computeUnifiedDiff`; every UI primitive named in 18-UI-SPEC.md is already installed). The work is a vertical slice across: (1) a new narrow "self stack" port + filter in `OnboardingService.scan`, (2) `MigrationService` rework (flags, backup location, stop/start behind a new port, non-destructive rollback), (3) a preview payload change from a positional text diff to `UnifiedDiff`, (4) shared Zod schemas for the four brownfield bodies, and (5) a four-step rewrite of `migration-wizard.tsx` split into section components.

The key research flag in CONTEXT.md (label path is a host path, scanner sees container paths) is resolved: the production compose file bind-mounts the host root as `/:/host:ro`, and the container's own `inspect` output exposes that mapping in `Mounts` (`Type:"bind"`, `Source:"/"`, `Destination:"/host"`). The robust algorithm is: take every path in the `config_files` label (comma-separated, absolute, host-side), generate the **identity candidate plus one candidate per bind mount whose `Source` is an ancestor of it** (`Destination + relative`), and exclude any scanned `path` equal to a candidate. This needs no hardcoded `/host`, handles `DOCKTOR_STACKS_HOST_DIR` identical-path mounts for free, and fails open when nothing matches.

Three findings the CONTEXT did not anticipate and the planner must schedule: (a) the existing rollback `startContainersAtPath` uses `docker compose up -d` from a `/host/...` path, which can **recreate** the old containers with wrong host bind paths; use `docker compose start` instead; (b) a `pre-migration-backup/` directory inside the stack dir contains a copy of `docker-compose.yml`, so a later scan of the stacks directory would offer the backup as an importable stack unless the scanner ignores it; (c) `migrate()` currently calls `docker.up(stackId)` (Step 8), which interacts with D-10's "decline = old stack keeps running" (see Open Question 1).

**Primary recommendation:** Build bottom-up with TDD: shared schemas -> `SelfStackPort` + scan filter -> `ExternalStackControlPort` + `MigrationService` rework -> preview `UnifiedDiff` -> client env-mask helper extraction -> 4-step wizard components -> update the Playwright specs that hard-code "Next"/"Cancel"/string diffs. CI runs the integration and Playwright suites; locally run only targeted unit tests.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Identify Docktor's own compose file | API / Backend (infrastructure adapter behind a port) | — | Needs Docker Engine API `inspect`; browser cannot know it |
| Exclude own stack from scan results | API / Backend (`OnboardingService.scan`, application) | — | D-03: shared by `routes/setup.ts` and `routes/imports.ts`; routes stay thin |
| Compute compose line diff | API / Backend (`MigrationService.previewMigration` + `computeUnifiedDiff`) | — | Needs the original file on disk + `ComposeRewriter`; pure diff fn already in `lib/` |
| Render diff / `.env` preview | Browser / Client (`UnifiedDiffView`, `CodeEditor`) | — | Presentation only; generic components stay domain-free |
| Secret masking of `.env` preview | Browser / Client (`lib/` helper) | — | Display-only heuristic (`isSecretKey` is documented as not a security control) |
| Backup copy / stop / start / rollback | API / Backend (`MigrationService` + ports) | Infrastructure (`fs`, `docker compose`) | Business operation with ordering and rollback invariants |
| Backup/stop choices (state, validation) | Browser / Client (dialog state) | API (Zod schema in `@docktor/shared`) | UI collects; server validates via shared schema |
| Request validation | API (shared Zod schemas) | — | CLAUDE.md: schemas live in `@docktor/shared` |

## Standard Stack

### Core (all already installed — no installation step)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `diff` (jsdiff) | `^9.0.0` [VERIFIED: server/package.json:22] | `structuredPatch` behind `computeUnifiedDiff` | Already wraps D-04's diff generator; used by `compose-review-service.ts` |
| `dockerode` | `^4.0.4` [VERIFIED: server/package.json:23] | Self-container `inspectContainer` via existing `DockerodeClientPort` | Existing seam; supports `AbortSignal` |
| `yaml` | existing | `ComposeRewriter.rewrite` | Unchanged |
| `zod` (via `@docktor/shared`) | existing | New shared brownfield body schemas | CLAUDE.md validation rule |
| `@uiw/react-codemirror` | existing | `CodeEditor` (read-only `.env` preview) | UI-SPEC D-05 |
| shadcn primitives: dialog, button, switch, checkbox, label, input, alert, scroll-area, skeleton | installed [VERIFIED: 18-UI-SPEC.md Component Inventory] | Dialog UI | No new components to add |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hostname-based self lookup (`isContainerized() ? hostname()`) | Parse `/proc/self/mountinfo` for the container id | More robust when `hostname:` is overridden, but new parsing code; hostname is the precedent in `probe-transport.ts` and `socket-inspector.ts`. Failure falls through to D-02 fail-open, which is the locked behaviour. Use hostname. |
| `docker compose stop` via `execFile` | Docker Engine API `container.stop` by label | Would need host-to-container path reverse mapping to select containers; D-10 locks `docker compose stop`. Use compose CLI. |
| Extend `DockerExecutorPort` for the old stack | New `ExternalStackControlPort` | `DockerExecutorPort` methods take a managed `stackId` and `cd` into `getStackPath(stackId)`; the old stack is at an arbitrary path. New narrow port is cleaner (CONTEXT discretion explicitly allows). |

**Installation:** none. **Package versions verified:** `diff ^9.0.0` and `dockerode ^4.0.4` read from `server/package.json` this session; no new dependency introduced.

## Package Legitimacy Audit

No external packages are installed by this phase. The `package-legitimacy check` gate is not applicable.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                       Setup wizard (BrownfieldStep)        Post-setup page (/stacks/import)
                                   \                          /
                          BrownfieldImport (api injected: setup-api | import-api)
                                   |  scan(dirs)                      | preview / migrate
                                   v                                  v
        POST /api/setup/scan | /api/stacks/import/scan     POST .../migrate/preview | .../migrate
                                   \                          /     (shared Zod body schemas)
                                    v                        v
                         OnboardingService.scan        MigrationService
                           |           |                 |-- previewMigration: read compose -> ComposeRewriter.rewrite
                           |           |                 |      -> computeUnifiedDiff(orig, rewritten) -> {diff: UnifiedDiff, extractedEnv}
                           v           v                 |-- migrate(input + backup + stopOldStack):
              BrownfieldScannerPort   SelfStackPort      |     1 slug/exists checks
              (fast-glob + analyze)   (inspect own       |     2 [stopOldStack] ExternalStackControlPort.stop(composePath)
                                       container,        |     3 StackFilesystemPort.createDirectory(newStack)
                                       labels + Mounts)  |     4 [backup] fs.cp(originalDir -> newStack/pre-migration-backup)
                           |           |                 |     5 copy named volumes + bind data (CR-02 confinement)
                           v           v                 |     6 rewrite compose/.env, create Stack record, docker.up
                  scan result  --filter(candidates)-->   |     on error: remove new dir + record;
                  (own compose file removed)             |        [stopped] ExternalStackControlPort.start(composePath)
                                                         v
                                              {success, stackId?, error?}  -> parent toasts (WR-09)
```

### Recommended Project Structure
```
shared/src/validation/
└── wizard.ts (or new brownfield.ts)    # + brownfieldAdoptSchema, migrationPreviewSchema, migrationExecuteSchema; re-export via validation/index.ts
server/src/
├── application/ports/
│   ├── self-stack-port.ts              # NEW  composeFilePaths(): Promise<readonly string[]>
│   └── external-stack-control-port.ts  # NEW  stop(composePath) / start(composePath)
├── infrastructure/
│   ├── docker-self-stack.ts            # NEW  adapter: dockerodeClient.inspectContainer(selfId) -> labels + Mounts
│   ├── external-stack-control.ts       # NEW  execFile("docker", ["compose","-f",path,"stop"|"start"], {cwd, timeout})
│   ├── brownfield-scanner.ts           # add "**/pre-migration-backup/**" to ignore
│   └── compose-rewriter.ts             # delete generateDiff (and from ComposeRewriterPort)
├── domain/self-stack-paths.ts          # NEW  pure: hostPathCandidates(labelValue, mounts) (no I/O)
├── application/onboarding-service.ts   # scan(): filter by SelfStackPort
├── application/migration-service.ts    # reworked (see Pattern 3)
└── routes/{setup,imports}.ts           # use shared schemas; pass new flags
client/src/
├── lib/env-mask.ts                     # NEW (name is planner's): maskEnvContent(), envContentHasSecret(); used by diff-confirm-dialog.tsx too
├── lib/brownfield-types.ts             # MigrationPreview.diff: UnifiedDiff; MigrationResult unchanged
└── routes/setup/components/
    ├── migration-wizard.tsx            # shell: Dialog + step state + footer
    ├── migration-step-indicator.tsx    # "Step n of 4" + 4-segment bar
    ├── migration-select-step.tsx       # step 1 (existing content)
    ├── migration-review-step.tsx       # step 2: counters + ScrollArea(UnifiedDiffView) + .env CodeEditor
    ├── migration-backup-step.tsx       # step 3
    ├── migration-old-stack-step.tsx    # step 4 + summary
    └── diff-viewer.tsx                 # DELETE
```
CLAUDE.md forbids inline helper components and wants thin orchestrators, hence the split. `domain/` must not import `infrastructure/` or `repositories/` (layering test), so the path-candidate function stays pure and takes plain data.

### Pattern 1: Self-stack exclusion via label + Mounts mapping (STK-03)

**What:** Port returns container-visible candidate paths for Docktor's own compose file(s); `OnboardingService.scan` drops any `stack.path` that matches.

**Facts (verified):**
- `config_files` is an absolute, **host-side**, comma-separated list. Single-file example read from a running local container: `/home/raphael/docker/audiobooks/docker-compose.yml | /home/raphael/docker/audiobooks` (`config_files | working_dir`). With `-f a -f b` the label is `…/docker-compose.yml,…/docker-compose.override2.yml` (probed this session with `docker compose -f … -f … create` + `docker inspect`, container removed afterwards). [VERIFIED: docker inspect probe 2026-10-14]
- Compose defines the labels: `// WorkingDirLabel stores absolute path to compose project working directory` / `WorkingDirLabel = "com.docker.compose.project.working_dir"` / `// ConfigFilesLabel stores absolute path to compose project configuration files` / `ConfigFilesLabel = "com.docker.compose.project.config_files"`. [CITED: github.com/docker/compose pkg/api/labels.go:38-41]
- Caveat: the label stores the path as seen by the process that created the stack, so a stack-manager-launched project can carry a container-internal path (docksentry release note). The identity candidate covers this. [CITED: newreleases.io/project/github/amayer1983/docksentry/release/v2.17.4]
- The production compose mounts the host root: `- /:/host:ro` ("Read-only view of the host's entire root filesystem. Used for the brownfield-import scan"). [VERIFIED: docker-compose.yml, `/:/host:ro` volume entry]. A container created with `-v /:/host:ro` reports `[{"Type":"bind","Source":"/","Destination":"/host","Mode":"ro","RW":false,"Propagation":"rslave"}]` in `.Mounts`. [VERIFIED: docker create + inspect probe]. `@types/dockerode` types `ContainerInspectInfo.Mounts` as `Array<{Type: "bind" | "volume" | …; Name?; Source: string; Destination: string; Mode; RW; Propagation}>` [VERIFIED: node_modules/@types/dockerode/index.d.ts:632-641].
- Existing self-lookup precedent: `containerId: () => (resolved ??= isContainerized().then((containerized) => (containerized ? hostname() : null)))` (`probe-transport.ts:40`) and `["inspect", "--format", "{{.Config.Image}}", hostname()]` (`socket-inspector.ts:44`). [VERIFIED: files read this session]

**Algorithm (pure function in `domain/`):**
```typescript
// Source: derived from the verified label/Mounts shapes above
import path from "node:path";

export interface BindMount { readonly type: string; readonly source: string; readonly destination: string }

/** Candidates for one host-side compose file path, as visible inside Docktor's container. */
export function containerVisiblePaths(hostFile: string, mounts: readonly BindMount[]): string[] {
  const out = [hostFile]; // identity: stacks dir mounted at the identical path, or a container-internal label
  for (const m of mounts) {
    if (m.type !== "bind") continue;
    const rel = path.posix.relative(m.source, hostFile);        // Source "/" -> "opt/x/docker-compose.yml"
    if (rel === "" || rel.startsWith("..") || path.posix.isAbsolute(rel)) continue;
    out.push(path.posix.join(m.destination, rel));              // "/host" + rel
  }
  return out;
}
```
Adapter: `labels["com.docker.compose.project.config_files"]?.split(",").map(s => s.trim()).filter(Boolean)` -> flatMap through the function above.

**Matching in `OnboardingService.scan`:** compare with separators normalised to `/` on both sides (the Windows CI job normalises the same way; see `toPosixComparable` in `brownfield-scanner.test.ts`). Exact file equality per D-01 (not directory equality).

**Fail-open (D-02):** any of: not containerized, `inspectContainer` rejects/404 (hostname not a container id), label absent, empty list -> adapter returns `[]` and scan returns everything. Wrap the inspect in `AbortSignal.timeout(~5000)` (the port already accepts a `signal`) so a frozen dockerd cannot hang an import scan; log with `console.warn` like the other adapters.

**Injection point:** add `SelfStackPort` as a trailing optional constructor param of `OnboardingService` (default singleton), exactly like the existing `scanner` param, so current positional-arg tests keep compiling. Filtering inside `scan()` (not inside `BrownfieldScanner`) keeps the scanner dumb and satisfies D-03.

### Pattern 2: Preview as `UnifiedDiff` (MIG-01/02)

```typescript
// migration-service.ts
async previewMigration(...): Promise<{diff: UnifiedDiff; extractedEnv: string}> {
  const original = await fs.readFile(composePath, "utf-8");
  const result = this.rewriter.rewrite(original, volumeSelections, namedVolumeSelections);
  return {diff: computeUnifiedDiff(original, result.rewrittenCompose), extractedEnv: result.extractedEnv};
}
```
`UnifiedDiff` is `{hunks: readonly DiffHunk[]; added: number; removed: number}` with `DiffLine {kind: "context"|"added"|"removed"; text; oldLine: number|null; newLine: number|null}`. [VERIFIED: server/src/lib/unified-diff.ts:1-97]. The client already has a structural copy: `UnifiedDiff {readonly hunks: readonly DiffHunk[]; readonly added: number; readonly removed: number}` in `client/src/lib/stacks-api.ts:133-137`; reuse it in `brownfield-types.ts` (`MigrationPreview.diff: UnifiedDiff`) instead of redeclaring. Identical content short-circuits to `{hunks: [], added: 0, removed: 0}` (UI-SPEC empty state). Remove `generateDiff` from `ComposeRewriter` **and** `ComposeRewriterPort` (and its tests).

### Pattern 3: `MigrationService.migrate` rework (MIG-03/04, D-07..D-11)

```typescript
export interface MigrationInput {
  composePath: string; displayName: string;
  volumeSelections: VolumeSelection[]; namedVolumeSelections: Map<string, boolean>;
  backup: boolean; stopOldStack: boolean;                   // required, no defaults
}
// constructor gains: private readonly oldStack: ExternalStackControlPort = externalStackControl

let oldStackStopped = false;
try {
  if (stopOldStack) {
    oldStackStopped = true;                 // set BEFORE the call: a partial stop must still be undone
    await this.oldStack.stop(composePath);  // fail closed: throw -> rollback -> nothing else created yet
  }
  const newStackPath = await this.stackFs.createDirectory(stackId);
  if (backup) {
    await fs.cp(originalDir, path.join(newStackPath, "pre-migration-backup"),
                {recursive: true, errorOnExist: true, force: false});
  }
  // ... existing steps 4-8 unchanged (CR-02 VOLUME_NAME_PATTERN / assertWithin preserved)
} catch (err) {
  await removeNewStack(stackId);            // stackFs.removeDirectory + stackRepo.delete (best-effort, as today)
  if (oldStackStopped) restarted = await this.oldStack.start(composePath).then(() => true, () => false);
  return {success: false, originalPath: originalDir,
          error: `Migration failed: ${msg}.` + (oldStackStopped ? (restarted ? " The old stack was restarted." : " The old stack could not be restarted automatically.") : "")};
}
```
Notes the planner must carry into tasks:
- **Delete** the `os.tmpdir()` backup, the `fs.rm(originalDir)` + `fs.cp(backupDir, originalDir)` restore, and the CR-04 cleanup block (D-08/D-09). Remove `import os`, `import {spawn}` and the private `stopContainersAtPath` / `startContainersAtPath` (the application layer should not shell out; moves to the new port).
- The current rollback restore (`fs.rm(originalDir)`) could not even work against the production `/:/host:ro` mount, which supports D-09. [VERIFIED: docker-compose.yml volume comment + migration-service.ts rollback block]
- Backup lands in the new stack directory, which is removed on rollback, so a failed migration leaves no orphan backup.
- Stop failure policy is Claude's discretion; recommendation is fail-closed (throw, rollback) because the user explicitly asked, and copying live databases is the corruption risk that motivated MIG-04. Today's code swallows stop errors (`// Continue even if stop fails`); that must change. `docker compose stop` exits 0 when nothing is running, so "not running" is not an error.

### Pattern 4: `ExternalStackControlPort` adapter

```typescript
// infrastructure/external-stack-control.ts — execFile (no shell), timeout like DockerExecutor
const execFileAsync = promisify(execFile);
async stop(composePath: string)  { await execFileAsync("docker", ["compose", "-f", composePath, "stop"],  {cwd: path.dirname(composePath), timeout: 120_000}); }
async start(composePath: string) { await execFileAsync("docker", ["compose", "-f", composePath, "start"], {cwd: path.dirname(composePath), timeout: 120_000}); }
```
- Use **`start`, not `up -d`**, for rollback. `docker compose start` "Starts existing containers for a service" [CITED: docs.docker.com/reference/cli/docker/compose/start/ — the page does not state recreate semantics, so "start never recreates" is an inference, tagged below]. `up -d` run from `/host/...` would re-resolve relative bind mounts against the container-side path and can recreate the old containers with bad host paths (Pitfall 2).
- `stop`/`start` select containers by compose project name derived from the file's directory/`name:`; they do not need the host-path label to match. [ASSUMED — see A2]
- Unit-test the adapter by injecting the runner (the `CommandRunner` pattern in `socket-inspector.ts`), not by mocking `node:child_process`.

### Pattern 5: Client dialog (UI-SPEC is the contract; research adds mechanics)

- Width: `DialogContent` base class ends `… p-6 shadow-lg … sm:max-w-lg` [VERIFIED: client/src/components/ui/dialog.tsx:62]. The current unprefixed `max-w-3xl` loses to `sm:max-w-lg` at >=640px, so the dialog has always been 512px on desktop (this is the root cause of #72's "too small"). Use `sm:max-w-5xl`. `cn()` (tailwind-merge) resolves the `flex flex-col` vs the base `grid` conflict in favour of the override.
- Env masking: extract `ENV_KEY_VALUE_PATTERN`, `SECRET_MASK = "••••••••"`, `maskSecretLine`, `hunksHaveSecret` logic from `diff-confirm-dialog.tsx` into a `lib/` module that works on plain strings (`maskEnvText(content, reveal)`, `envTextHasSecret(content)`), and have `diff-confirm-dialog.tsx` call it for its `UnifiedDiffLine.text`. Existing `diff-confirm-dialog.test.tsx` is the regression net. `isSecretKey` regex is `/password|secret|key|token/i` [VERIFIED: client/src/lib/env-file.ts:109-111] and is documented there as "a deliberately broad, display-only heuristic — not a security control".
- Reset reveal state on close **and** on Back to step 1 (UI-SPEC).
- Selections/toggles persist across Back; the preview is re-requested every time step 1 -> 2 is taken. A guard against stale async responses is cheap and worthwhile (ignore a response if the dialog was closed meanwhile; WR-09 still forbids state updates after confirm).
- `ConfirmMigrateParams` gains `backup: boolean; stopOldStack: boolean`; `BrownfieldImportApi.executeMigration` and both `setup-api.ts` / `import-api.ts` functions gain the two args (consider switching to a single params object since the signature would otherwise have six positional args).
- Parent toasts: append the descriptions in UI-SPEC "Outside the dialog"; they derive from the params the parent already holds.

### Anti-Patterns to Avoid
- **Filtering own stack in the client or in the route:** violates D-03 and CLAUDE.md (routes thin); would diverge between setup and import.
- **Heuristic fallbacks (container_name, image, `/opt/docktor`)** — forbidden by D-02.
- **Second diff renderer or re-parsing a text diff on the client** — forbidden by D-04.
- **Defaulting `backup`/`stopOldStack` to `true` in the Zod schema:** the server would silently decide for an old client; make both required booleans so omission is a 400.
- **Inline `z.object` body schemas duplicated in four places** (currently two preview + two migrate copies in `setup.ts`/`imports.ts`): move to `@docktor/shared` (CLAUDE.md "Do not duplicate Zod schemas").

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Line diff | positional `generateDiff` or a client-side parser | `computeUnifiedDiff` + `UnifiedDiffView` | Positional diff marks every line after an insertion as changed; jsdiff gives real LCS hunks, counters, line numbers |
| Directory copy for backup | shell `cp -a` | `fs.cp(src, dest, {recursive: true})` | Already used by the code base; same call the migrator uses (`VolumeMigrator.copyDirectory`) — or route through `VolumeMigratorPort.copyDirectory(src, dest)` so the unit test can fake it (preferred, avoids touching real fs for the backup path) |
| Host-to-container path mapping | hardcoded `"/host" + path` | `Mounts` from self `inspect` | Works for any mount layout incl. `DOCKTOR_STACKS_HOST_DIR` identical-path mounts |
| Secret masking | new regex in the wizard | shared `lib/` helper extracted from `diff-confirm-dialog.tsx` | One behaviour in both review dialogs |
| Step indicator | reuse setup `WizardStepper` | small local component | `WizardStepper` is hard-wired to the six setup steps (UI-SPEC) |
| Request schemas | inline copies per route | `@docktor/shared` | CLAUDE.md |

**Key insight:** every hard part here already exists in the repo; the phase is mostly about moving boundaries (shell-outs behind ports, schemas into shared, masking into `lib/`) and making rollback non-destructive.

## Runtime State Inventory

> This is not a rename phase, but it removes a persisted artifact location and changes API shapes, so the relevant categories are answered explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `Stack.description` is `Migrated from ${originalDir}` (free text, unchanged); no DB schema change | none (verified: migration-service.ts Step 7) |
| Live service config | None — no external service stores these strings | none |
| OS-registered state | None | none |
| Secrets / env vars | None. `DOCKTOR_STACKS_HOST_DIR` / `DOCKTOR_STACKS_DIR` read-only context; unchanged | none |
| Build artifacts | `@docktor/shared` is consumed by the server through compiled `shared/dist` (guarded by `shared-schema-parity.test.ts`); new schemas require a shared rebuild before server tests/typecheck. Stale dist = 400/`undefined` schema at runtime | rebuild shared (the workspace `test:unit` script already does) |
| Persisted artifacts of the old behaviour | Old migrations left `docktor-migration-backup-*` dirs in OS temp only on crash; new flow never writes there | none required (optional: document) |

## Common Pitfalls

### Pitfall 1: Windows CI path semantics in new unit tests
**What goes wrong:** the repo runs a `windows-latest` unit job (comments in `stacks-dir.ts`, `brownfield-scanner.test.ts`); host-native `path.resolve/normalize` turns POSIX fixtures into `D:\…` there.
**How to avoid:** use `path.posix` in the pure label/Mounts mapping (Docker paths are Linux paths), and compare against the scanned path after `\`->`/` normalisation (same trick as `toPosixComparable`).
**Warning signs:** a green Linux run and red Windows run on the new self-stack tests.

### Pitfall 2: Rollback restart via `docker compose up -d` recreates the old stack with wrong paths
**What goes wrong:** the existing helper runs `["compose","up","-d"]` with `cwd` = a `/host/...` path. Compose re-resolves relative bind mounts against that container-side path, the config hash differs from the original, and containers can be recreated with `/host/...` as the host-side source. [ASSUMED mechanism, A3; the code line is VERIFIED]
**How to avoid:** `docker compose start` (existing containers only). Document that an old stack whose containers were removed during the migration cannot be restarted by this path (it never removes them).

### Pitfall 3: `pre-migration-backup/` becomes an importable stack
**What goes wrong:** the backup contains `docker-compose.yml`; `BrownfieldScanner` globs `**/docker-compose.yml` etc., so scanning the stacks directory (or any parent, e.g. `/host/opt`) offers the backup as a new stack and can trigger duplicate-slug adoption.
**How to avoid:** add `"**/pre-migration-backup/**"` to `SYSTEM_DIR_EXCLUDES` in `brownfield-scanner.ts` with a test. Also confirm `file-watcher.ts` is unaffected: it watches `depth: 2` from the stacks root, so `<id>/pre-migration-backup/docker-compose.yml` is at depth 3 [VERIFIED: file-watcher.ts `depth: 2` option]; it ignores files not named `docker-compose.yml`/`.env` by basename only, which is fine at that depth.
**Related:** restic backups of the new stack use `stack.hostPath` as the backup root (`backup-service.ts` `stackPath = stack.hostPath`), so the kept backup is included in every backup of the stack and doubles its size; mention in docs/UI copy, no change required.

### Pitfall 4: `fs.cp` into a subdirectory of the source
**What goes wrong:** if `originalDir` is an ancestor of the new stack dir (compose file placed in a parent of the stacks directory), `fs.cp` throws "cannot copy to a subdirectory of self" and the migration rolls back with a confusing message.
**How to avoid:** guard early (`BadRequestError`) when `newStackPath` starts with `originalDir + sep` and backup is requested; add a test.

### Pitfall 5: Absolute bind-mount sources are host paths but are read from the container filesystem
**What goes wrong:** `migrate()` Step 5 does `fs.access(srcPath)` / `copyDirectory(srcPath, destPath)` with `srcPath = sel.originalPath` for absolute paths. With the production layout the host's `/srv/data` is visible only as `/host/srv/data`; `fs.access` fails and the code silently falls into `fs.mkdir(destPath)` (empty directory) — the user believes data was copied. [VERIFIED: migration-service.ts Step 5 `catch { await fs.mkdir(...) }`; deployment layout VERIFIED from docker-compose.yml; the end-to-end consequence is INFERRED]
**Why it matters here:** D-08 describes the backup as including "bind-mount data". Relative bind mounts inside the old directory are covered by the directory copy; absolute ones outside it are not (they are only handled by Step 5). Out of scope to fix (pre-existing, not in any requirement), but the mapping helper from Pattern 1 could resolve it later. Recommend filing a GitHub issue rather than expanding this phase (see Open Question 3).

### Pitfall 6: Re-stringified YAML makes the diff noisy
**What goes wrong:** `ComposeRewriter.rewrite` parses and re-serialises the whole document (`yaml` `parse`/`stringify`), so comments, quoting and indentation change; the real line diff then shows many cosmetic hunks even for a one-volume change. This is honest output of a real diff (the old positional diff hid it by position).
**How to avoid:** do not "fix" in the diff layer. Optionally note it in the step-2 description. Tests should assert on `added`/`removed` kinds for a known fixture, not exact hunk counts of reformatted files.

### Pitfall 7: Stale/duplicate async preview
**What goes wrong:** user clicks Preview, closes the dialog, preview resolves and calls `setStep(2)` on an unmounted/reset dialog.
**How to avoid:** track a request token or `open` ref; ignore late responses. Keep WR-09: after confirm, no state updates.

### Pitfall 8: Playwright specs hard-code the old UI
`client/test/integration/setup-wizard.spec.ts` asserts `getByRole("button", {name: "Next"})` for the migration dialog (lines ~509, 524, 548, 574), string `diff` mock bodies (`diff: "  services:\n-   pgdata:…"`), and `getByText("Migrated", {exact: true})` (line 513). All must change to `Preview Changes`, the `UnifiedDiff` JSON shape, and the new step flow (`Choose Backup`, `Choose Old Stack Action`, `Confirm & Migrate`); the `Cancel` button becomes `Cancel Migration`. `stacks-import.spec.ts` mocks scan only and is unaffected unless it opens the dialog. These run in CI only (project memory: no heavy local runs).

## Code Examples

### Shared schemas (add to `shared/src/validation/wizard.ts` or a new `brownfield.ts`, re-exported)
```typescript
// Source: replaces the four identical inline z.object bodies in routes/setup.ts and routes/imports.ts
export const volumeSelectionSchema = z.object({
  originalPath: z.string(), newPath: z.string(), convert: z.boolean(),
});
export const migrationPreviewSchema = z.object({
  composePath: z.string(),
  volumeSelections: z.array(volumeSelectionSchema),
  namedVolumeSelections: z.record(z.string(), z.boolean()),
});
export const migrationExecuteSchema = migrationPreviewSchema.extend({
  displayName: z.string().min(1),
  backup: z.boolean(),          // D-12: explicit, no default
  stopOldStack: z.boolean(),    // D-12: explicit, no default
});
export type MigrationExecuteInput = z.infer<typeof migrationExecuteSchema>;
```
`adopt` body (`composePath`, `displayName`) is a fifth duplicate and can move at the same time (discretion item).

### Route handler (thin; both routes identical)
```typescript
app.post("/api/stacks/import/migrate", {schema: {body: migrationExecuteSchema}}, async (request) => {
  const {namedVolumeSelections, ...rest} = request.body;
  return migrationService.migrate({...rest, namedVolumeSelections: new Map(Object.entries(namedVolumeSelections))});
});
```
(The existing `as [string, boolean][]` cast on `Object.entries` is unnecessary once the record is typed by Zod; CLAUDE.md prohibits unexplained casts.)

### Self-stack scan filter
```typescript
// onboarding-service.ts
async scan(directories: string[]): Promise<ScanResult> {
  const [result, selfPaths] = await Promise.all([this.scanner.scan(directories), this.selfStack.composeFilePaths()]);
  if (selfPaths.length === 0) return result;                       // D-02 fail-open
  const own = new Set(selfPaths.map(toComparable));
  return {...result, stacks: result.stacks.filter((s) => !own.has(toComparable(s.path)))};
}
```
Do **not** bump `skippedDirectories` (UI-SPEC: exclusion is silent).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Positional line-by-line `generateDiff`, side-by-side `DiffViewer` | `computeUnifiedDiff` + `UnifiedDiffView` | Issue #18 (Phase 12) for stack edits; this phase for migration | One diff renderer |
| Always-on tmpdir backup, deleted on success, `rm`+restore on failure | Optional in-stack `pre-migration-backup/`, kept, non-destructive rollback | This phase | Backup becomes a user-visible deliverable |
| Swallowed `compose stop` errors | Explicit user choice; failure aborts | This phase | Predictable state |

**Deprecated/outdated:** `ComposeRewriter.generateDiff`, `ComposeRewriterPort.generateDiff`, `client/src/routes/setup/components/diff-viewer.tsx`, `MigrationService` private `spawn` helpers, `parseDiffForViewer` in the wizard.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Docktor's container hostname equals its container id prefix in standard deployments (no `hostname:` override) so `inspect(hostname())` resolves | Pattern 1 | Self-stack is not excluded (fail-open, D-02) — acceptable degradation, but worth a doc note. Precedent code relies on the same assumption. |
| A2 | `docker compose -f <file> stop/start` finds the old containers by project name derived from the file's directory / `name:` / `COMPOSE_PROJECT_NAME` in that dir's `.env`, independent of the host path label | Pattern 4 | Stop is a no-op for stacks deployed with a custom `-p`; old stack keeps running although the user chose stop. Mitigation: planner may add a post-stop verification or a doc note. Needs user confirmation if a stronger guarantee is wanted. |
| A3 | `docker compose up -d` from a `/host/...` cwd can recreate old containers with wrong host bind sources; `start` does not recreate | Pitfall 2 | If wrong, `up -d` would also have been fine; choosing `start` is still safe. Low risk. |
| A4 | An opt-out of stopping combined with the unchanged `docker.up(stackId)` (Step 8) will often fail on port conflicts and roll back | Open Question 1 | Behavioural decision; see OQ1 |
| A5 | Fail-closed on `stop` failure is the desired policy (discretion item) | Pattern 3 | If the user prefers best-effort, change one `throw` to a warning |
| A6 | A large backup copy is acceptable inside a synchronous request (no job queue) | Pattern 3 | Very large data dirs could exceed proxy timeouts; the endpoint is already synchronous today (volume copy can be equally long) |

## Open Questions

1. **Does the new stack get deployed when the user declines "stop old stack"?**
   - Known: `migrate()` Step 8 always runs `await this.docker.up(stackId)` [VERIFIED: migration-service.ts]. UI-SPEC step-4 copy says ports "can conflict when you deploy the new stack"; REQUIREMENTS MIG-04 says "so the new draft stack does not run alongside it", which reads as if the new stack is not yet deployed.
   - Unclear: whether D-10 intends migrate to stop auto-deploying (at least when `stopOldStack` is false).
   - Recommendation: keep `docker.up` unchanged in both cases (no decision changes it); with stop declined, a port clash fails `up`, triggers the rollback, and the surfaced compose error explains why — consistent with the "port conflicts are possible" warning. Planner should confirm with the user if "draft" is meant literally; if so the alternative is a single `if (stopOldStack) await docker.up(...)`.
2. **Should a stop failure abort?** Recommended yes (A5); confirm in plan.
3. **Absolute bind-mount sources and `/host` (Pitfall 5).** Recommend opening a GitHub issue (area:server) and not widening Phase 18. Note the scan form default `"/home, /opt, /srv"` (`brownfield-import.tsx`) does not point at `/host/...` while docs say scans go "through the read-only `/host` mount" (`docs/design.md:154`); in-container those defaults only see the container's own filesystem. Pre-existing; Phase 18's mapping makes the exclusion work for either layout.
4. **Old-stack containers for a stack deployed with multiple compose files:** `-f <scanned file>` alone may not reproduce the full project config for `stop`, but project name is what selects containers (A2); acceptable.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node / Yarn 4 | all workspace tests | assumed (repo toolchain) | — | — |
| Docker CLI + daemon | Only for this research's probes; **production** needs it at runtime; unit tests mock via ports | ✓ on research host | Docker 29.8.1, Compose v5.5.1 | Tests never need it |
| Postgres (testcontainers) | server integration tests | CI only | — | Do not run locally (project memory) |
| Playwright browsers | client integration specs | CI only | — | Do not run locally |

**Missing dependencies with no fallback:** none for planning/unit work.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x (server project `unit`, client jsdom + Testing Library); Playwright for client integration |
| Config file | `server/vitest.config.ts` (projects: `unit` = `test/unit/**/*.test.ts`, `test/integration`), `client/vitest.config.ts` (`test/unit/**/*.test.{ts,tsx}`) |
| Quick run command (server) | `yarn workspace @docktor/server exec vitest run --project unit <file> --coverage.enabled=false` (run `yarn workspace @docktor/shared build` once after editing shared; it is light) |
| Quick run command (client) | `yarn workspace @docktor/client exec vitest run <file> --coverage.enabled=false` |
| Full suite command | `yarn test` — **CI only**; do not run locally (project memory: no full `tsc --build`, integration or Playwright on the VPS) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STK-03 | `containerVisiblePaths`: identity + `/host` mapping, `Source:"/"`, non-ancestor mount ignored, non-bind ignored, comma list | unit (pure) | `vitest run --project unit test/unit/domain/self-stack-paths.test.ts` | ❌ Wave 0 |
| STK-03 | Adapter: not containerized -> `[]`; inspect rejects -> `[]`; label missing -> `[]`; timeout signal passed | unit | `... test/unit/infrastructure/docker-self-stack.test.ts` | ❌ Wave 0 |
| STK-03 | `OnboardingService.scan` drops own compose file, keeps all others, fail-open on `[]`, `skippedDirectories` untouched, same behaviour via shared method for both routes | unit | `... test/unit/application/onboarding-service.test.ts` (extend `scan` describe) | ✅ extend |
| STK-03 | Scanner ignores `**/pre-migration-backup/**` | unit | `... test/unit/infrastructure/brownfield-scanner.test.ts` | ✅ extend |
| MIG-01/02 | `previewMigration` returns `UnifiedDiff` with correct `added/removed`, empty diff for no change | unit | `... test/unit/application/migration-service.test.ts` | ✅ rewrite |
| MIG-01/02 | `generateDiff` removed (rewriter + port) | unit | `... test/unit/infrastructure/compose-rewriter.test.ts` | ✅ edit |
| MIG-01 | Dialog classes carry `sm:max-w-5xl`; header/footer outside scroll body | component | `vitest run test/unit/routes/setup/migration-wizard.test.tsx` | ❌ Wave 0 |
| MIG-02 | Step 2 renders `UnifiedDiffView` region with `+N`/`−N` ToneBadges, empty state copy, `.env` `CodeEditor` read-only, secrets masked + reveal toggle, reset on Back/close | component | same file | ❌ Wave 0 |
| MIG-02 | env-mask helper (pure): mask by key, `export ` prefix, reveal, no-secret case | unit | `vitest run test/unit/lib/env-mask.test.ts` | ❌ Wave 0 |
| MIG-02 | `diff-confirm-dialog` unchanged after helper extraction | component | `vitest run test/unit/components/domain/stack/diff-confirm-dialog.test.tsx` | ✅ regression |
| MIG-03 | `backup:false` -> no `cp`, nothing at `pre-migration-backup`; `backup:true` -> copy into `<newStack>/pre-migration-backup` (also when compose path/name unchanged); backup survives success; nothing written to `os.tmpdir()` | unit | `... migration-service.test.ts` | ✅ rewrite |
| MIG-03 | Wizard step 3: Switch default on, off-state Alert copy, value flows into `onConfirmMigrate` | component | `migration-wizard.test.tsx` | ❌ Wave 0 |
| MIG-04 | `stopOldStack:true` -> `stop(composePath)` called before `createDirectory`/copies; `false` -> never touched; stop failure aborts with nothing created; rollback calls `start` iff stopped; original dir never `rm`'d | unit | `... migration-service.test.ts` | ✅ rewrite |
| MIG-04 | External control adapter argv/cwd/timeout (injected runner) | unit | `... test/unit/infrastructure/external-stack-control.test.ts` | ❌ Wave 0 |
| MIG-04 | Wizard step 4: Switch default on, warning on off, Summary rows incl. `Volumes to copy: 0` + note, final button `Confirm & Migrate`, WR-09 (calls parent once, closes) | component | `migration-wizard.test.tsx` | ❌ Wave 0 |
| D-12 | Shared schemas: `backup`/`stopOldStack` required booleans; omission rejected | unit | `vitest run --project unit test/unit/validation/...` + `shared-schema-parity.test.ts` | ❌ Wave 0 (new file) / ✅ parity |
| D-12 | Endpoints accept new fields, return `UnifiedDiff` preview, 401 unchanged | integration (CI) | `yarn workspace @docktor/server test:integration` (CI) | ✅ extend `imports.test.ts` |
| All | End-to-end wizard + import flow incl. 360px viewport no clipping | Playwright (CI, `PLAYWRIGHT_PORT`) | CI | ✅ update `setup-wizard.spec.ts` |
| Layering | `application/` has no `node:child_process`/`node:os` import after rework | unit | `... test/unit/architecture/layering.test.ts` (optional new rule) | ✅ extend |

### Sampling Rate
- **Per task commit:** the single targeted unit file for that task (commands above).
- **Per wave merge:** all `test/unit` files touched in the wave; client changed-area files; both with coverage disabled.
- **Phase gate:** CI green on full suite + Playwright desktop `chromium` and `mobile-chromium` projects before `/gsd-verify-work` (never run locally).

### Wave 0 Gaps
- [ ] `server/test/unit/domain/self-stack-paths.test.ts` — STK-03 mapping function
- [ ] `server/test/unit/infrastructure/docker-self-stack.test.ts` — STK-03 adapter, fail-open
- [ ] `server/test/unit/infrastructure/external-stack-control.test.ts` — MIG-04 adapter
- [ ] `client/test/unit/lib/env-mask.test.ts` — extracted helper
- [ ] `client/test/unit/routes/setup/migration-wizard.test.tsx` (+ step files if tested separately) — MIG-01..04 UI
- [ ] shared schema test for `migrationExecuteSchema` / `migrationPreviewSchema`
- [ ] Rewrite `migration-service.test.ts`: drop `vi.mock("node:child_process")` + `spawn` plumbing; use port fakes (`ExternalStackControlPort`, `VolumeMigratorPort.copyDirectory` for the backup copy so no real fs copy is required except in one temp-dir test)
- No framework install needed.

## Security Domain

> `security_enforcement` not disabled in `.planning/config.json` (key absent = enabled).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no change | Existing: `requireAuth` on `/api/stacks/import/*`; setup routes gated by wizard-complete preHandler (T-05.1-32/T-05-09) — keep intact |
| V3 Session Management | no | — |
| V4 Access Control | yes | Both route families keep their existing gates; do not add unauthenticated endpoints |
| V5 Input Validation | yes | Shared Zod schemas; keep CR-02 `VOLUME_NAME_PATTERN` + `assertWithin` for volume names and `newPath`; new booleans are typed |
| V6 Cryptography | no | — |
| V12 Files / V5 path handling | yes | `composePath` is attacker-supplied (authenticated) and now also flows into `docker compose -f <path>` and `fs.cp` source; use `execFile` argv (no shell) only, and consider validating that `composePath` basename is one of the four scanner filenames |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via `composePath` into the docker CLI | Tampering / EoP | `execFile` with argv array (never `exec`/shell); reject paths with NUL; restrict basename to compose filenames |
| Path traversal in `newPath` / volume names | Tampering | existing `assertWithin` / `VOLUME_NAME_PATTERN` (CR-02) — must survive the rework (add a regression test, existing ones cover it) |
| Secret disclosure in `.env` preview | Information disclosure | mask by `isSecretKey` by default, reveal on explicit click, reset on close (display heuristic only) |
| Plaintext secrets in backup | Information disclosure | Backup now persists inside the stack dir (previously temp, deleted); it is under the managed stacks volume, same trust as the stack's own `.env`; mention in step-3 helper copy (already says what is copied). Keep directory permissions default; do not widen. |
| Self-inspection leaking Docker data | Information disclosure | Adapter returns only paths; never log label values at info level beyond path |
| Destructive rollback deleting user data | Tampering / data loss | Removed by D-09: `rm originalDir` deleted; rollback only removes the directory Docktor created |
| Rollback removing a pre-existing directory with the same slug | Data loss | `createDirectory` uses `mkdir -p`; a stale `/stacks/<slug>` dir not in the DB would be wiped on failure. Pre-existing; cheap hardening: fail early if the target dir already exists (planner discretion) |

## Project Constraints (from CLAUDE.md)

- Layering: routes -> application only; domain pure; repositories only Prisma; ports/DI via constructor; export singletons; infra errors wrapped in domain-specific errors with `cause` (use `AppError`/`BadRequestError`, never raw `Error`).
- Strict TS: no `any`, no unexplained `as`; `Readonly<Props>` on component props; explicit return types on exported functions; props interfaces named `<Component>Props`.
- TDD; server unit tests mock repo/fs/Docker; integration tests use a real DB (never mocked) and run in CI.
- Zod schemas only in `@docktor/shared`; re-export from `shared/src/index.ts` (via `validation/index.ts`).
- Server imports use relative paths with `.js`; client uses `@/`; no barrel for a single module.
- UI: shadcn primitives (never edit `components/ui/`), `ToneBadge` for pills, `dark:` counterpart for every light color utility, `CodeEditor` for code, page files are orchestrators (~80 lines), no inline helper components, section components co-located under the route.
- Git: commit format `type(scope): description`; atomic commits; PRs close issues (`Closes #13`, `#72`); PLAN.md references the issues at the top.
- Project memory: no heavy local builds / integration tests; CI runs them.
- Known refactoring rule: touching `compose-rewriter.ts` -> opportunistically remove `as any` on `svc` only if trivial; otherwise leave.

## Sources

### Primary (HIGH confidence)
- Repository files read this session: `18-CONTEXT.md`, `18-UI-SPEC.md`, `server/src/application/{migration-service,onboarding-service}.ts`, `server/src/infrastructure/{brownfield-scanner,compose-rewriter,docker-executor,dockerode-client,probe-transport,socket-inspector,volume-migrator,stack-filesystem}.ts`, `server/src/routes/{setup,imports}.ts`, `server/src/lib/{unified-diff,stacks-dir}.ts`, `server/src/application/ports/*`, `server/test/unit/architecture/layering.test.ts`, existing migration/onboarding/scanner tests, `docker-compose.yml`, `client/src/routes/setup/components/migration-wizard.tsx`, `client/src/components/domain/stack/{brownfield-import,diff-confirm-dialog}.tsx`, `client/src/components/common/{code-editor,unified-diff-view}.tsx`, `client/src/components/ui/dialog.tsx:62`, `client/src/lib/{env-file,setup-api,import-api,brownfield-types}.ts`, `client/test/integration/setup-wizard.spec.ts`
- Empirical probes (2026-10-14): `docker inspect` of running containers' compose labels; `docker compose -f a -f b create` + inspect (comma-separated `config_files`); `docker create -v /:/host:ro` + inspect `.Mounts`. All test containers removed.
- `github.com/docker/compose` `pkg/api/labels.go` lines 38-41 (label definitions)
- `@types/dockerode` `ContainerInspectInfo.Mounts` type

### Secondary (MEDIUM confidence)
- docs.docker.com `docker compose start` reference ("Starts existing containers for a service")
- docksentry v2.17.4 release note (label records creator-process path)

### Tertiary (LOW confidence)
- None used for recommendations beyond items in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing and read in-repo.
- Architecture: HIGH — label format and `Mounts` shape verified empirically; layering rules read from the enforcing test.
- Pitfalls: MEDIUM-HIGH — pitfalls 2 and 5 include inferred runtime consequences (tagged); the rest are directly evidenced by code.

**Research date:** 2026-10-14
**Valid until:** 2026-11-13 (stable internals; Docker label names have been stable across Compose v1/v2/v5)
