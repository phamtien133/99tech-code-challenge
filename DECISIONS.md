# Decisions

Assumptions where the brief is silent, the trade-offs behind the design, and what I left out on purpose.

---

## Assumptions

**P4 — negative input.** The brief says `n` is "any integer" but only shows positive sums. I extended the contract symmetrically: `sum_to_n(-5) === -15`. Four readings were possible (throw, return 0, symmetric, Gauss-extension); `src/problem4/README.md` covers why I picked this one. All three implementations share a single input guard and agree on every input they define.

**P4 — the safe-integer guarantee applies to magnitude.** For negative inputs, a literal signed reading of "result lesser than MAX_SAFE_INTEGER" is vacuous, since every negative number satisfies it. I read it as `Math.abs(result) < Number.MAX_SAFE_INTEGER`. That also means no BigInt: handling an overflow the brief excludes would be solving a different problem.

**P5 — resource choice.** The brief doesn't name a resource, so I picked one where create, update and delete are all natural operations rather than a record that should only ever be appended to. `loyalty_campaigns` has a validity window, monetary bounds and a mutable lifecycle, which gives the CRUD surface something real to constrain: cross-field validation, optimistic locking, soft delete.

**P5 — tenant context.** `X-Brand-Id` stands in for tenant context that production would take from the authenticated principal. This challenge has no authentication, so the service treats the header as trusted. What it demonstrates is data-isolation discipline: every query is scoped by `brand_id`, and cross-tenant access returns 404 rather than 403, so another tenant's resource is never confirmed to exist.

**P6 — `action_id` is unique per user**, hence `UNIQUE(user_id, action_id)`. If the upstream system guarantees global uniqueness, `UNIQUE(action_id)` is strictly stronger and should replace it — moving the `ON CONFLICT` target with it — because one action could then never be claimed by two users.

**P6 — points per action are unspecified.** Isolated behind a `ScorePolicy` interface: `points` is a safe integer, greater than zero, and fits INT32. The simplest valid implementation awards a fixed amount per action type.

**P6 — traffic volume is unspecified.** The baseline targets a single API deployment and prioritises correctness. I put no invented capacity numbers anywhere; those belong to load testing, not to a spec written without data. Horizontal fan-out is under Improvements.

**P6 — read access.** The requirement only asks for protection against unauthorised score *writes*. I assume reads are authenticated. If the leaderboard is public, the SSE auth section collapses to nothing and only `POST /scores/actions` needs authentication.

---

## Decisions and trade-offs

### Library versions

Express 4, Sequelize 6, zod 3, TypeScript 5 — the majors this ecosystem is settled on. `engines: >= 20`, developed and tested on Node 24, `package-lock.json` committed, README uses `npm ci`.

### TypeScript strictness

`strict: true`, and on top of it every additional check that does not have to be bought with a cast: `noUncheckedIndexedAccess`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `noPropertyAccessFromIndexSignature`, `noImplicitOverride`, with `allowUnreachableCode` and `allowUnusedLabels` off.

One flag is off on purpose: `exactOptionalPropertyTypes`. Sequelize 6's attribute and creation-attribute types don't distinguish "absent" from "present and `undefined`", and the only way past it is a cast at every model boundary. Trading a strictness flag for real `as` casts loses more type safety than it gains. With an ORM whose types were written for that flag, I'd turn it on.

### Naming conventions

camelCase in TypeScript and JSON, snake_case in PostgreSQL, mapped by `underscored: true` on the model.

### Monetary values

`DECIMAL(36,18)` in PostgreSQL — generous on both sides, so the column type is never what rounds a value. Values travel as strings in JS and JSON, validated lexically against the storage contract: at most 18 integer and 18 fractional digits, no exponent. Shape validation is what matters here — an arbitrary-precision library considers `1e400` perfectly finite, and what `1e400` violates is the storage contract, not arithmetic.

