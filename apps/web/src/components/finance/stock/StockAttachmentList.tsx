import React, { useEffect, useState } from 'react';
import { App, Button, Input, Modal, Space, Spin, Tooltip, Typography } from 'antd';
import { CopyOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  fetchStockAttachmentBlob,
  listStockAttachments,
  removeStockAttachment
} from '../../../services/finance-stock-controle-service';
import { StockPhotoCapture } from './StockPhotoCapture';
import {
  STOCK_ATTACHMENT_PURPOSE_LABELS,
  type StockAttachmentPurpose,
  type StockAttachmentTarget,
  type StockAttachmentView
} from '../../../types/finance-stock-controle-types';
import { queryKey } from '../../../lib/query-keys';
import { dateFormat } from '../../../i18n/format';
import { t } from '../../../i18n/t';

const { Text } = Typography;

/** Motif d'un retrait : 3 à 500 caractères (contrat `ReasonOnlyRequest`). */
const REMOVAL_REASON_MIN = 3;
const REMOVAL_REASON_MAX = 500;

export interface StockAttachmentListProps {
  tenantId: string;
  targetType: StockAttachmentTarget;
  targetId: string;
  /** L'appelant peut déposer sur cette cible (droit de dépôt, B5-R6). */
  canAdd: boolean;
  /** Pièces déjà connues (`SlipView.attachments`) : évite une lecture. */
  initialAttachments?: StockAttachmentView[];
  /** Finalités proposées au dépôt. */
  purposes?: StockAttachmentPurpose[];
}

/** « 3fa9…c21e » : début et fin de l'empreinte. */
export function shortHash(sha256: string): string {
  return sha256.length > 8 ? `${sha256.slice(0, 4)}…${sha256.slice(-4)}` : sha256;
}

/** Vignette d'une image protégée, lue en blob et révoquée au démontage. */
const AttachmentThumbnail: React.FC<{ tenantId: string; attachment: StockAttachmentView }> = ({
  tenantId,
  attachment
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchStockAttachmentBlob(tenantId, attachment.id)
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [tenantId, attachment.id]);

  const box: React.CSSProperties = {
    width: 96,
    height: 96,
    borderRadius: 6,
    border: '1px solid var(--border-subtle)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: 'var(--surface-sunken)'
  };
  if (failed) return <div style={box}>{t('Image indisponible')}</div>;
  if (!url) {
    return (
      <div style={box}>
        <Spin size="small" />
      </div>
    );
  }
  return (
    <div style={box}>
      <img src={url} alt={attachment.caption || attachment.fileName} style={{ maxWidth: '100%', maxHeight: '100%' }} />
    </div>
  );
};

/**
 * Pièces jointes d'une cible (ecrans §4, spec B5) : vignettes, finalité,
 * auteur et heure serveur, empreinte courte et copiable, retrait motivé.
 *
 * Chaque lecture de fichier est tracée côté serveur : ce composant ne
 * s'affiche qu'à l'ouverture d'un bon ou d'une ligne, jamais dans une liste.
 * On parle d'« empreinte enregistrée », jamais d'un document « infalsifiable ».
 */
