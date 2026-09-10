import { createClient } from '@supabase/supabase-js';

// The one Supabase client for the whole app -- owns the session (stored in
// the browser's own localStorage by the SDK itself, refreshed automatically)
// that AuthContext reads from and api/client.js attaches to every request as
// a Bearer token. Only the anon key lives here; it's meant to be public (it
// has no power beyond what each table's Row Level Security policy allows)
// unlike the service role key, which only ever runs on the server.
// .trim(): a value pasted into a dashboard's env var UI can carry a trailing
// newline or stray whitespace along with it -- harmless-looking, but this
// value becomes an HTTP header on every request, and a whitespace character
// in it produces an opaque browser fetch failure that looks nothing like
// "bad key". See the matching guard in server/src/lib/supabaseAdmin.js.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY is not set -- sign up/log in will not work until both are configured at build time.'
  );
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder');
