# Contributing

This repository holds three independent solutions. Each problem directory is a self-contained project with its own `package.json`; there is no workspace root install and no shared build. Work inside the directory of the problem you are changing.

## Project layout

```
src/problem4/    sum_to_n - three implementations and a Jest suite. No server, no database.
src/problem5/    Express + TypeScript CRUD service on PostgreSQL 16.
src/problem6/    Specification only. Markdown and Mermaid diagram sources.
```

Problem 5 in more detail:

```
src/problem5/
  config/config.js     sequelize-cli configuration (CommonJS - the CLI loads it directly)
  docker/init/         first-boot SQL; creates the test database
  docker-compose.yml   postgres:16-alpine, host port 5439, pg_isready healthcheck
  migrations/          sequelize-cli migrations - the only source of schema
  src/
    config/            environment schema, validated once at boot
    db/                query scope helpers and LIKE escaping
    domain/            zod schemas for requests
    http/              error vocabulary, error handler, response mapping, tenant context
    models/            Sequelize models
    routes/            Express routers - validate, then delegate
    services/          business logic and every query
  test/                Jest suites
```

Route handlers resolve tenant context, validate with zod and call a service. Business logic and queries live in `src/services/`; if a handler starts branching on data, that branch belongs in a service.

## Runtime

Node 24, pinned by `.nvmrc` at the repository root and in the two directories that run Node, `src/problem4` and `src/problem5`. Run `nvm use` in the directory you are working in before any `npm` command. The published `engines` range is `>=20`, but everything is developed and tested on 24 LTS.

## Database and migrations

- Schema changes go through sequelize-cli migrations only. `sequelize.sync()` is not used anywhere, including in tests, so a fresh clone and a long-lived database always converge on the same structure.
- Create one from `src/problem5/`: `npx sequelize-cli migration:generate --name add-something`. `.sequelizerc` points the CLI at `migrations/`, `config/config.js` and `src/models/`. Keep the generated timestamp prefix — it is what orders the migrations.
- Write both `up` and `down`. A migration that cannot be rolled back is not finished.
- Name your CHECK constraints explicitly (`ck_campaign_window`, `ck_amounts`, and so on) and name your unique indexes the same way (`uq_campaign_brand_name` is a `CREATE UNIQUE INDEX`). The HTTP error handler maps constraint names to status codes: an unnamed CHECK violation matches nothing in that table and reaches the client as a 500. A unique violation is the one exception — the handler falls back on the Sequelize error type and still answers 409 — but relying on that leaves the response without the constraint name a caller needs to tell two conflicts apart.
- Writes that touch more than one row run inside `sequelize.transaction`.
- Every query against `loyalty_campaigns` is scoped by `brand_id` and `deleted_at IS NULL`. A soft-deleted row does not exist as far as the API is concerned.
- Full reset (drops the volume, re-runs the init SQL): `(cd src/problem5 && npm run db:down && npm run db:up && npm run db:migrate)`.

## Testing

```bash
# from the repository root
(cd src/problem4 && npm ci && npm test)
(cd src/problem5 && npm ci && npm run db:up && npm test)
```

Problem 5's tests need the container running; `npm test` migrates `challenge_test` itself before invoking Jest. That is why no `db:migrate` step appears here while the first-run command in `README.md` has one: `db:migrate` targets the development database, which the tests never touch.

The rules that keep the suites trustworthy:

- **Known state.** Every test starts from a known database state: `TRUNCATE loyalty_campaigns CASCADE` in `beforeEach` and `sequelize.close()` in `afterAll`. No test may depend on a row another test left behind, and no test may pass only when run in a particular order.
- **Deterministic.** `TZ=UTC` and `--runInBand` are set by the test script. No unseeded randomness and no `Date.now()` or bare `new Date()` in fixtures or assertions; time values are ISO-8601 UTC literals.
- **Concurrency.** Tests that race requests use a real `Promise.all` and assert the set of outcomes (for example `{200, 409}`), never which request won.
- **Risk, not lines.** Each test file opens with a one-line comment naming the risk it covers. Getters, configuration and the health route are not worth a test; tenant isolation, soft delete, optimistic locking and input validation are.
- One behaviour per test, arrange-act-assert, and no assertions beyond the behaviour under test.

