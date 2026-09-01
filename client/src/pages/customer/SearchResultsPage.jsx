import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client.js';
import ProviderCard from '../../components/ProviderCard.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Spinner from '../../components/Spinner.jsx';
import { useLocation as useTaskoraLocation } from '../../context/LocationContext.jsx';

export default function SearchResultsPage() {
  const [params] = useSearchParams();
  const q = params.get('q');
  const categoryId = params.get('categoryId');
  const categoryName = params.get('categoryName');
  const { location } = useTaskoraLocation();

  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState([]);
  const [interpreted, setInterpreted] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError('');
      try {
        if (q) {
          const { data } = await api.post('/ai/search', { text: q });
          if (!cancelled) {
            setResults(data.results);
            setInterpreted(data.interpreted);
          }
        } else {
          const { data } = await api.post('/search', {
            categoryId: categoryId ? Number(categoryId) : undefined,
            lat: location?.lat,
            lng: location?.lng,
          });
          if (!cancelled) {
            setResults(data.results);
            setInterpreted(null);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [q, categoryId, location?.lat, location?.lng]);

  return (
    <div>
      <h1 className="font-display text-2xl mb-1">{q ? `Results for "${q}"` : categoryName || 'All providers'}</h1>
      {interpreted && (
        <p className="text-sm text-ink-700/60 mb-4">
          Searching {interpreted.keywords?.length ? `for "${interpreted.keywords.join(', ')}"` : 'nearby providers'}
          {interpreted.dayOfWeek != null && ` · available ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][interpreted.dayOfWeek]}`}
          {interpreted.budgetMax && ` · under $${interpreted.budgetMax}`}
        </p>
      )}
      {!location && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Set your location (top of the page) so we only show providers who actually serve your area — without it, results aren't filtered by distance.
        </p>
      )}

      {loading && <div className="flex justify-center py-16"><Spinner size={28} /></div>}
      {!loading && error && <p className="text-red-600">{error}</p>}
      {!loading && !error && results.length === 0 && (
        <EmptyState
          icon="🧭"
          title="No providers found in this area."
          hint="Try expanding your search area, choosing a broader category, or rewording your request."
        />
      )}
      {!loading && !error && results.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {results.map((p) => (
            <ProviderCard key={p.id} provider={p} />
          ))}
        </div>
      )}
    </div>
  );
}
