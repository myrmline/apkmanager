/** Never let password_hash leave the server. */
export const publicUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  isActive: row.is_active,
  createdAt: row.created_at,
});

export const publicVersion = (row) => ({
  id: row.id,
  fileId: row.file_id,
  version: row.version,
  notes: row.notes,
  status: row.status,
  isCurrent: row.is_current,
  fileName: row.original_name,
  sizeBytes: row.size_bytes,
  checksum: row.checksum,
  uploadedAt: row.uploaded_at,
  uploadedBy: row.uploaded_by_name ?? null,
  downloadCount: row.download_count ?? undefined,
});

export const publicFile = (row) => ({
  id: row.id,
  name: row.name,
  packageName: row.package_name,
  description: row.description,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  createdBy: row.created_by_name ?? null,
  versionCount: row.version_count ?? undefined,
  userCount: row.user_count ?? undefined,
  currentVersion: row.current_version
    ? {
        id: row.current_version_id,
        version: row.current_version,
        status: row.current_version_status,
        sizeBytes: row.current_version_size,
        uploadedAt: row.current_version_uploaded_at,
      }
    : null,
});
