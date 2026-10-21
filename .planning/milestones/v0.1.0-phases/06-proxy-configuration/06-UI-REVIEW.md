# Phase 6 — UI Review

**Audited:** 2026-09-07
**Baseline:** 06-UI-SPEC.md (approved 2026-09-03)
**Screenshots:** not captured (no dev server detected on :3000 or :5173 — code-only audit)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 2/4 | "Update Domain" edit-mode CTA declared in the contract was never implemented — no edit flow exists at all |
| 2. Visuals | 3/4 | Focal point and aria-label requirements met; cert-pending badge missing its spec'd hover/helper explanation text |
| 3. Color | 4/4 | No hardcoded colors, accent/warning/success roles used exactly as declared, no new tokens introduced |
| 4. Typography | 4/4 | Only `text-sm`/`text-xs` in use, zero `font-medium`, matches the 2-weight contract exactly |
| 5. Spacing | 4/4 | `space-y-4`/`space-y-6`/`gap-1..3` used consistently; no arbitrary spacing values found |
| 6. Experience Design | 1/4 | Initial data-load failures are silently swallowed in both `ProxyTab` and `ProxySettingsCard`, leaving the UI permanently stuck on a loading skeleton with no error state and no retry path |

**Overall: 18/24**

---

## Top 3 Priority Fixes

1. **Silent load-failure = permanent stuck skeleton** — `proxy-tab.tsx:90-94` and `proxy-settings-card.tsx:43-46` catch the initial fetch with an empty `catch {}` block, set `loading=false`, but leave `configs`/`state` as `null`. The render guard is `if (loading || configs === null ...)`, so on any network/API failure the user is stuck on the `Skeleton` forever with zero feedback and no way to recover short of a full page reload. Fix: on catch, set an `error` state and render a retry-capable error message (matching the `toast.promise` error convention already used elsewhere in the same file), not an indefinite skeleton.

2. **"Update Domain" edit flow is entirely unbuilt** — the UI-SPEC's Copywriting Contract explicitly declares a second CTA state ("button label swaps from 'Assign Domain' when editing an existing `ProxyConfig` row"), but `proxy-tab.tsx` has no `editing`/`isEditing` state, no row-click-to-edit affordance, and the Table's action column only renders a Remove button. Users cannot change a domain's internal port or TLS setting without deleting and re-creating the `ProxyConfig` row. Fix: either implement the edit affordance per spec, or if genuinely out of MVP scope, update the UI-SPEC/PLAN to formally descope it rather than leaving a shipped contract violation.

3. **Cert-pending badge missing its spec'd explanatory text** — the Copywriting Contract requires "Cert pending" to carry helper text ("Requesting a certificate from Let's Encrypt. This can take a minute...") "on hover/below," but `cert-status-badge.tsx`'s pending branch (lines 37-46) renders a bare `Badge` with no `title` attribute, tooltip, or adjacent helper text. A user seeing "Cert pending" indefinitely has no way to learn why or how long to wait. Fix: add a `title` attribute (cheapest fix, mirrors the truncate-with-title convention already used for domain cells) or wrap in a `Tooltip`.

---

## Detailed Findings

