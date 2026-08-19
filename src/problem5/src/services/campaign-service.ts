import { Op, literal } from 'sequelize';
import type { InferAttributes, WhereOptions } from 'sequelize';

import { nameContains } from '../db/like';
import { activeScope } from '../db/scope';
import type {
  CreateCampaignInput,
  ListCampaignsQuery,
  UpdateCampaignInput,
} from '../domain/campaign-schemas';
import { notFound, versionConflict } from '../http/errors';
import type { BrandId } from '../http/tenant';
import { Campaign } from '../models/campaign';

// Business logic lives here, never in a route handler: routes parse the
// request and hand over validated values, this module owns every query.

/**
 * The projection every finder selects. Explicit rather than `SELECT *` so a
 * column added later - especially an internal one - cannot leak into a response.
 */
const SELECTED_ATTRIBUTES = [
  'id',
  'name',
  'type',
  'status',
  'startsAt',
  'endsAt',
  'minimumAmount',
  'maximumReward',
  'version',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof InferAttributes<Campaign>)[];

const selectedAttributes = (): (keyof InferAttributes<Campaign>)[] => [...SELECTED_ATTRIBUTES];

export interface CampaignPage {
  rows: Campaign[];
  total: number;
}

export async function createCampaign(
  brandId: BrandId,
  input: CreateCampaignInput,
): Promise<Campaign> {
  // `id` is not set here on purpose: the model's `DataTypes.UUIDV4` default is
  // the single generator for it.
  return Campaign.create({
    brandId: brandId,
    name: input.name,
    type: input.type,
    status: input.status,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    minimumAmount: input.minimumAmount,
    maximumReward: input.maximumReward,
  });
}

export async function listCampaigns(
  brandId: BrandId,
  query: ListCampaignsQuery,
): Promise<CampaignPage> {
  // SQL fragment and its replacement come from one call, so they cannot drift.
  const nameFilter = query.name === undefined ? undefined : nameContains(query.name);

  const where: WhereOptions<InferAttributes<Campaign>> = {
    ...activeScope(brandId),
    ...(query.status !== undefined && { status: query.status }),
    ...(query.type !== undefined && { type: query.type }),
    // Half-open [startsAt, endsAt) - see "activeAt" in README.md.
    ...(query.activeAt !== undefined && {
      startsAt: { [Op.lte]: query.activeAt },
      endsAt: { [Op.gt]: query.activeAt },
    }),
    ...(nameFilter !== undefined && { [Op.and]: [nameFilter.where] }),
  };

  const { rows, count } = await Campaign.findAndCountAll({
    where,
    attributes: selectedAttributes(),
    // `id` breaks ties so paging is stable when two rows share createdAt.
    order: [
      ['createdAt', 'DESC'],
      ['id', 'ASC'],
    ],
    limit: query.limit,
    offset: query.offset,
    ...(nameFilter !== undefined && { replacements: nameFilter.replacements }),
  });

  return { rows, total: count };
}

export async function getCampaign(brandId: BrandId, id: string): Promise<Campaign> {
  const campaign = await Campaign.findOne({
    where: { ...activeScope(brandId), id },
    attributes: selectedAttributes(),
  });

  // Another brand's campaign and a soft-deleted one are both simply "not
  // found" - see "Tenant context" in README.md.
  if (campaign === null) {
    throw notFound();
  }

  return campaign;
}

export async function updateCampaign(
  brandId: BrandId,
  id: string,
  input: UpdateCampaignInput,
): Promise<Campaign> {
  const { version, ...changes } = input;

  const [, updated] = await Campaign.update(
    {
      ...(changes.name !== undefined && { name: changes.name }),
      ...(changes.type !== undefined && { type: changes.type }),
      ...(changes.status !== undefined && { status: changes.status }),
      ...(changes.startsAt !== undefined && { startsAt: changes.startsAt }),
      ...(changes.endsAt !== undefined && { endsAt: changes.endsAt }),
      ...(changes.minimumAmount !== undefined && { minimumAmount: changes.minimumAmount }),
      ...(changes.maximumReward !== undefined && { maximumReward: changes.maximumReward }),
      // Incremented by the database inside the same statement that guards on
      // it, so two concurrent writers cannot both read version 1 and both win.
      version: literal('"version" + 1'),
    },
    {
      // The optimistic lock, as one atomic conditional UPDATE. The happy path
      // is a single statement: nothing is read first, so there is no window
      // between the check and the write.
      where: { ...activeScope(brandId), id, version },
      // `returning: true`, not the projection the finders use. Sequelize types
      // this option as attribute names, but the query generator quotes whatever
      // array it is given without translating it; only this branch reads
      // `attribute.field`. Under `underscored` the two differ, so an attribute
      // list would ask for columns that do not exist. The public shape is
      // produced by `toCampaignResponse`, which is where the contract is enforced.
      returning: true,
    },
  );

  const row = updated[0];
  if (row !== undefined) {
    return row;
  }

  // Zero rows has three possible causes - unknown id, another brand's id, or a
  // stale version - and they map to different statuses. Exactly one
  // classification query separates them, and only on the failure path.
  const existing = await Campaign.findOne({
    where: { ...activeScope(brandId), id },
    attributes: ['id'],
  });

  // `providedVersion`, not the stored one: echoing the value the client sent
  // helps it correlate the failure, while the stored version is a fact about a
  // row this request was not permitted to touch.
  throw existing === null ? notFound() : versionConflict({ providedVersion: version });
}

export async function deleteCampaign(brandId: BrandId, id: string): Promise<void> {
  // Explicit column write: the model has no `paranoid`, so `destroy()` here
  // would be a hard delete.
  //
  // Deliberately not guarded by `version` and it does not increment it: delete
  // removes the resource whatever its field values are, and a soft-deleted
  // row's version has no future reader - nothing can be updated afterwards.
  const [affected] = await Campaign.update(
    { deletedAt: new Date() },
    { where: { ...activeScope(brandId), id } },
  );

  if (affected === 0) {
    throw notFound();
  }
}
