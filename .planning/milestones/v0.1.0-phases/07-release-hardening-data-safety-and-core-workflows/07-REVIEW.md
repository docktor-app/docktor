---
phase: 07-release-hardening-data-safety-and-core-workflows
reviewed: 2026-09-13T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - server/src/lib/stacks-dir.ts
  - server/src/index.ts
  - server/test/unit/lib/stacks-dir.test.ts
  - docs/deployment.md
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-09-13T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the stacks-directory persistence/mount-verification hardening (`stacks-dir.ts`), its wiring into server startup (`index.ts`), its unit tests, and the accompanying deployment documentation. The overall design is careful — path-traversal defense-in-depth in `getStackPath()` correctly includes the path separator in its prefix check (a common bypass class is avoided), the mountinfo parser tolerates malformed lines, and the fail-open/fail-closed decisions are well reasoned and documented. No critical/security-severity defects were found in this slice.

Two warnings were found: a tie-breaking bug in the mount-entry matcher that can select a stale mount-stack entry instead of the currently active one, and a deviation from the project's mandated typed-error hierarchy (`lib/errors.ts`) in favor of raw `Error` throws, which is most consequential in `getStackPath()` since that function is also reachable during normal request handling, not just at boot. Two info-level documentation/message-clarity issues are also noted.

## Warnings

### WR-01: `findMountEntryForPath` tie-break keeps the first entry, not the last, when two mount entries share the same mount point

**File:** `server/src/lib/stacks-dir.ts:161`
**Issue:**

```js
if (!best || mountPoint.length > best.mountPoint.length) {
    best = {mountPoint, filesystemType};
}
```

`/proc/self/mountinfo` lists mounts in the order they were established. It is a well-documented Linux behaviour (not merely a theoretical edge case) that the *same* mount point path can appear more than once in the file when a filesystem is mounted on top of an already-mounted directory (mount stacking / shadow mounts, which can occur via bind-mount churn during container lifecycle events). When that happens, the *last* matching entry in the file is the one that is actually effective for path resolution — the earlier entry is shadowed.

The current comparison uses strict `>`, so when two entries have mount points of identical length (the stacking case — mount point strings are literally identical), the *first* one encountered wins, because the second one's length is not strictly greater. This means `assertStacksDirIsMounted()` can read the filesystem type of a shadowed, no-longer-effective mount instead of the currently active one, and get the ephemeral/persistent judgment backwards in either direction (a real bind mount is judged ephemeral because a superseded overlay/tmpfs entry from earlier in the boot sequence is still on record, or vice versa).

The docstring's own stated assumption — "every path ... is covered by exactly one mount namespace entry" — does not hold for this exact scenario, which is the one case the assumption needs to hold for.

**Fix:**

```js
if (!best || mountPoint.length >= best.mountPoint.length) {
    best = {mountPoint, filesystemType};
}
```

Changing `>` to `>=` makes a later entry in iteration order win ties, matching "last mount wins" semantics for stacked mounts at an identical path. Add a regression test with two fixture lines sharing an identical mount point but different filesystem types, asserting the *second* (later) entry's type is returned.

### WR-02: Raw `Error` thrown instead of the project's typed error hierarchy

**File:** `server/src/lib/stacks-dir.ts:37, 56-58, 101-103, 263-265`
**Issue:** CLAUDE.md's Error Handling section is explicit: "Throw typed errors from the custom hierarchy — **never** throw raw `Error` in business code," listing `AppError`/`NotFoundError`/`ConflictError`/`BadRequestError` from `lib/errors.ts`. All four throw sites in this file (`ensureStacksDir`, `getStackPath`, `assertStacksDirMatchesHost`, `assertStacksDirIsMounted`) throw plain `new Error(...)`.

For the three startup-only assertions this is low-impact in practice, since `index.ts` catches them before any Fastify app exists and exits the process directly (never routed through the global error handler). But `getStackPath()` (and its callers `getComposePath()`/`getEnvPath()`) is a general-purpose utility that is plausibly invoked from `application/`/`repositories/` code during normal request handling whenever a stack's file paths are computed — not only at boot. If a malformed id ever reaches this function during a request (e.g. a corrupted DB record bypassing `slugify()`), the raw `Error` bypasses `app.ts`'s `AppError`-aware global error handler and its documented HTTP-status mapping, producing an inconsistent/uncategorized error response instead of the project's standard error contract.

**Fix:** Extend `lib/errors.ts` with (or reuse) an appropriate typed error (e.g. `BadRequestError` for `getStackPath`'s traversal guard, or a dedicated `AppError` subclass for the two startup-time misconfiguration checks), and throw that instead of `new Error(...)`, preserving the message and `cause` where applicable:

```ts
throw new BadRequestError(
    `Stack id "${id}" resolves outside the managed stacks directory...`,
);
```

## Info

### IN-01: Misleading error message when `getStackPath` is called with an empty id

**File:** `server/src/lib/stacks-dir.ts:52-61`
**Issue:** `path.join(stacksDir, "")` returns `stacksDir` itself (no trailing separator), so `getStackPath("")` fails the `resolved.startsWith(stacksDir + path.sep)` check and throws "resolves outside the managed stacks directory ... (`{stacksDir}` is not under `{stacksDir}`)" — a confusing message since the two paths printed are identical, and the actual problem (empty/missing id) is not stated.
**Fix:** Add an explicit guard before the join: `if (!id) { throw new BadRequestError("Stack id must not be empty"); }` (or the project's chosen typed error, per WR-02) so the failure mode is named accurately.

### IN-02: Documented default for `DOCKTOR_STACKS_DIR` doesn't match the code's actual fallback

**File:** `docs/deployment.md:130`, cross-referenced against `server/src/lib/stacks-dir.ts:8`
**Issue:** The environment variable table states the default for `DOCKTOR_STACKS_DIR` is `/opt/docktor/stacks (image default)`, but `getStacksDir()`'s actual code-level fallback when the env var is entirely unset is `path.resolve("./stacks")` — a relative path resolved against the process's current working directory. The table's "(image default)" qualifier hints at this distinction but doesn't make it explicit that running the server outside the shipped Docker image (e.g. `yarn workspace @docktor/server dev` locally without the env var set) resolves to `<cwd>/stacks`, not `/opt/docktor/stacks`.
**Fix:** Add a one-line clarification in the table cell or a footnote: "Application code itself falls back to `./stacks` (relative to CWD) if unset; the shipped Docker image always sets this explicitly to `/opt/docktor/stacks` via `docker-compose.yml`."

---

_Reviewed: 2026-09-13T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