There is no decimal arithmetic in this resource, so there is no BigNumber dependency. If arithmetic were introduced I'd reach for a decimal library rather than JS `number`.

### Concurrency

A `version` column with an atomic conditional UPDATE (`WHERE id AND brand_id AND deleted_at IS NULL AND version`). A stale version can never overwrite a newer write. On a miss, one classification SELECT separates 404 (absent, cross-tenant or soft-deleted) from 409 (stale version), so the happy path stays a single query.

Accepted trade-off: that classification query can race with a concurrent delete and report 404 where 409 was truer. The atomic UPDATE already protects the property that matters, and I wasn't willing to add locking for error-code precision alone. I'd revisit this if conflicts turned out to be common in practice — that's a question for production metrics, not a number I can set from here.

### Deletion

`DELETE` sets `deleted_at`. `deleted_at IS NULL` is part of the resource's identity for every operation, so a soft-deleted row is 404 even when addressed by id. A partial unique index (`WHERE deleted_at IS NULL`) lets a name be reused after deletion while staying unique among live rows.

### Pagination

`limit + offset`. It degrades linearly with depth and can skip or duplicate rows under concurrent inserts. Keyset pagination over `(created_at, id)` if that ever matters. Not at this scope.

### Database constraints mapped to HTTP

Every constraint is named, and the error handler maps them: CHECK violations to 400, unique violations to 409. This matters for partial PATCH. Request-level validation can't see the current `ends_at` when only `starts_at` changes, so the database is the source of truth for cross-field rules, and a named constraint turns that into a clean client error instead of a 500.

### Async error handling

Express 4 doesn't forward a rejected promise from an `async` handler to `next(err)`. The request hangs and the error handler never runs. Every route here is async, so without a fix none of the error mapping above would actually work.

I used an `asyncHandler` wrapper rather than `express-async-errors`: no extra dependency, and the router shows how errors escape instead of relying on a side-effect import. The wrapper can be forgotten on a route added later, which the global patch couldn't be, so `no-floating-promises` and `no-misused-promises` are enabled to catch that. Both are type-aware and need `parserOptions.project`; without it they silently don't run.

Express 5 handles this natively. Staying on 4 was the version choice above, and this is its cost.

### Configuration

`src/problem5/src/config/env.ts` validates the environment with zod once at boot, and every key defaults to match `docker-compose.yml`, so a fresh clone runs with no `.env` at all. `sequelize-cli` runs as its own CommonJS process and cannot import that module, so `src/problem5/config/config.js` re-reads the same keys with the same defaults; the duplication is confined to that one file.

The test suite pins `NODE_ENV` and `TZ` before dotenv loads, and sets the test database name only if it isn't already present. Since dotenv never overwrites a variable that is already set, a stray `TEST_DB_NAME` in someone's `.env` can't aim the truncating suite at their development data, while a real environment variable still can redirect CI.

### Problem 4 specifics

The closed-form implementation keeps the naive `s * (s + 1) / 2`. Within the guaranteed domain the intermediate product is an even integer below 2^54, which float64 represents exactly; the full proof is in `src/problem4/README.md`. I considered a parity-split rewrite and rejected it, since it solves a problem that doesn't exist in this domain.

The sign is `n < 0 ? -1 : 1` rather than `Math.sign`, so `-0` normalises to `+0` across all three implementations.

The recursive variant has no depth guard and no stack-overflow test. V8's stack limit is engine-dependent and not part of the language spec, so it's documented as an inherent limitation instead of being guarded by a number nobody can guarantee.

### Problem 6: separation of concerns

Authentication answers who is calling. `ActionVerifier` answers whether the action happened and belongs to this user. `ScorePolicy` answers what it's worth. `UNIQUE(user_id, action_id)` answers whether it was already counted. The atomic UPSERT answers whether concurrent different actions can lose an update.

