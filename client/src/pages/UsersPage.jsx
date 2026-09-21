import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import {
  Banner,
  ConfirmDialog,
  Empty,
  Field,
  Icon,
  Loading,
  Modal,
  Switch,
  useToast,
} from '../components/ui.jsx';

const EMPTY = { name: '', email: '', role: 'user', password: '', isActive: true };

export default function UsersPage() {
  const { user: me } = useAuth();
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { users: rows } = await api.listUsers(search);
      setUsers(rows);
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const toggleActive = async (user, isActive) => {
    setBusy(`u-${user.id}`);
    try {
      await api.setUserActive(user.id, isActive);
      toast(t(isActive ? 'people.toast.enabled' : 'people.toast.disabled', { name: user.name }));
      load();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    setBusy('remove');
    try {
      await api.deleteUser(removing.id);
      toast(t('people.toast.removed', { name: removing.name }));
      setRemoving(null);
      load();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy('');
    }
  };

  return (
    <>
      <header className="page-head">
        <div className="page-head-text">
          <h1>{t('people.title')}</h1>
          <p className="muted">{t('people.subtitle')}</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}>
            <Icon name="plus" size={16} /> {t('people.add')}
          </button>
        </div>
      </header>

      <div className="toolbar">
        <input
          type="search"
          className="input"
          placeholder={t('people.searchPlaceholder')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {loading ? (
        <Loading label={t('people.loading')} />
      ) : users.length === 0 ? (
        <Empty title={t('people.empty.title')} body={t('people.empty.body')} />
      ) : (
        <div className="table table-users">
          <div className="thead" aria-hidden="true">
            <span>{t('people.columns.name')}</span>
            <span>{t('people.columns.role')}</span>
            <span>{t('people.columns.grants')}</span>
            <span>{t('people.columns.added')}</span>
            <span />
          </div>

          {users.map((user) => (
            <article className="trow" key={user.id}>
              <div className="cell-main">
                <span className="cell-main-text">
                  <strong>
                    {user.name}
                    {user.id === me.id && (
                      <span className="chip chip-mute">{t('common.status.you')}</span>
                    )}
                  </strong>
                  <small dir="ltr">{user.email}</small>
                </span>
              </div>

              <span className="cell" data-label={t('people.columns.role')}>
                <span className={`chip ${user.role === 'admin' ? 'chip-accent' : 'chip-mute'}`}>
                  {t(user.role === 'admin' ? 'common.roles.admin' : 'common.roles.user')}
                </span>
              </span>

              <span className="cell" data-label={t('people.columns.grants')}>
                <span className="mono">
                  {user.role === 'admin' ? t('common.all') : user.grantCount}
                </span>
              </span>

              <span className="cell" data-label={t('people.columns.added')}>
                {fmt.date(user.createdAt)}
              </span>

              <span className="cell-actions">
                <Switch
                  checked={user.isActive}
                  busy={busy === `u-${user.id}`}
                  disabled={user.id === me.id}
                  label={t(user.isActive ? 'common.status.enabled' : 'common.status.disabled')}
                  onChange={(next) => toggleActive(user, next)}
                />
                <button className="btn btn-quiet btn-sm" onClick={() => setEditing(user)}>
                  {t('common.actions.edit')}
                </button>
                {user.id !== me.id && (
                  <button
                    className="btn btn-danger-quiet btn-sm"
                    onClick={() => setRemoving(user)}
                  >
                    {t('people.remove')}
                  </button>
                )}
              </span>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <UserModal
          user={editing}
          busy={busy === 'save'}
          isSelf={editing.id === me.id}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            setBusy('save');
            try {
              if (editing.id) await api.updateUser(editing.id, payload);
              else await api.createUser(payload);
              toast(
                editing.id
                  ? t('people.toast.saved')
                  : t('people.toast.added', { name: payload.name }),
              );
              setEditing(null);
              load();
            } finally {
              setBusy('');
            }
          }}
        />
      )}

      {removing && (
        <ConfirmDialog
          title={t('people.confirmRemove.title', { name: removing.name })}
          body={t('people.confirmRemove.body')}
          confirmLabel={t('people.confirmRemove.confirm')}
          busy={busy === 'remove'}
          onClose={() => setRemoving(null)}
          onConfirm={remove}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------------- */

function UserModal({ user, onClose, onSave, busy, isSelf }) {
  const { t } = useI18n();
  const isNew = !user.id;
  const [form, setForm] = useState({
    name: user.name,
    email: user.email,
    role: user.role,
    password: '',
    isActive: user.isActive ?? true,
  });
  const [error, setError] = useState('');

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal
      title={isNew ? t('people.form.addTitle') : t('people.form.editTitle', { name: user.name })}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose} disabled={busy}>
            {t('common.actions.cancel')}
          </button>
          <button className="btn btn-primary" form="user-form" disabled={busy}>
            {busy
              ? t('common.actions.saving')
              : isNew
                ? t('people.form.submitAdd')
                : t('common.actions.save')}
          </button>
        </>
      }
    >
      <form id="user-form" className="form-grid" onSubmit={submit} noValidate>
        {error && <Banner>{error}</Banner>}

        <Field label={t('people.form.name')} htmlFor="user-name">
          <input id="user-name" className="input" value={form.name} onChange={set('name')} required />
        </Field>

        <Field label={t('people.form.email')} htmlFor="user-email">
          <input
            id="user-email"
            className="input"
            type="email"
            dir="ltr"
            autoComplete="off"
            value={form.email}
            onChange={set('email')}
            required
          />
        </Field>

        <div className="pair">
          <Field
            label={t('people.form.role')}
            htmlFor="user-role"
            hint={isSelf ? t('people.form.roleSelfHint') : undefined}
          >
            <select
              id="user-role"
              className="input select"
              value={form.role}
              onChange={set('role')}
              disabled={isSelf}
            >
              <option value="user">{t('common.roles.user')}</option>
              <option value="admin">{t('common.roles.admin')}</option>
            </select>
          </Field>

          <Field
            label={t(isNew ? 'people.form.password' : 'people.form.newPassword')}
            htmlFor="user-password"
            hint={t(isNew ? 'people.form.passwordHintNew' : 'people.form.passwordHintEdit')}
          >
            <input
              id="user-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              required={isNew}
            />
          </Field>
        </div>

        <Field
          label={t('people.form.signIn')}
          hint={isSelf ? t('people.form.signInSelfHint') : undefined}
        >
          <Switch
            checked={form.isActive}
            disabled={isSelf}
            label={t(form.isActive ? 'common.status.enabled' : 'common.status.disabled')}
            onChange={(next) => setForm({ ...form, isActive: next })}
          />
        </Field>
      </form>
    </Modal>
  );
}
