// Risk: a malformed request is reported as a server fault. Each probe is
// something a client can send today; each must come back 4xx, because a 500
// tells the caller to retry and tells the operator to page someone.

import {
  UNKNOWN_ID,
  campaignPayload,
  httpGet,
  httpPatch,
  httpPost,
  type HttpResponse,
} from './helpers';

interface Probe {
  label: string;
  send: () => Promise<HttpResponse<unknown>>;
}

const probes: Probe[] = [
  {
    label: 'a version above the int4 range',
    send: () => httpPatch(`/campaigns/${UNKNOWN_ID}`, { status: 'ACTIVE', version: 2_147_483_648 }),
  },
  {
    label: 'an offset beyond the safe integer range',
    send: () => httpGet('/campaigns', { query: { offset: '99999999999999999999' } }),
  },
  {
    label: 'a limit that is not a number',
    send: () => httpGet('/campaigns', { query: { limit: 'all' } }),
  },
  {
    label: 'a year-0000 timestamp',
    send: () => httpPost('/campaigns', campaignPayload({ startsAt: '0000-01-01T00:00:00.000Z' })),
  },
  {
    label: 'an X-Brand-Id that is not a UUID',
    send: () => httpGet('/campaigns', { brand: 'not-a-uuid' }),
  },
  {
    label: 'a path id that is not a UUID',
    send: () => httpGet('/campaigns/not-a-uuid'),
  },
  {
    label: 'a body larger than the parser limit',
    send: () => httpPost('/campaigns', campaignPayload({ name: 'a'.repeat(150_000) })),
  },
  {
    label: 'an unsupported Content-Encoding',
    send: () =>
      httpPost('/campaigns', campaignPayload(), { headers: { 'Content-Encoding': 'bogus' } }),
  },
  {
    label: 'malformed JSON',
    send: () =>
      httpPost('/campaigns', '{"name":', { headers: { 'Content-Type': 'application/json' } }),
  },
  {
    label: 'an unknown body key',
    send: () => httpPost('/campaigns', { ...campaignPayload(), unexpected: true }),
  },
  {
    label: 'a name longer than the column',
    send: () => httpPost('/campaigns', campaignPayload({ name: 'x'.repeat(129) })),
  },
];

describe('client input never produces a 500', () => {
  it.each(probes)('answers $label with a 4xx', async ({ send }) => {
    const response = await send();

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });
});
