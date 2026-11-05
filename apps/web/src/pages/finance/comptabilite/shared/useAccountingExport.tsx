import React, { useCallback, useState } from 'react';
import { App, Button, Space } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { downloadAccountingExport } from '../../../../services/accounting-exports-service';
import type { AccountingExportParams, AccountingReport } from '../../../../services/accounting-exports-service';
import { t } from '../../../../i18n/t';

export type ExportFormat = 'xlsx' | 'csv';

/** Déclenche le téléchargement d'un fichier déjà reçu du serveur. */
function telecharger(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const lien = window.document.createElement('a');
  lien.href = url;
  lien.download = filename;
  window.document.body.appendChild(lien);
  lien.click();
  // L'URL d'objet est révoquée APRÈS le retrait du lien : l'inverse laisse
  // au navigateur une référence vers une URL déjà libérée.
  window.document.body.removeChild(lien);
  window.URL.revokeObjectURL(url);
}

/**
 * Export d'un état comptable. `exportEnCours` vaut `<report>-<format>` pendant
 * le téléchargement (`null` sinon). `params` : les filtres de l'écran, sans
 * pagination. Une erreur s'affiche en message ; elle ne remonte pas.
 */
export function useAccountingExport(tenantId: string | undefined) {
  const { message } = App.useApp();
  const [exportEnCours, setExportEnCours] = useState<string | null>(null);

  const exporter = useCallback(
    async (report: AccountingReport, format: ExportFormat, params: AccountingExportParams, fallbackName: string) => {
      if (!tenantId) return;
      setExportEnCours(`${report}-${format}`);
      try {
        const { blob, filename } = await downloadAccountingExport(tenantId, report, format, params, fallbackName);
        telecharger(blob, filename);
      } catch (err: unknown) {
        const detail = (err as { response?: { data?: { message?: string } } } | null)?.response?.data?.message;
        message.error(detail || t('Le téléchargement a échoué.'));
      } finally {
        setExportEnCours(null);
      }
    },
    [tenantId, message]
  );

  return { exportEnCours, exporter };
}

/**
 * Le jeu unique de boutons d'export d'un écran. `loadingKey` : `exportEnCours`
 * du hook ; le bouton du format en cours tourne, l'autre est désactivé.
 */
export const ExportButtons: React.FC<{
  loadingKey: string | null;
  onExport: (format: ExportFormat) => void;
  disabled?: boolean;
}> = ({ loadingKey, onExport, disabled }) => (
  <Space wrap>
    <Button
      icon={<DownloadOutlined />}
      loading={loadingKey?.endsWith('-xlsx') ?? false}
      disabled={disabled || (loadingKey !== null && !loadingKey.endsWith('-xlsx'))}
      onClick={() => onExport('xlsx')}
    >
      {t('Exporter en Excel')}
    </Button>
    <Button
      icon={<DownloadOutlined />}
      loading={loadingKey?.endsWith('-csv') ?? false}
      disabled={disabled || (loadingKey !== null && !loadingKey.endsWith('-csv'))}
      onClick={() => onExport('csv')}
    >
      {t('Exporter en CSV')}
    </Button>
  </Space>
);
