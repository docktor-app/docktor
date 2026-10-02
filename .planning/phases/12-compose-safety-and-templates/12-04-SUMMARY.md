---
phase: 12-compose-safety-and-templates
plan: 04
subsystem: api
tags: [git, templates, zod, execFile, shell-out, security]

requires:
  - phase: 12-compose-safety-and-templates
    provides: "server/src/domain/compose-config.ts (createComposeConfig, reused verbatim for variant compose validation) and plan 12-03's Dockerfile change installing the git binary into the runtime image"
provides:
  - "shared/src/validation/templates.ts — ALLOWED_TEMPLATE_REPO_PROTOCOLS, isAllowedGitRemoteUrl, templateRepoUrlSchema, addTemplateRepoSchema, TEMPLATE_SLUG_PATTERN, templateSlugSchema, templateManifestSchema, templateVariantManifestSchema, templateRepoParamsSchema, templateVariantParamsSchema"
  - "server/src/application/ports/git-executor-port.ts — GitExecutorPort, GitCheckoutResult"
  - "server/src/infrastructure/git-executor.ts — GitExecutor, gitExecutor singleton, GitCommandError"
  - "server/src/application/ports/template-source-reader-port.ts — TemplateSourceReaderPort, TemplateSourceIndex, ParsedTemplate, ParsedTemplateVariant, TemplateSourceIssue"
  - "server/src/infrastructure/template-source-reader.ts — TemplateSourceReader, templateSourceReader singleton, MAX_COMPOSE_BYTES/MAX_ENV_BYTES/MAX_MANIFEST_BYTES/MAX_ICON_BYTES/MAX_VARIANTS_PER_REPO"
  - "docs/templates.md — the template repository authoring format (schemaVersion 1)"
affects: [12-07, 12-10]

actuals:
  tokens: 18713
  tasks: 2
  commits: 2
  plan_head_before: d83d4359c20dc68220ffe17da5b754ad75e7c298
  plan_head_after: f693202b25dc5270adf5af7c4ba23eb83f231c07

tech-stack:
  added: []
  patterns:
    - "GitExecutor mirrors DockerExecutor/ResticExecutor's execFile+promisify shell-out convention with an injectable-options constructor ({allowedProtocols?, timeoutMs?}), applying a fixed COMMON_CONFIG (-c protocol.ext.allow=never, -c core.symlinks=false) and GIT_ALLOW_PROTOCOL/GIT_TERMINAL_PROMPT env to every invocation"
    - "Atomic-rename checkout pattern: every clone writes to a <dir>.tmp-<uuid> sibling first, removes whatever was at the destination only after the clone succeeds, then renames — a failed clone never disturbs an existing checkout, and a reader of checkoutDir never observes a partial write"
    - "withKeyedLock(\"git-checkout:\" + path.resolve(checkoutDir)) serializes syncCheckout per resolved directory path (same keyed-mutex primitive 06-02 introduced for proxy compose writes)"
    - "TemplateSourceReader's lstat-first file access: every manifest/compose/env/icon file and every template/variant directory is lstat'd before being treated as a directory or read as a file — a symlink is never followed, closing T-12-14 with the same primitive docker-executor.ts's graceful-degradation convention (try/catch -> issue, never throw) uses for a malformed template"
    - "Global, not per-template, MAX_VARIANTS_PER_REPO cap: a running counter across the whole readCheckout() call stops adding variants once the limit is hit and records exactly one summary issue, rather than one issue per template"

key-files:
  created:
    - shared/src/validation/templates.ts
    - server/src/application/ports/git-executor-port.ts
    - server/src/infrastructure/git-executor.ts
    - server/src/application/ports/template-source-reader-port.ts
    - server/src/infrastructure/template-source-reader.ts
    - docs/templates.md
    - server/test/unit/infrastructure/git-executor.test.ts
    - server/test/unit/infrastructure/template-source-reader.test.ts
    - server/test/unit/validation/templates-schema.test.ts
  modified:
    - shared/src/validation/index.ts

