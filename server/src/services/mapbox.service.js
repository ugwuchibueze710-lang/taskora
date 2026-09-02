import { badRequest } from '../lib/errors.js';

const MAPBOX_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

/**
 * Pulls a clean city name out of a Mapbox geocoding feature, for per-city
 * demand tracking (see category-demand.service.js). Mapbox represents a
 * "place" (city/town) either as the feature itself (when someone searches
 * a city directly, e.g. "Evansville, IN") or as one entry in the feature's
 * `context` array (when the result is a more specific address/postcode
 * inside that city) — this checks both instead of relying on `place_name`,
 * which is a full formatted string ("123 Main St, Evansville, IN, USA")
 * that's wrong to use as a city key directly.
 */
function extractCity(feature) {
  if (!feature) return null;
  if (feature.place_type?.includes('place')) return feature.text || null;
  const placeContext = (feature.context || []).find((c) => c.id?.startsWith('place.'));
  return placeContext?.text || null;
}

/**
 * Forward-geocode a free-text place/address into candidate locations.
 * Returns [] (never throws for "no results") so callers can show a clean
 * empty state instead of a crash. Throws only on missing configuration or
 * a genuine upstream failure.
 */
export async function geocode(placeText, { limit = 5, proximity = null } = {}) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    throw badRequest('Location search is not configured yet (missing Mapbox token).');
  }
  if (!placeText || !placeText.trim()) return [];

  const url = new URL(`${MAPBOX_BASE}/${encodeURIComponent(placeText.trim())}.json`);
  url.searchParams.set('access_token', token);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('types', 'place,postcode,locality,neighborhood,address,region');
  url.searchParams.set('country', 'us');
  if (proximity?.lng != null && proximity?.lat != null) {
    url.searchParams.set('proximity', `${proximity.lng},${proximity.lat}`);
  }

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Mapbox geocoding failed with status ${resp.status}`);
  }
  const data = await resp.json();
  return (data.features || []).map((f) => ({
    label: f.place_name,
    lng: f.center[0],
    lat: f.center[1],
    city: extractCity(f),
  }));
}

/**
 * Reverse-geocode a coordinate pair into a human-readable place label.
 * Used by "use my current location" — the browser gives us raw lat/lng via
 * the Geolocation API, and we need a label to show/store alongside it (the
 * same way a manually-searched result carries one).
 */
export async function reverseGeocode(lat, lng) {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) {
    throw badRequest('Location search is not configured yet (missing Mapbox token).');
  }
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    throw badRequest('A valid lat/lng is required.');
  }

  const url = new URL(`${MAPBOX_BASE}/${lng},${lat}.json`);
  url.searchParams.set('access_token', token);
  url.searchParams.set('types', 'place,postcode,locality,neighborhood,address,region');
  url.searchParams.set('limit', '1');

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Mapbox reverse geocoding failed with status ${resp.status}`);
  }
  const data = await resp.json();
  const best = (data.features || [])[0];
  return {
    label: best ? best.place_name : `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    lat,
    lng,
    city: best ? extractCity(best) : null,
  };
}

/** Great-circle distance in miles between two lat/lng points. */
export function distanceMiles(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v == null)) return null;
  const R = 3958.8; // Earth radius in miles
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
