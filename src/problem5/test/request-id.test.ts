// Risk: a caller reports a failure and neither side can identify which request
// it was - or worse, the header says one id and the body says another, so the
// correlation looks available and is quietly wrong.

import { ANY_STRING, UNKNOWN_ID, httpGet, type ErrorBody, type ListBody } from './helpers';

const HEADER = 'x-request-id';
const CLIENT_SUPPLIED_ID = 'client-supplied-0123456789';

describe('X-Request-Id correlation', () => {
  it('echoes a client-supplied id verbatim in both the header and the error body', async () => {
    const response = await httpGet<ErrorBody>(`/campaigns/${UNKNOWN_ID}`, {
      headers: { 'X-Request-Id': CLIENT_SUPPLIED_ID },
    });

    expect(response.headers[HEADER]).toBe(CLIENT_SUPPLIED_ID);
    expect(response.body.requestId).toBe(CLIENT_SUPPLIED_ID);
  });

  it('generates one id and reports the same value in the header and the error body', async () => {
    const response = await httpGet<ErrorBody>(`/campaigns/${UNKNOWN_ID}`);

    const generated = response.headers[HEADER];
    expect(generated).toEqual(ANY_STRING);
    expect(response.body.requestId).toBe(generated);
  });

  it('sets the header on a successful response too, not only on errors', async () => {
    const response = await httpGet<ListBody>('/campaigns');

    expect(response.headers[HEADER]).toEqual(ANY_STRING);
  });
});
