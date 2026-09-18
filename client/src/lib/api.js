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
    headers: {
      ...authHeaders(),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
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

/** Multipart upload over XHR, so large APKs can report progress. */
function upload(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', BASE + path);
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

/** Fetches the binary with the auth header, then hands it to the browser. */
async function downloadFile(path) {
  const res = await fetch(BASE + path, { headers: authHeaders() });
  if (!res.ok) {
    let message = 'The download was refused.';
    try {
      message = (await res.json()).error || message;
    } catch {
      /* keep default */
    }
    throw new ApiError(message, res.status);
  }

  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const name = match ? decodeURIComponent(match[1]) : 'download.apk';

  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return name;
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/me/password', { method: 'PUT', body: { currentPassword, newPassword } }),

  listUsers: (search = '') => request(`/users?search=${encodeURIComponent(search)}`),
  createUser: (payload) => request('/users', { method: 'POST', body: payload }),
  updateUser: (id, payload) => request(`/users/${id}`, { method: 'PUT', body: payload }),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),

  listFiles: (params = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v != null),
    );
    return request(`/files${query.toString() ? `?${query}` : ''}`);
  },
  getFile: (id) => request(`/files/${id}`),
  createFile: (formData, onProgress) => upload('/files', formData, onProgress),
  updateFile: (id, payload) => request(`/files/${id}`, { method: 'PUT', body: payload }),
  deleteFile: (id) => request(`/files/${id}`, { method: 'DELETE' }),
  setAccess: (id, userIds) => request(`/files/${id}/access`, { method: 'PUT', body: { userIds } }),

  addVersion: (id, formData, onProgress) => upload(`/files/${id}/versions`, formData, onProgress),
  updateVersion: (id, versionId, payload) =>
    request(`/files/${id}/versions/${versionId}`, { method: 'PUT', body: payload }),
  makeCurrent: (id, versionId) =>
    request(`/files/${id}/versions/${versionId}/current`, { method: 'POST' }),
  deleteVersion: (id, versionId) =>
    request(`/files/${id}/versions/${versionId}`, { method: 'DELETE' }),

  downloadCurrent: (id) => downloadFile(`/files/${id}/download`),
  downloadVersion: (id, versionId) => downloadFile(`/files/${id}/versions/${versionId}/download`),
};
