import { useEffect, useRef, useState } from 'react';
import api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function SettingsPage() {
  const { user, setUser, refresh } = useAuth();
  const [profile, setProfile] = useState(null);
  const [defaultMessage, setDefaultMessage] = useState('');
  const [saved, setSaved] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    api.get('/profile').then(({ data }) => {
      setProfile(data.profile);
      setDefaultMessage(data.profile.default_approach_message || '');
    });
  }, []);

  const uploadAvatar = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('avatar', file);
    const { data } = await api.post('/profile/avatar', form);
    setProfile((p) => ({ ...p, avatar_url: data.avatarUrl }));
  };

  const removeAvatar = async () => {
    await api.delete('/profile/avatar');
    setProfile((p) => ({ ...p, avatar_url: null }));
  };

  const saveSettings = async () => {
    await api.patch('/profile/settings', { defaultApproachMessage: defaultMessage });
    setSaved('Saved!');
    setTimeout(() => setSaved(''), 1500);
  };

  if (!profile) return null;

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="font-display text-2xl">Settings</h1>

      <div className="rounded-2xl border border-ink-900/8 bg-white p-5 shadow-card">
        <h2 className="font-medium mb-3">Profile picture</h2>
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-ember-100 overflow-hidden flex items-center justify-center font-display text-ember-600 text-xl">
            {profile.avatar_url ? <img src={profile.avatar_url} className="h-full w-full object-cover" alt="" /> : user.first_name[0]}
          </div>
          <div className="flex gap-2">
            <button onClick={() => fileRef.current.click()} className="rounded-full border border-ink-900/15 px-3 py-1.5 text-sm hover:bg-ink-900/5">
              Upload
            </button>
            {profile.avatar_url && (
              <button onClick={removeAvatar} className="rounded-full border border-ink-900/15 px-3 py-1.5 text-sm hover:bg-ink-900/5">
                Remove
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadAvatar} />
        </div>
      </div>

      <div className="rounded-2xl border border-ink-900/8 bg-white p-5 shadow-card">
        <h2 className="font-medium mb-2">Default approach message</h2>
        <p className="text-sm text-ink-700/60 mb-2">Pre-fills when you message a new provider. Optional — you can always edit or clear it.</p>
        <textarea
          value={defaultMessage}
          onChange={(e) => setDefaultMessage(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-ink-900/15 px-3 py-2 text-sm outline-none focus:border-ember-400"
        />
        <button onClick={saveSettings} className="mt-2 rounded-full bg-ember-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-ember-600">
          Save
        </button>
        {saved && <span className="ml-2 text-sm text-emerald-600">{saved}</span>}
      </div>
    </div>
  );
}
