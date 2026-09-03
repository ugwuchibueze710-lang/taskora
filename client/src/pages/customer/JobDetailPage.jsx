import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import api from '../../api/client.js';
import Spinner from '../../components/Spinner.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import ReviewForm from '../../components/ReviewForm.jsx';
import DisputeForm from '../../components/DisputeForm.jsx';

export default function JobDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [job, setJob] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(params.get('payment') === 'cancelled' ? 'Checkout was cancelled — you were not charged.' : '');
  const [showDispute, setShowDispute] = useState(false);

  const load = async () => {
    const { data } = await api.get(`/jobs/${id}`);
    setJob(data.job);
    if (data.job.status === 'completed') {
      api.get(`/invoices/job/${id}`).then(({ data }) => setInvoice(data.invoice)).catch(() => {});
    }
  };

  useEffect(() => { load(); }, [id]);

  const pay = async () => {
    setBusy(true);
    setNotice('');
    try {
      const { data } = await api.post(`/payments/checkout/${id}`);
      window.location.href = data.url;
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmCompletion = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/jobs/${id}/confirm`);
      setJob(data.job);
      if (data.warning) setNotice(data.warning);
      await load();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!confirm('Cancel this job? If you already paid, funds still held by Taskora will be refunded automatically.')) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/jobs/${id}/cancel`, { reason: 'Cancelled by customer' });
      setJob(data.job);
      setNotice(data.refunded ? 'Job cancelled and refunded.' : 'Job cancelled.');
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!job) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  const canPay = job.status === 'quote_accepted';
  const canConfirm = job.status === 'provider_marked_complete';
  const canCancel = ['quote_accepted', 'payment_pending', 'paid', 'provider_accepted', 'in_progress'].includes(job.status);
  const canDispute = ['paid', 'provider_accepted', 'in_progress', 'provider_marked_complete', 'completed'].includes(job.status);
  const canReview = job.status === 'completed';

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">{job.provider_name}</h1>
        <StatusBadge status={job.status} />
      </div>

      <div className="rounded-2xl border border-ink-900/8 bg-white p-5 shadow-card space-y-2">
        <p className="text-ink-700/80">{job.service_description}</p>
        {job.scheduled_date && <p className="text-sm text-ink-700/60">Scheduled: {new Date(job.scheduled_date).toLocaleDateString()}</p>}
        <div className="pt-2 border-t border-ink-900/8 text-sm space-y-1">
          <div className="flex justify-between font-semibold"><span>Total you pay</span><span>${Number(job.price).toFixed(2)}</span></div>
        </div>
      </div>

      {notice && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}

      <div className="flex flex-wrap gap-2">
        {canPay && (
          <button disabled={busy} onClick={pay} className="rounded-full bg-ember-500 px-5 py-2 text-sm font-semibold text-white hover:bg-ember-600 disabled:opacity-60">
            {busy ? 'Redirecting…' : `Pay $${Number(job.price).toFixed(2)} to confirm`}
          </button>
        )}
        {canConfirm && (
          <button disabled={busy} onClick={confirmCompletion} className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            Confirm Completion
          </button>
        )}
        {canCancel && (
          <button disabled={busy} onClick={cancel} className="rounded-full border border-red-200 px-5 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
            Cancel Job
          </button>
        )}
        {canDispute && (
          <button onClick={() => setShowDispute((s) => !s)} className="rounded-full border border-ink-900/15 px-5 py-2 text-sm font-semibold hover:bg-ink-900/5">
            Report a Problem
          </button>
        )}
      </div>

      {showDispute && <DisputeForm jobId={id} onDone={() => setShowDispute(false)} redirectTo="/jobs" />}

      {invoice && (
        <a href={invoice.pdf_path} target="_blank" rel="noreferrer" className="block rounded-xl border border-ink-900/10 bg-white p-4 text-sm hover:border-ember-300">
          📄 Invoice {invoice.invoice_number} — <span className="text-ember-600 font-medium">Download PDF</span>
        </a>
      )}

      {canReview && !review && <ReviewForm jobId={id} onSubmitted={setReview} />}
      {review && <p className="text-sm text-emerald-700">Thanks for your review!</p>}
    </div>
  );
}
