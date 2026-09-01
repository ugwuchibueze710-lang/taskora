import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import CategoryPicker from '../../components/CategoryPicker.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const STEPS = ['Services you offer', 'Custom services', 'Description', 'Business info', 'Image', 'Portfolio', 'Availability', 'Service area', 'Publish'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function OnboardingWizardPage() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [categories, setCategories] = useState([]);
  const [servicesByCategory, setServicesByCategory] = useState({});
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([]);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [customServiceName, setCustomServiceName] = useState('');
  const [business, setBusiness] = useState({ businessName: '', description: '', businessPhone: '' });
  const [availabilityMode, setAvailabilityMode] = useState('always');
  const [slots, setSlots] = useState([]);
  const [radiusMiles, setRadiusMiles] = useState(15);
  const [areaLabel, setAreaLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.post('/providers/setup');
    api.get('/categories').then(({ data }) => setCategories(data.categories));
  }, []);

  useEffect(() => {
    selectedCategoryIds.forEach((id) => {
      if (!servicesByCategory[id]) {
        api.get(`/categories/${id}/services`).then(({ data }) =>
          setServicesByCategory((s) => ({ ...s, [id]: data.services }))
        );
      }
    });
  }, [selectedCategoryIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleService = (id) =>
    setSelectedServiceIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const next = async () => {
    setError('');
    setBusy(true);
    try {
      if (step === 0) {
        if (!selectedCategoryIds.length) throw new Error('Choose at least one category.');
        await api.put('/providers/me/categories', { categoryIds: selectedCategoryIds });
      }
      if (step === 1) {
        await api.put('/providers/me/services', { serviceIds: selectedServiceIds });
      }
      if (step === 3) {
        await api.patch('/providers/me', business);
      }
      if (step === 6) {
        await api.put('/providers/me/availability', { mode: availabilityMode, slots });
      }
      if (step === 7) {
        await api.put('/providers/me/service-area', { radiusMiles, label: areaLabel || undefined });
      }
      setStep((s) => s + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const addCustomService = async () => {
    if (!customServiceName.trim() || !selectedCategoryIds[0]) return;
    const { data } = await api.post('/providers/me/services/custom', { categoryId: selectedCategoryIds[0], name: customServiceName });
    setServicesByCategory((s) => ({ ...s, [selectedCategoryIds[0]]: [...(s[selectedCategoryIds[0]] || []), data.service] }));
    setSelectedServiceIds((ids) => [...ids, data.service.id]);
    setCustomServiceName('');
  };

  const publish = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/providers/me/publish');
      await refresh();
      navigate('/provider');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleSlot = (day) => {
    setSlots((s) =>
      s.some((x) => x.dayOfWeek === day)
        ? s.filter((x) => x.dayOfWeek !== day)
        : [...s, { dayOfWeek: day, startTime: '09:00', endTime: '17:00' }]
    );
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-6">
        <div className="flex justify-between text-xs text-ink-700/60 mb-1">
          <span>Step {step + 1} of {STEPS.length}</span>
          <span>{STEPS[step]}</span>
        </div>
        <div className="h-1.5 rounded-full bg-ink-900/10 overflow-hidden">
          <div className="h-full bg-ember-500 transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <div className="rounded-2xl border border-ink-900/8 bg-white p-6 shadow-card min-h-[280px]">
        {step === 0 && (
          <div>
            <h2 className="font-display text-xl mb-1">What services do you offer?</h2>
            <p className="text-sm text-ink-700/60 mb-3">
              Search or browse by section, and select as many as you genuinely offer — there's no limit.
            </p>
            <CategoryPicker selectedIds={selectedCategoryIds} onChange={setSelectedCategoryIds} />
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="font-display text-xl mb-1">Add specific services (optional)</h2>
            <p className="text-sm text-ink-700/60 mb-3">
              Break a category down further, e.g. "IKEA Assembly" under Furniture Assembly — or skip this and continue.
            </p>
            {selectedCategoryIds.map((catId) => (
              <div key={catId} className="mb-3">
                <p className="text-sm font-medium text-ink-700/70 mb-1">{categories.find((c) => c.id === catId)?.name}</p>
                <div className="flex flex-wrap gap-2">
                  {(servicesByCategory[catId] || []).map((s) => (
                    <button key={s.id} onClick={() => toggleService(s.id)}
                      className={`rounded-full border px-3 py-1 text-sm ${selectedServiceIds.includes(s.id) ? 'border-ember-500 bg-ember-50' : 'border-ink-900/10'}`}>
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <input value={customServiceName} onChange={(e) => setCustomServiceName(e.target.value)} placeholder="Add a custom service"
                className="flex-1 rounded-lg border border-ink-900/15 px-3 py-1.5 text-sm" />
              <button onClick={addCustomService} className="rounded-lg border border-ink-900/15 px-3 py-1.5 text-sm hover:bg-ink-900/5">Add</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="font-display text-xl mb-3">Describe what you do (optional)</h2>
            <textarea value={business.description} onChange={(e) => setBusiness({ ...business, description: e.target.value })} rows={5}
              placeholder="Tell customers about your experience and what makes you great..."
              className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm" />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2">
            <h2 className="font-display text-xl mb-3">Business info (optional)</h2>
            <input value={business.businessName} onChange={(e) => setBusiness({ ...business, businessName: e.target.value })} placeholder="Business name"
              className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm" />
            <input value={business.businessPhone} onChange={(e) => setBusiness({ ...business, businessPhone: e.target.value })} placeholder="Phone number"
              className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm" />
          </div>
        )}

        {step === 4 && (
          <ImageStep />
        )}

        {step === 5 && (
          <PortfolioStep />
        )}

        {step === 6 && (
          <div>
            <h2 className="font-display text-xl mb-3">Availability (optional)</h2>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setAvailabilityMode('always')} className={`rounded-full px-4 py-1.5 text-sm border ${availabilityMode === 'always' ? 'border-ember-500 bg-ember-50' : 'border-ink-900/10'}`}>
                Available All the Time
              </button>
              <button onClick={() => setAvailabilityMode('custom')} className={`rounded-full px-4 py-1.5 text-sm border ${availabilityMode === 'custom' ? 'border-ember-500 bg-ember-50' : 'border-ink-900/10'}`}>
                Set My Availability
              </button>
            </div>
            {availabilityMode === 'custom' && (
              <div className="flex flex-wrap gap-2">
                {DAY_NAMES.map((d, i) => (
                  <button key={i} onClick={() => toggleSlot(i)}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${slots.some((s) => s.dayOfWeek === i) ? 'border-ember-500 bg-ember-50' : 'border-ink-900/10'}`}>
                    {d} 9–5
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 7 && (
          <div className="space-y-2">
            <h2 className="font-display text-xl mb-3">How far will you travel?</h2>
            <div className="flex gap-2">
              {[5, 10, 25].map((r) => (
                <button key={r} onClick={() => setRadiusMiles(r)} className={`rounded-full px-4 py-1.5 text-sm border ${radiusMiles === r ? 'border-ember-500 bg-ember-50' : 'border-ink-900/10'}`}>
                  {r} miles
                </button>
              ))}
              <input type="number" min="1" value={radiusMiles} onChange={(e) => setRadiusMiles(Number(e.target.value))}
                className="w-24 rounded-full border border-ink-900/15 px-3 py-1.5 text-sm" />
            </div>
            <input value={areaLabel} onChange={(e) => setAreaLabel(e.target.value)} placeholder="Your base location (e.g. Owensboro, KY)"
              className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm mt-2" />
          </div>
        )}

        {step === 8 && (
          <div className="text-center py-6">
            <div className="text-5xl mb-3">🎉</div>
            <h2 className="font-display text-xl mb-1">Ready to publish!</h2>
            <p className="text-ink-700/70 text-sm">Your profile will go live to customers near you right away.</p>
          </div>
        )}

        {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
      </div>

      <div className="flex justify-between mt-4">
        <button disabled={step === 0} onClick={() => setStep((s) => s - 1)} className="rounded-full px-4 py-2 text-sm disabled:opacity-0">
          Back
        </button>
        {step < STEPS.length - 1 ? (
          <button disabled={busy} onClick={next} className="rounded-full bg-ember-500 px-6 py-2 text-sm font-semibold text-white hover:bg-ember-600 disabled:opacity-60">
            {busy ? 'Saving…' : 'Continue'}
          </button>
        ) : (
          <button disabled={busy} onClick={publish} className="rounded-full bg-ink-900 px-6 py-2 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-60">
            {busy ? 'Publishing…' : 'Publish My Profile'}
          </button>
        )}
      </div>
    </div>
  );
}

function ImageStep() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const useProfilePic = async () => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('useProfilePicture', 'true');
      await api.post('/providers/me/image', form);
      setDone(true);
    } catch {
      /* they may not have a profile picture yet — that's fine, they can upload instead */
    } finally {
      setBusy(false);
    }
  };

  const upload = async (e, source) => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('image', file);
      form.append('source', source);
      await api.post('/providers/me/image', form);
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="font-display text-xl mb-3">Provider image (optional)</h2>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={useProfilePic} className="rounded-full border border-ink-900/15 px-4 py-2 text-sm hover:bg-ink-900/5">
          Use my profile picture
        </button>
        <label className="rounded-full border border-ink-900/15 px-4 py-2 text-sm hover:bg-ink-900/5 cursor-pointer">
          Upload a logo
          <input type="file" accept="image/*" hidden onChange={(e) => upload(e, 'logo')} />
        </label>
        <label className="rounded-full border border-ink-900/15 px-4 py-2 text-sm hover:bg-ink-900/5 cursor-pointer">
          Upload a custom photo
          <input type="file" accept="image/*" hidden onChange={(e) => upload(e, 'custom')} />
        </label>
      </div>
      {done && <p className="text-emerald-600 text-sm mt-2">Image set!</p>}
    </div>
  );
}

function PortfolioStep() {
  const [uploaded, setUploaded] = useState([]);
  const upload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const form = new FormData();
    files.forEach((f) => form.append('photos', f));
    const { data } = await api.post('/providers/me/photos', form);
    setUploaded((u) => [...u, ...data.photos]);
  };
  return (
    <div>
      <h2 className="font-display text-xl mb-3">Portfolio photos (optional)</h2>
      <label className="inline-block rounded-full border border-ink-900/15 px-4 py-2 text-sm hover:bg-ink-900/5 cursor-pointer">
        Upload photos of previous work
        <input type="file" accept="image/*" multiple hidden onChange={upload} />
      </label>
      <div className="grid grid-cols-4 gap-2 mt-3">
        {uploaded.map((p) => <img key={p.id} src={p.url} className="aspect-square rounded-lg object-cover" alt="" />)}
      </div>
    </div>
  );
}
