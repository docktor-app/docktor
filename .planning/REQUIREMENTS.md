# Requirements: Docktor — Milestone v0.2.0

**Defined:** 2026-10-21
**Core Value:** Users can deploy, monitor, and manage Docker Compose stacks through a browser UI without needing SSH or Docker CLI access.

## v0.2.0 Requirements

Issue numbers refer to `docktor-app/docktor`. Research: `.planning/research/SUMMARY.md`.

### Migration Hardening

- [x] **MIG-05**: Migration verifies the old stack is really stopped (compose project resolved correctly) before copying data (#102)
- [x] **MIG-06**: Migration copies the correct named volume and detects anonymous volumes instead of silently creating empty ones (#101)
- [x] **MIG-07**: Migration handles `~` bind sources correctly in analysis, rewrite and copy (#104)
- [ ] **MIG-08**: Migration rollback reliably restores the original stack without deleting volumes, reports only verified outcomes, and recovers after a Docktor restart mid-migration (#100)
- [ ] **MIG-09**: Migration backs up after the verified stop of the old stack and before any data copy or destructive step (no data is changed before a backup exists), and checks free disk space on the right filesystem (#107)
- [x] **MIG-10**: Secrets are masked in the migration compose diff (#103)
- [ ] **MIG-11**: Migration progress toast never gets stuck (#105)
- [ ] **MIG-12**: Migration flow follows project conventions and hardens paths (#108)
- [x] **MIG-13**: Compose child processes receive an allowlisted environment, and ownership preservation is verified on Linux in CI (#109)

### Proxy

- [ ] **PRX-01**: User can enable per-domain "WebSocket support" (long-lived connections), default off, persisted with the proxy mapping and shown on the Proxy tab (#86)
- [ ] **PRX-02**: User can set the proxy mode (managed / external); switching is blocked while proxy domains exist (#44)
- [ ] **PRX-03**: In external mode Docktor emits Traefik labels into the service compose file for configured domains (#44)
- [ ] **PRX-04**: In external mode Docktor shows copyable config snippets for Caddy, Nginx Proxy Manager and plain nginx (#44)
- [ ] **PRX-05**: In external mode Docktor deploys no proxy stack, skips certificate management and shows certificates as "managed externally" (#44)

### Access Control

- [ ] **RBAC-01**: Four roles (owner, admin, operator, viewer) with a documented permission matrix shared by server and client (#87, #64)
- [ ] **RBAC-02**: Every API route declares its required permission; the server refuses to boot otherwise
- [ ] **RBAC-03**: Existing instances upgrade with no manual steps; the oldest user becomes owner
- [ ] **RBAC-04**: SSE streams are authorized and filtered per role and closed on session revoke or role change
- [ ] **RBAC-05**: The UI hides actions the user's role cannot perform

### User Administration

- [ ] **USR-01**: Owner/admin can create or invite, edit, and disable users and assign roles (#64)
- [ ] **USR-02**: The last owner cannot be demoted, disabled or deleted

### Audit Log

- [ ] **AUD-01**: An append-only audit log records mutations, auth events and access denials with actor, target and outcome, never secrets (#64, #87)
- [ ] **AUD-02**: Owner/admin can view and filter the audit log

### Password Reset

- [ ] **RST-01**: User can request a password reset by email; known and unknown addresses get the same neutral response (#79)
- [ ] **RST-02**: Reset links are single-use and expire; resetting signs out all sessions and does not bypass 2FA (#79)
- [ ] **RST-03**: The flow is unavailable with a clear message when SMTP is not configured (#79)

### OIDC

- [ ] **OIDC-01**: Owner can configure an OIDC provider in Settings (#61, #87)
- [ ] **OIDC-02**: OIDC sign-in coexists with email+password
- [ ] **OIDC-03**: No implicit account linking or sign-up; identities link only from an authenticated account or to an invited user with a verified email
- [ ] **OIDC-04**: Users without a password credential who sign in via OIDC are exempt from the mandatory-2FA gate
- [ ] **OIDC-05**: better-auth is upgraded to 1.7.x with the existing auth test suite green

## Future Requirements

- Per-stack access scoping (a `can(user, action, {stackId?})` seam is built now)
- ProxyProvider abstraction (#43)
- Just-in-time OIDC user creation

## Out of Scope

| Feature | Reason |
|---------|--------|
| Per-stack scoping | Compose edit is host-root via Docker socket; global roles first |
| ProxyProvider abstraction (#43) | Deferred by user |
| Token-authenticated REST API (#60) | Separate milestone |
| LDAP | OIDC covers external identity providers |
| better-auth SSO plugin / SAML | Larger attack surface than needed |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MIG-05 | Phase 22 | Complete |
| MIG-06 | Phase 22 | Complete |
| MIG-07 | Phase 22 | Complete |
| MIG-08 | Phase 22 | Pending |
| MIG-09 | Phase 22 | Pending |
| MIG-10 | Phase 22 | Complete |
| MIG-11 | Phase 22 | Pending |
| MIG-12 | Phase 22 | Pending |
| MIG-13 | Phase 22 | Complete |
| PRX-01 | Phase 23 | Pending |
| PRX-02 | Phase 23 | Pending |
| PRX-03 | Phase 23 | Pending |
| PRX-04 | Phase 23 | Pending |
| PRX-05 | Phase 23 | Pending |
| OIDC-05 | Phase 24 | Pending |
| RBAC-01 | Phase 24 | Pending |
| RBAC-02 | Phase 24 | Pending |
| RBAC-03 | Phase 24 | Pending |
| RBAC-05 | Phase 24 | Pending |
| AUD-01 | Phase 25 | Pending |
| AUD-02 | Phase 25 | Pending |
| RBAC-04 | Phase 25 | Pending |
| RST-01 | Phase 26 | Pending |
| RST-02 | Phase 26 | Pending |
| RST-03 | Phase 26 | Pending |
| USR-01 | Phase 26 | Pending |
| USR-02 | Phase 26 | Pending |
| OIDC-01 | Phase 27 | Pending |
| OIDC-02 | Phase 27 | Pending |
| OIDC-03 | Phase 27 | Pending |
| OIDC-04 | Phase 27 | Pending |

**Coverage:**
- v0.2.0 requirements: 31 total
- Mapped to phases: 31 (Phase 22: 9, Phase 23: 5, Phase 24: 5, Phase 25: 3, Phase 26: 5, Phase 27: 4)
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-21*
*Last updated: 2026-10-21 after roadmap creation (traceability mapped)*
