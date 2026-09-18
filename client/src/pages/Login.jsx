import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { Banner, Field } from '../components/ui.jsx';

export default function Login() {
  const { login } = useAuth();
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
        <span className="mark">Relay</span>
        <h1>Android builds, handed to the right people.</h1>
        <p>
          Every APK is assigned to named testers. They see the versions meant for them, and nothing
          else.
        </p>
      </section>

      <section className="gate-form">
        <form onSubmit={submit} noValidate>
          <h2>Sign in</h2>
          {error && <Banner>{error}</Banner>}

          <Field label="Email" htmlFor="email">
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>

          <Field label="Password" htmlFor="password">
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </div>
  );
}
