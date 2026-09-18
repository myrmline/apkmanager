import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/* ------------------------------------------------------------------ Modal */

export function Modal({ title, description, onClose, children, footer, wide = false }) {
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
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="panel-body">{children}</div>
        {footer && <footer className="panel-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onClose, busy }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose} disabled={busy}>
            Keep it
          </button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
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

/* ------------------------------------------------------------------ Status */

const STATUS_COPY = {
  active: { label: 'Active', tone: 'ok' },
  archived: { label: 'Archived', tone: 'mute' },
  published: { label: 'Published', tone: 'ok' },
  draft: { label: 'Held back', tone: 'warn' },
  current: { label: 'Current', tone: 'accent' },
};

export function Status({ value, children }) {
  const meta = STATUS_COPY[value] || { label: value, tone: 'mute' };
  return <span className={`chip chip-${meta.tone}`}>{children || meta.label}</span>;
}

export const Version = ({ children }) => <span className="version">{children}</span>;

/* -------------------------------------------------------------- Feedback */

export const Empty = ({ title, body, action }) => (
  <div className="empty">
    <h3>{title}</h3>
    <p>{body}</p>
    {action}
  </div>
);

export const Loading = ({ label = 'Loading' }) => (
  <div className="loading" role="status">
    <span className="pulse" /> {label}
  </div>
);

export const Banner = ({ children }) => (
  <p className="banner" role="alert">
    {children}
  </p>
);

/* ------------------------------------------------------------------ Toasts */

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((all) => [...all, { id, message, tone }]);
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), 4000);
  }, []);

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
