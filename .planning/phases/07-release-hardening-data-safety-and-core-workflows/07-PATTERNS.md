# Phase 7: Release Hardening: Data Safety and Core Workflows - Pattern Map

**Mapped:** 2026-09-12
**Files analyzed:** 3 (all modifications to existing files — no wholly new files this phase)
**Analogs found:** 3 / 3 (all analogs are sibling functions in the same files being modified)

## Scope Note

Per `07-RESEARCH.md`, Bug 1 is fully implemented already and dropped from scope. The
entire remaining phase scope is Bug 2: a mount-point verification check. There are
no new files — `isMountPoint()` (or equivalently named function) is added to an
*existing* module, wired into an *existing* boot sequence, and tested in an
*existing* test file. Consequently every "analog" below is a sibling
function/block in the very file being edited, which is the strongest possible
match quality available.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `server/src/lib/stacks-dir.ts` (add `isMountPoint()`/`assertStacksDirIsMounted()`) | utility (lib) | file-I/O (read-only OS introspection) | `assertStacksDirMatchesHost()` in the same file (lines 68-102) | exact — same module, same "fail-loud boot-time assertion reading external state" role |
| `server/src/index.ts` (wire new check into boot try/catch) | config / boot-sequence | request-response N/A — one-shot startup sequencing | the existing `try { assertStacksDirMatchesHost(); await ensureStacksDir(); } catch { console.error(err); process.exit(1) }` block (lines 11-17) | exact — literally the same block, extended |
| `server/test/unit/lib/stacks-dir.test.ts` (add cases for new function) | test | CRUD-adjacent (unit test of a pure/file-read function) | `describe("assertStacksDirMatchesHost", ...)` block (lines 78-122) and `describe("ensureStacksDir", ...)` block (lines 124-176) in the same file | exact — same file, same `describe`-per-function convention |

## Pattern Assignments

### `server/src/lib/stacks-dir.ts` — new `isMountPoint()` / `assertStacksDirIsMounted()`

**Analog:** `assertStacksDirMatchesHost()`, same file, lines 68-102

**Imports pattern** (lines 1-2, already present — extend, don't duplicate):
```typescript
import {mkdir} from "node:fs/promises";
import path from "node:path";
```
The new function needs `readFile` too — add it to the existing `node:fs/promises` import rather than a second import statement:
```typescript
import {mkdir, readFile} from "node:fs/promises";
```

**Doc-comment convention** (copy the style exactly — long, operator-facing,
explains *why* the check exists and what happens if it's wrong, matches
`ensureStacksDir()` lines 8-28 and `assertStacksDirMatchesHost()` lines 68-84):
```typescript
/**
 * Verifies that the resolved stacks directory is a real mount point (a bind
 * mount, tmpfs, or otherwise distinct filesystem attached at that exact
 * path) rather than a plain directory materialized by ensureStacksDir()'s
 * mkdir inside this container's own writable overlay layer. A real mount
 * survives container recreation, image updates, and host reboots; a
 * plain overlay-layer directory does not — it is silently discarded the
 * next time the container is recreated, and every stack written into it up
 * to that point is lost with no prior error.
 *
 * Detection reads /proc/self/mountinfo (kernel-documented, man 5 proc) and
 * checks whether the resolved path appears verbatim as its own mount-point
 * entry (field 5). This is the only reliable signal — st.dev comparison
 * (the classic Unix mountpoint idiom) has a documented false-negative class
 * for same-filesystem bind mounts, and a marker-file approach is circular
 * (the marker itself would be lost in exactly the failure case it exists to
 * detect).
 */
```

**Core pattern — fail-loud check reading external state, same shape as
`assertStacksDirMatchesHost()`** (lines 85-102 analog structure: resolve
inputs → early-return/warn for the "cannot verify" case → compare → throw
descriptive `Error` on mismatch):
```typescript
// Source: server/src/lib/stacks-dir.ts:85-102 (assertStacksDirMatchesHost), read this session
export function assertStacksDirMatchesHost(): void {
    const hostDir = process.env.DOCKTOR_STACKS_HOST_DIR;
    const containerDir = getStacksDir();

    if (!hostDir) {
        console.warn(
            `[stacks-dir] DOCKTOR_STACKS_HOST_DIR is not set — cannot verify ...`,
        );
        return;
    }

    const normalizedHostDir = path.resolve(hostDir);
    if (normalizedHostDir !== containerDir) {
        throw new Error(
            `Stacks directory path mismatch: ... Fix docker-compose.yml so ...`,
        );
    }
}
```
Copy this exact shape for the new function: resolve the target path via
`getStacksDir()` (do not re-derive it), read `/proc/self/mountinfo`, and
throw a single long `Error` (not a custom `AppError` subclass — this runs
pre-`buildApp()`, before Fastify exists, matching `ensureStacksDir()`'s own
plain-`Error`-with-`cause` convention at lines 33-38) naming the resolved
path and pointing at `DOCKTOR_STACKS_HOST_DIR`/the compose volume line, e.g.:
```typescript
export async function isMountPoint(targetPath: string): Promise<boolean> {
    const resolved = path.resolve(targetPath);
    const content = await readFile("/proc/self/mountinfo", "utf-8");
    for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        const fields = line.split(" ");
        const mountPoint = unescapeMountinfoField(fields[4] ?? "");
        if (mountPoint === resolved) return true;
    }
    return false;
}

function unescapeMountinfoField(field: string): string {
    return field.replace(/\\([0-7]{3})/g, (_, oct: string) =>
        String.fromCharCode(parseInt(oct, 8)),
    );
}

export async function assertStacksDirIsMounted(): Promise<void> {
    const target = getStacksDir();
    const mounted = await isMountPoint(target);
    if (!mounted) {
        throw new Error(
            `Stacks directory at "${target}" is not a real mount point — it was created as a plain directory inside this container's own writable layer and its contents will be silently lost on the next container recreation, image update, or host reboot. Check that the stacks volume in docker-compose.yml (driven by DOCKTOR_STACKS_HOST_DIR) is actually mounted at this path.`,
        );
    }
}
```
`[VERIFIED shape: server/src/lib/stacks-dir.ts:85-102, read this session]` — the
research's illustrative snippet in `07-RESEARCH.md` (`## Code Examples`) has
correct field-splitting logic; the pattern-mapper's job is to confirm the
*style* (naming, error message tone, export shape) matches
`assertStacksDirMatchesHost()`, which it does when written this way.

