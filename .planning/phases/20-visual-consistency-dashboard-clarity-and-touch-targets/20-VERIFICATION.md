---
phase: 20-visual-consistency-dashboard-clarity-and-touch-targets
verified: 2026-10-21T00:00:00Z
status: human_needed
score: 6/6 roadmap success criteria verified statically
covered_files:
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-01-PLAN.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-01-SUMMARY.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-02-PLAN.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-02-SUMMARY.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-03-PLAN.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-03-SUMMARY.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-04-PLAN.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-04-SUMMARY.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-05-PLAN.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-05-SUMMARY.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-06-PLAN.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-06-SUMMARY.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-07-PLAN.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-07-SUMMARY.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-08-PLAN.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-08-SUMMARY.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-09-PLAN.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-09-SUMMARY.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-10-PLAN.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-10-SUMMARY.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-11-PLAN.md"
  - ".planning/phases/20-visual-consistency-dashboard-clarity-and-touch-targets/20-11-SUMMARY.md"
  - "client/src/components/common/data/table/table-content.tsx"
  - "client/src/components/common/data/table/table-pagination.tsx"
  - "client/src/components/common/form-layout.tsx"
  - "client/src/components/common/stat-card.tsx"
  - "client/src/components/domain/stack/stack-breadcrumb.tsx"
  - "client/src/hooks/use-stacks.ts"
  - "client/src/index.css"
  - "client/src/lib/dashboard-stats.ts"
  - "client/src/lib/status-labels.ts"
  - "client/src/lib/touch-target.ts"
  - "client/src/routes/app/dashboard/components/dashboard-stat-cards.tsx"
  - "client/src/routes/app/stacks/components/stack-tab-bar.tsx"
  - "client/test/integration/mobile.spec.ts"
  - "client/test/integration/visual-consistency.spec.ts"
  - "server/src/application/stack-service.ts"
  - "server/src/repositories/backup-repository.ts"
covered_digest: "v3:sha256:61aec31ced8c9f96243679a314aed4ab1792b2ce02bfd83eab70a1552a2ac9ad"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Run the two Phase 20 Playwright specs in CI (chromium and mobile-chromium): client/test/integration/visual-consistency.spec.ts and the '44px touch targets (A11Y-01)' block in mobile.spec.ts"
    expected: "All pass. They are the only runtime proof of: lowercase status on the dashboard, list, header and services table; no third-party font host and Geist Mono computed on a KPI; no tab-bar scrollbar at 1280/768/375; table frame border/tint in light and dark; 44px targets below md vs 32/36px at md and up"
    why_human: "Plan 20-11 SUMMARY states the specs were only collected (--list), never executed. CSS-dependent promises (max-md:size-11, scrollbar-width, font loading, dark-mode border) cannot be proven by grep or jsdom, and this verification was forbidden from running a browser"
  - test: "Run typecheck (tsc --build), the full client and server unit suites, and the integration suite in GitHub Actions"
    expected: "Green. Only single-file vitest runs were done here (status-labels 40, font-token 5, dashboard-stat-cards 5, stack-tab-bar 4, table-pagination 6, server stack-service 127; all passed)"
    why_human: "Resource constraint: full suite, tsc --build and builds are not run on the shared VPS. All 11 SUMMARYs also defer these to CI"
  - test: "Visual check of backstop truths: login, signup and one wizard step have the same rhythm in light/dark on mobile and desktop (#92); Backup Coverage '128/128' fits the xl six-column card and its skeleton (light/dark); log-terminal and unified-diff-view keep column alignment with Geist Mono"
    expected: "No clipped or misaligned content, same spacing across the three forms"
    why_human: "Declared verification: backstop in plans 20-04, 20-05, 20-07; judgment of appearance"
  - test: "Decide whether Settings-page forms (backup repository, compose checks, template repos, health retention, proxy settings, SMTP, general, notification triggers, backup defaults) must adopt FormStack/FormActions for UI-05, or whether the deliberate deferral in CONTEXT D-09 stands"
    expected: "Explicit accept (record an override) or a follow-up issue/plan"
    why_human: "Roadmap SC4 reads 'Forms across the app', but no plan migrated these cards; they still use their own CardContent space-y-* and CardFooter layout (see Gaps Summary)"