key-decisions:
  - "ssh://git@host (the conventional git-hosting SSH user shorthand) is rejected, not just https://user:pw@host — isAllowedGitRemoteUrl treats ANY non-empty URL username as embedded credentials regardless of transport, consistent with #19's acceptance criteria only covering public repos (T-12-17); a template-repo URL must be anonymous on every transport"
  - "file:// is absent from the default ALLOWED_TEMPLATE_REPO_PROTOCOLS and only enabled by passing {allowedProtocols: [\"file\"]} explicitly to GitExecutor's constructor — production code never does this; it exists solely so the test suite can clone a real local bare repo without a network dependency"
  - "cloneInto() unconditionally removes whatever is at checkoutDir (via fs.rm force) immediately before the atomic rename, regardless of whether the prior state was a stale failed-pull checkout or a non-git directory — this single code path serves both the 'recloned after failed pull' and 'directory exists but isn't a checkout' cases from the plan's action text, rather than two separate branches"
  - "MAX_VARIANTS_PER_REPO (500) is a global counter across the whole checkout, not per-template — a repository with many small templates can't bypass the cap by spreading variants across more templates"
  - "contentHash is sha256 over JSON.stringify({variant: <validated manifest object>, compose: <raw string>, env: <string|null>}) exactly per the plan's action text — hashing the parsed/validated manifest object (not the raw variant.yml bytes) means whitespace-only variant.yml edits that don't change any field don't bump the pinned hash"
  - "loadEnvContent() returns three states (null = legitimately absent, string = present and valid, undefined = present but invalid) so the caller can distinguish 'no .env.example, that's fine' from 'there's a broken .env.example, skip this variant' without a separate issues-count check"

requirements-completed: ["#19"]

coverage:
  - id: D1
    description: "GitExecutor shells out to the system git binary via execFile (argv only, never a shell) to shallow-clone a template repo — proven end-to-end against a real local bare git repository, not mocked"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/git-executor.test.ts#clones a real local bare repo into the checkout directory (tracer)"
        status: pass
    human_judgment: false
  - id: D2
    description: "syncCheckout is idempotent: calling it twice in a row for the same directory never re-clones — the second call fast-forward pulls instead, and a non-fast-forward (rewritten) history or a non-checkout directory falls back to an atomic re-clone, never leaving a *.tmp-* leftover either way"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/git-executor.test.ts#pull on second sync / #re-clone fallback"
        status: pass
    human_judgment: false
  - id: D3
    description: "Two overlapping syncCheckout calls for the same checkout directory are serialized by a keyed lock and never leave a partially-written checkout or a leftover tmp directory"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/git-executor.test.ts#concurrent syncs: two overlapping syncCheckout calls for the same dir both resolve and leave no tmp dir"
        status: pass
    human_judgment: false
  - id: D4
    description: "A template repo is read as templates/<template>/template.yml plus one subdirectory per variant (variant.yml, docker-compose.yml, optional .env.example); a repo with no templates/ directory yields zero templates and zero issues, not an error; an empty remote syncs with headCommitSha null"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/template-source-reader.test.ts#reads one valid template.../#returns zero templates and zero issues.../#reading the same checkout twice yields deep-equal output; server/test/unit/infrastructure/git-executor.test.ts#resolves headCommitSha: null for an empty remote"
        status: pass
    human_judgment: false
  - id: D5
    description: "A malformed template or variant (bad manifest, missing/invalid compose, oversized file, non-slug directory name, symlink) is excluded and reported as an issue {path, message} naming the offending folder; valid siblings still load"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/template-source-reader.test.ts (11 dedicated rejection-path tests: non-slug dir, template.yml missing/invalid-YAML/schema-failure, variant.yml missing name, compose missing/no-services/oversized/symlink, icon oversized, no-valid-variants, >500 variants)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Every loaded template carries name/description/category/optional icon (as an inline data URI, never a remote URL); every variant carries name/description/optional usage/compose content/optional env content/a content hash"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "server/test/unit/infrastructure/template-source-reader.test.ts#embeds a small icon.svg.../#embeds a small icon.png... plus the tracer test's full-shape assertion"
        status: pass
    human_judgment: false
  - id: D7
    description: "Template repo URLs are accepted only for https/git/ssh without embedded credentials, never starting with '-', never containing '::' — enforced by the shared schema AND re-checked inside GitExecutor before any git process starts"
    requirement: "#19"
    verification:
      - kind: unit
        ref: "server/test/unit/validation/templates-schema.test.ts (16 accept/reject cases); server/test/unit/infrastructure/git-executor.test.ts#URL validation (5 rejected URLs, asserts no checkout directory — hence no git process — was ever created)"
        status: pass
    human_judgment: false

