---
phase: "6"
slug: "proxy-configuration"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-09-07"
---

# Phase 6 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
>
> Register authored at plan time (all 7 plans — 06-01 through 06-07 — carry a `<threat_model>` block). This is a post-execution L1 verification: register_authored_at_plan_time=true, asvs_level=1, threats_open=0 after classification, so per the short-circuit rule this audit verifies mitigations are present in the shipped code rather than scanning for undiscovered threats.
>
> **Threat-ID note:** Plan 06-07 (the G-06-3 gap-closure plan) reuses IDs `T-06-26` through `T-06-29` and `T-06-SC`, which were already assigned by 06-05 and 06-01 respectively. This is a documentation defect in 06-07's authored register (IDs should have continued from `T-06-34`), not a security gap — every threat below is individually verified regardless of ID collision. The table disambiguates with an explicit **Plan** column.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| browser -> `/api/stacks/:id/services/:serviceName/proxy` | untrusted `domain`, `internalPort`, `serviceName`, `id` | proxy assignment request |
| Docktor process -> stack `docker-compose.yml` on disk | attacker-influenced strings become file content Docker later executes against | compose YAML |
| Docktor process -> host Docker daemon (DooD socket) | a compose file written above is executed with host-root-equivalent reach | container lifecycle |
| browser -> `DELETE /api/proxy-configs/:id` | untrusted opaque id | proxy config removal |
| two concurrent HTTP requests -> one stack's `docker-compose.yml` | interleaved read-modify-write against a single shared file | compose YAML |
| pre-existing compose content -> `ProxyConfig` rows (adoption path) | user-authored file content becomes database state | hand-written `VIRTUAL_HOST` |
| browser -> `PUT /api/settings/proxy` | untrusted `acmeEmail` written into a compose file | ACME settings |
| browser -> `POST /api/stacks/:id/{stop,restart,delete}` | direct API call bypassing client-side button disabling | stack lifecycle |
| Docktor -> generated proxy compose file -> host Docker daemon | Docktor authors a file mounting the host Docker socket into two containers | compose YAML |
| acme-companion container logs -> Docktor -> `certMessage` -> browser | third-party container output becomes stored data, then rendered UI text | cert status text |
| proxy stack certs bind mount -> Docktor filesystem reads | files written by another container's UID are probed by the Docktor process | filesystem presence checks |
| `StateBroadcaster` -> `/api/events` SSE -> every authenticated browser tab | a new event member broadcast to all subscribers, not scoped per stack | cert status events |
| unauthenticated browser -> `POST /api/setup/step6` | reachable during the wizard window like every other setup step | wizard proxy config |
| untrusted request body -> `assignDomainSchema` -> compose `environment` block | the T-06-02 domain-injection boundary — this gap was that it was silently absent at runtime | domain string |
| `shared/src` -> gitignored `shared/dist` -> `@docktor/server`'s module graph | a security-relevant validator crosses a build step no test/dev entry point previously forced | compiled validation schema |

---

## Threat Register

