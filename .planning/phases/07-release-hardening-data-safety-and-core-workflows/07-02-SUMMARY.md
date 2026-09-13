---
phase: 07-release-hardening-data-safety-and-core-workflows
plan: 02
subsystem: infra
tags: [docker, mountinfo, persistence-check, verification]

# Dependency graph
requires:
  - phase: 07-01
    provides: "The stacks-directory persistence check (server/src/lib/stacks-dir.ts) — refusal message, opt-out via DOCKTOR_STACKS_MOUNT_CHECK, and findMountEntryForPath()'s mountinfo parsing."
provides:
  - "Real-container observation closing research Assumption A1 (mountinfo field layout inside the actual node:22-slim Docktor image, previously only extrapolated from kernel docs)."
  - "Human sign-off that the refusal message is operator-actionable."
  - "Recorded decision to keep DOCKTOR_STACKS_MOUNT_CHECK as a permanent opt-out."
affects: []

# Actuals (#2632)
actuals:
  tokens: 1200
  tasks: 2
  commits: 1

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - ".planning/phases/07-release-hardening-data-safety-and-core-workflows/07-02-SUMMARY.md"
  modified: []

key-decisions:
  - "DOCKTOR_STACKS_MOUNT_CHECK=false is retained as a permanent, valid escape hatch — not a temporary or discouraged knob. Human reasoning: it makes sense for legitimate use cases such as deliberately running on ephemeral storage. No code change follows from this decision."

patterns-established: []

requirements-completed: []

coverage:
  - id: D1
    description: "Real-container negative probe: no-volume container exits non-zero and logs the persistence error naming the stacks path."
    verification:
      - kind: manual_procedural
        ref: "/tmp/docktor-container-check-neg.log (captured by Task 1, quoted below)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Real-container positive probe: bind-mounted container boots past the check with no persistence error or warning."
    verification:
      - kind: manual_procedural
        ref: "/tmp/docktor-container-check-pos.log (captured by Task 1, quoted below)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Real mountinfo field layout inside the container matches what findMountEntryForPath() parses (research Assumption A1 closed by observation)."
    verification:
      - kind: manual_procedural
        ref: "/tmp/docktor-container-check-mountinfo.txt (captured by Task 1, quoted below)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Human judged the refusal message actionable (names path, consequence, fix, opt-out) and recorded a keep-or-remove decision on the opt-out variable."
    verification: []
    human_judgment: true
    rationale: "Whether a message reads as actionable to an operator, and whether an escape hatch should exist, are judgment calls that only a human reviewer can make — this is exactly what the checkpoint existed for."

# Metrics
duration: 5min
completed: 2026-09-13
status: complete
---

# Phase 07 Plan 02: Real-Container Verification of the Stacks-Directory Persistence Check Summary

**Observed the persistence check firing and staying quiet against a real Docker container (not a fixture), closing research Assumption A1 and obtaining human sign-off that the refusal message is operator-actionable.**

## Performance

