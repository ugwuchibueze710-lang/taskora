// The Groq "action engine": a small, explicit allowlist of tools the AI may
// call, each one implemented by re-using the exact same authorized service
// functions the normal REST endpoints use. This is the enforcement point for
// section 44 of the spec — the AI never touches the database directly, never
// sees another user's data, and has NO tool that can move money. Every tool
// receives `req.user` and re-checks ownership exactly like a human clicking
// the equivalent button would.
import { query } from '../lib/db.js';
import { searchProviders } from './search.service.js';
import { geocode } from './mapbox.service.js';
import { resolveCategoryByText, searchCategories } from './category.service.js';
import { getOrCreateConversation, sendMessage, loadConversationForUser } from './message.service.js';
import * as QuoteService from './quote.service.js';
import { getJobForUser } from './job.service.js';
import { badRequest, forbidden } from '../lib/errors.js';

export const TOOLS = [
  tool('search_providers', 'Search Taskora providers by category and/or keywords near the customer\'s current location.', {
    categoryName: { type: 'string', description: 'A Taskora category name, if the request clearly matches one.' },
    keywords: { type: 'array', items: { type: 'string' }, description: 'Service keywords, e.g. ["house cleaning", "windows"]' },
    dayOfWeek: { type: 'integer', description: '0=Sunday..6=Saturday, only if the customer mentioned a day.' },
    budgetMax: { type: 'number' },
  }),
  tool('search_categories', 'Look up Taskora categories matching a text fragment.', {
    text: { type: 'string' },
  }),
  tool('get_provider_profile', 'Get full public details for one provider by id.', {
    providerId: { type: 'string' },
  }, ['providerId']),
  tool('check_availability', 'Check whether a provider is available on a given day of week.', {
    providerId: { type: 'string' },
    dayOfWeek: { type: 'integer' },
  }, ['providerId', 'dayOfWeek']),
  tool('find_nearby_providers', 'Geocode a place name and search providers near it.', {
    locationText: { type: 'string' },
    categoryName: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
  }, ['locationText']),
  tool('start_conversation', 'Start (or reuse) a conversation with a provider for the logged-in customer.', {
    providerId: { type: 'string' },
  }, ['providerId']),
  tool('send_message', 'Send a text message into an existing conversation the user owns.', {
    conversationId: { type: 'string' },
    body: { type: 'string' },
  }, ['conversationId', 'body']),
  tool('create_quote_request', 'Send a quote request from the logged-in customer to a provider.', {
    providerId: { type: 'string' },
    message: { type: 'string' },
  }, ['providerId']),
  tool('retrieve_quote', 'Fetch a quote by id if it belongs to the logged-in user.', {
    quoteId: { type: 'string' },
  }, ['quoteId']),
  tool('accept_quote', 'Accept a quote on behalf of the logged-in customer, creating a job. This does NOT charge any money.', {
    quoteId: { type: 'string' },
  }, ['quoteId']),
  tool('retrieve_job', 'Fetch a job by id if it belongs to the logged-in user.', {
    jobId: { type: 'string' },
  }, ['jobId']),
  tool('save_provider', 'Add a provider to the logged-in customer\'s favorites.', {
    providerId: { type: 'string' },
  }, ['providerId']),
  tool('retrieve_favorites', 'List the logged-in customer\'s favorite providers.', {}),
  tool('navigate', 'Suggest a screen the customer could open next (the app decides whether to actually navigate).', {
    route: { type: 'string', description: 'e.g. "/providers/{id}", "/jobs/{id}", "/favorites"' },
    label: { type: 'string' },
  }, ['route']),
];

function tool(name, description, properties, required = []) {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } };
}

/**
 * Executes one tool call. `req` carries the authenticated session (or none,
 * for anonymous browsing) — every branch below is authorized exactly the
 * way the matching REST route is.
 */
