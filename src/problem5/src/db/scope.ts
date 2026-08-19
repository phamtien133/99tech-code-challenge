import type { BrandId } from '../http/tenant';

/**
 * The resource-identity invariant, in one place: a campaign belongs to exactly
 * one brand, and a soft-deleted campaign does not exist for any user-facing
 * operation. Both halves are identity, not filtering, which is why every
 * `where` in the service opens by spreading this rather than relying on
 * Sequelize `paranoid` or a `defaultScope`. Reasoning: "Tenant context" in
 * README.md.
 */
export interface ActiveScope {
  readonly brandId: string;
  /** Sequelize renders `null` as `IS NULL`, matching the partial unique index. */
  readonly deletedAt: null;
}

export function activeScope(brandId: BrandId): ActiveScope {
  return { brandId: brandId, deletedAt: null };
}
