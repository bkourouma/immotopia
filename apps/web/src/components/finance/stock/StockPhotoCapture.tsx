import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Select, Space, Typography, Upload } from 'antd';
import { CameraOutlined, ReloadOutlined } from '@ant-design/icons';
import { uploadStockAttachment } from '../../../services/finance-stock-controle-service';
import { downscaleImageFile } from '../../../utils/downscale-image';
import { nouvelIdentifiantDeRequete } from '../../../utils/stock-client-request-id';
import {
  STOCK_ATTACHMENT_PURPOSE_LABELS,
  type StockAttachmentPurpose,
  type StockAttachmentTarget,
  type StockAttachmentView
} from '../../../types/finance-stock-controle-types';
import { t } from '../../../i18n/t';

const { Text } = Typography;

/** Grand côté et qualité JPEG recommandés avant envoi (spec B3-R5). */
const PHOTO_MAX_SIDE = 1600;
const PHOTO_JPEG_QUALITY = 0.7;
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,application/pdf';

export interface StockPhotoCaptureProps {
  tenantId: string;
  /**
   * La cible des pièces. Absente tant que l'opération n'est pas enregistrée
   * (photo prise avant la sortie) : les fichiers attendent, puis partent dès
   * qu'elle existe.
   */
  target?: { type: StockAttachmentTarget; id: string };
  /** Finalités proposées ; la première est celle par défaut. */
  purposes: StockAttachmentPurpose[];
  /** Appelé pour chaque pièce enregistrée par le serveur. */
  onUploaded?: (attachment: StockAttachmentView) => void;
  /**
   * Appelé quand le nombre de pièces en échec change (0 compris, au retour
   * d'un réessai réussi) : l'écran appelant en tire un message groupé
   * (ecrans §6.7) sans retirer le « Réessayer » de chaque pièce.
   */
  onFailedCountChange?: (failedCount: number) => void;
  disabled?: boolean;
}

type ItemStatus = 'pending' | 'sending' | 'sent' | 'failed';

interface PendingItem {
  key: string;
  file: File;
  fileName: string;
  purpose: StockAttachmentPurpose;
  /** Tiré à la prise de vue, gardé jusqu'au succès : un réessai ne dépose pas deux fois (B5-R7). */
  clientRequestId: string;
  status: ItemStatus;
  error?: string;
}

const STATUS_LABEL: Record<ItemStatus, () => string> = {
  pending: () => t('En attente'),
  sending: () => t('Envoi…'),
  sent: () => t('Envoyée'),
  failed: () => t('Échec — réessayer')
};

/**
 * Prise de photo d'une marchandise ou d'un bon (ecrans §4, spec B5).
 *
 * Ouvre l'appareil photo arrière sur téléphone, réduit l'image avant envoi
 * (1 600 px, JPEG 0,7), garde les fichiers en attente tant que la cible
 * n'existe pas, puis les envoie un par un avec un état par fichier. Chaque
 * fichier porte son identifiant de requête. La consigne « pas les personnes »
 * est toujours affichée.
 */
export const StockPhotoCapture: React.FC<StockPhotoCaptureProps> = ({
  tenantId,
  target,
  purposes,
  onUploaded,
  onFailedCountChange,
  disabled
}) => {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [purpose, setPurpose] = useState<StockAttachmentPurpose>(purposes[0] ?? 'GOODS_PHOTO');
  const sendingRef = useRef(false);

  const patch = useCallback((key: string, changes: Partial<PendingItem>) => {
    setItems(previous => previous.map(item => (item.key === key ? { ...item, ...changes } : item)));
  }, []);

  const send = useCallback(
    async (item: PendingItem, cible: { type: StockAttachmentTarget; id: string }) => {
      patch(item.key, { status: 'sending', error: undefined });
      try {
        const result = await uploadStockAttachment(tenantId, {
          file: item.file,
          fileName: item.fileName,
          targetType: cible.type,
          targetId: cible.id,
          purpose: item.purpose,
          clientRequestId: item.clientRequestId
        });
        patch(item.key, { status: 'sent' });
        onUploaded?.(result);
      } catch (error: any) {
        const serverMessage = error?.response?.data?.message;
        patch(item.key, {
          status: 'failed',
          error: typeof serverMessage === 'string' && serverMessage ? serverMessage : t('L’envoi de la photo a échoué.')
        });
      }
    },
    [tenantId, onUploaded, patch]
  );

  // Dès que la cible existe, les fichiers en attente partent, un par un.
  useEffect(() => {
    if (!target || sendingRef.current) return;
    const next = items.find(item => item.status === 'pending');
    if (!next) return;
    sendingRef.current = true;
    void send(next, target).finally(() => {
      sendingRef.current = false;
      // Relance l'effet pour le fichier suivant.
      setItems(previous => [...previous]);
    });
  }, [target, items, send]);

  // Le compte des échecs, remonté seulement quand il change.
  const failedCount = items.filter(item => item.status === 'failed').length;
  const lastReportedRef = useRef(0);
  useEffect(() => {
    if (failedCount === lastReportedRef.current) return;
    lastReportedRef.current = failedCount;
    onFailedCountChange?.(failedCount);
  }, [failedCount, onFailedCountChange]);

  const addFile = async (file: File) => {
    const reduced = file.type.startsWith('image/')
      ? await downscaleImageFile(file, PHOTO_MAX_SIDE, PHOTO_JPEG_QUALITY)
      : file;
    setItems(previous => [
      ...previous,
      {
        key: nouvelIdentifiantDeRequete(),
        file: reduced,
        fileName: file.name,
        purpose,
        clientRequestId: nouvelIdentifiantDeRequete(),
        status: 'pending'
      }
    ]);
  };

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Space wrap>
        {purposes.length > 1 ? (
          <Select
            aria-label={t('Nature de la pièce')}
            value={purpose}
            onChange={value => setPurpose(value)}
            options={purposes.map(code => ({ value: code, label: STOCK_ATTACHMENT_PURPOSE_LABELS[code] }))}
            style={{ minWidth: 220 }}
            disabled={disabled}
          />
        ) : null}
        <Upload
          accept={ACCEPTED_TYPES}
          capture="environment"
          showUploadList={false}
          multiple
          disabled={disabled}
          beforeUpload={file => {
            void addFile(file as File);
            return false;
          }}
        >
          <Button icon={<CameraOutlined />} disabled={disabled} style={{ minHeight: 48 }}>
            {t('Prendre une photo')}
          </Button>
        </Upload>
      </Space>
      <Text type="secondary">{t('Photographiez la marchandise et les bons, pas les personnes.')}</Text>

      {items.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label={t('Photos à envoyer')}>
          {items.map(item => (
            <li key={item.key} style={{ paddingBlock: 4 }}>
              <Space wrap>
                <Text>{item.fileName}</Text>
                <Text type={item.status === 'failed' ? 'warning' : 'secondary'}>{STATUS_LABEL[item.status]()}</Text>
                {item.status === 'failed' && target ? (
                  <Button size="small" icon={<ReloadOutlined />} onClick={() => patch(item.key, { status: 'pending' })}>
                    {t('Réessayer')}
                  </Button>
                ) : null}
              </Space>
              {item.error ? (
                <Text type="secondary" style={{ display: 'block' }}>
                  {item.error}
                </Text>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Space>
  );
};

export default StockPhotoCapture;
