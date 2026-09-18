import { useState } from 'react';
import { api } from '../lib/api.js';
import { fileSize } from '../lib/format.js';
import { Banner, Field, Modal } from './ui.jsx';

export default function NewVersionModal({ file, onClose, onAdded }) {
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('published');
  const [makeCurrent, setMakeCurrent] = useState(true);
  const [apk, setApk] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (!apk) return setError('Choose an .apk file to upload.');
    setError('');
    setProgress(0);

    const body = new FormData();
    body.append('version', version);
    body.append('notes', notes);
    body.append('versionStatus', status);
    body.append('makeCurrent', String(status === 'published' && makeCurrent));
    body.append('file', apk);

    try {
      const { version: created } = await api.addVersion(file.id, body, setProgress);
      onAdded(created);
    } catch (err) {
      setError(err.message);
      setProgress(null);
    }
  };

  const busy = progress !== null;

  return (
    <Modal
      title={`New version of ${file.name}`}
      description={
        file.currentVersion
          ? `Current version is ${file.currentVersion.version}.`
          : 'No current version yet.'
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" form="version-form" disabled={busy}>
            {busy ? `Uploading ${progress}%` : 'Upload version'}
          </button>
        </>
      }
    >
      <form id="version-form" onSubmit={submit} className="form-grid" noValidate>
        {error && <Banner>{error}</Banner>}

        <Field label="Version" htmlFor="new-version" hint="Must differ from existing versions">
          <input
            id="new-version"
            className="input mono"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            required
          />
        </Field>

        <Field label="Release notes" htmlFor="new-notes">
          <textarea
            id="new-notes"
            className="input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <Field label="APK file" htmlFor="new-apk">
          <label className="dropzone" htmlFor="new-apk">
            <input
              id="new-apk"
              type="file"
              accept=".apk"
              onChange={(e) => setApk(e.target.files?.[0] || null)}
            />
            {apk ? (
              <span>
                <strong>{apk.name}</strong>
                <small className="mono">{fileSize(apk.size)}</small>
              </span>
            ) : (
              <span>Choose an .apk file</span>
            )}
          </label>
        </Field>

        <Field label="Availability">
          <div className="radios">
            <label>
              <input
                type="radio"
                name="status"
                value="published"
                checked={status === 'published'}
                onChange={(e) => setStatus(e.target.value)}
              />
              Publish to the assigned testers
            </label>
            <label>
              <input
                type="radio"
                name="status"
                value="draft"
                checked={status === 'draft'}
                onChange={(e) => setStatus(e.target.value)}
              />
              Hold back for admins
            </label>
          </div>
        </Field>

        {status === 'published' && (
          <label className="check">
            <input
              type="checkbox"
              checked={makeCurrent}
              onChange={(e) => setMakeCurrent(e.target.checked)}
            />
            Make this the current version
          </label>
        )}

        {busy && (
          <div className="progress" role="progressbar" aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
      </form>
    </Modal>
  );
}