### Pillar 1: Copywriting (2/4)
- `client/src/routes/app/stacks/components/proxy-tab.tsx`: "Assign Domain" (line 343), empty-state heading/body (lines 176-183), gating-state heading/body/"Go to Settings" link (lines 145-155), remove-confirmation dialog copy (lines 358-362, 370), toast triples (lines 111-113, 121-123), D-13 warning text (lines 293-296) — all verbatim matches to the contract. Good.
- **Missing entirely:** the "Update Domain" CTA state (spec line 115) has no corresponding code — `grep -n "Update Domain\|editing\|isEditing"` returns zero matches in `proxy-tab.tsx`. This is a declared contract element that was never built, not merely styled differently.
- `client/src/components/domain/stack/cert-status-badge.tsx`: "Secured" (line 19), "Cert failed" (line 27) match; "Cert pending" (line 44) matches the label but is missing its required helper text per the contract (see Pillar 2/Top-3 #3).
- `proxy-settings-card.tsx`: "Save Proxy Settings" (line 177) and "Deploy Proxy Stack" (line 154) match; D-11 alert text (lines 164-166) matches verbatim.
- `proxy-step.tsx`: "Deploy Proxy Stack" (line 78), "Skip" (line 76), D-11 alert text (lines 63-65) all match verbatim.

### Pillar 2: Visuals (3/4)
- Focal point requirement met: the domain `Table`/empty-state Card renders before the "Assign Domain" form in `proxy-tab.tsx`'s source order (lines 172-262 vs. 264-348).
- Icon-only remove button carries `aria-label={\`Remove ${row.domain}\`}` (line 248) — the checker's FLAG from sign-off is closed.
- Gap: the pending cert badge conveys no explanation of what "pending" means or how long to expect it (see above) — a hierarchy/affordance gap, not severe enough alone to fail the pillar, but a real deviation.
- Truncate-with-title convention correctly applied to domain cells (`max-w-xs truncate` + `title={row.domain}`, lines 210-212), matching the spec's backstop resolution.

### Pillar 3: Color (4/4)
- `grep` across all four phase files for hex/`rgb(` literals: zero matches — all color usage goes through Tailwind utility classes or CSS variables.
- Warning amber (`bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200 dark:border-yellow-800`) reused verbatim in both `cert-status-badge.tsx` (line 41) and `proxy-tab.tsx`'s D-13 alert (line 290) — exact class match to the spec, no drift.
- Success green (`text-green-600`) used only on the "Secured" badge (`cert-status-badge.tsx` line 18) — matches spec's reserved usage.
- Destructive variant used for "Cert failed" badge, remove-confirm action, and both D-11 alerts — matches spec's reserved usage; no accent (`--primary`) leakage onto table rows or badges.
- `ProxySettingsCard`'s "Deploy Proxy Stack" correctly uses `variant="outline"` (not primary), reserving `--primary` for the card's one true primary submit, exactly as the SUMMARY claims.

### Pillar 4: Typography (4/4)
- Only `text-sm` and `text-xs` found across the four audited files (`grep` output: `text-sm` x4, `text-xs` x2) — well within the spec's declared 2-size scale (Body/Label at 14px, Caption at 12px; no Heading-size utility needed since `CardTitle` supplies it structurally).
- Zero `font-medium` occurrences confirmed independently — every `FormLabel` uses `font-semibold` (600), matching the contract's explicit override instruction.

### Pillar 5: Spacing (4/4)
- `space-y-4` inside every `CardContent`, `space-y-6` between top-level Cards in `ProxyTab` (line 172) — matches the declared md/lg tokens.
- `gap-1`/`gap-2`/`gap-3` used for compact control and stacked-cell spacing (e.g. lines 206, 221, 228, 242, 271) — matches the xs/sm tokens.
- No arbitrary bracket spacing values (`grep` for `\[.*px\]|\[.*rem\]` returns none in these files).
- The `ml-10` indent token was correctly not invoked anywhere, matching the SUMMARY's note that no disclosed-sub-field pattern was needed for this plan.

### Pillar 6: Experience Design (1/4)
- Loading state: `Skeleton` placeholders render correctly on initial mount in both `ProxyTab` and `ProxySettingsCard`.
- **Blocker:** neither component distinguishes "still loading" from "failed to load." Both effects wrap `getProxyConfigs`/`getProxySettings`/`saveProxySettings` fetches in a bare `catch { /* silently fail */ }` (proxy-tab.tsx:90-94; proxy-settings-card.tsx:43-46) with a comment claiming this "mirrors backup-config-card.tsx's load effect" — but the render guard (`loading || configs === null || deployed === null`, line 127; `loading || state === null`, line 84) means a failed fetch leaves the user staring at a Skeleton indefinitely, with no retry button, no error message, and no way to know something went wrong. This breaks the task ("view/manage proxy domains") outright on any transient API failure — a BLOCKER, not a cosmetic gap.
- Empty state: correctly implemented ("No domains configured", lines 173-184).
- Gating state (proxy stack not deployed): correctly implemented with a working link to Settings (lines 141-159).
- Error toasts for assign/remove/save actions (post-initial-load) are correctly wired via `toast.promise` and do surface errors to the user — this is the one part of error handling that works.
- Deploy-action failure in both `ProxySettingsCard` and `ProxyStep` is correctly surfaced inline with the raw error (D-11), a genuine strength.
- Destructive confirmation (`AlertDialog` for domain removal) is correctly implemented, replacing the legacy bare-`confirm()` pattern per the spec's recommendation.
- Protected-stack disabling (Stop/Restart/Delete) was not directly re-verified in this audit pass (out of the four required-reading summaries' primary file set for 06-05/06-06) but is documented as unit-tested in 06-05-SUMMARY.md.

---

## Registry Safety

`components.json` exists; UI-SPEC declares no third-party registries (`shadcn official` only) — registry audit not required. Skipped.

---

## Files Audited

- `client/src/routes/app/stacks/components/proxy-tab.tsx`
- `client/src/components/domain/stack/cert-status-badge.tsx`
- `client/src/routes/app/settings/components/proxy-settings-card.tsx`
- `client/src/routes/setup/components/proxy-step.tsx`
- `.planning/phases/06-proxy-configuration/06-UI-SPEC.md`
- `.planning/phases/06-proxy-configuration/06-05-SUMMARY.md`
- `.planning/phases/06-proxy-configuration/06-06-SUMMARY.md`
- `.planning/phases/06-proxy-configuration/06-CONTEXT.md`
