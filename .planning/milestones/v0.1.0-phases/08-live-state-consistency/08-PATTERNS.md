# Phase 8: Live State Consistency - Pattern Map

**Mapped:** 2026-09-13
**Files analyzed:** 2 (1 modified, 1 new)
**Analogs found:** 2 / 2

## Scope Note

Per RESEARCH.md, this phase is almost entirely a verification phase — two of the three scoped
todos are already fully implemented (SSE broadcast wiring, config-error/config-changed handling).
The only actual code artifacts are:

1. A one-line CSS fix in an existing file (`stack-status-badge.tsx`)
2. A brand-new unit test file for that component (`stack-status-badge.test.tsx`)

No new components, services, routes, or backend files are created. There is nothing to classify
beyond these two files — the remaining phase work (6 human-judgment verification items) produces
no diffable source files and therefore has no pattern-mapping need.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `client/src/components/domain/stack/stack-status-badge.tsx` | component | transform (derived render, no fetch) | *(itself — modify in place, no analog needed)* | n/a — editing existing file |
| `client/test/unit/components/domain/stack/stack-status-badge.test.tsx` | test | transform (render assertions) | `client/test/unit/components/domain/stack/cert-status-badge.test.tsx` | exact (same directory, same domain, same "status string → badge" component shape, sibling in `components/domain/stack/`) |

## Pattern Assignments

### `client/src/components/domain/stack/stack-status-badge.tsx` (component, transform)

**Current full contents** (`client/src/components/domain/stack/stack-status-badge.tsx:1-43`) — this
is the file to edit directly; no analog substitution needed since it's a one-line addition to an
existing map, not a new file:

```typescript
import {Badge} from "@/components/ui/badge";

const statusConfig: Record<
    string,
    {label: string; variant: "default" | "secondary" | "destructive" | "outline"}
> = {
    DRAFT: {label: "Draft", variant: "secondary"},
    DEPLOYING: {label: "Deploying", variant: "default"},
    RUNNING: {label: "Running", variant: "default"},
    HEALTHY: {label: "Healthy", variant: "default"},
    UNHEALTHY: {label: "Unhealthy", variant: "destructive"},
    STOPPED: {label: "Stopped", variant: "secondary"},
    ERROR: {label: "Error", variant: "destructive"},
    UPDATING: {label: "Updating", variant: "default"},
    BACKING_UP: {label: "Backing Up", variant: "outline"},
    RESTORING: {label: "Restoring", variant: "outline"},
    MIGRATING: {label: "Migrating", variant: "outline"},
};

const statusColors: Record<string, string> = {
    RUNNING: "bg-green-500/15 text-green-700 border-green-500/25",
    HEALTHY: "bg-green-500/15 text-green-700 border-green-500/25",
    ERROR: "bg-red-500/15 text-red-700 border-red-500/25",
    UNHEALTHY: "bg-red-500/15 text-red-700 border-red-500/25",
    DEPLOYING: "bg-blue-500/15 text-blue-700 border-blue-500/25 animate-pulse",
    UPDATING: "bg-blue-500/15 text-blue-700 border-blue-500/25 animate-pulse",
    STOPPED: "bg-gray-500/15 text-gray-700 border-gray-500/25",
    DRAFT: "bg-gray-500/15 text-gray-700 border-gray-500/25",
    // BACKING_UP / RESTORING / MIGRATING absent → falls through to "" (no color, no motion)
};

export function StackStatusBadge({status}: Readonly<{status: string}>) {
    const config = statusConfig[status] ?? {
        label: status,
        variant: "outline" as const,
    };
    const colorClass = statusColors[status] ?? "";

    return (
        <Badge variant={config.variant} className={colorClass}>
            {config.label}
        </Badge>
    );
}
```

**Required change** (per UI-SPEC, locked, CSS-class-only — do not touch `statusConfig` or the
component body): add three entries to `statusColors`:

```typescript
    BACKING_UP: "animate-pulse",
    RESTORING: "animate-pulse",
    MIGRATING: "animate-pulse",
```

These three statuses keep their existing `outline` variant from `statusConfig` (no color change,
no variant change) — `animate-pulse` alone is applied via `className`, matching how `DEPLOYING`/
`UPDATING` combine a `variant` with a `className` color string. Do not add background/text/border
color classes to these three entries — that would visually promote them to the blue "action"
bucket, which UI-SPEC explicitly reserves for `DEPLOYING`/`UPDATING` only.

---

### `client/test/unit/components/domain/stack/stack-status-badge.test.tsx` (test, transform) — NEW FILE

