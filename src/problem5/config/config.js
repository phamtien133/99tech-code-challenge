'use strict';

// sequelize-cli is a CommonJS tool and cannot import the TypeScript config
// module, so it re-reads the same environment keys with the same defaults.
// src/config/env.ts remains the single source of truth for the application.
//
// Captured BEFORE dotenv runs, so it holds a real environment variable and
// never a `.env` line. `npm test` truncates, so the test database name is the
// one setting a file in someone's working copy must not be able to move; this
// mirrors test/pin-environment.ts, which does the same for the Jest process.
const pinnedTestDatabase = process.env.TEST_DB_NAME;

// `.env` is loaded here too, and for one reason: without it `npm run db:migrate`
// and `npm run dev` would read different configuration the moment a developer
// edits `.env` - migrating one database and serving another.
require('dotenv/config');

// These defaults are written in four places. Change one, change all four:
//   src/config/env.ts   the zod schema the application boots from
//   .env.example        the documented key list
//   README.md           the Configuration table
//   this file           sequelize-cli only (db:migrate, db:migrate:test)
const env = process.env;

const port = Number.parseInt(env.DB_PORT ?? '5439', 10);

const base = {
  username: env.DB_USER ?? 'postgres',
  password: env.DB_PASSWORD ?? 'postgres',
  host: env.DB_HOST ?? 'localhost',
  port: Number.isNaN(port) ? 5439 : port,
  dialect: 'postgres',
  logging: false,
};

module.exports = {
  development: { ...base, database: env.DB_NAME ?? 'challenge_dev' },
  test: { ...base, database: pinnedTestDatabase ?? 'challenge_test' },
  production: { ...base, database: env.DB_NAME ?? 'challenge_dev' },
};
