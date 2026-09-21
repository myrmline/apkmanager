import { useMemo, useState } from 'react';
import { useI18n } from '../lib/i18n.jsx';

/**
 * Checklist of who may download. Admins are left out, because they can reach
 * everything anyway.
 */
export default function UserPicker({ users, selected, onChange }) {
  const { t } = useI18n();
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter(
      (user) =>
        user.role !== 'admin' &&
        (!term ||
          user.name.toLowerCase().includes(term) ||
          user.email.toLowerCase().includes(term)),
    );
  }, [users, search]);

  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);

  const visibleIds = visible.filter((user) => user.isActive).map((user) => user.id);
  const allPicked = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  return (
    <div className="picker">
      <div className="picker-head">
        <input
          type="search"
          className="input"
          placeholder={t('apps.picker.searchPeople')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={() =>
            onChange(
              allPicked
                ? selected.filter((id) => !visibleIds.includes(id))
                : [...new Set([...selected, ...visibleIds])],
            )
          }
        >
          {t(allPicked ? 'apps.picker.clearThese' : 'apps.picker.selectThese')}
        </button>
      </div>

      <ul className="picker-list">
        {visible.map((user) => (
          <li key={user.id}>
            <label className={user.isActive ? '' : 'is-off'}>
              <input
                type="checkbox"
                checked={selected.includes(user.id)}
                onChange={() => toggle(user.id)}
              />
              <span className="picker-name">
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </span>
              {!user.isActive && (
                <span className="chip chip-mute">{t('apps.picker.deactivated')}</span>
              )}
            </label>
          </li>
        ))}
        {visible.length === 0 && <li className="picker-blank">{t('apps.picker.noMatch')}</li>}
      </ul>

      <p className="picker-foot">
        {selected.length === 0
          ? t('apps.picker.nobody')
          : t('apps.picker.canDownload', { count: selected.length })}
      </p>
    </div>
  );
}
