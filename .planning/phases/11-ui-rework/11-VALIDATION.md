---
phase: "11"
slug: "ui-rework"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: true
created: "2026-09-25"
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 (client + server unit) + Playwright 1.58.2 (client integration/E2E) |
| **Config file** | `client/vitest.config.ts` (unit), `client/playwright.config.ts` (E2E), `server/vitest.config.ts` (server unit/integration) |
| **Quick run command** | `yarn workspace @docktor/client test` |
| **Full suite command** | `yarn workspace @docktor/client test && yarn workspace @docktor/client test:integration && yarn workspace @docktor/server test:unit && yarn workspace @docktor/server test:integration` |
| **Estimated runtime** | ~11 seconds (unit-only quick run) |

---

## Sampling Rate

- **After every task commit:** `yarn workspace @docktor/client test` (Vitest unit suite — fast, no browser); server-touching tasks (11-05) also run `yarn workspace @docktor/server test:unit`
- **After every plan wave:** Full suite — Vitest unit (client + server) + `yarn workspace @docktor/client test:integration` (Playwright), including the mobile-viewport project once 11-13 Task 1 adds it
- **Before `/gsd-verify-work`:** Full suite must be green, including `yarn typecheck` across all workspaces
- **Max feedback latency:** 11 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-1 | 01 | 1 | D-01/D-02 — merged Config tab, legacy redirects | T-11-01..T-11-04 | Redirect target only from fixed alias map; env/compose content renders as React text (no XSS); reload effect uses a cancelled-flag guard | unit + E2E + typecheck | `yarn workspace @docktor/client test test/unit/lib/stack-tabs.test.ts test/unit/hooks/use-stack-config-files.test.ts test/unit/routes/stacks/config-tab.test.tsx test/unit/routes/stacks/stack-detail-page.test.tsx; yarn workspace @docktor/client test:integration stacks.spec.ts; yarn workspace @docktor/client exec tsc -b` | ❌ (new) | ⬜ pending |
| 11-01-2 | 01 | 1 | D-03 — Card reduction / page decomposition; closes CLAUDE.md target for `[id].tsx` | — | N/A — decomposition only, no new data surface | unit + E2E + typecheck + line-budget gate | `yarn workspace @docktor/client test test/unit/routes/stacks/stack-detail-page.test.tsx test/unit/routes/stacks/config-tab.test.tsx; PLAYWRIGHT_PORT=5199 yarn workspace @docktor/client test:integration stacks.spec.ts; test "$(wc -l < 'client/src/routes/app/stacks/[id].tsx')" -le 90 && yarn workspace @docktor/client exec tsc -b` | ❌ (new) | ⬜ pending |
| 11-02-1 | 02 | 2 | D-08 — single status-indicator scheme, pulsing running dot | T-11-07 | Badges re-present fields already returned by existing endpoints; no new data exposed | unit | `yarn workspace @docktor/client test test/unit/components/common test/unit/components/domain/stack/stack-status-badge.test.tsx test/unit/components/domain/stack/service-status-badge.test.tsx` | ❌ (new) | ⬜ pending |
| 11-02-2 | 02 | 2 | D-10/D-11 — update-badge copy for missing `latestTag`, service-color utility | T-11-05, T-11-06 | Badge labels render as React text (no XSS); `parsePorts` never throws, drops non-conforming entries (no crash on malformed data) | unit | `yarn workspace @docktor/client test test/unit/lib/service-color.test.ts test/unit/lib/service-ports.test.ts test/unit/components/domain/stack/service-update-badge.test.tsx test/unit/components/domain/stack/stack-update-badge.test.tsx test/unit/components/log-viewer.test.tsx` | ❌ (new) | ⬜ pending |
| 11-02-3 | 02 | 2 | D-08/D-09 — stack list on ToneBadge, stack-level update pill | T-11-05, T-11-07 | Same rendering/data-exposure guarantees as 11-02-1, applied to the list surface | unit + typecheck | `yarn workspace @docktor/client test test/unit/components/domain; yarn workspace @docktor/client exec tsc -b` | ❌ (new) | ⬜ pending |
| 11-03-1 | 03 | 2 | D-15 — dark mode follows OS from first paint | T-11-08, T-11-09 | Pre-paint script only compares fixed strings and toggles a class (no eval/HTML injection); try/catch falls back to media query if `localStorage` throws | unit + E2E | `yarn workspace @docktor/client test test/unit/components/common/theme-provider.test.tsx; PLAYWRIGHT_PORT=5174 yarn workspace @docktor/client test:integration theme.spec.ts` | ❌ (new) | ⬜ pending |
| 11-03-2 | 03 | 2 | D-16 — always-visible sun/moon toggle, persisted override | T-11-10 | Theme preference in `localStorage` is not sensitive data | unit + E2E + typecheck | `yarn workspace @docktor/client test test/unit/components/common; PLAYWRIGHT_PORT=5174 yarn workspace @docktor/client test:integration theme.spec.ts; yarn workspace @docktor/client exec tsc -b` | ❌ (new) | ⬜ pending |
| 11-04-1 | 04 | 2 | D-14 — reusable StatCard, six-stat dashboard row | T-11-11..T-11-13 | `useBackupDefaults` reads only the same-user global schedule already shown on Settings; values render as text (no XSS) | unit + line-budget gate + typecheck | `yarn workspace @docktor/client test test/unit/components/common/stat-card.test.tsx test/unit/lib/dashboard-stats.test.ts test/unit/hooks/use-backup-defaults.test.ts; test "$(wc -l < client/src/routes/app/dashboard.tsx)" -le 80 && yarn workspace @docktor/client exec tsc -b` | ❌ (new) | ⬜ pending |
| 11-04-2 | 04 | 2 | D-09 (list half) — live list refresh, E2E stats coverage | T-11-12 | Exactly one extra request per dashboard mount; no per-stack fetch loop | unit + E2E | `yarn workspace @docktor/client test test/unit/hooks/use-stacks.test.ts; PLAYWRIGHT_PORT=5175 yarn workspace @docktor/client test:integration stacks.spec.ts auth.spec.ts setup-wizard.spec.ts` | ✅ (extend) | ⬜ pending |
| 11-05-1 | 05 | 2 | D-09 (server half) — `listStacks()` batched update info | T-11-14..T-11-16 | Same authenticated-user data already exposed per-stack; one batched `findByImageRefs` call (no N+1); `showInDashboard` filtering runs before enrichment | unit + typecheck | `yarn workspace @docktor/server test:unit test/unit/application/stack-service.test.ts; yarn typecheck` | ✅ (extend) | ⬜ pending |
| 11-05-2 | 05 | 2 | D-09 (server half) — integration coverage for the enriched route | T-11-14..T-11-16 | Same as 11-05-1, verified against the real database | integration | `yarn workspace @docktor/server test:integration test/integration/stacks.test.ts` | ✅ (extend) | ⬜ pending |
| 11-06-1 | 06 | 3 | D-07 — unified filterable activity timeline | T-11-17, T-11-18 | Timeline entries render as React text (no `dangerouslySetInnerHTML`); `describeStackEvent` never throws on malformed payloads | unit + typecheck | `yarn workspace @docktor/client test test/unit/lib/stack-event-description.test.ts test/unit/hooks/use-stack-timeline.test.ts test/unit/routes/stacks/activity-timeline.test.tsx test/unit/routes/stacks/stack-detail-page.test.tsx; test ! -e client/src/routes/app/stacks/components/event-log-card.tsx && test ! -e client/src/routes/app/stacks/components/status-log-card.tsx && yarn workspace @docktor/client exec tsc -b` | ❌ (new) | ⬜ pending |
| 11-06-2 | 06 | 3 | D-09/D-10/D-11 — flat Services section, header update badge | T-11-19 | Shows the same records the three prior cards already showed; no new data exposure | unit + typecheck | `yarn workspace @docktor/client test test/unit/routes/stacks; test ! -e client/src/routes/app/stacks/components/services-tab.tsx && yarn workspace @docktor/client exec tsc -b` | ❌ (new) | ⬜ pending |
| 11-07-1 | 07 | 3 | D-04 — proxy domain assign/edit dialog | T-11-20, T-11-22, T-11-23 | Client validates with shared `assignDomainSchema`; server re-validates with the same schema (unchanged trust model); domain/service read-only in edit mode | unit + E2E | `yarn workspace @docktor/client test test/unit/routes/proxy-tab.test.tsx test/unit/routes/stacks/proxy-assign-dialog.test.tsx; PLAYWRIGHT_PORT=5176 yarn workspace @docktor/client test:integration proxy.spec.ts` | ❌ (new) | ⬜ pending |
| 11-07-2 | 07 | 3 | D-05 — backup schedule/retention dialog | T-11-21, T-11-23 | Hook commands remain single-admin trust model, unchanged from the prior card (documented as existing behaviour, not introduced) | unit + E2E + typecheck | `yarn workspace @docktor/client test test/unit/routes/stacks/backup-schedule-dialog.test.tsx test/unit/routes/stacks/backup-config-summary.test.tsx; PLAYWRIGHT_PORT=5176 yarn workspace @docktor/client test:integration backups.spec.ts; test ! -e client/src/routes/app/stacks/components/backup-config-card.tsx && yarn workspace @docktor/client exec tsc -b` | ❌ (new) | ⬜ pending |
| 11-08-1 | 08 | 3 | ROADMAP SC3 — extract shared LogTerminal | T-11-24 | Lines render through `ansi-to-react` (React elements, not `dangerouslySetInnerHTML`) | unit | `yarn workspace @docktor/client test test/unit/components/domain/stack/log-terminal.test.tsx test/unit/components/log-viewer.test.tsx` | ❌ (new) | ⬜ pending |
| 11-08-2 | 08 | 3 | ROADMAP SC3 — backup detail streams via LogTerminal | T-11-26 | Same output already streamed; no new data source | unit + typecheck | `yarn workspace @docktor/client test test/unit/routes/stacks/backup-detail-page.test.tsx test/unit/lib/backup-format.test.ts; test ! -e client/src/components/common/log-output.tsx && yarn workspace @docktor/client exec tsc -b` | ❌ (new) | ⬜ pending |
| 11-08-3 | 08 | 3 | D-03/D-11 — flat backup detail header, history fetch-loop fix | T-11-25 | Self-retriggering polling effect replaced by mount-once + in-progress-only polling, covered by a fake-timer request-count test | unit + line-budget gate + E2E | `yarn workspace @docktor/client test test/unit/routes/stacks/backup-history.test.tsx test/unit/routes/stacks/backup-detail-page.test.tsx; test "$(wc -l < 'client/src/routes/app/stacks/backups/[backupId].tsx')" -le 90 && yarn workspace @docktor/client exec tsc -b; PLAYWRIGHT_PORT=5177 yarn workspace @docktor/client test:integration backups.spec.ts` | ❌ (new) | ⬜ pending |
| 11-09-1 | 09 | 3 | D-18 (gate) — package-legitimacy checkpoint before install | T-11-SC | Human checkpoint verifies publisher/repository for `@uiw/react-codemirror`, `yaml`, `@codemirror/lang-yaml`, `@codemirror/lint` before `yarn add`; exact scoped names pinned with caret ranges | manual checkpoint (no automated command — blocking human gate) | — | n/a | ⬜ pending |
| 11-09-2 | 09 | 3 | D-18/D-19 — CodeEditor, YAML linter, ComposeEditor | T-11-27..T-11-29 | CodeMirror renders document text as DOM text nodes (no `innerHTML` of user content); linter debounces, parse errors caught as diagnostics | unit + package-audit gate + typecheck | `yarn workspace @docktor/client test test/unit/lib/yaml-syntax-linter.test.ts test/unit/components/common/code-editor.test.tsx; grep -c '"@uiw/react-codemirror"' client/package.json && ! grep -q 'monaco' client/package.json && yarn workspace @docktor/client exec tsc -b` | ❌ (new) | ⬜ pending |
| 11-09-3 | 09 | 3 | D-18/D-19 — ComposeEditor on Config tab and Create Stack page | T-11-27..T-11-29 | Same as 11-09-2 — no new injection surface, replaces a plain textarea with equivalent trust boundary | unit + E2E | `yarn workspace @docktor/client test test/unit/routes/stacks/config-tab.test.tsx test/unit/routes/stacks/stack-detail-page.test.tsx; PLAYWRIGHT_PORT=5178 yarn workspace @docktor/client test:integration stacks.spec.ts` | ❌ (new) | ⬜ pending |
| 11-10-1 | 10 | 3 | Infra — serve route tree through a data router | T-11-30 | Route tree copied path-for-path; `ProtectedRoute`/`FirstRunGate` wrapping unchanged; full E2E suite (incl. auth redirects) must pass so no protected route becomes reachable without a session | E2E + typecheck | `yarn workspace @docktor/client exec tsc -b; PLAYWRIGHT_PORT=5179 yarn workspace @docktor/client test:integration` | ✅ (existing suite) | ⬜ pending |
| 11-10-2 | 10 | 3 | UI-SPEC — discard-unsaved-changes guard for Config tab | T-11-31, T-11-32 | `beforeunload` listener registered only while dirty, removed on cleanup; discard is an explicit destructive-styled user action, nothing persisted either way | unit + E2E + line-budget gate | `yarn workspace @docktor/client test test/unit/components/common/unsaved-changes-guard.test.tsx test/unit/lib/stack-tabs.test.ts test/unit/hooks/use-stack-config-files.test.ts test/unit/routes/stacks/stack-detail-page.test.tsx; PLAYWRIGHT_PORT=5179 yarn workspace @docktor/client test:integration config-unsaved-changes.spec.ts; test "$(wc -l < 'client/src/routes/app/stacks/[id].tsx')" -le 90 && yarn workspace @docktor/client exec tsc -b` | ❌ (new) | ⬜ pending |
| 11-11-1 | 11 | 3 | D-08 + CLAUDE.md target — extract Notifications tab, notification-type badge | T-11-33, T-11-34 | Secrets stay write-only (surfaced only as `hasPassword`/`hasSftpKey`/`hasS3SecretKey` flags); notification log messages render as React text | unit + typecheck | `yarn workspace @docktor/client test test/unit/components/domain/notification/notification-type-badge.test.tsx test/unit/routes/settings; yarn workspace @docktor/client exec tsc -b` | ❌ (new) | ⬜ pending |
| 11-11-2 | 11 | 3 | CLAUDE.md target — extract remaining sections, ≤80-line settings.tsx | T-11-35 | Unit smoke tests per extracted tab plus unmodified `backups.spec.ts` Settings coverage serve as the behaviour-preservation net | unit + line-budget gate + E2E | `yarn workspace @docktor/client test test/unit/routes/settings; test "$(wc -l < client/src/routes/app/settings.tsx)" -le 80 && yarn workspace @docktor/client exec tsc -b; PLAYWRIGHT_PORT=5180 yarn workspace @docktor/client test:integration backups.spec.ts` | ❌ (new) | ⬜ pending |
| 11-12-1 | 12 | 4 | D-20/D-21/D-22 — lossless `.env` model, table/raw EnvEditor, secret masking | T-11-36..T-11-38 | Masking is display-only (never a security control, stated in helper text); lossless round-trip preserves comments/unrecognised lines; keys validated against `ENV_VARIABLE_KEY_PATTERN` before Save | unit + typecheck | `yarn workspace @docktor/client test test/unit/lib/env-file.test.ts test/unit/components/domain/stack/env-editor.test.tsx; yarn typecheck` | ❌ (new) | ⬜ pending |
| 11-12-2 | 12 | 4 | D-06/D-20..D-22 — EnvEditor on Config tab and Create Stack page | T-11-36..T-11-39 | Same guarantees as 11-12-1; values render as input values / CodeMirror text, never HTML | unit + E2E + typecheck | `yarn workspace @docktor/client test test/unit/routes/stacks/config-tab.test.tsx test/unit/routes/stacks/stack-detail-page.test.tsx; PLAYWRIGHT_PORT=5181 yarn workspace @docktor/client test:integration stacks.spec.ts config-unsaved-changes.spec.ts; yarn workspace @docktor/client exec tsc -b` | ❌ (new) | ⬜ pending |
| 11-13-1 | 13 | 5 | D-17 — Playwright mobile project, core-flow mobile spec | T-11-41 | New project only adds regression coverage; no runtime behavior change | E2E (project listing) | `PLAYWRIGHT_PORT=5182 yarn workspace @docktor/client test:integration --project=mobile-chromium --list` | ❌ (new project) | ⬜ pending |
| 11-13-2 | 13 | 5 | D-17 — component-by-component mobile/dark-mode audit | T-11-40, T-11-41 | Filed issues use stubbed E2E data only, never real stack content; both desktop and mobile Playwright projects must pass after fixes (no silent desktop regression) | E2E (both projects) | `PLAYWRIGHT_PORT=5182 yarn workspace @docktor/client test:integration --project=mobile-chromium; PLAYWRIGHT_PORT=5182 yarn workspace @docktor/client test:integration --project=chromium` | n/a (audit + fixes) | ⬜ pending |
| 11-13-3 | 13 | 5 | D-03/D-08 phase-wide gates, CLAUDE.md update, folded-todo closure | T-11-42 | Documentation, test-config and CSS-utility changes only — no new runtime request paths | structural gates + unit + typecheck | `test -z "$(grep -rn 'rounded-full px-2 py-0.5' client/src --include=*.tsx \| grep -v components/ui)" && test -z "$(grep -rln '<Card' 'client/src/routes/app/stacks/[id].tsx' client/src/routes/app/stacks/components client/src/routes/app/stacks/backups client/src/routes/app/dashboard.tsx)"; test "$(wc -l < 'client/src/routes/app/stacks/[id].tsx')" -le 90 && test "$(wc -l < 'client/src/routes/app/stacks/backups/[backupId].tsx')" -le 90 && test "$(wc -l < client/src/routes/app/dashboard.tsx)" -le 80 && test "$(wc -l < client/src/routes/app/settings.tsx)" -le 80; yarn workspace @docktor/client test && yarn typecheck` | n/a (gate) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Transcribed from 11-RESEARCH.md's Validation Architecture § Wave 0 Gaps. This phase has no separate Wave-0 wave in ROADMAP.md — these files are created by their owning task itself (tracer-first: 11-01 Task 1 is `type="tracer"`), not pre-scaffolded ahead of Wave 1:

