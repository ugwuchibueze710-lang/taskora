import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StarRating from '../../components/StarRating.jsx';
import Spinner from '../../components/Spinner.jsx';
import SafeImage from '../../components/SafeImage.jsx';

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 182;

export default function ProviderDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [views, setViews] = useState(null);
  const [subStatus, setSubStatus] = useState(null);

  useEffect(() => {
    if (!user.provider_id) return;
    api.get('/providers/me').then(({ data }) => setData(data));
    api.get('/providers/me/analytics/views').then(({ data }) => setViews(data.views));
    api.get('/subscriptions/status').then(({ data }) => setSubStatus(data)).catch(() => {});
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
  const isPro = subStatus?.pro?.status === 'active';
  const publishedAt = provider.published_at ? new Date(provider.published_at) : null;
  const freeWindowEndsAt = publishedAt ? new Date(publishedAt.getTime() + SIX_MONTHS_MS) : null;
  const inFreeWindow = freeWindowEndsAt ? Date.now() < freeWindowEndsAt.getTime() : false;

  const missingLocation = provider.base_lat == null || provider.base_lng == null;

  return (
    <div className="space-y-6">
      <AdminSetupBanner />
      {missingLocation && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-red-800">⚠️ No service area location set</p>
            <p className="text-xs text-red-700 mt-0.5">
              Customers only see providers within their search radius, and search can't place you without a real
              location on file — right now you don't show up in any location-based search, no matter how close a
              customer is.
            </p>
          </div>
          <Link to="/provider/availability" className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 whitespace-nowrap">
            Set my location
          </Link>
        </div>
      )}
      {!isPro && subStatus && (
        inFreeWindow ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-sky-800">🎉 Free priority distribution is active</p>
              <p className="text-xs text-sky-700 mt-0.5">
                New providers get 6 months of full algorithmic distribution, no charge. Yours runs until{' '}
                {freeWindowEndsAt.toLocaleDateString()}. Upgrade to Pro anytime to keep priority placement after that.
              </p>
            </div>
            <Link to="/provider/pro" className="rounded-full border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 whitespace-nowrap">
              Learn about Pro
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-amber-800">Your free distribution period has ended</p>
              <p className="text-xs text-amber-700 mt-0.5">
                You're still fully active and searchable, but you now rank as a non-priority provider. Subscribe to Taskora
                Pro for priority placement above non-priority providers in relevant searches.
              </p>
            </div>
            <Link to="/provider/pro" className="rounded-full bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-800 whitespace-nowrap">
              Upgrade to Pro
            </Link>
          </div>
        )
      )}
      {isPro && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-2">
          <span className="text-lg">⭐</span>
          <p className="text-sm font-semibold text-emerald-800">
            Taskora Pro is active — you have priority placement in relevant searches.
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-ink-900/8 bg-white p-5 shadow-card">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex gap-4">
            {/* Same profile picture, same fallback letter, as the public
                storefront (ProviderProfilePage) -- this is exactly what
                customers see, not a separate dashboard-only image. */}
            <div className="h-16 w-16 sm:h-20 sm:w-20 flex-shrink-0 overflow-hidden rounded-2xl bg-ember-100 flex items-center justify-center text-2xl font-display text-ember-600">
              <SafeImage src={provider.image_url} className="h-full w-full object-cover" fallback={(provider.business_name || provider.display_name)?.[0]?.toUpperCase() || '?'} />
            </div>
            <div>
              <h1 className="font-display text-2xl">{provider.business_name || provider.display_name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <StarRating rating={Number(provider.rating_avg)} count={provider.rating_count} />
                <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${provider.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-900/10 text-ink-700/60'}`}>
                  {provider.status}
                </span>
              </div>
              {/* Same description customers see on the storefront -- full
                  text, not truncated, straight from provider.description. */}
              {provider.description && <p className="mt-2 text-sm text-ink-700/70 max-w-xl">{provider.description}</p>}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <Link to="/provider/services" className="rounded-full border border-ink-900/15 px-4 py-2 text-sm font-semibold hover:bg-ink-900/5 whitespace-nowrap">
              Edit Profile
            </Link>
            {provider.status !== 'active' ? (
              <Link to="/provider/onboarding" className="rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-white hover:bg-ember-600 whitespace-nowrap">
                Finish Setup
              </Link>
            ) : (
              <button
                onClick={async () => { await api.post('/providers/me/pause'); location.reload(); }}
                className="rounded-full border border-ink-900/15 px-4 py-2 text-sm hover:bg-ink-900/5 whitespace-nowrap"
              >
                Pause Profile
              </button>
            )}
          </div>
        </div>
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

// Live "mm:ss" (or "Hh MMm" once over an hour) countdown to a future
// timestamp. Ticks locally every second rather than re-fetching the grant
// just to update a clock -- the banner still polls for the real status
// change (approved/declined/expired) separately.
function useCountdown(targetIso) {
  const [msLeft, setMsLeft] = useState(() => (targetIso ? new Date(targetIso).getTime() - Date.now() : 0));
  useEffect(() => {
    if (!targetIso) return;
    const target = new Date(targetIso).getTime();
    const tick = () => setMsLeft(Math.max(0, target - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  if (!targetIso) return '';
  const totalSeconds = Math.floor(msLeft / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// A Taskora admin can ask to finish this provider's setup for them -- but
// nothing actually happens until the provider approves it right here. This
// banner is the whole of that consent step: it polls for a live request,
// shows who's asking and how long they have to answer, and lets the
// provider approve, decline, or (once approved) cut off access early.
function AdminSetupBanner() {
  const [grant, setGrant] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.get('/providers/me/edit-requests').then(({ data }) => {
        if (!cancelled) setGrant(data.grant);
      }).catch(() => {});
    };
    load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const requestCountdown = useCountdown(grant?.status === 'pending' ? grant.request_expires_at : null);
  const accessCountdown = useCountdown(grant?.status === 'approved' ? grant.access_expires_at : null);

  if (!grant) return null;

  const adminName = [grant.admin_first_name, grant.admin_last_name].filter(Boolean).join(' ') || 'A Taskora admin';

  const respond = async (action) => {
    setBusy(true);
    try {
      const { data } = await api.post(`/providers/me/edit-requests/${grant.id}/${action}`);
      setGrant(data.grant ?? null);
    } finally {
      setBusy(false);
    }
  };

  if (grant.status === 'pending') {
    return (
      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-violet-900">🔐 {adminName} wants to help finish your profile setup</p>
          <p className="text-xs text-violet-700 mt-0.5">
            Approving gives them a time-boxed window to edit your business info, categories, services, location, and
            photos on your behalf — everything updates on your dashboard as they go. This request expires in{' '}
            {requestCountdown} if you don't respond.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={() => respond('decline')}
            className="rounded-full border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60 whitespace-nowrap"
          >
            Decline
          </button>
          <button
            disabled={busy}
            onClick={() => respond('approve')}
            className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60 whitespace-nowrap"
          >
            Approve
          </button>
        </div>
      </div>
    );
  }

  if (grant.status === 'approved') {
    return (
      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-violet-900">🔐 {adminName} is currently editing your setup</p>
          <p className="text-xs text-violet-700 mt-0.5">
            Their access closes automatically in {accessCountdown}. You can end it sooner at any time.
          </p>
        </div>
        <button
          disabled={busy}
          onClick={() => respond('revoke')}
          className="rounded-full border border-violet-300 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60 whitespace-nowrap"
        >
          Revoke access
        </button>
      </div>
    );
  }

  return null;
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
