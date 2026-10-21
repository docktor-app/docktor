---
status: investigating
trigger: "UAT 18 test 3 (G-18-3): scanned unmanaged stack not listed in Import existing stack table on Windows Docker Desktop; no error"
created: 2026-10-15T15:10:00Z
updated: 2026-10-15T15:45:00Z
goal: find_root_cause_only
---

## Current Focus

hypothesis: The target stack is dropped by the pre-phase-18 scanner (scan root not resolvable inside the container / ignore globs / filename patterns / silent YAML-parse drop), not by any phase 18 code. Which one cannot be decided without the user's scan input and file path.
test: exercised BrownfieldScanner (real fast-glob + yaml) and self-stack-paths (real module) in scratchpad with Docker Desktop style paths
expecting: n/a - investigation concluded as INCONCLUSIVE; need user data (see Resolution)
next_action: return INVESTIGATION INCONCLUSIVE to caller with ranked possibilities and the data the user must supply

## Symptoms

expected: A scanned, not-yet-managed compose stack is listed in the "Import existing stack" scan table with a Migrate button.
actual: "i am not able to test this, since the stack I tried to migrate was not found. I am not sure, whether this is a windows issue." Clarified: "no error, only not showing the stack in the table. it is running with docker desktop and /run/desktop/mnt/host/c/... as stack directory volume mount."
errors: none (no toast, no error)
reproduction: UAT test 3 in .planning/phases/18-import-and-migration-flow/18-UAT.md
started: discovered during phase 18 UAT (2026-10-15)

## Eliminated

- hypothesis: H1 - Phase 18 own-stack exclusion (self-stack-paths.ts / docker-self-stack.ts / onboarding-service.ts) wrongly drops the target stack
  evidence: excludeOwnComposeFiles drops a row only when its path equals (after backslash->slash) one of the candidates derived from Docktor's OWN config_files label via containerVisiblePaths (identical path + one file path per bind mount whose source is an ancestor). Every candidate is a specific compose FILE path of Docktor's own stack; there is no directory-level, name, image or install-dir matching. Ran ownComposeFileCandidates with Windows-PowerShell, /run/desktop, /mnt/c, relative+Windows-wd and in-stacks-dir labels against mounts {docker.sock, identical-path stacks dir, "/"->/host}: candidates were always the own file only; a different file (even a sibling in the same directory) was always kept. Fail-open on any error (empty list = exclude nothing).
  timestamp: 2026-10-15T15:30:00Z

- hypothesis: H3 - client hides the row (managed/adopted matching, path normalisation)
  evidence: client/src/components/domain/stack/brownfield-import.tsx renders `stacks.map(...)` of exactly what the API returned. The only per-row state is adoptedIds, which swaps the buttons for the text "Imported" for rows adopted/migrated in the same session; it never removes rows. No managed-stack comparison exists on either side (consistent with UAT test 2, where already-managed stacks were listed). server/src/routes/imports.ts -> onboardingService.scan returns the scanner result minus own compose files, nothing else.
  timestamp: 2026-10-15T15:30:00Z

## Evidence

- timestamp: 2026-10-15T15:20:00Z
  checked: git diff 43ade99..HEAD for brownfield-scanner.ts
  found: Phase 18 changed the scanner by exactly one line, the ignore glob **/pre-migration-backup/**. Everything else (COMPOSE_FILE_PATTERNS, SYSTEM_DIR_EXCLUDES dev/sys/proc/node_modules/.git, fs.access + ENOENT->skipped, silent catch on parse failure) predates phase 18.
  implication: whatever hides the stack is pre-existing scanner behaviour, not a phase 18 regression (H4 true for the scanner, unless the user's stack path contains pre-migration-backup).

- timestamp: 2026-10-15T15:35:00Z
  checked: exp5 - BrownfieldScanner against a simulated Docker Desktop container tree (identical-path stacks mount at /run/desktop/mnt/host/c/docktor-stacks, host C: only under /host/run/desktop/mnt/host/c/...)
  found: (1) scan input "/run/desktop/mnt/host/c/Users/me/projects" (VM path without /host prefix, not mounted in the container) -> ENOENT, result {stacks:[managed1 only], skippedDirectories:1}, only a server-side console.warn. (2) scan input "C:\Users\me\projects" -> same ENOENT result. (3) scanning the correct /host/... tree: a stack under a directory named "dev" is silently dropped by **/dev/**, and a compose file with invalid YAML (tabs, duplicate keys) is silently dropped by the catch in scan() (console.warn only).
  implication: the observed symptom (table shows the stacks that are reachable, e.g. managed ones; target absent; no error) is exactly what an unreachable scan root produces. UI shows the skipped count only as "N directory skipped (permission denied)" and only when at least one stack was found; ENOENT is mislabelled as permission denied.

- timestamp: 2026-10-15T15:38:00Z
  checked: fast-glob ignore semantics (exp1)
  found: **/dev/** **/sys/** **/proc/** **/node_modules/** match against the path relative to the scan root, so ANY directory named dev/sys/proc/node_modules below the scan root hides every stack beneath it (cwd itself being named dev is fine). Also not matched: docker-compose.prod.yml, docker-compose.override.yml, Docker-Compose.yml, docker-compose.YML (case-sensitive), and anything under dot-directories.
  implication: plausible on Windows (C:\dev\..., C:\Users\x\dev\...); pre-existing.

- timestamp: 2026-10-15T15:40:00Z
  checked: self-stack-paths with Windows-style label (secondary finding)
  found: label "C:\Users\me\docktor\docker-compose.yml" is not posix-absolute, so it is never used as-is; with a working_dir label it becomes path.posix.resolve(cwd-prefixed garbage) and never matches any scanned path. So when Docktor is started from PowerShell, Docktor's own stack is NOT hidden on Docker Desktop (no C:\ -> /run/desktop/mnt/host/c translation). The user reported it WAS hidden, so either their labels are POSIX-shaped or the scan root simply did not contain Docktor's file (unverifiable).
  implication: separate latent defect (G-18-2 area), does not explain a missing unmanaged stack.

- timestamp: 2026-10-15T15:41:00Z
  checked: docs/, UI copy, docker-compose.yml
  found: Scan paths are CONTAINER paths. docker-compose.yml gives host access only via /:/host:ro, so host stacks are at /host/<host path>; the UI default is "/home, /opt, /srv" and the helper text mentions only system dirs, no /host hint. On Docker Desktop the "host" is the Docker VM; Windows drives are at /run/desktop/mnt/host/c/... inside it, so the container-visible path would be /host/run/desktop/mnt/host/c/... (not confirmed that rbind of "/" exposes the C: mount; needs the user's `ls`). Only the identical-path stacks volume is visible at /run/desktop/mnt/host/c/<stacks dir>.
  implication: a user who knows their stack as /run/desktop/mnt/host/c/... or C:\... and types that gets silent ENOENT.

## Resolution

root_cause: NOT DETERMINED (inconclusive without user environment data). Ranked: (1) scan root not resolvable inside the container (silent ENOENT counted as "skipped (permission denied)"); (2) pre-existing scanner exclusions (dev/sys/proc dirs, non-default or differently-cased filenames, dot dirs); (3) compose file failing YAML parse is silently dropped. Own-stack exclusion and client filtering eliminated.
fix:
verification:
files_changed: []