---

# Phase 20: Visual Consistency, Dashboard Clarity and Touch Targets - Verification Report

**Phase Goal:** The interface reads as one consistent system: status labels, KPI typography, tabs, forms and tables follow shared rules, the dashboard's backup card is honest, and icon-only controls are comfortable to tap on a phone
**Verified:** 2026-10-21
**Status:** human_needed
**Re-verification:** No, initial verification

No must-have was found FAILED by static inspection. Status is `human_needed` because the CSS and browser-dependent claims have never been executed (Playwright specs were only collected), typecheck and full suites were deferred to CI, and one roadmap-versus-scope question (Settings forms) needs a decision.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | One status reads with identical casing on dashboard, stack list, stack header, services table and activity timeline, from one shared mapping | VERIFIED (static + unit) | `client/src/lib/status-labels.ts` owns `formatStatusLabel` (`replaceAll("_"," ").toLowerCase()`), `getStackStatusPresentation` and `getServiceStatusPresentation`. Both badge files only re-export and render `label` (stack-status-badge.tsx, service-status-badge.tsx). Dashboard "Recent Stacks" renders `StackList`, which uses `StackStatusBadge`; stack-detail-header.tsx:51 and incident-list.tsx:101 use the badge; activity-timeline.tsx:131-135 uses `formatStatusLabel(from) -> formatStatusLabel(to)`; services-section.tsx:162 uses `formatStatusLabel(stackStatus)`. No `uppercase`/`capitalize`/ad-hoc lowercasing of status in src. Unknown values degrade via `Object.hasOwn`. `status-labels.test.ts` 40/40 pass. Browser proof exists but is unexecuted (human item 1). |
| 2 | KPI numbers and the defined label set render in a self-hosted monospace font defined in the design tokens, with no external font host request | VERIFIED (static + unit) | `client/src/index.css` line 1 `@import "@fontsource-variable/geist-mono"`; `--font-mono: "Geist Mono Variable", ui-monospace, ...` in `@theme inline`. Package in `client/package.json` (^5.3.0), `yarn.lock`, and installed (`node_modules/@fontsource-variable/geist-mono/files`). No `googleapis`/`gstatic`/`@import url` in `client/src` or `index.html`. `stat-card.tsx`: value `font-mono text-2xl tabular-nums`, label `font-mono text-xs`. `deploy-warnings-alert.tsx` and `sidebar-version-block.tsx` use `font-mono`. `font-token.test.ts` 5/5 pass. Actual font fetch/computed family is browser-only (human item 1). See WR-01 for mobile table-value gap. |
| 3 | The backup card states exactly what it counts, and a manual-snapshot-only stack is not invisible | VERIFIED (static + unit) | Card renamed "Backup Coverage", value `covered/total`, hint "with a schedule or snapshot", "data unavailable" and em dash on either request failing (`dashboard-stat-cards.tsx`). `dashboard-stats.ts` counts a stack when it has an effective schedule OR `hasBackup === true`. Server: `BackupRepository.findStackIdsWithSnapshot()` is one `groupBy` on `status: COMPLETED`, `trigger in [MANUAL, SCHEDULED]`; `StackService.listStacks()` merges `hasBackup` via the `StackBackupReadRepo` port, once per call (no N+1); `application/index.ts:95` injects `backupRepository`. Client `use-stacks.ts` refetches in the background when a stack leaves BACKING_UP (test at use-stacks.test.ts:101). Vitest: dashboard-stat-cards 5/5, server stack-service 127/127. See WR-06 for an edge case. |
| 4 | Forms share one label-to-input and field-to-button spacing; every data table shares one restyled look, keeping sorting, status pills and row actions | VERIFIED for listed forms and tables; scope question for Settings forms | Forms: `form-layout.tsx` `FormStack` (`gap-4`, descendant `[&_[data-slot=form-item]]:gap-2`) and `FormActions` (`pt-2`, inline/dialog variants); adopted by login, signup, two-factor, create-stack, health-probe, all five setup steps, 2FA dialogs, backup-schedule and proxy-assign dialogs and certificates upload. Tables: all 10 `DataTable` consumers (stack list, services, proxy domains, snapshots, incidents, notification log, storage stacks, backup history, certificates, storage backups) render through `TableContent` -> `TableFrame` (`overflow-hidden rounded-md border`), `bg-muted/50` thead, `hover:bg-muted/30` rows; `SortableHead` keeps sort, `ToneBadge` pills and row-action cells are kept. The only other `<Table>` users (env-editor, brownfield-import) are wrapped in `TableFrame`. No raw `<table>`. `components/ui` unchanged vs base `7cc2dec`. Settings-page forms were not migrated (see Gaps Summary / human item 4). |
| 5 | Tab bar shows no scrollbar at desktop/tablet and stays usable on narrow screens; stack actions trigger, theme toggle, certificate delete and pagination buttons are 44px below md and compact at md+ | VERIFIED (static + unit); rendering unproven | `stack-tab-bar.tsx`: wrapper `-mx-1 -my-1 overflow-x-auto overflow-y-hidden px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`, `TabsList w-max`, active tab `scrollIntoView?.({inline:"nearest",block:"nearest"})`; used from `[id].tsx:53` (page file 85 lines). `TOUCH_TARGET = "max-md:size-11"` applied via `cn`/className on stack-actions.tsx:162, theme-toggle.tsx:36, certificates-card.tsx:199, and the four named pagination buttons (table-pagination.tsx:72-102, footer `md:gap-1`). Base sizes remain `size-9`/`size-8` (button.tsx) so md+ stays compact. Vitest: stack-tab-bar 4/4, table-pagination 6/6. Real 44px and no-scrollbar measurement is Playwright-only (human item 1). |
| 6 | On a non-overview stack tab, the stack-name breadcrumb links to the overview and the tab name is the current page | VERIFIED (static) | Shared `StackBreadcrumb` renders the stack name as `<Link to={/stacks/${stackId}}>` and `current` as `BreadcrumbPage`. `stack-detail-header.tsx:28` passes `current={STACK_TAB_LABELS[activeTab]}`; `backup-detail-header.tsx:23` passes a Backups trail crumb. Name truncates with `max-w-48 truncate md:max-w-none` and `title`. |

