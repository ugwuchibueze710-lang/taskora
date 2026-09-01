import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { notificationRoute } from '../lib/notificationRoute.js';

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const boxRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get('/notifications');
      setItems(data.notifications);
      setUnread(data.unreadCount);
    } catch {
      /* not logged in yet or transient error — bell just stays quiet */
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const markAllRead = async () => {
    await api.post('/notifications/read-all');
    load();
  };

  const handleClick = async (n) => {
    if (!n.read_at) {
      api.post(`/notifications/${n.id}/read`).then(load).catch(() => {});
    }
    const path = notificationRoute(n, user?.current_mode);
    setOpen(false);
    if (path) navigate(path);
  };

  return (
    <div className="relative" ref={boxRef}>
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-full p-2 hover:bg-ink-900/5">
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ember-500 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-ink-900/10 bg-white shadow-pop animate-slideDown">
          <div className="flex items-center justify-between border-b border-ink-900/5 px-4 py-2">
            <span className="font-medium text-sm">Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-ember-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-700/60">You're all caught up.</p>}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`block w-full px-4 py-3 text-left text-sm border-b border-ink-900/5 last:border-0 hover:bg-ink-900/5 ${!n.read_at ? 'bg-ember-50/60' : ''}`}
              >
                <p className="font-medium text-ink-900">{n.title}</p>
                {n.body && <p className="text-ink-700/70 mt-0.5">{n.body}</p>}
                <p className="text-[11px] text-ink-700/40 mt-1">{new Date(n.created_at).toLocaleString()}</p>
              </button>
            ))}
          </div>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block text-center text-xs text-ember-600 py-2 hover:underline">
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
