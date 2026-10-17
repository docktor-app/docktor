---
phase: 11
review: 11-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "Grouped proxy domains table shows only the first domain's internal port"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "Disk-threshold number inputs can display a value that was never saved"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "`EnvEditor` table mode allows silent duplicate variable keys"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "`LogViewer` props not wrapped in `Readonly<...>`, breaking the project's stated convention"
  - id: WR-05
    severity: warning
    disposition: fixed
    title: "`catch (err: any)` in `create.tsx` violates the project's explicit \"no `any`\" rule"
  - id: IN-01
    severity: info
    disposition: open
    title: "Invalid Tailwind utility class produces a no-op skeleton width"
  - id: IN-02
    severity: info
    disposition: open
    title: "Fragile substring-matching used to route a 400 error to a form field"
  - id: IN-03
    severity: info
    disposition: open
    title: "Backup detail breadcrumb shows the raw stack id instead of its display name"
  - id: IN-04
    severity: info
    disposition: open
    title: "Formatting inconsistency (no semicolons / 2-space indent) in a subset of phase-11 files"
open: 4
total: 9
recorded: 2026-09-30T11:45:25.504Z
---

# Phase 11: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 11-REVIEW-FIX.md |
| WR-02 | warning | fixed | 11-REVIEW-FIX.md |
| WR-03 | warning | fixed | 11-REVIEW-FIX.md |
| WR-04 | warning | fixed | 11-REVIEW-FIX.md (title reconciliation missed a truncated heading; hand-corrected after verifying `Readonly<LogViewerProps>` landed in commit fe21693) |
| WR-05 | warning | fixed | 11-REVIEW-FIX.md |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
