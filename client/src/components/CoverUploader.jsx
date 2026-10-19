import { useRef, useState } from 'react';
import api from '../api/client.js';
import SafeImage from './SafeImage.jsx';

/**
 * The cover-photo control for the profile wall -- the wide banner above the
 * avatar, same "upload -> animate -> settle" pattern as AvatarUploader
 * (pulsing glow while uploading, a checkmark pop on success) so the two
 * photo controls on the same page feel like one system instead of two
 * unrelated widgets. Entirely optional: with no cover set, this renders a
 * plain brand-gradient panel instead of an empty hole in the layout, so the
 * page still looks finished for every user who never sets one.
 */
export default function CoverUploader({ coverUrl, onDone, editable = true }) {
  const fileRef = useRef(null);
  const [phase, setPhase] = useState('idle'); // idle | uploading | done
  const [url, setUrl] = useState(coverUrl);
  const [error, setError] = useState('');

  const pick = () => fileRef.current?.click();

  const onFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setPhase('uploading');
    try {
      const form = new FormData();
      form.append('cover', file);
      const { data } = await api.post('/profile/cover', form);
      setUrl(data.coverUrl);
      setPhase('done');
      setTimeout(() => {
        setPhase('idle');
        onDone?.(data.coverUrl);
      }, 900);
    } catch (err) {
      setError(err.message || 'Could not upload that image.');
      setPhase('idle');
    }
  };

  return (
    <div className="relative">
      <div
        className={`h-40 w-full overflow-hidden rounded-2xl bg-gradient-to-br from-primary-500 via-accent-500 to-primary-700 sm:h-48 ${
          phase === 'uploading' ? 'ring-4 ring-primary-300 animate-uploadGlow' : ''
        }`}
      >
        <SafeImage src={url} className="h-full w-full object-cover" fallback={<div className="h-full w-full" />} />
      </div>

      {editable && phase !== 'uploading' && (
        <button
          type="button"
          onClick={pick}
          aria-label="Change cover photo"
          className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-navy-900/80 text-white shadow-pop backdrop-blur hover:bg-navy-900"
        >
          📷
        </button>
      )}

      {phase === 'done' && (
        <span className="absolute bottom-3 right-3 flex h-9 w-9 animate-checkPop items-center justify-center rounded-full bg-emerald-500 text-white shadow-pop">
          ✓
        </span>
      )}

      {editable && <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