duration: ~35min (two work sessions separated by a rate-limit reset between the two task commits)
completed: 2026-10-02
status: complete
---

# Phase 12 Plan 4: Git-based template infrastructure (GitExecutor + TemplateSourceReader) Summary

**GitExecutor shells out to `git` to shallow-clone/pull a template repository with idempotent, serialized, atomic checkout syncing; TemplateSourceReader walks the resulting checkout's `templates/<name>/<variant>/` layout and returns a schema-validated, hashed, deterministic index — any malformed template or variant excluded with a per-folder issue, never a thrown error.**

## Performance

- **Duration:** ~35 min (session was interrupted by a weekly rate-limit reset between Task 1's commit and Task 2's work; resumed cleanly with no lost work)
- **Started:** 2026-10-02 (continuing after 12-03)
- **Completed:** 2026-10-02
- **Tasks:** 2/2
- **Files modified:** 10 (across 2 commits)

## Accomplishments

- Built `shared/src/validation/templates.ts`: `isAllowedGitRemoteUrl()`/`templateRepoUrlSchema` (https/git/ssh only, no embedded credentials, no `ext::`, no leading `-`), `templateSlugSchema`, and the `template.yml`/`variant.yml` Zod manifests — the single schema boundary both the future `POST /api/template-repos` route (plan 12-10) and `GitExecutor` itself re-check against.
- Built `GitExecutor` (`server/src/infrastructure/git-executor.ts`): shells out to the system `git` binary via `execFile` (argv only, never a shell) to shallow-clone (`--depth 1 --single-branch --no-tags`) a template repo into a local checkout, with the remote URL re-validated immediately before any process spawns. `syncCheckout()` is idempotent (fast-forward pulls an existing checkout instead of re-cloning), falls back to an atomic re-clone when the pull fails (rewritten history, or a non-checkout directory), and serializes every call per resolved directory path via `withKeyedLock` — proven against a real local bare git repo across clone, pull, re-clone-on-rewritten-history, and two-overlapping-calls scenarios, with no `*.tmp-*` leftover in any case.
- Built `TemplateSourceReader` (`server/src/infrastructure/template-source-reader.ts`): walks a checkout's `templates/<template>/template.yml` + `templates/<template>/<variant>/{variant.yml, docker-compose.yml, .env.example?}` layout (D-06), validating every manifest against the shared Zod schemas, every compose file against the existing `createComposeConfig()`, and every icon/compose/manifest/env file against a fixed byte limit — `lstat`-checking every file and directory it opens so a symlinked entry (T-12-14) is rejected, never followed. A malformed template or variant is excluded with an `{path, message}` issue; valid siblings still load. A global cap (`MAX_VARIANTS_PER_REPO = 500`) stops with one summary issue rather than one per template.
- Wrote `docs/templates.md`: the authoring format (schemaVersion 1), field tables for both manifests with their limits, a complete Nextcloud `default`/`with-redis` example, the recommended conventions that keep a template from tripping Docktor's own dangerous-config warnings, the full limits/rejections table, and how template versioning (content-hash pin, passive "updated" badge, never auto-applied) works — this is what the currently-empty official `github.com/docktor-app/templates` repo's first templates will be written against.
- 57 new unit tests across the three new test files, all passing; full server unit suite (1226 tests, up from 1165 before this plan) and `yarn typecheck` both pass cleanly.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer — clone a local bare repo and read back one valid template with one variant** - `c062380` (feat)
2. **Task 2: Pull/re-clone with locking, URL rejection, every malformed-template path and size limit, and the authoring doc** - `f693202` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `shared/src/validation/templates.ts` - `isAllowedGitRemoteUrl`, `templateRepoUrlSchema`, `addTemplateRepoSchema`, `templateSlugSchema`, `templateManifestSchema`, `templateVariantManifestSchema`, `templateRepoParamsSchema`, `templateVariantParamsSchema`
- `shared/src/validation/index.ts` - re-exports `./templates.js`
- `server/src/application/ports/git-executor-port.ts` - `GitExecutorPort`, `GitCheckoutResult`
- `server/src/infrastructure/git-executor.ts` - `GitExecutor`, `gitExecutor` singleton, `GitCommandError`
- `server/src/application/ports/template-source-reader-port.ts` - `TemplateSourceReaderPort`, `TemplateSourceIndex`, `ParsedTemplate`, `ParsedTemplateVariant`, `TemplateSourceIssue`
- `server/src/infrastructure/template-source-reader.ts` - `TemplateSourceReader`, `templateSourceReader` singleton, size/count limit constants
- `docs/templates.md` - template repository authoring format
- `server/test/unit/infrastructure/git-executor.test.ts` - 10 tests against a real local bare repo fixture
- `server/test/unit/infrastructure/template-source-reader.test.ts` - 17 tests covering the tracer path plus every rejection path
- `server/test/unit/validation/templates-schema.test.ts` - 28 accept/reject schema cases

