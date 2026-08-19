import { Sequelize } from 'sequelize';

import { config } from '../config/env';

/**
 * Schema is owned by sequelize-cli migrations. Sequelize's schema
 * auto-creation is never invoked - not in the app, not in tests - so the schema
 * the tests run against is the schema a developer gets from `npm run db:migrate`.
 */
export const sequelize = new Sequelize({
  dialect: 'postgres',
  host: config.db.host,
  port: config.db.port,
  username: config.db.user,
  password: config.db.password,
  database: config.db.name,
  logging: false,
  define: {
    underscored: true,
    freezeTableName: true,
  },
});
