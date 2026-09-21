import { useState } from 'react';
import { api } from '../lib/api.js';
import { dateInputValue } from '../lib/format.js';
import { useI18n } from '../lib/i18n.jsx';
import { Banner, Field, Modal, Switch } from './ui.jsx';
import UserPicker from './UserPicker.jsx';

/**
 * Upload a new APK version, or edit an existing one. Both forms hold the same
 * four things an admin turns: the version number, its description, whether it
 * can be downloaded, and when that stops.
 */
export default function VersionModal({ application, version, users = [], onClose, onSaved }) {
  const { t, fmt } = useI18n();
  const isNew = !version;
  const [form, setForm] = useState({
    version: version?.version || '',
    description: version?.description || '',
    expiresAt: dateInputValue(version?.expiresAt),
  });
  const [active, setActive] = useState(version ? version.isActive : true);
  const [makeCurrent, setMakeCurrent] = useState(isNew);
  const [restrict, setRestrict] = useState(version?.accessMode === 'custom');
  const [allowed, setAllowed] = useState((version?.allowedUsers || []).map((user) => user.id));
  const [apk, setApk] = useState(null);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    if (isNew && !apk) return setError(t('apps.version.needFile'));
    setError('');

    try {
      if (isNew) {
        setProgress(0);
        const body = new FormData();
        body.append('file', apk);
        body.append('version', form.version);
        body.append('description', form.description);
        body.append('isActive', String(active));
        body.append('expiresAt', form.expiresAt);
        body.append('makeCurrent', String(makeCurrent));
        if (restrict) body.append('userIds', JSON.stringify(allowed));

        const { version: created } = await api.addVersion(application.id, body, setProgress);
        return onSaved(created);
      }

      setBusy(true);
      await api.updateVersion(application.id, version.id, {
        version: form.version,
        description: form.description,
        isActive: active,
        expiresAt: form.expiresAt,
      });

      const wasRestricted = version.accessMode === 'custom';
      const changed =
        restrict !== wasRestricted ||
        (restrict &&
          allowed.slice().sort().join() !==
            (version.allowedUsers || [])
              .map((user) => user.id)
              .sort()
              .join());

      if (changed) {
        await api.setVersionAccess(application.id, version.id,
          restrict ? { userIds: allowed } : { inherit: true });
      }
      onSaved({ ...version, version: form.version });
    } catch (err) {
      setError(err.message);
      setProgress(null);
      setBusy(false);
    }
  };

  const working = busy || progress !== null;

  return (
    <Modal
      wide
      title={
        isNew
          ? t('apps.version.newTitle', { name: application.name })
          : t('apps.version.editTitle', { version: version.version })
      }
      description={
        isNew && application.currentVersion
          ? t('apps.version.currentIs', { version: application.currentVersion.version })
          : undefined
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose} disabled={working}>
            {t('common.actions.cancel')}
          </button>
          <button className="btn btn-primary" form="version-form" disabled={working}>
            {progress !== null
              ? t('apps.version.uploadingPct', { percent: progress })
              : busy
                ? t('common.actions.saving')
                : isNew
                  ? t('apps.version.upload')
                  : t('common.actions.save')}
          </button>
        </>
      }
    >
      <form id="version-form" className="form-grid" onSubmit={submit} noValidate>
        {error && <Banner>{error}</Banner>}

        <div className="pair">
          <Field
            label={t('apps.version.number')}
            htmlFor="v-number"
            hint={t('apps.version.numberHint')}
          >
            <input
              id="v-number"
              className="input mono"
              dir="ltr"
              value={form.version}
              onChange={set('version')}
              required
            />
          </Field>
          <Field
            label={t('apps.version.expiresOn')}
            htmlFor="v-expiry"
            hint={t(form.expiresAt ? 'apps.version.expiryHintSet' : 'apps.version.expiryHintEmpty')}
          >
            <input
              id="v-expiry"
              className="input"
              type="date"
              value={form.expiresAt}
              onChange={set('expiresAt')}
            />
          </Field>
        </div>

        <Field
          label={t('apps.version.description')}
          htmlFor="v-description"
          hint={t('apps.version.descriptionHint')}
        >
          <textarea
            id="v-description"
            className="input"
            rows={3}
            value={form.description}
            onChange={set('description')}
          />
        </Field>

        {isNew ? (
          <Field label={t('apps.version.file')} htmlFor="v-apk">
            <label className="dropzone" htmlFor="v-apk">
              <input
                id="v-apk"
                type="file"
                accept=".apk"
                onChange={(event) => setApk(event.target.files?.[0] || null)}
              />
              {apk ? (
                <span>
                  <strong>{apk.name}</strong>
                  <small className="mono">{fmt.size(apk.size)}</small>
                </span>
              ) : (
                <span>{t('apps.version.chooseApk')}</span>
              )}
            </label>
          </Field>
        ) : (
          <Field label={t('apps.version.fileLabel')}>
            <p className="muted">
              {t('apps.version.fileNote', {
                name: version.fileName,
                size: fmt.size(version.sizeBytes),
              })}
            </p>
          </Field>
        )}

        <Field
          label={t('apps.version.availability')}
          hint={t(active ? 'apps.version.activeHint' : 'apps.version.inactiveHint')}
        >
          <Switch
            checked={active}
            onChange={setActive}
            label={t(active ? 'common.status.active' : 'common.status.inactive')}
          />
        </Field>

        {isNew && (
          <label className="check">
            <input
              type="checkbox"
              checked={makeCurrent}
              onChange={(event) => setMakeCurrent(event.target.checked)}
            />
            {t('apps.version.makeCurrent')}
          </label>
        )}

        <Field label={t('apps.version.authorised')} hint={t('apps.version.authorisedHint')}>
          <div className="radios">
            <label>
              <input
                type="radio"
                name="access"
                checked={!restrict}
                onChange={() => setRestrict(false)}
              />
              {t('apps.version.useAppList')}
            </label>
            <label>
              <input
                type="radio"
                name="access"
                checked={restrict}
                onChange={() => setRestrict(true)}
              />
              {t('apps.version.onlyThese')}
            </label>
          </div>
        </Field>

        {restrict && <UserPicker users={users} selected={allowed} onChange={setAllowed} />}

        {progress !== null && (
          <div className="progress" role="progressbar" aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </div>
        )}
      </form>
    </Modal>
  );
}
