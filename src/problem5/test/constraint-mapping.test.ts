// Risk: a named database constraint fires and nobody mapped it, so a rejected
// value is reported as a 500 - the service's own fault instead of the caller's.
//
// Two of the five constraints are reachable over HTTP and are covered where the
// behaviour lives: ck_campaign_window in create-campaign / update-campaign, and
// uq_campaign_brand_name in campaign-name-uniqueness. The three below are NOT
// reachable over HTTP by design - zod rejects every input that could violate
// them - so they are raised at the model layer and pushed through the SHIPPED
// error handler. Asserting the mapping any other way would only restate the
// mapping table in a second place and prove nothing.

import type { CampaignStatus, CampaignType } from '../src/domain/campaign';
import type { Decimal } from '../src/domain/decimal';
import { Campaign } from '../src/models/campaign';
import { BRAND_A, WINDOW_END, WINDOW_START, errorResponseFor, nextCampaignName } from './helpers';

/**
 * Deliberately bypasses the branded and union types. These values cannot be
 * produced by the public API - reaching the constraint is the whole point.
 */
function outOfDomain<T>(value: string): T {
  return value as unknown as T;
}

/** Only the columns a create must supply; the rest carry database defaults. */
interface NewRow {
  brandId: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  startsAt: Date;
  endsAt: Date;
  minimumAmount: Decimal;
  maximumReward: Decimal;
}

function validRow(): NewRow {
  return {
    brandId: BRAND_A,
    name: nextCampaignName('Constraint'),
    type: 'FIXED_REWARD',
    status: 'DRAFT',
    startsAt: new Date(WINDOW_START),
    endsAt: new Date(WINDOW_END),
    minimumAmount: outOfDomain<Decimal>('10'),
    maximumReward: outOfDomain<Decimal>('99'),
  };
}

describe('named constraint mapping', () => {
  it('maps ck_amounts to 400 validation_error', async () => {
    const response = await errorResponseFor(() =>
      Campaign.create({ ...validRow(), minimumAmount: outOfDomain<Decimal>('-1') }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_error');
  });

  it('maps ck_campaign_type to 400 validation_error', async () => {
    const response = await errorResponseFor(() =>
      Campaign.create({ ...validRow(), type: outOfDomain<CampaignType>('NOT_A_TYPE') }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_error');
  });

  it('maps ck_campaign_status to 400 validation_error', async () => {
    const response = await errorResponseFor(() =>
      Campaign.create({ ...validRow(), status: outOfDomain<CampaignStatus>('ARCHIVED') }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_error');
  });
});
