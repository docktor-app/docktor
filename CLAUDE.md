# Docktor — Claude Code Guidelines

Docktor is a self-hosting management platform for Docker Compose applications — a **Yarn v4 monorepo** (`shared/`, `server/`, `client/`).

Workspace-specific rules live in `server/CLAUDE.md` and `client/CLAUDE.md`. Issue-tracking conventions (GitHub Issues, `/gsd-capture` override) live in the `docktor-issues` skill (`.claude/skills/docktor-issues/SKILL.md`) — **never** write `.planning/todos/` for user-facing work; create a GitHub issue.

---

## Core Principles

**Software quality is the highest priority.** Favour correctness, clarity, and maintainability over speed of delivery. Every change should leave the codebase in better shape than it was found.

1. **Modular, layered architecture** — respect existing boundaries between layers
2. **Domain-Driven Design (DDD)** — model the domain explicitly; keep business logic in the domain/application layers
3. **Test-Driven Development** — write tests before or alongside implementation; all features must be covered
4. **Strict TypeScript** — no implicit `any`, no unsafe casts; types are documentation
5. **Design patterns** — apply patterns (Repository, State Machine, Factory, Strategy, Observer, etc.) when they fit the use case; never force them
6. **Continuous refactoring** — improve code quality whenever a change touches a module; leave no design debt behind

---

## TypeScript Standards

- `strict: true` is enforced across all workspaces — never disable it
- **No `any`** — use `unknown` and narrow the type, or model the type properly
- **No unchecked casts** — `as SomeType` is only acceptable with a comment explaining why it is safe
- Use `z.infer<typeof schema>` for runtime-validated types (Zod schemas live in `@docktor/shared`)
- Prisma types are the source of truth for database shapes — use generated types, not manual re-declarations
- Use utility types (`Pick<>`, `Omit<>`, `Partial<>`, `Record<>`) rather than duplicating interfaces
- Component props interfaces must be named `<ComponentName>Props` and use `Readonly<Props>` in function signatures
- Use explicit return types on exported functions and public class methods

### Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| React components | PascalCase | `StackStatusBadge.tsx` |
| Hooks, utilities, API clients | kebab-case | `use-stacks.ts`, `stacks-api.ts` |
| Domain/business files | kebab-case | `stack-status-machine.ts` |
| Classes | PascalCase | `StackRepository` |
| Constants | SCREAMING_SNAKE_CASE | `TRANSITIONAL_STATES` |
| Variables / functions | camelCase | `deployStack()` |
| Prisma models | PascalCase | `Stack`, `Service` |
| Prisma enum values | SCREAMING_SNAKE_CASE | `RUNNING`, `DEPLOYING` |
| Test files | `*.test.ts` / `*.test.tsx` | `stack-service.test.ts` |

---

## Testing

### Philosophy

- **TDD is the default** — write the test first, then make it pass
- Every new feature and bug fix must have corresponding tests
- Tests must cover both the happy path and edge cases / error paths
- Do **not** test implementation details — test observable behaviour

### Structure

```
server/test/unit/          ← Unit tests for services, domain logic, repositories (mocked deps)
server/test/integration/   ← Integration tests hitting real Fastify + real DB
client/test/unit/          ← Component, hook, and lib unit tests (jsdom / testing-library)
client/test/integration/   ← Playwright E2E tests
```

### Rules

- **Server unit tests**: mock the repository, filesystem, and Docker; test services and domain logic in isolation
- **Server integration tests**: run against a real database (no mocked DB — lessons from past regressions)
- **Client hook tests**: mock `fetch` / API clients; test hook state transitions
- **Client component tests**: use `@testing-library/react`; prefer queries by role / label
- Keep integration tests isolated — each test cleans up its own data
- Coverage is tracked via SonarQube (LCOV reports in `.test/coverage/`) — do not let coverage drop

---

## Design Patterns in Use

Apply patterns where they improve clarity — never for their own sake.

| Pattern | Where it is used | When to extend |
|---------|-----------------|----------------|
| **Repository** | `server/repositories/` | Any new data access; never query Prisma outside a repository |
| **State Machine** | `domain/stack-status-machine.ts` | Add new states/transitions here; keep transition logic pure |
| **Service (Application)** | `server/application/` | New use cases; one service per aggregate root |
| **Strategy** | `infrastructure/` adapters | Swap Docker or filesystem implementations |
| **Observer / Pub-Sub** | `StateBroadcaster` + SSE streams | Real-time events to connected clients |
| **Factory** | Fastify plugin factory (`createApp`) | Testable app construction |
| **Decorator** | Fastify hooks (`requireAuth`) | Cross-cutting concerns on routes |
| **Generic Component** | `DataTable<T>` | Reusable UI over typed data |

---

## Real-time / SSE

- Container events and stack status changes flow through `StatePoller` (server) → SSE endpoint → `useContainerEvents` / `useLogStream` hooks (client)
- Do not poll the REST API for state that is available via SSE
- Hooks must close the `EventSource` in the cleanup function to prevent connection leaks

---

## Validation

- **All** request validation uses Zod schemas from `@docktor/shared`
- Shared schemas are the single source of truth — keep client and server in sync automatically
- Add new schemas to the appropriate file in `shared/src/validation/` and re-export from `shared/src/index.ts`
- Do not duplicate Zod schemas in the server or client

---

## Code Quality & Refactoring

- Run `tsc --build` before every commit — zero type errors allowed
- Refactor **proactively** when touching a module: extract duplicated logic, improve names, tighten types
- Remove dead code; do not leave commented-out blocks
- Avoid `any` casts such as `as any` — if one exists, replace it with a proper type
- Keep functions and methods short; extract helpers if a function exceeds ~30 lines
- SonarQube is the quality gate — do not suppress issues without a justified comment
- Add inline comments only where the intent is not obvious from the code itself

---

## Import Conventions

| Workspace | Style | Example |
|-----------|-------|---------|
| `client` | Absolute via `@/*` alias | `import { useStacks } from "@/hooks/use-stacks"` |
| `server` | Relative with `.js` extension (ESM) | `import { stackRepository } from "../repositories/index.js"` |
| Both | Shared schemas | `import { CreateStackInput } from "@docktor/shared"` |

- Do not create barrel `index.ts` files for a single module
- Group imports: external packages → workspace packages → local modules (blank line between groups)

---

## Git & Commits

- One logical change per commit; keep commits atomic and reviewable
- Commit message format: `type(scope): description` (e.g., `feat(stacks): add deploy cancellation`)
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
- Never commit with failing tests or type errors
- Feature work on `feature/*` branches; merge to `main` via PR
- **Every GSD phase runs on its own feature branch** named `feature/phase-<N>-<slug>` (e.g. `feature/phase-22-migration-hardening`), created from `main` before the phase's discuss/plan/execute work starts; all of the phase's commits (including `.planning/` docs) go on that branch
- PRs close their issue with `Closes #<n>`

---

## Common Pitfalls to Avoid

- **Do not** import Prisma client outside `repositories/` or `lib/database.ts`
- **Do not** put business logic in route handlers
- **Do not** fetch data directly in React components — use a custom hook
- **Do not** edit files in `components/ui/` (shadcn-managed)
- **Do not** duplicate Zod schemas — add to `@docktor/shared`
- **Do not** use `as any` — model the type correctly
- **Do not** add HTTP status codes outside `lib/errors.ts` and `app.ts`
- **Do not** skip tests to ship faster — tests are part of the feature