| Threat ID | Plan | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|------|----------|-----------|----------|-------------|------------|--------|
| T-06-01 | 06-01 | Spoofing | `routes/proxy.ts` | high | mitigate | `requireAuth` onRequest hook, first line of plugin body; integration test asserts 401 without session cookie | closed |
| T-06-02 | 06-01 | Tampering | `domain` -> compose `environment` | high | mitigate | `hostnamePattern` RFC-1123 regex in `assignDomainSchema`; YAML `Scalar` nodes, never string-concatenated | closed |
| T-06-03 | 06-01 | Tampering | `serviceName`/`id` path params | medium | accept | pre-existing `getStackPath()` escape guard (05.1-03, T-05.1-11) | closed |
| T-06-04 | 06-01 | Tampering | `internalPort` -> `VIRTUAL_PORT` | medium | mitigate | `z.coerce.number().int().min(1).max(65535)` | closed |
| T-06-05 | 06-01 | Repudiation | concurrent `assignDomain` on one domain | medium | mitigate | `@@unique([domain])` DB constraint; `P2002` -> 409 | closed |
| T-06-06 | 06-01 | Denial of Service | orphan `ProxyConfig` row on failed write | medium | mitigate | `assignDomain` step (h) deletes the row it created on compose-write/redeploy failure | closed |
| T-06-07 | 06-01 | Information Disclosure | acme-companion image probe (Step 0) | low | accept | read-only `grep` in throwaway container, no volumes, no network publish | closed |
| T-06-SC (06-01) | 06-01 | Tampering | `nginxproxy/*` container images | high | mitigate | zero new npm packages this phase; image publisher verified in RESEARCH.md Package Legitimacy Audit; tag re-verification via `docker manifest inspect` in 06-03 | closed |
| T-06-08 | 06-02 | Spoofing | `DELETE /api/proxy-configs/:id` | high | mitigate | covered by 06-01's plugin-level `requireAuth`; integration test asserts 401 | closed |
| T-06-09 | 06-02 | Tampering | interleaved compose read-modify-write | high | mitigate | `withKeyedLock(stackId, ...)` serializes writes; held-out concurrency test required to fail with lock removed | closed |
| T-06-10 | 06-02 | Tampering | adoption path parsing user-authored `VIRTUAL_HOST` | medium | mitigate | re-validated against `hostnamePattern` before row creation; failed entries skipped, never written back | closed |
| T-06-11 | 06-02 | Denial of Service | unbounded keyed-mutex map growth | low | mitigate | entry deleted in `finally` when stored tail matches | closed |
| T-06-12 | 06-02 | Repudiation | removal deletes row but compose write fails | medium | accept | surfaces via `deployStack`'s existing ERROR transition; row already gone matches user intent | closed |
| T-06-13 | 06-03 | Denial of Service | stopping/deleting the proxy stack takes down all routing/TLS | high | mitigate | `assertNotProtected` runs server-side in `StackService.stopStack`/`restartStack`/`deleteStack` before any docker call | closed |
| T-06-14 | 06-03 | Tampering | `acmeEmail` inlined into generated compose YAML | high | mitigate | `z.string().email()` at service boundary + `JSON.stringify` double-quoted YAML scalar; unit test round-trips adversarial value | closed |
| T-06-15 | 06-03 | Elevation of Privilege | both proxy containers mount host Docker socket | high | accept | inherent to nginx-proxy/acme-companion model (D-01); `:ro` mounts, disclosed via comment | closed |
| T-06-16 | 06-03 | Tampering | user hand-edits proxy stack compose via Compose tab | medium | accept | deliberate escape hatch (Open Question 2); header comment warns of breakage risk | closed |
| T-06-17 | 06-03 | Spoofing | `GET`/`PUT`/`POST /api/settings/proxy*` | high | mitigate | plugin-level `requireAuth`; integration suite asserts 401 on all three routes | closed |
| T-06-18 | 06-03 | Information Disclosure | ACME email transmitted to third-party CA | low | accept | inherent to ACME model; `getProxySettings` reads only `proxy.*` keys (asserted by test), no cross-contamination with other stored addresses | closed |
| T-06-19 | 06-03 | Denial of Service | `listContainers` pre-flight misses non-Docker port holder | medium | mitigate | accepted incomplete pre-flight by design; real `docker compose` stderr relayed on failure rather than false success | closed |
| T-06-20 | 06-04 | Information Disclosure | cert private key material under bind mount | high | mitigate | poller checks file *presence* only, never reads contents, never constructs a `.key` path — asserted by unit test | closed |
| T-06-21 | 06-04 | Information Disclosure | acme-companion log lines in `certMessage` rendered in UI | medium | mitigate | only the matching-domain line stored, length-trimmed; React escapes on render; scrollable monospace block | closed |
| T-06-22 | 06-04 | Denial of Service | log tail fetched per row instead of per reconcile | medium | mitigate | at most one `getLogTail` per reconcile, none when all TLS rows already certified — asserted by unit test | closed |
| T-06-23 | 06-04 | Denial of Service | SSE flooding from poller publishing every tick | medium | mitigate | publish only on status change; steady state produces zero events — asserted by unit test | closed |
| T-06-24 | 06-04 | Spoofing | `proxy_cert_status` broadcast to every authenticated tab | low | accept | matches existing behavior of every other `StateEvent`; single-user by design (RBAC out of scope); no secret in payload | closed |
| T-06-25 | 06-04 | Tampering | unreadable certs directory flips healthy rows to failed | high | mitigate | directory-level read error aborts whole reconcile, stored statuses untouched — asserted by unit test | closed |
| T-06-26 (06-05) | 06-05 | Elevation of Privilege | disabling Stop/Restart/Delete only in `StackActions` | high | mitigate | server-side `assertNotProtected` (06-03) is the actual control, asserted by its own tests; client disabling documented as UX-only | closed |
| T-06-27 (06-05) | 06-05 | Tampering | client-side Zod validation of domain | medium | mitigate | same `assignDomainSchema` enforced server-side in `routes/proxy.ts`; integration tests assert server rejects independently of client | closed |
| T-06-28 (06-05) | 06-05 | Information Disclosure | raw acme-companion/compose stderr rendered in UI | medium | accept | deliberate transparency; React escapes text, bounded scrollable block; single-user audience | closed |
| T-06-29 (06-05) | 06-05 | Spoofing | cross-site request reaching proxy endpoints | medium | accept | unchanged from every other Docktor endpoint — `apiFetch` sends session cookie, `requireAuth` gates the route | closed |
| T-06-30 | 06-06 | Spoofing | `POST /api/setup/step6` reachable without session | high | mitigate | `isWizardComplete()` 410s post-completion + `userCount === 0` 400s pre-admin; inherited wizard-plugin window, not phase-6-introduced | closed |
| T-06-31 | 06-06 | Tampering | wizard `acmeEmail` reaching generated compose file | high | mitigate | `wizardStep6Schema` at Fastify boundary + `updateProxySettings` re-validation + `JSON.stringify` scalar emission (same chain as T-06-14) | closed |
| T-06-32 | 06-06 | Denial of Service | unauthenticated wizard-window caller binds host ports 80/443 | medium | mitigate | `assertHostPortsFree` pre-flight in `deployProxyStack`; window bounded by T-06-30's two gates | closed |
| T-06-33 | 06-06 | Repudiation | deploy failure leaves `proxy.acmeEmail` persisted | low | accept | deliberate ordering — persist-then-deploy lets retry without retyping; Stack row only created after port pre-flight passes | closed |
| T-06-26 (06-07) | 06-07 | Tampering | `assignDomainSchema` as consumed by the proxy route (G-06-3) | high | mitigate | Task 1 forces `@docktor/shared` rebuild at every test/dev entry point; Task 2 pins the 400 with a DB-free route test asserting `assignDomain` is never called — **verified live this session**: freshness reproduced from a deleted `shared/dist`, both new tests falsification-tested by live mutation | closed |
| T-06-27 (06-07) | 06-07 | Tampering | stale gitignored `shared/dist` silently weakening any shared validator | high | mitigate | parity test compares full compiled export surface and every `safeParse`-bearing schema against `shared/src` — **verified live**: mutating compiled `shared/dist` without rebuilding flips the parity test red | closed |
| T-06-28 (06-07) | 06-07 | Tampering | verification steps temporarily remove the hostname check from a working-tree file | medium | mitigate | both mutation steps restore from a backup in the same command; `git diff --exit-code` clean after each restoration — confirmed by this audit's own repeat of the mutation (working tree clean throughout) | closed |
| T-06-29 (06-07) | 06-07 | Denial of Service | unconditional `tsc` build prepended to every test invocation | low | accept | `shared` workspace is 7 small files, incremental build; CI already runs `yarn build` before test steps | closed |
| T-06-SC (06-07) | 06-07 | Tampering | npm/pip/cargo installs | low | accept | confirmed via `git diff` — zero new dependencies in `package.json`/`server/package.json`/`client/package.json`; only script-line changes | closed |

