import apiClient from '../utils/api-client';

/**
 * Fichiers des pièces jointes de maintenance.
 *
 * Une pièce jointe n'est jamais servie en statique : `/uploads/maintenance`
 * répond 404. Chaque écran la demande à SA route authentifiée, qui vérifie le
 * droit de l'appelant sur le ticket :
 *   - gestion : `/tenants/:tenantId/maintenance/files/:attachmentId` ;
 *   - portail locataire : `/portal/tenant/maintenance/:ticketId/attachments/:attachmentId` ;
 *   - portail propriétaire : `/portal/owner/maintenance/:ticketId/attachments/:attachmentId`.
 * Le fichier revient en blob par `api-client`, qui porte la session (et
 * l'en-tête `X-Portal-Tenant-Id` sur les portails) : aucun jeton dans l'URL.
 */
export type MaintenanceAttachmentSource =
  | { kind: 'agency'; tenantId: string }
  | { kind: 'tenant-portal'; ticketId: string }
  | { kind: 'owner-portal'; ticketId: string };

export function maintenanceAttachmentPath(source: MaintenanceAttachmentSource, attachmentId: string): string {
  const attachment = encodeURIComponent(attachmentId);
  switch (source.kind) {
    case 'agency':
      return `/tenants/${encodeURIComponent(source.tenantId)}/maintenance/files/${attachment}`;
    case 'tenant-portal':
      return `/portal/tenant/maintenance/${encodeURIComponent(source.ticketId)}/attachments/${attachment}`;
    case 'owner-portal':
      return `/portal/owner/maintenance/${encodeURIComponent(source.ticketId)}/attachments/${attachment}`;
  }
}

/** Le fichier à `path` (une des routes ci-dessus), en blob. */
export async function fetchMaintenanceAttachmentBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const response = await apiClient.get<Blob>(path, { responseType: 'blob', signal });
  return response.data;
}

export function fetchMaintenanceAttachment(
  source: MaintenanceAttachmentSource,
  attachmentId: string,
  signal?: AbortSignal
): Promise<Blob> {
  return fetchMaintenanceAttachmentBlob(maintenanceAttachmentPath(source, attachmentId), signal);
}
