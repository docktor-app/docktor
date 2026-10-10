---
status: complete
phase: 14-health-uptime-and-disk-visibility
source: [14-VERIFICATION.md]
started: 2026-10-09T09:10:00Z
updated: 2026-10-10T07:29:08.977Z
---

## Current Test

[testing complete]

## Tests

### 1. Amended D-05 on a live Docker host
expected: Docktor on the network only during a probe; startup sweep removes leftovers; delete flow completes; stalled daemon records network-unreachable and recovers
result: issue
reported: "A: Docktor on the network only during a probe - Pass. B: Startup sweep removes leftovers - Pass (removed 1 stale probe network attachment(s)). C: Delete Stack - Pass (caveat above). D: Stalled daemon - detection and recovery pass; no history entry recorded. Findings: (1) Docktor can't start after a leftover probe attachment's network is deleted. If Docktor stops while attached and that network is then removed, Docker refuses to start the container (network test-network not found). The startup sweep never gets to run, and restart: unless-stopped doesn't help. (2) A frozen dockerd likely freezes all of Docktor (unconfirmed). Node writes logs to the container's log pipe synchronously; once that pipe fills, Docktor blocks, which defeats the 10s limits on Docker calls. (3) Database writes fail while dockerd is frozen. Docker's internal DNS stops, so docktor-db can't be resolved (EAI_AGAIN). That's why no history entry was recorded in D."
severity: major

### 2. Health history panel (14-03), light/dark, Pixel 7 width, 200-char failure message
expected: Message wraps inside the h-48 ScrollArea, no horizontal overflow
result: issue
reported: "it wraps, but also the healthy->unhealthy is wrapped. For mobile, add some spaces between the rows. the rest looks good."
severity: minor

### 3. HTTP Health Probes section (14-08), Config tab, light/dark, desktop and Pixel 7
expected: Long URL scrolls inside input, YAML error replaces form, saved compose contains the x-docktor.health-probe block
result: pass

### 4. Storage page (14-05), light/dark, desktop and Pixel 7, 80+ char names
expected: Names truncate with title attribute, no horizontal scroll, chevron respects reduced motion, sensible Tab order
result: pass

### 5. Stack Overview (14-07), light/dark, desktop and Pixel 7, ~30 incidents incl. one ongoing
expected: Acceptable tone contrast, list scrolls vertically past 384px, StatCards collapse to one column
result: pass

### 6. Settings Health History card (14-10), light/dark, desktop and Pixel 7, lower retention
expected: Validation on blur, Shorten retention dialog shows documented copy, Keep cancels without saving
result: pass

### 7. Apply the three Phase 14 migrations to a live database and start the server
expected: ServiceHealthEvent, StackVolumeUsage, new Stack columns and StatusLog (stackId, createdAt) index exist; syncDatabaseSchema() applies them at boot
result: pass

## Summary

total: 7
passed: 5
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-14-1
  truth: "A daemon stalled >10s yields a recorded network-unreachable probe and probing resumes on recovery"
  status: failed
  reason: "User reported: detection and recovery pass; no history entry recorded (DB writes fail while dockerd is frozen: docktor-db unresolvable, EAI_AGAIN)"
  severity: major
  test: 1
  artifacts: []
  missing: []
- gap_id: G-14-1a
  truth: "Docktor restarts cleanly after stopping while attached to a probe network that is subsequently removed (startup sweep gets to run)"
  status: failed
  reason: "User reported: Docker refuses to start the container (network test-network not found); sweep never runs; restart: unless-stopped doesn't help"
  severity: major
  test: 1
  artifacts: []
  missing: []
- gap_id: G-14-1b
  truth: "A frozen dockerd does not block Docktor beyond the 10s Docker-call deadlines"
  status: failed
  reason: "User reported (unconfirmed): Node writes logs to the container's log pipe synchronously; once the pipe fills, Docktor blocks, defeating the 10s limits"
  severity: major
  test: 1
  artifacts: []
  missing: []
- gap_id: G-14-2
  truth: "Health history message wraps inside the h-48 ScrollArea without horizontal overflow, with the status transition intact and readable rows"
  status: failed
  reason: "User reported: it wraps, but also the healthy->unhealthy is wrapped. For mobile, add some spaces between the rows. the rest looks good."
  severity: minor
  test: 2
  artifacts: []
  missing: []

## Deferred Follow-Ups

- test: 6
  idea: "add some space between the save button and the form field. This applies generally for all forms (mostly in the stack and proxy settings)"
  deferred_at: 2026-10-10
