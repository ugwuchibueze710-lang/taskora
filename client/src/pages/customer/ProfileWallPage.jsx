import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import api from '../../api/client.js';
import Spinner from '../../components/Spinner.jsx';
import AvatarUploader from '../../components/AvatarUploader.jsx';
import CoverUploader from '../../components/CoverUploader.jsx';
import SafeImage from '../../components/SafeImage.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

function emptyEducationEntry() {
  return { school: '', degree: '', field: '', startYear: '', endYear: '' };
}

/**
 * The "wall" every user has, Facebook/LinkedIn-style -- a cover banner, a
 * big profile picture, name + an optional one-line headline, an About
 * section, and an optional repeatable Education section -- with (only on
 * your own) one inline edit affordance for all of it instead of a separate
 * settings screen. Every field past first/last name is explicitly
 * optional: a brand-new account with nothing filled in still renders a
 * clean, finished-looking page (gradient cover, empty-state prompts) rather
 * than a half-built one.
 *
 * A provider's wall IS their existing rich storefront (ProviderProfilePage)
 * -- this page is the part of the app that didn't have one yet: a plain
 * customer account with no provider profile. If the id this loads turns out
 * to belong to a provider, it hands off to that richer page instead of
 * showing a thin duplicate.
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
  const [headlineDraft, setHeadlineDraft] = useState('');
  const [bioDraft, setBioDraft] = useState('');
  const [educationDraft, setEducationDraft] = useState([]);
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

  const education = Array.isArray(data.education) ? data.education : [];

  const startEditing = () => {
    setFirstNameDraft(data.first_name || '');
    setLastNameDraft(data.last_name || '');
    setHeadlineDraft(data.headline || '');
    setBioDraft(data.bio || '');
    setEducationDraft(education.length ? education.map((e) => ({ ...emptyEducationEntry(), ...e })) : []);
    setFormError('');
    setEditing(true);
  };

  const updateEducationField = (idx, field, value) => {
    setEducationDraft((list) => list.map((entry, i) => (i === idx ? { ...entry, [field]: value } : entry)));
  };

  const addEducationRow = () => {
    if (educationDraft.length >= 10) return;
    setEducationDraft((list) => [...list, emptyEducationEntry()]);
  };

  const removeEducationRow = (idx) => setEducationDraft((list) => list.filter((_, i) => i !== idx));

  const saveProfile = async () => {
    const firstName = firstNameDraft.trim();
    const lastName = lastNameDraft.trim();
    // First/last name are required by the API (unlike the fields below,
    // which can all be cleared/left empty) -- catch that here with a plain
    // inline message instead of letting the PATCH 400 with no feedback.
    if (!firstName || !lastName) {
      setFormError('First and last name are both required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const headline = headlineDraft.trim();
      const bio = bioDraft.trim();
      // Drop any row the person started and abandoned without a school
      // name -- "optional" means an empty row never becomes a saved entry.
      const cleanedEducation = educationDraft
        .map((e) => ({
          school: (e.school || '').trim(),
          degree: (e.degree || '').trim(),
          field: (e.field || '').trim(),
          startYear: (e.startYear || '').trim(),
          endYear: (e.endYear || '').trim(),
        }))
        .filter((e) => e.school);
      await api.patch('/profile', { firstName, lastName, headline, bio, education: cleanedEducation });
      setData((d) => ({ ...d, first_name: firstName, last_name: lastName, headline, bio, education: cleanedEducation }));
      setUser((u) => (u ? { ...u, first_name: firstName, last_name: lastName } : u));
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

  const onCoverDone = (coverUrl) => setData((d) => ({ ...d, cover_url: coverUrl }));

  const joined = data.created_at
    ? new Date(data.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;

  const formatYears = (entry) => {
    if (entry.startYear && entry.endYear) return `${entry.startYear} – ${entry.endYear}`;
    if (entry.startYear) return `${entry.startYear} – Present`;
    if (entry.endYear) return entry.endYear;
    return '';
  };

  const inputClass =
    'w-full rounded-lg border border-navy-900/15 px-3 py-2 text-sm outline-none focus:border-accent-400';
  const labelClass = 'block text-xs font-medium text-navy-700/60 mb-1';

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <CoverUploader coverUrl={data.cover_url} onDone={onCoverDone} editable={isOwn} />

      <div className="-mt-14 flex flex-col items-center px-2 text-center sm:-mt-16">
        {isOwn ? (
          <AvatarUploader
            avatarUrl={data.avatar_url}
            fallback={data.first_name?.[0]?.toUpperCase() || '?'}
            size={112}
            onDone={onAvatarDone}
          />
        ) : (
          <div className="h-28 w-28 overflow-hidden rounded-full border-4 border-white bg-accent-100 flex items-center justify-center font-display text-3xl text-accent-600 shadow-pop">
            <SafeImage
              src={data.avatar_url}
              className="h-full w-full object-cover"
              fallback={data.first_name?.[0]?.toUpperCase() || '?'}
            />
          </div>
        )}

        <h1 className="mt-3 font-display text-2xl">
          {data.first_name} {data.last_name}
        </h1>
        {data.headline && <p className="mt-1 text-sm font-medium text-navy-700/70">{data.headline}</p>}
        {joined && <p className="mt-1 text-xs text-navy-700/50">Member since {joined}</p>}

        {isOwn && !editing && (
          <button
            onClick={startEditing}
            className="mt-3 rounded-full border border-navy-900/15 px-4 py-1.5 text-sm font-medium hover:bg-navy-900/5"
          >
            Edit profile
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-5">
          <div className="space-y-3 rounded-2xl border border-navy-900/8 bg-white p-5 text-left shadow-card">
            <h2 className="font-display text-lg">Basics</h2>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>First name</label>
                <input
                  type="text"
                  value={firstNameDraft}
                  onChange={(e) => setFirstNameDraft(e.target.value)}
                  maxLength={80}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Last name</label>
                <input
                  type="text"
                  value={lastNameDraft}
                  onChange={(e) => setLastNameDraft(e.target.value)}
                  maxLength={80}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>
                Headline <span className="font-normal text-navy-700/40">(optional — shown under your name)</span>
              </label>
              <input
                type="text"
                value={headlineDraft}
                onChange={(e) => setHeadlineDraft(e.target.value)}
                maxLength={160}
                placeholder="e.g. Licensed electrician · Louisville, KY"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                About <span className="font-normal text-navy-700/40">(optional)</span>
              </label>
              <textarea
                value={bioDraft}
                onChange={(e) => setBioDraft(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="Tell people a little about yourself..."
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-navy-900/8 bg-white p-5 text-left shadow-card">
            <h2 className="font-display text-lg">
              🎓 Education <span className="text-sm font-normal text-navy-700/40">(optional)</span>
            </h2>
            {educationDraft.map((entry, idx) => (
              <div key={idx} className="space-y-2 rounded-xl border border-navy-900/10 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-navy-700/50">Entry {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeEducationRow(idx)}
                    className="text-xs font-medium text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
                <input
                  type="text"
                  value={entry.school}
                  onChange={(e) => updateEducationField(idx, 'school', e.target.value)}
                  placeholder="School or university"
                  maxLength={160}
                  className={inputClass}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={entry.degree}
                    onChange={(e) => updateEducationField(idx, 'degree', e.target.value)}
                    placeholder="Degree (e.g. B.S.)"
                    maxLength={160}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={entry.field}
                    onChange={(e) => updateEducationField(idx, 'field', e.target.value)}
                    placeholder="Field of study"
                    maxLength={160}
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={entry.startYear}
                    onChange={(e) => updateEducationField(idx, 'startYear', e.target.value)}
                    placeholder="Start year"
                    maxLength={4}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={entry.endYear}
                    onChange={(e) => updateEducationField(idx, 'endYear', e.target.value)}
                    placeholder="End year (or blank)"
                    maxLength={4}
                    className={inputClass}
                  />
                </div>
              </div>
            ))}
            {educationDraft.length < 10 && (
              <button
                type="button"
                onClick={addEducationRow}
                className="text-sm font-medium text-accent-600 hover:text-accent-700"
              >
                + Add education
              </button>
            )}
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex gap-2">
            <button
              disabled={saving}
              onClick={saveProfile}
              className="rounded-full bg-accent-500 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              disabled={saving}
              onClick={() => setEditing(false)}
              className="rounded-full border border-navy-900/15 px-5 py-2 text-sm hover:bg-navy-900/5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {(data.bio || isOwn) && (
            <div className="rounded-2xl border border-navy-900/8 bg-white p-5 text-left shadow-card">
              <h2 className="mb-2 font-display text-lg">About</h2>
              <p className="whitespace-pre-wrap text-sm text-navy-700/80">
                {data.bio || 'Add a short bio so people know a bit about you.'}
              </p>
            </div>
          )}

          {(education.length > 0 || isOwn) && (
            <div className="rounded-2xl border border-navy-900/8 bg-white p-5 text-left shadow-card">
              <h2 className="mb-3 font-display text-lg">🎓 Education</h2>
              {education.length ? (
                <ul className="space-y-3">
                  {education.map((entry, idx) => (
                    <li key={idx} className="flex gap-3">
                      <span className="text-2xl leading-none">🎓</span>
                      <div>
                        <p className="text-sm font-semibold text-navy-900">{entry.school}</p>
                        {(entry.degree || entry.field) && (
                          <p className="text-sm text-navy-700/70">
                            {[entry.degree, entry.field].filter(Boolean).join(', ')}
                          </p>
                        )}
                        {formatYears(entry) && <p className="text-xs text-navy-700/50">{formatYears(entry)}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-navy-700/50">No education listed yet.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
