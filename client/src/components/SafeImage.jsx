import { useState } from 'react';

/**
 * Renders `src` as an <img>, but falls back to `fallback` (e.g. a letter
 * avatar or an emoji) whenever `src` is missing OR the image fails to load.
 *
 * Without this, an uploaded photo whose file no longer exists (ephemeral
 * storage after a redeploy, a manually deleted file, a bad URL) renders as a
 * browser's broken-image icon instead of the same clean fallback we already
 * show when there's simply no photo yet — one graceful state instead of two
 * different-looking failure modes.
 */
export default function SafeImage({ src, alt = '', className, fallback = null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return fallback;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}
