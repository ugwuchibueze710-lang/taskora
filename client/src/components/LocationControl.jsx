import { useEffect, useRef, useState } from 'react';
import { useLocation as useAppLocation } from '../context/LocationContext.jsx';

export default function LocationControl() {
  const { locked, location, lock, unlock, searchPlaces, detectMyLocation } = useAppLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [justLocked, setJustLocked] = useState(false);
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
    if (!open || locked) return;
    const t = setTimeout(async () => {
      if (query.trim().length < 2) return setResults([]);
      try {
        setResults(await searchPlaces(query));
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, open, locked, searchPlaces]);

  const handlePick = async (place) => {
    await lock(place);
    setOpen(false);
    setQuery('');
    setJustLocked(true);
    setTimeout(() => setJustLocked(false), 450);
  };

  const handleUnlock = () => {
    unlock();
    setOpen(true);
  };

  const handleUseMyLocation = async () => {
    setLocateError('');
    setLocating(true);
    try {
      await detectMyLocation();
      setOpen(false);
      setQuery('');
      setJustLocked(true);
      setTimeout(() => setJustLocked(false), 450);
    } catch (err) {
      setLocateError(err.message);
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => (locked ? handleUnlock() : setOpen((o) => !o))}
        className="flex items-center gap-1.5 rounded-full border border-navy-900/10 bg-white px-3 py-1.5 text-sm font-medium text-navy-800 shadow-sm hover:border-accent-300 transition-colors"
      >
        <span className={justLocked ? 'animate-lockSnap inline-block' : 'inline-block'}>{locked ? '🔒' : '📍'}</span>
        <span className="max-w-[9rem] truncate">{location?.label || 'Set your location'}</span>
        {!locked && <span className="text-navy-700/40">▾</span>}
      </button>

      {open && !locked && (
        <div className="absolute z-30 mt-2 w-72 rounded-xl border border-navy-900/10 bg-white p-2 shadow-pop animate-slideDown">
          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={locating}
            className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-accent-600 hover:bg-accent-50 disabled:opacity-60"
          >
            <span>{locating ? '⏳' : '🧭'}</span>
            {locating ? 'Finding your location…' : 'Use my current location'}
          </button>
          {locateError && <p className="mb-1 px-3 text-xs text-red-600">{locateError}</p>}
          <div className="mb-1 border-t border-navy-900/8" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search city, ZIP, or address"
            className="w-full rounded-lg border border-navy-900/10 px-3 py-2 text-sm outline-none focus:border-accent-400"
          />
          <div className="mt-1 max-h-64 overflow-y-auto scrollbar-thin">
            {results.map((r, i) => (
              <button
                key={i}
                onClick={() => handlePick(r)}
                className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent-50"
              >
                <span className="mt-0.5">📍</span>
                <span>{r.label}</span>
              </button>
            ))}
            {query.trim().length >= 2 && results.length === 0 && (
              <p className="px-3 py-2 text-sm text-navy-700/60">No matches yet — keep typing.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
