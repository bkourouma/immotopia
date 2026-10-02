import apiClient from '../utils/api-client';
import { filenameFromDisposition } from '../utils/save-blob';

export type NetWorthExportFormat = 'pdf' | 'xlsx';

/**
 * Export de la situation patrimoniale (lot 5) : valeur nette, actifs, dettes
 * et historique, en PDF ou Excel. Fichier binaire construit à la volée par
 * `GET /tenants/:tenantId/patrimoine/net-worth/export`, jamais servi en statique.
 */
export async function downloadNetWorthExport(
  tenantId: string,
  format: NetWorthExportFormat
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(
    `/tenants/${encodeURIComponent(tenantId)}/patrimoine/net-worth/export?format=${format}`,
    { responseType: 'blob' }
  );
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], `situation-patrimoniale.${format}`)
  };
}
