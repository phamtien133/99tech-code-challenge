// Risk: the specified "basic filters" return the wrong set - a filter that
// silently matches everything, a wildcard the caller never typed, or a
// half-open window read as closed.

import { httpGet, createCampaign, type ListBody } from './helpers';

const namesIn = (body: ListBody): string[] => body.data.map((campaign) => campaign.name);

describe('GET /campaigns filters', () => {
  it('returns only campaigns with the requested status', async () => {
    await createCampaign({ name: 'Active one', status: 'ACTIVE' });
    await createCampaign({ name: 'Draft one', status: 'DRAFT' });

    const response = await httpGet<ListBody>('/campaigns', { query: { status: 'ACTIVE' } });

    expect(namesIn(response.body)).toEqual(['Active one']);
  });

  it('returns only campaigns with the requested type', async () => {
    await createCampaign({ name: 'Fixed one', type: 'FIXED_REWARD' });
    await createCampaign({ name: 'Multiplier one', type: 'POINTS_MULTIPLIER' });

    const response = await httpGet<ListBody>('/campaigns', {
      query: { type: 'POINTS_MULTIPLIER' },
    });

    expect(namesIn(response.body)).toEqual(['Multiplier one']);
  });

  it('matches name partially and case-insensitively', async () => {
    await createCampaign({ name: 'Summer Cashback' });
    await createCampaign({ name: 'Winter Rewards' });

    const response = await httpGet<ListBody>('/campaigns', { query: { name: 'cashback' } });

    expect(namesIn(response.body)).toEqual(['Summer Cashback']);
  });

  it('treats %, _ and \\ in a name filter as literal characters, not wildcards', async () => {
    await createCampaign({ name: 'A%_\\B' });
    await createCampaign({ name: 'AXYZB' });

    const response = await httpGet<ListBody>('/campaigns', { query: { name: '%_\\' } });

    expect(namesIn(response.body)).toEqual(['A%_\\B']);
  });

  it('returns the campaign whose window contains activeAt', async () => {
    await createCampaign({
      name: 'Inside the window',
      startsAt: '2030-01-01T00:00:00.000Z',
      endsAt: '2030-02-01T00:00:00.000Z',
    });
    await createCampaign({
      name: 'A year later',
      startsAt: '2031-01-01T00:00:00.000Z',
      endsAt: '2031-02-01T00:00:00.000Z',
    });

    const response = await httpGet<ListBody>('/campaigns', {
      query: { activeAt: '2030-01-15T12:00:00.000Z' },
    });

    expect(namesIn(response.body)).toEqual(['Inside the window']);
  });

  it('includes a campaign whose window starts exactly at activeAt', async () => {
    await createCampaign({
      name: 'Starts on the boundary',
      startsAt: '2030-01-01T00:00:00.000Z',
      endsAt: '2030-02-01T00:00:00.000Z',
    });

    const response = await httpGet<ListBody>('/campaigns', {
      query: { activeAt: '2030-01-01T00:00:00.000Z' },
    });

    expect(namesIn(response.body)).toEqual(['Starts on the boundary']);
  });

  it('excludes a campaign whose window ends exactly at activeAt', async () => {
    await createCampaign({
      name: 'Ends on the boundary',
      startsAt: '2030-01-01T00:00:00.000Z',
      endsAt: '2030-02-01T00:00:00.000Z',
    });

    const response = await httpGet<ListBody>('/campaigns', {
      query: { activeAt: '2030-02-01T00:00:00.000Z' },
    });

    expect(namesIn(response.body)).toEqual([]);
  });

  it('ignores an unknown query-string key rather than rejecting the request', async () => {
    await createCampaign({ name: 'Still listed' });

    const response = await httpGet<ListBody>('/campaigns', { query: { sortBy: 'whatever' } });

    expect(response.status).toBe(200);
  });
});
