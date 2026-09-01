import { useEffect, useMemo, useState } from 'react';
import api from '../api/client.js';

/**
 * The ONE searchable, grouped, unlimited-select category picker. Used by
 * both the provider onboarding wizard ("what services do you offer?") and
 * the post-signup Services Offered manager, so the two can never drift
 * apart into different category systems. Selection has no upper bound —
 * `selectedIds` can grow as large as the provider needs.
 */
export default function CategoryPicker({ selectedIds, onChange }) {
  const [groups, setGroups] = useState([]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/categories/groups').then(({ data }) => {
      setGroups(data.groups);
      // Open the first couple of sections by default so the picker doesn't
      // look empty; the rest expand on demand or when searching.
      const firstOpen = {};
      data.groups.slice(0, 2).forEach((g) => (firstOpen[g.slug] = true));
      setExpanded(firstOpen);
    }).finally(() => setLoading(false));
  }, []);

  const byId = useMemo(() => {
    const map = new Map();
    for (const g of groups) for (const c of g.categories) map.set(c.id, c);
    return map;
  }, [groups]);

  const q = query.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        categories: g.categories.filter(
          (c) => c.name.toLowerCase().includes(q) || (c.keywords || []).some((k) => k.toLowerCase().includes(q))
        ),
      }))
      .filter((g) => g.categories.length > 0);
  }, [groups, q]);

  const toggle = (id) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  const remove = (id) => onChange(selectedIds.filter((x) => x !== id));

  const toggleExpand = (slug) => setExpanded((e) => ({ ...e, [slug]: !e[slug] }));

  return (
    <div>
      {selectedIds.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const c = byId.get(id);
            if (!c) return null;
            return (
              <span key={id} className="flex items-center gap-1.5 rounded-full bg-ember-50 border border-ember-200 px-3 py-1 text-sm text-ember-700">
                <span aria-hidden>{c.icon}</span>
                {c.name}
                <button type="button" onClick={() => remove(id)} className="ml-0.5 text-ember-500 hover:text-ember-700" aria-label={`Remove ${c.name}`}>
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search services (e.g. locksmith, house cleaning, tutoring)"
        className="mb-3 w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm outline-none focus:border-ember-400"
      />

      {loading && <p className="text-sm text-ink-700/60">Loading categories…</p>}
      {!loading && groups.length === 0 && (
        <p className="text-sm text-red-600">No categories are available right now. Please try again shortly.</p>
      )}

      <div className="max-h-80 overflow-y-auto pr-1 space-y-1">
        {filteredGroups.map((g) => {
          const isOpen = q ? true : !!expanded[g.slug];
          return (
            <div key={g.slug} className="rounded-xl border border-ink-900/8">
              <button
                type="button"
                onClick={() => toggleExpand(g.slug)}
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-ink-800"
              >
                <span>{g.name} <span className="text-ink-700/40 font-normal">({g.categories.length})</span></span>
                <span className="text-ink-700/40">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div className="flex flex-wrap gap-2 px-3 pb-3">
                  {g.categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(c.id)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition ${
                        selectedIds.includes(c.id) ? 'border-ember-500 bg-ember-50 text-ember-700' : 'border-ink-900/10 hover:border-ink-900/25'
                      }`}
                    >
                      <span className="mr-1" aria-hidden>{c.icon}</span>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {q && filteredGroups.length === 0 && <p className="px-1 py-2 text-sm text-ink-700/60">No services match "{query}".</p>}
      </div>
    </div>
  );
}
