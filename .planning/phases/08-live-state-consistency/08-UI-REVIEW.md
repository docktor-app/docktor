# Phase 08 — UI Review

**Audited:** 2026-09-20
**Baseline:** `.planning/phases/08-live-state-consistency/08-UI-SPEC.md` (approved design contract)
**Screenshots:** not captured (no dev server detected on :3000 or :5173 — code-only audit)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All locked copy strings match the contract verbatim |
| 2. Visuals | 2/4 | `BACKING_UP` was promoted to blue post-approval (08-04) but `08-UI-SPEC.md` itself was never amended — the written contract now actively contradicts the shipped code |
| 3. Color | 3/4 | Status color language correctly implemented except the same stale-contract issue; config-error/config-changed pills are still hand-rolled `<span>`s, not `Badge`, exactly as the spec flagged as a pre-existing debt (not required to fix, but unaddressed) |
| 4. Typography | 4/4 | Badge/Alert typography untouched, inherited from primitives as required |
| 5. Spacing | 4/4 | No new spacing introduced; existing `gap-1`/`gap-2` patterns preserved |
| 6. Experience Design | 3/4 | Core SSE-origin gating and pulse cues are solid, but the `BLOCKED_STATES` gap (Deploy stays clickable during `UPDATING`/`MIGRATING`) remains unresolved and un-triaged by a human (V8 never executed) |

**Overall: 20/24**

---

## Top 3 Priority Fixes

1. **`08-UI-SPEC.md` is stale against shipped code** — Lines 140 and 148-150 of the spec explicitly say "do not switch \[`BACKING_UP`\] to blue," but `08-04-SUMMARY.md`/`stack-status-badge.tsx` shipped exactly that change based on a live user judgement call (G-08-7). Anyone reading the design contract today gets an actively wrong answer about the current badge treatment. Fix: amend the Color section of `08-UI-SPEC.md` (or append a superseding addendum) to record the blue treatment for `BACKING_UP` as final, so the contract and the code agree. This is a documentation-integrity defect, not a code defect, but it will mislead the next phase's auditor or planner who trusts the spec over the diff.

2. **`BLOCKED_STATES` still omits `UPDATING`/`MIGRATING`** (`client/src/routes/app/stacks/components/stack-actions.tsx:33`) — Deploy button remains clickable while a stack is `UPDATING` or `MIGRATING`; server-side `assertTransition()` rejects the click with an error toast, so there's no data-safety issue, but it is a confirmed UX rough edge the phase's own UAT script (V8) was written specifically to adjudicate. Per the SUMMARY files, V8 was never executed (Branch B reachability block in 08-01, and no later plan revisited it). This leaves an open judgement call with no recorded verdict — the phase cannot be called fully verified until a human answers V8 and either closes the row as "leave it" or files a follow-up todo. Fix: run V8 on an unblocked host and record the answer; if "yes, confusing," add `UPDATING`/`MIGRATING` to `BLOCKED_STATES`.

3. **V1–V7 live-verification items are still unexecuted** — every `human_judgment: true` coverage item across 08-01 (D3–D10) has empty `verification: []`. The phase's actual runtime behavior (cross-tab SSE badge sync, config-changed banner propagation, backup-error toast, live pulse readability) has zero confirmed evidence beyond unit tests and source-reading. The unit-level proof (badge pulse logic, toast-gating logic) is solid, but nothing confirms the DOM/SSE round trip actually renders correctly in a browser. Fix: execute the 8-item script recorded in `08-01-SUMMARY.md` on a host where the dev server can boot, and update coverage `status` fields from `human_judgment: true` (unresolved) to `pass`/`fail` with recorded observations.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)
- Config-error alert: `Configuration file has an error: {stack.configError}` — matches `[id].tsx:222` exactly.
- Config-changed alert: `Configuration has changed since last deployment. Re-deploy to apply changes.` — matches `[id].tsx:232` (confirmed via grep context).
- Config-error pill: `config error` — matches `stack-list.tsx:33`.
- Config-changed pill: `config changed` — matches `stack-list.tsx:38`.
- Toast copy for deploy/stop/restart/update in `stack-actions.tsx` and `Configuration file changed externally` in `use-stack.ts:79` — all match the contract table verbatim. No generic "Submit"/"OK"/"Click Here" placeholders found in the touched files.

### Pillar 2: Visuals (2/4)
- Icon-only "Stack actions" trigger correctly carries `aria-label="Stack actions"` (`stack-actions.tsx:171`) — passes the icon-button accessibility check.
- **Contract drift, not implementation defect:** `08-UI-SPEC.md` (lines 139-150) locks `BACKING_UP` to gray/outline with pulse-only motion, and explicitly instructs "do not switch these to blue, which is reserved for user-initiated deploy/update actions." Plan 08-04 shipped the opposite — `BACKING_UP` now renders with the identical blue/default/`animate-pulse` treatment as `DEPLOYING`/`UPDATING` (`stack-status-badge.tsx:15,29`) — based on a live human answer to the phase's own V7 judgement call ("change it also to blue," per `08-04-SUMMARY.md`). The code change itself is traceable and intentional, but the spec document that is supposed to be the audit baseline was never updated to reflect it. An auditor (or the next phase's planner) reading only `08-UI-SPEC.md` will conclude the current code is wrong when it is in fact correct and the doc is outdated.
- Visual hierarchy for the three "in-progress" buckets (blue-pulse for user actions, gray-pulse for RESTORING/MIGRATING) is internally consistent in code, just inconsistently documented.

