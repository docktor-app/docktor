# Phase 12: Compose Safety and Templates - Research

**Researched:** 2026-10-01
**Domain:** Compose-file diffing/warnings, git-based template system, host-port-conflict detection (Node/Fastify + DDD backend, React/CodeMirror frontend)
**Confidence:** MEDIUM-HIGH (core stack decisions are HIGH confidence, verified in-repo; the port-conflict network-namespace finding is the critical risk area and is flagged for a pre-plan checkpoint)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Diff-before-apply (#18)**
- D-01: Diff is rendered as a unified diff (GitHub-style, single column with +/- lines), not side-by-side.
- D-02: The diff-confirm step is skipped on the very first save when creating a new stack (nothing to diff against) — it only applies to edits of an existing stack's compose/.env.
- D-03: Issue #18's diff-confirm dialog and issue #20's dangerous-config warning dialog are **merged into one dialog** — the diff and any triggered warnings (privileged/socket-mount/bind-outside-stack, named-volumes/inline-env/missing-env_file) are shown together in a single confirm step, warnings appearing in context next to the lines that caused them.
- D-04: Whether the diff-confirm dialog appears at all is **configurable in Settings** (a global toggle to skip it) — reversible.

**Git-based templates (#19)**
- D-05: The default official template repo is **`github.com/docktor-app/templates`** — already created and live.
- D-06: A template's multiple configurations are structured as **subdirectories per variant** (e.g. `templates/nextcloud/default/`, `templates/nextcloud/with-redis/`), each a self-contained compose+metadata folder.
- D-07: Template browse/search UI is a **grid of cards with a category filter and search box**, consistent with Phase 11's card patterns.
- D-08: When a newer template version is available, surface a **passive "template updated" badge** — informational only, no auto-apply, analogous to the per-service image-update badge.

**Dangerous-config warnings (#20)**
- D-09: Checks run **both on edit-apply (via the D-03 merged dialog) and again right before deploy**.
- D-10: Per-check enable/disable is exposed via a **new dedicated "Compose Checks" settings card**.
- D-11: Always-on checks (`privileged`, socket mount, bind-outside-stack) are **visually distinct** (red/destructive `ToneBadge`) from configurable warn-only checks (yellow/warning tone).
- D-12: Checks are implemented as a **Strategy-pattern rule registry** — each check is its own class/function implementing a shared `Rule` interface (id, severity, `check(doc) → finding[]`), registered in a list. **No runtime plugin-loading mechanism.**

**Port-conflict detection (#21)**
- D-13: A non-Docktor process holding a conflicting port is identified by **shelling out to `ss`/`lsof`** (Linux), consistent with the project's shell-out pattern. Falls back to "unknown process" if unavailable/denied.
- D-14: The port-conflict check runs **automatically, right before every deploy** (create, update+redeploy, restart) — not a user-triggered button.
- D-15: A conflict with another **Docktor-managed stack** names that stack with a link to its detail page. A conflict with a **non-Docktor process** shows a generic process name/PID message.

### Claude's Discretion
None — every question in the discussion was resolved to a concrete choice.

### Deferred Ideas (OUT OF SCOPE)
- User-authored or plugin-loaded custom compose-check rules — explicitly deferred (conflicts with PROJECT.md's "Plugin system" out-of-scope line). D-12's registry supports easy *built-in* rule additions only.
- `.planning/todos/pending/2026-08-28-configurable-compose-linting.md` — superseded by issue #20 itself; can be closed once #20 ships.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| #18 | Show a diff before applying a compose/.env edit | Diff library selection (`diff`/jsdiff), integration point (`useStackConfigFiles.saveCompose/saveEnv`), merged-dialog UI pattern below |
| #19 | Support git-based stack templates | Git shell-out pattern, new `TemplateRepository`/`TemplateService`, Prisma model design, caching/refresh job pattern below |
| #20 | Warn on dangerous or convention-violating compose configuration | `ComposeAnalyzer` → `Rule` registry refactor plan, integration points (`updateStack`, `FileWatcher`, `deployStack`) below |
| #21 | Detect host port conflicts before deploy | DB-first port-conflict check (`Service.ports` JSON), dockerode/docker-ps fallback, `ss`/`lsof` network-namespace caveat (critical finding) below |
</phase_requirements>

## Summary

This phase adds four independent, non-blocking safety nets on top of the existing compose-edit and deploy pipeline. All four integrate into code that already exists and was read in full this session: `StackService.updateStack()`/`deployStack()`/`restartStack()`/`updateImages()` (server/src/application/stack-service.ts), `ComposeAnalyzer` (server/src/infrastructure/compose-analyzer.ts, currently used only by the brownfield-import flow), `useStackConfigFiles` (client/src/hooks/use-stack-config-files.ts), and `SettingsService`/`Setting` key-value model. None of the four issues requires new client-visible API shapes beyond what's already in `@docktor/shared`'s stack schemas — the main shared-schema work is a new `templates.ts` schema file and an extension of `UpdateStackInput`'s response/error shape to carry findings.

**Critical finding requiring attention before planning #21:** Docktor's own container does **not** run with `network_mode: host` or `pid: host` (confirmed by reading `docker-compose.yml` this session — it only publishes `3000:3000` on the default bridge network and mounts the Docker socket + stacks dir + a read-only `/host` root-fs view). Each Docker container gets its own isolated network namespace with its own socket table [CITED: baeldung.com/linux/docker-network-namespace-invisible]. This means `ss`/`lsof` run **inside** the Docktor container can only see Docktor's own loopback sockets — never another container's bound ports, nor a genuinely host-level (non-Docker) process's bound port. D-13 as literally written ("shelling out to ss/lsof") will silently produce false "no conflict" results for the two cases users most care about, unless the plan layers port-conflict detection correctly (see Common Pitfalls and Open Questions below). The good news: the two most valuable conflict sources are both reachable through mechanisms Docktor already has — (a) Docktor-managed stacks via a DB query against `Service.ports`, (b) any Docker container (including non-Docktor ones) via the existing Docker-socket access (dockerode/`docker ps`). Only the third category (a genuinely non-Docker host process) is where `ss`/`lsof`-in-container falls short, and that's also the rarest/lowest-value case for a Docker-first product.

**Primary recommendation:** Extend `ComposeAnalyzer` into a `Rule[]` registry (one rule per check), wire it into `updateStack()` + `FileWatcher` + pre-deploy; compute diffs with `diff` (jsdiff, already the de facto standard) and render a custom unified-diff component (not `@codemirror/merge`) so D-03's inline warning annotations can be interleaved freely; build port-conflict detection DB-first (Service.ports) + dockerode-second, with `ss`/`lsof` only as a best-effort last resort inside the container (expect it to usually report nothing for non-Docker conflicts — document this limitation rather than promising full host visibility); shell out to a `git` CLI binary (new apt package, no new npm dependency) for template repo cloning, mirroring the existing `execFile`/`spawn` pattern in `docker-executor.ts`/`restic-executor.ts`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Diff computation (#18) | API/Backend | — | Diffing must compare the DB/disk-stored "before" against the submitted "after"; the client never independently holds the pre-edit content once an edit starts (it only has `composeContent`/`envContent`, already mutated) |
| Diff rendering (#18) | Browser/Client | — | Pure presentation; backend returns structured diff/hunks or raw old+new strings, client renders |
| Dangerous-config rule evaluation (#20) | API/Backend | — | Rules operate on parsed YAML (`ComposeAnalyzer`), need to run identically on save AND on FileWatcher-detected external changes AND pre-deploy — must be server-side, not duplicated in the browser |
| Warning display (#20) | Browser/Client | — | `ToneBadge` rendering only; the dialog receives findings from the API response |
| Git template fetch/clone (#19) | API/Backend | — | Needs filesystem + `git` binary access; browser cannot reach git repos directly (CORS/auth) |
| Template browse/search (#19) | Browser/Client | API/Backend | Client renders the grid/search UI; backend serves the parsed+cached template index |
| Template persistence (repo list, pinned version) (#19) | API/Backend | Database/Storage | New `TemplateRepository`-backed Prisma model(s), following the Repository pattern |
| Port-conflict detection, Docktor-stack case (#21) | API/Backend | Database/Storage | Pure DB query against `Service.ports` JSON — no shell-out needed for this case |
| Port-conflict detection, any-container case (#21) | API/Backend | Infrastructure (Docker socket) | dockerode/`docker ps`, already available via existing `DockerExecutorPort`/`dockerodeClient` |
| Port-conflict detection, non-Docker host process case (#21) | Infrastructure | — | `ss`/`lsof` shell-out, constrained by container network-namespace isolation (see Pitfalls) |
| Settings toggles (D-04 skip-diff, D-10 per-check enable) (#18/#20) | API/Backend | Database/Storage | `Setting` key-value model, same pattern as `proxy.*`/`smtp.*`/`backup.*` keys |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `diff` (jsdiff) | ^9.0.0 [VERIFIED: npm registry — `npm view diff version` = 9.0.0, published 2026-04-13] | Computes line-level unified diffs between old/new compose or .env text | 169.8M weekly downloads, no `postinstall` script, repo `github.com/kpdecker/jsdiff`, not deprecated — confirmed via the package-legitimacy gate this session [VERIFIED: npm registry — `gsd-tools query package-legitimacy check` verdict `OK`]. Package *identity/choice* itself is [ASSUMED] per the package-name provenance rule (discovered from training knowledge, not from Context7/official docs) — flag for a lightweight confirm, not a blocking checkpoint, since the legitimacy signals are strong. |

No new client-side diff-rendering library is needed: `diff`'s `diffLines()` output (an array of `{value, added, removed}` chunks) is enough to render a unified +/- view with plain Tailwind classes (green/red background rows), which is also the only way to interleave D-03's per-line warning badges cleanly (a prebuilt diff-viewer component wouldn't expose per-line annotation slots the same way). See Alternatives Considered.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None (shell out to `git` CLI) | — | Shallow-clone/pull git-based template repos | See Architecture Patterns > Pattern 2 — no new npm dependency; matches existing `docker`/`restic` shell-out convention |
| None (shell out to `ss`/`lsof`) | — | Best-effort non-Docker host-process port lookup | Per D-13; expect it to be of limited value inside a non-host-networked container — see Pitfalls |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `diff` + custom React renderer | `@codemirror/merge`'s `unifiedMergeView` [CITED: npmjs.com/package/@codemirror/merge, github.com/codemirror/merge — v6.12.2, "unified view option... can be imported from `@codemirror/merge`"] | Already fits the project's CodeMirror investment (11-09) and renders a GitHub-style unified diff natively, but it's designed as an *editable* merge surface (accept/reject per-chunk), not an annotatable read-only confirm view — threading D-03's inline warning badges into its chunk-decoration API is significantly more code than a plain `diffLines()` + `<div>` list. Reasonable fallback if the planner prefers reusing editor infra over introducing a new dependency. |
| `git` CLI shell-out | `simple-git` (npm, confirmed on registry, v4.0.2) or `isomorphic-git` (v1.42.6) | Both still require (simple-git) or reimplement (isomorphic-git) git operations; neither adds capability the project needs beyond what a raw `execFile("git", [...])` gives, and both are a new dependency to legitimacy-check. Shelling directly to `git` (after adding the `git` apt package) is the more consistent choice given this project's explicit precedent of preferring system CLIs over Node wrapper libraries (`docker`, `restic`). |
| DB-query + dockerode port check | `ss`/`lsof` as the *primary* mechanism (literal D-13 reading) | Fails for the two most common conflict sources inside Docktor's own container (see Critical Finding) — not viable as primary, only as last-resort supplement |

**Installation:**
```bash
# server workspace
yarn workspace @docktor/server add diff

# Dockerfile (final stage apt-get install list) — add:
#   git        (template repo cloning, #19)
#   iproute2   (provides `ss`, #21 — prefer over net-tools' netstat, iproute2 is the
#               current Debian-recommended toolset for socket inspection)
#   lsof       (#21 — explicitly named in D-13 as a fallback to ss)
```

**Version verification:** `npm view diff version` was run this session and returned `9.0.0`, published 2026-04-13T12:39:24Z — confirmed current, not stale training data. `git`/`iproute2`/`lsof` are plain Debian apt packages (no semver pinning needed/possible the way `docker`/`restic` binaries are pinned in the Dockerfile — those get SHA256-verified curl downloads specifically because they're *not* apt packages).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `diff` | npm | long-established (jsdiff is one of the oldest diff libs in the npm ecosystem) | 169,828,395/wk | github.com/kpdecker/jsdiff | OK [VERIFIED: npm registry via `gsd-tools query package-legitimacy check --ecosystem npm diff`] | Approved — package *name/choice* is [ASSUMED] (training knowledge), legitimacy *signals* are [VERIFIED] |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*No other new npm dependencies are required for this phase — git/ss/lsof are OS packages, not npm packages, and are out of scope for the npm legitimacy gate.*

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ BROWSER                                                                │
│                                                                         │
│  ConfigTab (compose/env editors)      CreateStackPage                 │
│       │ Save click                          │ Template picker click   │
│       ▼                                     ▼                         │
│  useStackConfigFiles.saveCompose()     TemplateGrid → fetch template   │
│       │ (holds dirty "after" text)          │                         │
│       ▼                                     ▼                         │
│  [NEW] DiffConfirmDialog ◄──── GET diff+findings preview endpoint      │
│       │ user confirms                                                  │
│       ▼                                                                │
│  PUT /api/stacks/:id  (existing updateStack route)                     │
└───────────────────────────┬─────────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ API / BACKEND (Fastify routes → application services)                 │
│                                                                         │
│  routes/stacks.ts                                                      │
│   ├─ PUT /:id  → StackService.updateStack()                           │
│   │     1. read CURRENT compose/.env from disk (the "before")         │
│   │     2. diffLines(before, after)              ─────┐               │
│   │     3. RuleRegistry.evaluate(parsed after-YAML) ───┼─► findings[]  │
│   │     4. [NEW] if !settings.skipDiffConfirm && diff  │               │
│   │        non-empty: return 2xx "preview" payload      │               │
│   │        instead of writing, until a `confirmed:true` │               │
│   │        flag is sent (D-02/D-04)                     │               │
│   │     5. on confirmed write: fs.writeCompose/Env (existing)          │
│   │                                                                     │
│   ├─ POST /:id/deploy|restart|update → StackService.deployStack() etc. │
│   │     [NEW] pre-flight: RuleRegistry.evaluate() again (D-09)         │
│   │     [NEW] pre-flight: PortConflictChecker.check(requestedPorts)    │
│   │           (D-14) — warns only, never blocks (existing docker.up    │
│   │           call proceeds unconditionally)                          │
│   │                                                                     │
│  jobs/file-watcher.ts                                                  │
│   └─ handleFileChange() [NEW] also runs RuleRegistry.evaluate() and    │
│      records findings for display next time the stack is opened (D-09)│
│                                                                         │
│  [NEW] routes/templates.ts → TemplateService                          │
│   ├─ GET /api/templates           → list cached template index         │
│   ├─ GET /api/templates/:id       → one template's variants/metadata   │
│   ├─ POST /api/template-repos     → add a new git repo URL             │
│   └─ (job) TemplateRepoSync        → periodic `git pull`/re-clone       │
│                                                                         │
│  infrastructure/                                                        │
│   ├─ compose-analyzer.ts  [EXTEND] → Rule interface + RuleRegistry     │
│   ├─ [NEW] port-checker.ts → ss/lsof shell-out (best-effort)           │
│   └─ [NEW] git-executor.ts → git clone/pull shell-out                  │
└───────────────────────────┬─────────────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│ DATA / STORAGE                                                         │
│  Stack/Service tables (Service.ports JSON — queried directly for      │
│    D-15's "another Docktor stack holds this port" case, no shell-out) │
│  Setting table (composeChecks.*, diffConfirm.skip, templates.repos)   │
│  [NEW] TemplateRepo / TemplateVariant Prisma models                   │
│  Filesystem: stacks dir (existing), [NEW] templates cache dir          │
└─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
server/src/
├── infrastructure/
│   ├── compose-analyzer.ts          # EXTEND: becomes a Rule host, not a monolithic analyzer
│   ├── compose-rules/               # NEW — one file per Strategy-pattern rule (D-12)
│   │   ├── rule.ts                  #   Rule interface: {id, severity, configurable, check(doc)}
│   │   ├── privileged-rule.ts       #   always-on, red
│   │   ├── docker-socket-rule.ts    #   always-on, red
│   │   ├── bind-outside-stack-rule.ts  # always-on, red (reuses extractBindMounts)
│   │   ├── named-volume-rule.ts     #   configurable, yellow (reuses extractNamedVolumes)
│   │   ├── inline-env-rule.ts       #   configurable, yellow (reuses extractInlineEnvVars)
│   │   ├── missing-env-file-rule.ts #   configurable, yellow (NEW extraction logic)
│   │   └── registry.ts              #   RuleRegistry: Rule[] + evaluate(doc, enabledChecks)
│   ├── port-checker.ts              # NEW — ss/lsof shell-out (D-13)
│   └── git-executor.ts              # NEW — git clone/pull shell-out (#19)
├── application/
│   ├── stack-service.ts             # EXTEND: updateStack() diff+rules hook, deployStack()/
│   │                                 #   restartStack()/updateImages() port-check hook
│   ├── template-service.ts          # NEW
│   └── ports/
│       ├── port-checker-port.ts     # NEW
│       └── git-executor-port.ts     # NEW
├── repositories/
│   └── template-repository.ts       # NEW
├── jobs/
│   └── template-repo-sync.ts        # NEW — mirrors update-checker.ts's staggered-refresh pattern (D-08)
└── routes/
    └── templates.ts                 # NEW

client/src/
├── components/domain/stack/
│   ├── diff-confirm-dialog.tsx      # NEW — D-03's merged diff+warnings dialog
│   ├── unified-diff-view.tsx        # NEW — pure diff-chunk renderer, reusable for compose/env
│   └── compose-warning-badge.tsx    # NEW — wraps ToneBadge per D-11's red/yellow split
├── components/domain/template/
│   ├── template-grid.tsx            # NEW — D-07's card grid + category filter + search
│   └── template-card.tsx            # NEW
├── hooks/
│   ├── use-stack-config-files.ts    # EXTEND — saveCompose/saveEnv route through diff preview first
│   └── use-templates.ts             # NEW
├── lib/
│   └── templates-api.ts             # NEW
└── routes/app/settings/components/
    └── compose-checks-card.tsx      # NEW — D-10's dedicated settings card
```

### Pattern 1: Strategy-pattern Rule Registry (D-12)

**What:** Each dangerous/convention-violating check is a standalone object implementing a shared interface; a registry holds the full list and filters by `configurable`/enabled-state at evaluation time.

**When to use:** Any new built-in compose check added in the future — one new file + one registration line, per the issue's own stated goal.

**Example (interface shape, inferred from the existing `ComposeAnalyzer` method signatures read this session — `BindMountInfo`/`AnalysisResult` types are real, verbatim from `server/src/infrastructure/compose-analyzer.ts:15-29`):**
```typescript
// server/src/infrastructure/compose-rules/rule.ts
export type RuleSeverity = "blocking-style" | "warning"; // D-11: red vs yellow tone, both warn-only per #20

export interface RuleFinding {
    ruleId: string;
    severity: RuleSeverity;
    message: string;
    serviceName?: string;   // ties a finding to a diff line/section for D-03's "in context" placement
}

export interface Rule {
    readonly id: string;
    readonly severity: RuleSeverity;
    readonly configurable: boolean; // D-10: true = can be disabled via Settings
    check(doc: unknown): RuleFinding[];
}
```

The three always-on (red) rules reuse `ComposeAnalyzer.extractBindMounts()`/its existing `BindMountInfo` shape (verbatim from `server/src/infrastructure/compose-analyzer.ts:15-20`: `interface BindMountInfo { path: string; type: "relative" | "absolute"; serviceName: string; containerPath: string; }`) for the bind-outside-stack check, plus two new rules (`privileged: true`, Docker-socket mount) that are simple doc-walks not currently covered by any extraction method. The three configurable (yellow) rules reuse `extractNamedVolumes()` and `extractInlineEnvVars()` as-is, plus one new rule for "`.env` file exists but no service declares `env_file`" (not currently covered — needs a new check that cross-references the stack's on-disk `.env` presence, which `ComposeAnalyzer.analyzeCompatibility()` doesn't currently receive as input).

### Pattern 2: Git-repo-as-template-source shell-out (#19)

**What:** Clone (shallow, `--depth 1`) or `git pull` the configured template repositories into a local cache directory, then read `templates/<name>/<variant>/` subdirectories for compose+metadata.

**When to use:** `TemplateRepoSync` job (startup + periodic, mirrors `jobs/update-checker.ts`'s existing staggered-check pattern per UPD-02) and on-demand when a user adds a new repo URL.

**Example (shell-out shape, modeled directly on the verified `DockerExecutor.composeExec()` pattern read this session — `server/src/infrastructure/docker-executor.ts:16-24`):**
```typescript
// server/src/infrastructure/git-executor.ts
import {execFile} from "node:child_process";
import {promisify} from "node:util";
const execFileAsync = promisify(execFile);

export class GitExecutor {
    async cloneShallow(repoUrl: string, destDir: string): Promise<void> {
        await execFileAsync("git", ["clone", "--depth", "1", repoUrl, destDir], {
            timeout: 60_000,
        });
    }

    async pull(repoDir: string): Promise<void> {
        await execFileAsync("git", ["-C", repoDir, "pull", "--ff-only"], {
            timeout: 60_000,
        });
    }

    async revParseHead(repoDir: string): Promise<string> {
        const {stdout} = await execFileAsync("git", ["-C", repoDir, "rev-parse", "HEAD"], {
            timeout: 10_000,
        });
        return stdout.trim();
    }
}
```
D-08's "template updated" badge compares the pinned commit SHA stored in the created stack's metadata (at creation time, call `revParseHead()` and store it) against the template repo's current `HEAD` SHA (refreshed by the sync job) — same digest-comparison shape as the existing per-service image-update badge (`UpdateChecker`), just git SHAs instead of image digests.

### Pattern 3: Layered port-conflict detection (#21) — see Critical Finding above

**What:** Three-tier check, cheapest/most-reliable first:
1. **DB query** (no shell-out): `SELECT services WHERE ports contains requestedPort` across all `Service` rows — this is a plain repository method against the already-existing `Service.ports` JSON column (verified verbatim from `server/prisma/schema/service.prisma:11-14`: `// Ports (JSON array of { host: number, container: number, protocol: string })` / `ports String? // JSON`). Produces D-15's "another Docktor-managed stack holds this port, link to its detail page" case directly — join back to `Stack.displayName`/`id`.
2. **dockerode/`docker ps`** (existing socket access, no new binary): for a host port NOT found in Docktor's own DB (e.g. a container the user ran outside Docktor, or a brownfield stack not yet adopted), list all running containers' published ports via the existing `DockerExecutorPort`/`dockerodeClient` — this works regardless of Docktor's own network namespace because it queries the Docker daemon over the socket, not the local network stack.
3. **`ss`/`lsof` shell-out** (per D-13, last resort): only useful for a port bound by a process that is neither a Docktor-tracked service nor any Docker container — and only partially useful even then, because it runs inside Docktor's own isolated network namespace (see Critical Finding/Pitfalls). Implement it anyway as the literal D-13 fallback, but document in-code and in the UI copy that it will typically report "unknown process" for genuine host-level conflicts rather than actually naming the process — this matches D-13's own stated fallback behavior ("Falls back to 'unknown process' if the tool is unavailable or permission is denied") even though the *reason* it falls back will usually be namespace isolation rather than a missing binary or denied permission.

### Anti-Patterns to Avoid
- **Trusting `ss`/`lsof` run inside the Docktor container as a complete host-port picture:** it is not — see Critical Finding. Do not let the "no conflict found" result from steps 1-3 above suppress Docker's own eventual port-bind error; D-21's own acceptance criteria already treats Docker as "the final authority," so the UI copy must never imply the check is exhaustive.
- **Running the dangerous-config rules only at save-time:** D-09 explicitly requires FileWatcher-detected external edits to also be checked — don't wire the registry into `updateStack()` alone.
- **Introducing a plugin-loading mechanism for rules:** explicitly deferred (D-12, PROJECT.md Out-of-Scope "Plugin system"). The registry must stay a hardcoded `Rule[]` array of in-repo classes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Line-level text diffing | A custom LCS/Myers-diff implementation | `diff` (jsdiff) `diffLines()` | Correctness edge cases (trailing newlines, CRLF, empty-file diffs) are exactly what a 169M-download/week library has already hardened against |
| Git repo fetching | A custom HTTP-based tarball/archive downloader against GitHub's API | `git clone --depth 1` via shell-out | GitHub-API-tarball only works for GitHub-hosted repos; D-19's acceptance criteria says "git repositories," not "GitHub repositories" — shelling to `git` supports any git remote (GitLab, self-hosted, etc.) for free |
| Process-holding-a-port lookup | A custom `/proc/net/tcp` parser | `ss`/`lsof` (where their namespace limitations are acceptable) | Parsing `/proc/net/tcp`'s hex-encoded socket table correctly (handling IPv4-mapped IPv6, multiple namespaces) is exactly the kind of fiddly OS-interop code the project's existing shell-out convention (`docker`, `restic`) deliberately avoids reimplementing in Node |

**Key insight:** every "don't hand-roll" item above has a direct, already-adopted precedent in this codebase (`restic` for backup internals, `docker` CLI for container internals) — the pattern for this phase is "add one more battle-tested CLI/library to the shell-out list," not "write new low-level system code."

## Common Pitfalls

### Pitfall 1: `ss`/`lsof` inside the Docktor container cannot see the host's or other containers' sockets

**What goes wrong:** A plan that implements D-13 as "just shell out to `ss -tlnp` or `lsof -i :PORT`" will compile, pass a naive manual test (run it inside the dev container and it reports Docktor's own port 3000), and then silently fail to detect any real-world conflict in production — because the Docktor container runs on the default bridge network (confirmed via `docker-compose.yml` read this session), not `network_mode: host`.
**Why it happens:** Each Docker container gets an isolated network namespace with its own private socket table [CITED: oneuptime.com/blog/post/2026-02-08-how-to-understand-docker-network-namespaces/view; baeldung.com/linux/docker-network-namespace-invisible]. `ss`/`lsof` only ever see sockets in the namespace of the process running them.
**How to avoid:** Layer the check per Architecture Pattern 3 — DB query first (Docktor-managed stacks), dockerode/`docker ps` second (any container, via the socket, namespace-independent), `ss`/`lsof` only as a documented best-effort last resort. Do not claim full host visibility in UI copy or acceptance testing.
**Warning signs:** A manual QA test that only deploys two *Docktor-managed* stacks on the same port will pass even with a naive ss-only implementation (because step 1's DB query would catch it) — the bug only surfaces when a non-Docker process or an un-adopted container holds the port. Test specifically for that case before calling #21 done.

### Pitfall 2: `updateStack()` writes compose/.env to disk before any diff/warning check can run

**What goes wrong:** The existing `updateStack()` (read this session, `server/src/application/stack-service.ts:260-264`) deliberately writes the submitted content to disk *before* attempting to parse it ("YAML-first: the file on disk must reflect exactly what the user submitted, valid or not, so a failed parse below never loses their edit — the write always happens before the parse attempt"). A diff-confirm step inserted naively after this write would always be diffing against content that's already been applied, defeating D-01/D-02/D-03's entire premise (confirm *before* applying).
**Why it happens:** The current write-first ordering exists for a different, already-shipped reason (G-08-6, preserving user edits across parse failures) and long predates this phase.
**How to avoid:** The diff/rule-evaluation step must happen on the *submitted* content BEFORE calling `fs.writeCompose()`/`fs.writeEnv()`, as a new preview phase, with the actual write only happening after an explicit `confirmed: true` signal from the client (second request, or a two-phase single request — the planner should decide the exact request shape, but the sequencing constraint is non-negotiable: diff against disk content, THEN write). The existing write-before-parse behavior for *already-confirmed* writes should stay untouched.
**Warning signs:** If the diff always shows "no changes" or shows a diff against itself, the write happened before the diff was computed.

### Pitfall 3: `ComposeAnalyzer` is currently wired to nothing but the brownfield-import flow

**What goes wrong:** Assuming `ComposeAnalyzer`/its rules are already active on the main stack-edit or deploy paths.
**Why it happens:** Confirmed via repo-wide grep this session — `composeAnalyzer`/`ComposeAnalyzer` only appear in `server/src/infrastructure/compose-analyzer.ts` and `server/src/infrastructure/brownfield-scanner.ts`. `stack-service.ts` and `file-watcher.ts` do not import it at all today.
**How to avoid:** Treat #20's integration into `updateStack()`, `FileWatcher.handleFileChange()`, and the pre-deploy hooks as fully greenfield wiring work, not "turn on a flag."

## Code Examples

### Unified diff computation (server-side, before the write)

```typescript
// Source: diff (jsdiff) README — diffLines API, verified via `npm view diff` this session
import {diffLines} from "diff";

interface DiffHunk {
    value: string;
    added?: boolean;
    removed?: boolean;
}

function computeUnifiedDiff(before: string, after: string): DiffHunk[] {
    return diffLines(before, after);
}
```

### Rule registry evaluation (server-side)

```typescript
// server/src/infrastructure/compose-rules/registry.ts
import type {Rule, RuleFinding} from "./rule.js";

export class RuleRegistry {
    constructor(private readonly rules: Rule[]) {}

    evaluate(doc: unknown, enabledConfigurableIds: Set<string>): RuleFinding[] {
        return this.rules
            .filter((rule) => !rule.configurable || enabledConfigurableIds.has(rule.id))
            .flatMap((rule) => rule.check(doc));
    }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `ComposeAnalyzer` as one monolithic class with fixed extraction methods | Strategy-pattern `Rule[]` registry wrapping the same extraction logic | This phase (D-12) | Existing `extractBindMounts`/`extractNamedVolumes`/`extractInlineEnvVars` methods are preserved and reused by individual rules — not rewritten, just wrapped |

**Deprecated/outdated:** None — this is new functionality, not a migration off something existing.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `diff` (jsdiff) is the right package name/choice for diff computation | Standard Stack | Low — legitimacy signals (169M downloads, no postinstall, long-lived repo) are independently strong even though the name itself came from training knowledge, not Context7/official docs |
| A2 | `git`, `iproute2`, `lsof` are the correct Debian package names to add to the Dockerfile's `apt-get install` list on `node:22-slim` | Standard Stack | Low — these are extremely standard Debian package names; risk is a version/availability surprise on the exact `node:22-slim` base, not a wrong name |
| A3 | Running `ss`/`lsof` inside the Docktor container only sees the container's own network namespace, not the host's or other containers' | Critical Finding, Pitfall 1 | **High if wrong in the other direction** (i.e., if it turns out Docktor's deployment actually does grant broader visibility some other way) — this is based on general Linux/Docker networking semantics [CITED via WebSearch, cross-referenced across 3 independent sources] combined with reading the project's own `docker-compose.yml` (confirmed bridge network, no `network_mode: host`/`pid: host`) — not empirically tested against a live multi-container Docktor deployment in this session. **Recommend a live verification checkpoint during planning or early execution**: deploy two test stacks requesting the same host port from inside an actual Docktor container and confirm `ss -tlnp` run inside it does/doesn't see the second stack's container-bound port. |
| A4 | `Service.ports` JSON is populated reliably enough (for every deployed service) to be the primary data source for Docktor-stack-vs-Docktor-stack port conflict detection | Architecture Pattern 3 | Medium — confirmed the *schema* stores this shape (service.prisma:11-14), but this session did not trace every write path (`replaceServices`, `syncServicesFromCompose`) to confirm `ports` is never left null for a running service; worth a quick repo check during planning |
| A5 | The diff-confirm/warning flow should be a two-phase (preview-then-confirm) extension of the existing `PUT /api/stacks/:id` route rather than a wholly separate preview endpoint | Pitfall 2 | Low-medium — this is an implementation-shape judgment call, not verified against any existing precedent in the codebase (no other route in this project currently does a two-phase preview/confirm); the planner should pick one and the plan-checker should sanity-check it against D-02/D-03's exact requirements |

## Open Questions

1. **Does `ss`/`lsof` need to run via a throwaway `docker run --rm --network host --pid host <image>` to get real host visibility, or is "best-effort, usually reports unknown" an acceptable reading of D-13?**
   - What we know: D-13's text literally says "shelling out to `ss`/`lsof`," with an explicit "falls back to unknown process" clause that already anticipates imperfect results.
   - What's unclear: Whether the user intended that fallback to cover "tool not installed" only, or also "tool can't see what it needs to see from inside this container." A `docker run --net=host --pid=host` helper-container approach would need a new minimal image reference (pinned + checksummed per this project's WR-03 convention for curl-downloaded binaries) and is a materially bigger implementation than a direct in-container shell-out.
   - Recommendation: Surface this explicitly as a planning-time or discuss-phase checkpoint before committing to an implementation approach — don't let the plan silently choose the weaker (in-container) interpretation without the user knowing the tradeoff.

2. **What exact shape does the "preview" response for the diff-confirm dialog take — a new field on the existing `PUT /api/stacks/:id` 200 response, a distinct `428 Precondition Required`-style status, or a separate `POST /api/stacks/:id/preview-update` endpoint?**
   - What we know: The existing route (`server/src/routes/stacks.ts:44-49`) is a single `PUT` with `updateStackSchema` body; `updateStack()` currently always applies immediately.
   - What's unclear: No existing precedent in the codebase for a two-phase preview/confirm HTTP flow (checked `routes/stacks.ts` and `routes/backups.ts` patterns — nothing matches this shape).
   - Recommendation: The planner should pick one shape and the plan-checker should verify it threads a `confirmed: true`/skip-diff-setting check correctly through both the compose and env branches of `updateStack()`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `git` binary (container) | #19 template cloning | ✗ (not in current Dockerfile — confirmed by reading `Dockerfile` final-stage `apt-get install` list this session: only `ca-certificates`, `curl`) | — | Add `git` to the Dockerfile's apt-get install list (plain apt package, no checksum pinning needed) |
| `ss` (iproute2) binary (container) | #21 port-conflict last resort | ✗ (not in current Dockerfile) | — | Add `iproute2` to the Dockerfile's apt-get install list |
| `lsof` binary (container) | #21 port-conflict last resort | ✗ (not in current Dockerfile) | — | Add `lsof` to the Dockerfile's apt-get install list |
| Docker socket access | #21 dockerode-based port check | ✓ (already mounted — `docker-compose.yml`: `/var/run/docker.sock:/var/run/docker.sock`) | — | — |
| `docker compose`/`docker` CLI (container) | existing deploy flow, unaffected by this phase | ✓ (already installed per Dockerfile, pinned docker 27.5.1 / compose 2.33.1) | 27.5.1 / 2.33.1 | — |
| Host network namespace visibility (container) | #21 true host-process port detection | ✗ — architecturally absent (bridge network, no `network_mode: host`) | — | DB query + dockerode cover the two highest-value cases (see Critical Finding); no in-scope fallback exists for the pure non-Docker-host-process case other than accepting the documented limitation |

**Missing dependencies with no fallback:**
- Full host-level (non-Docker) port-conflict visibility from inside the Docktor container — see Open Question 1. This is a structural limitation of the current deployment architecture (DooD without host networking), not a missing package.

**Missing dependencies with fallback:**
- `git`, `iproute2`, `lsof` binaries — all resolved by one `apt-get install` line each in the Dockerfile; no architectural blocker, just needs adding.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (server: `vitest@^4.0.18`; client: same via workspace, confirmed in `server/package.json`/`client/package.json` scripts this session) + Playwright (client E2E) |
| Config file | `server/vitest.config.ts` / `client/vitest.config.ts` (existing, not read in full this session — assume present per `yarn workspace @docktor/server test:unit` script) |
| Quick run command | `yarn workspace @docktor/server test:unit` / `yarn workspace @docktor/client test:unit` |
| Full suite command | `yarn test` (root) — chains `yarn workspace @docktor/shared build` first per the existing script, confirmed in both workspaces' `package.json` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| #18 | Diff computed correctly for compose/.env before/after pairs | unit | `vitest run server/test/unit/infrastructure/diff-*.test.ts` | ❌ Wave 0 |
| #18 | Save is blocked without explicit confirm; first-stack-creation save skips diff (D-02) | unit (application) | `vitest run server/test/unit/application/stack-service.test.ts` (extend existing file, confirmed present) | ✅ extend existing |
| #19 | Git clone/pull succeeds against a real or fixture repo; malformed template rejected with clear error | integration | new `server/test/integration/template-service.test.ts` | ❌ Wave 0 |
| #19 | Template version pinned at stack creation, unaffected by later repo updates | unit | new test file for `template-service.ts` | ❌ Wave 0 |
| #20 | Each rule (`privileged`, socket-mount, bind-outside-stack, named-volume, inline-env, missing-env_file) fires correctly on fixture compose content | unit | `vitest run server/test/unit/infrastructure/compose-analyzer.test.ts` (extend existing file, confirmed present) + new per-rule test files | ✅/❌ mixed — extend existing file for reused extraction logic, Wave 0 for the two genuinely new rules (privileged, socket-mount, missing-env_file) |
| #20 | Checks run on save AND on FileWatcher-detected change AND pre-deploy (D-09) | integration | existing `server/test/integration/` suite pattern (real DB, per CLAUDE.md's integration-test rule) | ❌ Wave 0 — no existing file-watcher+rules integration test |
| #21 | DB-query port-conflict detection finds another Docktor stack on the same port | unit | new `server/test/unit/application/port-conflict-checker.test.ts` | ❌ Wave 0 |
| #21 | dockerode-based check finds a non-Docktor container on the same port | unit (mocked dockerode) | new test file, following existing `DockerExecutorPort` mocking pattern (see `stack-service.test.ts`'s existing `docker` mock) | ❌ Wave 0 |
| #21 | Deploy proceeds even when a conflict is found (warn-only, D-13/D-21's "never block") | unit | extend `stack-service.test.ts` | ✅ extend existing |

### Sampling Rate
- **Per task commit:** `yarn workspace @docktor/server test:unit` (and `@docktor/client test:unit` for client-side diff/template UI work)
- **Per wave merge:** `yarn test` (root, full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `server/test/unit/infrastructure/compose-rules/` — new directory, one test file per new rule (privileged, docker-socket, missing-env_file); the three reused rules (bind-outside-stack, named-volume, inline-env) can extend the existing `compose-analyzer.test.ts`
- [ ] `server/test/unit/infrastructure/diff-service.test.ts` (or wherever diff computation lands) — covers #18
- [ ] `server/test/unit/application/port-conflict-checker.test.ts` — covers #21's DB-query and dockerode tiers
- [ ] `server/test/integration/template-service.test.ts` — covers #19's git-clone + template-schema-validation acceptance criteria (needs a real or fixture git repo — consider a local bare repo created in `beforeAll` rather than hitting `github.com/docktor-app/templates` over the network in CI)
- [ ] `server/test/integration/file-watcher-rules.test.ts` — covers D-09's "checks also run on FileWatcher-detected changes" requirement, which has no existing coverage shape to extend

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Unaffected — all new routes sit behind the existing `requireAuth` preHandler pattern already used by `routes/stacks.ts` |
| V3 Session Management | no | Unaffected |
| V4 Access Control | yes | New template routes and settings-card endpoints must attach `requireAuth`, matching every existing `/api/stacks/*` route read this session |
| V5 Input Validation | yes | New Zod schemas required in `@docktor/shared` for: template-repo-URL input (must validate as a plausible git URL, not just any string — mitigates SSRF-via-git-protocol-handler risk below), per-check enable/disable settings payload, diff-confirm's `confirmed: true` flag |
| V6 Cryptography | no | No new secrets introduced by this phase (template repo URLs are not credentials; git auth for private template repos is explicitly out of scope per issue #19's acceptance criteria, which only mentions public git repos) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| User-supplied template-repo URL used as `git clone` argument — a crafted URL using the `ext::`/`file://`/local-path git transport could read arbitrary files on the Docktor host or execute arbitrary commands via git's `ext::` transport helper | Tampering / Elevation of Privilege | Validate the repo URL against an allowlist of transport schemes (`https://`, `git://`, `ssh://` with a known-host check) before passing to `execFile("git", ["clone", ...])`; reject `file://`/`ext::`/anything starting with `-` (which `git clone` could otherwise interpret as a flag — a classic argument-injection vector). `execFile` (not `exec`/`spawn` with `shell: true`) already avoids shell-metacharacter injection, matching the project's existing pattern, but does **not** protect against git's own `ext::`-transport command execution or option-injection via a URL starting with `-`. |
| A malicious/compromised template's compose YAML is rendered directly into the create-stack flow, potentially containing `privileged: true`/socket mounts that the dangerous-config warnings (#20) would normally catch — but only if the create-stack flow actually routes the template's content through the same Rule registry | Tampering | Ensure the template-to-create-stack path calls the same `RuleRegistry.evaluate()` used by `updateStack()`/pre-deploy, not a bypass — D-09's "both on edit-apply and before deploy" intent should extend to "stack created from template" too, even though CONTEXT.md doesn't explicitly call this out |
| A compose file requesting a host port the attacker knows is used by a sensitive non-Docker host service, deployed before the port-conflict warning can meaningfully inform the user because `ss`/`lsof` can't see that service (Critical Finding) | Information Disclosure (indirect — port-stealing rather than exfiltration) | Out of this phase's ability to fully mitigate given the architecture; the warn-only/non-blocking stance already matches the issue's explicit scope ("Docker's own behavior is the final authority") |

## Sources

### Primary (HIGH confidence)
- `server/src/infrastructure/compose-analyzer.ts` (read in full this session) — current `ComposeAnalyzer`/`BindMountInfo`/`AnalysisResult` shapes
- `server/src/application/stack-service.ts` (read `updateStack()`, `deployStack()`, `restartStack()`, `updateImages()` in full this session) — exact integration points, lines 257-545
- `server/prisma/schema/service.prisma`, `server/prisma/schema/setting.prisma` (read in full) — `Service.ports` JSON shape, `Setting` key-value model
- `docker-compose.yml` (read in full) — confirmed no `network_mode: host`/`pid: host`, Docker socket + stacks dir + read-only `/host` bind mounts
- `Dockerfile` (read final-stage apt-get list in full) — confirmed `git`/`iproute2`/`lsof` are absent
- `server/src/infrastructure/docker-executor.ts`, `server/src/infrastructure/restic-executor.ts` (read in full) — the shell-out convention (`execFile`+`promisify` vs `spawn` for streaming) to replicate for git/ss/lsof
- `server/src/application/settings-service.ts` (read partial, lines 1-135) — the `<domain>.<key>` dotted Setting-key naming convention
- `server/src/repositories/index.ts`, `server/src/application/index.ts` (read in full) — composition-root/singleton-export pattern for new repositories/services
- `client/src/hooks/use-stack-config-files.ts`, `client/src/routes/app/stacks/components/config-tab.tsx`, `client/src/routes/app/stacks/create.tsx` (read in full) — client-side save/create flow integration points
- `shared/src/validation/stacks.ts` (read in full) — existing Zod schema conventions to follow for new template/settings schemas
- `gh issue view 18/19/20/21 --repo docktor-app/docktor --json body` (fetched this session) — full acceptance criteria and "Notes" sections, verbatim

### Secondary (MEDIUM confidence)
- [npmjs.com/package/@codemirror/merge, github.com/codemirror/merge](https://www.npmjs.com/package/@codemirror/merge) — `unifiedMergeView` API existence and shape, cross-referenced across 2 sources via WebSearch [CITED]
- [baeldung.com/linux/docker-network-namespace-invisible](https://www.baeldung.com/linux/docker-network-namespace-invisible), [oneuptime.com/blog/post/2026-02-08-how-to-understand-docker-network-namespaces/view](https://oneuptime.com/blog/post/2026-02-08-how-to-understand-docker-network-namespaces/view) — Docker network-namespace isolation semantics, cross-referenced across 2 independent sources via WebSearch [CITED]
- [linuxize.com/post/ss-command-in-linux](https://linuxize.com/post/ss-command-in-linux/) — `ss -tlnp` flag semantics [CITED]

### Tertiary (LOW confidence)
- `diff` (jsdiff) as the specific recommended package name — [ASSUMED] per the package-name provenance rule (training knowledge), though its legitimacy signals were independently [VERIFIED] via the package-legitimacy gate tool this session
- `simple-git`/`isomorphic-git` version numbers (4.0.2/1.42.6) — from a direct `npm view` run this session [VERIFIED: npm registry], but these packages are NOT recommended for use (see Alternatives Considered) — included only for the planner's awareness that they were considered and rejected

## Metadata

**Confidence breakdown:**
- Standard stack (diff library): HIGH — `diff` package's legitimacy was tool-verified this session; its selection as "the" diff library is a reasonable, low-risk choice given 169M weekly downloads
- Architecture (integration points into `stack-service.ts`/`compose-analyzer.ts`/`file-watcher.ts`): HIGH — every integration point cited was read in full this session with exact line numbers
- Port-conflict detection architecture: MEDIUM — the DB-query and dockerode tiers are HIGH confidence (based on verified schema/existing socket access), but the `ss`/`lsof` network-namespace limitation (A3) is based on general networking knowledge cross-referenced via WebSearch, not empirically tested against a live Docktor deployment — flagged as a pre-plan/pre-execution verification checkpoint
- Git-template-fetch architecture: MEDIUM — the shell-out pattern itself is HIGH confidence (directly modeled on verified existing code), but the exact caching/refresh job design (D-08's "updated" badge) is a reasonable inference from the existing `UpdateChecker` pattern, not a locked decision in CONTEXT.md
- Pitfalls: HIGH — Pitfall 1 (network namespace) and Pitfall 2 (write-before-diff ordering) are both grounded in code/config read in full this session

**Research date:** 2026-10-01
**Valid until:** 30 days (stable domain — no fast-moving dependencies; the one time-sensitive fact, `diff`'s current version, was tool-verified on this date)
