import { useEffect, useState } from 'react';
import api from '../../api/client.js';
import ProviderCard from '../../components/ProviderCard.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Spinner from '../../components/Spinner.jsx';

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState(null);

  useEffect(() => {
    api.get('/favorites').then(({ data }) => setFavorites(data.favorites));
  }, []);

  if (!favorites) return <div className="flex justify-center py-16"><Spinner size={28} /></div>;

  if (favorites.length === 0) {
    return <EmptyState icon="🤍" title="Save providers you like and find them here later." />;
  }

  return (
    <div>
      <h1 className="font-display text-2xl mb-4">My Favorites</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {favorites.map((p) => (
          <ProviderCard
            key={p.id}
            provider={{
              id: p.id,
              name: p.business_name || p.display_name,
              imageUrl: p.image_url,
              description: p.description,
              rating: Number(p.rating_avg),
              reviewCount: p.rating_count,
              isPro: p.is_pro,
              isSponsored: p.is_boosted,
              services: [],
              pricingMode: p.pricing_mode,
              priceAmount: p.price_amount,
            }}
          />
        ))}
      </div>
    </div>
  );
}
