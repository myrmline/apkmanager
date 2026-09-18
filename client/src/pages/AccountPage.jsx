import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Banner, Field, useToast } from '../components/ui.jsx';

export default function AccountPage() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.newPassword !== form.confirm) return setError('The two new passwords do not match.');
    if (form.newPassword.length < 8) return setError('Use at least 8 characters.');

    setBusy(true);
    try {
      await api.changePassword(form.currentPassword, form.newPassword);
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast('Password changed');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Your account</h1>
          <p className="muted">
            {user.name} — {user.email} — {isAdmin ? 'Admin' : 'Tester'}
          </p>
        </div>
      </header>

      <section className="card card-narrow">
        <header className="card-head">
          <h2>Change your password</h2>
        </header>

        <form className="form-grid" onSubmit={submit} noValidate>
          {error && <Banner>{error}</Banner>}

          <Field label="Current password" htmlFor="current">
            <input
              id="current"
              className="input"
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={set('currentPassword')}
              required
            />
          </Field>

          <div className="pair">
            <Field label="New password" htmlFor="next" hint="At least 8 characters">
              <input
                id="next"
                className="input"
                type="password"
                autoComplete="new-password"
                value={form.newPassword}
                onChange={set('newPassword')}
                required
              />
            </Field>
            <Field label="New password again" htmlFor="confirm">
              <input
                id="confirm"
                className="input"
                type="password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={set('confirm')}
                required
              />
            </Field>
          </div>

          <div className="card-foot">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
