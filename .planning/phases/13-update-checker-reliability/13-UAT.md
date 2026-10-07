---
status: testing
phase: 13-update-checker-reliability
source: [13-VERIFICATION.md]
started: 2026-10-07T07:28:20Z
updated: 2026-10-07T07:28:20Z
---

## Current Test

number: 1
name: Live multi-tab post-deploy status (SC4)
expected: |
  With real Docker, open the stack list in tab A, redeploy / update images / upgrade a service in tab B. Within ~5s tab A shows real container states (not unknown) without reload. Repeat with a failing compose edit.
awaiting: user response

## Tests

### 1. Live multi-tab post-deploy status (SC4)
expected: Tab A shows real service states within ~5s of a deploy-family operation in tab B, success and failure.
result: [pending]

### 2. Integration tests needing Docker
expected: yarn workspace @docktor/server test:integration test/integration/stacks.test.ts test/integration/image-update-check-pruning.test.ts passes.
result: [pending]

### 3. Moving-tag Upgrade dialog visual/copy check (light + dark)
expected: nginx:latest Upgrade arrow opens dialog with moving-tag copy, neutral Alert, disabled Upgrade, Update Images button that closes dialog and shows the toast; acceptable dark-mode contrast.
result: [pending]

### 4. Decision on code-review WR-01
expected: Accept catch-up replacing ERROR with Docker-derived status after a failed deploy, or request a follow-up that preserves ERROR.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
