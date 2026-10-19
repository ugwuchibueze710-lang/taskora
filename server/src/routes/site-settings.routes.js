// Public read of the level-2-admin-controlled site settings (homepage
// hero text, announcement banner, pinned featured categories) -- every
// logged-in page that needs these (today: just the home page) reads them
// from here rather than each needing its own admin-gated call. Writing is
// admin.routes.js's PUT /admin/site-settings (level 2 only); this route is
// read-only and intentionally has no auth requirement of its own beyond
// whatever the rest of this app's routes assume, since the content itself
// is not remotely sensitive -- it is literally marketing copy.
import { Router } from 'express';
import { getSiteSettings } from '../services/site-settings.service.js';
import { asyncHandler } from '../lib/errors.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const settings = await getSiteSettings();
    res.json({ settings });
  })
);

export default router;
