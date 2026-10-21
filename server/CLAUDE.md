# Server — Claude Code Guidelines

Loaded when working under `server/`. Repo-wide rules live in the root `CLAUDE.md`.

## Architecture — Layered DDD

```
routes/          ← HTTP boundary: Zod schema validation, auth middleware, delegates to services
application/     ← Use-case / application services (business operations)
domain/          ← Pure business rules: state machines, invariants, value objects
repositories/    ← Data access abstraction; all Prisma queries live here
infrastructure/  ← External adapters: Docker, filesystem, third-party clients
jobs/            ← Background workers: StatePoller, FileWatcher, UpdateChecker
lib/             ← Technical utilities: auth, errors, DB client, slugify, parsers
```

**Rules:**
- Routes **only** call application services — never touch repositories or Prisma directly
- Services **never** import route types or HTTP concerns
- Domain code is **pure** (no I/O, no Prisma, no Fastify)
- Repositories are the **only** place that touches Prisma
- Dependency injection via **constructor parameters** — keeps units testable in isolation
- Export singleton repository instances from `repositories/index.ts`

## Error Handling

- Throw typed errors from the custom hierarchy — **never** throw raw `Error` in business code:

  ```typescript
  // lib/errors.ts
  AppError       // base, 500
  NotFoundError  // 404
  ConflictError  // 409
  BadRequestError // 400
  ```

- Repository `findByIdOrThrow()` methods throw `NotFoundError`; callers need not re-check
- The global Fastify error handler in `app.ts` converts `AppError` and Zod errors to HTTP responses — do not add HTTP status logic anywhere else
- Wrap infrastructure errors (Docker, filesystem) in domain-specific errors with context preserved in the `cause` field

## Backend Routes

- Route files are `FastifyPluginAsyncZod` functions
- Define Zod body/params/querystring schemas inline in the route
- Authentication: attach `requireAuth` preHandler to all protected routes
- Route handlers must be thin — extract logic into services immediately if more than ~10 lines

## Database

- Prisma schema is split into modular `.prisma` files under `server/prisma/schema/` — add new models in their own file
- Use Prisma transactions (`prisma.$transaction(...)`) for any operation that touches multiple tables
- Never use raw SQL unless Prisma cannot express the query
- Migrations are generated with `prisma migrate dev` — never edit migration files manually
- Prisma enum values must match the domain's `StackStatus` state machine
