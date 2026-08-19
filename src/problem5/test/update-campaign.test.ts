// Risk: a PATCH that misses maps to the wrong status - a cross-tenant or
// soft-deleted row reported as a version conflict, or a cross-field rule only
// the database can see arriving as a 500.

import {
  BRAND_B,
  UNKNOWN_ID,
  createCampaign,
  httpDelete,
  httpPatch,
  type ErrorBody,
} from './helpers';

describe('PATCH /campaigns/:id resource identity', () => {
  it('returns 404 for an id that does not exist', async () => {
    const response = await httpPatch<ErrorBody>(`/campaigns/${UNKNOWN_ID}`, {
      status: 'ACTIVE',
      version: 1,
    });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('not_found');
  });

  it('returns 404 for a campaign belonging to another brand', async () => {
    const created = await createCampaign();

    const response = await httpPatch<ErrorBody>(
      `/campaigns/${created.id}`,
      { status: 'ACTIVE', version: created.version },
      { brand: BRAND_B },
    );

    expect(response.status).toBe(404);
  });

  it('returns 404 for a campaign that has been soft-deleted', async () => {
    const created = await createCampaign();
    await httpDelete(`/campaigns/${created.id}`);

    const response = await httpPatch<ErrorBody>(`/campaigns/${created.id}`, {
      status: 'ACTIVE',
      version: created.version,
    });

    expect(response.status).toBe(404);
  });
});

describe('PATCH /campaigns/:id cross-field rules', () => {
  it('maps a partial update that inverts the stored window to 400 validation_error', async () => {
    // Only `startsAt` is sent: the request is valid in isolation, and nothing
    // but the stored `ends_at` makes it wrong. ck_campaign_window catches it.
    const created = await createCampaign({
      startsAt: '2026-01-01T00:00:00.000Z',
      endsAt: '2026-06-01T00:00:00.000Z',
    });

    const response = await httpPatch<ErrorBody>(`/campaigns/${created.id}`, {
      startsAt: '2026-09-01T00:00:00.000Z',
      version: created.version,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_error');
  });
});
