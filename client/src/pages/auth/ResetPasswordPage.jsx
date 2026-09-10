import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient.js';

// Landing page for the link in Supabase's password-reset email. Supabase's
// client SDK detects the recovery token in the URL on load and establishes
// a temporary session from it automatically (detectSessionInUrl, on by
// default) -- this page's only job is to collect a new password and call
// updateUser() with it. Reachable with or without an existing app session
// (it's how a migrated legacy account sets its very first Supabase
// password), so it isn't wrapped in RequireAuth/RequireGuest like the rest
// of the app.
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      navigate('/');
    } catch (err) {
      setError(
        err.message || 'Could not update your password. The reset link may have expired — request a new one from the login page.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fbf6f1] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-ember-600">Taskora</h1>
          <p className="text-ink-700/70 mt-1">Set a new password</p>
        </div>
        <form onSubmit={submit} className="rounded-2xl border border-ink-900/8 bg-white p-6 shadow-card space-y-3">
          <h2 className="font-display text-xl mb-1">Choose a new password</h2>
          <input
            required
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm outline-none focus:border-ember-400"
          />
          <input
            required
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm outline-none focus:border-ember-400"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            disabled={loading}
            className="w-full rounded-lg bg-ember-500 py-2.5 font-semibold text-white hover:bg-ember-600 disabled:opacity-60 transition"
          >
            {loading ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      </div>
    </div>
  );
}
