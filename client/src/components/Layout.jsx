import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { Icon, LanguageSwitcher, ThemeToggle } from './ui.jsx';

/**
 * One set of markup for both layouts: on a phone the bar sits at the top and
 * the links become a bottom tab bar; from 900px up the two stack into a left
 * sidebar. No duplicated navigation, nothing hidden behind a hamburger.
 */
export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const { t } = useI18n();

  const initials = user.name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('');

  return (
    <div className="shell">
      <header className="appbar">
        <span className="brand">
          <span className="brand-mark">{t('common.brand')}</span>
          <small>{t('common.tagline')}</small>
        </span>
        <div className="appbar-actions">
          <LanguageSwitcher />
          <ThemeToggle />
          <button className="icon-btn" onClick={logout} title={t('common.signOut')}>
            <Icon name="power" />
            <span className="sr-only">{t('common.signOut')}</span>
          </button>
        </div>
      </header>

      <nav className="tabs">
        <NavLink to="/apps">
          <Icon name="apps" />
          <span>{t('common.nav.apps')}</span>
        </NavLink>
        {isAdmin && (
          <NavLink to="/users">
            <Icon name="users" />
            <span>{t('common.nav.people')}</span>
          </NavLink>
        )}
        <NavLink to="/account">
          <Icon name="account" />
          <span>{t('common.nav.account')}</span>
        </NavLink>

        <div className="tabs-foot">
          <span className="avatar" aria-hidden="true">
            {initials}
          </span>
          <span className="tabs-user">
            <strong>{user.name}</strong>
            <small>{t(isAdmin ? 'common.roles.admin' : 'common.roles.user')}</small>
          </span>
        </div>
      </nav>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
