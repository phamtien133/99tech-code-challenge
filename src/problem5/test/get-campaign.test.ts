// Risk: detail lookup returns a resource that does not exist, or leaks the
// difference between "never existed" and "not yours".

import type { CampaignResponse } from '../src/http/campaign-response';
import { UNKNOWN_ID, createCampaign, httpGet, type ErrorBody } from './helpers';

describe('GET /campaigns/:id', () => {
  it('returns 200 with the requested campaign', async () => {
    const created = await createCampaign({ name: 'Detail view' });

    const response = await httpGet<CampaignResponse>(`/campaigns/${created.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(created);
  });

  it('returns 404 not_found for an id that does not exist', async () => {
    const response = await httpGet<ErrorBody>(`/campaigns/${UNKNOWN_ID}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('not_found');
  });
});