**Score:** 6/6 roadmap success criteria verified statically; 0 behavior-unverified truths flagged (the behavior-dependent ones, scroll-into-view and refetch-after-backup, have passing unit tests).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `client/src/lib/status-labels.ts` | Single status mapping | VERIFIED | Substantive, imported by badges, timeline, services section |
| `client/src/lib/touch-target.ts` | `TOUCH_TARGET` constant | VERIFIED | Used in 8 call-site files |
| `client/src/components/common/form-layout.tsx` | `FormStack`/`FormActions` | VERIFIED | Used by 15 form files |
| `client/src/components/common/data/table/*` | Frame, sortable head, cards, pagination | VERIFIED | Wired through `DataTable`; 10 consumers |
| `client/src/routes/app/stacks/components/stack-tab-bar.tsx` | Scrollbar-free tab bar | VERIFIED | Wired in `[id].tsx` |
| `client/src/components/domain/stack/stack-breadcrumb.tsx` | Shared breadcrumb | VERIFIED | Used by detail and backup headers |
| `client/src/index.css` + `@fontsource-variable/geist-mono` | Self-hosted token | VERIFIED | Installed and locked |
| `server/src/repositories/backup-repository.ts` `findStackIdsWithSnapshot` | One batched query | VERIFIED | Wired through `StackService` port and `application/index.ts` |
| `client/test/integration/visual-consistency.spec.ts` | Browser proof | PRESENT, NOT EXECUTED | Collected only |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| stack-status-badge / service-status-badge | status-labels.ts | re-export + presentation call | WIRED |
| activity-timeline.tsx | status-labels.ts | `formatStatusLabel(...)` | WIRED |
| stack-detail-header.tsx | stack-breadcrumb.tsx | `<StackBreadcrumb current=...>` | WIRED |
| table-content.tsx | table-frame.tsx | `<TableFrame>` | WIRED |
| table-pagination / stack-actions / theme-toggle / certificates-card | touch-target.ts | `TOUCH_TARGET` | WIRED |
| index.css | @fontsource-variable/geist-mono | first `@import` | WIRED |
| application/index.ts | BackupRepository | 11th constructor arg -> `StackBackupReadRepo` | WIRED |
| dashboard-stat-cards.tsx | dashboard-stats.ts / stat-card.tsx | `stats.backupCoverage`, `hint` | WIRED |
| use-stacks.ts | refetch on leaving BACKING_UP | `fetchStacks("background")` | WIRED (stale-closure caveat, WR-06) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Real Data | Status |
|----------|---------------|--------|-----------|--------|
| dashboard-stat-cards.tsx | `stats.backupCoverage` | `computeDashboardStats(stacks, defaultSchedule)` over `GET /api/stacks` `hasBackup` | Yes, Prisma `backup.groupBy` | FLOWING |
| StackList / badges | `stack.status` | stacks API + SSE | Yes | FLOWING |

