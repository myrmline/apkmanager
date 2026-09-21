/** Never let password_hash leave the server. */
export const publicUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  isActive: row.is_active,
  createdAt: row.created_at,
});

/**
 * Active / Inactive / Expired is derived, never stored: an admin turns the
 * switch or sets a date, and the label follows from those two facts.
 */
export function versionStatus(row) {
  if (row.expires_at && new Date(row.expires_at) <= new Date()) return 'expired';
  return row.is_active ? 'active' : 'inactive';
}

export const publicVersion = (row) => ({
  id: row.id,
  applicationId: row.application_id,
  version: row.version,
  description: row.description,
  note: row.note ?? null,
  status: versionStatus(row),
  isActive: row.is_active,
  expiresAt: row.expires_at,
  isCurrent: row.is_current,
  fileName: row.original_name,
  sizeBytes: row.size_bytes,
  checksum: row.checksum,
  uploadedAt: row.uploaded_at,
  uploadedBy: row.uploaded_by_name ?? null,
  downloadCount: row.download_count ?? undefined,
  // 'inherited' = uses the application's access list; 'custom' = narrowed.
  accessMode: row.custom_access ? 'custom' : 'inherited',
  userCount: row.user_count ?? undefined,
  allowedUsers: row.allowed_users ?? undefined,
});

export const publicApplication = (row) => ({
  id: row.id,
  name: row.name,
  packageName: row.package_name,
  description: row.description,
  status: row.status,
  iconUrl: row.icon_stored_name ? `/applications/${row.id}/icon` : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  createdBy: row.created_by_name ?? null,
  versionCount: row.version_count ?? undefined,
  userCount: row.user_count ?? undefined,
  downloadableCount: row.downloadable_count ?? undefined,
  currentVersion: row.current_version
    ? {
        id: row.current_version_id,
        version: row.current_version,
        sizeBytes: row.current_version_size,
        uploadedAt: row.current_version_uploaded_at,
        expiresAt: row.current_version_expires_at,
        status: versionStatus({
          is_active: row.current_version_is_active,
          expires_at: row.current_version_expires_at,
        }),
      }
    : null,
});
