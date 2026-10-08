# Deferred items (Phase 14)

## From 14-01

- `server/test/unit/infrastructure/git-executor.test.ts`: two tests ("pull on second sync", "re-clone fallback") time out at 5s and hit `EBUSY: resource busy or locked, rmdir` on a Windows temp checkout. Out of scope for 14-01 (untouched files); seen only in the full `test:unit` run.
