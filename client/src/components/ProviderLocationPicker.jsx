import { useEffect, useRef, useState } from 'react';
import api from '../api/client.js';

// A self-contained "search city/ZIP/address -> pick -> get {label, lat, lng}"
// input for provider forms (the onboarding wizard's "Service area" step, and
// the post-onboarding Availability & Service Area settings page).
//
// Deliberately NOT the customer-side LocationControl/LocationContext pair --
// those write to the CUSTOMER's own profile location (POST /location/lock).
// A provider's base location is a completely different field
// (providers.base_lat/base_lng, set via PUT /providers/me/service-area).
// This component only ever resolves a place to real coordinates and hands
// them to the caller via onChange({ label, lat, lng }) -- it never persists
// anything itself, so the caller stays in control of when/how it's saved.
export default function ProviderLocationPicker({ value, onChange, placeholder = 'Search city, ZIP, or address' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');
  const boxRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      if (query.trim().length < 2) return setResults([]);
      try {
        const { data } = await api.get('/location/search', { params: { q: query } });
        setResults(data.results);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, open]);

  const pick = (place) => {
    onChange(place);
    setOpen(false);
    setQuery('');
    setResults([]);
  };

  const useMyLocation = () => {
    setLocateError('');
    if (!('geolocation' in navigator)) {
      setLocateError("Your browser doesn't support location detection. Search instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude: lat, longitude: lng } = position.coords;
          const { data } = await api.get('/location/reverse', { params: { lat, lng } });
          pick(data.location);
        } catch {
          setLocateError("Couldn't detect your location. Try again or search instead.");
        } finally {
          setLocating(false);
        }
      },
      (geoError) => {
        setLocating(false);
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setLocateError('Location permission was denied. Search for your city or ZIP instead.');
        } else if (geoError.code === geoError.TIMEOUT) {
          setLocateError('Timed out getting your location. Try again or search instead.');
        } else {
          setLocateError("Couldn't detect your location. Try again or search instead.");
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  };

  const hasCoords = value?.lat != null && value?.lng != null;

  return (
    <div className="relative" ref={boxRef}>
      {hasCoords ? (
        <div className="flex items-center gap-2 rounded-lg border border-ink-900/15 px-3 py-2 text-sm">
          <span>📍</span>
          <span className="flex-1 truncate">{value.label}</span>
          <button type="button" onClick={() => setOpen(true)} className="shrink-0 text-xs font-medium text-ember-600 hover:underline">
            Change
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-lg border border-ink-900/15 px-3 py-2 text-left text-sm text-ink-700/60 hover:border-ember-300"
        >
          <span>📍</span>
          {value?.label || placeholder}
        </button>
      )}
      {!hasCoords && (
        <p className="mt-1 text-xs text-red-600/80">
          Pick a real place from the search results so customers near you can actually find you.
        </p>
      )}

      {open && (
        <div className="absolute z-30 mt-2 w-full min-w-[18rem] rounded-xl border border-ink-900/10 bg-white p-2 shadow-pop">
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-ember-600 hover:bg-ember-50 disabled:opacity-60"
          >
            <span>{locating ? '⏳' : '🧭'}</span>
            {locating ? 'Finding your location…' : 'Use my current location'}
          </button>
          {locateError && <p className="mb-1 px-3 text-xs text-red-600">{locateError}</p>}
          <div className="mb-1 border-t border-ink-900/8" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search city, ZIP, or address"
            className="w-full rounded-lg border border-ink-900/10 px-3 py-2 text-sm outline-none focus:border-ember-400"
          />
          <div className="mt-1 max-h-64 overflow-y-auto scrollbar-thin">
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => pick(r)}
                className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-ember-50"
              >
                <span className="mt-0.5">📍</span>
                <span>{r.label}</span>
              </button>
            ))}
            {query.trim().length >= 2 && results.length === 0 && (
              <p className="px-3 py-2 text-sm text-ink-700/60">No matches yet — keep typing.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
