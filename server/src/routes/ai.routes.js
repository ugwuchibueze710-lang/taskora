import { Router } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { asyncHandler } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { attachUserIfPresent } from '../middleware/auth.js';
import { parseSearchIntent, chatCompletion, groqConfigured } from '../services/groq.service.js';
import { searchProviders } from '../services/search.service.js';
import { TOOLS, executeTool } from '../services/ai-actions.service.js';
import { resolveCategoryByText } from '../services/category.service.js';
import { recordCategorySearch } from '../services/category-demand.service.js';

const router = Router();

// ---- Natural-language search: Groq only produces filters; Postgres produces results ----
router.post(
  '/search',
  attachUserIfPresent,
  validateBody(z.object({ text: z.string().trim().min(1).max(500) })),
  asyncHandler(async (req, res) => {
    const { rows: categories } = await query('SELECT id, name, keywords FROM categories WHERE is_active = true');
    const intent = await parseSearchIntent(req.body.text, categories);

    let categoryId = null;
    if (intent.categoryName) {
      const match = await resolveCategoryByText(intent.categoryName);
      if (match) categoryId = match.id;
    }

    let lat = req.user?.location_lat ?? null;
    let lng = req.user?.location_lng ?? null;
    // Defaults to the customer's locked-location city; overridden below if
    // the query names a different place ("plumbers in Owensboro" while
    // physically in Louisville should count as Owensboro demand).
    let city = req.user?.location_city ?? null;
    if (intent.locationText) {
      const { geocode } = await import('../services/mapbox.service.js');
      try {
        const matches = await geocode(intent.locationText, { limit: 1 });
        if (matches[0]) {
          lat = matches[0].lat;
          lng = matches[0].lng;
          city = matches[0].city ?? city;
        }
      } catch {
        // Location mentioned but Mapbox unavailable/unconfigured — fall back to the user's locked location.
      }
    }

    const filters = {
      categoryId,
      keywords: intent.keywords,
      lat,
      lng,
      dayOfWeek: intent.dayOfWeek ?? undefined,
      budgetMax: intent.budgetMax ?? undefined,
    };
    const result = await searchProviders(filters);

    if (req.user) {
      await query('INSERT INTO search_history (user_id, query_text, parsed_filters, result_count) VALUES ($1, $2, $3, $4)', [
        req.user.id,
        req.body.text,
        JSON.stringify({ ...filters, intent }),
        result.total,
      ]);
    }
    // A Smart Search query that resolved to a real category counts toward
    // that category's local demand exactly like an explicit browse does
    // (see search.routes.js) — a free-text query Groq couldn't map to any
    // category (categoryId stays null) does not.
    if (categoryId) {
      await recordCategorySearch({ categoryId, city });
    }

    // aiPowered reflects whether Groq itself actually produced this
    // interpretation (source === 'groq'), not merely whether a key is
    // configured — a configured-but-failing/unavailable key (bad model id,
    // outage, invalid key) still falls back to naiveParse and should be
    // reported honestly as non-AI rather than claiming Groq ran.
    res.json({ ...result, interpreted: intent, aiPowered: intent.source === 'groq' });
  })
);

// ---- Controlled action-engine assistant ----
const MAX_TOOL_ROUNDS = 4;

router.post(
  '/assistant',
  attachUserIfPresent,
  validateBody(
    z.object({
      message: z.string().trim().min(1).max(1000),
      history: z
        .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
        .max(10)
        .optional()
        .default([]),
    })
  ),
  asyncHandler(async (req, res) => {
    if (!groqConfigured()) {
      return res.json({
        reply: "Taskora's AI assistant isn't configured yet — you can still use the search bar and browse categories directly.",
        actions: [],
      });
    }

    const systemPrompt = `You are Taskora's assistant inside a local services marketplace. You help customers find and hire real local
service providers. Rules you must always follow:
- Never invent providers, prices, availability, or ratings — only state facts returned by your tools.
- You have NO ability to charge any payment. If the user wants to pay, tell them you'll take them to the real payment screen
  where they must explicitly confirm — use the "navigate" tool pointing at "/jobs/{id}" for that, never claim a payment happened.
- Every tool you call is already scoped to what this specific logged-in user is allowed to do; if a tool returns an error
  (like "please log in"), explain that plainly instead of pretending it worked.
- Keep replies short, friendly, and specific to real data from your tools.
Current user: ${req.user ? `${req.user.first_name}, logged in, mode=${req.user.current_mode}` : 'not logged in'}.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...req.body.history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user', content: req.body.message },
    ];

    const actionsTaken = [];
    let finalMessage = null;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let response;
      try {
        response = await chatCompletion({ messages, tools: TOOLS, tool_choice: 'auto' });
      } catch (err) {
        // Groq is configured but the call itself failed (bad/retired model id, outage,
        // rate limit, etc.). /search already degrades gracefully to naiveParse for this
        // exact failure mode -- the assistant must too, instead of throwing all the way
        // up through asyncHandler into an opaque 500 for the user.
        console.error('Groq assistant call failed:', err.message);
        return res.json({
          reply: "Taskora's AI assistant is temporarily unavailable — you can still use the search bar and browse categories directly.",
          actions: actionsTaken,
        });
      }
      messages.push(response);

      if (!response.tool_calls?.length) {
        finalMessage = response.content;
        break;
      }

      for (const call of response.tool_calls) {
        let result;
        try {
          const args = JSON.parse(call.function.arguments || '{}');
          result = await executeTool(call.function.name, args, req);
          actionsTaken.push({ tool: call.function.name, args, ok: true });
        } catch (err) {
          result = { error: err.message || 'Action failed.' };
          actionsTaken.push({ tool: call.function.name, ok: false, error: result.error });
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }

    res.json({
      reply: finalMessage || "I looked into that, but couldn't finish — could you rephrase or try a specific search?",
      actions: actionsTaken,
    });
  })
);

export default router;
