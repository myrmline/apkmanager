const BASE = import.meta.env.VITE_API_URL ?? '/api';
const TOKEN_KEY = 'relay.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...authHeaders(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new CustomEvent('relay:signed-out'));
  }
  if (!res.ok) throw new ApiError(data.error || 'That request did not go through.', res.status);
  return data;
}

/** Multipart over XHR, so large APKs can report progress. */
function upload(path, formData, onProgress, method = 'POST') {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, BASE + path);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      let data = {};
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        /* non-JSON response */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(data.error || 'The upload failed.', xhr.status));
    };
    xhr.onerror = () => reject(new ApiError('The upload could not reach the server.', 0));
    xhr.send(formData);
  });
}

/**
 * Fetches the file with the auth header, then hands it to the browser.
 *
 * `onProgress` is called with a whole percentage as the bytes arrive, or with
 * `null` when the server did not send a Content-Length — the caller then shows
 * a spinner without a number rather than inventing one.
 */
async function downloadFile(path, onProgress) {
  const res = await fetch(BASE + path, { headers: authHeaders() });
  if (!res.ok) {
    let message = 'The download was refused.';
    try {
      message = (await res.json()).error || message;
    } catch {
      /* keep the default */
    }
    throw new ApiError(message, res.status);
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const name = match ? decodeURIComponent(match[1]) : 'download.apk';

  const url = URL.createObjectURL(await readBody(res, onProgress));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return name;
}

/**
 * Read the response body, reporting progress as it goes.
 *
 * Without a Content-Length, or without a readable stream (older browsers),
 * there is nothing to measure: report `null` once and read it in one go.
 */
async function readBody(res, onProgress) {
  const total = Number(res.headers.get('Content-Length')) || 0;
  const type = res.headers.get('Content-Type') || 'application/octet-stream';

  if (!total || !res.body?.getReader) {
    onProgress?.(null);
    return res.blob();
  }

  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  let reported = 0;

  onProgress?.(0);
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;

    // 100% is reported once, after the stream ends. A small file that arrives
    // in one chunk therefore goes 0 -> 100 with nothing in between, and a
    // proxy that re-encodes cannot push the number past the end either.
    const percent = Math.floor((loaded / total) * 100);
    if (percent < 100 && percent !== reported) {
      reported = percent;
      onProgress?.(percent);
    }
  }

  onProgress?.(100);
  return new Blob(chunks, { type });
}

const withQuery = (path, params) => {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== '' && value != null),
  );
  return query.toString() ? `${path}?${query}` : path;
};

/** <img> cannot send an Authorization header, so the icon carries the token. */
export const iconSrc = (application) =>
  application?.iconUrl ? `${BASE}${application.iconUrl}?token=${getToken()}` : null;

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/me/password', { method: 'PUT', body: { currentPassword, newPassword } }),

  listUsers: (search = '') => request(withQuery('/users', { search })),
  createUser: (payload) => request('/users', { method: 'POST', body: payload }),
  updateUser: (id, payload) => request(`/users/${id}`, { method: 'PUT', body: payload }),
  setUserActive: (id, isActive) =>
    request(`/users/${id}/active`, { method: 'PATCH', body: { isActive } }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),

  listApplications: (params = {}) => request(withQuery('/applications', params)),
  getApplication: (id) => request(`/applications/${id}`),
  createApplication: (formData, onProgress) => upload('/applications', formData, onProgress),
  updateApplication: (id, formData, onProgress) =>
    upload(`/applications/${id}`, formData, onProgress, 'PUT'),
  setApplicationActive: (id, isActive) =>
    request(`/applications/${id}/status`, { method: 'PATCH', body: { isActive } }),
  deleteApplication: (id) => request(`/applications/${id}`, { method: 'DELETE' }),
  setApplicationAccess: (id, userIds) =>
    request(`/applications/${id}/access`, { method: 'PUT', body: { userIds } }),

  addVersion: (id, formData, onProgress) =>
    upload(`/applications/${id}/versions`, formData, onProgress),
  updateVersion: (id, versionId, payload) =>
    request(`/applications/${id}/versions/${versionId}`, { method: 'PUT', body: payload }),
  setVersionNote: (id, versionId, note) =>
    request(`/applications/${id}/versions/${versionId}/note`, { method: 'PUT', body: { note } }),
  setVersionActive: (id, versionId, isActive) =>
    request(`/applications/${id}/versions/${versionId}/active`, {
      method: 'PATCH',
      body: { isActive },
    }),
  setVersionAccess: (id, versionId, payload) =>
    request(`/applications/${id}/versions/${versionId}/access`, { method: 'PUT', body: payload }),
  makeCurrent: (id, versionId) =>
    request(`/applications/${id}/versions/${versionId}/current`, { method: 'POST' }),
  deleteVersion: (id, versionId) =>
    request(`/applications/${id}/versions/${versionId}`, { method: 'DELETE' }),

  listAssets: (id) => request(`/applications/${id}/assets`),
  uploadAsset: (id, formData, onProgress) =>
    upload(`/applications/${id}/assets`, formData, onProgress),
  deleteAsset: (id, name) =>
    request(`/applications/${id}/assets/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  downloadAsset: (id, name, onProgress) =>
    downloadFile(`/applications/${id}/assets/${encodeURIComponent(name)}`, onProgress),

  downloadCurrent: (id, onProgress) =>
    downloadFile(`/applications/${id}/download`, onProgress),
  downloadVersion: (id, versionId, onProgress) =>
    downloadFile(`/applications/${id}/versions/${versionId}/download`, onProgress),
};
