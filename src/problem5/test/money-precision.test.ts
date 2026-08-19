// Risk: a monetary value loses precision by passing through the JS number type,
// or a value the DECIMAL(36,18) column cannot store slips past validation and
// becomes a 500.

import type { CampaignResponse } from '../src/http/campaign-response';
import { createCampaign, httpGet, httpPost, campaignPayload, type ErrorBody } from './helpers';

const SMALLEST_UNIT = '0.000000000000000001';

describe('monetary values', () => {
  it('round-trips the smallest representable amount without losing precision', async () => {
    const created = await createCampaign({ minimumAmount: SMALLEST_UNIT });

    const response = await httpGet<CampaignResponse>(`/campaigns/${created.id}`);

    expect(response.body.minimumAmount).toBe(SMALLEST_UNIT);
  });

  it('serialises an amount as a JSON string, never as a number', async () => {
    const response = await httpPost<CampaignResponse>(
      '/campaigns',
      campaignPayload({ minimumAmount: SMALLEST_UNIT }),
    );

    // Asserted on the raw text: `typeof body.minimumAmount` would already have
    // been through JSON.parse, which cannot tell 1e-18 from "1e-18".
    expect(response.text).toContain(`"minimumAmount":"${SMALLEST_UNIT}"`);
  });

  it.each([
    ['a non-numeric string', 'abc'],
    ['a negative amount', '-1'],
    ['exponential notation', '1e400'],
    ['19 integer digits', '1234567890123456789'],
    ['19 fractional digits', '1.1234567890123456789'],
  ])('rejects %s with 400 validation_error', async (_label, amount) => {
    const response = await httpPost<ErrorBody>(
      '/campaigns',
      campaignPayload({ minimumAmount: amount }),
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_error');
  });
});
