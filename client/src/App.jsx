import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { Loading } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import FilesPage from './pages/FilesPage.jsx';
import FileDetailPage from './pages/FileDetailPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import AccountPage from './pages/AccountPage.jsx';

export default function App() {
  const { user, ready, isAdmin } = useAuth();

  if (!ready) {
    return (
      <div className="boot">
        <Loading label="Starting Relay" />
      </div>
    );
  }
  if (!user) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/files" element={<FilesPage />} />
        <Route path="/files/:id" element={<FileDetailPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/users" element={isAdmin ? <UsersPage /> : <Navigate to="/files" replace />} />
        <Route path="*" element={<Navigate to="/files" replace />} />
      </Route>
    </Routes>
  );
}
