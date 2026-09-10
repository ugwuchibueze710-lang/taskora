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

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