### Pillar 3: Color (3/4)
- Semantic status-color table is implemented correctly: green (RUNNING/HEALTHY), red (ERROR/UNHEALTHY), gray (STOPPED/DRAFT), blue+pulse (DEPLOYING/UPDATING/BACKING_UP post-08-04), gray+pulse (RESTORING/MIGRATING) — all confirmed in `stack-status-badge.tsx:20-32`.
- Config-error/config-changed color usage (red/yellow) is correct and matches the contract's independent-flag semantics in both `stack-list.tsx` and `[id].tsx`.
- Pre-existing, spec-acknowledged debt left untouched: config-error/config-changed pills in `stack-list.tsx:32,37` are still hand-rolled `<span>` elements with inline Tailwind classes rather than the `Badge` primitive the spec calls out ("do not introduce a third hand-rolled pill style; if touching that file, prefer `Badge`"). This phase did touch `stack-list.tsx` indirectly in scope discussion but did not migrate these spans — acceptable since the spec frames this as advisory ("if touching that file"), not mandatory, but it remains a live inconsistency between the componentized `StackStatusBadge` and the two ad-hoc pills sitting next to it in the same row.

### Pillar 4: Typography (4/4)
- No new font sizes or weights introduced. `Badge` and `Alert` primitives are used unmodified, consistent with the contract's explicit "do not override with one-off classes" instruction. Grep of the touched files shows no stray `text-*`/`font-*` overrides.

### Pillar 5: Spacing (4/4)
- No new spacing values introduced by this phase's diffs (`statusColors`/`statusConfig` are CSS-class-only changes on badges; `use-stack.ts`/`use-container-events.ts`/`stack-service.ts` changes are logic-only, zero markup). Existing `gap-1` pill row and `gap-2` action bar spacing untouched.

### Pillar 6: Experience Design (3/4)
- **Strength:** SSE-origin gating (`event.source === "external"`) is a clean, well-tested pattern (`use-stack.ts`, `use-container-events.ts`) that correctly prevents a user from seeing a false "changed externally" toast about their own save — closes G-08-2 client-side cleanly with 17/17 and 11/11 unit coverage.
- **Strength:** Server-side `updateStack()` now guards a compose-parse failure into a typed `BadRequestError` instead of an unguarded raw `Error` reaching Fastify's 500 catch-all (closes G-08-6), and syncs `lastEnvHash` on every app-driven env write — both are real correctness fixes with unit coverage, not merely cosmetic.
- **Gap:** `BLOCKED_STATES` (`stack-actions.tsx:33`) still excludes `UPDATING`/`MIGRATING`, a known rough edge the spec explicitly flagged as "unresolved" pending live human confirmation (V8). That confirmation never happened across any of the four plans in this phase — coverage item D10 in `08-01-SUMMARY.md` still shows `verification: []`.
- **Gap:** All eight `human_judgment: true` coverage items (D3-D10 in 08-01) remain unexecuted due to a documented environment reachability block (Branch B — Postgres SSLRequest frame unanswered). This means the phase's actual live-DOM/SSE behavior — the entire subject of "live-state-consistency" — has never been observed running, only inferred from unit tests and source reading. The unit tests are good evidence for the underlying logic but are not a substitute for the live verification the phase's own UAT script demands.

---

## Registry Safety

`components.json` present (shadcn initialized), but `08-UI-SPEC.md`'s Registry Safety table lists only `shadcn official` (Badge, Alert, Sonner, all pre-existing) with "No third-party registries declared or used." No third-party blocks to audit — registry audit skipped per the gate condition (no third-party registry present).

Registry audit: 0 third-party blocks checked, no flags.

---

## Files Audited

- `client/src/components/domain/stack/stack-status-badge.tsx`
- `client/src/components/domain/stack/stack-list.tsx`
- `client/src/routes/app/stacks/[id].tsx`
- `client/src/routes/app/stacks/components/stack-actions.tsx`
- `client/src/hooks/use-stack.ts`
- `client/src/hooks/use-container-events.ts`
- `server/src/lib/state-broadcaster.ts`
- `server/src/jobs/file-watcher.ts`
- `server/src/application/stack-service.ts`
- `.planning/phases/08-live-state-consistency/08-UI-SPEC.md`
- `.planning/phases/08-live-state-consistency/08-01-SUMMARY.md` through `08-04-SUMMARY.md`
- `.planning/phases/08-live-state-consistency/08-01-PLAN.md` through `08-04-PLAN.md`
