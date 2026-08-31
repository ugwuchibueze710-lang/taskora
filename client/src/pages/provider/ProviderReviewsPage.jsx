import { useEffect, useState } from 'react';
import api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StarRating from '../../components/StarRating.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Spinner from '../../components/Spinner.jsx';

export default function ProviderReviewsPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState(null);
  const [drafts, setDrafts] = useState({});

  const load = () => api.get(`/reviews/provider/${user.provider_id}`).then(({ data }) => setReviews(data.reviews));
  useEffect(() => { load(); }, []);

  const respond = async (reviewId) => {
    if (!drafts[reviewId]?.trim()) return;
    await api.post(`/reviews/${reviewId}/response`, { response: drafts[reviewId] });
    await load();
  };

  if (!reviews) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;
  if (reviews.length === 0) return <EmptyState icon="⭐" title="No reviews yet." hint="Reviews from completed jobs will show up here." />;

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="font-display text-2xl">Reviews</h1>
      {reviews.map((r) => (
        <div key={r.id} className="rounded-xl border border-ink-900/8 bg-white p-4 shadow-card">
          <div className="flex items-center justify-between">
            <StarRating rating={r.rating} />
            <span className="text-xs text-ink-700/50">{new Date(r.created_at).toLocaleDateString()}</span>
          </div>
          <p className="text-sm font-medium mt-1">{r.first_name} {r.last_name}</p>
          {r.comment && <p className="text-sm text-ink-700/80 mt-1">{r.comment}</p>}
          {r.provider_response ? (
            <div className="mt-2 rounded-lg bg-ink-900/5 p-2 text-sm"><span className="font-medium">Your response: </span>{r.provider_response}</div>
          ) : (
            <div className="mt-2 flex gap-2">
              <input
                value={drafts[r.id] || ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                placeholder="Write a response…"
                className="flex-1 rounded-lg border border-ink-900/15 px-2 py-1.5 text-sm"
              />
              <button onClick={() => respond(r.id)} className="rounded-lg border border-ink-900/15 px-3 py-1.5 text-sm hover:bg-ink-900/5">Reply</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
