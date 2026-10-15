import React, { useMemo, useState } from 'react';
import { App, Button, Select, Space } from 'antd';
import { FileWordOutlined } from '@ant-design/icons';
import { downloadMeetingConvocationWord } from '../../services/syndic-service';
import type { MeetingLot } from '../../types/syndic-types';
import { describeDownloadError } from '../../utils/download-error';
import { saveBlob } from '../../utils/save-blob';
import { formatLotLabel } from '../../utils/syndic-lot-label';
import { t } from '../../i18n/t';

interface MeetingConvocationWordProps {
  tenantId: string;
  syndicId: string;
  meetingId: string;
  lots: MeetingLot[];
}

/**
 * Convocation à l'assemblée en Word pour un lot : choix du lot, puis
 * téléchargement du .docx rempli (copropriétaire du lot, ordre du jour,
 * date, lieu, quorum). La route filtre par agence et copropriété.
 */
export const MeetingConvocationWord: React.FC<MeetingConvocationWordProps> = ({
  tenantId,
  syndicId,
  meetingId,
  lots
}) => {
  const { message } = App.useApp();
  const [lotId, setLotId] = useState<string | undefined>();
  const [downloading, setDownloading] = useState(false);
  const options = useMemo(() => lots.map(lot => ({ value: lot.id, label: formatLotLabel(lot) })), [lots]);

  if (lots.length === 0) return null;

  const handleDownload = async () => {
    if (!lotId || !tenantId || !syndicId) return;
    setDownloading(true);
    try {
      const { blob, filename } = await downloadMeetingConvocationWord(tenantId, syndicId, meetingId, lotId);
      saveBlob(blob, filename);
    } catch (err) {
      message.error(await describeDownloadError(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Space>
      <Select
        showSearch
        optionFilterProp="label"
        placeholder={t('Choisir un lot')}
        style={{ minWidth: 200 }}
        value={lotId}
        onChange={setLotId}
        options={options}
      />
      <Button icon={<FileWordOutlined />} disabled={!lotId} loading={downloading} onClick={() => void handleDownload()}>
        {t('Convocation (Word)')}
      </Button>
    </Space>
  );
};
