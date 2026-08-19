# 99Tech Code Challenge

Backend track submission: Problems 4, 5, and 6. Problems 1-3 are left unchanged from the original template.

## Prerequisites

- **Node.js >= 20** (tested on 24 LTS). The two directories that run Node, `src/problem4` and `src/problem5`, each carry an `.nvmrc` pinning 24, as does the repository root, so `nvm use` selects the right runtime.
- **Docker with compose v2.** Problem 5 is the only part that needs it.

## Problems

Every command runs from the repository root and returns you there.

| Problem | Directory                        | What it is                                                                                                                                                          | Run                                                                              |
| ------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 4       | [`src/problem4/`](src/problem4/) | Three unique TypeScript implementations of `sum_to_n`, with a Jest suite showing they agree with each other and with the declared contract — checked exhaustively over `[-500, 500]` and at the top of the legal domain. | `(cd src/problem4 && npm ci && npm test)`                                        |
| 5       | [`src/problem5/`](src/problem5/) | Express + TypeScript CRUD service for loyalty campaigns, persisted in PostgreSQL 16 with Sequelize migrations.                                                        | `(cd src/problem5 && npm ci && npm run db:up && npm run db:migrate && npm test)` |
| 6       | [`src/problem6/`](src/problem6/) | Specification for a score module: API contract, data model, execution-flow diagrams. Documentation only.                                                              | Read [`src/problem6/README.md`](src/problem6/README.md)                          |

Problem 5 publishes PostgreSQL on host port 5439 and needs no configuration file to start; `(cd src/problem5 && npm run db:down)` stops the container and removes its volume. Each of these directories has its own README with the detail.

## Worth reading first

- [`src/problem6/README.md`](src/problem6/README.md) — the largest piece of design work in the submission: data model, idempotency, anti-abuse, live updates, and the execution-flow diagrams (Mermaid sources in [`src/problem6/diagrams/`](src/problem6/diagrams/)).
- [`src/problem5/src/services/campaign-service.ts`](src/problem5/src/services/campaign-service.ts) — where the service's substance sits: every query scoped by tenant and soft-delete state, and an update path built as an atomic conditional UPDATE with an optimistic version check.
- [`src/problem4/README.md`](src/problem4/README.md) — the contract chosen for negative `n` and the precision argument for staying inside `number` instead of reaching for BigInt.

## Assumptions and trade-offs

[`DECISIONS.md`](DECISIONS.md) at the repository root records the assumptions made where the brief was silent, the trade-offs taken, what was deliberately not built, and the tooling disclosure.

[`CONTRIBUTING.md`](CONTRIBUTING.md) covers the layout and conventions for working in this repository.