export async function executeTool(name, args, req) {
  switch (name) {
    case 'search_providers': {
      const filters = await resolveFilters(args, req);
      return searchProviders(filters);
    }
    case 'search_categories': {
      const rows = await searchCategories(args.text, { limit: 10 });
      return { categories: rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug })) };
    }
    case 'get_provider_profile': {
      const { rows } = await query(
        `SELECT p.*, u.first_name, u.last_name FROM providers p JOIN users u ON u.id = p.user_id WHERE p.id = $1 AND p.status IN ('active','paused')`,
        [args.providerId]
      );
      if (!rows[0]) return { error: 'Provider not found.' };
      return { provider: rows[0] };
    }
    case 'check_availability': {
      const { rows } = await query('SELECT availability_mode FROM providers WHERE id = $1', [args.providerId]);
      if (!rows[0]) return { error: 'Provider not found.' };
      if (rows[0].availability_mode === 'always') return { available: true, mode: 'always' };
      const slots = await query('SELECT start_time, end_time FROM provider_availability WHERE provider_id = $1 AND day_of_week = $2', [
        args.providerId,
        args.dayOfWeek,
      ]);
      return { available: slots.rows.length > 0, mode: 'custom', slots: slots.rows };
    }
    case 'find_nearby_providers': {
      const matches = await geocode(args.locationText, { limit: 1 });
      if (!matches.length) return { error: 'Could not find that location.' };
      const filters = await resolveFilters(args, req);
      filters.lat = matches[0].lat;
      filters.lng = matches[0].lng;
      return { location: matches[0], ...(await searchProviders(filters)) };
    }
    case 'start_conversation': {
      requireUser(req);
      return getOrCreateConversation(req.user.id, args.providerId);
    }
    case 'send_message': {
      requireUser(req);
      await loadConversationForUser(args.conversationId, req.user); // authorization check
      return sendMessage({ conversationId: args.conversationId, senderUserId: req.user.id, body: args.body });
    }
    case 'create_quote_request': {
      requireUser(req);
      return QuoteService.createQuoteRequest({ customerId: req.user.id, providerId: args.providerId, message: args.message });
    }
    case 'retrieve_quote': {
      requireUser(req);
      const { rows } = await query('SELECT * FROM quotes WHERE id = $1', [args.quoteId]);
      const quote = rows[0];
      if (!quote || (quote.customer_id !== req.user.id && quote.provider_id !== req.user.provider_id)) {
        return { error: 'Quote not found or not accessible.' };
      }
      return { quote };
    }
    case 'accept_quote': {
      requireUser(req);
      return QuoteService.acceptQuote({ quoteId: args.quoteId, customerId: req.user.id });
    }
    case 'retrieve_job': {
      requireUser(req);
      const { job } = await getJobForUser(args.jobId, req.user);
      return { job };
    }
    case 'save_provider': {
      requireUser(req);
      await query('INSERT INTO favorites (user_id, provider_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
        req.user.id,
        args.providerId,
      ]);
      return { success: true };
    }
    case 'retrieve_favorites': {
      requireUser(req);
      const { rows } = await query(
        `SELECT p.id, COALESCE(p.business_name, p.display_name) AS name, p.rating_avg
           FROM favorites f JOIN providers p ON p.id = f.provider_id WHERE f.user_id = $1`,
        [req.user.id]
      );
      return { favorites: rows };
    }
    case 'navigate': {
      return { route: args.route, label: args.label || 'Open' };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function requireUser(req) {
  if (!req.user) throw badRequest('Please log in to do that.');
}

async function resolveFilters(args, req) {
  const filters = { keywords: args.keywords || [], budgetMax: args.budgetMax, dayOfWeek: args.dayOfWeek };
  if (args.categoryName) {
    const match = await resolveCategoryByText(args.categoryName);
    if (match) filters.categoryId = match.id;
  }
  if (req?.user?.location_lat && req?.user?.location_lng) {
    filters.lat = req.user.location_lat;
    filters.lng = req.user.location_lng;
  }
  return filters;
}
