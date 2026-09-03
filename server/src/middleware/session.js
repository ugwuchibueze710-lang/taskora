// The single express-session instance used to authenticate BOTH normal HTTP
// requests (mounted in index.js) and the WebSocket call-signaling upgrade
// (realtime/call-signaling.js). Pulled into its own module so the exact same
// configuration -- cookie name, secret, store -- backs both: a WebSocket
// connection is authenticated by running this same middleware against the
// upgrade request, which decodes and verifies the same 'taskora.sid' cookie
// used everywhere else, so there is exactly one source of truth for "who is
// this" rather than a second, parallel auth mechanism for calls.
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from '../lib/db.js';

const PgSession = connectPgSimple(session);

export const sessionMiddleware = session({
  store: new PgSession({ pool, tableName: 'session' }),
  name: 'taskora.sid',
  secret: process.env.SESSION_SECRET || 'insecure-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
});
