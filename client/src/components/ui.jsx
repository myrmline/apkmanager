import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { iconSrc } from '../lib/api.js';
import { useTheme } from '../lib/theme.jsx';
import { useI18n } from '../lib/i18n.jsx';

/* ------------------------------------------------------------------- Icons */

const PATHS = {
  apps: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  users: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a4 4 0 0 1 0 7.8',
  account: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8',
  power: 'M18.4 6.6a9 9 0 1 1-12.8 0M12 2v10',
  close: 'M18 6 6 18M6 6l12 12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  plus: 'M12 5v14M5 12h14',
};

export function Icon({ name, size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/* ------------------------------------------------------------------- Modal */

export function Modal({ title, description, onClose, children, footer, wide = false }) {
  const { t } = useI18n();
  const panel = useRef(null);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('input, select, textarea, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={`panel${wide ? ' panel-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panel}
      >
        <header className="panel-head">
          <div>
            <h2>{title}</h2>
            {description && <p className="muted">{description}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.actions.close')}>
            <Icon name="close" />
          </button>
        </header>
        <div className="panel-body">{children}</div>
        {footer && <footer className="panel-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onClose, busy }) {
  const { t } = useI18n();
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose} disabled={busy}>
            {t('common.actions.keepIt')}
          </button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? t('common.actions.working') : confirmLabel}
          </button>
        </>
      }
    >
      <p className="prose">{body}</p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Fields */

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

/** Activate / deactivate control. Labelled, so its meaning never depends on colour alone. */
export function Switch({ checked, onChange, label, disabled, busy }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="switch"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled || busy}
    >
      <span className="switch-track" />
      <span>{busy ? t('common.actions.saving') : label}</span>
    </button>
  );
}

/* ----------------------------------------------------------------- Status */

const TONES = { active: 'ok', inactive: 'mute', expired: 'warn', current: 'accent' };

export function Status({ value, children }) {
  const { t } = useI18n();
  const tone = TONES[value] || 'mute';
  return (
    <span className={`chip chip-${tone}${tone === 'accent' ? '' : ' chip-dot'}`}>
      {children || t(`common.status.${value}`)}
    </span>
  );
}

export const Version = ({ children }) => <span className="version">{children}</span>;

/** The application's icon, falling back to its initials. */
export function AppIcon({ application, large = false }) {
  const src = iconSrc(application);
  const initials = (application?.name || '?')
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

  return (
    <span className={`app-icon${large ? ' app-icon-lg' : ''}`}>
      {src ? <img src={src} alt="" /> : initials}
    </span>
  );
}

/* -------------------------------------------------------------- Feedback */

export const Empty = ({ title, body, action }) => (
  <div className="empty">
    <h3>{title}</h3>
    <p>{body}</p>
    {action}
  </div>
);

export const Loading = ({ label }) => {
  const { t } = useI18n();
  return (
    <div className="loading" role="status">
      <span className="pulse" /> {label || t('common.loading')}
    </div>
  );
};

export const Banner = ({ children }) => (
  <p className="banner" role="alert">
    {children}
  </p>
);

/* -------------------------------------------------------------- Dark mode */

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { t } = useI18n();
  const label = t(theme === 'dark' ? 'common.theme.switchToLight' : 'common.theme.switchToDark');

  return (
    <button className="icon-btn" onClick={toggle} title={label}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
      <span className="sr-only">{label}</span>
    </button>
  );
}

/** Arabic, French, English. Small enough to be a plain select. */
export function LanguageSwitcher() {
  const { locale, setLocale, locales, t } = useI18n();
  return (
    <label className="lang">
      <span className="sr-only">{t('common.language')}</span>
      <select
        className="lang-select"
        value={locale}
        onChange={(event) => setLocale(event.target.value)}
      >
        {locales.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* ------------------------------------------------------------------ Toasts */

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = (message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((all) => [...all, { id, message, tone }]);
    setTimeout(() => setToasts((all) => all.filter((toast) => toast.id !== id)), 4000);
  };

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