The client never sends a score. Signing or encrypting a client-supplied score would prove who sent it, not that it's correct. Anti-cheat is impossible if action completion is known only to the client, which is why the verifier is a defined interface in the spec rather than something left implicit.

### Problem 6: idempotency

Two mechanisms doing two jobs. A fast-path SELECT before verification gives retry availability, so a retry after a crash returns 200 even if the verifier is temporarily down. The unique constraint with `ON CONFLICT DO NOTHING ... RETURNING` gives concurrency correctness, so two fresh requests that both miss the fast path still can't double-count.

Replay responses use the same shape as first submissions with a `replayed` flag, and report the current total. Original-total semantics would mean persisting a running total per event for no benefit.

### Problem 6: leaderboard ordering

Ties resolve by `total_score DESC, user_id ASC`. Fully deterministic, no clock involved, and the read model rebuilds bit-exact from the event log. Events persist `points_awarded` and `rule_version`, so future rule changes never rewrite history.

### Problem 6: live updates

The SSE stream carries a payload-free `leaderboard.changed` signal and clients fetch the leaderboard from the database-backed endpoint.

I rejected pushing snapshots because query-then-send isn't atomic: two concurrent updaters can emit a stale snapshot after a fresh one, and the client watches the leaderboard move backwards. Invalidation is immune to that, since any order of signals converges on current state. It also means signals can be coalesced on both sides without losing anything, so the interval is an operational knob rather than a spec constant.

Delivery is best-effort after commit. The database is authoritative and reconnecting clients fetch a fresh snapshot; a transactional outbox is only needed if delivery has to become lossless. Bootstrap order matters: subscribe first, then fetch, so no update falls between the two.

### Testing

Unit tests cover Problem 4's pure logic. The LIKE-escape and decimal validators are exercised through the API — wildcard inputs and precision round-trips — rather than in isolation: they're only meaningful in the query and the schema they feed, so I tested the behaviour rather than the helper. The primary layer is API-level integration against a real PostgreSQL, because constraints, locking and precision are the behaviours where this service can silently go wrong, and mocks can't prove any of them. No e2e framework; supertest covers everything except the listen bootstrap, and a curl smoke test from a clean clone covers that.

I verified the concurrency test catches real bugs: with the version condition temporarily removed from the UPDATE, it fails. A test that stays green after you delete the invariant proves nothing.

---

## Decisions I reversed

**PATCH error codes.** I had PATCH returning 409 for any zero-row update. Reviewing it, a 409 on another brand's id confirms that id exists, which contradicts the 404-not-403 rule everywhere else in the design. Split into the atomic update plus one classification query.

**Leaderboard tie-breaking.** I added a `score_achieved_at` column for first-to-reach ordering, then removed it. `NOW()` in PostgreSQL is transaction start time, so concurrent commits can move that timestamp backwards — and more to the point, the brief never asked for that rule. Removing it also let the read model drop timestamps entirely, which is what makes the rebuild bit-exact.

---

## Deliberately not done

A real campaign system would need status transition rules. I left them out because the brief defines none, and inventing them would mean defending rules nobody asked for. Several of the omissions below are the same kind of decision; the rest are scope.

No authentication, no Redis, no message queues, no CI/CD, no Docker hardening. Scaling paths are described in the Problem 6 Improvements section instead.

No hybrid delete semantics, no keyset pagination, no `/scores/me` endpoint, no e2e framework, no coverage target.

`src/problem1` through `src/problem3` are left exactly as the template ships them. The brief says to start from the skeleton and doesn't ask for anything to be removed, so deleting the frontend exercise would only produce an unrelated diff.

---

## Tooling

I used AI tooling throughout — as a critique partner while designing, then for implementation and review against that design. I verified the result independently, including confirming that the concurrency test fails when the version condition is removed.

Every decision recorded above is mine, and I can walk through any part of the implementation.

---

## Time spent

Roughly 6 hours: 2 on design and specification, 3 on implementation, 1 on review and submission QA.