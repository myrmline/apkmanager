import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { Banner, Field, LanguageSwitcher, ThemeToggle } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <section className="gate-brand">
        <div className="gate-top">
          <span className="brand">
            <span className="brand-mark">{t('common.brand')}</span>
            <small>{t('common.tagline')}</small>
          </span>
          <span className="appbar-actions">
            <LanguageSwitcher />
            <ThemeToggle />
          </span>
        </div>
        <h1>{t('auth.headline')}</h1>
        <p>{t('auth.blurb')}</p>
      </section>

      <section className="gate-form">
        <form onSubmit={submit} noValidate>
          <h2>{t('auth.signIn')}</h2>
          {error && <Banner>{error}</Banner>}

          <Field label={t('auth.email')} htmlFor="email">
            <input
              id="email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              dir="ltr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>

          <Field label={t('auth.password')} htmlFor="password">
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              dir="ltr"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? t('auth.signingIn') : t('auth.signIn')}
          </button>
        </form>
      </section>
    </div>
  );
}
