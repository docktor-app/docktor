---
status: testing
phase: 15-access-hardening
source: 15-01-SUMMARY.md, 15-02-SUMMARY.md, 15-03-SUMMARY.md, 15-04-SUMMARY.md, 15-05-SUMMARY.md, 15-06-SUMMARY.md
started: 2026-10-11T12:27:56Z
updated: 2026-10-11T15:10:13Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 12
name: Reset Two-Factor from the Server Box
expected: |
  Running the documented reset script on the host (`docs/deployment.md` section "Resetting two-factor authentication") for a user email disables their 2FA, ends all their sessions and trusted devices, exits 0, and the user can sign in with just a password again. An unknown email exits non-zero with a clear message.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state. Start the application from scratch. The new migration (TwoFactor, RateLimit tables, User.twoFactorEnabled) applies, the server boots without errors, and a primary request (health check, login page, or basic API call) returns live data.
result: pass

### 2. Sign-in Rate Limiting
expected: Entering a wrong password 5 times shows the normal "invalid credentials" error. The 6th attempt is refused with a message such as "Too many attempts, try again in N minutes" (based on X-Retry-After), the Sign in button stays enabled, and changing the X-Forwarded-For header does not reset the counter.
result: pass

### 3. Enroll in Two-Factor from the Account Page
expected: User menu has an "Account" item. On /account, "Set up two-factor authentication" opens a 3-step dialog: password, then a QR code (issuer "Docktor", your email) with a "Copy setup key" button, then a 6-digit code check. After verifying, 10 recovery codes appear with Copy codes and Download .txt; Continue is only available after ticking "I have saved". Afterwards the page shows an "Enabled" pill. The QR is readable in light and dark theme.
result: pass

### 4. Sign-in with Authenticator Code
expected: After signing out and entering email and password, the card swaps to a two-factor step asking for the 6-digit code (numeric keypad, one-time-code autofill). An unchecked "Trust this device for 30 days" checkbox and "Back to sign in" are present. A wrong code shows a clear error and clears the input; the correct code signs you in. With trust-device ticked, the next sign-in from that browser skips the code step.
result: pass
note: \"User: had to log in twice again (same as gap G-15-14)\"

### 5. Sign-in with a Recovery Code (single use)
expected: "Use a recovery code" switches the step to an xxxxx-xxxxx input. A valid recovery code signs you in; the same code used again is rejected. "Use authenticator app instead" switches back. The step mentions docs/deployment.md for the lost-everything case.
result: pass

### 6. Regenerate Recovery Codes
expected: On /account with 2FA enabled, "Regenerate recovery codes" asks for your password, then shows 10 new codes (Continue gated by "I have saved") and a toast "Recovery codes regenerated." Old codes no longer work.
result: pass

### 7. Disable Two-Factor
expected: "Disable two-factor" opens a destructive confirm asking for your password. A wrong password shows a field error and leaves 2FA on; the correct password turns it off and the status returns to "Not enabled". While the instance-wide requirement is on, the Disable button is disabled with an explanatory tooltip.
result: pass

### 8. Require Two-Factor Instance-wide
expected: On /account, the "Require two-factor for everyone" switch is disabled with a visible helper if your own account has no 2FA. With 2FA enabled, turning it on shows an AlertDialog "Require two-factor authentication?" and a confirmation toast; turning it off applies immediately.
result: pass

### 9. Forced Enrollment for a User Without 2FA
expected: With the requirement on, a second user without 2FA who signs in is redirected to /account with a "Setup required" alert, and the enrollment dialog opens automatically. Navigating to any other page (sidebar, direct URL) bounces back to /account. After enrolling, the rest of the app is reachable.
result: blocked
blocked_by: other
reason: "No way to register a second user (sign-up is blocked), so a user without 2FA cannot be created for this test. Covered by automated tests only (Playwright forced-enrollment journey, account-security integration)."

### 10. Other Sessions Signed Out on 2FA Change
expected: Signed in on two browsers, enabling 2FA (or disabling / regenerating codes) in one keeps that browser signed in and signs the other browser out on its next request. A failed attempt (wrong password) signs nobody out.
result: pass

### 11. Cross-Origin Write Blocked
expected: A state-changing request to an /api/* route (e.g. curl -X PUT /api/settings ... with a cookie and `Origin: https://evil.example`) is answered 403 {"error":"Cross-origin request blocked","code":"CROSS_ORIGIN_REQUEST_REJECTED"}. The same request from the app's own origin works.
result: pass

### 12. Reset Two-Factor from the Server Box
expected: Running the documented reset script on the host (`docs/deployment.md` section "Resetting two-factor authentication") for a user email disables their 2FA, ends all their sessions and trusted devices, exits 0, and the user can sign in with just a password again. An unknown email exits non-zero with a clear message.
result: [pending]

### 13. Mobile Layout of Enrollment
expected: At phone width (~412 px) the enrollment dialog (QR step and recovery-codes step) scrolls within the viewport, footer buttons stack full width, and nothing overflows horizontally.
result: [pending]

### 14. Single Login After Startup (reported during test 2)
expected: After starting the app and signing in once, the user lands in the app and stays signed in; no second login prompt appears.
result: issue
reported: "I have experienced after the startup, I had to login twice. I was directly redirected to the login page again. I dont know if this is a caching issue, but I think this should be fixed"
severity: major

## Summary

total: 14
passed: 10
issues: 1
pending: 2
skipped: 0
blocked: 1

## Gaps

- gap_id: G-15-14
  truth: "After startup, a single sign-in lands the user in the app and keeps them signed in"
  status: failed
  reason: "User reported: I have experienced after the startup, I had to login twice. I was directly redirected to the login page again. I dont know if this is a caching issue, but I think this should be fixed"
  severity: major
  test: 14
  reproduced: "Also seen during test 4 (sign-in with authenticator code): login required twice."
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
