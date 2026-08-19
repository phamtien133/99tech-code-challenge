// `as const` arrays, not TypeScript enums: one literal list feeds the union
// type, the zod schema and the DB CHECK constraint, so the three cannot drift.

export const CAMPAIGN_TYPES = ['FIXED_REWARD', 'PERCENTAGE_REWARD', 'POINTS_MULTIPLIER'] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

export const CAMPAIGN_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