## Error responses

Every error leaves the service in one shape, from the single handler in `src/problem5/src/http/error-handler.ts`:

```json
{
  "error": "validation_error",
  "requestId": "0f3f0f8e-6f2c-4f0c-9b3a-1f2e5a7c9d10",
  "details": [{ "path": "startsAt", "message": "Invalid datetime" }]
}
```

`requestId` is always present — it is the value echoed in the `X-Request-Id` response header, so a caller can quote one string when reporting a problem. `details` is the opposite: it carries whatever helps fix the request and is left out entirely when there is nothing to add, so a missing resource is exactly `{ "error": "not_found", "requestId": "…" }`.

| Code               | Status | When                                                                                                                                          |
| ------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `validation_error` | 400    | Request body, query or path fails validation. A body rejected by `express.json()` keeps the parser's own status — 413 or 415 — under this same code, because those are more accurate than a flat 400. |
| `not_found`        | 404    | No such resource for this tenant                                                                                                              |
| `conflict`         | 409    | Duplicate campaign name within a brand                                                                                                        |
| `version_conflict` | 409    | Stale `version` on `PATCH` (optimistic concurrency)                                                                                           |
| `internal_error`   | 500    | Unexpected — the message is logged, never returned                                                                                            |

The vocabulary is closed: the codes are declared once in `src/problem5/src/http/errors.ts`, and the status table is keyed off that list, so a new code cannot be added without giving it a status. Throw `AppError` (or one of its helpers) from a service; anything else reaching the handler becomes a 500.

Cross-tenant and soft-deleted access return **404, not 403** — the API does not confirm that a resource exists in someone else's tenant.

## Money values

Amount columns are `DECIMAL(36,18)` and stay **strings** end to end, in JavaScript and in JSON. There is no decimal arithmetic in this codebase and no big-number dependency; validation is lexical, against a regex that bounds the digits and rejects exponent notation. The `pg` driver already returns these columns as strings — keep them that way. A monetary value must never reach the JavaScript `number` type.

## Style

- English everywhere: code, comments, commit messages and documentation. No emoji.
- Comments explain **why**, not what. If a comment restates the line below it, delete it.
- TypeScript `strict`. No `any`, no non-null assertions, no default exports.
- ESLint and Prettier decide formatting. In `src/problem5/`, `npm run lint` reports lint findings and `npm run format` checks formatting — both report and exit non-zero, neither rewrites your files. Run `npx prettier --write .` to apply the formatting.
- Conventional Commits for commit subjects, with a body that explains the reasoning when it is not obvious from the diff.

## Commands

`src/problem4/`

| Command             | What it does                       |
| ------------------- | ---------------------------------- |
| `npm test`          | Jest, `TZ=UTC --runInBand`         |
| `npm run typecheck` | `tsc --noEmit`                     |

`src/problem5/`

| Command                   | What it does                                                       |
| ------------------------- | ------------------------------------------------------------------ |
| `npm run db:up`           | Starts PostgreSQL and waits until the healthcheck passes            |
| `npm run db:down`         | Stops it and removes the volume (full reset)                        |
| `npm run db:migrate`      | Applies migrations to the development database                      |
| `npm run db:migrate:test` | Applies them to `challenge_test`                                    |
| `npm test`                | Migrates the test database, then runs Jest                          |
| `npm run dev`             | Runs the server from TypeScript sources with reload                 |
| `npm run build`           | Compiles to `dist/`                                                 |
| `npm start`               | Runs the compiled server                                            |
| `npm run typecheck`       | `tsc --noEmit`                                                      |
| `npm run lint`            | ESLint, including type-aware rules                                  |
| `npm run format`          | Prettier check                                                      |

Before opening a change, run `npm test` and `npm run typecheck` in the directory you touched, plus `npm run lint` for Problem 5.
