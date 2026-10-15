---
status: diagnosed
trigger: "UAT 18 test 4 (G-18-4): migration preview diff shows whitespace-only change '- ./data:/var/opt/memos' instead of the bind mount rewrite; test 6 shows 'Volumes to copy: 0'"
created: 2026-10-15T16:00:00Z
updated: 2026-10-15T16:20:00Z
goal: find_root_cause_only
---

## Current Focus

bug_class: Bohrbug (deterministic, reproduced with the real analyzer/rewriter/diff/scanner)
hypothesis: CONFIRMED. Two independent defects, both pre-phase-18 (AND-gate fires):
  (A) selection omission - DiscoveredStack.absolutePaths only carries ABSOLUTE bind mounts, and MigrationWizard builds bindMountSelections solely from it, so a relative mount like ./data is never offered, never copied, never rewritten ("Volumes to copy: 0", volumeSelections = []).
  (B) lossy re-serialisation - ComposeRewriter.rewrite() always does yaml.parse -> yaml.stringify, so even with no rewrite selected, the output is re-indented/re-quoted and comment-stripped; the real line diff added in phase 18 (computeUnifiedDiff) now renders that noise as -/+ line pairs.
test: scratchpad repro with real ComposeAnalyzer, BrownfieldScanner, ComposeRewriter, computeUnifiedDiff (LF, CRLF, 2/4-space, indented/non-indented sequences)
expecting: n/a - done
next_action: return ROOT CAUSE FOUND to caller (goal find_root_cause_only; do not fix)

## Symptoms

