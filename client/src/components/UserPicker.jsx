import { useMemo, useState } from 'react';

/**
 * Checklist of who may download a build. Admins are shown greyed out with a
 * note, because they can reach every build anyway.
 */
export default function UserPicker({ users, selected, onChange }) {
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
    onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);

  const allVisibleIds = visible.filter((u) => u.isActive).map((u) => u.id);
  const allPicked = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.includes(id));

  return (
    <div className="picker">
      <div className="picker-head">
        <input
          type="search"
          className="input"
          placeholder="Search people"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-quiet btn-sm"
          onClick={() =>
            onChange(allPicked ? selected.filter((id) => !allVisibleIds.includes(id)) : [
              ...new Set([...selected, ...allVisibleIds]),
            ])
          }
        >
          {allPicked ? 'Clear these' : 'Select these'}
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
              {!user.isActive && <span className="chip chip-mute">Deactivated</span>}
            </label>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="picker-blank">No one matches that search.</li>
        )}
      </ul>

      <p className="picker-foot">
        {selected.length === 0
          ? 'No one can download this yet.'
          : `${selected.length} ${selected.length === 1 ? 'person' : 'people'} can download this. Admins always can.`}
      </p>
    </div>
  );
}
