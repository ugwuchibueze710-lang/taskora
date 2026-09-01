import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const LocationContext = createContext(null);

export function LocationProvider({ children }) {
  const { user, setUser } = useAuth();
  const [locked, setLocked] = useState(false);
  const [location, setLocation] = useState(null);

  useEffect(() => {
    if (user?.location_lat != null && user?.location_lng != null) {
      setLocation({ label: user.location_label, lat: user.location_lat, lng: user.location_lng });
      setLocked(true);
    }
  }, [user?.location_lat, user?.location_lng, user?.location_label]);

  const searchPlaces = async (q) => {
    if (!q?.trim()) return [];
    const { data } = await api.get('/location/search', { params: { q } });
    return data.results;
  };

  const lock = async (place) => {
    const { data } = await api.post('/location/lock', place);
    setLocation(data.location);
    setLocked(true);
    setUser((u) => (u ? { ...u, location_label: data.location.label, location_lat: data.location.lat, location_lng: data.location.lng } : u));
  };

  const unlock = () => setLocked(false);

  // "Use my current location" — asks the browser for GPS/network location,
  // turns the raw coordinates into a human label via the server's reverse
  // geocoder, then locks it exactly like a manually-searched result would.
  // Rejects with a short, user-facing message on every failure path so the
  // UI can show it directly instead of a generic error.
  const detectMyLocation = () =>
    new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('Your browser doesn\'t support location detection. Search instead.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude: lat, longitude: lng } = position.coords;
            const { data } = await api.get('/location/reverse', { params: { lat, lng } });
            await lock(data.location);
            resolve(data.location);
          } catch (err) {
            reject(err);
          }
        },
        (geoError) => {
          if (geoError.code === geoError.PERMISSION_DENIED) {
            reject(new Error('Location permission was denied. Search for your city or ZIP instead.'));
          } else if (geoError.code === geoError.TIMEOUT) {
            reject(new Error('Timed out getting your location. Try again or search instead.'));
          } else {
            reject(new Error('Couldn\'t detect your location. Try again or search instead.'));
          }
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
      );
    });

  return (
    <LocationContext.Provider value={{ locked, location, lock, unlock, searchPlaces, detectMyLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within LocationProvider');
  return ctx;
}
