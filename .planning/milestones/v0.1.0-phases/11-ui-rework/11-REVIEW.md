---
phase: 11-ui-rework
reviewed: 2026-09-30T11:19:34Z
depth: standard
files_reviewed: 121
files_reviewed_list:
  - CLAUDE.md
  - client/index.html
  - client/package.json
  - client/playwright.config.ts
  - client/src/components/common/code-editor.tsx
  - client/src/components/common/layout/page.tsx
  - client/src/components/common/layout/section.tsx
  - client/src/components/common/stat-card.tsx
  - client/src/components/common/status-dot.tsx
  - client/src/components/common/themed-toaster.tsx
  - client/src/components/common/theme-provider.tsx
  - client/src/components/common/theme-toggle.tsx
  - client/src/components/common/tone-badge.tsx
  - client/src/components/common/unsaved-changes-guard.tsx
  - client/src/components/domain/auth/first-run-gate.tsx
  - client/src/components/domain/auth/protected-route.tsx
  - client/src/components/domain/backup/backup-status-badge.tsx
  - client/src/components/domain/backup/backup-trigger-badge.tsx
  - client/src/components/domain/notification/notification-type-badge.tsx
  - client/src/components/domain/stack/cert-status-badge.tsx
  - client/src/components/domain/stack/compatibility-badge.tsx
  - client/src/components/domain/stack/compose-editor.tsx
  - client/src/components/domain/stack/env-editor.tsx
  - client/src/components/domain/stack/log-connection-status.tsx
  - client/src/components/domain/stack/log-terminal.tsx
  - client/src/components/domain/stack/log-viewer.tsx
  - client/src/components/domain/stack/service-status-badge.tsx
  - client/src/components/domain/stack/service-update-badge.tsx
  - client/src/components/domain/stack/stack-list.tsx
  - client/src/components/domain/stack/stack-status-badge.tsx
  - client/src/components/domain/stack/stack-update-badge.tsx
  - client/src/hooks/use-backup-defaults.ts
  - client/src/hooks/use-backup-detail.ts
  - client/src/hooks/use-backup-history.ts
  - client/src/hooks/use-stack-config-files.ts
  - client/src/hooks/use-stack-proxy.ts
  - client/src/hooks/use-stacks.ts
  - client/src/hooks/use-stack-timeline.ts
  - client/src/lib/backup-format.ts
  - client/src/lib/dashboard-stats.ts
  - client/src/lib/env-file.ts
  - client/src/lib/service-color.ts
  - client/src/lib/service-ports.ts
  - client/src/lib/stack-event-description.ts
  - client/src/lib/stacks-api.ts
  - client/src/lib/stack-tabs.ts
  - client/src/lib/yaml-syntax-linter.ts
  - client/src/main.tsx
  - client/src/router.tsx
  - client/src/routes/app/dashboard/components/dashboard-stat-cards.tsx
  - client/src/routes/app/dashboard.tsx
  - client/src/routes/app/settings/components/backup-defaults-card.tsx
  - client/src/routes/app/settings/components/backup-repository-card.tsx
  - client/src/routes/app/settings/components/certificates-card.tsx
  - client/src/routes/app/settings/components/general-settings-card.tsx
  - client/src/routes/app/settings/components/notification-log-card.tsx
  - client/src/routes/app/settings/components/notification-triggers-card.tsx
  - client/src/routes/app/settings/components/smtp-card.tsx
  - client/src/routes/app/settings/components/timezone-combobox.tsx
  - client/src/routes/app/settings.tsx
  - client/src/routes/app/stacks/backups/[backupId].tsx
  - client/src/routes/app/stacks/backups/components/backup-detail-header.tsx
  - client/src/routes/app/stacks/backups/components/backup-metadata.tsx
  - client/src/routes/app/stacks/components/activity-timeline.tsx
  - client/src/routes/app/stacks/components/backup-config-summary.tsx
  - client/src/routes/app/stacks/components/backup-history.tsx
  - client/src/routes/app/stacks/components/backup-schedule-dialog.tsx
  - client/src/routes/app/stacks/components/backups-tab.tsx
  - client/src/routes/app/stacks/components/config-tab.tsx
  - client/src/routes/app/stacks/components/overview-tab.tsx
  - client/src/routes/app/stacks/components/proxy-assign-dialog.tsx
  - client/src/routes/app/stacks/components/proxy-domains-table.tsx
  - client/src/routes/app/stacks/components/proxy-tab.tsx
  - client/src/routes/app/stacks/components/services-section.tsx
  - client/src/routes/app/stacks/components/stack-alerts.tsx
  - client/src/routes/app/stacks/components/stack-detail-header.tsx
  - client/src/routes/app/stacks/components/stack-page-state.tsx
  - client/src/routes/app/stacks/create.tsx
  - client/src/routes/app/stacks/[id].tsx
  - client/src/routes/setup/components/migration-wizard.tsx
  - client/src/routes/setup/components/wizard-stepper.tsx
  - client/test/integration/auth.spec.ts
  - client/test/integration/backups.spec.ts
  - client/test/integration/config-unsaved-changes.spec.ts
  - client/test/integration/mobile.spec.ts
  - client/test/integration/proxy.spec.ts
  - client/test/integration/setup-wizard.spec.ts
  - client/test/integration/stacks.spec.ts
  - client/test/integration/theme.spec.ts
  - client/test/setup.ts
  - client/test/unit/components/common/code-editor.test.tsx
  - client/test/unit/components/common/page-header.test.tsx
  - client/test/unit/components/common/stat-card.test.tsx
  - client/test/unit/components/common/status-dot.test.tsx
  - client/test/unit/components/common/theme-provider.test.tsx
  - client/test/unit/components/common/theme-toggle.test.tsx
  - client/test/unit/components/common/tone-badge.test.tsx
  - client/test/unit/components/common/unsaved-changes-guard.test.tsx
  - client/test/unit/components/domain/notification/notification-type-badge.test.tsx
  - client/test/unit/components/domain/stack/env-editor.test.tsx
  - client/test/unit/components/domain/stack/log-terminal.test.tsx
  - client/test/unit/components/domain/stack/service-status-badge.test.tsx
  - client/test/unit/components/domain/stack/service-update-badge.test.tsx
  - client/test/unit/components/domain/stack/stack-list.test.tsx
  - client/test/unit/components/domain/stack/stack-status-badge.test.tsx
  - client/test/unit/components/domain/stack/stack-update-badge.test.tsx
  - client/test/unit/components/log-viewer.test.tsx
  - client/test/unit/hooks/use-backup-defaults.test.ts
  - client/test/unit/hooks/use-backup-history.test.ts
  - client/test/unit/hooks/use-stack-config-files.test.ts
  - client/test/unit/hooks/use-stacks.test.ts
  - client/test/unit/hooks/use-stack-timeline.test.ts
  - client/test/unit/lib/backup-format.test.ts
  - client/test/unit/lib/dashboard-stats.test.ts
  - client/test/unit/lib/env-file.test.ts
  - client/test/unit/lib/service-color.test.ts
  - client/test/unit/lib/service-ports.test.ts
  - client/test/unit/lib/stack-event-description.test.ts
  - client/test/unit/lib/stack-tabs.test.ts
  - client/test/unit/lib/yaml-syntax-linter.test.ts
  - client/test/unit/routes/proxy-tab.test.tsx
  - client/test/unit/routes/settings/settings-page.test.tsx
  - client/test/unit/routes/stacks/activity-timeline.test.tsx
  - client/test/unit/routes/stacks/backup-config-summary.test.tsx
  - client/test/unit/routes/stacks/backup-detail-page.test.tsx
  - client/test/unit/routes/stacks/backup-history.test.tsx
  - client/test/unit/routes/stacks/backup-schedule-dialog.test.tsx
  - client/test/unit/routes/stacks/config-tab.test.tsx
  - client/test/unit/routes/stacks/proxy-assign-dialog.test.tsx
  - client/test/unit/routes/stacks/services-section.test.tsx
  - client/test/unit/routes/stacks/stack-detail-header.test.tsx
  - client/test/unit/routes/stacks/stack-detail-page.test.tsx
  - .planning/phases/11-ui-rework/deferred-items.md
  - .planning/todos/completed/2026-08-28-add-yaml-env-editor.md
  - .planning/todos/completed/2026-08-28-frontend-refactor-audit.md
  - .planning/todos/completed/2026-08-28-redesign-dashboard-statistics.md
  - .planning/todos/completed/2026-08-28-redesign-ui-ux-service-colors-mobile.md
  - .planning/todos/completed/2026-08-28-update-available-badge-missing-at-stack-level.md
  - .planning/todos/completed/2026-08-28-update-badge-shown-with-null-latest-tag.md
  - server/src/application/stack-service.ts
  - server/test/integration/stacks.test.ts
  - server/test/unit/application/stack-service.test.ts
  - shared/src/validation/stacks.ts
  - yarn.lock
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-09-30T11:19:34Z
**Depth:** standard
**Files Reviewed:** 121 (of which ~90 carry reviewable source/test code; the remainder are markdown, config, or lock files reviewed for context only)
**Status:** issues_found

