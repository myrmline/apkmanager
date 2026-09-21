import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useTheme } from '../lib/theme.jsx';
import { Banner, Field, useToast } from '../components/ui.jsx';

export default function AccountPage() {
  const { user, isAdmin } = useAuth();
  const { t, locale, setLocale, locales } = useI18n();
  const { choice, setChoice } = useTheme();
  const toast = useToast();

  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.newPassword !== form.confirm) return setError(t('account.mismatch'));
    if (form.newPassword.length < 8) return setError(t('account.tooShort'));

    setBusy(true);
    try {
      await api.changePassword(form.currentPassword, form.newPassword);
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast(t('account.changed'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="page-head">
        <div className="page-head-text">
          <h1>{t('account.title')}</h1>
          <p className="muted">
            {user.name} · <span dir="ltr">{user.email}</span> ·{' '}
            {t(isAdmin ? 'common.roles.admin' : 'common.roles.user')}
          </p>
        </div>
      </header>

      <div className="stack">
        <section className="card">
          <header className="card-head">
            <h2>{t('account.languageTitle')}</h2>
            <p className="muted">{t('account.languageHint')}</p>
          </header>
          <div className="radios">
            {locales.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  name="locale"
                  value={option.value}
                  checked={locale === option.value}
                  onChange={(event) => setLocale(event.target.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </section>

        <section className="card">
          <header className="card-head">
            <h2>{t('common.theme.title')}</h2>
            <p className="muted">{t('common.theme.hint')}</p>
          </header>
          <div className="radios">
            {['system', 'light', 'dark'].map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={choice === value}
                  onChange={(event) => setChoice(event.target.value)}
                />
                {t(`common.theme.${value}`)}
              </label>
            ))}
          </div>
        </section>

        <section className="card">
          <header className="card-head">
            <h2>{t('account.passwordTitle')}</h2>
          </header>

          <form className="form-grid" onSubmit={submit} noValidate>
            {error && <Banner>{error}</Banner>}

            <Field label={t('account.current')} htmlFor="current">
              <input
                id="current"
                className="input"
                type="password"
                dir="ltr"
                autoComplete="current-password"
                value={form.currentPassword}
                onChange={set('currentPassword')}
                required
              />
            </Field>

            <div className="pair">
              <Field label={t('account.next')} htmlFor="next" hint={t('account.nextHint')}>
                <input
                  id="next"
                  className="input"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={form.newPassword}
                  onChange={set('newPassword')}
                  required
                />
              </Field>
              <Field label={t('account.confirm')} htmlFor="confirm">
                <input
                  id="confirm"
                  className="input"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={set('confirm')}
                  required
                />
              </Field>
            </div>

            <div className="card-foot">
              <button className="btn btn-primary" disabled={busy}>
                {busy ? t('common.actions.saving') : t('account.submit')}
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  );
}
