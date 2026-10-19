import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import Spinner from '../../components/Spinner.jsx';

/**
 * "/profile" -- the one stable link every "go to my profile" entry point
 * (the nav avatar, chief among them) can point at, regardless of whether
 * this account happens to be a provider right now. A provider's profile IS
 * their storefront; a plain customer's is the new profile wall.
 */
export default function MyProfilePage() {
  const { user, loading } = useAuth();
  if (loading || !user) return <div className="flex h-screen items-center justify-center"><Spinner size={28} /></div>;
  return <Navigate to={user.provider_id ? `/providers/${user.provider_id}` : `/u/${user.id}`} replace />;
}