## Summary

This phase is a large, well-documented client-side rework (ToneBadge/StatusDot unification, dark mode, dashboard stat cards, unified activity timeline, dialog-based proxy/backup config, shared LogTerminal, CodeMirror compose/env editors, data-router migration + unsaved-changes guard, settings.tsx decomposition) plus one narrow server change (`StackService.listStacks()` enrichment via `withServiceUpdateInfo`). The engineering discipline is unusually high for a UI-rework phase: extensive inline rationale comments, deliberate defaults on ambiguous states, careful effect-guarding against stale/cancelled fetches, and thorough unit test coverage for the tricky pure-logic modules (`env-file.ts`, `stack-tabs.ts`, `dashboard-stats.ts`, `stack-service.ts`'s new batching helper).

No Critical/security-relevant defects were found. The issues below are real but scoped: one UI data-correctness bug (grouped proxy domains show only the first row's port), a controlled-input edge case that can leave a settings field displaying a value it didn't actually save, a missing project-convention (`Readonly<Props>`) violation, an explicit `any` in a catch clause, and a shared-schema gap that lets the env-editor's table silently create duplicate variable keys. The rest are minor consistency/style notes.

## Warnings

### WR-01: Grouped proxy domains table shows only the first domain's internal port

**File:** `client/src/routes/app/stacks/components/proxy-domains-table.tsx:61`
**Issue:** `internalPort` is a per-`ProxyConfig` field (`shared/src/validation/proxy.ts`'s `assignDomainSchema.internalPort`), not a per-service field — two domains assigned to the same service can legitimately target two different internal ports (e.g. an admin UI on 8080 and the main app on 80, each proxied under its own domain). `ProxyDomainsTable` groups rows by `serviceName` and renders every other per-domain field (Domains, TLS, Certificate, Source, actions) as a list parallel to the domain rows — but the "Internal Port" cell renders `rows[0].internalPort` only:
```tsx
<TableCell>{rows[0].internalPort}</TableCell>
```
When a service has multiple domains on different ports, every row after the first silently displays the wrong port.
**Fix:** Render the Internal Port cell the same way as the other per-domain columns — a `flex flex-col gap-1` list mapped over `rows`, one value per domain:
```tsx
<TableCell>
    <div className="flex flex-col gap-1">
        {rows.map((row) => (
            <span key={row.id}>{row.internalPort}</span>
        ))}
    </div>
</TableCell>
```

### WR-02: Disk-threshold number inputs can display a value that was never saved

**File:** `client/src/routes/app/settings/components/notification-triggers-card.tsx:156-164` (percent) and `:173-179` (bytes)
**Issue:** Both inputs are controlled by React state, and the `onChange` handler only calls the setter when the parsed value passes a range check:
```tsx
onChange={(e) => {
    const val = Number(e.target.value);
    if (val >= 1 && val <= 99) {
        setDiskThresholdPercent(val);
    }
}}
```
When the typed value is momentarily or permanently out of range (e.g. the field is cleared to type a new number, or the user types `100`), the setter is skipped, so React never re-renders and never resyncs the DOM node's `value` back to the last valid state. The `<input>` keeps showing whatever the user actually typed (e.g. `100` or an empty string) while the component's real state — and whatever gets persisted `onBlur` via `handleThresholdUpdate` — is the last value that *did* pass the guard. The toast then reports "Threshold updated" for a value that doesn't match what's on screen, and the field stays visually wrong until an unrelated re-render (e.g. toggling the switch) forces React to resync it.
**Fix:** Always update the state (so React stays in sync with the DOM) and clamp only at the point of use (submit/blur), or clamp inline but always call the setter with the clamped value so the controlled input is always resynced:
```tsx
onChange={(e) => {
    const val = Number(e.target.value);
    if (Number.isNaN(val)) return;
    setDiskThresholdPercent(Math.min(99, Math.max(1, val)));
}}
```

### WR-03: `EnvEditor` table mode allows silent duplicate variable keys

**File:** `client/src/components/domain/stack/env-editor.tsx` (see `handleAddVariable`/`clientEnvRowSchema`, all around lines 34-136); root cause in `shared/src/validation/stacks.ts:59-69` (`envVariableRowSchema`/`envTableFormSchema`)
**Issue:** Each row's `key` is validated independently (non-empty, matches `ENV_VARIABLE_KEY_PATTERN`), but there is no cross-row uniqueness check anywhere in the schema or in `EnvEditor`. A user can add two rows both named e.g. `DATABASE_URL` with different values; the form reports `isValid: true`, the Save button is enabled, and `applyTableRows` (`client/src/lib/env-file.ts`) happily serializes both lines into the `.env` file. The resulting file silently has two definitions for the same key — most `.env`/shell consumers take the *last* one, so the value the user sees in the first row is quietly discarded on save with no warning anywhere in the UI.
**Fix:** Add a `superRefine` on `envTableFormSchema` (shared) that flags duplicate `key`s within `variables`, and surface the resulting per-row error in `EnvEditor` the same way `keyError` is already rendered today.

### WR-04: `LogViewer` props not wrapped in `Readonly<...>`, breaking the project's stated convention

**File:** `client/src/components/domain/stack/log-viewer.tsx:10-16`
**Issue:** CLAUDE.md states: "Component props interfaces must be named `<ComponentName>Props` and use `Readonly<Props>` in function signatures." Every other component touched in this phase (including `LogTerminal`, `LogConnectionStatus`, `ComposeEditor`, `EnvEditor`, all the badge components) follows this; `LogViewer` is the one exception:
```tsx
interface LogViewerProps {
    stackId: string
    serviceNames?: string[]
    initialService?: string
}
export function LogViewer({stackId, serviceNames = [], initialService}: LogViewerProps) {
```
**Fix:** `export function LogViewer({...}: Readonly<LogViewerProps>) { ... }`.

### WR-05: `catch (err: any)` in `create.tsx` violates the project's explicit "no `any`" rule

**File:** `client/src/routes/app/stacks/create.tsx:47`
**Issue:** CLAUDE.md: "No `any` — use `unknown` and narrow the type, or model the type properly." Every other new-in-phase-11 error handler in this file list (`use-stack-config-files.ts`, `certificates-card.tsx`, `backup-schedule-dialog.tsx`, `proxy-assign-dialog.tsx`, etc.) correctly narrows `unknown`; `create.tsx`'s submit handler is the odd one out:
```tsx
} catch (err: any) {
    setError(err.message ?? "Failed to create stack");
    setLoading(false);
}
```
This also means a non-`Error` throw (or a value with no `.message`) is accessed unsafely with no type-level protection.
**Fix:**
```tsx
} catch (err: unknown) {
    setError(err instanceof Error ? err.message : "Failed to create stack");
    setLoading(false);
}
```

## Info

### IN-01: Invalid Tailwind utility class produces a no-op skeleton width

**File:** `client/src/routes/app/settings/components/notification-triggers-card.tsx:125`
**Issue:** `<Skeleton className="h-4 w-68" />` — `w-68` is not a class Tailwind v4's default spacing scale generates (the scale jumps 64 → 72), so this utility compiles to nothing and the skeleton falls back to its default/auto width, inconsistent with the two sibling skeletons in the same loading block (`w-48`, `w-64`, `w-40`, `w-72`, `w-44`).
**Fix:** Use a generated width, e.g. `w-64` or `w-72`, to match sibling skeleton widths.

### IN-02: Fragile substring-matching used to route a 400 error to a form field

**File:** `client/src/routes/app/settings/components/general-settings-card.tsx:47-57`
**Issue:** Unlike the newer dialog-based forms in this phase (`BackupScheduleDialog`, `ProxyAssignDialog`), which route field errors via a structured `ApiError.fields` map, `GeneralSettingsCard` guesses the offending field by lower-casing and substring-matching the server's free-text error message (`msg.toLowerCase().includes("instance name")`, `.includes("url")`, `.includes("timezone")`). This is workable only because `updateGeneralSettingsSchema` on the server doesn't currently emit per-field Zod errors for this endpoint; if the wording of a thrown message ever changes, the field-level error silently stops appearing (it still surfaces via the generic `errors.general` catch-all, so this is not user-blocking, just fragile).
**Fix:** Prefer having the server surface a structured field name (or reuse `ApiError.fields`) rather than string-sniffing prose; not blocking, but worth tracking as tech debt.

### IN-03: Backup detail breadcrumb shows the raw stack id instead of its display name

**File:** `client/src/routes/app/stacks/backups/[backupId].tsx:52`
**Issue:** `<BackupDetailHeader stackId={id} stackLabel={backup.stackId} .../>` passes the stack's slug/id (`backup.stackId`, e.g. `my-nextcloud-1`) as the human-facing breadcrumb label, rather than the stack's `displayName`. Every other breadcrumb in the app (stack detail, proxy dialog links, etc.) shows the friendly display name. `BackupRecord` doesn't currently carry the stack's display name, so this may be a deliberate trade-off to avoid an extra fetch — but there's no comment recording that decision the way most other trade-offs in this phase are documented.
**Fix:** Either fetch/include the stack's `displayName` on the backup record, or add a comment explaining why the id is shown deliberately.

### IN-04: Formatting inconsistency (no semicolons / 2-space indent) in a subset of phase-11 files

**File:** e.g. `client/src/hooks/use-stack-proxy.ts`, `client/src/routes/app/stacks/components/proxy-tab.tsx`, `client/src/routes/app/stacks/components/proxy-assign-dialog.tsx`, `client/src/routes/app/stacks/components/backup-schedule-dialog.tsx`, `client/src/components/domain/stack/log-viewer.tsx`, `client/src/routes/setup/components/migration-wizard.tsx`, `client/src/routes/setup/components/wizard-stepper.tsx`
**Issue:** The large majority of the codebase (and most files in this same phase) uses semicolons and 4-space indentation consistently. The files above omit statement-terminating semicolons and/or use 2-space indentation, which stands out as inconsistent within the same phase's diff. There's no repo-level Prettier/ESLint config enforcing one style, so this doesn't break anything, but it reduces diff/readability consistency.
**Fix:** Normalize to the project's dominant style (semicolons, 4-space indent) the next time these files are touched; consider adding a Prettier config to make this automatic going forward.

---

_Reviewed: 2026-09-30T11:19:34Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
