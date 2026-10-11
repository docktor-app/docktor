---
status: diagnosed
trigger: "UAT G-15-14: after startup / sign-in with authenticator code, user is redirected back to /login right after a successful sign-in; second sign-in works"
created: 2026-10-11T00:00:00Z
updated: 2026-10-11T00:00:00Z
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMED. LoginForm / TwoFactorStep call navigate("/") immediately after `await signIn.email()` / `await twoFactor.verifyTotp()`. better-auth's client defers the session-signal toggle (and the get-session refetch) by setTimeout(10ms), so ProtectedRoute mounts on "/" while the useSession atom still holds the stale signed-out value {data:null,isPending:false} (cached from the earlier get-session that redirected the user to /login) and renders <Navigate to="/login" replace/>.
test: real better-auth@1.4.18 client with stubbed fetch (scratchpad experiment) - read the atom at the instant signIn.email / verifyTotp resolves.
expecting/observed: atom = {data:null,isPending:false} at resolve time (=> Navigate /login); session arrives ~15ms later. Awaiting the atom's own refetch() before reading gives the session (=> render app).
next_action: none (diagnose-only). Return to caller.

## Symptoms

expected: After starting the app and signing in once, the user lands in the app and stays signed in; no second login prompt.
actual: "I have experienced after the startup, I had to login twice. I was directly redirected to the login page again. I dont know if this is a caching issue..."
errors: none (no error shown)
reproduction: open the app at / (or any protected route) while signed out -> redirected to /login -> sign in (also: sign out, sign in with authenticator code). Sign-in succeeds, user immediately lands on /login again; second sign-in works.
started: found in Phase 15 UAT (tests 2, 4, 14). Not caused by Phase 15 code: navigate("/") dates from the initial commit (5eef889), better-auth has been 1.4.18 throughout, ProtectedRoute's isPending/!session branches are unchanged by 16de4e0.

## Eliminated

- hypothesis: Secure cookie flag on http drops the session cookie
  evidence: second sign-in on the same origin works; resolveUseSecureCookies is false unless BETTER_AUTH_URL is https; a dropped cookie would fail the second attempt too
  timestamp: 2026-10-11

- hypothesis: Phase 15 changed ProtectedRoute session logic / the accountSecurity store caches a 401
  evidence: git show 16de4e0 - session branches unchanged; useAccountSecurity is only enabled when a session exists, and its failure path renders children rather than redirecting; apiFetch never redirects to /login
  timestamp: 2026-10-11

- hypothesis: Origin guard / rate limiter rejecting the first request
  evidence: those would surface an error in the form (sign-in returns an error), not a silent redirect; /get-session is GET and not in AUTH_STRICT_PATHS (default 100/60s)
  timestamp: 2026-10-11

- hypothesis: server cookieCache / stale server-side session
  evidence: cookieCache deliberately off (auth.ts); server returns the session on the very next get-session (second sign-in works with no server change)
  timestamp: 2026-10-11

## Evidence

- checked: client/src/routes/auth/components/login-form.tsx:70 and :76, two-factor-step.tsx:208-211
  found: both success paths call navigate("/") right after the awaited auth call; nothing waits for the session store
  implication: ProtectedRoute mounts before the session atom is refreshed

- checked: better-auth@1.4.18 dist/client/proxy.mjs (onSuccess, "To avoid race conditions we set the signal in a setTimeout", 10ms)
  found: $sessionSignal toggle (which triggers the get-session refetch) runs 10ms AFTER the sign-in promise resolves; two-factor client plugin registers the same listener for /two-factor/*
  implication: applies to both sign-in/email and two-factor/verify-totp|verify-backup-code

- checked: better-auth@1.4.18 dist/client/query.mjs
  found: atom keeps {data:null,isPending:false} until the refetch's onRequest runs (isPending = data===null)
  implication: for a window of >= 10ms ProtectedRoute sees "not pending, no session"

- checked: experiment race.mjs / race2.mjs (scratchpad)
  found: t=1980 signIn.email resolved, atom data=null isPending=false => Navigate /login; t=1990 refetch starts; t=1997 session set. 2FA path identical. With `await session.get().refetch()` before reading: data=session => render app.
  implication: root cause reproduced against the real client library

- checked: client/test/integration/auth.spec.ts:101-124 and two-factor.spec.ts:76-88
  found: both Playwright sign-in tests do page.goto("/login") first, so the session atom was never populated with a cached null (still initial isPending:true) and the bug cannot appear; unit tests mock useNavigate and @/lib/auth-client
  implication: why the suites are green; explains "after startup" (visiting / first populates the atom with null)

## Resolution

root_cause: Stale cached signed-out session in better-auth's session atom. After `await signIn.email()` / `await twoFactor.verifyTotp()` the code calls navigate("/") immediately, but the atom is only refreshed ~10ms later (client/proxy setTimeout), so ProtectedRoute (protected-route.tsx:65-75) reads {data:null,isPending:false} and redirects to /login. The cookie is valid and the refetch then fills the atom, which is why the second sign-in works.
fix: (not applied - diagnose only) await a session refetch before navigating.
verification: n/a
files_changed: []
