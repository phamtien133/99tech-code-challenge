// Risk: delete is not the uniform soft delete the service promises - either the
// row is really gone, or it is still visible through the API.

import { QueryTypes } from 'sequelize';

import { sequelize } from '../src/db/sequelize';
import {
  UNKNOWN_ID,
  createCampaign,
  httpDelete,
  httpGet,
  type ErrorBody,
  type ListBody,
} from './helpers';

interface StoredRow {
  deleted_at: Date | null;
  updated_at: Date;
  version: number;
}

async function readStoredRow(id: string): Promise<StoredRow | undefined> {
  // Deliberately unscoped raw SQL: the point is to look at what the API hides.
  const rows = await sequelize.query<StoredRow>(
    'SELECT deleted_at, updated_at, version FROM loyalty_campaigns WHERE id = :id',
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  return rows[0];
}

/** A fixed past instant, so "updated_at moved" is a comparison against a literal. */
const PINNED_UPDATED_AT = '2020-01-01T00:00:00.000Z';

async function pinUpdatedAt(id: string): Promise<void> {
  await sequelize.query('UPDATE loyalty_campaigns SET updated_at = :pinned WHERE id = :id', {
    replacements: { pinned: PINNED_UPDATED_AT, id },
    type: QueryTypes.UPDATE,
  });
}

describe('DELETE /campaigns/:id', () => {
  it('returns 204 with no body', async () => {
    const created = await createCampaign();

    const response = await httpDelete(`/campaigns/${created.id}`);

    expect(response.status).toBe(204);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await httpDelete<ErrorBody>(`/campaigns/${UNKNOWN_ID}`);

    expect(response.status).toBe(404);
  });

  it('makes the campaign invisible to a detail read', async () => {
    const created = await createCampaign();
    await httpDelete(`/campaigns/${created.id}`);

    const response = await httpGet<ErrorBody>(`/campaigns/${created.id}`);

    expect(response.status).toBe(404);
  });

  it('removes the campaign from the list', async () => {
    const created = await createCampaign({ name: 'About to be deleted' });
    await httpDelete(`/campaigns/${created.id}`);

    const response = await httpGet<ListBody>('/campaigns');

    expect(response.body.data).toEqual([]);
  });

  it('keeps the row in the database with deleted_at set', async () => {
    const created = await createCampaign();
    await httpDelete(`/campaigns/${created.id}`);

    const row = await readStoredRow(created.id);

    expect(row?.deleted_at).toBeInstanceOf(Date);
  });

  it('moves updated_at without touching version', async () => {
    const created = await createCampaign();
    await pinUpdatedAt(created.id);

    await httpDelete(`/campaigns/${created.id}`);

    const row = await readStoredRow(created.id);
    expect(row?.updated_at.getTime()).toBeGreaterThan(Date.parse(PINNED_UPDATED_AT));
    expect(row?.version).toBe(created.version);
  });
});
