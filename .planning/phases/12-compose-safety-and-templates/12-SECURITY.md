---
phase: "12"
slug: "compose-safety-and-templates"
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-03"
status: verified
---

# Phase 12 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → PUT /api/stacks/:id | authenticated user-supplied compose/.env content crosses into the server and onto disk |
| browser → POST /api/stacks/:id/preview, POST /api/stacks/preview | authenticated user-supplied content is diffed against on-disk files and echoed back |
| dialog → screen | `.env` values (possibly secrets) are rendered in the review diff |
| compose YAML (user edit, external SSH edit, template content) → rule engine | untrusted YAML is parsed and walked by the compose checks |
| compose YAML / `.env` content → port parser | untrusted strings parsed into integers and port ranges |
| server → OS tools (`ss`, `lsof`) | child processes spawned by the server for port-conflict detection |
| user-supplied repo URL → git process | an authenticated user's URL becomes a git argument |
| remote git repository content → local filesystem → parser | untrusted repo files (possibly hostile) are checked out and read |
| browser → POST /api/stacks, POST /api/stacks/preview | user (or template) compose content enters the create path |
| browser → PUT /api/settings/compose-checks | user toggles that weaken checks |
| Docktor server → remote git hosts | outbound clone/pull of configured template repos |
| repo content (untrusted) → database → API → browser | template manifests/compose/icons are stored and served |
| browser → template routes | authenticated requests creating stacks from template content |
| server → Docker daemon (socket) | container listing for the port-conflict check |
| persisted warnings → browser | holder names / process names rendered on the stack page |
| template repo content (untrusted, via API) → browser DOM | names, descriptions, usage text and icons authored by any repo owner are rendered |
| browser → POST /api/template-repos | user-supplied git URL becomes a git argument |
| repo error/issue text → browser | git stderr lines and issue messages are rendered |
| background job → remote git repos | periodic outbound sync (12-04/12-07 safeguards apply) |
| synced template content → stack records | only a boolean flag (`templateUpdateAvailable`) crosses into stack state — no auto-apply |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-12-01 | Tampering | StackService.updateStack | medium | mitigate | 428 `ConfirmationRequiredError` thrown before any `fs.write*` call — verified: check precedes write | closed |
| T-12-02 | Information Disclosure | DiffConfirmDialog (env diffs) | medium | mitigate | `isSecretKey` masking of env diff lines until reveal toggle | closed |
| T-12-03 | Elevation of Privilege | POST /api/stacks/:id/preview | high | mitigate | File-wide `requireAuth` onRequest hook + `findByIdOrThrow` + Zod param/body schemas | closed |
| T-12-04 | Denial of Service | computeUnifiedDiff | low | accept | Fastify default 1 MiB bodyLimit; authenticated-admin only | closed |
| T-12-SC (12-01) | Tampering | npm install of `diff` | high | mitigate | Blocking-human package-legitimacy checkpoint, approved by raphael@muesseler.de 2026-10-02; no `@types/diff` added | closed |
| T-12-05 | Tampering | BindOutsideStackRule / isWithinDirectory | high | mitigate | `path.relative`-based segment-aware containment; zero string-prefix comparisons (grep-confirmed) | closed |
| T-12-06 | Tampering | ComposeRuleEngine parsing | high | mitigate | `parseDocument(..., {merge:true})` + `toJS()` — anchors/merge keys cannot hide findings | closed |
| T-12-07 | Denial of Service | YAML alias expansion | low | mitigate | `toJS({maxAliasCount: 100})` bounds alias-bomb expansion | closed |
| T-12-08 | Elevation of Privilege | rule registry | medium | mitigate | Hardcoded `BUILT_IN_COMPOSE_RULES` array; zero dynamic `import(` calls (grep-confirmed) | closed |
| T-12-SC (12-02) | Tampering | package installs | low | accept | No new packages in this plan | closed |
| T-12-09 | Tampering | SocketInspector | medium | mitigate | `execFile` with fixed argv, no shell | closed |
| T-12-10 | Denial of Service | SocketInspector | low | mitigate | 5s `execFile` timeout; failures resolve `[]` | closed |
| T-12-11 | Denial of Service | extractRequestedHostPorts | medium | mitigate | `MAX_PORTS_PER_RANGE`/`MAX_REQUESTED_PORTS` caps enforced | closed |
| T-12-12 | Information Disclosure | port-conflict holders | low | accept | Served only to authenticated admins via `/api/stacks` | closed |
| T-12-SC (12-03) | Tampering | apt packages git/iproute2/lsof | low | accept | Installed from base Debian image's official repos | closed |
| T-12-13 | Elevation of Privilege | GitExecutor (git URL → argv) | high | mitigate | `isAllowedGitRemoteUrl` allowlist (https/git/ssh only) at schema + re-validated in `syncCheckout`; URL after `--`; `GIT_ALLOW_PROTOCOL` set | closed |
| T-12-14 | Information Disclosure | TemplateSourceReader (symlinks) | high | mitigate | `core.symlinks=false` on clone/pull; every file/dir `lstat`-checked, non-regular entries rejected | closed |
| T-12-15 | Denial of Service | clone / reader | medium | mitigate | `--depth 1 --single-branch --no-tags`, 60s timeout, byte limits, `MAX_VARIANTS_PER_REPO` | closed |
| T-12-16 | Tampering | template/variant directory names | medium | mitigate | `readdir`-only enumeration + `TEMPLATE_SLUG_PATTERN`; cache path derived from DB id, never URL | closed |
| T-12-17 | Spoofing | interactive git credential prompts | low | mitigate | `GIT_TERMINAL_PROMPT=0`; credentialed URLs rejected by schema | closed |
| T-12-SC (12-04) | Tampering | package installs | low | accept | No new packages; `git` binary from apt (12-03) | closed |
| T-12-18 | Elevation of Privilege | /api/settings/compose-checks, /api/stacks/preview | high | mitigate | File-wide `requireAuth` + shared Zod schemas on both routes | closed |
| T-12-19 | Tampering | skip-review setting | high | mitigate | `confirmationRequired` formula keeps requiring confirmation for introduced findings even with skip on; settings schema has no key for always-on rules | closed |
| T-12-20 | Tampering | StackService.createStack | high | mitigate | Confirmation enforced inside `createStack` itself (the only create path) — verified: check precedes directory creation | closed |
| T-12-21 | Repudiation | confirmed writes | low | accept | Existing `stack.config_changed` event emission path reused | closed |
| T-12-SC (12-05) | Tampering | package installs | low | accept | No new packages | closed |
| T-12-22 | Tampering | client-side review flow | low | accept | Server 428 enforcement (T-12-19/20) is the real guarantee; client dialog is UX only | closed |
| T-12-23 | Tampering | Compose Checks card | low | mitigate | Shared `composeCheckSettingsSchema` validated client and server | closed |
| T-12-SC (12-06) | Tampering | package installs | low | accept | No new packages | closed |
| T-12-24 | Elevation of Privilege | routes/templates.ts | high | mitigate | File-wide `requireAuth`; per-route schemas on all 6 routes | closed |
| T-12-25 | Tampering | createStackFromVariant | high | mitigate | Single call site into `StackService.createStack` (grep-confirmed) — inherits 12-05's compose-check gate | closed |
| T-12-26 | Denial of Service | concurrent syncs / cache | medium | mitigate | `withKeyedLock("template-repo:<id>")` around sync+read+persist | closed |
| T-12-27 | Information Disclosure | outbound fetch of the default repo | low | accept | Documented in docs/deployment.md; disable-able via empty env var; no credentials ever sent | closed |
| T-12-28 | Tampering | cache directory path | medium | mitigate | Checkout dir derived from DB cuid, never from the URL | closed |
| T-12-SC (12-07) | Tampering | package installs | low | accept | No new packages | closed |
| T-12-29 | Denial of Service | StackService pre-flight | high | mitigate | `runPreflight` never throws; `Promise.allSettled` per tier; degrades to `[]`/`EMPTY_DEPLOY_WARNINGS`; Docker always runs | closed |
| T-12-30 | Information Disclosure | banner copy | medium | mitigate | Footnote states visibility limits, Docker is final authority | closed |
| T-12-31 | Information Disclosure | container/process names in warnings | low | accept | Shown only to authenticated admins | closed |
| T-12-32 | Tampering (XSS) | DeployWarningsAlert | medium | mitigate | All strings rendered as React text nodes; link target built from validated stack id | closed |
| T-12-SC (12-08) | Tampering | package installs | low | accept | No new packages | closed |
| T-12-33 | Tampering (XSS) | TemplateCard / create usage note | high | mitigate | Zero `dangerouslySetInnerHTML` across template components (grep-confirmed); icons only via `<img src="data:...">` | closed |
| T-12-34 | Information Disclosure | template browsing | medium | mitigate | No remote URLs rendered/fetched; icons are server-produced data URIs | closed |
| T-12-35 | Tampering | create-from-template | low | accept | Server enforces via 12-05/12-07 (re-verified at T-12-25) | closed |
| T-12-SC (12-09) | Tampering | package installs | low | accept | No new packages | closed |
| T-12-36 | Elevation of Privilege | GET/POST /api/template-repos | high | mitigate | File-wide `requireAuth` covers both routes | closed |
| T-12-37 | Tampering | POST /api/template-repos URL | high | mitigate | `addTemplateRepoSchema` allowlist + GitExecutor re-validation before spawning git | closed |
| T-12-38 | Server-Side Request Forgery | git over https to internal hosts | low | accept | Authenticated-admin only; transport limited to git protocols; no response body reflected | closed |
| T-12-39 | Tampering (XSS) | error/issue text in the card | medium | mitigate | Zero `dangerouslySetInnerHTML` in template-repos-card.tsx | closed |
| T-12-SC (12-10) | Tampering | package installs | low | accept | No new packages | closed |
| T-12-40 | Tampering | TemplateUpdateService | high | mitigate | Narrow two-method ports; zero write/filesystem/StackService calls (grep-confirmed) — only the flag column is written | closed |
| T-12-41 | Denial of Service | TemplateRepoSync | medium | mitigate | 30-min cadence, 6h staleness threshold, sequential per-repo processing, per-repo+per-step try/catch, `IntervalJob.runGuarded` outer guard | closed |
| T-12-42 | Information Disclosure | badge tooltip | low | accept | Authenticated users only; path only, no secrets | closed |
| T-12-SC (12-11) | Tampering | package installs | low | accept | No new packages | closed |

