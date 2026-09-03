import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { requireAuth } from '../middleware/auth.js';
import * as ProjectService from '../services/project.service.js';

const router = Router();

// "Post a project" -- Instant Match. A brand-new, parallel way for a
// customer to reach providers alongside the existing "search, then message
// one provider" flow (search.routes.js / message.routes.js), which this
// never touches.
router.post(
  '/',
  requireAuth,
  validateBody(
    z.object({
      categoryId: z.number().int().optional(),
      description: z.string().trim().min(1).max(2000),
      lat: z.number().optional(),
      lng: z.number().optional(),
      locationLabel: z.string().max(200).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { post, matched } = await ProjectService.createProjectPost({ customerId: req.user.id, ...req.body });
    res.status(201).json({ project: post, matched });
  })
);

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const projects = await ProjectService.listProjectPosts(req.user.id);
    res.json({ projects });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { post, requests } = await ProjectService.getProjectPost(req.params.id, req.user.id);
    res.json({ project: post, requests });
  })
);

export default router;
