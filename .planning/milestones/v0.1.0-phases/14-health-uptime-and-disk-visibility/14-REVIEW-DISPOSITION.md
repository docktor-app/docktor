---
phase: 14-health-uptime-and-disk-visibility
source: 14-REVIEW.md
---

# Phase 14 Code Review Disposition

Review: 1 critical, 11 warnings, 6 info. Triaged after the gap-closure plans 14-15, 14-16 and 14-17: 7 fixed, 11 deferred with reasons. None of the deferred findings falsifies a Phase 14 must-have (14-VERIFICATION.md).

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 14-15 (every Docker call on the probe path deadline-bounded and aborted, per-probe deadline, bounded start(), in-flight watchdog) |
| WR-01 | warning | fixed | 14-16 (probe results applied only to the row's current container) |
| WR-02 | warning | deferred | Hardening of the user-confirmed amended D-05 (attach for one request). Restricting attach to `<project>_default`, probing through exec or a sidecar, or retrying a failed detach changes the reachability design and needs a product decision. The exposure window is one request (T-14-44 accepted in 14-09). |
| WR-03 | warning | fixed | 14-17 (`<stack>/volumes` lstat-checked before listing) |
| WR-04 | warning | fixed | 14-17 (du maxBuffer 64 MiB plus overflow warning) |
| WR-05 | warning | fixed | 14-16 (probe-owned service reset to starting on a new or restarted container in the catch-up and StatePoller) |
| WR-06 | warning | deferred | Client hook race in useServiceHealthEvents and useStackUptime on a stale or switched response. Cosmetic and self-correcting on the next fetch; no must-have depends on it. |
| WR-07 | warning | deferred | An accurate HTTP probe badge needs a server-provided probe-configured flag (API change). The newest-event heuristic was not adopted, to avoid shipping a second approximate signal. |
| WR-08 | warning | deferred | Sharing one EventSource across useContainerEvents callers is a cross-cutting client architecture change that is not specific to Phase 14. |
| WR-09 | warning | fixed | 14-17 (kickoff through runGuarded, in-flight guard) |
| WR-10 | warning | deferred | Hostname-based self-identification is Docker's default and fails closed (network-unreachable) when overridden. Resolving the id from /proc is separate hardening. |
| WR-11 | warning | fixed | 14-16 (404 clear attributed to http-probe for probe-owned services) |
| IN-01 | info | deferred | Narrowing the 403 already-connected match; info, and the probe fails closed either way. |
| IN-02 | info | deferred | Non-UTF-8 volume directory names; rare, info. |
| IN-03 | info | deferred | Config tab display of a merge-key-inherited probe; cosmetic, server behaviour is correct. |
| IN-04 | info | deferred | formatBytes rounding at a unit boundary; cosmetic. |
| IN-05 | info | deferred | Type location and retention-card hook extraction; belongs to a client refactor pass. |
| IN-06 | info | deferred | Inline hardening note next to the disabled TLS verification; no behaviour change needed while only host and user-agent headers are sent. |

## Notes

- `fixed` means the closing plan named in Source landed and its verify commands passed (see the 14-15, 14-16 and 14-17 SUMMARY files).
- `deferred` means the finding stays valid but is out of scope for Phase 14 gap closure. The reason is in Source. The developer decides at triage whether any deferred finding becomes a GitHub issue.
- No finding is `open`.
