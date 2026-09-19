import { useEffect, useState } from 'react';
import api from '../../api/client.js';
import ProviderLocationPicker from '../../components/ProviderLocationPicker.jsx';

const TABS = ['Analytics', 'Agency', 'Users', 'Providers', 'Categories', 'Category Demand', 'Jobs', 'Payments', 'Disputes', 'Support', 'Reviews', 'Pro & Boost'];

export default function AdminPage() {
  const [tab, setTab] = useState('Analytics');
  // Polled independently of the Agency tab itself so the badge shows up
  // ("every fix will be notified there") even while an admin is sitting on
  // a different tab, not just after they click into Agency.
  const [agencyCounts, setAgencyCounts] = useState(null);
  useEffect(() => {
    const load = () => api.get('/admin/agency/counts').then(({ data }) => setAgencyCounts(data)).catch(() => {});
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  // "Reply in Support" on an Agency escalation switches to the Support tab
  // and opens that user's thread directly, instead of making the admin find
  // it again in the list themselves.
  const [supportUserToOpen, setSupportUserToOpen] = useState(null);
  const openSupportThread = (userId) => {
    setSupportUserToOpen(userId);
    setTab('Support');
  };

  return (
    <div>
      <h1 className="font-display text-2xl mb-4">Admin</h1>
      <div className="flex gap-1 mb-5 overflow-x-auto scrollbar-thin">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`relative whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium ${tab === t ? 'bg-ink-900 text-white' : 'bg-white border border-ink-900/10 hover:bg-ink-900/5'}`}>
            {t}
            {t === 'Agency' && agencyCounts?.openTotal > 0 && (
              <span className="ml-1.5 rounded-full bg-ember-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{agencyCounts.openTotal}</span>
            )}
          </button>
        ))}
      </div>
      {tab === 'Analytics' && <AnalyticsTab />}
      {tab === 'Agency' && <AgencyTab onOpenSupport={openSupportThread} />}
      {tab === 'Users' && <UsersTab />}
      {tab === 'Providers' && <ProvidersTab />}
      {tab === 'Categories' && <CategoriesTab />}
      {tab === 'Category Demand' && <CategoryDemandTab />}
      {tab === 'Jobs' && <JobsTab />}
      {tab === 'Payments' && <PaymentsTab />}
      {tab === 'Disputes' && <DisputesTab />}
      {tab === 'Support' && <SupportTab openUserId={supportUserToOpen} onOpened={() => setSupportUserToOpen(null)} />}
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

function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg bg-ink-900/[0.03] p-2">
      <p className="font-display text-base">{value}</p>
      <p className="text-[11px] text-ink-700/50">{label}</p>
    </div>
  );
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
          <Card><p className="font-display text-xl">{money(rb.platformCommission)}</p><p className="text-xs text-ink-700/60 mt-1">Platform commission (job fee)</p></Card>
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

const SEVERITY_BADGE = {
  info: 'bg-sky-100 text-sky-700',
  warning: 'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
};

