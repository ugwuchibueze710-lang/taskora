import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../../api/client.js';
import Spinner from '../../components/Spinner.jsx';
import SafeImage from '../../components/SafeImage.jsx';
import EmptyState from '../../components/EmptyState.jsx';

// Side-by-side quote comparison for one posted project. This is read-only --
// accepting/declining a quote still happens on the existing conversation
// thread (QuoteMessageCard.jsx), completely unchanged; this page only links
// there so there's exactly one place in the app that actually accepts a
// quote, rather than a second copy of that logic to keep in sync.
export default function ProjectDetailPage() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get(`/projects/${id}`)
      .then(({ data }) => {
        setProject(data.project);
        setRequests(data.requests);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!project) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  return (
    <div>
      <Link to="/projects" className="text-sm text-ink-700/60 hover:text-ink-900">&larr; Your projects</Link>
      <h1 className="font-display text-2xl mt-2 mb-1">{project.category_name || 'Your project'}</h1>
      <p className="text-sm text-ink-700/70 mb-6">{project.description}</p>

      {requests.length === 0 && (
        <EmptyState
          icon="🧭"
          title="No providers matched in your area yet."
          hint="No one serving your area for this category has a profile set up right now — try a broader category, or search directly instead."
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {requests.map((r) => (
          <div key={r.quote_request_id} className="rounded-2xl border border-ink-900/8 bg-white p-4 shadow-card">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-ink-900/5 text-sm font-medium text-ink-700/70">
                <SafeImage src={r.image_url} className="h-full w-full object-cover" fallback={r.provider_name?.[0]?.toUpperCase() || '?'} />
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-900">{r.provider_name}</p>
                {r.rating_count > 0 && (
                  <p className="text-xs text-ink-700/60">★ {Number(r.rating_avg).toFixed(1)} ({r.rating_count})</p>
                )}
              </div>
            </div>

            {r.quote_id ? (
              <div className="mt-3">
                <p className="text-2xl font-display text-ink-900">${r.price}</p>
                {r.quote_description && <p className="mt-1 text-sm text-ink-700/70">{r.quote_description}</p>}
                <p className="mt-1 text-xs text-ink-700/60">Status: {r.quote_status}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-700/60">
                {r.request_status === 'declined' ? 'This provider declined.' : 'Waiting on a quote…'}
              </p>
            )}

            <Link
              to={`/messages/${r.conversation_id}`}
              className="mt-3 inline-block rounded-full bg-ink-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-ink-800"
            >
              {r.quote_id ? 'View & respond' : 'View conversation'}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
