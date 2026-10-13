---
phase: 15-access-hardening
reviewed: 2026-10-11T00:00:00Z
depth: standard
files_reviewed: 37
files_reviewed_list:
  - client/src/components/domain/auth/protected-route.tsx
  - client/src/components/domain/auth/recovery-codes-panel.tsx
  - client/src/components/nav-user.tsx
  - client/src/hooks/use-account-security.ts
  - client/src/lib/account-api.ts
  - client/src/lib/api.ts
  - client/src/lib/auth-client.ts
  - client/src/lib/auth-errors.ts
  - client/src/lib/clipboard.ts
  - client/src/lib/rate-limit.ts
  - client/src/lib/recovery-codes-file.ts
  - client/src/router.tsx
  - client/src/routes/app/account.tsx
  - client/src/routes/app/account/components/dialog-form-parts.tsx
  - client/src/routes/app/account/components/disable-two-factor-dialog.tsx
  - client/src/routes/app/account/components/enroll-dialog.tsx
  - client/src/routes/app/account/components/enrollment-required-alert.tsx
  - client/src/routes/app/account/components/mandatory-two-factor-row.tsx
  - client/src/routes/app/account/components/regenerate-codes-dialog.tsx
  - client/src/routes/app/account/components/two-factor-section.tsx
  - client/src/routes/auth/components/login-form.tsx
  - client/src/routes/auth/components/two-factor-step.tsx
  - client/src/routes/setup.tsx
  - server/src/app.ts
  - server/src/application/account-security-service.ts
  - server/src/domain/two-factor-policy.ts
  - server/src/lib/auth-config.ts
  - server/src/lib/auth-middleware.ts
  - server/src/lib/auth.ts
  - server/src/lib/errors.ts
  - server/src/lib/origin-guard.ts
  - server/src/lib/two-factor-hooks.ts
  - server/src/repositories/account-security-repository.ts
  - server/src/routes/account.ts
  - server/src/routes/auth.ts
  - server/src/scripts/reset-two-factor.ts
  - shared/src/validation/account.ts
findings:
  critical: 0
  warning: 7
  info: 7
  total: 14
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-10-11
**Depth:** standard
**Files Reviewed:** 37
**Status:** issues_found

## Summary

Reviewed the Phase 15 access-hardening change set (TOTP 2FA with recovery codes, mandatory-2FA gate, DB-backed rate limiting, Origin guard, trust-proxy handling, on-box reset script) across server, shared and client. better-auth 1.4.18 sources in `node_modules` were read to check the hook assumptions (shared per-call `ctx.context`, `newSession` population via `setSessionCookie`, after-hook error semantics, trailing-slash / double-slash handling, `disabledPaths` normalisation, default encrypted backup-code storage). Those assumptions hold, and I found no exploitable bypass of the enrollment gate, the mandatory-disable guard, the Origin guard or the disabled-path list.

No blockers. The main residual risks are:

- The strict rate limit can be exceeded by concurrent requests (upstream non-atomic counter).
- A post-commit hook failure can leave the user without their regenerated recovery codes.
- Several client robustness defects: stuck login button, silently ignored setup auto-login failure, an account-security store that discards or mixes state, and a download revoked too early.

## Warnings

### WR-01: Strict sign-in / 2FA rate limit is bypassable by concurrent requests (non-atomic counter)

**File:** `server/src/lib/auth-config.ts:107-119`
**Issue:** `buildRateLimitConfig` selects `storage: "database"` and promises "5 attempts per 15 minutes". better-auth's limiter (`dist/api/rate-limiter/index.mjs`, `onRequestRateLimit`) does `storage.get(key)`, then a separate `storage.set(key, {count: data.count + 1})`. That is a non-atomic read-modify-write. A burst of N parallel requests from one IP can all read the same `count` before any write lands, so far more than 5 password / TOTP / recovery-code guesses can be attempted per window. The comment on `AUTH_STRICT_PATHS` presents the budget as a hard limit, and the brute-force protection for `verify-totp` and `verify-backup-code` rests on it.
**Fix:** Do not rely on the limiter as the only brute-force control. Options:
- Add an account-scoped attempt counter for the verify endpoints, using an atomic `UPDATE ... SET count = count + 1` or `INSERT ... ON CONFLICT DO UPDATE` through `AccountSecurityRepository`, checked in the `before` hook (`two-factor-hooks.ts`).
- Provide a custom `rateLimit.customStorage` whose `set` increments atomically.
- At minimum, document the limitation next to `AUTH_STRICT_MAX`.

### WR-02: LoginForm stays stuck in "Signing in..." when the sign-in call rejects

