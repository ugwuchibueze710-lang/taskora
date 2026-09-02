import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../api/client.js';
import EmptyState from '../../components/EmptyState.jsx';
import Spinner from '../../components/Spinner.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';

export default function ProviderJobsPage() {
  const [jobs, setJobs] = useState(null);
  const [params] = useSearchParams();
  const justReported = params.get('reported') === '1';

  useEffect(() => {
    api.get('/jobs').then(({ data }) => setJobs(data.jobs));
  }, []);

  if (!jobs) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  const reportedNotice = justReported && (
    <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      Your report was sent. Our team will review it and reach out.
    </p>
  );

  if (jobs.length === 0) {
    return (
      <div>
        {reportedNotice}
        <EmptyState icon="🧾" title="No jobs yet." hint="Accepted quotes will turn into jobs here." />
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl mb-4">Jobs</h1>
      {reportedNotice}
      <div className="space-y-2">
        {jobs.map((j) => (
          <Link key={j.id} to={`/provider/jobs/${j.id}`} className="flex items-center justify-between rounded-xl border border-ink-900/8 bg-white p-4 shadow-card hover:border-ember-300">
            <div>
              <p className="font-medium">{j.customer_first_name} {j.customer_last_name}</p>
              <p className="text-sm text-ink-700/60">{j.service_description}</p>
            </div>
            <div className="text-right">
              <p className="font-display text-lg">${j.provider_amount}</p>
              <StatusBadge status={j.status} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
