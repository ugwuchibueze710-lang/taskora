import { Link } from 'react-router-dom';
import StarRating from './StarRating.jsx';

export default function ProviderCard({ provider }) {
  return (
    <Link
      to={`/providers/${provider.id}`}
      className="flex gap-4 rounded-2xl border border-ink-900/8 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop"
    >
      <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-xl bg-ember-100 flex items-center justify-center text-2xl font-display text-ember-600">
        {provider.imageUrl ? (
          <img src={provider.imageUrl} alt={provider.name} className="h-full w-full object-cover" />
        ) : (
          provider.name?.[0] || '?'
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg text-ink-900 truncate">{provider.name}</h3>
          {provider.isSponsored && (
            <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
              Sponsored
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 flex-wrap text-xs">
          {provider.isPro && (
            <span className="rounded-full bg-ink-900 px-2 py-0.5 font-bold text-white">PRO</span>
          )}
          <StarRating rating={provider.rating} count={provider.reviewCount} />
          {provider.distanceMiles != null && <span className="text-ink-700/60">· {provider.distanceMiles} mi</span>}
        </div>
        {provider.description && <p className="mt-1.5 text-sm text-ink-700/70 line-clamp-2">{provider.description}</p>}
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-ink-700/60 truncate">{(provider.services || []).slice(0, 2).join(' · ')}</span>
          <span className="font-semibold text-ember-600">
            {provider.pricingMode === 'hidden' || !provider.priceAmount
              ? 'Request a quote'
              : `${provider.pricingMode === 'hourly' ? '$' + provider.priceAmount + '/hr' : 'From $' + provider.priceAmount}`}
          </span>
        </div>
      </div>
    </Link>
  );
}
