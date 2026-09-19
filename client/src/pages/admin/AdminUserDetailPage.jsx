import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import ProviderLocationPicker from '../../components/ProviderLocationPicker.jsx';

// The full, dedicated "click into one account" page -- everything about a
// user or provider in one place, nothing truncated or hidden behind a
// second click: their storefront exactly as customers see it, complete job
// history on both sides of the marketplace, complete payout/earnings
// history, location, the support thread, and -- right beside the profile,
// not on a separate tab -- the consent-gated "finish their setup for them"
// control. Reached from a <Link> on both the Users tab and the Providers
// tab, so either entry point lands here.

function Card({ children, className = '' }) {
  return <div className={`rounded-xl border border-ink-900/8 bg-white p-4 shadow-card ${className}`}>{children}</div>;
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
// Always rendered in full the moment this page loads -- no second click to
// reveal it, since seeing everything is the point of opening it.
function ProviderFullProfile({ provider, profile }) {
  const isEmpty = !provider.description && profile.categories.length === 0 && profile.photos.length === 0;
  return (
    <div className="rounded-xl border border-ink-900/8 bg-white p-3 space-y-3">
      <p className="text-xs font-medium text-ink-700/70">Full profile (what customers see on their page)</p>
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
      {isEmpty && <p className="text-xs text-ink-700/50">Nothing filled in yet -- this is exactly why the edit-access control exists.</p>}
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

function statusBadge(status) {
  const map = {
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-ink-900/10 text-ink-700/50',
    disputed: 'bg-red-100 text-red-700',
    refunded: 'bg-amber-100 text-amber-700',
  };
  return map[status] || 'bg-sky-100 text-sky-700';
}

// Full job history, either side of the marketplace -- every job the server
// hands back (up to 20, the server's own limit), never truncated further on
// the client the way the old inline accordion used to.
function JobHistoryTable({ title, jobs, otherPartyLabel, otherPartyKey }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-700/70 mb-1">{title} ({jobs.length})</p>
      {jobs.length === 0 ? (
        <p className="text-xs text-ink-700/40">None yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink-900/8 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-900/8 text-left text-ink-700/50">
                <th className="p-2">{otherPartyLabel}</th>
                <th className="p-2">Job</th>
                <th className="p-2">Price</th>
                <th className="p-2">Status</th>
                <th className="p-2">Date</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-b border-ink-900/5 last:border-0">
                  <td className="p-2">{j[otherPartyKey]}</td>
                  <td className="p-2 max-w-[220px] truncate" title={j.service_description}>{j.service_description}</td>
                  <td className="p-2">{money(j.price)}</td>
                  <td className="p-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge(j.status)}`}>{j.status}</span></td>
                  <td className="p-2 text-ink-700/50">{new Date(j.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Full payout history, not just the summary totals -- "money history" the
// user explicitly asked to be able to click through to, straight from
// provider_payouts (server already caps it at the last 20).
function PayoutHistoryTable({ payouts }) {
  if (!payouts || payouts.length === 0) {
    return <p className="text-xs text-ink-700/40">No payouts recorded yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-900/8 bg-white">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-ink-900/8 text-left text-ink-700/50">
            <th className="p-2">Date</th>
            <th className="p-2">Amount</th>
            <th className="p-2">Status</th>
            <th className="p-2">Stripe transfer</th>
          </tr>
        </thead>
        <tbody>
          {payouts.map((p) => (
            <tr key={p.id} className="border-b border-ink-900/5 last:border-0">
              <td className="p-2 text-ink-700/50">{new Date(p.created_at).toLocaleDateString()}</td>
              <td className="p-2 font-medium">{money(p.amount)}</td>
              <td className="p-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadge(p.status)}`}>{p.status}</span></td>
              <td className="p-2 text-ink-700/40 truncate max-w-[160px]">{p.stripe_transfer_id || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminUserDetailPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [support, setSupport] = useState(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const loadDetail = () => api.get(`/admin/users/${userId}`).then(({ data }) => setDetail(data));
  const loadSupport = () => api.get(`/admin/support/threads/${userId}`).then(({ data }) => setSupport(data));
  useEffect(() => {
    setDetail(null);
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

  const act = async (action) => {
    setActionBusy(true);
    try {
      await api.post(`/admin/users/${userId}/${action}`);
      await loadDetail();
    } finally {
      setActionBusy(false);
    }
  };

  const promote = async () => {
    if (!detail) return;
    if (!confirm(`Make ${detail.user.first_name} ${detail.user.last_name} (${detail.user.email}) an admin? They'll get full, equal admin access.`)) return;
    setActionBusy(true);
    try {
      await api.post(`/admin/users/${userId}/promote`);
      await loadDetail();
    } finally {
      setActionBusy(false);
    }
  };

  const remove = async () => {
    if (!detail) return;
    if (!confirm(`Permanently delete ${detail.user.first_name} ${detail.user.last_name} (${detail.user.email})? This cannot be undone.`)) return;
    await api.delete(`/admin/users/${userId}`);
    navigate('/admin');
  };

  if (!detail) return <p className="text-sm text-ink-700/60">Loading…</p>;
  const { user, provider, profile, earnings, jobsAsCustomer, jobsAsProvider } = detail;

  return (
    <div className="space-y-5">
      <Link to="/admin" className="text-xs text-ink-700/50 hover:text-ink-700 hover:underline">← Back to admin</Link>

      <Card className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-xl">{user.first_name} {user.last_name}</h1>
          <p className="text-xs text-ink-700/60 mt-0.5">{user.email}</p>
          <p className="text-xs text-ink-700/60 mt-1">
            {user.role} · {user.status} · mode: {user.current_mode} · joined {new Date(user.created_at).toLocaleDateString()}
            {user.location_label && ` · 📍 ${user.location_label}`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {user.status === 'active' ? (
            <button disabled={actionBusy} onClick={() => act('suspend')} className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50">Suspend</button>
          ) : user.status === 'suspended' ? (
            <button disabled={actionBusy} onClick={() => act('reactivate')} className="rounded-full border border-emerald-200 px-3 py-1 text-xs text-emerald-600 hover:bg-emerald-50 disabled:opacity-50">Reactivate</button>
          ) : null}
          {user.role !== 'admin' && (
            <button disabled={actionBusy} onClick={promote} className="rounded-full border border-sky-200 px-3 py-1 text-xs text-sky-700 hover:bg-sky-50 disabled:opacity-50">Make admin</button>
          )}
          {user.status !== 'deleted' && user.role !== 'admin' && (
            <button disabled={actionBusy} onClick={remove} className="rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">Delete</button>
          )}
        </div>
      </Card>

      {provider && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* Left: the full storefront, exactly as customers see it. */}
          <div className="space-y-4">
            <p className="font-medium text-sm">
              {provider.business_name || provider.display_name} <span className="text-xs text-ink-700/50">(provider · {provider.status})</span>
            </p>
            {profile && <ProviderFullProfile provider={provider} profile={profile} />}
          </div>

          {/* Right, beside the profile: the control request. */}
          <div className="space-y-3">
            <AdminEditAccessPanel provider={provider} profile={profile} onProfileChange={loadDetail} />
          </div>
        </div>
      )}

      {provider && earnings && (
        <div className="space-y-3">
          <h3 className="font-medium">Money history</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MiniStat label="Pending payout" value={money(earnings.summary.pending)} />
            <MiniStat label="Released to provider" value={money(earnings.summary.released)} />
            <MiniStat label="Gross charged (Stripe)" value={money(earnings.summary.gross)} />
            <MiniStat label="Taskora fees kept" value={money(earnings.summary.fees_paid)} />
          </div>
          <PayoutHistoryTable payouts={earnings.payouts} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <JobHistoryTable title="Jobs as customer" jobs={jobsAsCustomer} otherPartyLabel="Provider" otherPartyKey="provider_name" />
        <JobHistoryTable title="Jobs as provider" jobs={jobsAsProvider} otherPartyLabel="Customer" otherPartyKey="customer_email" />
      </div>

      <div>
        <p className="text-xs font-medium text-ink-700/70 mb-1">Support conversation</p>
        <div className="space-y-1.5 max-h-64 overflow-y-auto rounded-lg bg-ink-900/[0.02] p-2">
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