*Status: open · closed · open — below `high` threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` (high) count toward `threats_open`*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

First-time documentation for this phase's `accept`-disposition threats (all severity `low`, independently verified sound against shipped code/docs by the security auditor on 2026-10-03):

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-12-01 | T-12-04 | Fastify default bodyLimit + authenticated-admin-only endpoint bounds diff computation cost | gsd-security-auditor (verified) | 2026-10-03 |
| AR-12-02 | T-12-SC (12-02) | No new packages installed in plan 12-02 | gsd-security-auditor (verified) | 2026-10-03 |
| AR-12-03 | T-12-12 | Port-conflict holder names served only to authenticated admins who already have Docker-socket-level control via Docktor | gsd-security-auditor (verified) | 2026-10-03 |
| AR-12-04 | T-12-SC (12-03) | `git`/`iproute2`/`lsof` installed via apt from the official Debian base-image repos, not a package manager subject to the npm legitimacy gate | gsd-security-auditor (verified) | 2026-10-03 |
| AR-12-05 | T-12-SC (12-04) | No new packages installed in plan 12-04; `git` binary sourced from 12-03's apt install | gsd-security-auditor (verified) | 2026-10-03 |
| AR-12-06 | T-12-21 | Existing `stack.config_changed` event-emission path already provides an audit trail for confirmed writes | gsd-security-auditor (verified) | 2026-10-03 |
| AR-12-07 | T-12-SC (12-05) | No new packages installed in plan 12-05 | gsd-security-auditor (verified) | 2026-10-03 |
| AR-12-08 | T-12-22 | Server-side 428 enforcement (T-12-19/T-12-20) is the real guarantee; the client review dialog is UX-only and not itself a security boundary | gsd-security-auditor (verified) | 2026-10-03 |
| AR-12-09 | T-12-SC (12-06) | No new packages installed in plan 12-06 | gsd-security-auditor (verified) | 2026-10-03 |
| AR-12-10 | T-12-27 | Outbound fetch of the default template repo is documented in docs/deployment.md, disable-able via an empty `DOCKTOR_DEFAULT_TEMPLATE_REPO_URL`, and the URL-credential allowlist (T-12-13) guarantees no credentials are ever sent | gsd-security-auditor (verified) | 2026-10-03 |
| AR-12-11 | T-12-SC (12-07) | No new packages installed in plan 12-07 | gsd-security-auditor (verified) | 2026-10-03 |
| AR-12-12 | T-12-31 | Container/process names in deploy warnings shown only to authenticated admins | gsd-security-auditor (verified) | 2026-10-03 |
| AR-12-13 | T-12-SC (12-08) | No new packages installed in plan 12-08 | gsd-security-auditor (verified) | 2026-10-03 |
| AR-12-14 | T-12-35 | Create-from-template enforcement happens server-side via the single `createStack` call site (re-verified at T-12-25); client-side template selection is not itself a security boundary | gsd-security-auditor (verified) | 2026-10-03 |
| AR-12-15 | T-12-SC (12-09) | No new packages installed in plan 12-09 | gsd-security-auditor (verified) | 2026-10-03 |
| AR-12-16 | T-12-38 | Adding a template repo is authenticated-admin-only, transport is limited to git protocols by the shared URL allowlist, and no response body is ever reflected back to the client beyond git's first stderr line | gsd-security-auditor (verified) | 2026-10-03 |
| AR-12-17 | T-12-SC (12-10) | No new packages installed in plan 12-10 | gsd-security-auditor (verified) | 2026-10-03 |
| AR-12-18 | T-12-42 | Template-updated badge tooltip shown only to authenticated users and discloses only a template path, never secrets | gsd-security-auditor (verified) | 2026-10-03 |
| AR-12-19 | T-12-SC (12-11) | No new packages installed in plan 12-11 | gsd-security-auditor (verified) | 2026-10-03 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-03 | 53 | 53 | 0 | gsd-security-auditor (ASVS level 1, block_on: high) |

**Non-security caveat (transparency, not a finding):** `.planning/WINDOWS.md` entries #14–#20 record that several integration/Playwright tests touching high-severity-threat code paths (T-12-03, T-12-18, T-12-20, T-12-24, T-12-29, T-12-36, T-12-37) were written but not executed in this sandboxed environment (testcontainers P1001 / deliberate resource-contention avoidance per user instruction), and entry #16 records the phase's one Prisma migration as generated-but-unapplied. This did not affect the audit verdict — mitigations were verified directly against shipped source, not test-pass claims — but a human/CI should close these out post-merge.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-03
