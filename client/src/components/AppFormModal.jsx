import { useState } from 'react';
import { api, iconSrc } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { AppIcon, Banner, Field, Modal, Switch } from './ui.jsx';
import UserPicker from './UserPicker.jsx';

/**
 * Create or edit an application. Access is chosen here when creating, so a new
 * application never sits around with nobody able to reach it; afterwards it is
 * managed on the application's own page.
 */
export default function AppFormModal({ application, users = [], onClose, onSaved }) {
  const { t } = useI18n();
  const isNew = !application;
  const [form, setForm] = useState({
    name: application?.name || '',
    packageName: application?.packageName || '',
    description: application?.description || '',
  });
  const [active, setActive] = useState(application ? application.status === 'active' : true);
  const [icon, setIcon] = useState(null);
  const [removeIcon, setRemoveIcon] = useState(false);
  const [allowed, setAllowed] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const existingIcon = !removeIcon && !icon && iconSrc(application);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);

    const body = new FormData();
    body.append('name', form.name);
    body.append('packageName', form.packageName);
    body.append('description', form.description);
    body.append('status', active ? 'active' : 'inactive');
    if (icon) body.append('icon', icon);
    if (isNew) body.append('userIds', JSON.stringify(allowed));
    else body.append('removeIcon', String(removeIcon));

    try {
      const result = isNew
        ? await api.createApplication(body)
        : await api.updateApplication(application.id, body);
      onSaved(result.application);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      wide={isNew}
      title={isNew ? t('apps.form.newTitle') : t('apps.form.editTitle', { name: application.name })}
      description={isNew ? t('apps.form.newDescription') : undefined}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose} disabled={busy}>
            {t('common.actions.cancel')}
          </button>
          <button className="btn btn-primary" form="app-form" disabled={busy}>
            {busy
              ? t('common.actions.saving')
              : isNew
                ? t('apps.form.create')
                : t('common.actions.save')}
          </button>
        </>
      }
    >
      <form id="app-form" className="form-grid" onSubmit={submit} noValidate>
        {error && <Banner>{error}</Banner>}

        <Field label={t('apps.form.name')} htmlFor="app-name">
          <input id="app-name" className="input" value={form.name} onChange={set('name')} required />
        </Field>

        <Field label={t('apps.form.packageName')} htmlFor="app-package" hint={t('apps.form.packageHint')}>
          <input
            id="app-package"
            className="input mono"
            dir="ltr"
            value={form.packageName}
            onChange={set('packageName')}
          />
        </Field>

        <Field label={t('apps.form.description')} htmlFor="app-description">
          <textarea
            id="app-description"
            className="input"
            rows={3}
            value={form.description}
            onChange={set('description')}
          />
        </Field>

        <Field label={t('apps.form.icon')} hint={t('apps.form.iconHint')}>
          <div className="icon-picker">
            {icon ? (
              <span className="app-icon app-icon-lg">
                <img src={URL.createObjectURL(icon)} alt="" />
              </span>
            ) : existingIcon ? (
              <AppIcon application={application} large />
            ) : (
              <AppIcon application={{ name: form.name || '?' }} large />
            )}

            <label className="dropzone" htmlFor="app-icon">
              <input
                id="app-icon"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(event) => {
                  setIcon(event.target.files?.[0] || null);
                  setRemoveIcon(false);
                }}
              />
              <span>{icon ? <strong>{icon.name}</strong> : t('apps.form.chooseImage')}</span>
            </label>
          </div>
          {!isNew && (application.iconUrl || icon) && (
            <label className="check">
              <input
                type="checkbox"
                checked={removeIcon}
                onChange={(event) => {
                  setRemoveIcon(event.target.checked);
                  if (event.target.checked) setIcon(null);
                }}
              />
              {t('apps.form.removeIcon')}
            </label>
          )}
        </Field>

        <Field
          label={t('apps.form.availability')}
          hint={t(active ? 'apps.form.activeHint' : 'apps.form.inactiveHint')}
        >
          <Switch
            checked={active}
            onChange={setActive}
            label={t(active ? 'common.status.active' : 'common.status.inactive')}
          />
        </Field>

        {isNew && (
          <Field label={t('apps.form.whoCanDownload')}>
            <UserPicker users={users} selected={allowed} onChange={setAllowed} />
          </Field>
        )}
      </form>
    </Modal>
  );
}
