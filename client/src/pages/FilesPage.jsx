import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { fileSize, relativeDate } from '../lib/format.js';
import { Empty, Loading, Status, Version, useToast } from '../components/ui.jsx';
import UploadModal from '../components/UploadModal.jsx';

export default function FilesPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { files: rows } = await api.listFiles({ search, status });
      setFiles(rows);
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setLoading(false);
    }
  }, [search, status, toast]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    if (isAdmin) api.listUsers().then(({ users: rows }) => setUsers(rows)).catch(() => {});
  }, [isAdmin]);

  const download = async (file) => {
    try {
      const name = await api.downloadCurrent(file.id);
      toast(`Downloading ${name}`);
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Builds</h1>
          <p className="muted">
            {isAdmin
              ? 'Every APK in the system, newest activity first.'
              : 'The builds assigned to you.'}
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setUploading(true)}>
            Upload a build
          </button>
        )}
      </header>

      <div className="toolbar">
        <input
          type="search"
          className="input"
          placeholder="Search by name, package, or description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {isAdmin && (
          <select className="input select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All files</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        )}
      </div>

      {loading ? (
        <Loading label="Loading builds" />
      ) : files.length === 0 ? (
        <Empty
          title={search ? 'Nothing matches that search' : 'No builds yet'}
          body={
            search
              ? 'Try a shorter search term.'
              : isAdmin
                ? 'Upload an APK and assign the testers who should get it.'
                : 'An admin has not assigned you a build yet.'
          }
          action={
            isAdmin && !search ? (
              <button className="btn btn-primary" onClick={() => setUploading(true)}>
                Upload a build
              </button>
            ) : null
          }
        />
      ) : (
        <ul className="rows">
          <li className="rows-head" aria-hidden="true">
            <span>Name</span>
            <span>Version</span>
            <span>Size</span>
            <span>Updated</span>
            <span />
          </li>

          {files.map((file) => (
            <li key={file.id} className="row">
              <Link to={`/files/${file.id}`} className="row-main">
                <strong>{file.name}</strong>
                <small>
                  {file.packageName || file.description || 'No description'}
                  {isAdmin && file.userCount !== undefined
                    ? ` · ${file.userCount} ${file.userCount === 1 ? 'tester' : 'testers'}`
                    : ''}
                </small>
              </Link>

              <span className="row-cell">
                {file.currentVersion ? (
                  <Version>{file.currentVersion.version}</Version>
                ) : (
                  <span className="muted">none</span>
                )}
              </span>

              <span className="row-cell mono">
                {file.currentVersion ? fileSize(file.currentVersion.sizeBytes) : '—'}
              </span>

              <span className="row-cell muted">{relativeDate(file.updatedAt)}</span>

              <span className="row-actions">
                {file.status === 'archived' && <Status value="archived" />}
                {file.currentVersion?.status === 'draft' && <Status value="draft" />}
                <button
                  className="btn btn-quiet btn-sm"
                  onClick={() => download(file)}
                  disabled={!file.currentVersion}
                >
                  Download
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {uploading && (
        <UploadModal
          users={users}
          onClose={() => setUploading(false)}
          onUploaded={(file) => {
            setUploading(false);
            toast(`${file.name} uploaded`);
            load();
          }}
        />
      )}
    </>
  );
}
