import { useEffect, useState } from 'react';
import api from '../../api/client.js';

const TABS = ['Analytics', 'Users', 'Providers', 'Categories', 'Category Demand', 'Jobs', 'Payments', 'Disputes', 'Support', 'Reviews', 'Pro & Boost'];

export default function AdminPage() {
  const [tab, setTab] = useState('Analytics');

  return (
    <div>
      <h1 className="font-display text-2xl mb-4">Admin</h1>
      <div className="flex gap-1 mb-5 overflow-x-auto scrollbar-thin">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium ${tab === t ? 'bg-ink-900 text-white' : 'bg-white border border-ink-900/10 hover:bg-ink-900/5'}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Analytics' && <AnalyticsTab />}
      {tab === 'Users' && <UsersTab />}
      {tab === 'Providers' && <ProvidersTab />}
      {tab === 'Categories' && <CategoriesTab />}
      {tab === 'Category Demand' && <CategoryDemandTab />}
      {tab === 'Jobs' && <JobsTab />}
      {tab === 'Payments' && <PaymentsTab />}
      {tab === 'Disputes' && <DisputesTab />}
      {tab === 'Support' && <SupportTab />}
      {tab === 'Reviews' && <ReviewsTab />}
      {tab === 'Pro & Boost' && <SubscriptionsTab />}
    </div>
  );
}

function Card({ children }) {
  return <div className="rounded-xl border border-ink-900/8 bg-white p-4 shadow-card">{children}</div>;
}

function money(n) {
  return `$${Number(n).toFixed(2)}`;
}

