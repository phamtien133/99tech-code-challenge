import type { Request } from 'express';
import { z } from 'zod';

import { validationError } from './errors';

/**
 * `X-Brand-Id` is the simulated trusted tenant context - see "Tenant context" in
 * README.md, including what this service does NOT do about it. Read here and
 * nowhere else, and branded so a plain string cannot reach `activeScope`.
 *
 * Validated as a UUID because `brand_id` is a UUID column: a malformed value
 * would otherwise reach the driver and surface as a 500.
 */
const brandIdSchema = z.string().uuid().brand<'BrandId'>();

export type BrandId = z.infer<typeof brandIdSchema>;

export const BRAND_HEADER = 'X-Brand-Id';

export function requireBrandId(req: Request): BrandId {
  const parsed = brandIdSchema.safeParse(req.header(BRAND_HEADER));

  if (!parsed.success) {
    throw validationError({
      header: BRAND_HEADER,
      message: `${BRAND_HEADER} is required and must be a UUID`,
    });
  }

  return parsed.data;
}
