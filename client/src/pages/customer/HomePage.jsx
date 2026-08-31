import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import api from '../../api/client.js';
import CategoryCard from '../../components/CategoryCard.jsx';
import Spinner from '../../components/Spinner.jsx';
import { useLocation as useTaskoraLocation } from '../../context/LocationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

export default function HomePage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [history, setHistory] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const { locked } = useTaskoraLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (user.current_mode === 'provider') return;
    api.get('/categories').then(({ data }) => setCategories(data.categories));
    api.get('/search/history').then(({ data }) => setHistory(data.history)).catch(() => {});
  }, [user.current_mode]);

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
          {locked ? 'Tell Taskora what you need and we\'ll find the right local pro.' : 'Set your location, then tell us what you need.'}
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
        <h2 className="font-display text-2xl mb-4">Browse categories</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {categories.map((c) => (
            <CategoryCard key={c.id} category={c} />
          ))}
        </div>
      </section>
    </div>
  );
}
