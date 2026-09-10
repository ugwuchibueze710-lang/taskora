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

// .trim() guards against a real, observed failure mode: pasting a key into a
// dashboard's env var UI can carry a trailing newline or stray whitespace
// along with it (easy to do from a wrapped/multi-line display box). Supabase
// uses this value as an HTTP header on every request, and Node's fetch
// throws an opaque "Cannot convert argument to a ByteString" error for a
// header value containing a newline -- which looks nothing like "bad API
// key" and cost real time to track down. Trimming here means a stray
// whitespace character from a copy-paste can never resurface that failure.
const url = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

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