export const StockAttachmentList: React.FC<StockAttachmentListProps> = ({
  tenantId,
  targetType,
  targetId,
  canAdd,
  initialAttachments,
  purposes = ['GOODS_PHOTO', 'DELIVERY_NOTE', 'SIGNED_SLIP', 'OTHER']
}) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const key = queryKey('stock-attachments', tenantId, { targetType, targetId });
  const { data: attachments = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => listStockAttachments(tenantId, targetType, targetId),
    initialData: initialAttachments
  });
  const [removing, setRemoving] = useState<StockAttachmentView | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const openPdf = async (attachment: StockAttachmentView) => {
    try {
      const blob = await fetchStockAttachmentBlob(tenantId, attachment.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      message.error(t('Le document n’a pas pu être ouvert.'));
    }
  };

  const copyHash = async (sha256: string) => {
    try {
      await navigator.clipboard.writeText(sha256);
      message.success(t('Empreinte copiée.'));
    } catch {
      message.error(t('La copie a échoué.'));
    }
  };

  const confirmRemoval = async () => {
    if (!removing) return;
    setSaving(true);
    try {
      await removeStockAttachment(tenantId, removing.id, reason);
      setRemoving(null);
      setReason('');
      await refresh();
    } catch (error: any) {
      message.error(error?.response?.data?.message || t('La pièce n’a pas pu être retirée.'));
    } finally {
      setSaving(false);
    }
  };

  const reasonLength = reason.trim().length;

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {isLoading ? <Spin size="small" /> : null}
      {attachments.map(attachment => {
        const isPdf = attachment.mimeType === 'application/pdf';
        const removed = attachment.removed;
        return (
          <div
            key={attachment.id}
            style={{ display: 'flex', gap: 12, alignItems: 'flex-start', opacity: removed ? 0.6 : 1 }}
          >
            {removed ? null : isPdf ? (
              <Button icon={<FilePdfOutlined />} onClick={() => void openPdf(attachment)}>
                {t('Ouvrir')}
              </Button>
            ) : (
              <AttachmentThumbnail tenantId={tenantId} attachment={attachment} />
            )}
            <Space direction="vertical" size={2}>
              <Text strong>{STOCK_ATTACHMENT_PURPOSE_LABELS[attachment.purpose]}</Text>
              <Text type="secondary">
                {t('Ajoutée par {{label}} le {{date}} à {{heure}} (heure du serveur)', {
                  label: attachment.uploadedByLabel,
                  date: dayjs(attachment.createdAt).format(dateFormat('short')),
                  heure: dayjs(attachment.createdAt).format('HH:mm')
                })}
              </Text>
              {removed ? (
                <Text type="secondary">
                  {t('Retirée le {{date}} par {{label}} — motif : {{reason}}', {
                    date: dayjs(removed.at).format(dateFormat('short')),
                    label: removed.byLabel,
                    reason: removed.reason
                  })}
                </Text>
              ) : null}
              <Space size={4}>
                <Tooltip title={t('Empreinte enregistrée : toute modification du fichier serait détectable.')}>
                  <Text code>{t('Empreinte : {{hash}}', { hash: shortHash(attachment.sha256) })}</Text>
                </Tooltip>
                <Button
                  size="small"
                  type="text"
                  icon={<CopyOutlined />}
                  aria-label={t('Copier l’empreinte complète')}
                  onClick={() => void copyHash(attachment.sha256)}
                >
                  {t('Copier l’empreinte complète')}
                </Button>
              </Space>
              {!removed && attachment.canRemove ? (
                <Button size="small" danger onClick={() => setRemoving(attachment)}>
                  {attachment.removableUntil
                    ? t('Retirer (jusqu’à {{heure}})', { heure: dayjs(attachment.removableUntil).format('HH:mm') })
                    : t('Retirer')}
                </Button>
              ) : null}
            </Space>
          </div>
        );
      })}

      {canAdd ? (
        <StockPhotoCapture
          tenantId={tenantId}
          target={{ type: targetType, id: targetId }}
          purposes={purposes}
          onUploaded={() => void refresh()}
        />
      ) : null}

      <Modal
        open={Boolean(removing)}
        title={t('Retirer la pièce jointe')}
        okText={t('Retirer')}
        cancelText={t('Annuler')}
        okButtonProps={{
          disabled: reasonLength < REMOVAL_REASON_MIN || reasonLength > REMOVAL_REASON_MAX,
          loading: saving
        }}
        onOk={() => void confirmRemoval()}
        onCancel={() => {
          setRemoving(null);
          setReason('');
        }}
      >
        <Text>{t('Le fichier sera effacé ; la fiche reste, avec son empreinte et le motif du retrait.')}</Text>
        <Input.TextArea
          aria-label={t('Motif du retrait')}
          value={reason}
          maxLength={REMOVAL_REASON_MAX}
          autoSize={{ minRows: 2, maxRows: 5 }}
          onChange={event => setReason(event.target.value)}
          style={{ marginBlockStart: 8 }}
        />
      </Modal>
    </Space>
  );
};

export default StockAttachmentList;
