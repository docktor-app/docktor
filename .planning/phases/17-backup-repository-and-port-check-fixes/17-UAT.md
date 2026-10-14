---
status: complete
phase: 17-backup-repository-and-port-check-fixes
source: [17-VERIFICATION.md]
started: 2026-10-14T08:50:34Z
updated: 2026-10-14T15:12:46.938Z
---

## Current Test

[testing complete]

## Tests

### 1. First SFTP connection to a new host (snapshot listing)
expected: Snapshot listing succeeds on first connect; known_hosts is pinned.
result: pass

### 2. End-to-end remote backup/restore/list (SFTP and S3/MinIO)
expected: Snapshots land under <repoPath>/<stackId> or <bucket>/<stackId>; no key-* directory remains afterwards.
result: pass

### 3. Real port scenarios
expected: Redeploying a running stack with a published port shows no warning; a second stack or external process on the same port warns and names the holder.
result: pass
note: Own-port and second-stack scenarios verified. The external-process scenario could not be exercised on Docker Desktop for Windows: the host-namespace probe sees the Docker VM, not Windows listeners, so Docker's own bind error surfaced at deploy time instead.

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
