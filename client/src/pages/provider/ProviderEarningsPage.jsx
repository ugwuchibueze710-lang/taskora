import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client.js';
import Spinner from '../../components/Spinner.jsx';

export default function ProviderEarningsPage() {
  const [params] = useSearchParams();
  const [earnings, setEarnings] = useState(null);
  const [account, setAccount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const [{ data: e }, { data: a }] = await Promise.all([
      api.get('/providers/me/earnings'),
      api.get('/payments/connect/status').catch(() => ({ data: { account: null } })),
    ]);
    setEarnings(e);
    setAccount(a.account);
  };

  useEffect(() => {
    load();
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/payments/connect/onboard');
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!earnings) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="font-display text-2xl">Earnings</h1>

      {!account?.payouts_enabled && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-medium text-amber-800">Set up payouts to get paid</p>
          <p className="text-sm text-amber-700/80 mt-1">Connect your bank account through Stripe so Taskora can pay you after each confirmed job.</p>
          {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
          <button disabled={busy} onClick={connect} className="mt-2 rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-60">
            {busy ? 'Redirecting…' : 'Set Up Payouts with Stripe'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Pending (held by Taskora)" value={earnings.summary.pending} />
        <Stat label="Released to you" value={earnings.summary.released} />
        <Stat label="Total service volume" value={earnings.summary.gross} />
        <Stat label="Taskora fees paid" value={earnings.summary.fees_paid} />
      </div>

      <div>
        <h2 className="font-display text-xl mb-2">Payout history</h2>
        {earnings.payouts.length === 0 && <p className="text-sm text-ink-700/60">No payouts yet.</p>}
        <div className="space-y-2">
          {earnings.payouts.map((p) => (
            <div key={p.id} className="flex justify-between rounded-xl border border-ink-900/8 bg-white p-3 text-sm">
              <span>{new Date(p.created_at).toLocaleDateString()}</span>
              <span className="font-medium">${p.amount}</span>
              <span className="text-ink-700/60">{p.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-ink-900/8 bg-white p-4 shadow-card">
      <p className="font-display text-xl">${value}</p>
      <p className="text-xs text-ink-700/60 mt-1">{label}</p>
    </div>
  );
}