const KIND_LABEL = {
  support_auto_reply: 'Auto-handled support message',
  support_escalation: 'Support message needs you',
  error_diagnosis: 'Server error',
  action_suggestion: 'Suggested action',
};

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// The "Agency window" -- every fix the support/error agents made on their
// own, every one-click approval they're waiting on, and every problem they
// couldn't handle themselves shows up here, with a ready-to-paste prompt for
// the software engineer (you) on anything that needs real code work. See
// server/src/services/agency.service.js for the full design rationale.
function AgencyTab({ onOpenSupport }) {
  const [items, setItems] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [enabled, setEnabled] = useState(null);
  const [toggling, setToggling] = useState(false);

  const load = () => api.get('/admin/agency/items').then(({ data }) => setItems(data.items));
  useEffect(() => {
    load();
    api.get('/admin/agency/settings').then(({ data }) => setEnabled(data.enabled));
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, []);

  const toggle = async () => {
    setToggling(true);
    try {
      const { data } = await api.post('/admin/agency/settings', { enabled: !enabled });
      setEnabled(data.enabled);
    } finally {
      setToggling(false);
    }
  };

  const act = async (id, action) => {
    setBusyId(id);
    try {
      await api.post(`/admin/agency/items/${id}/${action}`);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const diagnose = async (id) => {
    setBusyId(id);
    try {
      await api.post(`/admin/agency/items/${id}/diagnose`);
      await load();
      setExpandedId(id);
    } finally {
      setBusyId(null);
    }
  };

  const copyPrompt = async (item) => {
    try {
      await navigator.clipboard.writeText(item.engineer_prompt);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setExpandedId(item.id); // clipboard blocked -- at least reveal the text to select manually
    }
  };

  if (!items) return <p className="text-sm text-ink-700/60">Loading…</p>;

  const needsApproval = items.filter((i) => i.status === 'open' && i.proposed_action);
  const needsReply = items.filter((i) => i.status === 'open' && i.kind === 'support_escalation' && !i.proposed_action);
  const needsEngineer = items.filter((i) => i.status === 'open' && i.engineer_prompt && !i.proposed_action);
  const handled = items.filter((i) => i.status !== 'open').slice(0, 30);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-sm">Agency system {enabled === null ? '' : enabled ? 'is running' : 'is paused'}</p>
            <p className="text-xs text-ink-700/50 mt-0.5">
              {enabled
                ? 'Watching support messages and server errors right now — this uses your Groq quota.'
                : 'Turned off — no AI calls are being made. Support messages and errors just wait for you, like before.'}
            </p>
          </div>
          <AgencyToggle checked={!!enabled} disabled={enabled === null || toggling} onChange={toggle} />
        </div>
      </Card>

      <p className="text-xs text-ink-700/50">
        Everything the support and error-monitoring agents noticed, handled on their own, or need you for. Support auto-replies
        only ever answer stock questions; anything about a specific account, job, or payment always lands here for a human.
        Code-level fixes are always drafted for you, never applied automatically — this app's server has no ability to push
        code changes to itself.
      </p>

      <AgencySection title="Needs your approval" emptyText="Nothing waiting on a one-click approval right now.">
        {needsApproval.map((item) => (
          <Card key={item.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-sm">{item.title}</p>
                {item.summary && <p className="text-xs text-ink-700/60 mt-0.5">{item.summary}</p>}
                <p className="text-[11px] text-ink-700/40 mt-1">{timeAgo(item.created_at)} · proposed: {item.proposed_action.actionType}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button disabled={busyId === item.id} onClick={() => act(item.id, 'approve')}
                  className="rounded-full border border-emerald-200 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">Approve</button>
                <button disabled={busyId === item.id} onClick={() => act(item.id, 'reject')}
                  className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">Reject</button>
              </div>
            </div>
          </Card>
        ))}
      </AgencySection>

      <AgencySection title="Needs a human reply" emptyText="No support messages waiting on a person right now.">
        {needsReply.map((item) => (
          <Card key={item.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-sm">{item.title}</p>
                {item.detail?.question && <p className="text-xs text-ink-700/70 mt-1 italic">"{item.detail.question}"</p>}
                {item.summary && <p className="text-xs text-ink-700/50 mt-0.5">{item.summary}</p>}
                <p className="text-[11px] text-ink-700/40 mt-1">{timeAgo(item.created_at)}{item.related_user_email && ` · ${item.first_name} ${item.last_name} (${item.related_user_email})`}</p>
              </div>
              <div className="flex flex-col gap-2 shrink-0 items-end">
                <button onClick={() => onOpenSupport(item.related_user_id)}
                  className="rounded-full bg-ink-900 px-3 py-1 text-xs font-semibold text-white hover:bg-ink-800">Reply in Support</button>
                <button disabled={busyId === item.id} onClick={() => act(item.id, 'dismiss')} className="text-[11px] text-ink-700/40 hover:underline">Dismiss</button>
              </div>            </div>
          </Card>
        ))}
      </AgencySection>

      <AgencySection title="Needs the engineer (you)" emptyText="Nothing waiting on you right now.">
        {needsEngineer.map((item) => (
          <Card key={item.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SEVERITY_BADGE[item.severity] || SEVERITY_BADGE.info}`}>{item.severity}</span>
                  <span className="text-[11px] text-ink-700/40">{KIND_LABEL[item.kind] || item.kind}</span>
                  {item.occurrence_count > 1 && <span className="text-[11px] text-ink-700/40">· happened {item.occurrence_count}×</span>}
                </div>
                <p className="font-medium text-sm mt-1">{item.title}</p>
                {item.summary && <p className="text-xs text-ink-700/60 mt-0.5">{item.summary}</p>}
                {item.related_user_email && <p className="text-[11px] text-ink-700/40 mt-1">{item.first_name} {item.last_name} ({item.related_user_email})</p>}
                <p className="text-[11px] text-ink-700/40 mt-1">last seen {timeAgo(item.last_seen_at)}</p>

                {expandedId === item.id && (
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-ink-900/[0.04] p-2 text-[11px] leading-relaxed max-h-72 overflow-y-auto">{item.engineer_prompt}</pre>
                )}
              </div>
              <div className="flex flex-col gap-2 shrink-0 items-end">
                <button onClick={() => setExpandedId(expandedId === item.id ? null : item.id)} className="rounded-full border border-ink-900/15 px-3 py-1 text-xs hover:bg-ink-900/5">
                  {expandedId === item.id ? 'Hide' : 'View'}
                </button>
                <button onClick={() => copyPrompt(item)} className="rounded-full bg-ink-900 px-3 py-1 text-xs font-semibold text-white hover:bg-ink-800">
                  {copiedId === item.id ? 'Copied!' : 'Copy prompt for Claude'}
                </button>
                {item.kind === 'error_diagnosis' && (
                  <button disabled={busyId === item.id} onClick={() => diagnose(item.id)} className="rounded-full border border-sky-200 px-3 py-1 text-xs text-sky-700 hover:bg-sky-50 disabled:opacity-50">
                    {busyId === item.id ? 'Thinking…' : 'Diagnose with AI'}
                  </button>
                )}
                <button disabled={busyId === item.id} onClick={() => act(item.id, 'dismiss')} className="text-[11px] text-ink-700/40 hover:underline">Dismiss</button>
              </div>
            </div>
          </Card>
        ))}
      </AgencySection>

      <AgencySection title="Recently handled" emptyText="Nothing resolved yet.">
        {handled.map((item) => (
          <Card key={item.id}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm">{item.title}</p>
                <p className="text-[11px] text-ink-700/40 mt-0.5">{KIND_LABEL[item.kind] || item.kind} · {item.status} · {timeAgo(item.resolved_at || item.created_at)}</p>
              </div>
            </div>
          </Card>
        ))}
      </AgencySection>
    </div>
  );
}

// A real switch, not a checkbox with CSS on top: track slides between two
// colors, knob glides across with a spring-ish ease, and a small dot pulses
// while running so "it's actively on" reads at a glance, not just on click.
function AgencyToggle({ checked, disabled, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-300 ease-out disabled:opacity-50
        ${checked ? 'bg-emerald-500' : 'bg-ink-900/20'}`}
    >
      <span
        className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
          ${checked ? 'translate-x-[26px]' : 'translate-x-1'}`}
      />
      {checked && (
        <span className="absolute left-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-white/80 animate-pulse" />
      )}
    </button>
  );
}

function AgencySection({ title, emptyText, children }) {
  const count = children?.length || 0;
  return (
    <div>
      <h3 className="font-medium mb-2">{title} {count > 0 && <span className="text-xs text-ink-700/40">({count})</span>}</h3>
      {count === 0 ? <p className="text-sm text-ink-700/50">{emptyText}</p> : <div className="space-y-2">{children}</div>}
    </div>
  );
}

// Live "mm:ss" (or "Hh MMm" once over an hour) countdown to a future
// timestamp. Ticks locally every second rather than re-fetching the grant
// just to update a clock -- callers still poll for the real status change
// (approved/declined/expired) separately.
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

// "Click into a provider, see their page" -- their bio, main image,
// portfolio photos, categories, and services, read straight from the
// `profile` object GET /admin/users/:id already returns. Read-only: this is
// just the view. Editing any of it is gated behind AdminEditAccessPanel below.
function ProviderFullProfile({ provider, profile }) {
  const [open, setOpen] = useState(false);
  const isEmpty = !provider.description && profile.categories.length === 0 && profile.photos.length === 0;
  return (
    <div className="rounded-xl border border-ink-900/8 bg-white p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
        <span className="text-xs font-medium text-ink-700/70">View full profile (what customers see on their page)</span>
        <span className="text-xs text-ink-700/40">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-3">
            {provider.image_url ? (
              <img src={provider.image_url} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="h-16 w-16 rounded-full bg-ink-900/10 flex items-center justify-center text-xl">🧰</div>
            )}
            <div>
              <p className="font-medium">{provider.business_name || provider.display_name}</p>
              {provider.business_phone && <p className="text-xs text-ink-700/60">{provider.business_phone}</p>}
              {provider.base_location_label && (
                <p className="text-xs text-ink-700/60">📍 {provider.base_location_label} · {provider.service_radius_miles || '—'} mi radius</p>
              )}
            </div>
          </div>
          {provider.description && <p className="text-xs text-ink-700/70 whitespace-pre-wrap">{provider.description}</p>}
          {profile.categories.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {profile.categories.map((c) => (
                <span key={c.id} className="rounded-full bg-ink-900/5 px-2.5 py-1 text-xs">{c.name}</span>
              ))}
            </div>
          )}
          {profile.services.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {profile.services.map((s) => (
                <span key={s.id} className="rounded-full border border-ink-900/10 px-2.5 py-1 text-xs text-ink-700/70">{s.name}</span>
              ))}
            </div>
          )}
          {profile.photos.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {profile.photos.map((p) => (
                <img key={p.id} src={p.url} alt="" className="aspect-square rounded-lg object-cover" />
              ))}
            </div>
          )}
          {isEmpty && <p className="text-xs text-ink-700/50">Nothing filled in yet -- this is exactly why the edit-access flow below exists.</p>}
        </div>
      )}
    </div>
  );
}

// The consent-gated "finish their setup for them" flow. Nothing here can
// touch the provider's data until the provider approves it from their own
// dashboard (server enforces this too -- assertApprovedAccess in
// admin-edit-grant.service.js is the real gate; this is just the UI for it).
// Polls for status because the provider might approve/decline at any moment
// while this admin has the panel open and is standing by.
function AdminEditAccessPanel({ provider, profile, onProfileChange }) {
  const [grant, setGrant] = useState(undefined); // undefined = still loading; null = no grant on file
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/admin/providers/${provider.id}/edit-access`).then(({ data }) => setGrant(data.grant));
  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id]);

  const requestCountdown = useCountdown(grant?.status === 'pending' ? grant.request_expires_at : null);
  const accessCountdown = useCountdown(grant?.status === 'approved' ? grant.access_expires_at : null);

  const request = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/providers/${provider.id}/edit-access/request`);
      setGrant(data.grant);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/providers/${provider.id}/edit-access/cancel`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/providers/${provider.id}/edit-access/complete`);
      await load();
      onProfileChange?.();
    } finally {
      setBusy(false);
    }
  };

  if (grant === undefined) return null;

  if (!grant || ['declined', 'expired', 'revoked', 'completed'].includes(grant.status)) {
    const pastNote = {
      declined: "They declined your last request. ",
      expired: 'Your last request expired unanswered. ',
      revoked: 'They ended your last editing session early. ',
      completed: "You finished editing their setup last time. ",
    }[grant?.status] || '';
    return (
      <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
        <p className="text-xs font-medium text-violet-900">Finish this provider's setup for them</p>
        <p className="text-[11px] text-violet-700 mt-0.5">
          {pastNote}Sends them a request to approve on their dashboard -- once they do, you get a 2-hour window to edit
          everything below on their behalf, and it updates on their side as you go.
        </p>
        <button disabled={busy} onClick={request}
          className="mt-2 rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
          {busy ? 'Sending…' : 'Request edit access'}
        </button>
      </div>
    );
  }

  if (grant.status === 'pending') {
    return (
      <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
        <p className="text-xs font-medium text-violet-900">⏳ Waiting on their approval</p>
        <p className="text-[11px] text-violet-700 mt-0.5">
          They have {requestCountdown} left to respond -- this closes automatically if they don't.
        </p>
        <button disabled={busy} onClick={cancel}
          className="mt-2 rounded-full border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60">
          Cancel request
        </button>
      </div>
    );
  }

  // approved -- standby is over, full edit surface unlocks below.
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-medium text-emerald-900">🔓 You're in -- edit access is live</p>
          <p className="text-[11px] text-emerald-700 mt-0.5">
            Closes automatically in {accessCountdown}. Everything you save below updates their dashboard right away.
          </p>
        </div>
        <button disabled={busy} onClick={complete}
          className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap">
          Done editing
        </button>
      </div>
      <ProviderEditForm provider={provider} profile={profile} onSaved={onProfileChange} />
    </div>
  );
}

const PRICING_MODES = [
  { value: 'hidden', label: 'Hidden (quote on request)' },
  { value: 'fixed', label: 'Fixed price' },
  { value: 'starting', label: 'Starting at' },
  { value: 'hourly', label: 'Hourly rate' },
];

// The actual "set up their account for them" surface -- one PATCH/PUT/POST
// per tab, each mirroring the provider's own self-service endpoint
// field-for-field (see provider.routes.js) so nothing produced here can ever
// look different from the provider doing it themselves. Every request below
// still 403s server-side the instant the grant isn't 'approved' anymore --
// this UI only ever renders while AdminEditAccessPanel says it's live.
function ProviderEditForm({ provider, profile, onSaved }) {
  const [tab, setTab] = useState('info');
  const [saved, setSaved] = useState('');
  const flashSaved = () => {
    setSaved('Saved');
    setTimeout(() => setSaved(''), 1500);
  };
  const handleSaved = () => {
    onSaved?.();
    flashSaved();
  };

  return (
    <div className="rounded-xl border border-ink-900/8 bg-white p-3">
      <div className="flex items-center gap-1 mb-3 flex-wrap">
        {['info', 'categories', 'services', 'location', 'photos'].map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${tab === t ? 'bg-ink-900 text-white' : 'bg-white border border-ink-900/10 hover:bg-ink-900/5'}`}>
            {t}
          </button>
        ))}
        {saved && <span className="text-xs text-emerald-600 self-center ml-1">{saved}</span>}
      </div>
      {tab === 'info' && <EditBusinessInfo providerId={provider.id} provider={provider} onSaved={handleSaved} />}
      {tab === 'categories' && <EditCategories providerId={provider.id} profile={profile} onSaved={handleSaved} />}
      {tab === 'services' && <EditServices providerId={provider.id} profile={profile} onSaved={handleSaved} />}
      {tab === 'location' && <EditLocation providerId={provider.id} provider={provider} onSaved={handleSaved} />}
      {tab === 'photos' && <EditPhotos providerId={provider.id} provider={provider} profile={profile} onSaved={handleSaved} />}
    </div>
  );
}

