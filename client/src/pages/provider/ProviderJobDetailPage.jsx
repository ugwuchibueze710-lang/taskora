import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../api/client.js';
import Spinner from '../../components/Spinner.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import DisputeForm from '../../components/DisputeForm.jsx';

export default function ProviderJobDetailPage() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showDispute, setShowDispute] = useState(false);

  const load = () => api.get(`/jobs/${id}`).then(({ data }) => setJob(data.job));
  useEffect(() => { load(); }, [id]);

  const act = async (action, payload) => {
    setBusy(true);
    setNotice('');
    try {
      await api.post(`/jobs/${id}/${action}`, payload);
      await load();
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!job) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl">{job.customer_first_name} {job.customer_last_name}</h1>
        <StatusBadge status={job.status} />
      </div>

      <div className="rounded-2xl border border-ink-900/8 bg-white p-5 shadow-card space-y-2">
        <p className="text-ink-700/80">{job.service_description}</p>
        <div className="pt-2 border-t border-ink-900/8 text-sm space-y-1">
          <div className="flex justify-between"><span>Service price</span><span>${job.price}</span></div>
          <div className="flex justify-between text-ink-700/60"><span>Taskora fee (10%)</span><span>-${job.platform_fee}</span></div>
          <div className="flex justify-between font-semibold"><span>You receive</span><span>${job.provider_amount}</span></div>
        </div>
      </div>

      {notice && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</p>}

      <div className="flex flex-wrap gap-2">
        {job.status === 'paid' && (
          <>
            <button disabled={busy} onClick={() => act('accept')} className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
              Accept Job
            </button>
            <button disabled={busy} onClick={() => act('decline', { reason: 'Not available' })} className="rounded-full border border-red-200 px-5 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
              Decline
            </button>
          </>
        )}
        {job.status === 'provider_accepted' && (
          <button disabled={busy} onClick={() => act('start')} className="rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-white hover:bg-ink-800">
            Start Job
          </button>
        )}
        {['provider_accepted', 'in_progress'].includes(job.status) && (
          <button disabled={busy} onClick={() => act('mark-complete')} className="rounded-full bg-ember-500 px-5 py-2 text-sm font-semibold text-white hover:bg-ember-600">
            Mark Job Done
          </button>
        )}
        {['paid', 'provider_accepted', 'in_progress', 'provider_marked_complete', 'completed'].includes(job.status) && (
          <button onClick={() => setShowDispute((s) => !s)} className="rounded-full border border-ink-900/15 px-5 py-2 text-sm font-semibold hover:bg-ink-900/5">
            Report a Problem
          </button>
        )}
      </div>

      {showDispute && <DisputeForm jobId={id} onDone={() => setShowDispute(false)} />}

      {job.status === 'provider_marked_complete' && (
        <p className="text-sm text-ink-700/60">Waiting for the customer to confirm completion — your payout releases automatically once they do.</p>
      )}
      {job.status === 'completed' && (
        <p className="text-sm text-emerald-700">Job completed and payout processed (or pending your Stripe Connect setup).</p>
      )}
    </div>
  );
}
