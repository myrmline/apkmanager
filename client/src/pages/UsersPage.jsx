import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { shortDate } from '../lib/format.js';
import {
  Banner,
  ConfirmDialog,
  Empty,
  Field,
  Loading,
  Modal,
  Status,
  useToast,
} from '../components/ui.jsx';

const EMPTY = { name: '', email: '', role: 'user', password: '', isActive: true };

export default function UsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // user object, or EMPTY for a new one
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

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
  }, [search, toast]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteUser(removing.id);
      toast(`${removing.name} removed`);
      setRemoving(null);
      load();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>People</h1>
          <p className="muted">Admins manage builds. Testers download what they are assigned.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ ...EMPTY })}>
          Add a person
        </button>
      </header>

      <div className="toolbar">
        <input
          type="search"
          className="input"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <Loading label="Loading people" />
      ) : users.length === 0 ? (
        <Empty title="No one matches that search" body="Try a shorter search term." />
      ) : (
        <ul className="rows">
          <li className="rows-head" aria-hidden="true">
            <span>Name</span>
            <span>Role</span>
            <span>Builds</span>
            <span>Added</span>
            <span />
          </li>

          {users.map((user) => (
            <li key={user.id} className="row">
              <div className="row-main">
                <strong>
                  {user.name}
                  {user.id === me.id && <span className="chip chip-mute">You</span>}
                </strong>
                <small>{user.email}</small>
              </div>

              <span className="row-cell">
                {user.role === 'admin' ? (
                  <span className="chip chip-accent">Admin</span>
                ) : (
                  <span className="chip chip-mute">Tester</span>
                )}
              </span>

              <span className="row-cell mono">{user.role === 'admin' ? 'all' : user.fileCount}</span>

              <span className="row-cell muted">{shortDate(user.createdAt)}</span>

              <span className="row-actions">
                {!user.isActive && <Status value="archived">Deactivated</Status>}
                <button className="btn btn-quiet btn-sm" onClick={() => setEditing(user)}>
                  Edit
                </button>
                {user.id !== me.id && (
                  <button
                    className="btn btn-danger-quiet btn-sm"
                    onClick={() => setRemoving(user)}
                  >
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <UserModal
          user={editing}
          busy={busy}
          isSelf={editing.id === me.id}
          onClose={() => setEditing(null)}
          onSave={async (payload) => {
            setBusy(true);
            try {
              if (editing.id) await api.updateUser(editing.id, payload);
              else await api.createUser(payload);
              toast(editing.id ? 'Changes saved' : `${payload.name} added`);
              setEditing(null);
              load();
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name}?`}
          body="Their account and every build assignment goes with them. Uploaded builds stay in place."
          confirmLabel="Remove person"
          busy={busy}
          onClose={() => setRemoving(null)}
          onConfirm={remove}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------------- */

function UserModal({ user, onClose, onSave, busy, isSelf }) {
  const isNew = !user.id;
  const [form, setForm] = useState({
    name: user.name,
    email: user.email,
    role: user.role,
    password: '',
    isActive: user.isActive ?? true,
  });
  const [error, setError] = useState('');

  const set = (key) => (event) =>
    setForm({
      ...form,
      [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    });

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
      title={isNew ? 'Add a person' : `Edit ${user.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" form="user-form" disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Add person' : 'Save changes'}
          </button>
        </>
      }
    >
      <form id="user-form" className="form-grid" onSubmit={submit} noValidate>
        {error && <Banner>{error}</Banner>}

        <Field label="Name" htmlFor="user-name">
          <input id="user-name" className="input" value={form.name} onChange={set('name')} required />
        </Field>

        <Field label="Email" htmlFor="user-email">
          <input
            id="user-email"
            className="input"
            type="email"
            value={form.email}
            onChange={set('email')}
            required
          />
        </Field>

        <div className="pair">
          <Field
            label="Role"
            htmlFor="user-role"
            hint={isSelf ? 'You cannot remove your own admin access.' : undefined}
          >
            <select
              id="user-role"
              className="input select"
              value={form.role}
              onChange={set('role')}
              disabled={isSelf}
            >
              <option value="user">Tester</option>
              <option value="admin">Admin</option>
            </select>
          </Field>

          <Field
            label={isNew ? 'Password' : 'New password'}
            htmlFor="user-password"
            hint={isNew ? 'At least 8 characters' : 'Leave blank to keep the current one'}
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

        <label className="check">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={set('isActive')}
            disabled={isSelf}
          />
          Can sign in
        </label>
      </form>
    </Modal>
  );
}
