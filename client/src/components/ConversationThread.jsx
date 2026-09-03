import { useEffect, useRef, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCall } from '../context/CallContext.jsx';
import QuoteMessageCard from './QuoteMessageCard.jsx';
import QuoteRequestCard from './QuoteRequestCard.jsx';
import Spinner from './Spinner.jsx';

export default function ConversationThread({ conversationId }) {
  const { user } = useAuth();
  const { callState, startCall } = useCall();
  const [messages, setMessages] = useState(null);
  const [other, setOther] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const load = async () => {
    const { data } = await api.get(`/messages/conversations/${conversationId}/messages`);
    setMessages(data.messages);
  };

  const loadOther = async () => {
    try {
      const { data } = await api.get(`/messages/conversations/${conversationId}`);
      setOther(data.conversation?.other || null);
    } catch {
      setOther(null);
    }
  };

  useEffect(() => {
    load();
    loadOther();
    const interval = setInterval(load, 6000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages?.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await api.post(`/messages/conversations/${conversationId}/messages`, { body: text.trim() });
      setText('');
      await load();
    } finally {
      setSending(false);
    }
  };

  if (!messages) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] rounded-2xl border border-ink-900/8 bg-white shadow-card overflow-hidden">
      {other && (
        <div className="flex items-center justify-between border-b border-ink-900/8 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {other.avatarUrl ? (
              <img src={other.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-900/5 text-sm font-medium text-ink-700/70">
                {other.name?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <span className="truncate font-medium text-ink-900">{other.name}</span>
          </div>
          <button
            onClick={() => startCall(conversationId, other.name)}
            disabled={callState !== 'idle'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ember-500 text-white hover:bg-ember-600 disabled:opacity-40"
            aria-label={`Call ${other.name}`}
            title={`Call ${other.name}`}
          >
            📞
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
        {messages.map((m) => {
          const mine = m.sender_user_id === user.id;
          if (m.type === 'quote_request') {
            return <div key={m.id} className="flex justify-start"><QuoteRequestCard quoteRequestId={m.metadata?.quoteRequestId} body={m.body} /></div>;
          }
          if (m.type === 'quote') {
            return <div key={m.id} className="flex justify-start"><QuoteMessageCard quoteId={m.metadata?.quoteId} /></div>;
          }
          if (m.type === 'invoice') {
            return (
              <div key={m.id} className="flex justify-start">
                <a href={m.metadata?.pdfPath} target="_blank" rel="noreferrer"
                  className="rounded-xl border border-ink-900/10 bg-white p-3 text-sm hover:border-ember-300">
                  📄 {m.body} — <span className="text-ember-600 font-medium">Download PDF</span>
                </a>
              </div>
            );
          }
          if (['system', 'auto_reply', 'job_update', 'payment_update', 'completion_request', 'job_request'].includes(m.type)) {
            return (
              <div key={m.id} className="flex justify-center">
                <span className="rounded-full bg-ink-900/5 px-3 py-1 text-xs text-ink-700/70">{m.body}</span>
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${mine ? 'bg-ember-500 text-white' : 'bg-ink-900/5 text-ink-900'}`}>
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-ink-900/8 p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-full border border-ink-900/15 px-4 py-2 text-sm outline-none focus:border-ember-400"
        />
        <button disabled={sending} className="rounded-full bg-ink-900 px-5 py-2 text-sm font-semibold text-white hover:bg-ink-800 disabled:opacity-60">
          Send
        </button>
      </form>
    </div>
  );
}
