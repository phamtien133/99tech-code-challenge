// Risk: create returns something other than the agreed resource, or accepts a
// time window the database would have to reject.

import type { CampaignResponse } from '../src/http/campaign-response';
import {
  ANY_STRING,
  WINDOW_END,
  WINDOW_START,
  campaignPayload,
  httpPost,
  type ErrorBody,
} from './helpers';

describe('POST /campaigns', () => {
  it('creates a campaign and returns 201 with the resource', async () => {
    const payload = campaignPayload({ name: 'Spring cashback' });

    const response = await httpPost<CampaignResponse>('/campaigns', payload);

    expect(response.status).toBe(201);
    // Exact match, not toMatchObject: the internal columns `brand_id` and
    // `deleted_at` must not appear in the public contract.
    expect(response.body).toEqual({
      id: ANY_STRING,
      name: payload.name,
      type: payload.type,
      status: payload.status,
      startsAt: payload.startsAt,
      endsAt: payload.endsAt,
      minimumAmount: payload.minimumAmount,
      maximumReward: payload.maximumReward,
      version: 1,
      createdAt: ANY_STRING,
      updatedAt: ANY_STRING,
    });
  });

  it('rejects a window whose end is not after its start with 400 validation_error', async () => {
    const payload = campaignPayload({ startsAt: WINDOW_END, endsAt: WINDOW_START });

    const response = await httpPost<ErrorBody>('/campaigns', payload);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_error');
  });

  it('rejects a zero-length window with 400 validation_error', async () => {
    const payload = campaignPayload({ startsAt: WINDOW_START, endsAt: WINDOW_START });

    const response = await httpPost<ErrorBody>('/campaigns', payload);

    expect(response.status).toBe(400);
  });
});
