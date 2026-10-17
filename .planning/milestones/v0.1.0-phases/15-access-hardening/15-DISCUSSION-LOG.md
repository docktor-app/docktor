# Phase 15: Access Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-10
**Phase:** 15-access-hardening
**Areas discussed:** Mandatory 2FA policy, Enrollment & recovery UX, Rate limit/CSRF/cookies, Password reset scope

---

## Mandatory 2FA policy

| Question | Options | Selected |
|----------|---------|----------|
| Unenrolled user when mandatory | Forced enrollment at login; Grace period then forced; Block login, admin reset | Forced enrollment at login |
| Who toggles the setting | Any logged-in user; Introduce admin role | Any logged-in user |
| Login flow | Second screen after password; Single form with optional code field | Second screen after password |
| Trust device 30 days | No, always ask; Yes, opt-in checkbox | Yes, opt-in checkbox |

**Notes:** Toggle guarded so it can only be enabled once the toggling user has 2FA (self-lockout prevention).

---

## Enrollment & recovery UX

| Question | Options | Selected |
|----------|---------|----------|
| Where to manage 2FA | Security card on Settings; Dedicated Account page | Dedicated Account page |
| Recovery code presentation | Shown once + confirm saved; Shown once, no gate | Shown once + confirm saved |
| Re-auth required | Enable/disable/regenerate; Only disable/regenerate | Enable/disable/regenerate |
| Lost device and codes | Documented CLI/DB reset; Another user disables; Email reset | Documented CLI/DB reset |

**Notes:** User deviated from the recommended option on location (Account page). Page is scoped to Security only for now.

---

## Rate limit, CSRF, cookies

| Question | Options | Selected |
|----------|---------|----------|
| Limiter | better-auth built-in; @fastify/rate-limit; Both | better-auth built-in |
| Storage | Database; In-memory | Database |
| Client IP | Trusted-proxy env, default off; Always trust XFF; Socket IP only | Trusted-proxy env, default off |
| Thresholds | 5/15min; 10/5min; You decide | 5/15min |
| CSRF | Verify + tests; @fastify/csrf-protection; Origin/Fetch-Metadata hook | Verify + tests |
| Secure cookie | Secure when https base URL; Always in production; Env override | Secure when https base URL |
| Sessions | Defaults + revoke on 2FA change; Shorten lifetime; Defaults, no revocation | Defaults + revoke on 2FA change |

---

## Password reset scope

| Option | Description | Selected |
|--------|-------------|----------|
| Audit only; defer reset | Note reset as follow-up | ✓ |
| Build email reset | Via SMTP settings | |
| CLI-only reset | On-box command | |

---

## Claude's Discretion

- Exact rate-limit windows beyond the 5/15min rule; CLI reset shape; Account page nav details; test layout.

## Deferred Ideas

- Email password reset; admin/role model; Account page extras; Fastify-level rate limiting for non-auth routes; shorter session lifetime.
