# Deferred Items - Phase 13

Out-of-scope discoveries logged during execution; not fixed by the plan that found them.

## Found during 13-02

- `yarn typecheck` reports pre-existing errors from a stale generated Prisma client (`templateRepoUrl`, `deployWarnings`, `templateUpdateAvailable`, `templateRepo` and `template*` models missing from the generated types) and from client packages that are not installed (`@uiw/react-codemirror`, `@codemirror/lang-yaml`, `@codemirror/lint`). Likely fixed by running `prisma generate` and `yarn install` in this checkout.
- `server/test/unit/infrastructure/git-executor.test.ts` (3 cases: pull on second sync, re-clone fallback, concurrent syncs) and `server/test/unit/infrastructure/template-source-reader.test.ts` (MAX_VARIANTS_PER_REPO cap) fail in the full server unit run. They exercise real git processes and files unrelated to this plan.
