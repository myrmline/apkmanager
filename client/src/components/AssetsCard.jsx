import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { ConfirmDialog, Icon, Loading, useToast } from './ui.jsx';
import DownloadButton from './DownloadButton.jsx';

/**
 * The assets/ folder of one application. Everyone who can see the application
 * can list and download; admins can also add and delete.
 */
export default function AssetsCard({ application, isAdmin }) {
  const { t, fmt } = useI18n();
  const toast = useToast();
  const input = useRef(null);

  const [assets, setAssets] = useState(null);
  const [progress, setProgress] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setAssets((await api.listAssets(application.id)).assets);
    } catch (err) {
      setAssets([]);
      toast(err.message, 'bad');
    }
  }, [application.id]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (file) => {
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    setProgress(0);
    try {
      const { asset } = await api.uploadAsset(application.id, body, setProgress);
      toast(t('apps.toast.assetAdded', { name: asset.name }));
      await load();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  const download = async (name, onProgress) => {
    try {
      const saved = await api.downloadAsset(application.id, name, onProgress);
      toast(t('apps.toast.downloading', { name: saved }));
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.deleteAsset(application.id, removing);
      toast(t('apps.toast.assetDeleted', { name: removing }));
      setRemoving(null);
      await load();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <header className="card-head">
        <h2>{t('apps.assets.title')}</h2>
        <p className="muted">{t(isAdmin ? 'apps.assets.hintAdmin' : 'apps.assets.hintUser')}</p>
      </header>

      {assets === null ? (
        <Loading label={t('apps.assets.loading')} />
      ) : assets.length === 0 ? (
        <p className="muted">{t('apps.assets.empty')}</p>
      ) : (
        <ul className="asset-list">
          {assets.map((asset) => (
            <li key={asset.name}>
              <span className="asset-name">
                <strong dir="auto">{asset.name}</strong>
                <small>
                  <span className="mono">{fmt.size(asset.sizeBytes)}</span> ·{' '}
                  {fmt.date(asset.modifiedAt)}
                </small>
              </span>
              <span className="asset-actions">
                <DownloadButton
                  run={(onProgress) => download(asset.name, onProgress)}
                  title={t('common.actions.download')}
                />
                {isAdmin && (
                  <button
                    className="btn btn-danger-quiet btn-sm"
                    onClick={() => setRemoving(asset.name)}
                  >
                    {t('common.actions.delete')}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <footer className="card-foot card-foot-stack">
          <label className="btn btn-quiet" aria-disabled={progress !== null}>
            <input
              ref={input}
              type="file"
              className="sr-only"
              accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.md,.json,.csv,.zip"
              disabled={progress !== null}
              onChange={(event) => upload(event.target.files?.[0])}
            />
            <Icon name="plus" size={16} />
            {progress === null
              ? t('apps.assets.add')
              : t('apps.assets.uploading', { percent: progress })}
          </label>
          {progress !== null && (
            <div className="progress" role="progressbar" aria-valuenow={progress}>
              <span style={{ width: `${progress}%` }} />
            </div>
          )}
          <span className="field-hint">{t('apps.assets.allowed')}</span>
        </footer>
      )}

      {removing && (
        <ConfirmDialog
          title={t('apps.assets.confirmDelete.title', { name: removing })}
          body={t('apps.assets.confirmDelete.body')}
          confirmLabel={t('apps.assets.confirmDelete.confirm')}
          busy={busy}
          onClose={() => setRemoving(null)}
          onConfirm={remove}
        />
      )}
    </section>
  );
}
