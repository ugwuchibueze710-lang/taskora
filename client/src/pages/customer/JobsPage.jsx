import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client.js';
import EmptyState from '../../components/EmptyState.jsx';
import Spinner from '../../components/Spinner.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';

export default function JobsPage() {
  const [jobs, setJobs] = useState(null);

  useEffect(() => {
    api.get('/jobs').then(({ data }) => setJobs(data.jobs));
  }, []);

  if (!jobs) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;
  if (jobs.length === 0) return <EmptyState icon="🧾" title="Your next project starts here." hint="Once you accept a quote, your jobs will show up here." />;

  return (
    <div>
      <h1 className="font-display text-2xl mb-4">Your Jobs</h1>
      <div className="space-y-2">
        {jobs.map((j) => (
          <Link key={j.id} to={`/jobs/${j.id}`} className="flex items-center justify-between rounded-xl border border-ink-900/8 bg-white p-4 shadow-card hover:border-ember-300">
            <div>
              <p className="font-medium">{j.provider_name}</p>
              <p className="text-sm text-ink-700/60">{j.service_description}</p>
            </div>
            <div className="text-right">
              <p className="font-display text-lg">${j.price}</p>
              <StatusBadge status={j.status} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
