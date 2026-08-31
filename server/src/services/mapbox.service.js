import { badRequest } from '../lib/errors.js';

const MAPBOX_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

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
  }));
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
