---
status: testing
phase: 14-health-uptime-and-disk-visibility
source: [14-VERIFICATION.md]
started: 2026-10-09T09:10:00Z
updated: 2026-10-09T09:10:00Z
---

## Current Test

number: 1
name: Amended D-05 on a live Docker host (network attach/detach, startup sweep, delete during attachment, stalled daemon)
expected: |
  Docktor appears on the target network only for the probe request and is gone afterwards; the startup sweep removes a leftover endpoint with alias docktor-health-probe; Delete Stack completes while probes are active; a daemon stalled >10s yields a recorded network-unreachable probe and probing resumes on recovery.
awaiting: user response

## Tests

### 1. Amended D-05 on a live Docker host
expected: Docktor on the network only during a probe; startup sweep removes leftovers; delete flow completes; stalled daemon records network-unreachable and recovers
result: [pending]

### 2. Health history panel (14-03), light/dark, Pixel 7 width, 200-char failure message
expected: Message wraps inside the h-48 ScrollArea, no horizontal overflow
result: [pending]

### 3. HTTP Health Probes section (14-08), Config tab, light/dark, desktop and Pixel 7
expected: Long URL scrolls inside input, YAML error replaces form, saved compose contains the x-docktor.health-probe block
result: [pending]

### 4. Storage page (14-05), light/dark, desktop and Pixel 7, 80+ char names
expected: Names truncate with title attribute, no horizontal scroll, chevron respects reduced motion, sensible Tab order
result: [pending]

### 5. Stack Overview (14-07), light/dark, desktop and Pixel 7, ~30 incidents incl. one ongoing
expected: Acceptable tone contrast, list scrolls vertically past 384px, StatCards collapse to one column
result: [pending]

### 6. Settings Health History card (14-10), light/dark, desktop and Pixel 7, lower retention
expected: Validation on blur, Shorten retention dialog shows documented copy, Keep cancels without saving
result: [pending]

### 7. Apply the three Phase 14 migrations to a live database and start the server
expected: ServiceHealthEvent, StackVolumeUsage, new Stack columns and StatusLog (stackId, createdAt) index exist; syncDatabaseSchema() applies them at boot
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps
