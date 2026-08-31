import { useEffect, useState } from 'react';
import api from '../../api/client.js';
import Spinner from '../../components/Spinner.jsx';

export default function ProviderSettingsPage() {
  const [me, setMe] = useState(null);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
  const [autoReplyMessage, setAutoReplyMessage] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    api.get('/providers/me').then(({ data }) => {
      setMe(data);
      setAutoReplyEnabled(data.provider.auto_reply_enabled);
      setAutoReplyMessage(data.provider.auto_reply_message || '');
    });
  }, []);

  const save = async () => {
    await api.patch('/providers/me', { autoReplyEnabled, autoReplyMessage });
    setSaved('Saved!');
    setTimeout(() => setSaved(''), 1500);
  };

  if (!me) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="font-display text-2xl">Provider Settings</h1>
      <div className="rounded-2xl border border-ink-900/8 bg-white p-5 shadow-card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Automatic Reply</h2>
            <p className="text-sm text-ink-700/60">Sent once automatically when a customer first messages you.</p>
          </div>
          <button
            onClick={() => setAutoReplyEnabled((v) => !v)}
            className={`h-6 w-11 rounded-full transition ${autoReplyEnabled ? 'bg-ember-500' : 'bg-ink-900/15'} relative`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${autoReplyEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <textarea
          value={autoReplyMessage}
          onChange={(e) => setAutoReplyMessage(e.target.value)}
          rows={3}
          placeholder="Thanks for reaching out! I usually respond within a few hours..."
          className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm"
        />
        <button onClick={save} className="rounded-full bg-ember-500 px-5 py-2 text-sm font-semibold text-white hover:bg-ember-600">Save</button>
        {saved && <span className="ml-2 text-sm text-emerald-600">{saved}</span>}
      </div>
    </div>
  );
}
