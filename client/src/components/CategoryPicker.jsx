import { useEffect, useMemo, useState } from 'react';
import api from '../api/client.js';

/**
 * The ONE searchable, grouped, unlimited-select category picker. Used by
 * both the provider onboarding wizard ("what services do you offer?") and
 * the post-signup Services Offered manager, so the two can never drift
 * apart into different category systems. Selection has no upper bound —
 * `selectedIds` can grow as large as the provider needs.
 */
export default function CategoryPicker({ selectedIds, onChange, onCustomServiceAdded }) {
  const [groups, setGroups] = useState([]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(true);
  // "No section/category matches what you typed" doesn't mean the provider
  // can't offer it -- categories are a fixed, admin-curated list (so
  // customer search/browse stays clean and non-duplicated), but the
  // *specific services* under a category genuinely have no limit (see
  // services.is_custom + POST /providers/me/services/custom). This is the
  // one place that promise was broken: the search here only ever looked at
  // categories, with no way to fall through to "add it as a service under
  // a category you already picked" -- so a real, no-limit backend feature
  // was unreachable from the exact screen that advertises "there's no
  // limit". These three pieces of state back that fallback.
  const [customTargetId, setCustomTargetId] = useState(null);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customError, setCustomError] = useState('');
  const [customAdded, setCustomAdded] = useState('');

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

  const addCustomService = async () => {
    const targetId = customTargetId || selectedIds[0];
    const name = query.trim();
    if (!targetId || !name) return;
    setAddingCustom(true);
    setCustomError('');
    setCustomAdded('');
    try {
      const { data } = await api.post('/providers/me/services/custom', { categoryId: targetId, name });
      setCustomAdded(`Added "${data.service.name}" under ${byId.get(targetId)?.name || 'that category'}.`);
      onCustomServiceAdded?.(targetId, data.service);
      setQuery('');
    } catch (err) {
      setCustomError(err.message || 'Could not add that service.');
    } finally {
      setAddingCustom(false);
    }
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
              <span key={id} className="flex items-center gap-1.5 rounded-full bg-accent-50 border border-accent-200 px-3 py-1 text-sm text-accent-700">
                <span aria-hidden>{c.icon}</span>
                {c.name}
                <button type="button" onClick={() => remove(id)} className="ml-0.5 text-accent-500 hover:text-accent-700" aria-label={`Remove ${c.name}`}>
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
        className="mb-3 w-full rounded-lg border border-navy-900/15 px-3 py-2 text-sm outline-none focus:border-accent-400"
      />

      {loading && <p className="text-sm text-navy-700/60">Loading categories…</p>}
      {!loading && groups.length === 0 && (
        <p className="text-sm text-red-600">No categories are available right now. Please try again shortly.</p>
      )}

      <div className="max-h-80 overflow-y-auto pr-1 space-y-1">
        {filteredGroups.map((g) => {
          const isOpen = q ? true : !!expanded[g.slug];
          return (
            <div key={g.slug} className="rounded-xl border border-navy-900/8">
              <button
                type="button"
                onClick={() => toggleExpand(g.slug)}
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-navy-800"
              >
                <span>{g.name} <span className="text-navy-700/40 font-normal">({g.categories.length})</span></span>
                <span className="text-navy-700/40">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div className="flex flex-wrap gap-2 px-3 pb-3">
                  {g.categories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(c.id)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition ${
                        selectedIds.includes(c.id) ? 'border-accent-500 bg-accent-50 text-accent-700' : 'border-navy-900/10 hover:border-navy-900/25'
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
        {q && filteredGroups.length === 0 && (
          <div className="space-y-2 px-1 py-2">
            <p className="text-sm text-navy-700/60">No categories match "{query}".</p>
            {selectedIds.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-dashed border-accent-300 bg-accent-50/50 p-3">
                <p className="text-sm text-navy-700/70">
                  Offer this as a specific service instead? There's no limit on these.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedIds.length > 1 ? (
                    <select
                      value={customTargetId || selectedIds[0]}
                      onChange={(e) => setCustomTargetId(Number(e.target.value))}
                      className="rounded-lg border border-navy-900/15 px-2 py-1.5 text-sm"
                    >
                      {selectedIds.map((id) => (
                        <option key={id} value={id}>
                          {byId.get(id)?.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded-full bg-accent-100 px-3 py-1 text-sm font-medium text-accent-700">
                      {byId.get(selectedIds[0])?.name}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={addingCustom}
                    onClick={addCustomService}
                    className="rounded-full bg-accent-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-60"
                  >
                    {addingCustom ? 'Adding…' : `+ Add "${query}"`}
                  </button>
                </div>
                {customError && <p className="text-xs text-red-600">{customError}</p>}
                {customAdded && <p className="text-xs text-emerald-600">{customAdded}</p>}
              </div>
            ) : (
              <p className="text-xs text-navy-700/50">
                Pick a category above first — then you can add a specific custom service like this one under it, with no limit.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
