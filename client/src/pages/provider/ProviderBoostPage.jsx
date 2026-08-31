import { useEffect, useState } from 'react';
import api from '../../api/client.js';
import Spinner from '../../components/Spinner.jsx';

export default function ProviderBoostPage() {
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
      const { data } = await api.post('/subscriptions/boost/checkout');
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!status) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;
  const active = status.boost?.status === 'active';

  return (
    <div className="max-w-md space-y-4">
      <h1 className="font-display text-2xl">Taskora Boost</h1>
      <div className="rounded-2xl border border-ink-900/8 bg-white p-6 shadow-card text-center">
        <div className="text-4xl mb-2">🚀</div>
        <p className="font-display text-3xl">$100<span className="text-base text-ink-700/60">/mo</span></p>
        <p className="text-sm text-ink-700/70 mt-2">Extra visibility in search results, clearly labeled as "Sponsored" — never disguised as an organic match.</p>
        {active ? (
          <p className="mt-4 rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-700">Boost is active!</p>
        ) : (
          <button disabled={busy} onClick={subscribe} className="mt-4 w-full rounded-full bg-ember-500 py-2.5 font-semibold text-white hover:bg-ember-600 disabled:opacity-60">
            {busy ? 'Redirecting…' : 'Start Boosting'}
          </button>
        )}
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>
    </div>
  );
}
