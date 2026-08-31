import { useEffect, useState } from 'react';
import api from '../../api/client.js';

const TABS = ['Analytics', 'Users', 'Providers', 'Categories', 'Jobs', 'Payments', 'Disputes', 'Reviews', 'Pro & Boost'];

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
      {tab === 'Jobs' && <JobsTab />}
      {tab === 'Payments' && <PaymentsTab />}
      {tab === 'Disputes' && <DisputesTab />}
      {tab === 'Reviews' && <ReviewsTab />}
      {tab === 'Pro & Boost' && <SubscriptionsTab />}
    </div>
  );
}

function Card({ children }) {
  return <div className="rounded-xl border border-ink-900/8 bg-white p-4 shadow-card">{children}</div>;
}

function AnalyticsTab() {
  const [stats, setStats] = useState(null);
  useEffect(() => { api.get('/admin/analytics').then(({ data }) => setStats(data)); }, []);
  if (!stats) return null;
  const items = [
    ['Total users', stats.totalUsers], ['Total providers', stats.totalProviders], ['Active providers', stats.activeProviders],
    ['Total jobs', stats.totalJobs], ['Completed jobs', stats.completedJobs], ['Platform revenue', `$${stats.platformRevenue}`],
    ['Gross merchandise value', `$${stats.grossMerchandiseValue}`], ['Total searches', stats.totalSearches],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map(([label, value]) => (
        <Card key={label}><p className="font-display text-2xl">{value}</p><p className="text-xs text-ink-700/60 mt-1">{label}</p></Card>
      ))}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const load = () => api.get('/admin/users').then(({ data }) => setUsers(data.users));
  useEffect(() => { load(); }, []);
  const act = async (id, action) => { await api.post(`/admin/users/${id}/${action}`); load(); };
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
              ) : (
                <button onClick={() => act(u.id, 'reactivate')} className="rounded-full border border-emerald-200 px-3 py-1 text-xs text-emerald-600 hover:bg-emerald-50">Reactivate</button>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ProvidersTab() {
  const [providers, setProviders] = useState([]);
  const load = () => api.get('/admin/providers').then(({ data }) => setProviders(data.providers));
  useEffect(() => { load(); }, []);
  const act = async (id, action) => { await api.post(`/admin/providers/${id}/${action}`); load(); };
  return (
    <div className="space-y-2">
      {providers.map((p) => (
        <Card key={p.id}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{p.business_name || p.display_name} {p.verified && '✓'}</p>
              <p className="text-xs text-ink-700/60">{p.email} · {p.status} · rating {p.rating_avg}</p>
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
      ))}
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
        <div className="space-y-2">{data.pro.map((s) => <Card key={s.id}><span className="text-sm">{s.status} · renews {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : '—'}</span></Card>)}</div>
      </div>
      <div>
        <h3 className="font-medium mb-2">Boosts</h3>
        <div className="space-y-2">{data.boost.map((s) => <Card key={s.id}><span className="text-sm">{s.status} · renews {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : '—'}</span></Card>)}</div>
      </div>
    </div>
  );
}
