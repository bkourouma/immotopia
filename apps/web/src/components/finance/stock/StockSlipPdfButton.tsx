import React, { useState } from 'react';
import { App, Button } from 'antd';
import { FilePdfOutlined } from '@ant-design/icons';
import { downloadStockCountReport, downloadStockSlipPdf } from '../../../services/finance-stock-controle-service';
import { saveBlob } from '../../../utils/save-blob';
import { describeDownloadError } from '../../../utils/download-error';
import { t } from '../../../i18n/t';

export interface StockSlipPdfButtonProps {
  tenantId: string;
  /** Un bon (BR, BS, PVI numéroté) : « Télécharger le bon (PDF) ». */
  slipId?: string;
  /** Un inventaire validé : « Télécharger le procès-verbal (PDF) » (numéroté ou antérieur à la numérotation). */
  countId?: string;
  /** Numéro imprimé (« BS-2026-00042 »), nom du fichier quand l'en-tête n'en donne pas. */
  number?: string | null;
  disabled?: boolean;
}

/**
 * Téléchargement d'un bon ou d'un procès-verbal en PDF (ecrans §4). Le PDF se
 * régénère côté serveur ; il est lu par `apiClient` en `blob` puis enregistré
 * par le navigateur. Une erreur est relayée par `describeDownloadError`, qui
 * lit le corps JSON d'un refus.
 */
export const StockSlipPdfButton: React.FC<StockSlipPdfButtonProps> = ({
  tenantId,
  slipId,
  countId,
  number,
  disabled
}) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const isReport = Boolean(countId) && !slipId;
  const fallbackName = `${number || (isReport ? 'proces-verbal-inventaire' : 'bon')}.pdf`;

  const download = async () => {
    setLoading(true);
    try {
      const file = isReport
        ? await downloadStockCountReport(tenantId, countId as string, fallbackName)
        : await downloadStockSlipPdf(tenantId, slipId as string, fallbackName);
      saveBlob(file.blob, file.filename);
    } catch (error) {
      message.error(await describeDownloadError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      icon={<FilePdfOutlined />}
      loading={loading}
      disabled={disabled || (!slipId && !countId)}
      onClick={() => void download()}
      style={{ minHeight: 44 }}
    >
      {isReport ? t('Télécharger le procès-verbal (PDF)') : t('Télécharger le bon (PDF)')}
    </Button>
  );
};

export default StockSlipPdfButton;
