import { Outlet } from 'react-router-dom';
import Nav from './Nav.jsx';

export default function Layout() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
