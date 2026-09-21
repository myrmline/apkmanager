import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { useI18n } from './lib/i18n.jsx';
import { Loading } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import ApplicationsPage from './pages/ApplicationsPage.jsx';
import ApplicationDetailPage from './pages/ApplicationDetailPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import AccountPage from './pages/AccountPage.jsx';

export default function App() {
  const { user, ready, isAdmin } = useAuth();
  const { t } = useI18n();

  if (!ready) {
    return (
      <div className="boot">
        <Loading label={t('common.loading')} />
      </div>
    );
  }
  if (!user) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/apps" element={<ApplicationsPage />} />
        <Route path="/apps/:id" element={<ApplicationDetailPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/users" element={isAdmin ? <UsersPage /> : <Navigate to="/apps" replace />} />
        <Route path="*" element={<Navigate to="/apps" replace />} />
      </Route>
    </Routes>
  );
}
