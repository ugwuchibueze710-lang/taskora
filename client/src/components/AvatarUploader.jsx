import { useRef, useState } from 'react';
import api from '../api/client.js';
import SafeImage from './SafeImage.jsx';

/**
 * The profile-picture control for the profile wall (ProfileWallPage) --
 * shared in one place so the upload, the "uploading" ring glow, and the
 * "done" checkmark pop all look and behave identically anywhere a picture
 * can be changed, rather than each screen rolling its own.
 *
 * Replaces the old "upload, then just sit there in the same edit screen
 * with no feedback" pattern (still how the separate Settings-page uploader
 * behaves) with: idle -> uploading (pulsing brand-gradient ring) -> a
 * checkmark pops in over the new photo -> after a beat, calls `onDone` so
 * the caller can leave edit mode / show the finished profile -- the
 * "animate, then redirect to the right page" behavior that was asked for.
 */
export default function AvatarUploader({ avatarUrl, fallback, size = 112, onDone }) {
  const fileRef = useRef(null);
  const [phase, setPhase] = useState('idle'); // idle | uploading | done
  const [url, setUrl] = useState(avatarUrl);
  const [error, setError] = useState('');

  const pick = () => fileRef.current?.click();

  const onFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // let picking the same file again re-fire onChange
    if (!file) return;
    setError('');
    setPhase('uploading');
    try {
      const form = new FormData();
      form.append('avatar', file);
      const { data } = await api.post('/profile/avatar', form);
      setUrl(data.avatarUrl);
      setPhase('done');
      // Hold on the checkmark just long enough to register, then hand off
      // -- this is the "redirect to the right page" moment: the caller
      // closes edit mode / navigates away from here.
      setTimeout(() => onDone?.(data.avatarUrl), 900);
    } catch (err) {
      setError(err.message || 'Could not upload that image.');
      setPhase('idle');
    }
  };

  return (
    <div className="inline-flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <div
          className={`h-full w-full overflow-hidden rounded-full bg-accent-100 flex items-center justify-center font-display text-accent-600 ${
            phase === 'uploading' ? 'ring-4 ring-primary-400 animate-uploadGlow' : ''
          }`}
          style={{ fontSize: size / 2.6 }}
        >
          <SafeImage src={url} className="h-full w-full object-cover" fallback={fallback} />
        </div>

        {phase !== 'uploading' && (
          <button
            type="button"
            onClick={pick}
            aria-label="Change profile picture"
            className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-white shadow-pop hover:bg-navy-800"
          >
            📷
          </button>
        )}

        {phase === 'done' && (
          <span className="absolute bottom-0 right-0 flex h-8 w-8 animate-checkPop items-center justify-center rounded-full bg-emerald-500 text-white shadow-pop">
            ✓
          </span>
        )}

        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
