import { query } from '../lib/db.js';
import { notFound, forbidden, badRequest } from '../lib/errors.js';
import { searchProviders } from './search.service.js';
import { createQuoteRequest } from './quote.service.js';

// How many providers a single project post broadcasts to. Matches Thumbtack's
// own "4-5 matching pros" pattern -- enough for a real comparison, not so many
// that a provider inbox gets spammed by one project.
const MATCH_LIMIT = 5;

/**
 * "Instant Match": a customer describes a project once, and it's broadcast
 * to the top MATCH_LIMIT eligible providers for that category/location,
 * using the exact same ranking search.routes.js already uses for browsing
 * (searchProviders) -- so a project post surfaces the same providers a
 * customer would have found by searching, just without them having to
 * click into each one individually.
 *
 * Each matched provider gets a completely normal quote request, created by
 * the existing createQuoteRequest() (message.service.js's conversation
 * creation, the quote_request row, the in-app notification -- all
 * unchanged). The only new thing is tagging that row with project_post_id
 * afterward, purely so the comparison view below can group them -- it has
 * no effect on how the request behaves anywhere else in the app.
 */
export async function createProjectPost({ customerId, categoryId, description, lat, lng, locationLabel }) {
  if (!description?.trim()) throw badRequest('Describe what you need done.');

  const { rows } = await query(
    `INSERT INTO project_posts (customer_id, category_id, description, lat, lng, location_label)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [customerId, categoryId || null, description.trim(), lat ?? null, lng ?? null, locationLabel || null]
  );
  const post = rows[0];

  const { results } = await searchProviders({ categoryId: categoryId || undefined, lat, lng, limit: MATCH_LIMIT });

  const matched = [];
  for (const provider of results) {
    try {
      const qr = await createQuoteRequest({
        customerId,
        providerId: provider.id,
        message: description.trim(),
      });
      await query('UPDATE quote_requests SET project_post_id = $1 WHERE id = $2', [post.id, qr.id]);
      matched.push({ providerId: provider.id, providerName: provider.name, quoteRequestId: qr.id });
    } catch {
      // A provider becoming unavailable between the search and the request
      // (e.g. paused mid-broadcast) shouldn't fail the whole post -- just
      // skip them, same as they'd simply not show up in a manual search.
    }
  }

  return { post, matched };
}

export async function listProjectPosts(customerId) {
  const { rows } = await query(
    `SELECT pp.*, c.name AS category_name,
            (SELECT count(*) FROM quote_requests qr WHERE qr.project_post_id = pp.id) AS providers_matched,
            (SELECT count(*) FROM quotes q JOIN quote_requests qr ON qr.id = q.quote_request_id WHERE qr.project_post_id = pp.id) AS quotes_received
       FROM project_posts pp
       LEFT JOIN categories c ON c.id = pp.category_id
      WHERE pp.customer_id = $1
      ORDER BY pp.created_at DESC`,
    [customerId]
  );
  return rows;
}

export async function getProjectPost(id, customerId) {
  const { rows } = await query(
    `SELECT pp.*, c.name AS category_name FROM project_posts pp LEFT JOIN categories c ON c.id = pp.category_id WHERE pp.id = $1`,
    [id]
  );
  const post = rows[0];
  if (!post) throw notFound('Project not found.');
  if (post.customer_id !== customerId) throw forbidden('This is not your project.');

  const { rows: requests } = await query(
    `SELECT qr.id AS quote_request_id, qr.status AS request_status, qr.conversation_id,
            pr.id AS provider_id, COALESCE(NULLIF(pr.business_name, ''), pr.display_name) AS provider_name,
            pr.image_url, pr.rating_avg, pr.rating_count,
            q.id AS quote_id, q.price, q.description AS quote_description, q.status AS quote_status,
            q.scheduled_date, q.scheduled_time
       FROM quote_requests qr
       JOIN providers pr ON pr.id = qr.provider_id
       LEFT JOIN quotes q ON q.quote_request_id = qr.id
      WHERE qr.project_post_id = $1
      ORDER BY (q.price IS NULL), q.price ASC`,
    [id]
  );

  return { post, requests };
}
