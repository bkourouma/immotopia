import React, { useState } from 'react';
import { App, Button, Space } from 'antd';
import { FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons';
import {
  downloadNetWorthExport,
  type NetWorthExportFormat
} from '../../../services/patrimoine-net-worth-export-service';
import { saveBlob } from '../../../utils/save-blob';
import { t } from '../../../i18n/t';

/**
 * Message d'un export en échec : `apiClient` demande `responseType: 'blob'`,
 * donc le corps d'erreur JSON du serveur arrive comme un `Blob` à relire.
 */
async function exportErrorMessage(error: unknown, fallback: string): Promise<string> {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { message?: string; error?: string };
      if (parsed.message) return parsed.message;
      if (parsed.error) return parsed.error;
    } catch {
      // Corps non JSON : message générique.
    }
  }
  return fallback;
}

/** Boutons « Exporter en PDF » / « Exporter en Excel » de la situation patrimoniale. */
export const NetWorthExportButtons: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState<NetWorthExportFormat | null>(null);

  const exporter = async (format: NetWorthExportFormat) => {
    setLoading(format);
    try {
      const { blob, filename } = await downloadNetWorthExport(tenantId, format);
      saveBlob(blob, filename);
    } catch (error) {
      message.error(await exportErrorMessage(error, t('Export impossible')));
    } finally {
      setLoading(null);
    }
  };

  return (
    <Space wrap style={{ marginBottom: 'var(--space-4)' }}>
      <Button
        icon={<FilePdfOutlined />}
        loading={loading === 'pdf'}
        disabled={loading !== null}
        onClick={() => exporter('pdf')}
      >
        {t('Exporter en PDF')}
      </Button>
      <Button
        icon={<FileExcelOutlined />}
        loading={loading === 'xlsx'}
        disabled={loading !== null}
        onClick={() => exporter('xlsx')}
      >
        {t('Exporter en Excel')}
      </Button>
    </Space>
  );
};
