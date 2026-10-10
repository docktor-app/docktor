# Deferred items (Phase 14)

## From 14-01

- `server/test/unit/infrastructure/git-executor.test.ts`: two tests ("pull on second sync", "re-clone fallback") time out at 5s and hit `EBUSY: resource busy or locked, rmdir` on a Windows temp checkout. Out of scope for 14-01 (untouched files); seen only in the full `test:unit` run.

## From 14-11

- `server/test/unit/infrastructure/git-executor.test.ts` (3 tests: concurrent syncs, pull on second sync, re-clone fallback) and `server/test/unit/infrastructure/template-source-reader.test.ts` ("caps variants at MAX_VARIANTS_PER_REPO") fail in the full `test:unit` run on Windows (git/temp-dir timing). Untouched by 14-11; every file this plan changed passes.

## From 14-08

- Config tab, compose editor: a single long line in the compose file (for example a long comment or URL, with no probe configured) widens the whole page horizontally at desktop width (measured `documentElement.scrollWidth` 1536 against `clientWidth` 1280, system Edge). It is caused by the compose editor and reproduces without any health probe, so it is out of scope for 14-08. The probe URL input itself scrolls inside its own box as intended.
