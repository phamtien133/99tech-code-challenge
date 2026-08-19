# Problem 5 — Loyalty Campaigns CRUD service

An ExpressJS + TypeScript backend exposing five CRUD interfaces over a single resource, `loyalty_campaigns`, persisted in PostgreSQL through Sequelize migrations.

| Interface                         | Method   | Path             |
| --------------------------------- | -------- | ---------------- |
| Create a resource                 | `POST`   | `/campaigns`     |
| List resources with basic filters | `GET`    | `/campaigns`     |
| Get details of a resource         | `GET`    | `/campaigns/:id` |
| Update resource details           | `PATCH`  | `/campaigns/:id` |
| Delete a resource                 | `DELETE` | `/campaigns/:id` |

Full request/response detail is in [API Reference](#api-reference).

## Prerequisites

- Node.js >= 20 (tested on 24 LTS)
- Docker with compose v2

## Configuration

Configuration is read from the process environment and validated once, at boot, by a zod schema (`src/config/env.ts`). No other module in the application reads `process.env`; the one sanctioned exception is `config/config.js`, which sequelize-cli loads as CommonJS and which therefore re-reads the same keys with the same defaults. A value that is present but malformed — a non-numeric port, an unknown `NODE_ENV` — aborts startup with a readable message and a non-zero exit code rather than failing later inside a query.

Every key has a default that matches `docker-compose.yml`, so a fresh clone runs with **no configuration file at all**. `.env.example` documents the full set.

| Variable       | Default          | Purpose                                                                                                                     |
| -------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`     | `development`    | One of `development`, `test`, `production`. Selects the database name.                                                      |
| `PORT`         | `3000`           | HTTP port the server listens on.                                                                                            |
| `DB_HOST`      | `localhost`      | PostgreSQL host.                                                                                                            |
| `DB_PORT`      | `5439`           | PostgreSQL port — the host port published by `docker-compose.yml`, chosen to avoid colliding with a local Postgres on 5432. |
| `DB_USER`      | `postgres`       | PostgreSQL user.                                                                                                            |
| `DB_PASSWORD`  | `postgres`       | PostgreSQL password.                                                                                                        |
| `DB_NAME`      | `challenge_dev`  | Database used when `NODE_ENV` is not `test`.                                                                                |
| `TEST_DB_NAME` | `challenge_test` | Database used when `NODE_ENV=test`. Created by `docker/init/01-create-test-db.sql`.                                         |

Values come from three places, and they win in this order: a real environment variable beats a `.env` file, which beats the built-in default. `dotenv` is loaded as the very first import of `src/config/env.ts`, and again from `config/config.js` so sequelize-cli reads the same file the application does — without that second call `npm run db:migrate` could migrate one database while `npm run dev` serves another. `dotenv` never overwrites a variable that is already set and treats a missing file as a no-op, so `export DB_PORT=5440` and `DB_PORT=5440 npm run dev` both still take precedence over `.env`, and a clone with no `.env` behaves exactly as it did before.

## Running

```bash
npm ci                # install exactly what package-lock.json pins
cp .env.example .env  # optional - see below
npm run db:up         # start postgres:16-alpine on port 5439, wait until healthy
npm run db:migrate    # create the schema (sequelize-cli; sync() is never used)
npm run dev           # http://localhost:3000
```

The `cp` step is optional and skipping it changes nothing: every key in `.env.example` is set to the default the service already uses, and those defaults match `docker-compose.yml`. Copy the file when you want to change a setting and keep it out of your shell history; export the variable instead when you want it to win over the file — see [Configuration](#configuration).

Check it is alive:

```bash
curl -s localhost:3000/health     # {"status":"ok"}
```

### All scripts

| Script                        | What it does                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run db:up`               | `docker compose up -d --wait` — starts PostgreSQL and blocks until the `pg_isready` healthcheck passes, so a migration can never race the database. |
| `npm run db:down`             | `docker compose down -v` — **full reset**, see below.                                                                                               |
| `npm run db:migrate`          | Applies migrations to the development database.                                                                                                     |
| `npm run db:migrate:test`     | Applies the same migrations to `challenge_test`.                                                                                                    |
| `npm test`                    | Migrates the test database, then runs Jest with `TZ=UTC --runInBand`. See [Tests](#tests).                                                          |
| `npm run dev`                 | Runs the server from TypeScript sources with reload.                                                                                                |
| `npm run build` / `npm start` | Compile to `dist/` and run the compiled server.                                                                                                     |
| `npm run typecheck`           | `tsc --noEmit`.                                                                                                                                     |
| `npm run lint`                | ESLint, including type-aware rules.                                                                                                                 |
| `npm run format`              | Prettier check.                                                                                                                                     |

### Tests

```bash
npm test
```

Integration tests against the real `challenge_test` database — the risks worth covering here (optimistic locking, tenant scoping, soft delete, DECIMAL fidelity) live in the SQL the service emits, and none of them is observable against a mocked repository. Each file opens with a comment naming the risk it covers.

Determinism is deliberate, not incidental: `--runInBand` so two workers never share the test database, `TZ=UTC` and ISO-8601 UTC literals for every time fixture, `TRUNCATE loyalty_campaigns CASCADE` before each test so nothing depends on what the last run left behind, and no random or clock-derived value anywhere in a fixture. The concurrency test asserts the result _set_ `{200, 409}` rather than which request won, because which one wins is a property of the scheduler.

`test/pin-environment.ts` pins `NODE_ENV` and `TZ` and defaults the test database name before the configuration module is imported, so a `.env` in your working copy cannot aim the `TRUNCATE` at your development data; an environment variable can still redirect the suite, a `.env` line cannot. The suite also binds its HTTP server to `127.0.0.1` explicitly instead of every interface — the reasoning is in `test/helpers.ts`.

### Resetting the database

```bash
npm run db:down && npm run db:up && npm run db:migrate
```

`db:down` passes `-v`, which destroys the data volume. That is deliberate and it is the only way to recreate the test database: `challenge_test` is created by `docker/init/01-create-test-db.sql`, mounted read-only into the image's `docker-entrypoint-initdb.d`, and that hook **runs only when the data volume is empty**. A `docker compose down` without `-v` would leave a volume behind, the init script would not run again, and `npm test` would fail with `database "challenge_test" does not exist`.

## Tenant context

Every request carries an `X-Brand-Id` header holding a UUID.

```text
Assumption: X-Brand-Id represents tenant context that would normally be
derived from the authenticated principal by upstream authentication
middleware. This challenge does not implement authentication; the service
layer treats this context as trusted. The value demonstrated here is
data-isolation discipline: every query is scoped by brand_id.
```

Concretely: `activeScope(brandId)` in `src/db/scope.ts` returns `{ brand_id, deleted_at: null }` and every single query in `src/services/campaign-service.ts` opens its `where` by spreading it. Sequelize `paranoid` and `defaultScope` are deliberately not used — they would apply the same rule invisibly, and one `paranoid: false` would then drop a tenant boundary with nothing at the call site for a developer to notice.

A missing or malformed `X-Brand-Id` is `400`. A campaign that belongs to another brand, or one that has been soft-deleted, is `404` — never `403`, because `403` would confirm that the row exists.

Stated plainly, because "trusted context" is easy to read as a hedge: **as shipped, any caller may assert any brand.** The header is not authenticated and nothing verifies that the caller is entitled to the brand it names. What the service does guarantee is that whatever brand it is given bounds every query it runs — the half that stays true once real authentication supplies the value, and the half that is expensive to retrofit if it was never there.

## API Reference

Base URL `http://localhost:3000`. All requests and responses are `application/json`; every request needs the `X-Brand-Id` header.

Two conventions apply throughout:

- **JSON is camelCase, columns are snake_case.** `underscored: true` maps model attributes to columns, so the model reads in camelCase throughout. The response shape is built by one explicit mapper (`src/http/campaign-response.ts`) rather than by serialising a Sequelize instance, so `brandId` and `deletedAt` are not part of the public contract.
- **Money is a string, always.** `minimumAmount` and `maximumReward` are strings on input and on output and never become a JS `number` — see [Data Model](#data-model).

### The resource

```jsonc
{
  "id": "0f0f6b2c-2e0e-4a4a-9a5a-1a2b3c4d5e6f",
  "name": "Spring cashback",
  "type": "FIXED_REWARD", // FIXED_REWARD | PERCENTAGE_REWARD | POINTS_MULTIPLIER
  "status": "DRAFT", // DRAFT | ACTIVE | INACTIVE
  "startsAt": "2026-03-01T00:00:00.000Z",
  "endsAt": "2026-04-01T00:00:00.000Z",
  "minimumAmount": "10.500000000000000000",
  "maximumReward": "99.000000000000000000",
  "version": 1,
  "createdAt": "2026-02-01T09:00:00.000Z",
  "updatedAt": "2026-02-01T09:00:00.000Z",
}
```

### 1. Create a resource — `POST /campaigns`

All seven fields are required. `id` is generated by the service, and `version` always starts at `1`.

```bash
curl -sX POST localhost:3000/campaigns \
  -H 'Content-Type: application/json' \
  -H 'X-Brand-Id: 11111111-1111-4111-8111-111111111111' \
  -d '{
        "name": "Spring cashback",
        "type": "FIXED_REWARD",
        "status": "DRAFT",
        "startsAt": "2026-03-01T00:00:00.000Z",
        "endsAt":   "2026-04-01T00:00:00.000Z",
        "minimumAmount": "10.5",
        "maximumReward": "99"
      }'
```

`201 Created` with the resource shown above. Note the response echoes `"10.500000000000000000"`, not `"10.5"` — see the canonical form in [Data Model](#data-model).

Unknown fields are rejected rather than ignored, so a typo is a `400` instead of a value the client believes it sent.

### 2. List resources with basic filters — `GET /campaigns`

| Query parameter | Type                                                         | Default | Meaning                                     |
| --------------- | ------------------------------------------------------------ | ------- | ------------------------------------------- |
| `status`        | `DRAFT` \| `ACTIVE` \| `INACTIVE`                            | —       | Exact match.                                |
| `type`          | `FIXED_REWARD` \| `PERCENTAGE_REWARD` \| `POINTS_MULTIPLIER` | —       | Exact match.                                |
| `name`          | string, 1–128                                                | —       | Partial, case-insensitive (`ILIKE '%…%'`).  |
| `activeAt`      | ISO-8601 timestamp                                           | —       | Campaigns live at that instant — see below. |
| `limit`         | integer 1–100                                                | `20`    | Page size.                                  |
| `offset`        | integer >= 0                                                 | `0`     | Rows skipped.                               |

Results are ordered `created_at DESC, id ASC` — the `id` tiebreak keeps paging stable when two rows share a timestamp.

Unknown query parameters are **ignored**, whereas an unknown field in a request body is rejected with `400`. The asymmetry is deliberate: a request body is entirely client-authored, so an unrecognised key there is always a client bug worth reporting, while query strings routinely pick up keys from proxies, link trackers and clients of a later API version.

```bash
curl -s 'localhost:3000/campaigns?status=ACTIVE&name=cashback&limit=2' \
  -H 'X-Brand-Id: 11111111-1111-4111-8111-111111111111'
```

```json
{
  "data": [{ "id": "…", "name": "Spring cashback", "…": "…" }],
  "total": 1,
  "limit": 2,
  "offset": 0
}
```

`total` is the number of matching rows in the whole result set, not on the page.

**`activeAt` is half-open, `[startsAt, endsAt)`.** A campaign matches when `starts_at <= activeAt AND ends_at > activeAt`. The end boundary is exclusive so that two back-to-back campaigns are never both reported as active at the instant one hands over to the other.

**`name` treats `%`, `_` and `\` as literal characters.** They are escaped before the pattern is built, and the query declares its escape character explicitly:

```sql
"name" ILIKE '%w\%\_\\%' ESCAPE '\'
```

The escaping order is `\` first, then `%` and `_`. Doing it the other way round double-escapes the backslash that was just added and the filter quietly stops matching. `Op.iLike` is not used because Sequelize emits no `ESCAPE` clause for it, which would leave the behaviour resting on a server default.

### 3. Get details of a resource — `GET /campaigns/:id`

```bash
curl -s localhost:3000/campaigns/0f0f6b2c-2e0e-4a4a-9a5a-1a2b3c4d5e6f \
  -H 'X-Brand-Id: 11111111-1111-4111-8111-111111111111'
```

`200 OK` with the resource. `404 not_found` if the id is unknown, belongs to another brand, or has been soft-deleted.

### 4. Update resource details — `PATCH /campaigns/:id`

Partial update. **`version` is required in the request body** and is the optimistic-lock token: it must equal the version currently stored. At least one other field must be present. (`version` in the body rather than an `If-Match` header — one validated shape for the whole request; the choice is part of the contract, hence its presence here.)

```bash
curl -sX PATCH localhost:3000/campaigns/0f0f6b2c-2e0e-4a4a-9a5a-1a2b3c4d5e6f \
  -H 'Content-Type: application/json' \
  -H 'X-Brand-Id: 11111111-1111-4111-8111-111111111111' \
  -d '{ "status": "ACTIVE", "version": 1 }'
```

`200 OK` with the updated resource, whose `version` is now `2`.

How it is executed — one atomic conditional `UPDATE`, nothing read first:

```sql
UPDATE "loyalty_campaigns"
   SET "status" = $1, "version" = "version" + 1, "updated_at" = $2
 WHERE "brand_id" = $3 AND "deleted_at" IS NULL AND "id" = $4 AND "version" = $5
 RETURNING "id","name","type","status","starts_at","ends_at",
           "minimum_amount","maximum_reward","version","created_at","updated_at";
```

A row comes back, so the happy path is a single statement and there is no window between checking the version and writing it. Zero rows is ambiguous — unknown id, another brand's id, or a stale version — so exactly one classification query runs, and only on that path:

```sql
SELECT "id" FROM "loyalty_campaigns"
 WHERE "brand_id" = $1 AND "deleted_at" IS NULL AND "id" = $2;
--   no row  -> 404 not_found
--   row     -> 409 version_conflict
```

Two concurrent PATCHes quoting the same version therefore produce exactly one `200` and one `409`; which of them wins is a race and is not specified.

Because PATCH is partial, zod cannot enforce `endsAt > startsAt`: a request carrying only `startsAt` says nothing about the stored `endsAt`, and pre-reading it would race the update. The database owns that rule via `ck_campaign_window`, and the error handler maps the constraint _by name_ back to `400 validation_error` — without that mapping it would surface as a `500`.

### 5. Delete a resource — `DELETE /campaigns/:id`

```bash
curl -sX DELETE localhost:3000/campaigns/0f0f6b2c-2e0e-4a4a-9a5a-1a2b3c4d5e6f \
  -H 'X-Brand-Id: 11111111-1111-4111-8111-111111111111'
```

`204 No Content`. Delete is **soft and uniform**: `deleted_at` is stamped, the row stays in the table, and the campaign disappears from every user-facing operation — `GET`, list and `PATCH` all return `404` afterwards. Because the unique index is partial, the deleted campaign's name becomes available for reuse immediately. Deleting an id that is not in scope is `404`.

Delete takes no `version` and does not increment it. Unlike an update it does not depend on the row's current field values — it removes the resource whatever they are — and once `deleted_at` is set nothing can read or update that row again, so the counter has no future reader.

### Errors

Every error, from every endpoint, has the same shape:

```json
{
  "error": "validation_error",
  "requestId": "0f3f0f8e-6f2c-4f0c-9b3a-1f2e5a7c9d10",
  "details": [{ "path": "minimumAmount", "message": "invalid decimal" }]
}
```

`requestId` is always present; `details` is present when it helps and is omitted otherwise. It never carries a stack trace, an internal message, or raw bytes of the request: a rejected body reports the body parser's own stable marker (`entity.parse.failed`, `entity.too.large`, `encoding.unsupported`), not the runtime's parse message, which would quote a slice of the payload back at the caller. Named values the client itself supplied are echoed where they aid correlation — `version_conflict` returns `{ "providedVersion": 3 }` — and never the stored counterpart, which is a fact about a row the request was not permitted to touch.

**`X-Request-Id` is set on every response**, success or failure, and every error body repeats it as `requestId`. When the caller sends the header it is echoed unchanged; when they do not, the service generates a UUID. One string therefore identifies a request from both ends, which is what a client needs in order to report a problem usefully. The same envelope is specified for the Problem 6 module, so the two share one contract.

A supplied id is either accepted verbatim or replaced outright — never trimmed or rewritten, because an id the caller does not recognise is worse than an honest new one. It is accepted when it is 1 to 128 visible ASCII characters: a control character would make the response header write throw, and the length bound is what stops a caller deciding how large this service's error bodies are.

| Status | `error`            | Raised by                                                                                                                                                    |
| ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `400`  | `validation_error` | zod rejecting a body, query string or path parameter; a missing or non-UUID `X-Brand-Id`; a malformed JSON body; a named CHECK constraint (see table below). |
| `404`  | `not_found`        | Unknown id, another brand's campaign, a soft-deleted campaign, or an unmatched route. Never `403`.                                                           |
| `409`  | `conflict`         | `uq_campaign_brand_name` — a live campaign in this brand already has that name.                                                                              |
| `409`  | `version_conflict` | The `version` in the PATCH body is not the stored one.                                                                                                       |
| `413`  | `validation_error` | Request body above the parser's 100 kB limit.                                                                                                                |
| `415`  | `validation_error` | Unsupported `Content-Encoding` or charset.                                                                                                                   |
| `500`  | `internal_error`   | Anything unexpected. The cause is logged, never returned.                                                                                                    |

The five codes are the service's whole vocabulary (`src/http/errors.ts`). `413` and `415` reuse `validation_error` — the code names the class of fault, the status is the precise one the body parser determined.

Database constraints are mapped **by name**, which is why the migration names all of them:

| Constraint               | Response               |
| ------------------------ | ---------------------- |
| `ck_campaign_window`     | `400 validation_error` |
| `ck_amounts`             | `400 validation_error` |
| `ck_campaign_type`       | `400 validation_error` |
| `ck_campaign_status`     | `400 validation_error` |
| `uq_campaign_brand_name` | `409 conflict`         |

The violated constraint name is echoed in `details` as a diagnostic aid. It is not part of the stable contract — clients should branch on the status and the `error` code, never on the constraint name.

## Data Model

One table. The migration (`migrations/20260819000000-create-loyalty-campaigns.js`) issues this SQL verbatim, so the DDL below is what a developer gets from `npm run db:migrate` — `sequelize.sync()` is never called, in the application or in the tests.

```sql
CREATE TABLE loyalty_campaigns (
  id             UUID PRIMARY KEY,
  brand_id       UUID           NOT NULL,
  name           VARCHAR(128)   NOT NULL,
  type           VARCHAR(32)    NOT NULL,
  status         VARCHAR(16)    NOT NULL,
  starts_at      TIMESTAMPTZ    NOT NULL,
  ends_at        TIMESTAMPTZ    NOT NULL,
  minimum_amount DECIMAL(36,18) NOT NULL,
  maximum_reward DECIMAL(36,18) NOT NULL,
  version        INTEGER        NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ    NOT NULL,
  updated_at     TIMESTAMPTZ    NOT NULL,
  deleted_at     TIMESTAMPTZ,
  CONSTRAINT ck_campaign_window CHECK (ends_at > starts_at),
  CONSTRAINT ck_amounts CHECK (minimum_amount >= 0 AND maximum_reward >= 0),
  CONSTRAINT ck_campaign_type CHECK (
    type IN ('FIXED_REWARD', 'PERCENTAGE_REWARD', 'POINTS_MULTIPLIER')
  ),
  CONSTRAINT ck_campaign_status CHECK (
    status IN ('DRAFT', 'ACTIVE', 'INACTIVE')
  )
);

-- Partial: a soft-deleted campaign stops reserving its name.
CREATE UNIQUE INDEX uq_campaign_brand_name
  ON loyalty_campaigns (brand_id, name) WHERE deleted_at IS NULL;

-- Covers the list endpoint: tenant scope, status filter, newest first.
CREATE INDEX ix_campaign_lookup
  ON loyalty_campaigns (brand_id, status, created_at DESC);
```

**The partial unique index is what makes name reuse work.** `WHERE deleted_at IS NULL` means only live campaigns compete for a name, so deleting "Spring cashback" and creating it again succeeds — while a duplicate among live rows is still rejected by the database rather than by a check-then-insert that could race.

**Enumerations are `VARCHAR` + a named CHECK, not a Postgres `ENUM` type.** The allowed values live in one `as const` array (`src/domain/campaign.ts`) that feeds the TypeScript union, the zod schema and — by hand, in the migration — the CHECK constraint. Adding a value later is an `ALTER` of a constraint rather than of a type. Column widths and the zod `.max()` bounds agree deliberately (`name` 128, `type` 32, `status` 16): a zod bound wider than the column would turn a client mistake into a driver-level `500` instead of a `400`.

### Money

`minimum_amount` and `maximum_reward` are `DECIMAL(36,18)` and are **strings end-to-end** — wire, service, model and JSON. They never touch the JS `number` type, which cannot represent 18 fractional digits. This CRUD resource performs no arithmetic on them, so no decimal library is needed either; validation is purely lexical:

```ts
/^(0|[1-9]\d{0,17})(\.\d{1,18})?$/;
```

At most 18 integer digits and 18 fractional digits, no exponent, no sign, no leading zeros. The point of a _shape_ check rather than a numeric one is that `1e400` parses as a finite number in every big-decimal library — what it violates is the storage contract, so the storage contract is what it is checked against.

**Canonical output form: always 18 fractional digits.** `numeric(36,18)` right-pads on read-back, so POSTing `"10"` stores it and returns `"10.000000000000000000"`. That is the contract, not a defect, and it is not trimmed — trimming would mean formatting money in application code for no gain. Everything the validator accepts fits the column, and every padded read-back still matches the regex, so this is a formatting property and never an error path.

## Design Notes

- **Layering.** `route → zod → service → Sequelize → PostgreSQL`. Route handlers resolve tenant context, validate, and delegate; every query lives in `src/services/campaign-service.ts`.
- **Express 4 drops async rejections.** Every route is wrapped in `asyncHandler` (`src/http/async-handler.ts`); without it a rejected promise would hang the request and the whole error mapping above would apply to synchronous throws only. `no-floating-promises` and `no-misused-promises` are enabled with `parserOptions.project` so they actually run.
- **Three things this service is trying to demonstrate:** decimal correctness, optimistic concurrency, and tenant-scoped data discipline. Everything else is kept deliberately small.
- **Not built, on purpose:** status-transition rules (none are specified, so inventing them would be inventing requirements), hard delete, keyset pagination, authentication, caching.
- Assumptions and trade-offs in full are in [`/DECISIONS.md`](../../DECISIONS.md) at the repository root.

## Known limits

Deliberately **out of scope** for this exercise:

- **Structured logging.** The correlation id itself is built — see [Errors](#errors): every response carries `X-Request-Id` and every error body repeats it. What is missing is the other half of the pair, a JSON logger (pino) bound to the process with the id propagated through `AsyncLocalStorage`, so that the id a client quotes resolves to log lines rather than only to a response. That is the first thing I would add.
- Authentication and authorisation — see [Tenant context](#tenant-context) for what `X-Brand-Id` does and does not promise.
- Metrics, tracing, rate limiting, caching, CI/CD.
