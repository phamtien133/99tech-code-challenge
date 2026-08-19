import { Router } from 'express';

import {
  campaignParamsSchema,
  createCampaignSchema,
  listCampaignsQuerySchema,
  updateCampaignSchema,
} from '../domain/campaign-schemas';
import { asyncHandler } from '../http/async-handler';
import { toCampaignResponse } from '../http/campaign-response';
import type { CampaignListResponse } from '../http/campaign-response';
import { requireBrandId } from '../http/tenant';
import {
  createCampaign,
  deleteCampaign,
  getCampaign,
  listCampaigns,
  updateCampaign,
} from '../services/campaign-service';

/**
 * The five CRUD interfaces this service exposes. Each handler does the same
 * three things and nothing else: resolve tenant context, validate with zod,
 * delegate to the service. No query and no business rule lives here.
 *
 * `asyncHandler` on every route is load-bearing, not decoration - see
 * `src/http/async-handler.ts`.
 */
export const campaignRouter = Router();

// Create a resource.
campaignRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const brandId = requireBrandId(req);
    const input = createCampaignSchema.parse(req.body);

    const campaign = await createCampaign(brandId, input);

    res.status(201).json(toCampaignResponse(campaign));
  }),
);

// List resources with basic filters.
campaignRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const brandId = requireBrandId(req);
    const query = listCampaignsQuerySchema.parse(req.query);

    const page = await listCampaigns(brandId, query);

    const body: CampaignListResponse = {
      data: page.rows.map(toCampaignResponse),
      total: page.total,
      limit: query.limit,
      offset: query.offset,
    };
    res.status(200).json(body);
  }),
);

// Get details of a resource.
campaignRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const brandId = requireBrandId(req);
    const { id } = campaignParamsSchema.parse(req.params);

    const campaign = await getCampaign(brandId, id);

    res.status(200).json(toCampaignResponse(campaign));
  }),
);

// Update resource details.
campaignRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const brandId = requireBrandId(req);
    const { id } = campaignParamsSchema.parse(req.params);
    const input = updateCampaignSchema.parse(req.body);

    const campaign = await updateCampaign(brandId, id, input);

    res.status(200).json(toCampaignResponse(campaign));
  }),
);

// Delete a resource.
campaignRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const brandId = requireBrandId(req);
    const { id } = campaignParamsSchema.parse(req.params);

    await deleteCampaign(brandId, id);

    res.status(204).send();
  }),
);
