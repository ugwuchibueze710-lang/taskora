import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client.js';
import EmptyState from '../../components/EmptyState.jsx';
import Spinner from '../../components/Spinner.jsx';
import SafeImage from '../../components/SafeImage.jsx';

export default function MessagesPage() {
  const [conversations, setConversations] = useState(null);

  useEffect(() => {
    const load = () => api.get('/messages/conversations').then(({ data }) => setConversations(data.conversations));
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, []);

  if (!conversations) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  if (conversations.length === 0) {
    return <EmptyState icon="💬" title="Your inbox is quiet." hint="Message a provider to start a conversation." />;
  }

  return (
    <div>
      <h1 className="font-display text-2xl mb-4">Messages</h1>
      <div className="divide-y divide-ink-900/8 rounded-2xl border border-ink-900/8 bg-white shadow-card overflow-hidden">
        {conversations.map((c) => (
          <Link key={c.id} to={`/messages/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ember-50/50">
            <div className="h-11 w-11 flex-shrink-0 rounded-full bg-ember-100 flex items-center justify-center font-display text-ember-600 overflow-hidden">
              <SafeImage src={c.image_url} className="h-full w-full object-cover" fallback={(c.provider_name || '?')[0]} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <p className="font-medium truncate">{c.provider_name}</p>
                <span className="text-xs text-ink-700/50">{new Date(c.last_message_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm text-ink-700/60 truncate">{c.last_message || 'No messages yet'}</p>
            </div>
            {Number(c.unread_count) > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-ember-500 px-1.5 text-xs font-bold text-white">
                {c.unread_count}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
