import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import api from '../../api/client.js';
import Spinner from '../../components/Spinner.jsx';
import AvatarUploader from '../../components/AvatarUploader.jsx';
import SafeImage from '../../components/SafeImage.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

/**
 * The "wall" every user has, Facebook-style -- name above a big profile
 * picture, a short bio, and (only on your own) an inline edit affordance
 * right there instead of a separate settings screen. A provider's wall IS
 * their existing rich storefront (ProviderProfilePage) -- this page is the
 * part of the app that didn't have one yet: a plain customer account with
 * no provider profile. If the id this loads turns out to belong to a
 * provider, it hands off to that richer page instead of showing a thin
 * duplicate.
 */
export default function ProfileWallPage() {
  const { id } = useParams();
  const { user, setUser } = useAuth();
  const isOwn = user?.id === id;

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [firstNameDraft, setFirstNameDraft] = useState('');
  const [lastNameDraft, setLastNameDraft] = useState('');
  const [bioDraft, setBioDraft] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setData(null);
    setError('');
    const req = isOwn ? api.get('/profile') : api.get(`/users/${id}`);
    req
      .then(({ data: res }) => setData(isOwn ? res.profile : res.user))
      .catch((e) => setError(e.message));
  }, [id, isOwn]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  // A provider's wall is their existing storefront, which already shows
  // their name, photo, and business description -- never a second, thinner
  // profile page for the same person.
  if (data.provider_id) return <Navigate to={`/providers/${data.provider_id}`} replace />;

  const startEditing = () => {
    setFirstNameDraft(data.first_name || '');
    setLastNameDraft(data.last_name || '');
    setBioDraft(data.bio || '');
    setFormError('');
    setEditing(true);
  };

  const saveProfile = async () => {
    const firstName = firstNameDraft.trim();
    const lastName = lastNameDraft.trim();
    // first/last name are required by the API (unlike bio, which can be
    // cleared to an empty string) -- catch that here with a plain inline
    // message instead of letting the PATCH 400 with no visible feedback.
    if (!firstName || !lastName) {
      setFormError('First and last name are both required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const bio = bioDraft.trim();
      await api.patch('/profile', { firstName, lastName, bio });
      setData((d) => ({ ...d, first_name: firstName, last_name: lastName, bio }));
      setUser((u) => (u ? { ...u, first_name: firstName, last_name: lastName, bio } : u));
      setEditing(false);
    } catch (e) {
      setFormError(e.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const onAvatarDone = (avatarUrl) => {
    setData((d) => ({ ...d, avatar_url: avatarUrl }));
    // Keeps the nav avatar (which reads AuthContext, not this page's own
    // state) showing the new picture immediately, instead of only catching
    // up on the next full /auth/me refresh.
    setUser((u) => (u ? { ...u, avatar_url: avatarUrl } : u));
  };

  const joined = data.created_at
    ? new Date(data.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="mx-auto max-w-lg space-y-5 text-center">
      <div>
        <h1 className="font-display text-2xl">{data.first_name} {data.last_name}</h1>
        {joined && <p className="text-xs text-navy-700/50 mt-0.5">Member since {joined}</p>}
      </div>

      <div className="flex justify-center">
        {isOwn ? (
          <AvatarUploader
            avatarUrl={data.avatar_url}
            fallback={data.first_name?.[0]?.toUpperCase() || '?'}
            size={112}
            onDone={onAvatarDone}
          />
        ) : (
          <div className="h-28 w-28 overflow-hidden rounded-full bg-accent-100 flex items-center justify-center font-display text-3xl text-accent-600">
            <SafeImage src={data.avatar_url} className="h-full w-full object-cover" fallback={data.first_name?.[0]?.toUpperCase() || '?'} />
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-navy-900/8 bg-white p-5 text-left shadow-card">
        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-navy-700/60 mb-1">First name</label>
                <input
                  type="text"
                  value={firstNameDraft}
                  onChange={(e) => setFirstNameDraft(e.target.value)}
                  maxLength={80}
                  className="w-full rounded-lg border border-navy-900/15 px-3 py-2 text-sm outline-none focus:border-accent-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-navy-700/60 mb-1">Last name</label>
                <input
                  type="text"
                  value={lastNameDraft}
                  onChange={(e) => setLastNameDraft(e.target.value)}
                  maxLength={80}
                  className="w-full rounded-lg border border-navy-900/15 px-3 py-2 text-sm outline-none focus:border-accent-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-navy-700/60 mb-1">Bio</label>
              <textarea
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="Tell people a little about yourself..."
                className="w-full rounded-lg border border-navy-900/15 px-3 py-2 text-sm outline-none focus:border-accent-400"
              />
            </div>
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <button
                disabled={saving}
                onClick={saveProfile}
                className="rounded-full bg-accent-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                disabled={saving}
                onClick={() => setEditing(false)}
                className="rounded-full border border-navy-900/15 px-4 py-1.5 text-sm hover:bg-navy-900/5"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-navy-700/80 whitespace-pre-wrap">
              {data.bio || (isOwn ? 'Add a short bio so people know a bit about you.' : 'No bio yet.')}
            </p>
            {isOwn && (
              <button onClick={startEditing} className="mt-3 text-sm font-medium text-accent-600 hover:text-accent-700">
                Edit profile
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
