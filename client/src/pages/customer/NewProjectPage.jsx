import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../api/client.js';
import { useLocation as useTaskoraLocation } from '../../context/LocationContext.jsx';
import Spinner from '../../components/Spinner.jsx';

// "Post a project" -- Instant Match. A brand-new way to reach providers,
// separate from search-then-message-one-provider: describe the job once and
// it's broadcast to several matching providers at a time, instead of the
// customer messaging them one by one. The existing search/message flow is
// completely untouched and still works exactly as it always has -- this is
// just a second door into the same providers.
export default function NewProjectPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { location } = useTaskoraLocation();

  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState(params.get('categoryId') || '');
  const [description, setDescription] = useState('');
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/categories').then(({ data }) => setCategories(data.categories)).finally(() => setLoadingCategories(false));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Describe what you need done.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post('/projects', {
        categoryId: categoryId ? Number(categoryId) : undefined,
        description: description.trim(),
        lat: location?.lat,
        lng: location?.lng,
        locationLabel: location?.label,
      });
      navigate(`/projects/${data.project.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-display text-2xl mb-1">Get quotes fast</h1>
      <p className="text-sm text-ink-700/60 mb-5">
        Describe your project once and we'll notify several matching providers near you right away — their quotes
        come back to one place so you can compare and pick.
      </p>

      {!location && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Set your location (top of the page) so we match providers who actually serve your area.
        </p>
      )}

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-ink-900/8 bg-white p-5 shadow-card">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink-800">What kind of service?</label>
          {loadingCategories ? (
            <Spinner size={18} />
          ) : (
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm outline-none focus:border-ember-400"
            >
              <option value="">Not sure / other</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-ink-800">Describe what you need done</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="e.g. Locked out of my apartment, need someone within the hour…"
            className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm outline-none focus:border-ember-400"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          disabled={submitting}
          className="w-full rounded-full bg-ember-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ember-600 disabled:opacity-60"
        >
          {submitting ? 'Sending to matching providers…' : 'Send to matching providers'}
        </button>
      </form>
    </div>
  );
}
