---
status: testing
phase: 17-backup-repository-and-port-check-fixes
source: [17-VERIFICATION.md]
started: 2026-10-14T08:50:34Z
updated: 2026-10-14T08:50:34Z
---

## Current Test

number: 1
name: First SFTP connection to a new host (snapshot listing)
expected: |
  Listing snapshots against a real sshd holding a restic repo succeeds on first connect; ssh's "Permanently added" stderr notice does not break JSON parsing (review WR-01).
awaiting: user response

## Tests

### 1. First SFTP connection to a new host (snapshot listing)
expected: Snapshot listing succeeds on first connect; known_hosts is pinned.
result: [pending]

### 2. End-to-end remote backup/restore/list (SFTP and S3/MinIO)
expected: Snapshots land under <repoPath>/<stackId> or <bucket>/<stackId>; no key-* directory remains afterwards.
result: [pending]

### 3. Real port scenarios
expected: Redeploying a running stack with a published port shows no warning; a second stack or external process on the same port warns and names the holder.
result: [pending]

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps
