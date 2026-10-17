---
phase: 18
review: 18-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "Bind-mount copy loses file ownership and rewrites relative symlinks (`fs.cp`)"
  - id: CR-02
    severity: critical
    disposition: open
    title: "Equal env keys across services are collapsed into one `.env` entry, silently changing values"
  - id: CR-03
    severity: critical
    disposition: open
    title: "Absolute bind mounts are read from the container's view of the filesystem; a missing source becomes an empty directory and the migration reports success"
  - id: WR-01
    severity: warning
    disposition: open
    title: "Request-controlled paths are validated only inside `execute` (after the old stack is stopped), and the copy source is still unconfined"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Setup migrate/preview routes are reachable without authentication for as long as the wizard is incomplete (prior WR-03, only partly mitigated)"
  - id: WR-03
    severity: warning
    disposition: open
    title: "A failed deploy leaves containers behind; for an in-place migration the rollback then restarts the wrong containers (prior WR-05)"
  - id: WR-04
    severity: warning
    disposition: open
    title: "Named-volume migration uses the unprefixed compose key as the Docker volume name (prior WR-08)"
  - id: WR-05
    severity: warning
    disposition: open
    title: "Old-stack stop relies on an inferred project name and the UI claims it was stopped (prior WR-07)"
  - id: WR-06
    severity: warning
    disposition: open
    title: "Migration compose diff shows secret values in plaintext (prior WR-06)"
  - id: WR-07
    severity: warning
    disposition: open
    title: "Rollback failures are swallowed silently, leaving state the user is told does not exist"
  - id: WR-08
    severity: warning
    disposition: open
    title: "Migration operation lifecycle is bound to a mounted component; the loading toast can stick forever"
  - id: WR-09
    severity: warning
    disposition: open
    title: "`.env` extraction emits invalid variable names and unescaped values"
  - id: WR-10
    severity: warning
    disposition: open
    title: "Managed-stack and in-place detection ignore the `/host` alias of a managed directory"
  - id: WR-11
    severity: warning
    disposition: open
    title: "`~` paths are offered for conversion but never rewritten, and the copy source is wrong"
  - id: IN-01
    severity: info
    disposition: open
    title: "`composePath` validation is by file name only (prior IN-01)"
  - id: IN-02
    severity: info
    disposition: open
    title: "Residual convention violations in touched files (prior IN-04)"
  - id: IN-03
    severity: info
    disposition: open
    title: "The renamed original (`<id>-pre-migration`) is offered by the scanner as an importable stack"
  - id: IN-04
    severity: info
    disposition: open
    title: "Minor client contract and robustness drift"
  - id: IN-05
    severity: info
    disposition: open
    title: "Rollback restart and backup behaviour (prior IN-03)"
open: 19
total: 19
recorded: 2026-10-16T11:09:59.461Z
---

# Phase 18: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | - |
| CR-02 | critical | open | - |
| CR-03 | critical | open | - |
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | open | - |
| WR-06 | warning | open | - |
| WR-07 | warning | open | - |
| WR-08 | warning | open | - |
| WR-09 | warning | open | - |
| WR-10 | warning | open | - |
| WR-11 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
