---
phase: 08-live-state-consistency
reviewed: 2026-09-14T08:43:26Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - client/src/components/domain/stack/stack-status-badge.tsx
  - client/test/unit/components/domain/stack/stack-status-badge.test.tsx
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-09-14T08:43:26Z
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Reviewed the two files that make up plan 08-01's actual diff: `stack-status-badge.tsx` (three lines added — `animate-pulse` for `BACKING_UP`/`RESTORING`/`MIGRATING`) and its wholly-new test file (24 assertions). Cross-checked the implementation against the 08-UI-SPEC.md "Color contract" table and against the server's Prisma `StackStatus` enum (`server/prisma/schema/stack.prisma`): the added class strings match the spec verbatim, and `statusConfig`/`statusColors` cover all 11 enum values with no missing or stray keys. Verified by running the actual test suite (24/24 pass) and `tsc --noEmit` (clean) rather than trusting the commit message's claims. Also traced `cn()` → `twMerge(clsx(...))` and `Badge`'s `cva` variant classes to confirm the maintenance states genuinely stay in the gray/outline bucket rather than being silently promoted to the blue "action" bucket by class-merge order — this is exactly what the new tests exist to lock down, and the merge behavior is correct.

No functional/security defects found in the delivered diff. The one substantive finding is a pre-existing type-safety gap in this file that this phase's own change is a concrete instance of the risk class it exposes: nothing in the type system would have caught a forgotten status if the author had missed adding `BACKING_UP`/`RESTORING`/`MIGRATING` to `statusColors` (as the existing gap this phase fixed demonstrates already happened once). Two minor quality/DRY notes are included as Info.

## Warnings

### WR-01: `statusConfig`/`statusColors` are typed `Record<string, ...>` instead of `Record<StackStatus, ...>` — no compile-time exhaustiveness against the domain enum

**File:** `client/src/components/domain/stack/stack-status-badge.tsx:1-39`
**Issue:** `status` is typed as a bare `string` (line 34), and both lookup maps are `Record<string, ...>`. This means:
- If the server's `StackStatus` Prisma enum (`server/prisma/schema/stack.prisma:59-70`) ever gains a new value, `tsc --noEmit` will report **zero** errors here even though the new status would silently render as a raw uppercase label with `outline` variant and no color/motion (via the `?? {label: status, variant: "outline"}` fallback on line 35-38). The only thing preventing a regression today is a human remembering to update this file in lockstep with the schema.
- This is not hypothetical: the gap this very phase fixed (`BACKING_UP`/`RESTORING`/`MIGRATING` missing from `statusColors`, per `08-UI-SPEC.md:140`) is precisely the failure mode this typing allows — the values existed in `statusConfig` and in the Prisma enum for a full release before anyone caught the missing pulse treatment, and the compiler had no way to flag it.
- CLAUDE.md's TypeScript Standards call for Prisma-generated types to be the source of truth for DB shapes and explicitly discourage manual re-declarations that can drift from them; a raw `string` prop here is the loosest possible variant of that anti-pattern.

**Fix:** Type the prop and both maps against a status union so the compiler enforces exhaustiveness. Since this is a client-side file that can't import the server's Prisma-generated enum, define (or import from `@docktor/shared` if a schema exists/could be added there) a local union and use `satisfies Record<StackStatus, ...>` so a missing key is a compile error, not a silent runtime fallback:
```typescript
type StackStatus =
    | "DRAFT" | "DEPLOYING" | "RUNNING" | "HEALTHY" | "UNHEALTHY"
    | "STOPPED" | "ERROR" | "UPDATING" | "BACKING_UP" | "RESTORING" | "MIGRATING";

const statusConfig = {
    DRAFT: {label: "Draft", variant: "secondary"},
    // ...
} satisfies Record<StackStatus, {label: string; variant: "default" | "secondary" | "destructive" | "outline"}>;

const statusColors = {
    // ...
} satisfies Partial<Record<StackStatus, string>>;

export function StackStatusBadge({status}: Readonly<{status: StackStatus | (string & {})}>) {
```
(The `string & {}` union on the prop preserves graceful handling of truly unknown/future values coming over the wire from `stacks-api.ts`'s `status: string`, while `satisfies Record<StackStatus, ...>` still forces every *known* enum value to be handled at compile time.)

## Info

### IN-01: Repeated literal color-class strings across sibling enum keys

**File:** `client/src/components/domain/stack/stack-status-badge.tsx:20-32`
**Issue:** The exact same class string is duplicated verbatim for sibling states: `RUNNING`/`HEALTHY` (green, line 21-22), `ERROR`/`UNHEALTHY` (red, line 23-24), `DEPLOYING`/`UPDATING` (blue+pulse, line 25-26), `STOPPED`/`DRAFT` (gray, line 27-28), and `BACKING_UP`/`RESTORING`/`MIGRATING` (pulse-only, line 29-31). If one copy is edited (e.g. to adjust the green shade) without updating its sibling, the two states drift apart silently — there's no test asserting they stay identical.
**Fix:** Extract named constants and reference them from both keys, e.g.:
```typescript
const GREEN = "bg-green-500/15 text-green-700 border-green-500/25";
const RED = "bg-red-500/15 text-red-700 border-red-500/25";
const BLUE_PULSE = "bg-blue-500/15 text-blue-700 border-blue-500/25 animate-pulse";
const GRAY = "bg-gray-500/15 text-gray-700 border-gray-500/25";
const PULSE_ONLY = "animate-pulse";

const statusColors: Record<string, string> = {
    RUNNING: GREEN,
    HEALTHY: GREEN,
    ERROR: RED,
    UNHEALTHY: RED,
    DEPLOYING: BLUE_PULSE,
    UPDATING: BLUE_PULSE,
    STOPPED: GRAY,
    DRAFT: GRAY,
    BACKING_UP: PULSE_ONLY,
    RESTORING: PULSE_ONLY,
    MIGRATING: PULSE_ONLY,
};
```

### IN-02: Test file doesn't assert `data-variant` for the `secondary` group

**File:** `client/test/unit/components/domain/stack/stack-status-badge.test.tsx:95-103`
**Issue:** The suite asserts `data-variant` for the `default` (DEPLOYING/UPDATING), `destructive` (ERROR/UNHEALTHY), and `outline` (BACKING_UP/RESTORING/MIGRATING) groups, but the `STOPPED`/`DRAFT` block (which should resolve to `secondary` per `statusConfig`) only checks color/motion, not `data-variant`. This leaves the `secondary` variant mapping unverified by the test suite.
**Fix:**
```typescript
it.each([
    ["STOPPED", "Stopped"],
    ["DRAFT", "Draft"],
])("renders %s gray with no motion", (status, label) => {
    render(<StackStatusBadge status={status} />);
    const badge = screen.getByText(label);
    expect(badge.className).toContain("bg-gray-500/15");
    expect(badge.className).not.toContain("animate-pulse");
    expect(badge).toHaveAttribute("data-variant", "secondary");
});
```

---

_Reviewed: 2026-09-14T08:43:26Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
