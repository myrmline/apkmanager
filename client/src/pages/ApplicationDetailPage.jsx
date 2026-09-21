import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import {
  AppIcon,
  Banner,
  ConfirmDialog,
  Empty,
  Icon,
  Loading,
  Status,
  Switch,
  Version,
  useToast,
} from '../components/ui.jsx';
import AppFormModal from '../components/AppFormModal.jsx';
import VersionModal from '../components/VersionModal.jsx';
import NoteModal from '../components/NoteModal.jsx';
import UserPicker from '../components/UserPicker.jsx';

export default function ApplicationDetailPage() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const { t, fmt } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [editingVersion, setEditingVersion] = useState(null);
  const [notingVersion, setNotingVersion] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await api.getApplication(id));
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

  const act = async (key, work, message) => {
    setBusy(key);
    try {
      await work();
      if (message) toast(message);
      await load();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy('');
      setDialog(null);
    }
  };

  const download = async (version) => {
    try {
      toast(t('apps.toast.downloading', { name: await api.downloadVersion(id, version.id) }));
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  if (error) {
    return (
      <Empty
        title={t('apps.detail.unavailableTitle')}
        body={error}
        action={
          <Link className="btn btn-quiet" to="/apps">
            {t('apps.detail.backToList')}
          </Link>
        }
      />
    );
  }
  if (!data) return <Loading label={t('apps.detail.loading')} />;

  const { application, versions, allowedUsers = [] } = data;
  const active = application.status === 'active';

  return (
    <>
      <Link to="/apps" className="back">
        {t('apps.detail.back')}
      </Link>

      <header className="page-head">
        <div className="page-head-text app-head">
          <AppIcon application={application} large />
          <div>
            <h1>{application.name}</h1>
            <p className="muted">
              {application.packageName && (
                <span className="mono" dir="ltr">
                  {application.packageName}
                </span>
              )}
              {application.packageName && ' · '}
              {application.description || t('apps.noDescription')}
            </p>
          </div>
        </div>

        {isAdmin && (
          <div className="head-actions">
            <button className="btn btn-quiet" onClick={() => setDialog('edit-app')}>
              {t('common.actions.edit')}
            </button>
            <button className="btn btn-primary" onClick={() => setEditingVersion('new')}>
              <Icon name="plus" size={16} /> {t('apps.detail.newVersion')}
            </button>
          </div>
        )}
      </header>

      <div className="facts">
        <span>
          <small>{t('apps.detail.facts.application')}</small>
          {isAdmin ? (
            <Switch
              checked={active}
              busy={busy === 'app-status'}
              label={t(active ? 'common.status.active' : 'common.status.inactive')}
              onChange={(next) =>
                act(
                  'app-status',
                  () => api.setApplicationActive(application.id, next),
                  t(next ? 'apps.toast.activated' : 'apps.toast.deactivated'),
                )
              }
            />
          ) : (
            <Status value={application.status} />
          )}
        </span>
        <span>
          <small>{t('apps.detail.facts.currentVersion')}</small>
          {application.currentVersion ? (
            <Version>{application.currentVersion.version}</Version>
          ) : (
            '—'
          )}
        </span>
        <span>
          <small>{t('apps.detail.facts.versions')}</small>
          {versions.length}
        </span>
        {isAdmin && (
          <span>
            <small>{t('apps.detail.facts.downloadable')}</small>
            {versions.filter((version) => version.status === 'active').length}
          </span>
        )}
        <span>
          <small>{t('apps.detail.facts.added')}</small>
          {fmt.date(application.createdAt)}
        </span>
      </div>

      <div className="split">
        <section className="card">
          <header className="card-head">
            <h2>{t('apps.detail.versionsTitle')}</h2>
            <p className="muted">
              {t(isAdmin ? 'apps.detail.versionsHintAdmin' : 'apps.detail.versionsHintUser')}
            </p>
          </header>

          {versions.length === 0 ? (
            <Empty
              title={t('apps.detail.noVersionsTitle')}
              body={t(isAdmin ? 'apps.detail.noVersionsAdmin' : 'apps.detail.noVersionsUser')}
              action={
                isAdmin ? (
                  <button className="btn btn-primary" onClick={() => setEditingVersion('new')}>
                    {t('apps.detail.uploadFirst')}
                  </button>
                ) : null
              }
            />
          ) : (
            <ul className="vlist">
              {versions.map((version) => (
                <li
                  key={version.id}
                  className={`vcard${version.isCurrent ? ' is-current' : ''}`}
                >
                  <div className="vcard-head">
                    <Version>{version.version}</Version>
                    <Status value={version.status} />
                    {version.isCurrent && <Status value="current" />}
                    <span className="mono muted">{fmt.size(version.sizeBytes)}</span>
                  </div>

                  <p className="vcard-meta">
                    <span>{t('apps.detail.uploaded', { date: fmt.dateTime(version.uploadedAt) })}</span>
                    <span>{fmt.expiry(version)}</span>
                    {isAdmin && version.downloadCount !== undefined && (
                      <span>{t('apps.detail.downloads', { count: version.downloadCount })}</span>
                    )}
                  </p>

                  {version.description && <p className="prose">{version.description}</p>}

                  {version.note && (
                    <p className="vcard-note">
                      <strong>{t('apps.note.label')}</strong>
                      {version.note}
                    </p>
                  )}

                  {isAdmin && version.checksum && (
                    <p className="checksum mono" title="SHA-256">
                      {version.checksum.slice(0, 24)}…
                    </p>
                  )}

                  {isAdmin && (
                    <div className="vcard-access">
                      {version.accessMode === 'custom' ? (
                        <>
                          <span className="chip chip-warn">{t('common.status.restricted')}</span>
                          <span>
                            {t('apps.detail.restrictedTo', {
                              count: version.userCount,
                              names: (version.allowedUsers || [])
                                .map((user) => user.name)
                                .join(', '),
                            })}
                          </span>
                        </>
                      ) : (
                        <span>{t('apps.detail.usesAppList', { count: allowedUsers.length })}</span>
                      )}
                    </div>
                  )}

                  <div className="vcard-actions">
                    <button className="btn btn-quiet btn-sm" onClick={() => download(version)}>
                      <Icon name="download" size={15} /> {t('common.actions.download')}
                    </button>

                    {isAdmin && (
                      <Switch
                        checked={version.isActive}
                        busy={busy === `v-${version.id}`}
                        label={t(version.isActive ? 'common.status.active' : 'common.status.inactive')}
                        onChange={(next) =>
                          act(
                            `v-${version.id}`,
                            () => api.setVersionActive(application.id, version.id, next),
                            t(next ? 'apps.toast.versionActivated' : 'apps.toast.versionDeactivated', {
                              version: version.version,
                            }),
                          )
                        }
                      />
                    )}

                    {isAdmin && !version.isCurrent && (
                      <button
                        className="btn btn-quiet btn-sm"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          act(
                            `c-${version.id}`,
                            () => api.makeCurrent(application.id, version.id),
                            t('apps.toast.versionCurrent', { version: version.version }),
                          )
                        }
                      >
                        {t('apps.detail.makeCurrent')}
                      </button>
                    )}

                    {isAdmin && (
                      <button
                        className="btn btn-quiet btn-sm"
                        onClick={() => setNotingVersion(version)}
                      >
                        {t('apps.note.button')}
                      </button>
                    )}

                    {isAdmin && (
                      <button
                        className="btn btn-quiet btn-sm"
                        onClick={() => setEditingVersion(version)}
                      >
                        {t('apps.detail.settings')}
                      </button>
                    )}

                    {isAdmin && (
                      <button
                        className="btn btn-danger-quiet btn-sm"
                        onClick={() => setDialog(`delete-version-${version.id}`)}
                      >
                        {t('common.actions.delete')}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <header className="card-head">
            <h2>{t(isAdmin ? 'apps.detail.accessTitleAdmin' : 'apps.detail.accessTitleUser')}</h2>
            <p className="muted">
              {t(isAdmin ? 'apps.detail.accessHintAdmin' : 'apps.detail.accessHintUser')}
            </p>
          </header>

          {isAdmin ? (
            <AccessEditor
              applicationId={application.id}
              users={users}
              allowedUsers={allowedUsers}
              onSaved={(next) => {
                setData({ ...data, allowedUsers: next });
                toast(t('apps.toast.accessUpdated'));
              }}
            />
          ) : (
            <p className="prose">{t('apps.detail.accessUserBody')}</p>
          )}

          {isAdmin && (
            <footer className="card-foot">
              <button className="btn btn-danger-quiet" onClick={() => setDialog('delete-app')}>
                {t('apps.detail.deleteApp')}
              </button>
            </footer>
          )}
        </section>
      </div>

      {editingVersion && (
        <VersionModal
          application={application}
          version={editingVersion === 'new' ? null : editingVersion}
          users={users}
          onClose={() => setEditingVersion(null)}
          onSaved={(version) => {
            setEditingVersion(null);
            toast(t('apps.toast.versionSaved', { version: version.version }));
            load();
          }}
        />
      )}

      {notingVersion && (
        <NoteModal
          application={application}
          version={notingVersion}
          onClose={() => setNotingVersion(null)}
          onSaved={(saved) => {
            setNotingVersion(null);
            toast(t(saved.note ? 'apps.toast.noteSaved' : 'apps.toast.noteRemoved'));
            load();
          }}
        />
      )}

      {dialog === 'edit-app' && (
        <AppFormModal
          application={application}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            toast(t('apps.toast.updated'));
            load();
          }}
        />
      )}

      {dialog === 'delete-app' && (
        <ConfirmDialog
          title={t('apps.detail.confirmDeleteApp.title', { name: application.name })}
          body={t('apps.detail.confirmDeleteApp.body')}
          confirmLabel={t('apps.detail.confirmDeleteApp.confirm')}
          busy={busy === 'delete-app'}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            setBusy('delete-app');
            try {
              await api.deleteApplication(application.id);
              toast(t('apps.toast.deleted', { name: application.name }));
              navigate('/apps');
            } catch (err) {
              toast(err.message, 'bad');
              setBusy('');
            }
          }}
        />
      )}

      {typeof dialog === 'string' && dialog.startsWith('delete-version-') && (
        <ConfirmDialog
          title={t('apps.detail.confirmDeleteVersion.title')}
          body={t('apps.detail.confirmDeleteVersion.body')}
          confirmLabel={t('apps.detail.confirmDeleteVersion.confirm')}
          busy={busy === 'delete-version'}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            act(
              'delete-version',
              () =>
                api.deleteVersion(application.id, Number(dialog.replace('delete-version-', ''))),
              t('apps.toast.versionDeleted'),
            )
          }
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------------- */

function AccessEditor({ applicationId, users, allowedUsers, onSaved }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(allowedUsers.map((user) => user.id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSelected(allowedUsers.map((user) => user.id));
  }, [allowedUsers]);

  const original = allowedUsers.map((user) => user.id).sort().join(',');
  const changed = selected.slice().sort().join(',') !== original;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const { allowedUsers: next } = await api.setApplicationAccess(applicationId, selected);
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
          {saving ? t('common.actions.saving') : t('apps.detail.saveAccess')}
        </button>
        {changed && (
          <button
            className="btn btn-quiet"
            onClick={() => setSelected(allowedUsers.map((user) => user.id))}
          >
            {t('common.actions.undo')}
          </button>
        )}
      </div>
    </>
  );
}
