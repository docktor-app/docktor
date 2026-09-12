---
phase: "07"
slug: "release-hardening-data-safety-and-core-workflows"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-12"
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing — `server/vitest.config.ts`) |
| **Config file** | `server/vitest.config.ts` |
| **Quick run command** | `yarn workspace @docktor/server test:unit` |
| **Full suite command** | `yarn workspace @docktor/server test` |
| **Estimated runtime** | ~30 seconds (unit), ~2-3 minutes (full incl. integration) |

---

## Sampling Rate

- **After every task commit:** Run `yarn workspace @docktor/server test:unit`
- **After every plan wave:** Run `yarn workspace @docktor/server test`
- **Before `/gsd-verify-work`:** Full suite must be green, plus a manual `docker exec <container> cat /proc/self/mountinfo` sanity check against a real running Docktor container
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | Bug 2 (mount-point check) | — | `isMountPoint()` returns `true` for a path present as its own `mountinfo` entry, `false` otherwise | unit | `vitest run --project unit server/test/unit/lib/stacks-dir.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | Bug 2 (boot wiring) | — | Boot sequence in `index.ts` calls the new check after `ensureStacksDir()` and exits non-zero on failure | manual | `docker exec <container> cat /proc/self/mountinfo` + boot-log inspection | N/A — `index.ts` has no dedicated test file (existing precedent) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/test/unit/lib/stacks-dir.test.ts` — add cases for the new mount-point check function: matches a fixture `mountinfo` line, does not match when absent, handles octal-escaped paths (e.g. `\040` for space)

*No new fixture/conftest infrastructure needed — the existing test file already establishes the `mkdtemp`/env-var-cleanup pattern to extend.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real container's `/proc/self/mountinfo` matches the format the unit tests fixture | Bug 2 | Unit tests fixture the `mountinfo` content; this phase's core risk (silent data loss) is not fully provable by unit tests alone since they can't see the real container's mount namespace | `docker exec <docktor-container> cat /proc/self/mountinfo`, confirm the resolved stacks path appears as its own mount-point line when a real bind mount is configured, and confirm the new check fails loudly (non-zero exit, clear log message) when it is not |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
