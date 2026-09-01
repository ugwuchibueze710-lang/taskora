import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import EmptyState from '../components/EmptyState.jsx';
import Spinner from '../components/Spinner.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { notificationRoute } from '../lib/notificationRoute.js';

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);

  const load = () => api.get('/notifications').then(({ data }) => setItems(data.notifications));
  useEffect(() => { load(); }, []);

  const markRead = async (id) => {
    await api.post(`/notifications/${id}/read`);
    load();
  };

  const handleClick = (n) => {
    if (!n.read_at) markRead(n.id);
    const path = notificationRoute(n, user?.current_mode);
    if (path) navigate(path);
  };

  if (!items) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;
  if (items.length === 0) return <EmptyState icon="🔔" title="No notifications yet." />;

  return (
    <div>
      <h1 className="font-display text-2xl mb-4">Notifications</h1>
      <div className="space-y-2">
        {items.map((n) => (
          <button
            key={n.id}
            onClick={() => handleClick(n)}
            className={`block w-full rounded-xl border p-4 text-left ${n.read_at ? 'border-ink-900/8 bg-white' : 'border-ember-200 bg-ember-50'}`}
          >
            <p className="font-medium">{n.title}</p>
            {n.body && <p className="text-sm text-ink-700/70 mt-0.5">{n.body}</p>}
            <p className="text-xs text-ink-700/40 mt-1">{new Date(n.created_at).toLocaleString()}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