expected: The migration preview diff shows the compose rewrite the user selected (relative bind mount ./data rewritten to the new stack's data path), without spurious whitespace-only changes.
actual: "the change is: `-     - ./data:/var/opt/memos` / `+      - ./data:/var/opt/memos` instead of `+ /volume/data:/var/opt/memos`"; test 6 summary shows "Volumes to copy: 0".
errors: none
reproduction: UAT test 4/6 in .planning/phases/18-import-and-migration-flow/18-UAT.md - scan a "memos" stack with `- ./data:/var/opt/memos`, Migrate, Preview Changes.
started: discovered during phase 18 UAT (2026-10-15); both defects date from phase 5 (April 2026)

## Eliminated

- hypothesis: CRLF line endings cause the single-line indentation diff
  evidence: A CRLF original makes the whole file differ (every line shows as removed with a trailing \r and re-added without it: +9/-9 for the 9-line memos file), not one line pair. The user's quoted diff is a single pair, so the original was most likely LF. CRLF is an additional (separate) source of noise, not the explanation of this symptom.
  timestamp: 2026-10-15T16:10:00Z

- hypothesis: The wizard/server would have rewritten ./data but the rewriter or diff drops it (Windows path, CRLF, split(":") problem)
  evidence: With originalPath "./data" selected (convert true, newPath ./volumes/data) the real rewriter + diff produce `- ./data:/var/opt/memos` -> `+ ./volumes/data:/var/opt/memos` (LF and with comments). The server side handles relative sources fine (migration-service step 5 joins originalDir + originalPath, confined by assertWithin). The selection never reaches it.
  timestamp: 2026-10-15T16:12:00Z

## Evidence

- timestamp: 2026-10-15T16:05:00Z
  checked: server/src/infrastructure/brownfield-scanner.ts:144-146
  found: `absolutePaths: analysis.bindMounts.filter((m) => m.type === "absolute").map((m) => m.path)`. ComposeAnalyzer.extractBindMounts DOES return the relative mount (type "relative", path "./data", containerPath "/var/opt/memos"), the scanner then discards it.
  implication: DiscoveredStack has no field for relative bind mounts at all (shared DTO client/src/lib/brownfield-types.ts DiscoveredStack: only namedVolumes + absolutePaths).

- timestamp: 2026-10-15T16:06:00Z
  checked: client/src/routes/setup/components/migration-wizard.tsx:81-88 and 114-116
  found: bindMountSelections = stack.absolutePaths.map(path => ({originalPath: path, newPath: `./volumes/${directoryDisplayName(path) || "data"}`, convert: true})). volumesToCopy = (#true namedVolumeSelections) + (#bindMountSelections with convert). MigrationSelectStep renders only these (heading "Absolute Bind Mounts").
  implication: for the memos stack (no named volumes, one relative bind) namedVolumes = [], absolutePaths = [] -> bindMountSelections = [] -> step 1 shows no volume rows, summary "Volumes to copy: 0" (test 6), previewMigration receives volumeSelections [] and {}.

- timestamp: 2026-10-15T16:08:00Z
  checked: real BrownfieldScanner.scan on a temp dir containing the memos compose file (LF)
  found: stack row has namedVolumes [], absolutePaths [], compatibility "green". (scratchpad/repro.mts)
  implication: confirms the data the wizard receives; "green" also means no yellow hint that anything needs attention.

- timestamp: 2026-10-15T16:09:00Z
  checked: ComposeRewriter.rewrite(original, [], new Map()) + computeUnifiedDiff, variants
  found: (1) memos file already in yaml's canonical style (2-space, sequences indented under their key): diff +0/-0. (2) sequences NOT indented under the key (`volumes:` and `- ./data...` at the same column, the style Docker docs and many hand-written files use): diff +2/-2, exactly `-    - ./data:/var/opt/memos` / `+      - ./data:/var/opt/memos` (plus the same for `ports:`). (3) 4-space mapping indent: whole services block re-indented (+8/-8). (4) CRLF original: +9/-9, every line. (5) with a leading comment / inline comment / quoted port: comments dropped, `"5230:5230"` -> `5230:5230`.
  implication: the "-     - ./data..." / "+      - ./data..." pair is yaml.stringify normalising the sequence indent (always key indent + 2). The path is unchanged because no selection existed (A); the pair exists at all because rewrite() always round-trips the document through parse/stringify (B).

- timestamp: 2026-10-15T16:11:00Z
  checked: server/src/infrastructure/compose-rewriter.ts:28,131-133; git show 4084916^ (pre-phase-18 rewriter)
  found: rewrite() does `parseYaml` -> mutate JS object -> `stringifyYaml(doc, {lineWidth: 0})`; no Document/CST use, so comments, quoting, indentation, blank lines and line endings are all lost. The pre-phase-18 preview used a positional line-by-line generateDiff over the same two strings, so it showed the same noise (worse: a shifted line cascades). Phase 18-02 only swapped the renderer for a real line diff (computeUnifiedDiff).
  implication: (B) is pre-existing; phase 18's honest diff just made it visible. Not a phase 18 regression.

- timestamp: 2026-10-15T16:13:00Z
  checked: git blame / git log
  found: brownfield-scanner.ts:144-146 from e723f645 (feat(05-02), 2026-04-08); migration-wizard.tsx:81-88 from 14a9913e (feat(05-06), 2026-04-08; newPath line adjusted 36c2085d 2026-09-03); compose-rewriter.ts parse/stringify from 756ad81 (feat(05-04)). `git log 43ade99..HEAD` on compose-rewriter.ts / compose-analyzer.ts / migration-wizard.tsx / unified-diff.ts: only phase 18 commits 4084916 (drop generateDiff), 82aab7a/c529516 (wizard dialog UX), none touching selection building or serialisation.
  implication: both defects predate phase 18.

- timestamp: 2026-10-15T16:14:00Z
  checked: .planning/phases/18-import-and-migration-flow/18-REVIEW.md WR-01 and 18-VERIFICATION.md (non-blocking WR-01)
  found: the phase 18 code review already flagged exactly (A): "Relative bind mounts (and build: contexts) are never copied; new stack starts with empty data ... Only stack.absolutePaths become volumeSelections ... dialog copy implies completeness"; verification classified it "pre-existing migration design, outside the five phase requirements, recommend a follow-up issue or explicit 'not migrated' warning". UAT G-18-4 is that known gap hit in real use. Consequence if the user had continued to Confirm & Migrate: new stack dir would contain only docker-compose.yml/.env; `./data:/var/opt/memos` resolves to an empty <newStack>/data (fresh Memos database); real data only exists in pre-migration-backup/ and the original dir.
  implication: severity is higher than a cosmetic diff - silent data-not-migrated for the most common bind-mount style. Explains why UAT 7/8 (full migrate) are blocked.

- timestamp: 2026-10-15T16:15:00Z
  checked: intended design (docs/design.md "Volume Strategy: Bind Mounts Only", Import Modes; wizard newPath)
  found: convention is all data bind-mounted into the stack's `./volumes/` directory; the wizard's newPath for a converted bind is `./volumes/<basename>`. For ./data that yields `./volumes/data:/var/opt/memos`, which is what the user wrote as "/volume/data:...". No design text says relative mounts should be left alone vs moved into ./volumes/ (design.md: "Relative bind mounts into ./volumes/: Accepted"; a relative mount elsewhere, e.g. ./data, is not covered).
  implication: expected rewrite is `./data` -> `./volumes/data` (copy <old>/data to <new>/volumes/data); alternative is keep `./data` and copy to <new>/data (no compose change). Product decision needed, but either requires relative mounts to be surfaced and copied.

## Resolution

root_cause: Two independent pre-existing defects (AND-gate: both are needed for the observed symptom). (A) The scanner (brownfield-scanner.ts:144-146) exposes only absolute bind mounts as DiscoveredStack.absolutePaths, and MigrationWizard (migration-wizard.tsx:81-88) derives bindMountSelections solely from that list, so a relative bind mount such as ./data is never offered in step 1, never copied (migration-service step 5 iterates the empty selection list) and never rewritten - hence volumeSelections = [] and "Volumes to copy: 0". (B) ComposeRewriter.rewrite() always round-trips the compose file through yaml.parse -> yaml.stringify (compose-rewriter.ts:28,131), which normalises sequence indentation (key indent + 2), quoting and drops comments, and converts CRLF to LF; with nothing selected the preview therefore shows only formatting noise such as `-    - ./data:/var/opt/memos` / `+      - ./data:/var/opt/memos`.
fix: (not applied - diagnose-only)
verification: (not applicable)
files_changed: []
