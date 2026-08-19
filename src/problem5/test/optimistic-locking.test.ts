// Risk: a lost update. Two writers read version 1, both write, and the second
// silently overwrites the first.

import type { CampaignResponse } from '../src/http/campaign-response';
import { createCampaign, httpPatch, type ErrorBody } from './helpers';

describe('PATCH /campaigns/:id optimistic locking', () => {
  it('increments version by exactly one on a successful update', async () => {
    const created = await createCampaign();

    const response = await httpPatch<CampaignResponse>(`/campaigns/${created.id}`, {
      status: 'ACTIVE',
      version: created.version,
    });

    expect(response.status).toBe(200);
    expect(response.body.version).toBe(created.version + 1);
  });

  it('rejects an update carrying a stale version with 409 version_conflict', async () => {
    const created = await createCampaign();
    await httpPatch(`/campaigns/${created.id}`, { status: 'ACTIVE', version: created.version });

    const response = await httpPatch<ErrorBody>(`/campaigns/${created.id}`, {
      status: 'INACTIVE',
      version: created.version,
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('version_conflict');
  });

  it('lets exactly one of two concurrent updates on the same version win', async () => {
    const created = await createCampaign();

    // Genuinely parallel: both requests are in flight before either resolves.
    const [first, second] = await Promise.all([
      httpPatch<unknown>(`/campaigns/${created.id}`, {
        status: 'ACTIVE',
        version: created.version,
      }),
      httpPatch<unknown>(`/campaigns/${created.id}`, {
        status: 'INACTIVE',
        version: created.version,
      }),
    ]);

    // The result SET, never which request won: that depends on scheduling and
    // is not a property of the service.
    expect([first.status, second.status].sort((a, b) => a - b)).toEqual([200, 409]);
  });
});
