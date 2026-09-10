// Server-only Supabase client, privileged with the service role key. Used
// for two things: (1) verifying the access token a client sends on every
// API request (middleware/auth.js), and (2) pushing uploaded images to
// Supabase Storage (middleware/upload.js) and, once, migrating legacy
// accounts into Supabase Auth (routes/admin.routes.js).
//
// The service role key bypasses Row Level Security and can impersonate any
// user, so this client must never be imported anywhere reachable from the
// client bundle -- it only ever runs on the server.
import { createClient } from '@supabase/supabase-js';

// Strip ALL whitespace, not just the ends: a value pasted into a dashboard's
// env var UI can carry a newline or stray whitespace anywhere in the middle
// (e.g. copied from a display box that visually wraps the value across two
// lines), and a plain .trim() only catches whitespace at the two edges --
// confirmed in production: trimming alone still left an embedded newline
// that made Node's fetch/Headers throw an opaque "is an invalid header
// value" error on every request, which looks nothing like "bad API key".
// Neither a Supabase URL nor a Supabase key ever legitimately contains
// whitespace, so stripping all of it is always safe.
const url = process.env.SUPABASE_URL?.replace(/\s+/g, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/\s+/g, '');

if (!url || !serviceRoleKey) {
  // Don't crash the whole server at import time -- a missing key should
  // surface as "auth/upload calls fail with a clear error", not as the API
  // refusing to boot at all (health checks, unrelated routes, etc. should
  // keep working). Every real call through supabaseAdmin will fail loudly
  // instead once one of these is actually used.
  console.error(
    'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not set -- auth and image uploads will fail until both are configured.'
  );
}

export const supabaseAdmin = createClient(url || 'https://placeholder.supabase.co', serviceRoleKey || 'placeholder', {
  auth: { autoRefreshToken: false, persistSession: false },
});
