import { useEffect, useState } from 'react';
import api from '../../api/client.js';
import Spinner from '../../components/Spinner.jsx';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ProviderAvailabilityPage() {
  const [mode, setMode] = useState('always');
  const [slots, setSlots] = useState([]);
  const [radiusMiles, setRadiusMiles] = useState(15);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState('');

  useEffect(() => {
    api.get('/providers/me').then(({ data }) => {
      setMode(data.provider.availability_mode);
      setSlots(
        data.availability.map((a) => ({ dayOfWeek: a.day_of_week, startTime: a.start_time.slice(0, 5), endTime: a.end_time.slice(0, 5) }))
      );
      setRadiusMiles(data.serviceArea?.radius_miles || data.provider.service_radius_miles);
      setLoaded(true);
    });
  }, []);

  const toggleDay = (day) => {
    setSlots((s) =>
      s.some((x) => x.dayOfWeek === day) ? s.filter((x) => x.dayOfWeek !== day) : [...s, { dayOfWeek: day, startTime: '09:00', endTime: '17:00' }]
    );
  };

  const updateSlotTime = (day, field, value) => {
    setSlots((s) => s.map((x) => (x.dayOfWeek === day ? { ...x, [field]: value } : x)));
  };

  const save = async () => {
    await api.put('/providers/me/availability', { mode, slots });
    await api.put('/providers/me/service-area', { radiusMiles });
    setSaved('Saved!');
    setTimeout(() => setSaved(''), 1500);
  };

  if (!loaded) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="font-display text-2xl">Availability & Service Area</h1>

      <div className="rounded-2xl border border-ink-900/8 bg-white p-5 shadow-card">
        <div className="flex gap-2 mb-3">
          <button onClick={() => setMode('always')} className={`rounded-full px-4 py-1.5 text-sm border ${mode === 'always' ? 'border-ember-500 bg-ember-50' : 'border-ink-900/10'}`}>
            Available All the Time
          </button>
          <button onClick={() => setMode('custom')} className={`rounded-full px-4 py-1.5 text-sm border ${mode === 'custom' ? 'border-ember-500 bg-ember-50' : 'border-ink-900/10'}`}>
            Set My Availability
          </button>
        </div>
        {mode === 'custom' && (
          <div className="space-y-1.5">
            {DAYS.map((d, i) => {
              const slot = slots.find((s) => s.dayOfWeek === i);
              return (
                <div key={i} className="flex items-center gap-2">
                  <button onClick={() => toggleDay(i)} className={`w-28 rounded-lg border px-2 py-1.5 text-sm text-left ${slot ? 'border-ember-500 bg-ember-50' : 'border-ink-900/10'}`}>
                    {d}
                  </button>
                  {slot && (
                    <>
                      <input type="time" value={slot.startTime} onChange={(e) => updateSlotTime(i, 'startTime', e.target.value)} className="rounded-lg border border-ink-900/15 px-2 py-1 text-sm" />
                      <span>–</span>
                      <input type="time" value={slot.endTime} onChange={(e) => updateSlotTime(i, 'endTime', e.target.value)} className="rounded-lg border border-ink-900/15 px-2 py-1 text-sm" />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-ink-900/8 bg-white p-5 shadow-card">
        <h2 className="font-medium mb-2">Service area</h2>
        <div className="flex gap-2 items-center">
          {[5, 10, 25].map((r) => (
            <button key={r} onClick={() => setRadiusMiles(r)} className={`rounded-full px-4 py-1.5 text-sm border ${radiusMiles === r ? 'border-ember-500 bg-ember-50' : 'border-ink-900/10'}`}>
              {r} mi
            </button>
          ))}
          <input type="number" min="1" value={radiusMiles} onChange={(e) => setRadiusMiles(Number(e.target.value))} className="w-20 rounded-full border border-ink-900/15 px-3 py-1.5 text-sm" />
        </div>
      </div>

      <button onClick={save} className="rounded-full bg-ember-500 px-6 py-2 text-sm font-semibold text-white hover:bg-ember-600">Save</button>
      {saved && <span className="ml-2 text-sm text-emerald-600">{saved}</span>}
    </div>
  );
}
