// Risk: data crosses a tenant boundary, or the API tells one brand that another
// brand's campaign exists by answering 403 instead of 404.

import { BRAND_B, createCampaign, httpGet, type ErrorBody, type ListBody } from './helpers';

describe('tenant scoping', () => {
  it('lists only the campaigns of the requesting brand', async () => {
    await createCampaign({ name: 'Belongs to A' });
    await createCampaign({ name: 'Belongs to B' }, BRAND_B);

    const response = await httpGet<ListBody>('/campaigns', { brand: BRAND_B });

    expect(response.body.data.map((campaign) => campaign.name)).toEqual(['Belongs to B']);
  });

  it('counts only the campaigns of the requesting brand in total', async () => {
    await createCampaign({ name: 'One of two for A' });
    await createCampaign({ name: 'Two of two for A' });
    await createCampaign({ name: 'The only one for B' }, BRAND_B);

    const response = await httpGet<ListBody>('/campaigns', { brand: BRAND_B });

    expect(response.body.total).toBe(1);
  });

  it("returns 404, not 403, when reading another brand's campaign", async () => {
    const created = await createCampaign();

    const response = await httpGet<ErrorBody>(`/campaigns/${created.id}`, { brand: BRAND_B });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('not_found');
  });

  it('rejects a request with no X-Brand-Id header with 400 validation_error', async () => {
    const response = await httpGet<ErrorBody>('/campaigns', { brand: null });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_error');
  });
});
