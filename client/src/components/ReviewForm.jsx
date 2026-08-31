import { useState } from 'react';
import api from '../api/client.js';

export default function ReviewForm({ jobId, onSubmitted }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/reviews', { jobId, rating, comment: comment || undefined });
      onSubmitted(data.review);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-ink-900/8 bg-white p-5 shadow-card space-y-2">
      <h3 className="font-medium">Leave a review</h3>
      <div className="flex gap-1 text-2xl">
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} onClick={() => setRating(n)} className={n <= rating ? 'text-ember-500' : 'text-ink-900/15'}>
            ★
          </button>
        ))}
      </div>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="How did it go?"
        className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm outline-none focus:border-ember-400" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className="rounded-full bg-ember-500 px-5 py-2 text-sm font-semibold text-white hover:bg-ember-600 disabled:opacity-60">
        {busy ? 'Submitting…' : 'Submit Review'}
      </button>
    </form>
  );
}
