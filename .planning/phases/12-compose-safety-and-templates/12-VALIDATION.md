---
phase: "12"
slug: "compose-safety-and-templates"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-01"
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (server: `vitest@^4.0.18`; client: same via workspace) + Playwright (client E2E) |
| **Config file** | `server/vitest.config.ts` / `client/vitest.config.ts` (existing) |
| **Quick run command** | `yarn workspace @docktor/server test:unit` / `yarn workspace @docktor/client test:unit` |
| **Full suite command** | `yarn test` (root — chains `@docktor/shared build` first) |
| **Estimated runtime** | ~60 seconds (unit), full suite longer with integration/E2E |

---

## Sampling Rate

- **After every task commit:** Run `yarn workspace @docktor/server test:unit` (and `@docktor/client test:unit` for client-side diff/template UI work)
- **After every plan wave:** Run `yarn test` (root, full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-xx-xx | TBD | TBD | #18 | T-12-xx | Diff computed correctly for compose/.env before/after pairs | unit | `vitest run server/test/unit/infrastructure/diff-*.test.ts` | ❌ W0 | ⬜ pending |
| 12-xx-xx | TBD | TBD | #18 | T-12-xx | Save blocked without explicit confirm; first-stack-creation save skips diff (D-02) | unit | `vitest run server/test/unit/application/stack-service.test.ts` | ✅ extend existing | ⬜ pending |
| 12-xx-xx | TBD | TBD | #19 | T-12-xx | Git clone/pull succeeds against fixture repo; malformed template rejected | integration | `vitest run server/test/integration/template-service.test.ts` | ❌ W0 | ⬜ pending |
| 12-xx-xx | TBD | TBD | #19 | T-12-xx | Template version pinned at creation, unaffected by later repo updates | unit | new test file for `template-service.ts` | ❌ W0 | ⬜ pending |
| 12-xx-xx | TBD | TBD | #20 | T-12-xx | Each rule (privileged, socket-mount, bind-outside-stack, named-volume, inline-env, missing-env_file) fires on fixture compose content | unit | `vitest run server/test/unit/infrastructure/compose-analyzer.test.ts` + new per-rule files | ✅/❌ mixed W0 | ⬜ pending |
| 12-xx-xx | TBD | TBD | #20 | T-12-xx | Checks run on save AND FileWatcher-detected change AND pre-deploy (D-09) | integration | new `server/test/integration/file-watcher-rules.test.ts` | ❌ W0 | ⬜ pending |
| 12-xx-xx | TBD | TBD | #21 | T-12-xx | DB-query port-conflict detection finds another Docktor stack on the same port | unit | new `server/test/unit/application/port-conflict-checker.test.ts` | ❌ W0 | ⬜ pending |
| 12-xx-xx | TBD | TBD | #21 | T-12-xx | dockerode-based check finds a non-Docktor container on the same port | unit (mocked dockerode) | new test file, following existing `DockerExecutorPort` mocking pattern | ❌ W0 | ⬜ pending |
| 12-xx-xx | TBD | TBD | #21 | T-12-xx | Deploy proceeds even when a conflict is found (warn-only, never block) | unit | extend `stack-service.test.ts` | ✅ extend existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Task IDs are TBD — the planner fills these in once plans/waves are assigned.*

---

## Wave 0 Requirements

- [ ] `server/test/unit/infrastructure/compose-rules/` — new directory, one test file per new rule (privileged, docker-socket, missing-env_file); the three reused rules (bind-outside-stack, named-volume, inline-env) can extend the existing `compose-analyzer.test.ts`
- [ ] `server/test/unit/infrastructure/diff-service.test.ts` (or wherever diff computation lands) — covers #18
- [ ] `server/test/unit/application/port-conflict-checker.test.ts` — covers #21's DB-query and dockerode tiers
- [ ] `server/test/integration/template-service.test.ts` — covers #19's git-clone + template-schema-validation acceptance criteria (use a local bare repo created in `beforeAll`, not a live network hit to `github.com/docktor-app/templates`)
- [ ] `server/test/integration/file-watcher-rules.test.ts` — covers D-09's "checks also run on FileWatcher-detected changes" requirement

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Merged diff+warning dialog visual layout (D-03) | #18/#20 | Dialog composition/visual review is not meaningfully assertable via automated test beyond render-without-crash | Open an existing stack, edit compose to trigger a warning, save, confirm the dialog shows the diff with inline warning badges next to the offending lines |
| Template grid browse/search UX (D-07) | #19 | Visual card-grid layout and search/filter feel | Open create-stack flow, browse the template grid, filter by category, search by name |
| Real host-level, non-Docker port conflict via `ss`/`lsof` (D-13 last-resort tier) | #21 | Requires a real non-Docker process bound to a host port from inside the running container — an architectural edge case documented as best-effort in RESEARCH.md's Critical Finding; not worth a flaky integration test | Bind a port with a host-level process outside Docker, attempt to deploy a stack requesting the same port, confirm the warning fires or gracefully falls back to "unknown process" |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
