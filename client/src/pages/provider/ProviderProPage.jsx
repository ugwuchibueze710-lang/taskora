import { useEffect, useState } from 'react';
import api from '../../api/client.js';
import Spinner from '../../components/Spinner.jsx';

const PLANS = [
  { interval: 'month', label: 'Monthly', price: '$19.99', suffix: '/mo' },
  { interval: 'year', label: 'Yearly', price: '$199.99', suffix: '/yr', badge: 'Save $39.89/year' },
];

export default function ProviderProPage() {
  const [status, setStatus] = useState(null);
  const [busyInterval, setBusyInterval] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/subscriptions/status').then(({ data }) => setStatus(data));
  }, []);

  const subscribe = async (interval) => {
    setBusyInterval(interval);
    setError('');
    try {
      const { data } = await api.post('/subscriptions/pro/checkout', { interval });
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyInterval(null);
    }
  };

  if (!status) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;
  const active = status.pro?.status === 'active';

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-display text-2xl">Taskora Pro</h1>
      <p className="text-sm text-ink-700/70">
        Pro gives your profile priority placement above non-priority providers in relevant searches — it doesn't override
        relevance or let a lower rating beat a higher-rated Pro provider; among Pro members, the best-rated match still
        wins the top spot.
      </p>

      {active ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <div className="text-4xl mb-2">⭐</div>
          <p className="font-semibold text-emerald-800">You're a Pro member!</p>
          <p className="text-sm text-emerald-700 mt-1">
            Billed {status.pro.billing_interval === 'year' ? 'yearly' : 'monthly'}
            {status.pro.current_period_end && ` · renews ${new Date(status.pro.current_period_end).toLocaleDateString()}`}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {PLANS.map((plan) => (
            <div key={plan.interval} className="rounded-2xl border border-ink-900/8 bg-white p-6 shadow-card text-center flex flex-col">
              <div className="text-4xl mb-2">⭐</div>
              <p className="text-sm font-semibold uppercase tracking-wide text-ink-700/50">{plan.label}</p>
              <p className="font-display text-3xl mt-1">
                {plan.price}
                <span className="text-base text-ink-700/60">{plan.suffix}</span>
              </p>
              {plan.badge && (
                <span className="mt-1 inline-block self-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  {plan.badge}
                </span>
              )}
              <ul className="mt-4 space-y-1.5 text-sm text-ink-700/80 text-left flex-1">
                <li>✓ Priority placement over non-priority providers</li>
                <li>✓ Pro badge on your profile</li>
                <li>✓ Provider analytics</li>
                <li>✓ Enhanced profile presentation</li>
              </ul>
              <button
                disabled={busyInterval !== null}
                onClick={() => subscribe(plan.interval)}
                className="mt-4 w-full rounded-full bg-ink-900 py-2.5 font-semibold text-white hover:bg-ink-800 disabled:opacity-60"
              >
                {busyInterval === plan.interval ? 'Redirecting…' : `Choose ${plan.label}`}
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      <p className="text-xs text-ink-700/50 text-center">
        Subscribing is entirely optional — your account, profile, and services stay active whether or not you subscribe.
      </p>
    </div>
  );
}
