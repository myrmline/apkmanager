import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { fileSize, fullDate } from '../lib/format.js';
import {
  Banner,
  ConfirmDialog,
  Empty,
  Field,
  Loading,
  Modal,
  Status,
  Version,
  useToast,
} from '../components/ui.jsx';
import NewVersionModal from '../components/NewVersionModal.jsx';
import UserPicker from '../components/UserPicker.jsx';

export default function FileDetailPage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null); // 'version' | 'edit' | 'delete-file' | version id
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.getFile(id));
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isAdmin) api.listUsers().then(({ users: rows }) => setUsers(rows)).catch(() => {});
  }, [isAdmin]);

  const act = async (work, message) => {
    setBusy(true);
    try {
      await work();
      if (message) toast(message);
      await load();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
      setDialog(null);
    }
  };

  if (error) {
    return (
      <Empty
        title="This build is not available"
        body={error}
        action={
          <Link className="btn btn-quiet" to="/files">
            Back to builds
          </Link>
        }
      />
    );
  }
  if (!data) return <Loading label="Loading build" />;

  const { file, versions, allowedUsers = [] } = data;

  return (
    <>
      <Link to="/files" className="back">
        Builds
      </Link>

      <header className="page-head">
        <div>
          <h1>{file.name}</h1>
          <p className="muted">
            {file.packageName && <span className="mono">{file.packageName}</span>}
            {file.packageName && ' — '}
            {file.description || 'No description'}
          </p>
        </div>
        {isAdmin && (
          <div className="head-actions">
            <button className="btn btn-quiet" onClick={() => setDialog('edit')}>
              Edit details
            </button>
            <button className="btn btn-primary" onClick={() => setDialog('version')}>
              New version
            </button>
          </div>
        )}
      </header>

      <div className="facts">
        <span>
          <small>Status</small>
          <Status value={file.status} />
        </span>
        <span>
          <small>Current version</small>
          {file.currentVersion ? <Version>{file.currentVersion.version}</Version> : '—'}
        </span>
        <span>
          <small>Versions</small>
          {versions.length}
        </span>
        <span>
          <small>Added</small>
          {fullDate(file.createdAt)}
        </span>
        {isAdmin && (
          <span>
            <small>Uploaded by</small>
            {file.createdBy || 'Unknown'}
          </span>
        )}
      </div>

      <div className="split">
        <section className="card">
          <header className="card-head">
            <h2>Version history</h2>
            <p className="muted">Newest first.</p>
          </header>

          <ol className="timeline">
            {versions.map((version) => (
              <li key={version.id} className={version.isCurrent ? 'is-current' : ''}>
                <div className="timeline-head">
                  <Version>{version.version}</Version>
                  {version.isCurrent && <Status value="current" />}
                  {version.status !== 'published' && <Status value={version.status} />}
                  <span className="mono muted">{fileSize(version.sizeBytes)}</span>
                </div>

                <p className="timeline-meta">
                  {fullDate(version.uploadedAt)}
                  {version.uploadedBy ? ` — ${version.uploadedBy}` : ''}
                  {isAdmin && version.downloadCount !== undefined
                    ? ` — ${version.downloadCount} ${
                        version.downloadCount === 1 ? 'download' : 'downloads'
                      }`
                    : ''}
                </p>

                {version.notes && <p className="prose">{version.notes}</p>}
                {isAdmin && version.checksum && (
                  <p className="checksum mono" title="SHA-256">
                    {version.checksum.slice(0, 24)}…
                  </p>
                )}

                <div className="timeline-actions">
                  <button
                    className="btn btn-quiet btn-sm"
                    onClick={() =>
                      api
                        .downloadVersion(file.id, version.id)
                        .then((name) => toast(`Downloading ${name}`))
                        .catch((err) => toast(err.message, 'bad'))
                    }
                  >
                    Download
                  </button>

                  {isAdmin && !version.isCurrent && version.status === 'published' && (
                    <button
                      className="btn btn-quiet btn-sm"
                      disabled={busy}
                      onClick={() =>
                        act(
                          () => api.makeCurrent(file.id, version.id),
                          `Version ${version.version} is now current`,
                        )
                      }
                    >
                      Make current
                    </button>
                  )}

                  {isAdmin && !version.isCurrent && (
                    <button
                      className="btn btn-quiet btn-sm"
                      disabled={busy}
                      onClick={() =>
                        act(
                          () =>
                            api.updateVersion(file.id, version.id, {
                              version: version.version,
                              notes: version.notes,
                              status: version.status === 'published' ? 'draft' : 'published',
                            }),
                          version.status === 'published'
                            ? `Version ${version.version} held back`
                            : `Version ${version.version} published`,
                        )
                      }
                    >
                      {version.status === 'published' ? 'Hold back' : 'Publish'}
                    </button>
                  )}

                  {isAdmin && versions.length > 1 && (
                    <button
                      className="btn btn-danger-quiet btn-sm"
                      onClick={() => setDialog(`delete-version-${version.id}`)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="card">
          <header className="card-head">
            <h2>{isAdmin ? 'Who can download it' : 'Your access'}</h2>
            <p className="muted">
              {isAdmin
                ? 'Changes take effect immediately, for every version.'
                : 'An admin assigned this build to you.'}
            </p>
          </header>

          {isAdmin ? (
            <AccessEditor
              fileId={file.id}
              users={users}
              allowedUsers={allowedUsers}
              onSaved={(next) => {
                setData({ ...data, allowedUsers: next });
                toast('Access updated');
              }}
            />
          ) : (
            <p className="prose">
              You can download the published versions listed here. Contact an admin if you need a
              build you cannot see.
            </p>
          )}

          {isAdmin && (
            <footer className="card-foot">
              <button className="btn btn-danger-quiet" onClick={() => setDialog('delete-file')}>
                Delete this build
              </button>
            </footer>
          )}
        </section>
      </div>

      {dialog === 'version' && (
        <NewVersionModal
          file={file}
          onClose={() => setDialog(null)}
          onAdded={(version) => {
            setDialog(null);
            toast(`Version ${version.version} uploaded`);
            load();
          }}
        />
      )}

      {dialog === 'edit' && (
        <EditFileModal
          file={file}
          busy={busy}
          onClose={() => setDialog(null)}
          onSave={(payload) => act(() => api.updateFile(file.id, payload), 'Details saved')}
        />
      )}

      {dialog === 'delete-file' && (
        <ConfirmDialog
          title={`Delete ${file.name}?`}
          body="Every version and its stored APK is removed, along with the access list. This cannot be undone."
          confirmLabel="Delete build"
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api.deleteFile(file.id);
              toast(`${file.name} deleted`);
              navigate('/files');
            } catch (err) {
              toast(err.message, 'bad');
              setBusy(false);
            }
          }}
        />
      )}

      {typeof dialog === 'string' && dialog.startsWith('delete-version-') && (
        <ConfirmDialog
          title="Delete this version?"
          body="The APK is removed from the server. Older versions stay available."
          confirmLabel="Delete version"
          busy={busy}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            act(
              () => api.deleteVersion(file.id, Number(dialog.replace('delete-version-', ''))),
              'Version deleted',
            )
          }
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------------- */

function AccessEditor({ fileId, users, allowedUsers, onSaved }) {
  const [selected, setSelected] = useState(allowedUsers.map((u) => u.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSelected(allowedUsers.map((u) => u.id));
  }, [allowedUsers]);

  const original = allowedUsers.map((u) => u.id).sort().join(',');
  const changed = [...selected].sort().join(',') !== original;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const { allowedUsers: next } = await api.setAccess(fileId, selected);
      onSaved(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {error && <Banner>{error}</Banner>}
      <UserPicker users={users} selected={selected} onChange={setSelected} />
      <div className="card-foot">
        <button className="btn btn-primary" onClick={save} disabled={!changed || saving}>
          {saving ? 'Saving…' : 'Save access list'}
        </button>
        {changed && (
          <button
            className="btn btn-quiet"
            onClick={() => setSelected(allowedUsers.map((u) => u.id))}
          >
            Undo changes
          </button>
        )}
      </div>
    </>
  );
}

function EditFileModal({ file, onClose, onSave, busy }) {
  const [form, setForm] = useState({
    name: file.name,
    packageName: file.packageName || '',
    description: file.description || '',
    status: file.status,
  });
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  return (
    <Modal
      title="Edit details"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => onSave(form)} disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Name" htmlFor="edit-name">
          <input id="edit-name" className="input" value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Package name" htmlFor="edit-package">
          <input
            id="edit-package"
            className="input mono"
            value={form.packageName}
            onChange={set('packageName')}
          />
        </Field>
        <Field label="Description" htmlFor="edit-description">
          <textarea
            id="edit-description"
            className="input"
            rows={3}
            value={form.description}
            onChange={set('description')}
          />
        </Field>
        <Field
          label="Status"
          htmlFor="edit-status"
          hint="Archiving hides the build from testers but keeps its history."
        >
          <select id="edit-status" className="input select" value={form.status} onChange={set('status')}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}
