import React, { useState } from 'react';
import { App, Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { downloadPatrimoineExport, type PatrimoineExportFormat } from '../../services/patrimoine-service';
import { saveBlob } from '../../utils/save-blob';
import { t } from '../../i18n/t';

interface Props {
  tenantId: string;
  /** Absent : export de toute l'agence. Présent : export du bien seul. */
  propertyId?: string;
}

/**
 * Message d'un export en échec.
 *
 * `apiClient` demande `responseType: 'blob'` : le corps d'erreur JSON du
 * serveur arrive alors comme un `Blob`, pas comme un objet déjà analysé
 * (voir `pages/CoOwnerPortal/portal-error.ts` `blobErrorMessage`, même
 * contrainte). On relit ce blob comme du texte, puis on le décode en JSON ;
 * tout autre cas retombe sur le message générique.
 */
async function exportErrorMessage(error: unknown, fallback: string): Promise<string> {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      if (parsed.message) return parsed.message;
      if (parsed.error) return parsed.error;
    } catch {
      // Corps non JSON : on retombe sur `fallback`.
    }
  }
  return fallback;
}

/**
 * Bouton d'export du patrimoine (P3) — synthèse PDF ou classeur Excel, pour
 * toute l'agence ou pour un seul bien selon que `propertyId` est fourni.
 */
export const PatrimoineExportButton: React.FC<Props> = ({ tenantId, propertyId }) => {
  const { message } = App.useApp();
  const [loadingFormat, setLoadingFormat] = useState<PatrimoineExportFormat | null>(null);

  const exporter = async (format: PatrimoineExportFormat) => {
    setLoadingFormat(format);
    try {
      const { blob, filename } = await downloadPatrimoineExport(tenantId, format, propertyId);
      saveBlob(blob, filename);
    } catch (error) {
      message.error(await exportErrorMessage(error, t('Export impossible')));
    } finally {
      setLoadingFormat(null);
    }
  };

  const items: MenuProps['items'] = [
    { key: 'pdf', label: t('Synthèse PDF'), onClick: () => exporter('pdf') },
    { key: 'xlsx', label: t('Classeur Excel'), onClick: () => exporter('xlsx') }
  ];

  return (
    <Dropdown menu={{ items }} trigger={['click']} disabled={loadingFormat !== null}>
      <Button icon={<DownloadOutlined />} loading={loadingFormat !== null}>
        {t('Exporter')}
      </Button>
    </Dropdown>
  );
};
