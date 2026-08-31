import { useState } from 'react';
import api from '../api/client.js';

const REASONS = [
  ['not_completed', 'Job not completed'],
  ['incomplete', 'Job incomplete'],
  ['wrong_service', 'Wrong service'],
  ['payment_problem', 'Payment problem'],
  ['provider_unavailable', 'Provider unavailable'],
  ['other', 'Other'],
];

export default function DisputeForm({ jobId, onDone }) {
  const [reason, setReason] = useState('not_completed');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/disputes', { jobId, reason, description: description || undefined });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-red-200 bg-red-50 p-5 space-y-2 animate-popIn">
      <h3 className="font-medium text-red-800">Report a problem</h3>
      <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm">
        {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Tell us what happened"
        className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
        {busy ? 'Submitting…' : 'Submit Dispute'}
      </button>
      <p className="text-xs text-red-700/70">Our team will review this and reach out — this is not resolved automatically.</p>
    </form>
  );
}
