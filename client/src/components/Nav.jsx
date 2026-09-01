import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import LocationControl from './LocationControl.jsx';
import NotificationBell from './NotificationBell.jsx';

const CUSTOMER_LINKS = [
  ['/', 'Home'],
  ['/messages', 'Messages'],
  ['/jobs', 'Jobs'],
  ['/favorites', 'Favorites'],
];

const PROVIDER_LINKS = [
  ['/provider', 'Dashboard'],
  ['/provider/inbox', 'Inbox'],
  ['/provider/jobs', 'Jobs'],
  ['/provider/earnings', 'Earnings'],
];

export default function Nav() {
  const { user, switchMode, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!user) return null;
  const isProvider = user.current_mode === 'provider';
  const links = isProvider ? PROVIDER_LINKS : CUSTOMER_LINKS;

  const handleSwitch = async () => {
    setSwitching(true);
    const target = isProvider ? 'customer' : 'provider';
    await switchMode(target);
    setTimeout(() => {
      setSwitching(false);
      setMenuOpen(false);
      navigate(target === 'provider' ? '/provider' : '/');
    }, 350);
  };

  return (
    <header className="sticky top-0 z-20 border-b border-ink-900/8 bg-[#fbf6f1]/95 backdrop-blur">
      <div className={`mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 transition-transform ${switching ? 'scale-[0.99]' : ''}`}>
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-full p-2 text-xl hover:bg-ink-900/5"
            aria-label="Menu"
          >
            ☰
          </button>
          {menuOpen && (
            <div className="absolute left-0 z-30 mt-2 w-64 rounded-xl border border-ink-900/10 bg-white p-2 shadow-pop animate-slideDown">
              <button
                onClick={handleSwitch}
                className="flex w-full items-center gap-2 rounded-lg bg-ink-900 px-3 py-2.5 text-left text-sm font-semibold text-white hover:bg-ink-800 transition"
              >
                <span>{isProvider ? '🛍️' : '🧰'}</span>
                {isProvider ? 'Customer Mode' : 'Service Provider Mode'}
              </button>
              <div className="my-1 h-px bg-ink-900/5" />
              {(isProvider
                ? [
                    ['/provider', 'Dashboard'], ['/provider/services', 'Services'], ['/provider/availability', 'Availability'],
                    ['/provider/reviews', 'Reviews'], ['/provider/pro', 'Taskora Pro'], ['/provider/boost', 'Taskora Boost'],
                    ['/provider/settings', 'Settings'],
                  ]
                : [
                    ['/notifications', 'Notifications'], ['/settings', 'Settings'],
                  ]
              ).map(([to, label]) => (
                <Link key={to} to={to} onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-ink-900/5">
                  {label}
                </Link>
              ))}
              {user.role === 'admin' && (
                <Link to="/admin" onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-ink-900/5">
                  Admin
                </Link>
              )}
              <div className="my-1 h-px bg-ink-900/5" />
              <button onClick={logout} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink-700/70 hover:bg-ink-900/5">
                Log out
              </button>
            </div>
          )}
        </div>

        <Link to={isProvider ? '/provider' : '/'} className="flex items-center gap-2 mr-2">
          <span className="font-display text-xl font-semibold text-ember-600">Taskora</span>
          <span className="h-7 w-7 flex-shrink-0 overflow-hidden rounded-full bg-ember-100 flex items-center justify-center text-xs font-display font-semibold text-ember-600">
            {user.avatar_url ? (
              <img src={user.avatar_url} className="h-full w-full object-cover" alt="" />
            ) : (
              user.first_name?.[0]?.toUpperCase() || '?'
            )}
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {links.map(([to, label]) => (
            <Link key={to} to={to} className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-ink-900/5">
              {label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {!isProvider && <LocationControl />}
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}
