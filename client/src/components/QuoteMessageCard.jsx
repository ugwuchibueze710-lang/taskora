import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function QuoteMessageCard({ quoteId }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = () => api.get(`/quotes/${quoteId}`).then(({ data }) => setQuote(data.quote)).catch(() => {});
  useEffect(() => { load(); }, [quoteId]);

  if (!quote) return null;
  const isCustomer = user.current_mode === 'customer';

  const accept = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/quotes/${quoteId}/accept`);
      setNotice('Quote accepted! Opening your job…');
      setTimeout(() => navigate(`/jobs/${data.job.id}`), 700);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };
  const decline = async () => {
    setBusy(true);
    try {
      await api.post(`/quotes/${quoteId}/decline`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-ember-200 bg-ember-50 p-3 max-w-sm">
      <p className="text-xs font-semibold text-ember-700 uppercase tracking-wide">Quote</p>
      <p className="text-2xl font-display text-ink-900">${quote.price}</p>
      {quote.description && <p className="text-sm text-ink-700/80 mt-1">{quote.description}</p>}
      {quote.scheduled_date && (
        <p className="text-xs text-ink-700/60 mt-1">Scheduled: {new Date(quote.scheduled_date).toLocaleDateString()}</p>
      )}
      <p className="text-xs mt-1 text-ink-700/60">Status: {quote.status}</p>
      {isCustomer && quote.status === 'sent' && (
        <div className="mt-2 flex gap-2">
          <button disabled={busy} onClick={accept} className="rounded-full bg-ember-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-ember-600">
            Accept
          </button>
          <button disabled={busy} onClick={decline} className="rounded-full border border-ink-900/15 px-3 py-1.5 text-xs font-semibold hover:bg-ink-900/5">
            Decline
          </button>
        </div>
      )}
      {notice && <p className="text-xs mt-1 text-ink-700">{notice}</p>}
    </div>
  );
}
