import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { supabase } from '../../lib/supabaseClient.js';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // "Forgot password?" is also how anyone migrated from Taskora's old login
  // system sets their first real Supabase password -- their account already
  // exists (linked by email during the migration), it just has no password
  // Supabase knows about yet, so a normal login always fails for them until
  // they've been through this once.
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitForgot = async (e) => {
    e.preventDefault();
    setError('');
    setForgotLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(form.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw resetError;
      setForgotSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  if (forgotMode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fbf6f1] px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <h1 className="font-display text-4xl text-ember-600">Taskora</h1>
            <p className="text-ink-700/70 mt-1">Reset your password</p>
          </div>
          {forgotSent ? (
            <div className="rounded-2xl border border-ink-900/8 bg-white p-6 shadow-card space-y-3 text-center">
              <p className="text-sm text-ink-700/80">
                If an account exists for <strong>{form.email}</strong>, we've sent a link to reset your password.
              </p>
              <button
                onClick={() => {
                  setForgotMode(false);
                  setForgotSent(false);
                }}
                className="text-ember-600 font-medium text-sm hover:underline"
              >
                Back to log in
              </button>
            </div>
          ) : (
            <form onSubmit={submitForgot} className="rounded-2xl border border-ink-900/8 bg-white p-6 shadow-card space-y-3">
              <h2 className="font-display text-xl mb-1">Forgot your password?</h2>
              <p className="text-sm text-ink-700/70 mb-2">Enter your email and we'll send you a link to set a new one.</p>
              <input
                required
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm outline-none focus:border-ember-400"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                disabled={forgotLoading}
                className="w-full rounded-lg bg-ember-500 py-2.5 font-semibold text-white hover:bg-ember-600 disabled:opacity-60 transition"
              >
                {forgotLoading ? 'Sending…' : 'Send reset link'}
              </button>
              <button
                type="button"
                onClick={() => setForgotMode(false)}
                className="w-full text-center text-sm text-ink-700/70 hover:underline"
              >
                Back to log in
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fbf6f1] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-ember-600">Taskora</h1>
          <p className="text-ink-700/70 mt-1">"I need someone who can do this."</p>
        </div>
        <form onSubmit={submit} className="rounded-2xl border border-ink-900/8 bg-white p-6 shadow-card space-y-3">
          <h2 className="font-display text-xl mb-1">Welcome back</h2>
          <input required type="text" placeholder="Email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm outline-none focus:border-ember-400" />
          <input required type="password" placeholder="Password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm outline-none focus:border-ember-400" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={loading} className="w-full rounded-lg bg-ember-500 py-2.5 font-semibold text-white hover:bg-ember-600 disabled:opacity-60 transition">
            {loading ? 'Logging in…' : 'Log in'}
          </button>
          <button
            type="button"
            onClick={() => {
              setError('');
              setForgotMode(true);
            }}
            className="w-full text-center text-sm text-ember-600 hover:underline"
          >
            Forgot password?
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-ink-700/70">
          New to Taskora? <Link to="/signup" className="text-ember-600 font-medium hover:underline">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
