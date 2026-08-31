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

  return (
    <LocationContext.Provider value={{ locked, location, lock, unlock, searchPlaces }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within LocationProvider');
  return ctx;
}
