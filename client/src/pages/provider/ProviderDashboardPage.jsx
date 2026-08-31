import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StarRating from '../../components/StarRating.jsx';
import Spinner from '../../components/Spinner.jsx';

export default function ProviderDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [views, setViews] = useState(null);

  useEffect(() => {
    if (!user.provider_id) return;
    api.get('/providers/me').then(({ data }) => setData(data));
    api.get('/providers/me/analytics/views').then(({ data }) => setViews(data.views));
  }, [user.provider_id]);

  if (!user.provider_id) {
    return (
      <div className="mx-auto max-w-md text-center py-16">
        <div className="text-5xl mb-4">🧰</div>
        <h1 className="font-display text-2xl mb-2">Set up your provider profile</h1>
        <p className="text-ink-700/70 mb-6">Choose your categories, add a few details, and you can be live in minutes.</p>
        <Link to="/provider/onboarding" className="rounded-full bg-ember-500 px-6 py-2.5 font-semibold text-white hover:bg-ember-600">
          Start Setup
        </Link>
      </div>
    );
  }

  if (!data) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;
  const { provider } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl">{provider.business_name || provider.display_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <StarRating rating={Number(provider.rating_avg)} count={provider.rating_count} />
            <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${provider.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-900/10 text-ink-700/60'}`}>
              {provider.status}
            </span>
          </div>
        </div>
        {provider.status !== 'active' ? (
          <Link to="/provider/onboarding" className="rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-white hover:bg-ember-600">
            Finish Setup
          </Link>
        ) : (
          <button
            onClick={async () => { await api.post('/providers/me/pause'); location.reload(); }}
            className="rounded-full border border-ink-900/15 px-4 py-2 text-sm hover:bg-ink-900/5"
          >
            Pause Profile
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Profile completeness" value={`${provider.profile_completeness}%`} />
        <StatCard label="Completed jobs" value={provider.completed_jobs_count} />
        <StatCard label="Views today" value={views?.today ?? '—'} />
        <StatCard label="Views this month" value={views?.this_month ?? '—'} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <QuickLink to="/provider/inbox" icon="💬" label="Inbox" hint="Reply to customers and quote requests" />
        <QuickLink to="/provider/jobs" icon="🧾" label="Jobs" hint="Manage active and past jobs" />
        <QuickLink to="/provider/earnings" icon="💰" label="Earnings" hint="Track payouts and set up Stripe" />
        <QuickLink to="/provider/services" icon="🛠️" label="Services" hint="Edit categories, services, and photos" />
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-ink-900/8 bg-white p-4 shadow-card text-center">
      <p className="font-display text-2xl">{value}</p>
      <p className="text-xs text-ink-700/60 mt-1">{label}</p>
    </div>
  );
}

function QuickLink({ to, icon, label, hint }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-xl border border-ink-900/8 bg-white p-4 shadow-card hover:border-ember-300">
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-ink-700/60">{hint}</p>
      </div>
    </Link>
  );
}
