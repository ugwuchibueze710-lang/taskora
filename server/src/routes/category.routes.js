import { Router } from 'express';
import { query } from '../lib/db.js';
import { asyncHandler } from '../lib/errors.js';
import { searchCategories, listCategoryGroupsWithCategories } from '../services/category.service.js';

const router = Router();

// Flat list — optionally filtered by ?q= (matches name or keyword aliases).
// This is what the home page, the provider category picker, and the
// category directory all call; there is exactly one query implementation
// for "find categories matching this text" (searchCategories).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await searchCategories(req.query.q, { limit: 500 });
    res.json({
      categories: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        icon: r.icon,
        description: r.description,
        imageUrl: r.image_url,
        keywords: r.keywords,
        group: r.group_slug ? { slug: r.group_slug, name: r.group_name } : null,
        sortOrder: r.sort_order,
      })),
    });
  })
);

// Grouped directory: [{ slug, name, categories: [...] }, ...] — used by the
// home page's sectioned browse and the "See All Services" directory page.
router.get(
  '/groups',
  asyncHandler(async (req, res) => {
    const groups = await listCategoryGroupsWithCategories();
    res.json({ groups });
  })
);

router.get(
  '/:id/services',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, name, slug, is_custom FROM services WHERE category_id = $1 AND is_active = true ORDER BY name`,
      [req.params.id]
    );
    res.json({ services: rows });
  })
);

export default router;