- [ ] `client/test/unit/hooks/use-stack-timeline.test.ts` — covers D-07's merge/sort logic (11-06-1)
- [ ] `client/test/unit/components/status-pill.test.tsx` — covers D-08's pulsing "running" state (covered in practice by `stack-status-badge.test.tsx` / `service-status-badge.test.tsx` in 11-02-1)
- [ ] `client/test/unit/components/common/theme-provider.test.tsx` — covers D-15/D-16 (11-03-1/11-03-2)
- [ ] `client/test/unit/routes/stacks/config-tab.test.tsx` (compose-editor coverage) — covers D-18/D-19's linter behavior (11-09-3)
- [ ] `client/test/unit/components/domain/stack/env-editor.test.tsx` — covers D-20/D-21/D-22's table/raw round-trip and secret masking (11-12-1)
- [ ] A Playwright mobile-viewport project in `client/playwright.config.ts` — needed before D-17's audit can be exercised as automated regression coverage (11-13-1)
- [ ] `server/test/unit/application/stack-service.test.ts` (extended) — covers the `listStacks()` `ImageUpdateCheck` join (11-05-1)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Package legitimacy of `@uiw/react-codemirror`, `yaml`, `@codemirror/lang-yaml`, `@codemirror/lint` before install | D-18 (gate) | Publisher/repository/maintainer trust cannot be asserted by an automated test — it is a one-time human judgment call at the point of adding a new dependency | 11-09-PLAN.md Task 1: run the package-legitimacy audit, present findings, get explicit human sign-off before `yarn add` |
| Mobile/dark-mode component-by-component visual audit | D-17 | Visual/layout correctness at phone width across every component is not fully capturable by DOM assertions alone — cosmetic misalignment needs a human eye, even though the audit's *regression* coverage (11-13-1) is automated | 11-13-PLAN.md Task 2: walk each component at phone width in both themes, triage findings fix-now vs. file-as-issue |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — 29 of 30 tasks carry automated `<verify>` commands (both deterministic probes — verify-command-paths, verify-failure-directions — passed 63/63 clean); the one exception (11-09-1) is a declared human checkpoint, listed above under Manual-Only Verifications
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — the single manual task (11-09-1) is immediately bracketed by automated tasks 11-08-3 and 11-09-2
- [x] Wave 0 covers all MISSING references — see Wave 0 Requirements above, cross-referenced against the actual plan tasks that create each file
- [x] No watch-mode flags — all commands above use one-shot `vitest run`-equivalent invocations (`yarn workspace ... test <files>`) and `playwright test`, never `--watch`
- [x] Feedback latency < 11s — unchanged from the quick-run estimate; no new slow fixtures introduced
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-25 (plan-checker review pass; transcribed from 11-RESEARCH.md's already-complete Validation Architecture section per checker finding `nyquist_compliance`)
