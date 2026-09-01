import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client.js';
import CategoryCard from '../../components/CategoryCard.jsx';
import Spinner from '../../components/Spinner.jsx';

/** The full "See All Services" directory — every active category, grouped by section, searchable. */
export default function CategoryDirectoryPage() {
  const [params] = useSearchParams();
  const focusGroup = params.get('group');
  const [groups, setGroups] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    api.get('/categories/groups').then(({ data }) => setGroups(data.groups));
  }, []);

  const q = query.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!groups) return [];
    let list = groups;
    if (focusGroup && !q) list = list.filter((g) => g.slug === focusGroup);
    if (q) {
      list = list
        .map((g) => ({
          ...g,
          categories: g.categories.filter(
            (c) => c.name.toLowerCase().includes(q) || (c.keywords || []).some((k) => k.toLowerCase().includes(q))
          ),
        }))
        .filter((g) => g.categories.length > 0);
    }
    return list;
  }, [groups, q, focusGroup]);

  return (
    <div>
      <h1 className="font-display text-2xl mb-1">All services</h1>
      <p className="text-ink-700/60 text-sm mb-4">Browse every service category on Taskora, or search for exactly what you need.</p>

      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search all services…"
        className="mb-8 w-full max-w-md rounded-full border border-ink-900/15 px-4 py-2.5 text-sm outline-none focus:border-ember-400"
      />

      {!groups && <div className="flex justify-center py-16"><Spinner size={28} /></div>}

      <div className="space-y-8">
        {visibleGroups.map((g) => (
          <div key={g.slug}>
            <h2 className="font-display text-lg mb-3">{g.name}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {g.categories.map((c) => (
                <CategoryCard key={c.id} category={c} />
              ))}
            </div>
          </div>
        ))}
        {groups && visibleGroups.length === 0 && (
          <p className="text-sm text-ink-700/60">No services match "{query}".</p>
        )}
      </div>
    </div>
  );
}
