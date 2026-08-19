import { DataTypes, Model } from 'sequelize';
import type { CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize';

import { sequelize } from '../db/sequelize';
import type { CampaignStatus, CampaignType } from '../domain/campaign';
import type { Decimal } from '../domain/decimal';

/**
 * Attribute names deliberately mirror the column names one-for-one. The public
 * JSON contract is camelCase and is produced by an explicit response mapper, so
 * "what the database holds" and "what the API promises" stay separable.
 *
 * Note what is NOT here: no `paranoid`, no `defaultScope` - see `activeScope`
 * in `src/db/scope.ts`. Consequence for callers: `Campaign.destroy()` is a HARD
 * delete; soft delete is an explicit `update({ deletedAt: <now> })`.
 */
export class Campaign extends Model<InferAttributes<Campaign>, InferCreationAttributes<Campaign>> {
  declare id: CreationOptional<string>;
  declare brandId: string;
  declare name: string;
  declare type: CampaignType;
  declare status: CampaignStatus;
  declare startsAt: Date;
  declare endsAt: Date;
  // The pg driver returns DECIMAL as a string and it stays one. Branded, so a
  // raw string cannot be written without passing `decimalString` first;
  // branding the read side is sound because NOT NULL + `ck_amounts` mean pg can
  // only return a value that still matches `DECIMAL_36_18`.
  declare minimumAmount: Decimal;
  declare maximumReward: Decimal;
  declare version: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare deletedAt: CreationOptional<Date | null>;
}

Campaign.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      // The ONLY source of campaign ids. The migration deliberately declares no
      // column default, so a create path must not generate a second one.
      defaultValue: DataTypes.UUIDV4,
    },
    brandId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(128), allowNull: false },
    // VARCHAR + CHECK in the migration rather than a Postgres ENUM type: the
    // allowed values live in one `as const` array shared with zod, and adding a
    // value later is an ALTER of a constraint, not of a type.
    type: { type: DataTypes.STRING(32), allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false },
    startsAt: { type: DataTypes.DATE, allowNull: false },
    endsAt: { type: DataTypes.DATE, allowNull: false },
    minimumAmount: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    maximumReward: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
    deletedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    tableName: 'loyalty_campaigns',
    modelName: 'Campaign',
    underscored: true,
    timestamps: true,
    // `version` is our own optimistic-lock column, handled by an explicit
    // conditional UPDATE; Sequelize's built-in versioning is not used.
    version: false,
  },
);