*Status: open · closed · open — below `high` threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` (`high`) count toward `threats_open`*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-03 | Path-escape guard already exists outside this phase (05.1-03) | Plan 06-01 | 2026-09-03 |
| AR-06-02 | T-06-07 | Read-only, isolated, no data mounted | Plan 06-01 | 2026-09-03 |
| AR-06-03 | T-06-12 | Row deletion matches user intent; failure surfaced via status log | Plan 06-02 | 2026-09-04 |
| AR-06-04 | T-06-15 | Inherent to DooD reverse-proxy model; disclosed, `:ro` mounts | Plan 06-03 | 2026-09-04 |
| AR-06-05 | T-06-16 | Deliberate escape hatch; locking would make Docktor-broken proxy unfixable | Plan 06-03 | 2026-09-04 |
| AR-06-06 | T-06-18 | Inherent to ACME registration model; no cross-contamination | Plan 06-03 | 2026-09-04 |
| AR-06-07 | T-06-24 | Single-user by design; no secret in event payload | Plan 06-04 | 2026-09-04 |
| AR-06-08 | T-06-28 (06-05) | Deliberate transparency; escaped and bounded | Plan 06-05 | 2026-09-05 |
| AR-06-09 | T-06-29 (06-05) | No new cross-origin surface vs. existing endpoints | Plan 06-05 | 2026-09-05 |
| AR-06-10 | T-06-33 | Persist-then-deploy ordering is intentional UX | Plan 06-06 | 2026-09-06 |
| AR-06-11 | T-06-29 (06-07) | Incremental build cost is near-zero; CI already builds first | Plan 06-07 | 2026-09-07 |
| AR-06-12 | T-06-SC (06-07) | Zero new dependencies confirmed via `git diff` | Plan 06-07 | 2026-09-07 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-07 | 36 (33 unique IDs, 3 collisions from 06-07 reusing 06-01/06-05 IDs) | 36 | 0 | Claude (post-execution audit, L1/ASVS-1, register authored at plan time) |

**Audit method:** register_authored_at_plan_time=true, asvs_level=1, threats_open=0 after classification → short-circuit rule applied (no deep L2/L3 auditor spawn required). Verification performed: (1) full server unit suite re-confirmed green this session (40/40 files, 616 tests) covering the requireAuth/hostnamePattern/keyed-mutex/assertNotProtected/coerce-port/cert-poller mitigations; (2) `git diff` confirmed zero new dependencies and zero changes to `shared/src/validation/proxy.ts`, `server/src/routes/proxy.ts`, `server/src/app.ts` since the pre-06-07 baseline; (3) live re-verification of 06-07's two new mitigations by mutating both the source and compiled validator and confirming the matching test fails, then restoring and reconfirming `git diff --exit-code` clean.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-07