## Decisions Made

- **`ssh://git@host` is rejected, not just `https://user:pw@host`** — `isAllowedGitRemoteUrl` treats any non-empty URL username as embedded credentials on every transport, including the conventional git-hosting SSH shorthand. This is deliberate per T-12-17/#19's "public repos only" scope, not an oversight — an `ssh://host/path` URL (no user) is what the allowlist actually expects for the ssh transport.
- **`file://` is opt-in only** — absent from the default `ALLOWED_TEMPLATE_REPO_PROTOCOLS`, enabled solely by passing `{allowedProtocols: ["file"]}` to `GitExecutor`'s constructor. Production code (the future `TemplateService`) never does this; it exists purely so tests can clone a real local bare repo without a network dependency.
- **`cloneInto()` always removes the destination before the atomic rename**, regardless of whether the prior state was a stale failed-pull checkout or a non-git directory — one code path serves both "recloned after failed pull" and "directory exists but isn't a checkout" from the plan's action text, rather than two separate branches.
- **`MAX_VARIANTS_PER_REPO` is a global counter across the whole checkout**, not per-template, closing the obvious bypass (spread variants across more templates to dodge a per-template cap).
- **`contentHash` hashes the validated manifest object, not the raw `variant.yml` bytes** — a whitespace-only edit to `variant.yml` that doesn't change any parsed field doesn't bump the pinned hash and therefore doesn't trigger a spurious "template updated" badge later (plan 12-07/D-08).

## Deviations from Plan

None — plan executed exactly as written. Every `<behavior>` line in both tasks is covered by a dedicated test, every `<verify>` command passed, and every `<acceptance_criteria>` grep matched.

## Issues Encountered

- The git-executor test's bare-repo fixture initially left the bare repo's symbolic `HEAD` unset relative to the branch actually pushed (`git init --bare`'s default symbolic-ref target doesn't necessarily match the pushed branch name), which made `git rev-parse HEAD` resolve to nothing in the clone and made `headCommitSha` incorrectly come back `null` for the tracer test. Root-caused via a standalone `tsx` reproduction script outside the test runner, fixed by having the fixture explicitly set the bare repo's `symbolic-ref HEAD` to the branch it just pushed — a test-fixture correctness issue, not a `GitExecutor` bug (confirmed by isolating the repro before touching any source file).
- A mid-session rate-limit reset interrupted work between Task 1's commit and the start of Task 2; no commits or files were lost — `git status`/`git diff` on resume showed exactly the uncommitted Task 2 work in progress, and the ledger file for commit counting was already in place from Task 1.

## User Setup Required

None - no external service configuration required. `git` is already installed in the runtime image (plan 12-03).

## Next Phase Readiness

- Plan 12-07's `TemplateService` can now call `gitExecutor.syncCheckout(repo.url, <cacheDir>/<repoId>)` then `templateSourceReader.readCheckout(dir)` inside a per-repo lock and persist the resulting index — both adapters are fully proven and exported as singletons (`gitExecutor`, `templateSourceReader`) ready for constructor injection.
- Plan 12-10's `POST /api/template-repos` can validate its request body directly with `addTemplateRepoSchema` (`@docktor/shared`).
- `docs/templates.md` is ready for the official `github.com/docktor-app/templates` repo's first templates to be authored against.
- No blockers.

---
*Phase: 12-compose-safety-and-templates*
*Completed: 2026-10-02*

## Self-Check: PASSED

All 9 created files, the modified `shared/src/validation/index.ts`, and this SUMMARY.md verified present on disk; both task commits (`c062380`, `f693202`) verified present in git history.
