# Taskora

Taskora is a local services marketplace — a "local service auction house" where customers describe what they need
and get matched with real local providers. It is a from-scratch, independent application: no Sharetribe, no
third-party marketplace framework, no MongoDB. Everything (auth, database, marketplace logic, messaging, payments,
search, provider system) is custom-built.

## Architecture

```
client/   React + Vite + Tailwind single-page app
server/   Node.js + Express API, session auth, raw SQL over PostgreSQL (no ORM)
server/db/migrations/  Hand-written, version-controlled SQL schema migrations
server/db/seed.js      Optional, explicit dev-only seed data (never runs automatically)
```

One Postgres database is the single source of truth for everything: users, providers, categories/services,
messages, quotes, jobs, payments, reviews, notifications, disputes, subscriptions, admin actions, audit log.

External services, and why each one is used:
- **Render** — hosting for the app and its PostgreSQL database.
- **PostgreSQL** — the only datastore. No MongoDB, no second database.
- **Groq** — natural-language search interpretation and a constrained AI "action engine." Groq only ever
  *interprets intent*; it never invents providers, prices, availability, or ratings. All of that data comes back
  out of Postgres. See "The Groq action engine" below.
- **Mapbox** — geocoding (turning a typed place into lat/lng) and distance calculations for the location system.
- **Stripe** — payments, Stripe Connect (Express accounts) for provider payouts, and Stripe Subscriptions for
  Taskora Pro / Taskora Boost.

No other third-party APIs are used.

## Running locally

Prerequisites: Node 20+, a local PostgreSQL server, npm.

```bash
# 1. Install dependencies
npm run install:all

# 2. Configure environment
cp server/.env.example server/.env
# Edit server/.env — at minimum set DATABASE_URL to a real Postgres connection string.
# GROQ_API_KEY / MAPBOX_TOKEN / STRIPE_* can be left blank during local development —
# the app degrades gracefully (plain keyword search still works, and payment/AI
# endpoints return a clear "not configured yet" error instead of crashing).

# 3. Create the database and run migrations
createdb taskora   # or: psql -c "CREATE DATABASE taskora;"
npm run migrate

# 4. (Optional) seed demo categories, services, and a few test accounts
npm run seed
# This is refused automatically if the users table already has real data,
# so it can never silently pollute a production database.

# 5. Run the app
npm run dev:server   # http://localhost:4000
npm run dev:client   # http://localhost:5173 (proxies /api and /uploads to :4000)
```

Seeded test accounts (only created if you run `npm run seed`), all password `test1234`:
- `admin@taskora.test` — admin
- `customer@taskora.test` — customer, location pre-set to Owensboro, KY
- `alex@taskora.test`, `sam@taskora.test`, `morgan@taskora.test` — published providers across
  House Cleaning, Handyman, and Lawn Care

## Image storage

Profile pictures, provider logos/photos, portfolio photos, and generated invoice PDFs are stored as files on disk
under `server/uploads/`, with only the file path/URL recorded in PostgreSQL (never the binary itself). This is the
simplest reliable option that works identically in local dev and on Render without adding a paid object-storage
API. On Render, attach a **Persistent Disk** to the web service mounted at `server/uploads` (the included
`render.yaml` already does this) so uploads survive deploys and restarts. If you later outgrow local disk (e.g.
multiple server instances), the natural next step is an S3-compatible bucket — but that is a deliberate future
upgrade, not something this app silently depends on today.

## The Groq action engine

Two endpoints use Groq:

- `POST /api/ai/search` — turns a sentence like *"I need someone to mow my lawn this weekend"* into structured
  filters (category, keywords, day of week, budget) which are then run against the real `searchProviders()`
  function shared with the plain search box. If `GROQ_API_KEY` isn't set, a naive local keyword/day parser is used
  instead so search always works.
