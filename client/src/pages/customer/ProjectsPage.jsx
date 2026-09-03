import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client.js';
import EmptyState from '../../components/EmptyState.jsx';
import Spinner from '../../components/Spinner.jsx';

export default function ProjectsPage() {
  const [projects, setProjects] = useState(null);

  useEffect(() => {
    api.get('/projects').then(({ data }) => setProjects(data.projects));
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl">Your projects</h1>
        <Link to="/projects/new" className="rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-white hover:bg-ember-600">
          + Post a project
        </Link>
      </div>

      {!projects && <div className="flex justify-center py-16"><Spinner size={28} /></div>}

      {projects && projects.length === 0 && (
        <EmptyState
          icon="📋"
          title="No projects posted yet."
          hint="Describe a job once and we'll send it to several matching providers at once, instead of messaging them one by one."
          action={
            <Link to="/projects/new" className="rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-white hover:bg-ember-600">
              Post your first project
            </Link>
          }
        />
      )}

      {projects && projects.length > 0 && (
        <div className="space-y-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/projects/${p.id}`}
              className="block rounded-2xl border border-ink-900/8 bg-white p-4 shadow-card hover:border-ember-300"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink-900">{p.category_name || 'General project'}</span>
                <span className="text-xs text-ink-700/50">{new Date(p.created_at).toLocaleDateString()}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-ink-700/70">{p.description}</p>
              <p className="mt-2 text-xs text-ink-700/60">
                Sent to {p.providers_matched} provider{p.providers_matched === '1' ? '' : 's'} ·{' '}
                {p.quotes_received} quote{p.quotes_received === '1' ? '' : 's'} received
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
