import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { AppIcon, Empty, Icon, Loading, Status, Version, useToast } from '../components/ui.jsx';
import AppFormModal from '../components/AppFormModal.jsx';

export default function ApplicationsPage() {
  const { isAdmin } = useAuth();
  const { t, fmt } = useI18n();
  const toast = useToast();
  const [applications, setApplications] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { applications: rows } = await api.listApplications({ search, status });
      setApplications(rows);
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    if (isAdmin) api.listUsers().then(({ users: rows }) => setUsers(rows)).catch(() => {});
  }, [isAdmin]);

  const download = async (application) => {
    try {
      toast(t('apps.toast.downloading', { name: await api.downloadCurrent(application.id) }));
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  return (
    <>
      <header className="page-head">
        <div className="page-head-text">
          <h1>{t('apps.title')}</h1>
          <p className="muted">{t(isAdmin ? 'apps.subtitleAdmin' : 'apps.subtitleUser')}</p>
        </div>
        {isAdmin && (
          <div className="head-actions">
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <Icon name="plus" size={16} /> {t('apps.new')}
            </button>
          </div>
        )}
      </header>

      <div className="toolbar">
        <input
          type="search"
          className="input"
          placeholder={t('apps.searchPlaceholder')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {isAdmin && (
          <select
            className="input select"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label={t('apps.filterStatus')}
          >
            <option value="">{t('apps.allStatuses')}</option>
            <option value="active">{t('common.status.active')}</option>
            <option value="inactive">{t('common.status.inactive')}</option>
          </select>
        )}
      </div>

      {loading ? (
        <Loading label={t('apps.loading')} />
      ) : applications.length === 0 ? (
        <Empty
          title={t(
            search ? 'apps.empty.searchTitle' : isAdmin ? 'apps.empty.adminTitle' : 'apps.empty.userTitle',
          )}
          body={t(
            search ? 'apps.empty.searchBody' : isAdmin ? 'apps.empty.adminBody' : 'apps.empty.userBody',
          )}
          action={
            isAdmin && !search ? (
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                {t('apps.new')}
              </button>
            ) : null
          }
        />
      ) : (
        <div className="table table-apps">
          <div className="thead" aria-hidden="true">
            <span>{t('apps.columns.application')}</span>
            <span>{t('apps.columns.latest')}</span>
            <span>{t('apps.columns.versions')}</span>
            <span>{t('apps.columns.status')}</span>
            <span>{t('apps.columns.updated')}</span>
            <span />
          </div>

          {applications.map((application) => (
            <article className="trow" key={application.id}>
              <Link className="cell-main" to={`/apps/${application.id}`}>
                <AppIcon application={application} />
                <span className="cell-main-text">
                  <strong>{application.name}</strong>
                  <small>
                    {application.packageName || application.description || t('apps.noDescription')}
                  </small>
                </span>
              </Link>

              <span className="cell" data-label={t('apps.columns.latest')}>
                {application.currentVersion ? (
                  <Version>{application.currentVersion.version}</Version>
                ) : (
                  <span className="muted">{t('common.none')}</span>
                )}
              </span>

              <span className="cell" data-label={t('apps.columns.versions')}>
                <span className="mono">{application.versionCount ?? '—'}</span>
              </span>

              <span className="cell" data-label={t('apps.columns.status')}>
                {isAdmin ? (
                  <Status value={application.status} />
                ) : (
                  <Status value={application.currentVersion?.status || 'inactive'} />
                )}
              </span>

              <span className="cell" data-label={t('apps.columns.updated')}>
                {fmt.relative(application.updatedAt)}
              </span>

              <span className="cell-actions">
                <Link className="btn btn-quiet btn-sm" to={`/apps/${application.id}`}>
                  {t('common.actions.open')}
                </Link>
                <button
                  className="btn btn-quiet btn-sm"
                  onClick={() => download(application)}
                  disabled={!application.currentVersion}
                  title={
                    application.currentVersion
                      ? `${t('common.actions.download')} · ${fmt.size(application.currentVersion.sizeBytes)}`
                      : t('apps.detail.noVersionsTitle')
                  }
                >
                  <Icon name="download" size={15} />
                  <span className="sr-only">{t('common.actions.download')}</span>
                </button>
              </span>
            </article>
          ))}
        </div>
      )}

      {creating && (
        <AppFormModal
          users={users}
          onClose={() => setCreating(false)}
          onSaved={(application) => {
            setCreating(false);
            toast(t('apps.toast.created', { name: application.name }));
            load();
          }}
        />
      )}
    </>
  );
}
