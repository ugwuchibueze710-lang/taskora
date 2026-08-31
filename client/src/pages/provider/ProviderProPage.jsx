import { useEffect, useState } from 'react';
import api from '../../api/client.js';
import Spinner from '../../components/Spinner.jsx';

export default function ProviderProPage() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/subscriptions/status').then(({ data }) => setStatus(data));
  }, []);

  const subscribe = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/subscriptions/pro/checkout');
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!status) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;
  const active = status.pro?.status === 'active';

  return (
    <div className="max-w-md space-y-4">
      <h1 className="font-display text-2xl">Taskora Pro</h1>
      <div className="rounded-2xl border border-ink-900/8 bg-white p-6 shadow-card text-center">
        <div className="text-4xl mb-2">⭐</div>
        <p className="font-display text-3xl">$19.99<span className="text-base text-ink-700/60">/mo</span></p>
        <ul className="mt-4 space-y-1.5 text-sm text-ink-700/80 text-left">
          <li>✓ Increased marketplace exposure</li>
          <li>✓ Pro badge on your profile</li>
          <li>✓ Provider analytics</li>
          <li>✓ Enhanced profile presentation</li>
        </ul>
        {active ? (
          <p className="mt-4 rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700">You're a Pro member!</p>
        ) : (
          <button disabled={busy} onClick={subscribe} className="mt-4 w-full rounded-full bg-ink-900 py-2.5 font-semibold text-white hover:bg-ink-800 disabled:opacity-60">
            {busy ? 'Redirecting…' : 'Upgrade to Pro'}
          </button>
        )}
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>
      <p className="text-xs text-ink-700/50 text-center">Pro increases your visibility but never overrides relevance — the best match still wins.</p>
    </div>
  );
}
