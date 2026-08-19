// Risk: the partial unique index does not hold - either a brand ends up with
// two live campaigns of the same name, or a deleted campaign keeps its name
// reserved forever. The constraint under test is uq_campaign_brand_name.

import type { CampaignResponse } from '../src/http/campaign-response';
import {
  BRAND_B,
  campaignPayload,
  createCampaign,
  httpDelete,
  httpPost,
  type ErrorBody,
} from './helpers';

const DUPLICATED_NAME = 'Autumn cashback';

describe('campaign name uniqueness', () => {
  it('rejects a second live campaign with the same name in the same brand', async () => {
    await createCampaign({ name: DUPLICATED_NAME });

    const response = await httpPost<ErrorBody>(
      '/campaigns',
      campaignPayload({ name: DUPLICATED_NAME }),
    );

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('conflict');
  });

  it('allows another brand to use a name that is already taken', async () => {
    await createCampaign({ name: DUPLICATED_NAME });

    const response = await httpPost<CampaignResponse>(
      '/campaigns',
      campaignPayload({ name: DUPLICATED_NAME }),
      { brand: BRAND_B },
    );

    expect(response.status).toBe(201);
  });

  it('frees the name for reuse once the campaign is soft-deleted', async () => {
    const created = await createCampaign({ name: DUPLICATED_NAME });
    await httpDelete(`/campaigns/${created.id}`);

    const response = await httpPost<CampaignResponse>(
      '/campaigns',
      campaignPayload({ name: DUPLICATED_NAME }),
    );

    expect(response.status).toBe(201);
  });
});
