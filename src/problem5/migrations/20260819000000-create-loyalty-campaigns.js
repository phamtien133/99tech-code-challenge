'use strict';

// Schema for the only resource of this service. Written as explicit SQL so the
// emitted DDL is exactly what is reviewed: the CHECK constraint names below are
// matched by name in the HTTP error handler, and the unique index is partial
// (soft-deleted rows must not reserve a name).

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        `CREATE TABLE loyalty_campaigns (
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
         );`,
        { transaction },
      );

      // Partial: a soft-deleted campaign frees its name for reuse.
      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX uq_campaign_brand_name
           ON loyalty_campaigns (brand_id, name) WHERE deleted_at IS NULL;`,
        { transaction },
      );

      // Covers the list endpoint: tenant scope, status filter, newest first.
      await queryInterface.sequelize.query(
        `CREATE INDEX ix_campaign_lookup
           ON loyalty_campaigns (brand_id, status, created_at DESC);`,
        { transaction },
      );
    });
  },

  async down(queryInterface) {
    // Indexes and constraints are owned by the table and drop with it.
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS loyalty_campaigns;');
  },
};
