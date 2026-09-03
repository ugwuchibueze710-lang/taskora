import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppError } from './lib/errors.js';
import { syncCategoryCatalog } from './services/category.service.js';
import { sessionMiddleware } from './middleware/session.js';
import { attachCallSignaling } from './realtime/call-signaling.js';

import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';
import categoryRoutes from './routes/category.routes.js';
import providerRoutes from './routes/provider.routes.js';
import searchRoutes from './routes/search.routes.js';
import aiRoutes from './routes/ai.routes.js';
import locationRoutes from './routes/location.routes.js';
import messageRoutes from './routes/message.routes.js';
import quoteRoutes from './routes/quote.routes.js';
import projectRoutes from './routes/project.routes.js';
import jobRoutes from './routes/job.routes.js';
import paymentRoutes, { webhookRouter } from './routes/payment.routes.js';
import invoiceRoutes from './routes/invoice.routes.js';
import reviewRoutes from './routes/review.routes.js';
import favoriteRoutes from './routes/favorite.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import disputeRoutes from './routes/dispute.routes.js';
import supportRoutes from './routes/support.routes.js';
import adminRoutes from './routes/admin.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', 1);

// Stripe webhooks need the raw body BEFORE json parsing, so mount it first.
app.use('/api/payments/webhook', webhookRouter);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN?.split(',') || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const globalLimiter = rateLimit({ windowMs: 60 * 1000, limit: 200, standardHeaders: true, legacyHeaders: false });
app.use('/api', globalLimiter);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

// AI calls hit a paid third-party API and are more expensive to abuse than a normal CRUD route.
const aiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 15, standardHeaders: true, legacyHeaders: false });
app.use('/api/ai', aiLimiter);

app.use(sessionMiddleware);

app.use('/uploads', express.static(path.join(__dirname, '..', process.env.UPLOAD_DIR?.replace('./', '') || 'uploads')));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/quotes', quoteRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/admin', adminRoutes);

// Serve the built client in production (single-service Render deploy).
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get(/^(?!\/api|\/uploads|\/health).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler — never leaks stack traces to clients.
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }

  // An upload that fails multer's own limits (too large, wrong field, too
  // many files) throws a MulterError — again a client mistake, not a server
  // failure, so it gets a clean 400 with a message people can act on instead
  // of a generic "something went wrong" for what's usually just a big photo.
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: 'That file is too large.',
      LIMIT_FILE_COUNT: 'Too many files.',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field.',
    };
    return res.status(400).json({ error: messages[err.code] || 'File upload error.', code: 'BAD_REQUEST' });
  }

  // A malformed request body (invalid JSON) is a client mistake, not a server
  // failure — express.json() throws a plain SyntaxError for this rather than
  // our AppError, so it needs its own 400 branch instead of falling through
  // to the generic 500 below.
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400)) {
    return res.status(400).json({ error: 'Malformed request body.', code: 'BAD_REQUEST' });
  }

  // A route param that isn't a well-formed UUID (or another malformed value
  // Postgres rejects while binding a query parameter) reaches the database
  // driver before any of our own validation runs. Without this, a client
  // typing a bad id into the URL — or simply guessing one — gets a raw 500
  // instead of a clean "not found"/"bad request", and it looks like a server
  // failure in monitoring when it's really just bad input.
  if (err.code === '22P02') {
    return res.status(400).json({ error: 'Invalid ID format.', code: 'BAD_REQUEST' });
  }

  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
});

const PORT = process.env.PORT || 4000;

// Populate/refresh the category catalog from the central data file before
// accepting traffic. This is what makes categories show up with zero manual
// steps (no npm run seed, no admin console, no direct DB access) — it's a
// pure upsert keyed by slug, so it's safe to run on every boot and never
// deletes a category a provider may already be using.
syncCategoryCatalog()
  .then(({ groups, categories, activeInDb }) => {
    console.log(`Category catalog synced: ${groups} groups, ${categories} categories defined, ${activeInDb} active in DB.`);
  })
  .catch((err) => {
    console.error('Category catalog sync failed (server will still start):', err.message);
  })
  .finally(() => {
    const server = app.listen(PORT, () => {
      console.log(`Taskora API listening on port ${PORT}`);
    });
    // In-app calling's signaling channel (offer/answer/ICE relay) rides the
    // same HTTP server as a WebSocket upgrade on /ws/calls, authenticated off
    // the same session cookie as every other route -- see realtime/call-signaling.js.
    attachCallSignaling(server);
  });
