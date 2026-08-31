import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signup(form);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fbf6f1] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-ember-600">Taskora</h1>
          <p className="text-ink-700/70 mt-1">Your local service auction house.</p>
        </div>
        <form onSubmit={submit} className="rounded-2xl border border-ink-900/8 bg-white p-6 shadow-card space-y-3">
          <h2 className="font-display text-xl mb-1">Create your account</h2>
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="First name" value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              className="rounded-lg border border-ink-900/15 px-3 py-2 text-sm outline-none focus:border-ember-400" />
            <input required placeholder="Last name" value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              className="rounded-lg border border-ink-900/15 px-3 py-2 text-sm outline-none focus:border-ember-400" />
          </div>
          <input required type="email" placeholder="Email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm outline-none focus:border-ember-400" />
          <input required type="password" placeholder="Password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm outline-none focus:border-ember-400" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={loading} className="w-full rounded-lg bg-ember-500 py-2.5 font-semibold text-white hover:bg-ember-600 disabled:opacity-60 transition">
            {loading ? 'Creating account…' : 'Get started'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-ink-700/70">
          Already have an account? <Link to="/login" className="text-ember-600 font-medium hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}
