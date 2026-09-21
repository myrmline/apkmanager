/**
 * Naming rules for everything written under public/. CommonJS so the Knex
 * migrations and seeds can require it and the ESM server can import it — one
 * definition, no chance of the two drifting apart.
 */

// Names Windows refuses as file or folder names, whatever the extension.
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/**
 * Folder name for an application, from its display name.
 *
 * Letters and digits from any script survive, so "Field Service" becomes
 * "field-service" and an Arabic name keeps its Arabic letters rather than
 * collapsing to nothing. Everything else becomes a single hyphen. The result
 * can never be "." or "..", and never contains a path separator.
 */
function slugify(name) {
  let slug = String(name || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');

  if (!slug) slug = 'app';
  if (RESERVED.test(slug)) slug = `app-${slug}`;
  return slug;
}

/**
 * A file name that is safe to write inside a folder we control: no path
 * separators, no control characters, no leading dots (so no hidden files and no
 * "..", no characters Windows rejects. Returns `fallback` if nothing is left.
 */
function safeFileName(name, fallback = 'file') {
  const cleaned = String(name || '')
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\\u0000-\u001f<>:"|?*]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^[.\-]+/, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 120);

  const stem = cleaned.replace(/\.[^.]*$/, '');
  if (!cleaned || RESERVED.test(stem)) return fallback;
  return cleaned;
}

module.exports = { slugify, safeFileName };
