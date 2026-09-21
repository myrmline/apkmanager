/**
 * Formatting helpers. Anything with words in it takes the `t` function, so the
 * wording comes from the data folders and only the arithmetic lives here.
 */

const UNITS = ['KB', 'MB', 'GB'];

/** Bytes to a short size string. Units stay Latin: they read as technical data. */
export function fileSize(bytes, intl = 'en') {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;

  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const digits = value >= 100 ? 0 : 1;
  const number = new Intl.NumberFormat(intl, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

  return `${number} ${UNITS[unit]}`;
}

/** yyyy-mm-dd for <input type="date">, in the viewer's own timezone. */
export function dateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const DAY = 86400000;

export function makeFormatters(intl, t) {
  const dateOnly = new Intl.DateTimeFormat(intl, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const dateAndTime = new Intl.DateTimeFormat(intl, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const date = (value) => (value ? dateOnly.format(new Date(value)) : '—');

  return {
    date,
    dateTime: (value) => (value ? dateAndTime.format(new Date(value)) : '—'),
    size: (bytes) => fileSize(bytes, intl),

    /** "today", "yesterday", "N days ago", then an absolute date. */
    relative(value) {
      if (!value) return '—';
      const days = Math.floor((Date.now() - new Date(value).getTime()) / DAY);
      if (days <= 0) return t('common.time.today');
      if (days === 1) return t('common.time.yesterday');
      if (days < 30) return t('common.time.daysAgo', { count: days });
      return date(value);
    },

    /** The line under a version: no expiry, expired, or how long is left. */
    expiry(version) {
      if (!version.expiresAt) return t('apps.expiry.none');
      const days = Math.ceil((new Date(version.expiresAt) - Date.now()) / DAY);
      if (days < 0) return t('apps.expiry.expiredOn', { date: date(version.expiresAt) });
      if (days === 0) return t('apps.expiry.today');
      if (days === 1) return t('apps.expiry.tomorrow');
      if (days <= 30) return t('apps.expiry.inDays', { count: days });
      return t('apps.expiry.onDate', { date: date(version.expiresAt) });
    },
  };
}