**File:** `client/src/routes/auth/components/login-form.tsx:43-77`
**Issue:** `loading` is toggled by hand (`setLoading(true)` ... `setLoading(false)` on the error and 2FA branches only). `onSubmit` has no `try/finally`. If `signIn.email` rejects (offline, DNS failure, connection reset), `handleSubmit` rethrows, nothing resets `loading`, and the button stays disabled with "Signing in..." until a reload. `refreshSession()` and `navigate()` cannot reject, but the sign-in fetch can. The sibling forms (`two-factor-step.tsx`, the dialogs) use `formState.isSubmitting`, which resets correctly.
**Fix:** Drop the manual `loading` state and use `form.formState.isSubmitting`, or wrap the body:
```tsx
setLoading(true);
try {
    /* existing body */
} catch {
    setError("Couldn't reach the server. Check your connection and try again.");
} finally {
    setLoading(false);
}
```

### WR-03: Setup wizard ignores a failed auto-login and proceeds as if signed in

**File:** `client/src/routes/setup.tsx:62-66`
**Issue:** `await signIn.email(...)` returns `{data, error}` and does not throw on 4xx/429. The result is discarded, then `refreshSession()` (which never rejects) runs and the wizard marks step 1 complete. If sign-in fails (rate-limited from a shared IP, a transient server error), the user advances to step 2 with no session, sees "Account created successfully", and only gets bounced to `/login` at the very end. This path now depends on the new session-store refresh, so a silent failure is harder to notice.
**Fix:**
```ts
const {error} = await signIn.email({email: data.email, password: data.password});
if (error) throw new Error(error.message ?? "Account created, but automatic sign-in failed. Sign in manually.");
await refreshSession();
```

### WR-04: A failed status refresh discards the last known account-security status

**File:** `client/src/hooks/use-account-security.ts:47-51`
**Issue:** On any fetch error, `load()` publishes `{status: null, loading: false, error}` even when a good status was already held. Consequences:
- A transient failure of the `ENROLLMENT_REQUIRED_EVENT`-triggered refresh (`protected-route.tsx:58-60`) wipes `enrollmentRequired: true`. `ProtectedRoute` then renders the children instead of redirecting to `/account`, so the user sees broken 403 pages.
- After a successful change (enroll, disable, regenerate), a refresh blip makes the Account page drop the whole Security section in favour of the error alert.
**Fix:** Keep the previous status on error:
```ts
publish({status: state.status, loading: false, error});
```
`account.tsx` already renders the sections when `status` is present, so the error can be surfaced separately.

### WR-05: Shared module-level store can serve another user's status or a stale in-flight result

**File:** `client/src/hooks/use-account-security.ts:67-74`, `client/src/components/domain/auth/protected-route.tsx:38-51`
**Issue:** Two related staleness holes in the singleton store:
1. The store is not keyed by user. Clearing it depends on a `ProtectedRoute` that stays mounted across the user change (the `lastUserId` ref is lost on unmount). If the user leaves the protected tree by SPA navigation (for example the "Sign up" link or browser Back to `/login`) while signed in, then signs in as someone else, the new `ProtectedRoute` starts with `previous === undefined` and the previous user's status (`twoFactorEnabled`, `mandatory`) stays in the store. `useAccountSecurity` only fetches when `status === null`, so the Account page shows the wrong user's 2FA state, and the forced-enrollment redirect is missed until a 403 event fires.
2. `refresh()` returns the existing `inFlight` promise. A caller that has just changed state (`onChanged` after enroll or disable) can be handed a request that started before the change, and the stale result wins.
**Fix:** Store the user id with the snapshot and reset when `useSession` yields a different id regardless of mount history (for example `setOwner(userId)` inside the store). For (2), when `refresh()` is called while a request is in flight, chain a follow-up fetch instead of returning the old one, or add a `force` option used by `onChanged`.

### WR-06: Recovery-code download revokes the object URL synchronously

**File:** `client/src/lib/recovery-codes-file.ts:19-28`
**Issue:** `URL.revokeObjectURL(url)` runs immediately after `anchor.click()`. Safari and some Firefox versions start the download asynchronously and fail or save an empty or missing file when the URL is revoked this early. The panel is the only chance to capture the recovery codes: a failed download is silent (no toast), and the user then ticks "I have saved these recovery codes".
**Fix:** Defer the revoke:
```ts
anchor.click();
anchor.remove();
setTimeout(() => URL.revokeObjectURL(url), 1000);
```
Optionally return a boolean or toast so the user knows to use Copy instead.

### WR-07: A failure in the after-hook turns a committed 2FA change into an error response (recovery codes lost)

