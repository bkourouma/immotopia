import React, { useState } from 'react';
import { App, Button, Dropdown, Space } from 'antd';
import type { MenuProps } from 'antd';
import { DownloadOutlined, FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons';
import {
  downloadNetWorthExport,
  type NetWorthExportFormat
} from '../../../services/patrimoine-net-worth-export-service';
import { saveBlob } from '../../../utils/save-blob';
import { t } from '../../../i18n/t';
import { HelpButton } from '../../../help';

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

/** Menu « Exporter » de la situation patrimoniale : PDF ou Excel (un seul bouton, même sur téléphone). */
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

  const items: MenuProps['items'] = [
    { key: 'pdf', icon: <FilePdfOutlined />, label: t('Exporter en PDF'), onClick: () => exporter('pdf') },
    { key: 'xlsx', icon: <FileExcelOutlined />, label: t('Exporter en Excel'), onClick: () => exporter('xlsx') }
  ];

  return (
    <Space size="small">
      <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight" disabled={loading !== null}>
        <Button icon={<DownloadOutlined />} loading={loading !== null}>
          {t('Exporter')}
        </Button>
      </Dropdown>
      <HelpButton size="small" helpId="patrimoine.valeur-nette.exports" />
    </Space>
  );
};
