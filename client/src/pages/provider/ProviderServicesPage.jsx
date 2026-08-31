import { useEffect, useState } from 'react';
import api from '../../api/client.js';
import Spinner from '../../components/Spinner.jsx';

export default function ProviderServicesPage() {
  const [me, setMe] = useState(null);
  const [categories, setCategories] = useState([]);
  const [servicesByCategory, setServicesByCategory] = useState({});
  const [saved, setSaved] = useState('');

  const load = async () => {
    const [{ data: m }, { data: c }] = await Promise.all([api.get('/providers/me'), api.get('/categories')]);
    setMe(m);
    setCategories(c.categories);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!me) return;
    me.categories.forEach((cat) => {
      if (!servicesByCategory[cat.id]) {
        api.get(`/categories/${cat.id}/services`).then(({ data }) => setServicesByCategory((s) => ({ ...s, [cat.id]: data.services })));
      }
    });
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!me) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  const flash = () => { setSaved('Saved!'); setTimeout(() => setSaved(''), 1500); };

  const toggleCategory = async (id) => {
    const ids = me.categories.some((c) => c.id === id) ? me.categories.filter((c) => c.id !== id).map((c) => c.id) : [...me.categories.map((c) => c.id), id];
    await api.put('/providers/me/categories', { categoryIds: ids });
    await load();
    flash();
  };

  const toggleService = async (svcId) => {
    const ids = me.services.some((s) => s.id === svcId) ? me.services.filter((s) => s.id !== svcId).map((s) => s.id) : [...me.services.map((s) => s.id), svcId];
    await api.put('/providers/me/services', { serviceIds: ids });
    await load();
    flash();
  };

  const saveBusiness = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);
    await api.patch('/providers/me', {
      businessName: form.get('businessName') || null,
      description: form.get('description') || null,
      businessPhone: form.get('businessPhone') || null,
      pricingMode: form.get('pricingMode'),
      priceAmount: form.get('priceAmount') ? Number(form.get('priceAmount')) : null,
    });
    await load();
    flash();
  };

  const uploadPhotos = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const form = new FormData();
    files.forEach((f) => form.append('photos', f));
    await api.post('/providers/me/photos', form);
    await load();
  };

  const deletePhoto = async (id) => {
    await api.delete(`/providers/me/photos/${id}`);
    await load();
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">Services & Profile</h1>
        {saved && <span className="text-sm text-emerald-600">{saved}</span>}
      </div>

      <section className="rounded-2xl border border-ink-900/8 bg-white p-5 shadow-card">
        <h2 className="font-medium mb-2">Categories</h2>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button key={c.id} onClick={() => toggleCategory(c.id)}
              className={`rounded-full border px-3 py-1.5 text-sm ${me.categories.some((x) => x.id === c.id) ? 'border-ember-500 bg-ember-50' : 'border-ink-900/10'}`}>
              {c.icon} {c.name}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-ink-900/8 bg-white p-5 shadow-card">
        <h2 className="font-medium mb-2">Services</h2>
        {me.categories.map((cat) => (
          <div key={cat.id} className="mb-2">
            <p className="text-xs text-ink-700/60 mb-1">{cat.name}</p>
            <div className="flex flex-wrap gap-2">
              {(servicesByCategory[cat.id] || []).map((s) => (
                <button key={s.id} onClick={() => toggleService(s.id)}
                  className={`rounded-full border px-3 py-1 text-sm ${me.services.some((x) => x.id === s.id) ? 'border-ember-500 bg-ember-50' : 'border-ink-900/10'}`}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <form onSubmit={saveBusiness} className="rounded-2xl border border-ink-900/8 bg-white p-5 shadow-card space-y-2">
        <h2 className="font-medium mb-1">Business info & pricing</h2>
        <input name="businessName" defaultValue={me.provider.business_name || ''} placeholder="Business name" className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm" />
        <textarea name="description" defaultValue={me.provider.description || ''} placeholder="Description" rows={3} className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm" />
        <input name="businessPhone" defaultValue={me.provider.business_phone || ''} placeholder="Phone" className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm" />
        <div className="flex gap-2">
          <select name="pricingMode" defaultValue={me.provider.pricing_mode} className="rounded-lg border border-ink-900/15 px-3 py-2 text-sm">
            <option value="hidden">Don't publish pricing (Request a Quote)</option>
            <option value="fixed">Fixed price</option>
            <option value="starting">Starting price</option>
            <option value="hourly">Hourly price</option>
          </select>
          <input name="priceAmount" type="number" step="0.01" defaultValue={me.provider.price_amount || ''} placeholder="Amount" className="w-32 rounded-lg border border-ink-900/15 px-3 py-2 text-sm" />
        </div>
        <button className="rounded-full bg-ember-500 px-5 py-2 text-sm font-semibold text-white hover:bg-ember-600">Save</button>
      </form>

      <section className="rounded-2xl border border-ink-900/8 bg-white p-5 shadow-card">
        <h2 className="font-medium mb-2">Portfolio photos</h2>
        <label className="inline-block rounded-full border border-ink-900/15 px-4 py-2 text-sm hover:bg-ink-900/5 cursor-pointer">
          Upload photos
          <input type="file" accept="image/*" multiple hidden onChange={uploadPhotos} />
        </label>
        <div className="grid grid-cols-4 gap-2 mt-3">
          {me.photos.map((p) => (
            <div key={p.id} className="relative group">
              <img src={p.url} className="aspect-square rounded-lg object-cover" alt="" />
              <button onClick={() => deletePhoto(p.id)} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white text-xs opacity-0 group-hover:opacity-100">✕</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
