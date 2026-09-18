import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const initials = user.name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('');

  return (
    <div className="shell">
      <aside className="rail">
        <div className="rail-top">
          <span className="mark">Relay</span>
          <span className="mark-sub">Android build distribution</span>
        </div>

        <nav className="rail-nav">
          <NavLink to="/files" end>
            Builds
          </NavLink>
          {isAdmin && <NavLink to="/users">People</NavLink>}
          <NavLink to="/account">Your account</NavLink>
        </nav>

        <div className="rail-foot">
          <span className="avatar" aria-hidden="true">
            {initials}
          </span>
          <span className="rail-user">
            <strong>{user.name}</strong>
            <small>{isAdmin ? 'Admin' : 'Tester'}</small>
          </span>
          <button className="icon-btn icon-btn-dark" onClick={logout} title="Sign out">
            ⏻
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
