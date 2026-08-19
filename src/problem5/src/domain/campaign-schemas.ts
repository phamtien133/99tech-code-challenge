import { z } from 'zod';

import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES } from './campaign';
import { decimalString } from './decimal';

/**
 * The wire contract. Every bound here matches the DOMAIN OF THE COLUMN it
 * feeds, not merely the shape of the value: `name` 128, `type` 32, `status` 16,
 * money 18+18 digits, `version` int4, `offset` a faithfully representable
 * integer, timestamps a year PostgreSQL can store. A validator wider than its
 * column does not fail safe - the driver raises an error with no constraint
 * name to map, so the request lands on the 500 branch and a client mistake is
 * reported as a server fault.
 *
 * Deliberately NOT validated here: `ends_at > starts_at`. A partial PATCH
 * cannot see the stored counterpart, and pre-reading it would race the update,
 * so the database owns that rule via `ck_campaign_window` for create and update
 * alike - see "Errors" in README.md.
 */
export const NAME_MAX_LENGTH = 128;

/** `version` is an int4 column; 2^31 - 1 is the largest value it can hold. */
export const MAX_VERSION = 2_147_483_647;

/**
 * Accepts an ISO-8601 timestamp with `Z` or a numeric offset, and nothing else.
 *
 * The refine is not belt-and-braces: zod's `.datetime()` accepts year `0000`,
 * which `TIMESTAMPTZ` cannot represent, so without it that value reaches the
 * driver and a client mistake is reported as a server fault. Years 0001-9999
 * are the whole legal range here, the upper end being enforced by the
 * four-digit year in the regex itself. The `Number.isNaN` half is a cheap guard
 * on the `Date` conversion, not a claim about inputs zod lets through: zod
 * rejects impossible day/month combinations itself, with its own message.
 */
const isoTimestamp = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .refine((date) => !Number.isNaN(date.getTime()) && date.getUTCFullYear() >= 1, {
    message: 'timestamp must be a real date in year 0001 or later (UTC)',
  });

/** Wrapped in an object so a rejected id reports `path: "id"`, not an empty path. */
export const campaignParamsSchema = z.object({ id: z.string().uuid() });

export const createCampaignSchema = z
  .object({
    name: z.string().min(1).max(NAME_MAX_LENGTH),
    type: z.enum(CAMPAIGN_TYPES),
    status: z.enum(CAMPAIGN_STATUSES),
    startsAt: isoTimestamp,
    endsAt: isoTimestamp,
    minimumAmount: decimalString,
    maximumReward: decimalString,
  })
  // `.strict()`: a body is entirely client-authored, so an unknown key is
  // always a client bug and is better reported than dropped.
  .strict();

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

const UPDATABLE_FIELDS = [
  'name',
  'type',
  'status',
  'startsAt',
  'endsAt',
  'minimumAmount',
  'maximumReward',
] as const;

export const updateCampaignSchema = z
  .object({
    // Optimistic-lock token, in the body rather than an `If-Match` header - one
    // validated shape for the whole request. Documented in README.md.
    version: z.number().int().positive().max(MAX_VERSION),
    name: z.string().min(1).max(NAME_MAX_LENGTH).optional(),
    type: z.enum(CAMPAIGN_TYPES).optional(),
    status: z.enum(CAMPAIGN_STATUSES).optional(),
    startsAt: isoTimestamp.optional(),
    endsAt: isoTimestamp.optional(),
    minimumAmount: decimalString.optional(),
    maximumReward: decimalString.optional(),
  })
  .strict()
  .refine((body) => UPDATABLE_FIELDS.some((field) => body[field] !== undefined), {
    message: 'at least one field to update is required',
  });

export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Offset is not capped by policy - paging that deep is pointless but not
 * wrong - it is capped where JS stops representing integers faithfully. Past
 * `MAX_SAFE_INTEGER` a value is no longer the integer the client wrote, and it
 * overflows the bigint PostgreSQL expects in OFFSET.
 */
export const MAX_OFFSET = Number.MAX_SAFE_INTEGER;

/**
 * "Basic filters" as specified - four fields and offset paging, not a query
 * DSL. Unknown query keys are ignored rather than rejected, unlike request
 * bodies; the reasoning is in README.md under the filter table.
 */
export const listCampaignsQuerySchema = z.object({
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  type: z.enum(CAMPAIGN_TYPES).optional(),
  name: z.string().min(1).max(NAME_MAX_LENGTH).optional(),
  activeAt: isoTimestamp.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).max(MAX_OFFSET).default(0),
});

export type ListCampaignsQuery = z.infer<typeof listCampaignsQuerySchema>;
