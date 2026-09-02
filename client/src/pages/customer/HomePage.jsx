import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import CategoryCard from '../../components/CategoryCard.jsx';
import Spinner from '../../components/Spinner.jsx';
import { useLocation as useTaskoraLocation } from '../../context/LocationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const PER_GROUP_LIMIT = 8;

export default function HomePage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [categoryQuery, setCategoryQuery] = useState('');
  const [history, setHistory] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [featured, setFeatured] = useState([]);
  const [featuredIsDemandDriven, setFeaturedIsDemandDriven] = useState(false);
  const { locked, location } = useTaskoraLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (user.current_mode === 'provider') return;
    api.get('/categories/groups').then(({ data }) => setGroups(data.groups));
    api.get('/search/history').then(({ data }) => setHistory(data.history)).catch(() => {});
  }, [user.current_mode]);

  // Real per-city "trending" categories (category-demand.service.js on the
  // server), not a hardcoded list — a city with no search history yet, or
  // no location locked at all, gets the server's own sensible default
  // ordering back (isDemandDriven: false) rather than an empty section.
  useEffect(() => {
    if (user.current_mode === 'provider') return;
    api
      .get('/categories/featured', { params: location?.city ? { city: location.city } : {} })
      .then(({ data }) => {
        setFeatured(data.categories);
        setFeaturedIsDemandDriven(data.isDemandDriven);
      })
      .catch(() => {});
  }, [user.current_mode, location?.city]);


  const q = categoryQuery.trim().toLowerCase();
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

  // "/" is the customer home screen. A user currently in Provider Mode landing
  // here (e.g. after login) should see their provider dashboard instead —
  // otherwise switching modes and refreshing would silently dump them back
  // into the customer search screen. This check must come AFTER all hooks
  // above so hook order stays identical across renders (Rules of Hooks).
  if (user.current_mode === 'provider') return <Navigate to="/provider" replace />;

  const runSearch = async (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    try {
      navigate(`/search?q=${encodeURIComponent(text)}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteHistory = async (id, e) => {
    e.stopPropagation();
    await api.delete(`/search/history/${id}`);
    setHistory((h) => h.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-10">
      <section className="rounded-3xl bg-gradient-to-br from-ember-500 to-ember-700 px-6 py-12 text-center text-white shadow-pop">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold mb-2">Find someone who can do this.</h1>
        <p className="text-ember-50/90 mb-6">
          {locked
            ? `Searching near ${location?.label || 'your location'}. Tell Taskora what you need and we'll find the right local pro.`
            : 'Set your location, then tell us what you need — matching a customer to the right provider depends on both.'}
        </p>
        <form onSubmit={runSearch} className="mx-auto flex max-w-xl overflow-hidden rounded-full bg-white shadow-lg">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What do you need help with?"
            className="flex-1 px-5 py-4 text-ink-900 outline-none text-base"
          />
          <button disabled={loading} className="bg-ink-900 px-6 font-semibold text-white hover:bg-ink-800 transition">
            {loading ? <Spinner size={18} /> : 'Search'}
          </button>
        </form>

        {history.length > 0 && (
          <div className="mx-auto mt-4 flex max-w-xl flex-wrap justify-center gap-2">
            {history.slice(0, 6).map((h) => (
              <button
                key={h.id}
                onClick={() => navigate(`/search?q=${encodeURIComponent(h.query_text)}`)}
                className="group flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs text-white hover:bg-white/25"
              >
                {h.query_text}
                <span onClick={(e) => deleteHistory(h.id, e)} className="opacity-60 group-hover:opacity-100">✕</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3 gap-3">
          <h2 className="font-display text-2xl">Browse services</h2>
          <Link to="/services" className="text-sm font-medium text-ember-600 hover:text-ember-700 whitespace-nowrap">
            See all services →
          </Link>
        </div>
        <input
          value={categoryQuery}
          onChange={(e) => setCategoryQuery(e.target.value)}
          placeholder="Search services (e.g. locksmith, house cleaning, tutoring)"
          className="mb-5 w-full max-w-md rounded-full border border-ink-900/15 px-4 py-2.5 text-sm outline-none focus:border-ember-400"
        />

        {groups.length === 0 && (
          <div className="flex justify-center py-8"><Spinner size={24} /></div>
        )}

        {!q && featured.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-700/50 mb-3">
              {featuredIsDemandDriven && location?.city ? `Trending in ${location.city}` : 'Popular right now'}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {featured.map((c) => (
                <CategoryCard key={c.id} category={c} />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-8">
          {filteredGroups.map((g) => (
            <div key={g.slug}>
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-display text-lg">{g.name}</h3>
                {g.categories.length > PER_GROUP_LIMIT && !q && (
                  <Link to={`/services?group=${g.slug}`} className="text-xs font-medium text-ember-600 hover:text-ember-700">
                    See all {g.categories.length} →
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {(q ? g.categories : g.categories.slice(0, PER_GROUP_LIMIT)).map((c) => (
                  <CategoryCard key={c.id} category={c} />
                ))}
              </div>
            </div>
          ))}
          {q && filteredGroups.length === 0 && (
            <p className="text-sm text-ink-700/60">No services match "{categoryQuery}". Try a broader term, or use the search bar above.</p>
          )}
        </div>
      </section>
    </div>
  );
}
