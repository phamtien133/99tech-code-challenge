/**
 * Runs before anything imports the configuration module, and that ordering is
 * the mechanism: `dotenv` never overwrites a variable that is already set, so
 * whatever this file writes cannot be changed by a `.env` in a working copy.
 *
 * The three assignments follow two different rules, deliberately.
 *
 * `NODE_ENV` and `TZ` are pinned outright. The suite is meaningful only in the
 * test environment and only with UTC time fixtures, so neither is negotiable -
 * not by a `.env`, and not by the surrounding shell either.
 *
 * `TEST_DB_NAME` is filled in only when it is missing, so an environment
 * variable can still point the suite at a different database, which CI needs,
 * while a `.env` line cannot, because dotenv has not run yet.
 *
 * The distinction matters because `test/setup.ts` opens every test with a
 * TRUNCATE: `TEST_DB_NAME=challenge_dev` in someone's `.env` would aim it at
 * their development data, and the suite would still report green.
 */
process.env['NODE_ENV'] = 'test';
process.env['TZ'] = 'UTC';
process.env['TEST_DB_NAME'] ??= 'challenge_test';