function EditBusinessInfo({ providerId, provider, onSaved }) {
  const [form, setForm] = useState({
    businessName: provider.business_name || '',
    displayName: provider.display_name || '',
    description: provider.description || '',
    businessPhone: provider.business_phone || '',
    pricingMode: provider.pricing_mode || 'hidden',
    priceAmount: provider.price_amount ?? '',
    autoReplyEnabled: !!provider.auto_reply_enabled,
    autoReplyMessage: provider.auto_reply_message || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.patch(`/admin/providers/${providerId}/profile`, {
        ...form,
        priceAmount: form.pricingMode === 'hidden' || form.priceAmount === '' ? null : Number(form.priceAmount),
      });
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-2">
      <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder="Business name"
        className="w-full rounded-lg border border-ink-900/15 px-3 py-1.5 text-xs" />
      <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="Display name"
        className="w-full rounded-lg border border-ink-900/15 px-3 py-1.5 text-xs" />
      <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Bio / description" rows={4}
        className="w-full rounded-lg border border-ink-900/15 px-3 py-1.5 text-xs" />
      <input value={form.businessPhone} onChange={(e) => setForm({ ...form, businessPhone: e.target.value })} placeholder="Phone number"
        className="w-full rounded-lg border border-ink-900/15 px-3 py-1.5 text-xs" />
      <div className="flex gap-2 items-center flex-wrap">
        <select value={form.pricingMode} onChange={(e) => setForm({ ...form, pricingMode: e.target.value })}
          className="rounded-lg border border-ink-900/15 px-3 py-1.5 text-xs">
          {PRICING_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        {form.pricingMode !== 'hidden' && (
          <input type="number" min="0" step="0.01" value={form.priceAmount}
            onChange={(e) => setForm({ ...form, priceAmount: e.target.value })} placeholder="Amount"
            className="w-28 rounded-lg border border-ink-900/15 px-3 py-1.5 text-xs" />
        )}
      </div>
      <label className="flex items-center gap-2 text-xs text-ink-700/70">
        <input type="checkbox" checked={form.autoReplyEnabled} onChange={(e) => setForm({ ...form, autoReplyEnabled: e.target.checked })} />
        Auto-reply to new messages
      </label>
      {form.autoReplyEnabled && (
        <textarea value={form.autoReplyMessage} onChange={(e) => setForm({ ...form, autoReplyMessage: e.target.value })}
          placeholder="Auto-reply message" rows={2} className="w-full rounded-lg border border-ink-900/15 px-3 py-1.5 text-xs" />
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button disabled={busy} className="rounded-lg bg-ember-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-ember-600 disabled:opacity-60">
        {busy ? 'Saving…' : 'Save business info'}
      </button>
    </form>
  );
}

function EditCategories({ providerId, profile, onSaved }) {
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(() => new Set((profile?.categories || []).map((c) => c.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/categories').then(({ data }) => setCategories(data.categories));
  }, []);

  const toggle = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api.put(`/admin/providers/${providerId}/categories`, { categoryIds: Array.from(selected) });
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto">
        {categories.map((c) => (
          <button key={c.id} type="button" onClick={() => toggle(c.id)}
            className={`rounded-full border px-3 py-1 text-xs ${selected.has(c.id) ? 'border-ember-500 bg-ember-50' : 'border-ink-900/10'}`}>
            {c.icon} {c.name}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button disabled={busy} onClick={save} className="rounded-lg bg-ember-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-ember-600 disabled:opacity-60">
        {busy ? 'Saving…' : 'Save categories'}
      </button>
    </div>
  );
}

// Grouped by the provider's already-saved categories (same order the
// onboarding wizard uses: categories first, then services under them) --
// switching to the Categories tab and saving there is what changes which
// groups show up here.
function EditServices({ providerId, profile, onSaved }) {
  const categoryIds = (profile?.categories || []).map((c) => c.id);
  const [servicesByCategory, setServicesByCategory] = useState({});
  const [selected, setSelected] = useState(() => new Set((profile?.services || []).map((s) => s.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    categoryIds.forEach((id) => {
      if (!servicesByCategory[id]) {
        api.get(`/categories/${id}/services`).then(({ data }) => setServicesByCategory((s) => ({ ...s, [id]: data.services })));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const toggle = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api.put(`/admin/providers/${providerId}/services`, { serviceIds: Array.from(selected) });
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (categoryIds.length === 0) {
    return <p className="text-xs text-ink-700/50">Choose categories first -- services are grouped under them.</p>;
  }

  return (
    <div className="space-y-3">
      {categoryIds.map((catId) => (
        <div key={catId}>
          <p className="text-xs font-medium text-ink-700/70 mb-1">{profile.categories.find((c) => c.id === catId)?.name}</p>
          <div className="flex flex-wrap gap-2">
            {(servicesByCategory[catId] || []).map((s) => (
              <button key={s.id} type="button" onClick={() => toggle(s.id)}
                className={`rounded-full border px-3 py-1 text-xs ${selected.has(s.id) ? 'border-ember-500 bg-ember-50' : 'border-ink-900/10'}`}>
                {s.name}
              </button>
            ))}
            {(servicesByCategory[catId] || []).length === 0 && (
              <p className="text-xs text-ink-700/40">No services listed under this category.</p>
            )}
          </div>
        </div>
      ))}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button disabled={busy} onClick={save} className="rounded-lg bg-ember-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-ember-600 disabled:opacity-60">
        {busy ? 'Saving…' : 'Save services'}
      </button>
    </div>
  );
}

function EditLocation({ providerId, provider, onSaved }) {
  const [radiusMiles, setRadiusMiles] = useState(provider.service_radius_miles || 15);
  const [areaLocation, setAreaLocation] = useState(
    provider.base_lat != null && provider.base_lng != null
      ? { label: provider.base_location_label, lat: provider.base_lat, lng: provider.base_lng }
      : null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (areaLocation?.lat == null || areaLocation?.lng == null) {
      setError('Pick a real place from the search results so customers near them can actually find them.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.put(`/admin/providers/${providerId}/service-area`, {
        radiusMiles,
        label: areaLocation.label,
        lat: areaLocation.lat,
        lng: areaLocation.lng,
      });
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center flex-wrap">
        {[5, 10, 25].map((r) => (
          <button key={r} type="button" onClick={() => setRadiusMiles(r)}
            className={`rounded-full px-3 py-1 text-xs border ${radiusMiles === r ? 'border-ember-500 bg-ember-50' : 'border-ink-900/10'}`}>
            {r} miles
          </button>
        ))}
        <input type="number" min="1" value={radiusMiles} onChange={(e) => setRadiusMiles(Number(e.target.value))}
          className="w-20 rounded-full border border-ink-900/15 px-3 py-1 text-xs" />
      </div>
      <ProviderLocationPicker value={areaLocation} onChange={setAreaLocation} placeholder="Search city, ZIP, or address" />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button disabled={busy} onClick={save} className="rounded-lg bg-ember-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-ember-600 disabled:opacity-60">
        {busy ? 'Saving…' : 'Save location'}
      </button>
    </div>
  );
}

function EditPhotos({ providerId, provider, profile, onSaved }) {
  const [photos, setPhotos] = useState(profile?.photos || []);
  const [imageUrl, setImageUrl] = useState(provider.image_url || null);
  const [busyImage, setBusyImage] = useState(false);
  const [busyUpload, setBusyUpload] = useState(false);

  const uploadImage = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusyImage(true);
    try {
      const form = new FormData();
      form.append('image', file);
      const { data } = await api.post(`/admin/providers/${providerId}/image`, form);
      setImageUrl(data.imageUrl);
      onSaved?.();
    } finally {
      setBusyImage(false);
    }
  };

  const uploadPhotos = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setBusyUpload(true);
    try {
      const form = new FormData();
      files.forEach((f) => form.append('photos', f));
      const { data } = await api.post(`/admin/providers/${providerId}/photos`, form);
      setPhotos((p) => [...p, ...data.photos]);
      onSaved?.();
    } finally {
      setBusyUpload(false);
    }
  };

  const removePhoto = async (photoId) => {
    await api.delete(`/admin/providers/${providerId}/photos/${photoId}`);
    setPhotos((p) => p.filter((x) => x.id !== photoId));
    onSaved?.();
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-ink-700/70 mb-1">Main image</p>
        <div className="flex items-center gap-3">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <div className="h-14 w-14 rounded-full bg-ink-900/10 flex items-center justify-center text-lg">🧰</div>
          )}
          <label className="rounded-full border border-ink-900/15 px-3 py-1.5 text-xs hover:bg-ink-900/5 cursor-pointer">
            {busyImage ? 'Uploading…' : 'Upload new image'}
            <input type="file" accept="image/*" hidden disabled={busyImage} onChange={uploadImage} />
          </label>
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-ink-700/70 mb-1">Portfolio photos</p>
        <div className="grid grid-cols-4 gap-2 mb-2">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              <img src={p.url} alt="" className="aspect-square rounded-lg object-cover" />
              <button type="button" onClick={() => removePhoto(p.id)}
                className="absolute top-1 right-1 rounded-full bg-black/60 text-white text-[10px] px-1.5 py-0.5 hover:bg-black/80">
                ✕
              </button>
            </div>
          ))}
        </div>
        <label className="inline-block rounded-full border border-ink-900/15 px-3 py-1.5 text-xs hover:bg-ink-900/5 cursor-pointer">
          {busyUpload ? 'Uploading…' : 'Upload photos'}
          <input type="file" accept="image/*" multiple hidden disabled={busyUpload} onChange={uploadPhotos} />
        </label>
      </div>
    </div>
  );
}

// Expandable detail for one account -- profile, provider earnings (if
// they're a provider, using the exact same numbers /providers/me/earnings
// shows the provider themselves), the full storefront view, the
// consent-gated "finish their setup" flow, job history on both sides, and an
// inline two-way support conversation (same support_messages thread every
// admin shares -- see admin.routes.js's /support/threads/:userId, reused
// here rather than duplicated).
function UserDetail({ userId }) {
  const [detail, setDetail] = useState(null);
  const [support, setSupport] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const loadDetail = () => api.get(`/admin/users/${userId}`).then(({ data }) => setDetail(data));
  const loadSupport = () => api.get(`/admin/support/threads/${userId}`).then(({ data }) => setSupport(data));
  useEffect(() => {
    loadDetail();
    loadSupport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const sendReply = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api.post(`/admin/support/threads/${userId}/reply`, { body: reply });
      setReply('');
      await loadSupport();
    } finally {
      setSending(false);
    }
  };

  if (!detail) return <p className="text-xs text-ink-700/50 mt-3">Loading…</p>;
  const { user, provider, profile, earnings, jobsAsCustomer, jobsAsProvider } = detail;

  return (
    <div className="mt-3 pt-3 border-t border-ink-900/8 space-y-3 text-sm">
      <p className="text-xs text-ink-700/60">
        Joined {new Date(user.created_at).toLocaleDateString()}{user.location_label && ` · ${user.location_label}`}
      </p>

      {provider && (
        <div>
          <p className="font-medium">
            {provider.business_name || provider.display_name} <span className="text-xs text-ink-700/50">(provider · {provider.status})</span>
          </p>
          {earnings && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
              <MiniStat label="Pending payout" value={money(earnings.summary.pending)} />
              <MiniStat label="Released to provider" value={money(earnings.summary.released)} />
              <MiniStat label="Gross charged (Stripe)" value={money(earnings.summary.gross)} />
              <MiniStat label="Taskora fees kept" value={money(earnings.summary.fees_paid)} />
            </div>
          )}
        </div>
      )}

      {provider && profile && <ProviderFullProfile provider={provider} profile={profile} />}

      {provider && <AdminEditAccessPanel provider={provider} profile={profile} onProfileChange={loadDetail} />}

      {jobsAsCustomer.length > 0 && (
        <div>
          <p className="text-xs font-medium text-ink-700/70 mb-1">Jobs as customer ({jobsAsCustomer.length})</p>
          <div className="space-y-1">
            {jobsAsCustomer.slice(0, 5).map((j) => (
              <p key={j.id} className="text-xs text-ink-700/60">→ {j.provider_name} · {money(j.price)} · {j.status}</p>
            ))}
          </div>
        </div>
      )}

      {jobsAsProvider.length > 0 && (
        <div>
          <p className="text-xs font-medium text-ink-700/70 mb-1">Jobs as provider ({jobsAsProvider.length})</p>
          <div className="space-y-1">
            {jobsAsProvider.slice(0, 5).map((j) => (
              <p key={j.id} className="text-xs text-ink-700/60">{j.customer_email} · {money(j.price)} · {j.status}</p>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-ink-700/70 mb-1">Support conversation</p>
        <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-lg bg-ink-900/[0.02] p-2">
          {(!support || support.messages.length === 0) && <p className="text-xs text-ink-700/50">No support messages yet.</p>}
          {support?.messages.map((m) => (
            <div key={m.id} className={`rounded-lg p-2 text-xs max-w-[85%] ${m.sender === 'admin' ? 'ml-auto bg-ink-900 text-white' : 'bg-white border border-ink-900/8'}`}>
              {m.body}
            </div>
          ))}
        </div>
        <form onSubmit={sendReply} className="flex gap-2 mt-2">
          <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Message this user…" className="flex-1 rounded-lg border border-ink-900/15 px-3 py-1.5 text-xs" />
          <button disabled={sending} className="rounded-lg bg-ember-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-ember-600 disabled:opacity-60">Send</button>
        </form>
        <p className="text-[11px] text-ink-700/40 mt-1">This lands directly in their Support inbox, and any admin here sees the same thread.</p>
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const load = () => api.get('/admin/users').then(({ data }) => setUsers(data.users));
  useEffect(() => { load(); }, []);
  const act = async (id, action) => { await api.post(`/admin/users/${id}/${action}`); load(); };
  const remove = async (u) => {
    if (!confirm(`Permanently delete ${u.first_name} ${u.last_name} (${u.email})? This cannot be undone.`)) return;
    await api.delete(`/admin/users/${u.id}`);
    load();
  };
  const promote = async (u) => {
    if (!confirm(`Make ${u.first_name} ${u.last_name} (${u.email}) an admin? They'll get full, equal admin access.`)) return;
    await api.post(`/admin/users/${u.id}/promote`);
    load();
  };
  return (
    <div className="space-y-2">
      {users.map((u) => (
        <Card key={u.id}>
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => setExpandedId(expandedId === u.id ? null : u.id)} className="text-left flex-1 min-w-0">
              <p className="font-medium">{u.first_name} {u.last_name} <span className="text-xs text-ink-700/50">({u.email})</span></p>
              <p className="text-xs text-ink-700/60">{u.role} · {u.status} · mode: {u.current_mode}</p>
            </button>
            <div className="flex gap-2 flex-wrap justify-end">
              {u.status === 'active' ? (
                <button onClick={() => act(u.id, 'suspend')} className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50">Suspend</button>
              ) : u.status === 'suspended' ? (
                <button onClick={() => act(u.id, 'reactivate')} className="rounded-full border border-emerald-200 px-3 py-1 text-xs text-emerald-600 hover:bg-emerald-50">Reactivate</button>
              ) : null}
              {u.role !== 'admin' && (
                <button onClick={() => promote(u)} className="rounded-full border border-sky-200 px-3 py-1 text-xs text-sky-700 hover:bg-sky-50">Make admin</button>
              )}
              {u.status !== 'deleted' && u.role !== 'admin' && (
                <button onClick={() => remove(u)} className="rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">Delete</button>
              )}
            </div>
          </div>
          {expandedId === u.id && <UserDetail userId={u.id} />}
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
  const [expandedId, setExpandedId] = useState(null);
  const [earningsById, setEarningsById] = useState({});
  const load = () => api.get('/admin/providers').then(({ data }) => setProviders(data.providers));
  useEffect(() => { load(); }, []);
  const act = async (id, action) => { await api.post(`/admin/providers/${id}/${action}`); load(); };
  const toggle = async (p) => {
    const next = expandedId === p.id ? null : p.id;
    setExpandedId(next);
    if (next && !earningsById[p.id]) {
      const { data } = await api.get(`/admin/providers/${p.id}/earnings`);
      setEarningsById((prev) => ({ ...prev, [p.id]: data }));
    }
  };
  return (
    <div className="space-y-2">
      {providers.map((p) => {
        const badge = TIER_BADGE[p.tier] || TIER_BADGE.non_priority;
        const earnings = earningsById[p.id];
        // base_lat/base_lng/base_location_label and profile_completeness come
        // straight through from `SELECT p.*` in GET /admin/providers -- the
        // exact same columns the provider's own dashboard reads, so this can
        // never drift from what the provider themselves sees or from what
        // search.service.js actually uses to place them.
        const hasLocation = p.base_lat != null && p.base_lng != null;
        const mapUrl = hasLocation ? `https://www.google.com/maps?q=${p.base_lat},${p.base_lng}` : null;
        return (
          <Card key={p.id}>
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => toggle(p)} className="text-left flex-1 min-w-0">
                <p className="font-medium">{p.business_name || p.display_name} {p.verified && '✓'}</p>
                <p className="text-xs text-ink-700/60">{p.email} · {p.status} · rating {p.rating_avg}</p>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
                  {p.tier === 'free_distribution' && p.freeDistributionEndsAt && (
                    <span className="text-[11px] text-ink-700/50">until {new Date(p.freeDistributionEndsAt).toLocaleDateString()}</span>
                  )}
                  <span className="text-[11px] text-ink-700/50">setup {p.profile_completeness}%</span>
                  {hasLocation ? (
                    <a
                      href={mapUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] text-sky-700 hover:underline"
                    >
                      📍 {p.base_location_label || 'View on map'}
                    </a>
                  ) : (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">No location set</span>
                  )}
                </div>
              </button>
              <div className="flex gap-2 flex-wrap justify-end">
                {!p.verified && <button onClick={() => act(p.id, 'verify')} className="rounded-full border border-ink-900/15 px-3 py-1 text-xs hover:bg-ink-900/5">Verify</button>}
                {p.status !== 'suspended' ? (
                  <button onClick={() => act(p.id, 'suspend')} className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50">Suspend</button>
                ) : (
                  <button onClick={() => act(p.id, 'reactivate')} className="rounded-full border border-emerald-200 px-3 py-1 text-xs text-emerald-600 hover:bg-emerald-50">Reactivate</button>
                )}
              </div>
            </div>
            {expandedId === p.id && (
              <div className="mt-3 pt-3 border-t border-ink-900/8">
                {!earnings ? (
                  <p className="text-xs text-ink-700/50">Loading earnings…</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <MiniStat label="Pending payout" value={money(earnings.summary.pending)} />
                    <MiniStat label="Released to provider" value={money(earnings.summary.released)} />
                    <MiniStat label="Gross charged (Stripe)" value={money(earnings.summary.gross)} />
                    <MiniStat label="Taskora fees kept" value={money(earnings.summary.fees_paid)} />
                  </div>
                )}              </div>
            )}
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
function SupportTab({ openUserId, onOpened }) {
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

  // Arriving here from an Agency escalation's "Reply in Support" button --
  // open straight to that person's thread instead of making the admin find
  // it in the list themselves.
  useEffect(() => {
    if (!openUserId) return;
    openThread(openUserId);
    onOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openUserId]);

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