### Behavioral Spot-Checks (single-file vitest only)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Status casing for every known key | `vitest run test/unit/lib/status-labels.test.ts` | 40 passed | PASS |
| Font token and import | `vitest run test/unit/styles/font-token.test.ts` | 5 passed | PASS |
| Backup Coverage card states and hint | `vitest run test/unit/routes/dashboard/dashboard-stat-cards.test.tsx` | 5 passed | PASS |
| Tab bar scroll-into-view, jsdom-safe | `vitest run test/unit/routes/stacks/stack-tab-bar.test.tsx` | 4 passed | PASS |
| Pagination names and touch classes | `vitest run test/unit/components/common/table-pagination.test.tsx` | 6 passed | PASS |
| listStacks hasBackup, no N+1, protected filter | server `vitest run test/unit/application/stack-service.test.ts` | 127 passed | PASS |
| Playwright, tsc --build, full suites | not run (constraint) | n/a | SKIPPED, human/CI |

### Probe Execution

SKIPPED: no probe scripts declared by this phase.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| UI-02 | 20-01, 20-10, 20-11 | One casing from one shared mapping | SATISFIED | Truth 1 |
| UI-03 | 20-05, 20-07, 20-09, 20-10, 20-11 | Self-hosted monospace in design tokens | SATISFIED (mobile table-value caveat WR-01) | Truth 2 |
| UI-04 | 20-06, 20-11 | Scrollbar-free tab bar | SATISFIED statically; browser proof pending | Truth 5 |
| UI-05 | 20-04, 20-09 | One shared form spacing rule | SATISFIED for the listed forms; Settings cards not migrated | Truth 4, human item 4 |
| UI-08 | 20-02, 20-03, 20-08, 20-09, 20-10, 20-11 | Shared restyled data tables | SATISFIED | Truth 4 |
| DASH-01 | 20-07 | Card states what it counts | SATISFIED | Truth 3 |
| DASH-02 | 20-07 | Manual-snapshot-only stack visible | SATISFIED | Truth 3 |
| A11Y-01 | 20-03, 20-09, 20-11 | 44px touch targets below md | SATISFIED for the four named controls; WR-05 shows one sibling control missed | Truth 5 |
| UI-09 (in roadmap and plan 20-01, not in the requested ID list) | 20-01 | Breadcrumb links back to overview | SATISFIED | Truth 6 |