**Analog:** `client/test/unit/components/domain/stack/cert-status-badge.test.tsx` (full file, 50
lines, read above) — same directory, same "presentational status-string-to-badge component"
shape, no mocks/fixtures needed, one `describe` block with one `it` per status/edge-case.

**Imports pattern** (analog lines 1-3):
```typescript
import {describe, expect, it} from "vitest";
import {render, screen} from "@testing-library/react";
import {StackStatusBadge} from "@/components/domain/stack/stack-status-badge";
```

**Core pattern — one render + text assertion per status** (analog lines 5-16, adapt to `status`
prop and `screen.getByText(config.label)`):
```typescript
describe("StackStatusBadge", () => {
    it("renders the Running label for RUNNING", () => {
        render(<StackStatusBadge status="RUNNING" />);
        expect(screen.getByText("Running")).toBeInTheDocument();
    });

    // ...one such it() per statusConfig key: DRAFT, DEPLOYING, RUNNING, HEALTHY,
    // UNHEALTHY, STOPPED, ERROR, UPDATING, BACKING_UP, RESTORING, MIGRATING
});
```

**Motion-cue assertion pattern (the actual regression lock for this phase's fix)** — analog has no
direct equivalent for a CSS class assertion on the Badge itself, but the cert-status-badge test's
`messageEl.className).toContain("font-mono")` (analog line 42) is the pattern to copy for asserting
a specific class is present on the rendered element:
```typescript
    it("applies animate-pulse to BACKING_UP without changing its color", () => {
        render(<StackStatusBadge status="BACKING_UP" />);
        const badge = screen.getByText("Backing Up");
        expect(badge.className).toContain("animate-pulse");
        expect(badge.className).not.toContain("bg-blue-500");
    });

    // mirror for RESTORING ("Restoring") and MIGRATING ("Migrating")

    it("keeps DEPLOYING and UPDATING blue and pulsing (regression lock)", () => {
        render(<StackStatusBadge status="DEPLOYING" />);
        const badge = screen.getByText("Deploying");
        expect(badge.className).toContain("animate-pulse");
        expect(badge.className).toContain("bg-blue-500");
    });
```

**Unknown-status fallback pattern** (analog lines 18-22, `'renders "Cert pending" for an unknown
status'` — mirror for the badge's own fallback path):
```typescript
    it("renders the raw status string for an unrecognized status", () => {
        render(<StackStatusBadge status="SOME_FUTURE_STATUS" />);
        expect(screen.getByText("SOME_FUTURE_STATUS")).toBeInTheDocument();
    });
```

**No error-handling or validation pattern needed** — this is a pure presentational component with
no async lifecycle, no props validation beyond the `status: string` type, and no try/catch. The
`CertStatusBadge` analog's "does not render a message block" test (analog lines 45-49) has no
equivalent here since `StackStatusBadge` has no conditional sub-tree — every status renders exactly
one `<Badge>`.

---

## Shared Patterns

### Presentational status-badge testing convention
**Source:** `client/test/unit/components/domain/stack/cert-status-badge.test.tsx`
**Apply to:** `stack-status-badge.test.tsx`
- One `describe` block per component, one `it` per distinct status/edge case, plain-language test
  titles starting with "renders"/"applies"/"keeps".
- No mocking, no fixtures, no `beforeEach` — `render()` + `screen.getByText()` per case is
  sufficient because the component has zero external dependencies (no hooks, no API calls).
- Use `element.className.toContain(...)`/`.not.toContain(...)` to assert Tailwind utility classes
  are present/absent, rather than snapshotting the full class string (keeps tests resilient to
  unrelated class reordering).

### Single-source-of-truth status maps
**Source:** `client/src/components/domain/stack/stack-status-badge.tsx:3-29`
**Apply to:** Any future edit to this file
- `statusConfig` (label + shadcn `variant`) and `statusColors` (Tailwind override classes) are two
  separate, independently-keyed `Record<string, ...>` maps. A status can appear in one, both, or
  neither (falls back to `variant: "outline"` / `colorClass: ""`). Do not merge them into one
  object — the existing split is what this phase's fix extends, and the planner/executor should
  preserve it.

## No Analog Found

None — both files in scope have a suitable analog (the component is edited in place; the new test
file's analog is `cert-status-badge.test.tsx`).

## Metadata

**Analog search scope:** `client/src/components/domain/stack/`, `client/test/unit/components/domain/stack/`
**Files scanned:** `stack-status-badge.tsx`, `cert-status-badge.tsx`, `cert-status-badge.test.tsx`
**Pattern extraction date:** 2026-09-13
