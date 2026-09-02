import { Link } from 'react-router-dom';

// Rendered for any URL that doesn't match a real route (mistyped links, stale
// bookmarks, a deep link to something that moved). Without this catch-all,
// React Router renders nothing at all for an unmatched path -- a totally
// blank white page with no way back except editing the URL by hand.
export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#fbf6f1] px-6 text-center">
      <div className="text-5xl mb-4">🧭</div>
      <h1 className="font-display text-2xl text-ink-900 mb-1">Page not found</h1>
      <p className="text-ink-700/70 max-w-sm mb-5">
        The page you're looking for doesn't exist, or the link is out of date.
      </p>
      <Link
        to="/"
        className="rounded-full bg-ember-500 px-5 py-2 text-sm font-semibold text-white hover:bg-ember-600"
      >
        Back to Taskora
      </Link>
    </div>
  );
}