All eight requested IDs are claimed by at least one plan and marked complete in REQUIREMENTS.md. No orphaned requirement: REQUIREMENTS.md maps UI-02, UI-03, UI-04, UI-05, UI-08, UI-09, DASH-01, DASH-02, A11Y-01 to Phase 20 and every one appears in a plan's `requirements` field. Note UI-09 was absent from the verification request but is part of the ROADMAP Phase 20 requirement line.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (67 modified src files) | n/a | `TBD`/`FIXME`/`XXX` grep | none found | No debt markers |
| `client/src/components/common/data/table/table-cards.tsx` | 49-73 | Column `className` dropped in card layout (REVIEW WR-01, confirmed in code) | Warning | Mono/tabular styling on technical table values is lost below `md` (certificate domain, snapshot id, ports, durations) |
| `client/src/routes/app/account/components/enroll-dialog.tsx` | 169-177 | Copy-setup-key `size="icon"` without `TOUCH_TARGET` (REVIEW WR-05, confirmed) | Warning | A11Y-01 inconsistency; not one of the four controls named in the requirement |
| `client/src/hooks/use-stacks.ts` | 61-72 | Stale `stacks` closure read in SSE handler (WR-06) | Warning | Background refetch for Backup Coverage can be skipped or fire spuriously on rapid events |
| `data-table.tsx`, `table-content.tsx`, `table-cards.tsx` | various | WR-02 (rows/cards not keyboard operable), WR-03 (sort direction not announced on mobile), WR-04 (pageSize query param accepts negative/fractional) | Warning | Pre-existing or edge-case accessibility and input-validation issues in the rewritten table |

20-REVIEW.md lists 6 warnings and 7 info items; 20-REVIEW-DISPOSITION.md marks all 13 as `open`. None is by itself a must-have failure, but WR-01 and WR-05 touch UI-03 and A11Y-01 respectively and are cheap to fix before the release phase.

### Human Verification Required

1. **Playwright proof** (chromium and mobile-chromium): `visual-consistency.spec.ts` and the mobile `44px touch targets (A11Y-01)` block. Expected: all green. Why human: never executed, only collected.
2. **CI gates**: `tsc --build`, full client/server unit suites, integration suite. Expected: green.
3. **Visual backstops**: form rhythm (login, signup, a wizard step, light/dark, mobile/desktop), `128/128` fit in Backup Coverage at xl, log/diff alignment under Geist Mono.
4. **Settings forms decision** (UI-05 scope): accept deferral (add an override) or open a follow-up.

### Gaps Summary

No blocking gaps. Items worth an explicit decision:

- **Settings-page forms (UI-05).** Roadmap SC4 says "Forms across the app", but CONTEXT D-09 and plan 20-04 deliberately left Settings cards unmigrated ("touched in passing" only; certificates upload was adopted). backup-repository, compose-checks, template-repos, health-retention and proxy-settings cards still lay out with `CardContent space-y-*` plus `CardFooter`, and the non-react-hook-form cards (general, smtp, notification triggers, backup defaults) use `space-y-1/2` label wrappers. Numerically the react-hook-form cards land close to 16/8/24 by coincidence of shadcn defaults, but they do not use the shared primitives, so a later change to `FormStack` will not reach them. If the maintainer accepts this, record an override such as:

  ```yaml
  overrides:
    - must_have: "Forms across the app share one label-to-input and field-to-button spacing"
      reason: "Settings cards intentionally deferred with their react-hook-form migration (CONTEXT D-09, CLAUDE.md Known Refactoring Targets)"
      accepted_by: "<name>"
      accepted_at: "<ISO timestamp>"
  ```
- **Mobile card layout loses technical-value styling (WR-01)** and **enroll-dialog copy button is 36px on phones (WR-05)**: small, localized fixes that tighten UI-03 and A11Y-01.
- **Browser and CI evidence is absent** by construction of this verification; the phase should not be considered closed until CI and the Playwright specs are green.

---

_Verified: 2026-10-21_
_Verifier: Claude (gsd-verifier)_