- `POST /api/ai/assistant` — a constrained tool-calling loop (see `server/src/services/ai-actions.service.js`).
  The model can only call a fixed allowlist of tools (search providers, start a conversation, request/accept a
  quote, check a job's status, save a favorite, etc.), and **every tool is implemented by re-using the exact same
  authorized service functions the normal REST routes use** — so the AI can never do more than the logged-in user
  could already do by clicking buttons, and it has no financial tool at all. To pay for something, the assistant
  can only point the user at the real job page, where they must explicitly click Pay.

## Payments (Stripe)

- Checkout charges the **customer's total** (service price) to Taskora's platform Stripe account.
- Taskora's 10% platform fee is computed and stored on the job/payment record before checkout, and shown to the
  customer before they pay (`platform_fee` + `provider_amount` always sum to the price).
- Funds are **held** by Taskora (`payout_status = 'holding'`) until the customer explicitly confirms completion.
  Only then does the server create a Stripe **Transfer** to the provider's Connect Express account
  (`payout_status = 'released'`).
- All state changes that matter financially happen from **verified Stripe webhooks**
  (`server/src/routes/payment.routes.js`), never from the frontend claiming success. Every webhook event is
  recorded once in `payment_events` (unique on `stripe_event_id`), so retried deliveries can't double-apply a
  payment.
- Refunds are issued automatically when a job is cancelled or declined while funds are still held.

To test payments locally, set `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` to Stripe
**test mode** keys and use the Stripe CLI (`stripe listen --forward-to localhost:4000/api/payments/webhook`).

## Job lifecycle

Jobs move through an explicit state machine (`server/src/services/job.service.js`) with a fixed transition table —
the server rejects any transition not in that table, so the UI can never push a job into an invalid state:

```
quote_accepted → payment_pending → paid → provider_accepted → in_progress →
provider_marked_complete → customer_confirmed → completed
                                        ↘ disputed / cancelled / refunded (from most states)
```

## Deploying to Render

1. Push this repository to GitHub.
2. In Render, choose "New Blueprint" and point it at the repo — `render.yaml` defines the web service and the
   Postgres database together.
3. After the first deploy, set these environment variables on the web service (Render dashboard → Environment):
   - `CLIENT_ORIGIN` → your Render URL, e.g. `https://taskora.onrender.com` (needed for Stripe redirect URLs)
   - `GROQ_API_KEY`, `MAPBOX_TOKEN`
   - `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRO_PRICE_ID`, `STRIPE_BOOST_PRICE_ID`
   - `STRIPE_WEBHOOK_SECRET` — create a Stripe webhook pointed at
     `https://<your-app>.onrender.com/api/payments/webhook` (events: `checkout.session.completed`,
     `payment_intent.payment_failed`, `account.updated`, `customer.subscription.*`) and paste its signing secret here.
4. Redeploy. Migrations run automatically on every deploy (`npm start` runs `npm run migrate` first).
5. Visit `/health` to confirm the service is up.

## What's real vs. what needs your keys

Every feature in this app is fully implemented and backed by real database state — there are no fake buttons,
hard-coded results, or placeholder success messages anywhere. The three paid integrations (Groq, Mapbox, Stripe)
are wired up completely, but obviously can't make real external calls until you provide your own API keys:
- Without `MAPBOX_TOKEN`: location search returns a clear error; category/keyword search still works.
- Without `GROQ_API_KEY`: natural-language search falls back to a naive local parser; the full AI assistant says
  it isn't configured yet.
- Without Stripe keys: checkout, Connect onboarding, and Pro/Boost subscriptions return a clear "not configured"
  error rather than pretending to succeed.

## Security notes

- Passwords are hashed with bcrypt; there are intentionally no complexity rules (per product spec), but nothing is
  ever stored in plaintext.
- Sessions are server-side (Postgres-backed via `connect-pg-simple`), httpOnly, `secure` in production.
- Every mutating endpoint re-checks ownership/authorization server-side — the frontend's UI state is never trusted
  as an authorization boundary.
- Admin routes require `role = 'admin'` on the authenticated session user, checked on every request.
- File uploads are restricted by MIME type and size.
- Stripe webhooks are signature-verified; nothing financial is ever accepted from the frontend directly.
- Rate limiting is applied globally, more tightly on `/api/auth/*`, and on `/api/ai/*` (a paid upstream call).
