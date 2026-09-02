import { useEffect, useRef, useState } from 'react';
import api from '../api/client.js';
import Spinner from '../components/Spinner.jsx';

// General "Contact Taskora" channel -- available to every logged-in user in
// either mode, at all times, unlike the job-scoped "Report a problem" flow
// on a specific job's detail page (which requires an active/completed job
// with a specific provider -- see JobDetailPage.jsx / ProviderJobDetailPage.jsx).
export default function SupportPage() {
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const load = () => api.get('/support/messages/mine').then(({ data }) => setMessages(data.messages));
  useEffect(() => { load(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await api.post('/support/messages', { body: text.trim() });
      setText('');
      await load();
    } finally {
      setSending(false);
    }
  };

  if (!messages) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  return (
    <div className="max-w-xl">
      <h1 className="font-display text-2xl mb-1">Contact Support</h1>
      <p className="text-sm text-ink-700/60 mb-4">
        Questions, account issues, or anything else — message the Taskora team here. To report a specific job or
        provider/customer you've worked with, use "Report a problem" on that job's page instead.
      </p>

      <div className="rounded-2xl border border-ink-900/8 bg-white p-4 space-y-2 h-96 overflow-y-auto">
        {messages.length === 0 && <p className="text-sm text-ink-700/50">Send a message below to reach the Taskora team.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`rounded-xl p-3 text-sm max-w-[80%] ${m.sender === 'admin' ? 'bg-ink-900 text-white' : 'ml-auto bg-ember-50 text-ink-900'}`}>
            <p>{m.body}</p>
            <p className={`mt-1 text-[10px] ${m.sender === 'admin' ? 'text-white/60' : 'text-ink-700/40'}`}>
              {m.sender === 'admin' ? 'Taskora Support' : 'You'} · {new Date(m.created_at).toLocaleString()}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your message…"
          className="flex-1 rounded-lg border border-ink-900/15 px-3 py-2 text-sm outline-none focus:border-ember-400"
        />
        <button disabled={sending} className="rounded-full bg-ember-500 px-5 py-2 text-sm font-semibold text-white hover:bg-ember-600 disabled:opacity-60">
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
