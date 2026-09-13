---
phase: "08"
slug: "live-state-consistency"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-13"
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (server: `vitest run` / `--project unit` / `--project test/integration`; client unit: Vitest + `@testing-library/react` + jsdom); Playwright for client e2e (hermetic — cannot exercise live SSE, see Common Pitfalls #2 in RESEARCH.md) |
| **Config file** | `server/vitest.config.ts`, `client/vitest.config.ts`, `client/playwright.config.ts` |
| **Quick run command** | `yarn workspace @docktor/server test:unit` / `yarn workspace @docktor/client test` |
| **Full suite command** | `yarn test` (root, `yarn workspaces foreach -A run test`) |
| **Estimated runtime** | ~60-90 seconds (unit tiers only; this phase adds no new integration/e2e infra) |

---

## Sampling Rate

- **After every task commit:** Run `yarn workspace @docktor/client test -- stack-status-badge` (once created)
- **After every plan wave:** Run `yarn test`
- **Before `/gsd-verify-work`:** Full suite must be green, plus all 6 recorded `human_judgment: true` items explicitly closed (self-verified live, or a documented human-verify checkpoint)
- **Max feedback latency:** ~90 seconds (unit suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | Todo: config_error UI indicator | — / N/A | N/A — already shipped, verification only | unit | `yarn workspace @docktor/server test:unit -- file-watcher stack-service` | ✅ | ⬜ pending |
| 08-01-02 | 01 | 1 | Todo: config_error client handling | — / N/A | N/A | unit | `yarn workspace @docktor/client test -- use-stack use-stacks` | ✅ | ⬜ pending |
| 08-01-03 | 01 | 1 | Todo: env-file config-changed flagging | — / N/A | N/A | unit | `yarn workspace @docktor/server test:unit -- file-watcher` | ✅ | ⬜ pending |
| 08-01-04 | 01 | 1 | Todo: manual-action stack_status broadcast | — / N/A | N/A | unit | `yarn workspace @docktor/server test:unit -- stack-service backup-service` | ✅ | ⬜ pending |
| 08-01-05 | 01 | 1 | Todo: handleSaveCompose/handleSaveEnv refetch | — / N/A | N/A | unit | `yarn workspace @docktor/client test -- stack-detail-page` | ✅ | ⬜ pending |
| 08-02-01 | 02 | 1 | UI-SPEC: BACKING_UP/RESTORING/MIGRATING animate-pulse | — / N/A | N/A — CSS-only, no new attack surface | unit | `yarn workspace @docktor/client test -- stack-status-badge` | ❌ W0 | ⬜ pending |
| 08-03-01 | 03 | 2 | Human-judgment: D6/05.1-02 live cross-tab SSE proof | — / N/A | N/A | manual / human_judgment | none automatable (see RESEARCH.md Pitfall 2) | n/a | ⬜ pending |
| 08-03-02 | 03 | 2 | Human-judgment: D9/05.1-06 live config-error/config-changed proof | — / N/A | N/A | manual / human_judgment | none automatable | n/a | ⬜ pending |
| 08-03-03 | 03 | 2 | Human-judgment: D7/05.1-04 live backup badge round-trip | — / N/A | N/A | manual / human_judgment | none automatable | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `client/test/unit/components/domain/stack/stack-status-badge.test.tsx` — new file; covers the `animate-pulse` fix for `BACKING_UP`/`RESTORING`/`MIGRATING`, and regression-locks that `DEPLOYING`/`UPDATING` stay blue+pulse while the maintenance trio stay `outline`/gray+pulse (no color change). Same pattern as existing `cert-status-badge.test.tsx`.
- [ ] No shared fixtures needed — pure presentational-component test, one render per status string.
- [ ] Framework install: none — Vitest + Testing Library already configured for `client/`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Deploy/update badge visible live in a second browser tab without reload, mid-action | Todo: manual-actions-dont-broadcast-sse (D6/05.1-02) | Playwright's `client/test/integration/fixtures.ts` route-guard stubs `**/api/events` to an empty stream — hermetic by design, cannot exercise a real SSE round-trip (RESEARCH.md Pitfall 2) | Open two browser tabs on the same stack detail page; trigger Deploy/Update in tab A; confirm the status badge updates in tab B without a manual reload, within the SSE broadcast latency |
| config-changed badge appears after an external `.env` edit (outside the app) with no reload | Todo: env-file-changes-dont-flag-config-changed (D9/05.1-06) | Same hermetic-Playwright limitation; requires a real filesystem watcher + real running instance | Edit the stack's `.env` file directly on disk (not via the app UI); confirm the config-changed badge appears within `FileWatcher`'s detection window with no reload |
| config_error red indicator appears/clears live on YAML syntax error injection/fix | Todo: config-error-ui-indication-missing (D9/05.1-06) | Same hermetic-Playwright limitation | Introduce a YAML syntax error into a running stack's compose file; confirm the red `Alert`/pill appears without reload; fix the syntax; confirm it clears without reload |
| Backup-badge live round-trip (initiate → BACKING_UP badge visible → complete → badge clears) | Todo: manual-actions-dont-broadcast-sse (D7/05.1-04) | Same hermetic-Playwright limitation | Trigger a backup on a running stack; confirm the `BACKING_UP` badge (with pulse, once 08-02-01 lands) appears without reload and clears on completion |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