**File:** `server/src/lib/two-factor-hooks.ts:87-91`
**Issue:** `signOutOtherSessions` and `deps.deleteTrustDeviceRecords` run after the endpoint has already committed. In better-auth's `runAfterHooks`, only `APIError` is caught; any other exception (a DB blip) propagates and the client receives a 500. For `/two-factor/generate-backup-codes` the new codes are already stored and the old ones invalidated, but the response carrying the new codes is replaced by the error. The user is left with no valid recovery codes and no idea. For `verify-totp` or `disable` the change is applied but reported as failed.
**Fix:** Make the revocation best-effort and never let it replace a successful result. Log the error; optionally retry once:
```ts
try {
    await signOutOtherSessions(ctx, captured.userId, plan.keepToken);
    await deps.deleteTrustDeviceRecords(captured.userId);
} catch (error) {
    ctx.context.logger.error("2FA change: session revocation failed", error);
}
```

## Info

### IN-01: `apiFetch` throws a TypeError on a JSON `null` error body

**File:** `client/src/lib/api.ts:57-68`
**Issue:** `res.json().catch(() => ({}))` only guards unparseable bodies. A valid body of `null` (or a primitive) makes `body.code`, `body.error` and `body.fields` throw a TypeError that masks the `ApiError`. The `body` is also implicitly `any`, which conflicts with the project's no-`any` rule.
**Fix:** Type it as `unknown`, narrow to an object (`typeof body === "object" && body !== null`), and read the fields from the narrowed shape.

### IN-02: `maxLength={6}` truncates pasted codes that contain a space

**File:** `client/src/routes/app/account/components/enroll-dialog.tsx:259`, `client/src/routes/auth/components/two-factor-step.tsx:102`
**Issue:** The native `maxLength` truncates the pasted string before `onChange` strips non-digits. A code pasted as "123 456" becomes "123 45", then "12345", and fails the 6-digit schema, which looks like a bad code.
**Fix:** Remove `maxLength` and let the `replace(/\D/g, "").slice(0, 6)` in `onChange` do the limiting.

### IN-03: Copying the setup key gives no success feedback

**File:** `client/src/routes/app/account/components/enroll-dialog.tsx:171`
**Issue:** `copyToClipboard(setupKey)` toasts only on failure. The recovery-codes panel shows a "Copied" state; the setup key button does not, so users cannot tell whether the copy worked.
**Fix:** Reuse the "Copied" pattern from `RecoveryCodesPanel`, or `toast.success` on a `true` result.

### IN-04: Sign-out is fire-and-forget with no error handling

**File:** `client/src/components/nav-user.tsx:56`
**Issue:** `onClick={() => signOut()}` drops the promise. A network failure produces an unhandled rejection and the user remains signed in with no feedback.
**Fix:** `onClick={() => void signOut().catch(() => toast.error("Couldn't sign out. Try again."))}`.

### IN-05: Retry-After handling is duplicated instead of using `createRetryAfterProbe`

**File:** `client/src/routes/auth/components/login-form.tsx:47-56`, `client/src/routes/auth/components/two-factor-step.tsx:41-51,202-207`
**Issue:** Both re-implement the capture of `X-Retry-After` by hand. `two-factor-step.tsx` also redeclares `FetchErrorContext`, which already exists in `lib/rate-limit.ts`, while the account dialogs use `createRetryAfterProbe()`. Two copies of one rule will drift.
**Fix:** Use `createRetryAfterProbe()` in both and export or remove the duplicate interface.

### IN-06: Duplicated dialog steps and repository construction outside the singleton rule

**File:** `client/src/routes/app/account/components/enroll-dialog.tsx:80-131` vs `regenerate-codes-dialog.tsx:37-95`, `server/src/lib/auth.ts:22-24`
**Issue:**
- The password-confirm step (form, probe, error switch, footer) and the saved-codes step are near copies across the enroll and regenerate dialogs. The next change to the error mapping has to be made twice.
- `lib/auth.ts` constructs private `SettingsRepository` and `AccountSecurityRepository` instances, bypassing the "export singleton repository instances from `repositories/index.ts`" rule. The comment justifies it, but `lib/` also now holds business reads (`isTwoFactorMandatory`) that sit in the wrong layer.
**Fix:** Extract a shared `PasswordConfirmForm` that takes the `twoFactor.*` call as a prop, and move `isTwoFactorMandatory` behind a small injected function so `auth.ts` does not need its own repositories.

### IN-07: Formatting slip and stale comment

**File:** `server/src/lib/auth-config.ts:99`, `client/src/lib/auth-errors.ts:10-14`
**Issue:** `type RateLimitConfig =NonNullable<...>` is missing a space. The `auth-errors.ts` comment says the 15-01 integration tests "had not been executed ... CI is the first real confirmation". UAT is now complete, so the note is stale. The classifier also keys on English message strings, which is fragile if better-auth changes wording; the `code` branch only helps if the client surfaces it.
**Fix:** Fix the spacing, update the comment, and add a unit test that pins each matched message to the installed better-auth version.

---

_Reviewed: 2026-10-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
