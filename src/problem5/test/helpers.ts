import type { Server } from 'node:http';

import express from 'express';
import type { Express } from 'express';
import request from 'supertest';
import type { Test } from 'supertest';

import { createApp } from '../src/app';
import { asyncHandler } from '../src/http/async-handler';
import type { CampaignResponse } from '../src/http/campaign-response';
import { errorHandler } from '../src/http/error-handler';
import { BRAND_HEADER } from '../src/http/tenant';

/**
 * Shared test infrastructure: one app, one request helper, one fixture factory.
 *
 * The app comes from `createApp()`, which does not listen - `src/index.ts` owns
 * that. Here the suite listens on its own terms, and on the loopback interface
 * only.
 */
const LOOPBACK = '127.0.0.1';

/**
 * WHY the explicit host: `listen(0)` binds every interface, so the kernel picks
 * a port that is free on the wildcard address - which says nothing about
 * `127.0.0.1`, where supertest then sends the request. On a developer machine
 * carrying hundreds of loopback-bound listeners (chat clients and Electron apps
 * are the usual source) the request reaches a stranger's HTTP server and comes
 * back as an inexplicable 404. Binding the loopback explicitly makes the kernel
 * choose a port that is free where the client will actually dial.
 */
function startOnLoopback(target: Express): { server: Server; ready: Promise<void> } {
  const server = target.listen(0, LOOPBACK);
  const ready = new Promise<void>((resolve, reject) => {
    if (server.listening) {
      resolve();
      return;
    }
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return { server, ready };
}

async function stop(server: Server): Promise<void> {
  // Keep-alive sockets would otherwise hold `close()` open until the agent
  // times out, and the test file would hang after its last assertion.
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

const { server, ready } = startOnLoopback(createApp());

// One server per test file, started once and shared: `listen(0, host)` resolves
// through DNS, so the tests wait for it rather than assuming it is up.
beforeAll(() => ready);
afterAll(() => stop(server));

/** Two tenants, fixed UUID literals so a failure message is always the same. */
export const BRAND_A = '11111111-1111-4111-8111-111111111111';
export const BRAND_B = '22222222-2222-4222-8222-222222222222';

/** Time fixtures are ISO-8601 UTC literals - never `new Date()`, never `Date.now()`. */
export const WINDOW_START = '2026-01-01T00:00:00.000Z';
export const WINDOW_END = '2026-12-31T00:00:00.000Z';

/**
 * `numeric(36,18)` right-pads on read-back, so the canonical form a fixture
 * must expect always carries 18 fractional digits: POST `"10"` and the API
 * answers `"10.000000000000000000"`. Fixtures are written in canonical form so
 * an assertion compares like with like.
 */
export const CANONICAL_MINIMUM = '10.000000000000000000';
export const CANONICAL_REWARD = '99.000000000000000000';

/** A syntactically valid UUID that no fixture ever creates. */
export const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

/** `expect.any` is typed `any`; widening keeps the type-aware lint rules honest. */
export const ANY_STRING = expect.any(String) as unknown;

/** `null` means "send no X-Brand-Id header at all", which is its own test case. */
export type BrandContext = string | null;

export interface RequestOptions {
  brand?: BrandContext;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface HttpResponse<T> {
  status: number;
  body: T;
  /** Raw response text - the only way to assert that money is a JSON string. */
  text: string;
  /** Node lower-cases incoming header names, so index with `x-request-id`. */
  headers: Record<string, string | undefined>;
}

/** Every error response in this service has this shape. */
export interface ErrorBody {
  error: string;
  requestId: string;
  details?: unknown;
}

export interface ListBody {
  data: CampaignResponse[];
  total: number;
  limit: number;
  offset: number;
}

function prepare(test: Test, options: RequestOptions | undefined): Test {
  const brand = options?.brand === undefined ? BRAND_A : options.brand;

  let prepared = brand === null ? test : test.set(BRAND_HEADER, brand);

  if (options?.query !== undefined) {
    prepared = prepared.query(options.query);
  }
  for (const [name, value] of Object.entries(options?.headers ?? {})) {
    prepared = prepared.set(name, value);
  }

  return prepared;
}

async function run<T>(test: Test): Promise<HttpResponse<T>> {
  const response = await test;
  return {
    status: response.status,
    body: response.body as T,
    text: response.text,
    headers: response.headers,
  };
}

export function httpGet<T>(path: string, options?: RequestOptions): Promise<HttpResponse<T>> {
  return run<T>(prepare(request(server).get(path), options));
}

export function httpPost<T>(
  path: string,
  body: object | string,
  options?: RequestOptions,
): Promise<HttpResponse<T>> {
  return run<T>(prepare(request(server).post(path), options).send(body));
}

export function httpPatch<T>(
  path: string,
  body: object | string,
  options?: RequestOptions,
): Promise<HttpResponse<T>> {
  return run<T>(prepare(request(server).patch(path), options).send(body));
}

export function httpDelete<T>(path: string, options?: RequestOptions): Promise<HttpResponse<T>> {
  return run<T>(prepare(request(server).delete(path), options));
}

export interface CampaignPayload {
  name: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  minimumAmount: string;
  maximumReward: string;
}

// A counter, not a random suffix or a timestamp: unique within a run and
// identical on every run, so a failure reproduces with the same names.
let nameSequence = 0;

export function nextCampaignName(prefix = 'Campaign'): string {
  nameSequence += 1;
  return `${prefix} ${nameSequence}`;
}

export function campaignPayload(overrides: Partial<CampaignPayload> = {}): CampaignPayload {
  return {
    name: nextCampaignName(),
    type: 'FIXED_REWARD',
    status: 'DRAFT',
    startsAt: WINDOW_START,
    endsAt: WINDOW_END,
    minimumAmount: CANONICAL_MINIMUM,
    maximumReward: CANONICAL_REWARD,
    ...overrides,
  };
}

/**
 * Arrange step for every test that needs an existing campaign. Throws rather
 * than returning a failed response: a broken fixture must not read as a
 * failed assertion about the behaviour under test.
 */
export async function createCampaign(
  overrides: Partial<CampaignPayload> = {},
  brand: BrandContext = BRAND_A,
): Promise<CampaignResponse> {
  const response = await httpPost<CampaignResponse>('/campaigns', campaignPayload(overrides), {
    brand,
  });

  if (response.status !== 201) {
    throw new Error(`fixture creation failed: ${response.status} ${response.text}`);
  }

  return response.body;
}

/**
 * Runs `action` and feeds whatever it throws through the SHIPPED
 * `errorHandler`, over a real Express request/response pair.
 *
 * WHY this exists: three of the five named database constraints - `ck_amounts`,
 * `ck_campaign_type`, `ck_campaign_status` - cannot be reached over the public
 * API, because zod rejects every input that could violate them first. They are
 * still mapped by name in the handler, and an unmapped name is a 500. Driving
 * the model directly is the only way to raise them; passing the result through
 * the shipped handler is what makes the test evidence rather than a restatement
 * of the mapping table in a second place.
 */
export async function errorResponseFor(
  action: () => Promise<unknown>,
): Promise<HttpResponse<ErrorBody>> {
  const probe = express();

  probe.post(
    '/probe',
    asyncHandler(async (_req, res) => {
      await action();
      // Reached only if `action` did not throw; the assertion then fails on the
      // status, which is the correct report - the constraint did not fire.
      res.status(200).json({ error: 'action did not throw' });
    }),
  );
  probe.use(errorHandler);

  const probeServer = startOnLoopback(probe);
  await probeServer.ready;
  try {
    return await run<ErrorBody>(request(probeServer.server).post('/probe'));
  } finally {
    await stop(probeServer.server);
  }
}