**Escape hatch (optional, per research's Open Question 1)** — if the planner
decides not-a-mount-point should warn-and-continue rather than hard-fail in
non-DooD deployments, copy `assertStacksDirMatchesHost()`'s exact
warn-and-return branch shape (lines 89-94) rather than inventing a new style.

### `server/src/index.ts` — wire the new check into boot sequence

**Analog:** the existing try/catch block itself, lines 11-17

**Core pattern** (copy verbatim, only add one line — do not restructure the
block, do not add a second try/catch):
```typescript
// Source: server/src/index.ts:11-17, read this session
try {
    assertStacksDirMatchesHost();
    await ensureStacksDir();
} catch (err) {
    console.error(err);
    process.exit(1);
}
```
Becomes:
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
**Import pattern** (line 2, extend the existing named-import list, do not add
a second import from the same module):
```typescript
import {assertStacksDirMatchesHost, ensureStacksDir} from "./lib/stacks-dir.js";
```
becomes
```typescript
import {assertStacksDirIsMounted, assertStacksDirMatchesHost, ensureStacksDir} from "./lib/stacks-dir.js";
```
Update the file's leading comment block (lines 5-10) to mention the new
step, following the existing convention of explaining *why* the ordering
matters (this codebase always documents boot-sequence ordering rationale
inline, e.g. lines 9-10's "Order matters: ...").

### `server/test/unit/lib/stacks-dir.test.ts` — new test cases

**Analog:** the `describe("assertStacksDirMatchesHost", ...)` block, lines
78-122, and the `describe("ensureStacksDir", ...)` block, lines 124-176

**Imports pattern** (lines 1-12 — extend the existing named-import list from
`../../../src/lib/stacks-dir.js`, do not add a second import statement):
```typescript
import {
    assertStacksDirMatchesHost,
    ensureStacksDir,
    getComposePath,
    getEnvPath,
    getStackPath,
    getStacksDir,
} from "../../../src/lib/stacks-dir.js";
```
Add `isMountPoint` (and `assertStacksDirIsMounted` if exported) to this list.

**Fixture-file pattern** (reuse the existing `mkdtemp`/`tempRoots` harness,
lines 15-24 and the `ensureStacksDir` describe block's per-test `mkdtemp`
calls, e.g. lines 125-136) — since `isMountPoint()` reads a real file path
argument rather than a hardcoded `/proc/self/mountinfo`, the test should
either (a) mock `node:fs/promises`'s `readFile` for the `/proc/self/mountinfo`
call specifically, keeping the real `mkdtemp`/`stat` calls used elsewhere in
the file untouched, or (b) parameterize the function to accept the mountinfo
path as an optional second argument for testability, matching this
codebase's general preference for pure, argument-driven functions over
global mocking. Prefer (a) since it requires no production-code API change:
```typescript
// Pattern: mock only the specific fs/promises export under test, following
// this file's existing vi.spyOn(console, "warn") convention at line 116
vi.spyOn(fsPromises, "readFile").mockResolvedValue(
    "660 25 0:55 / /opt/docktor/stacks rw,relatime shared:123 - ext4 /dev/sdb1 rw\n",
);
```

**Test structure pattern** (copy the assert-throws idiom from
`assertStacksDirMatchesHost`'s "throws mentioning both ... paths" test, lines
97-111 — capture the thrown error into a variable rather than using
`.toThrow(/regex/)` when asserting on multiple substrings):
```typescript
// Source: server/test/unit/lib/stacks-dir.test.ts:97-111, read this session
it("throws mentioning both the host and container paths when they differ", () => {
    process.env.DOCKTOR_STACKS_DIR = "/opt/docktor/stacks";
    process.env.DOCKTOR_STACKS_HOST_DIR = "/opt/docktor/stacks-old";

    let thrown: Error | undefined;
    try {
        assertStacksDirMatchesHost();
    } catch (err) {
        thrown = err as Error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown?.message).toContain(path.resolve("/opt/docktor/stacks-old"));
    expect(thrown?.message).toContain(path.resolve("/opt/docktor/stacks"));
});
```
Use this exact idiom for the "throws naming the resolved path when not
mounted" case on the new function.

**Cleanup pattern** (the file's single shared `afterEach`, lines 17-24 —
add any new env vars this feature introduces, e.g. an escape-hatch var, to
the existing `delete process.env.X` list rather than adding a second
`afterEach`):
```typescript
afterEach(async () => {
    delete process.env.DOCKTOR_STACKS_DIR;
    delete process.env.DOCKTOR_STACKS_HOST_DIR;
    vi.restoreAllMocks();
    await Promise.all(
        tempRoots.splice(0).map((root) => rm(root, {recursive: true, force: true})),
    );
});
```

**Required new cases** (per RESEARCH.md's Wave 0 Gaps):
1. `isMountPoint()` returns `true` when the resolved path matches a
   `mountinfo` fixture line's field-5 mount point exactly.
2. `isMountPoint()` returns `false` when no fixture line matches.
3. `isMountPoint()` correctly un-escapes an octal-escaped path (e.g.
   `\040` for a space) before comparing.
4. (boot-wiring test, if the planner chooses to add one) — since `index.ts`
   itself has no existing test file (confirmed in research), do not add one;
   follow the established precedent of manual verification for boot-sequence
   wiring, consistent with how `assertStacksDirMatchesHost()`/
   `ensureStacksDir()`'s wiring into `index.ts` was also left untested.

---

## Shared Patterns

### Fail-loud boot-time assertion style
**Source:** `server/src/lib/stacks-dir.ts` — `ensureStacksDir()` (lines 29-40)
and `assertStacksDirMatchesHost()` (lines 85-102)
**Apply to:** the new `assertStacksDirIsMounted()` function and its call
site in `index.ts`
```typescript
// Plain Error (not a custom AppError subclass) with a long, operator-facing,
// actionable message naming the resolved path and the env var to check.
// Thrown synchronously/rejected from an async fn; caught by index.ts's
// top-level try/catch which logs via console.error and calls process.exit(1).
// No Fastify/AppError hierarchy involved — this runs before buildApp().
```

### Doc-comment convention for "why this exists" functions
**Source:** `server/src/lib/stacks-dir.ts` lines 8-28 and 68-84
**Apply to:** the new function — every non-trivial function in this file has
a JSDoc block explaining the failure mode it prevents and why a naive reader
might think it's redundant. Follow this exactly; do not skip the doc comment.

### Test-file `describe`-per-function structure with shared `afterEach`
**Source:** `server/test/unit/lib/stacks-dir.test.ts` lines 14-24 (shared
setup/teardown) and one `describe` block per exported function (lines 26,
40, 62, 70, 78, 124)
**Apply to:** add a new `describe("isMountPoint", ...)` (and
`describe("assertStacksDirIsMounted", ...)` if that wrapper is added) block
following the same numbering/placement convention (after `ensureStacksDir`,
since it depends on `ensureStacksDir` having already resolved the path).

## No Analog Found

None — this phase's entire scope is additive to three existing files, and
every added function/block has a directly adjacent sibling of the same role
and data flow in the same file.

## Metadata

**Analog search scope:** `server/src/lib/stacks-dir.ts`, `server/src/index.ts`,
`server/test/unit/lib/stacks-dir.test.ts` (all three files fully read this
session; no broader codebase search was needed since the phase is scoped to
in-place edits of three known files with obvious sibling patterns already
present in each).
**Files scanned:** 3
**Pattern extraction date:** 2026-09-12
