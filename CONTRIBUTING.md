# Contributing to Docktor

Thanks for helping make Docktor better. This guide takes you from a fresh clone to a green test run and a well-formed pull request.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating you agree to uphold it. Report unacceptable behaviour to info@docktor.dev.

## License

By submitting a contribution you agree that it is licensed under the project's MIT license, see [LICENSE](LICENSE). There is no contributor license agreement and no `Signed-off-by` line is required.

## Ways to contribute

- **Report a bug or propose a feature:** open an issue with the [bug report or feature request form](https://github.com/docktor-app/docktor/issues/new/choose).
- **Ask a question or share an idea:** use [GitHub Discussions](https://github.com/docktor-app/docktor/discussions).
- **Report a vulnerability:** follow [SECURITY.md](SECURITY.md). Never open a public issue for a security problem.
- **Improve the documentation:** the user documentation lives in a separate repository, [docktor-app/docks](https://github.com/docktor-app/docks). Send documentation changes there.
- **Fix something or build a feature:** pick an open issue, comment that you are working on it, then follow the steps below.

## Repository layout

Docktor is a Yarn v4 monorepo with three workspaces:

| Workspace | Path | Role |
|---|---|---|
| `@docktor/shared` | `shared/` | Shared Zod validation schemas and types |
| `@docktor/server` | `server/` | Fastify 5 + Prisma + PostgreSQL backend |
| `@docktor/client` | `client/` | React 19 + Vite + TailwindCSS frontend |

In production the whole system runs as a single Fastify process: the API, background jobs, SSE streams and the built React SPA are all served from one container, deployed as a Docker Compose stack.

## Architecture and conventions

- [CLAUDE.md](CLAUDE.md) is the source of truth for the server layering (routes, application, domain, repositories, infrastructure), the client component structure, TypeScript standards, testing rules and UI rules. It is written for AI assistants but applies equally to human contributors.
- [docs/design.md](docs/design.md) holds the architecture notes: how stacks, the Docker socket, the proxy, backups and the real-time pipeline fit together.

## Development setup

Local development runs the server and client directly on the host, not in Docker, against a bare Postgres container.

**Prerequisites**

- Node.js 22 or newer
- Corepack enabled, so the Yarn 4.13.0 pinned in `packageManager` is used
- Docker Engine with Compose v2

**Steps**

```bash
corepack enable
yarn install
docker compose -f docker-compose.dev.yml up -d   # Postgres only
```

Create `.env.development` in the repository root (use [.env.example](.env.example) as a reference for every variable). The server refuses to start, and lists what is missing, unless it defines:

- `DATABASE_URL`: the dev Postgres is `postgresql://docktor:docktor@localhost:5432/docktor`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`: for example `http://localhost:3000` (the Vite dev origin `http://localhost:5173` is trusted by default)
- `ENCRYPTION_KEY`: exactly 64 hexadecimal characters

For a host run, also set `DOCKTOR_STACKS_DIR=./dev-data/stacks` and leave `DOCKTOR_STACKS_HOST_DIR` unset, because that variable only applies when Docktor itself runs in a container.

Apply the database migrations and start everything:

```bash
yarn db:migrate
yarn dev
```

`yarn dev` builds `@docktor/shared` once, then runs the server (`tsx watch`) and the client (Vite) side by side. The server listens on <http://localhost:3000> and the client on <http://localhost:5173>.

Never commit `.env.development` or any other file with real secrets.

## Running tests

```bash
yarn test                                          # all workspaces

yarn workspace @docktor/server test                # server unit tests
yarn workspace @docktor/server test:integration    # server integration tests
yarn workspace @docktor/client test                # client unit tests
yarn workspace @docktor/client test:integration    # client Playwright tests

yarn typecheck                                     # tsc --build
```

Server integration tests start their own Postgres through testcontainers, so Docker must be running.

Playwright runs the desktop and mobile projects against a dev server. Set `PLAYWRIGHT_PORT` to avoid port collisions:

```bash
PLAYWRIGHT_PORT=5182 yarn workspace @docktor/client test:integration
```

Write the test first (TDD is the default), cover the happy path and the error paths, and run `yarn typecheck` with zero errors before every commit.

## Commit messages

Use the format `type(scope): description` with one of these types:

| Type | Use for |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or changing tests only |
| `docs` | Documentation only |
| `chore` | Tooling, configuration, dependencies |

Example: `feat(stacks): add deploy cancellation`

Keep each commit to one logical change, and never commit with failing tests or type errors.

## Pull requests

1. Create a `feature/*` branch from `main`.
2. Make small, atomic commits (one logical change each).
3. Open the pull request against `main` and fill in the pull request template.
4. Reference the issue with `Closes #<n>` so it closes automatically when the pull request merges.
5. Wait for CI to be green: build, typecheck, unit tests, integration tests, Playwright tests and the docker-image job.
6. If you changed user-facing behaviour, open a matching pull request in [docktor-app/docks](https://github.com/docktor-app/docks).

## Issue tracking

[GitHub Issues](https://github.com/docktor-app/docktor/issues) are the product backlog. Each issue describes an outcome from the user's point of view. Set the native **Issue Type** (Bug, Feature, Chore, Documentation or Task) rather than a title prefix, and use the `area:*` labels (`area:server`, `area:client`, `area:proxy`, `area:backup`, `area:templates`, `area:auth`, `area:ci`) to show which subsystem is affected. Planned releases are tracked as [milestones](https://github.com/docktor-app/docktor/milestones).
