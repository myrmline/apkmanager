import { useState } from 'react';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { Banner, Field, Modal } from './ui.jsx';

/** One text box: add, edit, or clear the note on a version. */
export default function NoteModal({ application, version, onClose, onSaved }) {
  const { t } = useI18n();
  const [note, setNote] = useState(version.note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { version: saved } = await api.setVersionNote(application.id, version.id, note);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={t('apps.note.title', { version: version.version })}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-quiet" onClick={onClose} disabled={busy}>
            {t('common.actions.cancel')}
          </button>
          <button className="btn btn-primary" form="note-form" disabled={busy}>
            {busy ? t('common.actions.saving') : t('apps.note.save')}
          </button>
        </>
      }
    >
      <form id="note-form" className="form-grid" onSubmit={submit} noValidate>
        {error && <Banner>{error}</Banner>}

        <Field label={t('apps.note.label')} htmlFor="note" hint={t('apps.note.hint')}>
          <textarea
            id="note"
            className="input"
            rows={4}
            maxLength={2000}
            placeholder={t('apps.note.placeholder')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
