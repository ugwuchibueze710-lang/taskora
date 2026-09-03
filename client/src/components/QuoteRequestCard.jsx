import { useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function QuoteRequestCard({ quoteRequestId, body }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ price: '', description: '', scheduledDate: '', expiresInHours: 72 });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const isProvider = user.current_mode === 'provider';

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/quotes/requests/${quoteRequestId}/quote`, {
        price: Number(form.price),
        description: form.description || undefined,
        scheduledDate: form.scheduledDate || undefined,
        expiresInHours: Number(form.expiresInHours) || undefined,
      });
      setDone(true);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    try {
      await api.post(`/quotes/requests/${quoteRequestId}/decline`, {});
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-ink-900/10 bg-white p-3 max-w-sm">
      <p className="text-xs font-semibold text-ink-700/60 uppercase tracking-wide">Quote request</p>
      <p className="text-sm mt-1">{body}</p>
      {isProvider && !done && (
        <>
          {!open ? (
            <div className="mt-2 flex gap-2">
              <button onClick={() => setOpen(true)} className="rounded-full bg-ember-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-ember-600">
                Send Quote
              </button>
              <button disabled={busy} onClick={decline} className="rounded-full border border-ink-900/15 px-3 py-1.5 text-xs font-semibold hover:bg-ink-900/5">
                Decline
              </button>
            </div>
          ) : (
            <form onSubmit={send} className="mt-2 space-y-1.5">
              <input required type="number" min="1" step="0.01" placeholder="Price ($)" value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full rounded-lg border border-ink-900/15 px-2 py-1.5 text-sm" />
              {Number(form.price) > 0 && (
                <p className="text-xs text-ink-700/60">
                  The customer pays ${Number(form.price).toFixed(2)}. After Taskora's 5% fee, you'll receive $
                  {(Number(form.price) * 0.95).toFixed(2)}.
                </p>
              )}
              <textarea placeholder="Description" value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-lg border border-ink-900/15 px-2 py-1.5 text-sm" rows={2} />
              <input type="date" value={form.scheduledDate}
                onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
                className="w-full rounded-lg border border-ink-900/15 px-2 py-1.5 text-sm" />
              <button disabled={busy} className="w-full rounded-full bg-ember-500 py-1.5 text-xs font-semibold text-white hover:bg-ember-600">
                {busy ? 'Sending…' : 'Send Quote'}
              </button>
            </form>
          )}
        </>
      )}
      {done && <p className="text-xs mt-1 text-ink-700/60">Handled.</p>}
    </div>
  );
}