function AnalyticsTab() {
  const [stats, setStats] = useState(null);
  const [granularity, setGranularity] = useState('day');
  useEffect(() => {
    api.get('/admin/analytics', { params: { granularity } }).then(({ data }) => setStats(data));
  }, [granularity]);
  if (!stats) return null;
  const items = [
    ['Total users', stats.totalUsers], ['Total providers', stats.totalProviders], ['Active providers', stats.activeProviders],
    ['Total jobs', stats.totalJobs], ['Completed jobs', stats.completedJobs], ['Total revenue (all sources)', money(stats.revenueBreakdown.total)],
    ['Gross merchandise value', money(stats.grossMerchandiseValue)], ['Total searches', stats.totalSearches],
  ];
  const rb = stats.revenueBreakdown;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map(([label, value]) => (
          <Card key={label}><p className="font-display text-2xl">{value}</p><p className="text-xs text-ink-700/60 mt-1">{label}</p></Card>
        ))}
      </div>

      <div>
        <h3 className="font-medium mb-2">What Taskora actually keeps, by source (lifetime)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><p className="font-display text-xl">{money(rb.platformCommission)}</p><p className="text-xs text-ink-700/60 mt-1">Platform commission (10% job fee)</p></Card>
          <Card><p className="font-display text-xl">{money(rb.proMonthly)}</p><p className="text-xs text-ink-700/60 mt-1">Pro subscriptions — monthly</p></Card>
          <Card><p className="font-display text-xl">{money(rb.proYearly)}</p><p className="text-xs text-ink-700/60 mt-1">Pro subscriptions — yearly</p></Card>
          <Card><p className="font-display text-xl">{money(rb.boost)}</p><p className="text-xs text-ink-700/60 mt-1">Boost subscriptions</p></Card>
        </div>
        <p className="text-xs text-ink-700/50 mt-2">
          Job-commission revenue is a complete historical record. Subscription/Boost revenue is recorded as it happens going
          forward (from each Stripe renewal) and has no pre-existing history to backfill from.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium">Revenue over time</h3>
          <div className="flex gap-1">
            {['day', 'month'].map((g) => (
              <button key={g} onClick={() => setGranularity(g)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${granularity === g ? 'bg-ink-900 text-white' : 'bg-white border border-ink-900/10 hover:bg-ink-900/5'}`}>
                By {g}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border border-ink-900/8 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-900/8 text-left text-ink-700/60">
                <th className="p-2">{granularity === 'month' ? 'Month' : 'Day'}</th>
                <th className="p-2">Commission</th>
                <th className="p-2">Pro monthly</th>
                <th className="p-2">Pro yearly</th>
                <th className="p-2">Boost</th>
                <th className="p-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {stats.revenueSeries.slice().reverse().map((p) => (
                <tr key={p.period} className="border-b border-ink-900/5 last:border-0">
                  <td className="p-2">{p.period}</td>
                  <td className="p-2">{money(p.commission)}</td>
                  <td className="p-2">{money(p.pro_monthly)}</td>
                  <td className="p-2">{money(p.pro_yearly)}</td>
                  <td className="p-2">{money(p.boost)}</td>
                  <td className="p-2 font-semibold">{money(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const load = () => api.get('/admin/users').then(({ data }) => setUsers(data.users));
  useEffect(() => { load(); }, []);
  const act = async (id, action) => { await api.post(`/admin/users/${id}/${action}`); load(); };
  const remove = async (u) => {
    if (!confirm(`Permanently delete ${u.first_name} ${u.last_name} (${u.email})? This cannot be undone.`)) return;
    await api.delete(`/admin/users/${u.id}`);
    load();
  };
  return (
    <div className="space-y-2">
      {users.map((u) => (
        <Card key={u.id}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{u.first_name} {u.last_name} <span className="text-xs text-ink-700/50">({u.email})</span></p>
              <p className="text-xs text-ink-700/60">{u.role} · {u.status} · mode: {u.current_mode}</p>
            </div>
            <div className="flex gap-2">
              {u.status === 'active' ? (
                <button onClick={() => act(u.id, 'suspend')} className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50">Suspend</button>
              ) : u.status === 'suspended' ? (
                <button onClick={() => act(u.id, 'reactivate')} className="rounded-full border border-emerald-200 px-3 py-1 text-xs text-emerald-600 hover:bg-emerald-50">Reactivate</button>
              ) : null}
              {u.status !== 'deleted' && u.role !== 'admin' && (
                <button onClick={() => remove(u)} className="rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">Delete</button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

const TIER_BADGE = {
  priority: { label: 'Priority (Pro)', className: 'bg-ink-900 text-white' },
  free_distribution: { label: 'Free distribution', className: 'bg-sky-100 text-sky-700' },
  non_priority: { label: 'Non-priority', className: 'bg-ink-900/10 text-ink-700/60' },
};

function ProvidersTab() {
  const [providers, setProviders] = useState([]);
  const load = () => api.get('/admin/providers').then(({ data }) => setProviders(data.providers));
  useEffect(() => { load(); }, []);
  const act = async (id, action) => { await api.post(`/admin/providers/${id}/${action}`); load(); };
  return (
    <div className="space-y-2">
      {providers.map((p) => {
        const badge = TIER_BADGE[p.tier] || TIER_BADGE.non_priority;
        return (
          <Card key={p.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{p.business_name || p.display_name} {p.verified && '✓'}</p>
                <p className="text-xs text-ink-700/60">{p.email} · {p.status} · rating {p.rating_avg}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
                  {p.tier === 'free_distribution' && p.freeDistributionEndsAt && (
                    <span className="text-[11px] text-ink-700/50">until {new Date(p.freeDistributionEndsAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {!p.verified && <button onClick={() => act(p.id, 'verify')} className="rounded-full border border-ink-900/15 px-3 py-1 text-xs hover:bg-ink-900/5">Verify</button>}
                {p.status !== 'suspended' ? (
                  <button onClick={() => act(p.id, 'suspend')} className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50">Suspend</button>
                ) : (
                  <button onClick={() => act(p.id, 'reactivate')} className="rounded-full border border-emerald-200 px-3 py-1 text-xs text-emerald-600 hover:bg-emerald-50">Reactivate</button>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function CategoriesTab() {
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState('');
  const load = () => api.get('/admin/categories').then(({ data }) => setCategories(data.categories));
  useEffect(() => { load(); }, []);
  const add = async (e) => { e.preventDefault(); if (!name.trim()) return; await api.post('/admin/categories', { name }); setName(''); load(); };
  const toggle = async (c) => { await api.patch(`/admin/categories/${c.id}`, { isActive: !c.is_active }); load(); };
  return (
    <div className="space-y-3">
      <form onSubmit={add} className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" className="rounded-lg border border-ink-900/15 px-3 py-1.5 text-sm" />
        <button className="rounded-lg bg-ember-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-ember-600">Add</button>
      </form>
      <div className="space-y-1.5">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-lg border border-ink-900/8 bg-white px-3 py-2 text-sm">
            <span>{c.icon} {c.name}</span>
            <button onClick={() => toggle(c)} className={`rounded-full px-3 py-0.5 text-xs ${c.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-900/10 text-ink-700/60'}`}>
              {c.is_active ? 'Active' : 'Inactive'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function JobsTab() {
  const [jobs, setJobs] = useState([]);
  useEffect(() => { api.get('/admin/jobs').then(({ data }) => setJobs(data.jobs)); }, []);
  return (
    <div className="space-y-2">
      {jobs.map((j) => (
        <Card key={j.id}>
          <div className="flex justify-between text-sm">
            <span>{j.customer_email} → {j.provider_name}</span>
            <span className="font-medium">${j.price} · {j.status}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

function PaymentsTab() {
  const [payments, setPayments] = useState([]);
  useEffect(() => { api.get('/admin/payments').then(({ data }) => setPayments(data.payments)); }, []);
  return (
    <div className="space-y-2">
      {payments.map((p) => (
        <Card key={p.id}>
          <div className="flex justify-between text-sm">
            <span>${p.amount_total} (fee ${p.platform_fee})</span>
            <span>{p.status} · payout: {p.payout_status}</span>
          </div>
        </Card>
      ))}
    </div>
  );
}

function DisputesTab() {
  const [disputes, setDisputes] = useState([]);
  const load = () => api.get('/admin/disputes').then(({ data }) => setDisputes(data.disputes));
  useEffect(() => { load(); }, []);
  const resolve = async (id, resolution) => {
    const notes = prompt('Resolution notes (optional):') || '';
    await api.post(`/admin/disputes/${id}/resolve`, { resolution, notes });
    load();
  };
  return (
    <div className="space-y-2">
      {disputes.length === 0 && <p className="text-sm text-ink-700/60">No disputes.</p>}
      {disputes.map((d) => (
        <Card key={d.id}>
          <p className="text-sm font-medium">{d.reason.replace('_', ' ')} — {d.status}</p>
          <p className="text-xs text-ink-700/60 mt-1">
            <span className="font-semibold">{d.reporter_first_name} {d.reporter_last_name}</span> ({d.reporter_email}) reported this job
            <span className="font-semibold"> as a {d.reporter_role}</span>
            {d.reportee_first_name && (
              <>
                {' '}against <span className="font-semibold">{d.reportee_first_name} {d.reportee_last_name}</span> ({d.reportee_email}),
                <span className="font-semibold"> acting as the {d.reportee_role}</span> on this job
              </>
            )}
            {' '}· job: {d.service_description}
          </p>
          {d.description && <p className="text-sm text-ink-700/70 mt-1">{d.description}</p>}
          {d.status === 'open' && (
            <div className="mt-2 flex gap-2">
              <button onClick={() => resolve(d.id, 'resolved_refund')} className="rounded-full border border-ink-900/15 px-3 py-1 text-xs hover:bg-ink-900/5">Resolve: Refund</button>
              <button onClick={() => resolve(d.id, 'resolved_no_refund')} className="rounded-full border border-ink-900/15 px-3 py-1 text-xs hover:bg-ink-900/5">Resolve: No refund</button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// General "Contact Taskora" support inbox -- separate from Disputes above,
// which are job-scoped reports. Every logged-in user (customer or provider
// mode) can message here at any time; this is where those land.
function SupportTab() {
  const [threads, setThreads] = useState([]);
  const [activeUserId, setActiveUserId] = useState(null);
  const [thread, setThread] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const loadThreads = () => api.get('/admin/support/threads').then(({ data }) => setThreads(data.threads));
  useEffect(() => { loadThreads(); }, []);

  const openThread = async (userId) => {
    setActiveUserId(userId);
    const { data } = await api.get(`/admin/support/threads/${userId}`);
    setThread(data);
  };

  const sendReply = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api.post(`/admin/support/threads/${activeUserId}/reply`, { body: reply });
      setReply('');
      await openThread(activeUserId);
      await loadThreads();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid sm:grid-cols-3 gap-4">
      <div className="space-y-2">
        {threads.length === 0 && <p className="text-sm text-ink-700/60">No support messages yet.</p>}
        {threads.map((t) => (
          <button
            key={t.user_id}
            onClick={() => openThread(t.user_id)}
            className={`w-full text-left rounded-xl border p-3 text-sm ${activeUserId === t.user_id ? 'border-ink-900 bg-ink-900/5' : 'border-ink-900/8 bg-white hover:bg-ink-900/5'}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{t.first_name} {t.last_name}</span>
              {t.unread_count > 0 && <span className="rounded-full bg-ember-500 px-1.5 text-[10px] font-bold text-white">{t.unread_count}</span>}
            </div>
            <p className="text-xs text-ink-700/60 truncate">{t.last_message}</p>
          </button>
        ))}
      </div>
      <div className="sm:col-span-2">
        {!thread && <p className="text-sm text-ink-700/60">Select a conversation.</p>}
        {thread && (
          <div className="space-y-3">
            <p className="text-sm font-medium">{thread.user.first_name} {thread.user.last_name} <span className="text-xs text-ink-700/50">({thread.user.email})</span></p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {thread.messages.map((m) => (
                <div key={m.id} className={`rounded-xl p-3 text-sm max-w-[80%] ${m.sender === 'admin' ? 'ml-auto bg-ink-900 text-white' : 'bg-white border border-ink-900/8'}`}>
                  {m.body}
                </div>
              ))}
            </div>
            <form onSubmit={sendReply} className="flex gap-2">
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply…" className="flex-1 rounded-lg border border-ink-900/15 px-3 py-2 text-sm" />
              <button disabled={sending} className="rounded-lg bg-ember-500 px-4 py-2 text-sm font-semibold text-white hover:bg-ember-600 disabled:opacity-60">Send</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewsTab() {
  const [reviews, setReviews] = useState([]);
  const load = () => api.get('/admin/reviews').then(({ data }) => setReviews(data.reviews));
  useEffect(() => { load(); }, []);
  const hide = async (id) => { await api.post(`/admin/reviews/${id}/hide`); load(); };
  return (
    <div className="space-y-2">
      {reviews.map((r) => (
        <Card key={r.id}>
          <div className="flex justify-between text-sm">
            <span>{'★'.repeat(r.rating)} {r.comment}</span>
            {!r.is_hidden && <button onClick={() => hide(r.id)} className="text-xs text-red-600 hover:underline">Hide</button>}
          </div>
        </Card>
      ))}
    </div>
  );
}

function SubscriptionsTab() {
  const [data, setData] = useState({ pro: [], boost: [] });
  useEffect(() => { api.get('/admin/subscriptions').then(({ data }) => setData(data)); }, []);
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div>
        <h3 className="font-medium mb-2">Pro subscriptions</h3>
        <div className="space-y-2">
          {data.pro.map((s) => (
            <Card key={s.id}>
              <p className="text-sm font-medium">{s.provider_name}</p>
              <span className="text-xs text-ink-700/60">
                {s.status} · {s.billing_interval === 'year' ? 'yearly' : 'monthly'} · renews {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : '—'}
              </span>
            </Card>
          ))}
          {data.pro.length === 0 && <p className="text-sm text-ink-700/60">No Pro subscriptions yet.</p>}
        </div>
      </div>
      <div>
        <h3 className="font-medium mb-2">Boosts</h3>
        <div className="space-y-2">
          {data.boost.map((s) => (
            <Card key={s.id}>
              <p className="text-sm font-medium">{s.provider_name}</p>
              <span className="text-xs text-ink-700/60">{s.status} · renews {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : '—'}</span>
            </Card>
          ))}
          {data.boost.length === 0 && <p className="text-sm text-ink-700/60">No Boosts yet.</p>}
        </div>
      </div>
    </div>
  );
}

function CategoryDemandTab() {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get('/admin/category-demand').then(({ data }) => setCities(data.cities)).finally(() => setLoading(false));
  }, []);
  if (loading) return <p className="text-sm text-ink-700/60">Loading…</p>;
  if (cities.length === 0) {
    return <p className="text-sm text-ink-700/60">No search demand recorded yet in the last 30 days — this fills in as customers search by category.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-700/50">
        Real category search volume per city, rolling 30-day window — the same data that drives each city's "Trending" categories on the home page.
      </p>
      {cities.map((c) => (
        <Card key={c.city}>
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium">{c.city}</p>
            <span className="text-xs text-ink-700/50">{c.totalSearches} searches</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.categories.map((cat) => (
              <span key={cat.categoryId} className="rounded-full bg-ink-900/5 px-2.5 py-1 text-xs">
                {cat.name} <span className="text-ink-700/50">· {cat.searchCount}</span>
              </span>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