- **Duration:** ~5 min for this checkpoint closeout (Task 1's container probes ran in a prior session)
- **Completed:** 2026-09-13
- **Tasks:** 2/2
- **Files modified:** 1 (this SUMMARY.md)

## Accomplishments

- Confirmed, via a real `node:22-slim`-based Docktor image (not a unit-test fixture), that a container started without a stacks volume refuses to boot and logs a clear, actionable error.
- Confirmed the same image started with a correct bind mount boots silently past the persistence check — no new noise on the happy path.
- Closed research Assumption A1: observed the real `/proc/self/mountinfo` field layout inside the running container and confirmed it matches what `findMountEntryForPath()` parses (previously only extrapolated from kernel documentation).
- Obtained explicit human sign-off on the refusal message's wording and a recorded decision to keep `DOCKTOR_STACKS_MOUNT_CHECK` as a permanent opt-out.
- Left the shared Docker host exactly as found — no unrelated production container touched, no leftover `docktor-mountcheck-*` container or image.

## Task Commits

Task 1 (real-container probes) ran in a prior executor session against a real Docker daemon; it captured evidence only and modified no repository file, so it produced no commit (nothing to commit — captured artifacts landed in `/tmp`, outside the repository).

1. **Task 2: Human reads the real refusal as an operator would** — closed in this dispatch by recording the human's verdict and evidence below; committed together with this SUMMARY.

**Plan metadata:** this SUMMARY.md commit closes the plan.

## Captured Evidence (Task 1, quoted verbatim)

### Negative probe — `/tmp/docktor-container-check-neg.log` (no-volume container, exit code 1)

```
Error: Stacks directory at "/opt/docktor/stacks" is not on a persistent filesystem: the nearest covering mount ("/") is of type "overlay", which does not survive container recreation. Everything Docktor writes there — each managed stack's docker-compose.yml, .env, and relative bind-mount data — will be silently discarded the next time this container is recreated by an image update, a "docker compose up", or a host reboot. Mount the stacks directory into the container at exactly this path: docker-compose.yml's stacks volume is driven by DOCKTOR_STACKS_HOST_DIR, which must equal DOCKTOR_STACKS_DIR. If running on ephemeral storage is deliberate, set DOCKTOR_STACKS_MOUNT_CHECK=false to downgrade this to a warning.
```

### Positive probe — `/tmp/docktor-container-check-pos.log` (bind-mounted container)

Booted past the check with no persistence error and no persistence warning anywhere in the log; the schema-sync step was reached (skipped intentionally via `DOCKTOR_DB_AUTO_PUSH=false`). DB/`docker.sock` connection errors present in the log are expected noise — this probe deliberately omitted a real Postgres and the `docker.sock` mount since only the persistence check itself was under test.

### Mountinfo — `/tmp/docktor-container-check-mountinfo.txt` (verbatim)

```
3771 3759 8:2 /home/raphael/workspace/docktor/.tmp-mountcheck-stacks /home/raphael/workspace/docktor/.tmp-mountcheck-stacks rw,relatime - ext4 /dev/sda2 rw,errors=remount-ro
```

Field index 4 (0-based, whitespace-split) is the mount point path, matching exactly. Field index 7 (immediately after the `-` separator at index 6) is `ext4`, a real filesystem type. This confirms the field layout `findMountEntryForPath()` assumes. Research Assumption A1 (previously extrapolated from kernel docs, never observed) is now closed by direct observation.

Task 1's four automated verify checks all passed (grep counts of 1, 1, 1, and `docker_rc=0` with zero leftover `docktor-mountcheck-*` containers). Host safety confirmed: a full `docker ps` diff before/after showed zero unrelated containers touched. `git status` showed no repository file modified by Task 1.

## Human Verdict (Task 2 checkpoint, recorded verbatim response: "The variable should still exist. It makes sense for some use cases. Rest is approved")

1. **Refusal message** — Approved as clear and actionable: names the wrong path (`/opt/docktor/stacks`), states the consequence (silent data loss on recreation), names the fix (`DOCKTOR_STACKS_HOST_DIR` must equal `DOCKTOR_STACKS_DIR`), and names the opt-out (`DOCKTOR_STACKS_MOUNT_CHECK=false`). No wording changes requested.
2. **Happy-path boot** — Approved as silent: no persistence error or warning noise on a correctly mounted deployment.
3. **Mountinfo field layout** — Approved as matching what `findMountEntryForPath()` parses (mount point at field index 4, filesystem type after the `-` separator).
4. **Opt-out judgment call** — **Decision: KEEP.** `DOCKTOR_STACKS_MOUNT_CHECK` remains a valid, permanent escape hatch. Human reasoning: it makes sense for some legitimate use cases (e.g., deliberately running on ephemeral storage). This is a recorded decision, not an open follow-up item — **no code change results from it**, and no future plan should reopen this as pending work.

## Files Created/Modified

- `.planning/phases/07-release-hardening-data-safety-and-core-workflows/07-02-SUMMARY.md` — this observation record and human judgment closeout.

No source file was created or modified by either task in this plan; plan 07-01 owns every source symbol this phase produces.

## Decisions Made

- **Keep `DOCKTOR_STACKS_MOUNT_CHECK` as a permanent opt-out** (human decision, recorded above). Rationale: legitimate use cases exist for deliberately running on ephemeral storage, so the escape hatch should not be removed or made harder to reach.

## Deviations from Plan

None — plan executed exactly as written. Task 1's container probes and evidence capture ran in a prior executor session and are unchanged; this dispatch only closed Task 2's checkpoint and produced the summary.

## Issues Encountered

None. The checkpoint's judgment call resolved to "keep the existing behavior," which required no code, test, or documentation change beyond recording the decision here.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The phase's single manual-only verification item from `07-VALIDATION.md` (research Assumption A1) is now closed by direct observation.
- `DOCKTOR_STACKS_MOUNT_CHECK`'s behavior is confirmed correct and final — no follow-up work is pending on it.
- Both tasks of plan 07-02 are complete; phase 07-release-hardening-data-safety-and-core-workflows can proceed to its next plan (if any) or be considered closed for this scope.

---
*Phase: 07-release-hardening-data-safety-and-core-workflows*
*Completed: 2026-09-13*
