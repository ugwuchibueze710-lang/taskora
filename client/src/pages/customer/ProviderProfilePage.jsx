import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../api/client.js';
import StarRating from '../../components/StarRating.jsx';
import Spinner from '../../components/Spinner.jsx';
import SafeImage from '../../components/SafeImage.jsx';
import { useLocation as useTaskoraLocation } from '../../context/LocationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ProviderProfilePage() {
  const { id } = useParams();
  const { location } = useTaskoraLocation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteMessage, setQuoteMessage] = useState('');
  const [defaultMessage, setDefaultMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const params = {};
    if (location?.lat) { params.lat = location.lat; params.lng = location.lng; }
    api.get(`/providers/${id}`, { params }).then(({ data }) => setData(data)).catch((e) => setError(e.message));
    api.get('/favorites').then(({ data }) => setIsFavorite(data.favorites.some((f) => f.id === id))).catch(() => {});
    api.get('/profile').then(({ data }) => {
      setQuoteMessage(data.profile.default_approach_message || '');
      setDefaultMessage(data.profile.default_approach_message || '');
    }).catch(() => {});
  }, [id, location?.lat, location?.lng]);

  const toggleFavorite = async () => {
    if (isFavorite) {
      await api.delete(`/favorites/${id}`);
      setIsFavorite(false);
    } else {
      await api.post('/favorites', { providerId: id });
      setIsFavorite(true);
    }
  };

  const openMessage = async () => {
    const { data } = await api.post('/messages/conversations', { providerId: id, message: defaultMessage || undefined });
    navigate(`/messages/${data.conversation.id}`);
  };

  const submitQuoteRequest = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await api.post('/quotes/requests', { providerId: id, message: quoteMessage });
      setNotice('Quote request sent! You can track it from your Messages.');
      setShowQuoteForm(false);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setSending(false);
    }
  };

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  const { provider, categories, services, photos, availability, reviews, distanceMiles } = data;
  const isOwnProfile = user?.provider_id === provider.id;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-navy-900/8 bg-white p-6 shadow-card">
        {/* Name above the picture, Facebook-wall style -- confirmed with
            the user this is a stacked layout, not the old side-by-side
            avatar+name. isOwnProfile gets a direct edit entry point right
            here instead of making you go hunt for Provider Settings. */}
        <div className="flex flex-col items-center text-center">
          <h1 className="font-display text-2xl flex flex-wrap items-center justify-center gap-2">
            {provider.business_name || provider.display_name}
            {provider.is_pro && <span className="rounded-full bg-navy-900 px-2 py-0.5 text-xs font-bold text-white">PRO</span>}
            {provider.is_boosted && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Sponsored</span>}
            {provider.verified && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">Verified</span>}
          </h1>
          <div className="mt-3 h-24 w-24 flex-shrink-0 overflow-hidden rounded-2xl bg-accent-100 flex items-center justify-center text-3xl font-display text-accent-600">
            <SafeImage src={provider.image_url} className="h-full w-full object-cover" fallback={provider.first_name[0]} />
          </div>
          {isOwnProfile && (
            <Link to="/provider/settings" className="mt-2 text-sm font-medium text-accent-600 hover:text-accent-700">
              Edit profile
            </Link>
          )}
        </div>
        <div className="mt-4 flex flex-col items-center gap-2 text-center">
          <div className="flex items-center gap-3 text-sm">
            <StarRating rating={Number(provider.rating_avg)} count={provider.rating_count} />
            {distanceMiles != null && <span className="text-navy-700/60">{distanceMiles} mi away</span>}
          </div>
          <div className="flex flex-wrap justify-center gap-1.5">
            {categories.map((c) => (
              <span key={c.id} className="rounded-full bg-accent-50 px-2.5 py-0.5 text-xs text-accent-700">{c.icon} {c.name}</span>
            ))}
          </div>
        </div>

        {provider.description && <p className="mt-4 text-navy-700/80">{provider.description}</p>}

        {!isOwnProfile && (
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={openMessage} className="rounded-full bg-navy-900 px-5 py-2 text-sm font-semibold text-white hover:bg-navy-800">
              💬 Message
            </button>
            <button onClick={() => setShowQuoteForm((s) => !s)} className="rounded-full bg-accent-500 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-600">
              Request a Quote
            </button>
            <button onClick={toggleFavorite} className="rounded-full border border-navy-900/15 px-5 py-2 text-sm font-semibold hover:bg-navy-900/5">
              {isFavorite ? '❤️ Saved' : '🤍 Save'}
            </button>
          </div>
        )}

        {showQuoteForm && (
          <form onSubmit={submitQuoteRequest} className="mt-4 rounded-xl border border-navy-900/10 bg-accent-50/40 p-4 animate-popIn">
            <label className="text-sm font-medium">Optional message</label>
            <textarea
              value={quoteMessage}
              onChange={(e) => setQuoteMessage(e.target.value)}
              rows={3}
              placeholder="Describe what you need..."
              className="mt-1 w-full rounded-lg border border-navy-900/15 px-3 py-2 text-sm outline-none focus:border-accent-400"
            />
            <button disabled={sending} className="mt-2 rounded-full bg-accent-500 px-5 py-2 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-60">
              {sending ? 'Sending…' : 'Send Request'}
            </button>
          </form>
        )}
        {notice && <p className="mt-3 text-sm text-navy-700">{notice}</p>}
      </div>

      {photos.length > 0 && (
        <div>
          <h2 className="font-display text-xl mb-2">Recent work</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {photos.map((p) => (
              <SafeImage
                key={p.id}
                src={p.url}
                alt={p.caption || ''}
                className="aspect-square rounded-xl object-cover"
                fallback={<div className="aspect-square rounded-xl bg-navy-900/5 flex items-center justify-center text-navy-700/30 text-xl">🖼️</div>}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-display text-xl mb-2">Services</h2>
        <div className="flex flex-wrap gap-1.5">
          {services.map((s) => (
            <span key={s.id} className="rounded-full border border-navy-900/10 px-3 py-1 text-sm">{s.name}</span>
          ))}
        </div>
      </div>

      {availability.length > 0 && (
        <div>
          <h2 className="font-display text-xl mb-2">Availability</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            {availability.map((a, i) => (
              <span key={i} className="rounded-lg bg-white border border-navy-900/10 px-3 py-1.5">
                {DAYS[a.day_of_week]}: {a.start_time?.slice(0, 5)}–{a.end_time?.slice(0, 5)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-display text-xl mb-2">Reviews</h2>
        {reviews.length === 0 && <p className="text-navy-700/60 text-sm">No reviews yet.</p>}
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="rounded-xl border border-navy-900/8 bg-white p-4">
              <div className="flex items-center justify-between">
                <StarRating rating={r.rating} />
                <span className="text-xs text-navy-700/50">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              <p className="text-sm mt-1 font-medium">{r.first_name}</p>
              {r.comment && <p className="text-sm text-navy-700/80 mt-1">{r.comment}</p>}
              {r.provider_response && (
                <div className="mt-2 rounded-lg bg-navy-900/5 p-2 text-sm">
                  <span className="font-medium">Provider response: </span>{r.provider_response}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
