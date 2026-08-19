import { sequelize } from '../src/db/sequelize';

/**
 * Every test starts from an empty table. Migrations do not clear data, so
 * without this a duplicate-name, filter or pagination assertion would depend on
 * what the previous `npm test` left behind - green once, red the next morning.
 *
 * TRUNCATE rather than DELETE: it also resets nothing else, which is the point.
 * One table today; a `resetDatabase()` helper in dependency order the moment
 * there are two.
 */
beforeEach(async () => {
  await sequelize.query('TRUNCATE loyalty_campaigns CASCADE');
});

/** Without this the pool keeps the Node process alive after the last test. */
afterAll(async () => {
  await sequelize.close();
});
