import { useState } from 'react';
import { api } from '../lib/api.js';
import { fileSize } from '../lib/format.js';
import { Banner, Field, Modal } from './ui.jsx';
import UserPicker from './UserPicker.jsx';

export default function UploadModal({ users, onClose, onUploaded }) {
  const [form, setForm] = useState({
    name: '',
    packageName: '',
    description: '',
    version: '',
    notes: '',
    versionStatus: 'published',
  });
  const [apk, setApk] = useState(null);
  const [allowed, setAllowed] = useState([]);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    if (!apk) return setError('Choose an .apk file to upload.');
    setError('');
    setProgress(0);

    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => body.append(key, value));
    body.append('userIds', JSON.stringify(allowed));
    body.append('file', apk);

    try {
      const { file } = await api.createFile(body, setProgress);
      onUploaded(file);
    } catch (err) {
      setError(err.message);
      setProgress(null);
    }
  };

  const busy = progress !== null;

  return (
    <Modal
      wide
      title="Upload a build"
      description="The first version becomes the current one."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" form="upload-form" disabled={busy}>
            {busy ? `Uploading ${progress}%` : 'Upload build'}
          </button>
        </>
      }
    >
      <form id="upload-form" onSubmit={submit} className="form-grid" noValidate>
        {error && <Banner>{error}</Banner>}

        <Field label="Name" htmlFor="name" hint="What testers will look for, e.g. Delivery Driver">
          <input id="name" className="input" value={form.name} onChange={set('name')} required />
        </Field>

        <div className="pair">
          <Field label="Version" htmlFor="version" hint="e.g. 2.4.0">
            <input
              id="version"
              className="input mono"
              value={form.version}
              onChange={set('version')}
              required
            />
          </Field>
          <Field label="Package name" htmlFor="packageName" hint="Optional">
            <input
              id="packageName"
              className="input mono"
              placeholder="com.example.app"
              value={form.packageName}
              onChange={set('packageName')}
            />
          </Field>
        </div>

        <Field label="Description" htmlFor="description">
          <textarea
            id="description"
            className="input"
            rows={2}
            value={form.description}
            onChange={set('description')}
          />
        </Field>

        <Field label="Release notes for this version" htmlFor="notes">
          <textarea
            id="notes"
            className="input"
            rows={2}
            value={form.notes}
            onChange={set('notes')}
          />
        </Field>

        <Field label="APK file" htmlFor="apk">
          <label className="dropzone" htmlFor="apk">
            <input
              id="apk"
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
                name="versionStatus"
                value="published"
                checked={form.versionStatus === 'published'}
                onChange={set('versionStatus')}
              />
              Publish now
            </label>
            <label>
              <input
                type="radio"
                name="versionStatus"
                value="draft"
                checked={form.versionStatus === 'draft'}
                onChange={set('versionStatus')}
              />
              Hold back for admins
            </label>
          </div>
        </Field>

        <Field label="Who can download it">
          <UserPicker users={users} selected={allowed} onChange={setAllowed} />
        </Field>

        {busy && (
          <div className="progress" role="progressbar" aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
      </form>
    </Modal>
  );
}
