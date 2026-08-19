import type { CampaignStatus, CampaignType } from '../domain/campaign';
import type { Campaign } from '../models/campaign';

/**
 * The public JSON contract, written out field by field.
 *
 * WHY an explicit mapper rather than returning the model: serialising a
 * Sequelize instance ships `brandId` and `deletedAt` and makes every future
 * migration a breaking API change.
 */
export interface CampaignResponse {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  startsAt: string;
  endsAt: string;
  /**
   * String on every path, in and out. Canonical output form always carries 18
   * fractional digits because `numeric(36,18)` right-pads on read-back: `"10"`
   * in comes back as `"10.000000000000000000"`. See "Money" in README.md.
   */
  minimumAmount: string;
  maximumReward: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignListResponse {
  data: CampaignResponse[];
  total: number;
  limit: number;
  offset: number;
}

export function toCampaignResponse(campaign: Campaign): CampaignResponse {
  return {
    id: campaign.id,
    name: campaign.name,
    type: campaign.type,
    status: campaign.status,
    startsAt: campaign.startsAt.toISOString(),
    endsAt: campaign.endsAt.toISOString(),
    minimumAmount: campaign.minimumAmount,
    maximumReward: campaign.maximumReward,
    version: campaign.version,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  };
}
