import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Descriptions, Drawer, Empty, Skeleton, Space, Tag, Typography } from 'antd';
import { CheckOutlined, CloseOutlined, FileImageOutlined } from '@ant-design/icons';
import type { RentalPaymentDeclarationDto } from '../../../types/rental-declared-payment';
import { getRentalDeclaration, getRentalDeclarationProof } from '../../../services/rental-declared-payment-service';
import { saveBlob } from '../../../utils/save-blob';
import { t } from '../../../i18n/t';
import {
  STATUS_COLOR,
  alertView,
  apiErrorMessage,
  formatAmount,
  formatDateTime,
  formatPhone,
  installmentLabel,
  operatorLabel,
  rejectReasonLabel,
  statusLabel
} from './helpers';

const { Text, Paragraph } = Typography;

export interface DeclarationDrawerProps {
  tenantId: string;
  /** Déclaration à examiner ; `null` = tiroir fermé. */
  declarationId: string | null;
  canReview: boolean;
  onClose: () => void;
  onApprove: (declaration: RentalPaymentDeclarationDto) => void;
  onReject: (declaration: RentalPaymentDeclarationDto) => void;
}

type LoadError = 'NOT_FOUND' | 'OTHER' | null;

/** Détail d'une déclaration de paiement pour le gestionnaire du locatif (contrat §1.6). */
export const DeclarationDrawer: React.FC<DeclarationDrawerProps> = ({
  tenantId,
  declarationId,
  canReview,
  onClose,
  onApprove,
  onReject
}) => {
  const [row, setRow] = useState<RentalPaymentDeclarationDto | null>(null);
  const [loadError, setLoadError] = useState<LoadError>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [proofError, setProofError] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const proofUrlRef = useRef<string | null>(null);

  const releaseProof = useCallback(() => {
    if (proofUrlRef.current) URL.revokeObjectURL(proofUrlRef.current);
    proofUrlRef.current = null;
    setProofUrl(null);
  }, []);

  // Id courant : une réponse arrivée après un changement de déclaration est ignorée.
  const currentId = useRef<string | null>(null);
  currentId.current = declarationId;

  const load = useCallback(async () => {
    if (!declarationId) return;
    setLoadError(null);
    try {
      const loaded = await getRentalDeclaration(tenantId, declarationId);
      if (currentId.current !== declarationId) return;
      setRow(loaded);
    } catch (e) {
      if (currentId.current !== declarationId) return;
      const status = (e as { response?: { status?: number } })?.response?.status;
      setRow(null);
      setLoadError(status === 404 ? 'NOT_FOUND' : 'OTHER');
      setErrorText(apiErrorMessage(e, t('Impossible de charger la déclaration')));
    }
  }, [tenantId, declarationId]);

  useEffect(() => {
    releaseProof();
    setProofError(false);
    setRow(null);
    setLoadError(null);
    if (declarationId) void load();
  }, [declarationId, load, releaseProof]);

  // URL blob libérée au démontage.
  useEffect(() => () => releaseProof(), [releaseProof]);

  const viewProof = async () => {
    if (!row) return;
    setProofLoading(true);
    setProofError(false);
    try {
      const blob = await getRentalDeclarationProof(tenantId, row.id);
      if (blob.type.startsWith('image/')) {
        releaseProof();
        const url = URL.createObjectURL(blob);
        proofUrlRef.current = url;
        setProofUrl(url);
      } else {
        saveBlob(blob, `capture-${row.id}`);
      }
    } catch {
      setProofError(true);
    } finally {
      setProofLoading(false);
    }
  };

  const pending = row?.status === 'PENDING';

  const renderDetails = (current: RentalPaymentDeclarationDto) => (
    <Descriptions column={1} size="small" bordered>
      <Descriptions.Item label={t('Bail')}>{current.leaseNumber || '—'}</Descriptions.Item>
      <Descriptions.Item label={t('Déclarant')}>
        <Space size={4} wrap>
          <span>{current.declaredBy.name}</span>
          {current.declaredBy.type === 'MANAGER' ? <Tag>{t('Gestionnaire')}</Tag> : null}
        </Space>
      </Descriptions.Item>
      <Descriptions.Item label={t('Échéance')}>
        {current.installment
          ? `${installmentLabel(current.installment)} · ${t('reste dû : {{montant}}', {
              montant: formatAmount(current.installment.remainingDue)
            })}`
          : t('Sans échéance')}
      </Descriptions.Item>
      <Descriptions.Item label={t('Numéro de réception')}>
        {current.receivingNumber
          ? `${operatorLabel(current.receivingNumber.operator)} · ${formatPhone(current.receivingNumber.phone)}`
          : '—'}
      </Descriptions.Item>
      <Descriptions.Item label={t('Opérateur')}>
        {current.operator ? operatorLabel(current.operator) : '—'}
      </Descriptions.Item>
      <Descriptions.Item label={t('Numéro payeur')}>{formatPhone(current.payerPhone)}</Descriptions.Item>
      <Descriptions.Item label={t('Montant déclaré')}>{formatAmount(current.amount)}</Descriptions.Item>
      {current.acceptedAmount !== null ? (
        <Descriptions.Item label={t('Montant retenu')}>{formatAmount(current.acceptedAmount)}</Descriptions.Item>
      ) : null}
      <Descriptions.Item label={t('Date de paiement')}>{formatDateTime(current.paidAt)}</Descriptions.Item>
      <Descriptions.Item label={t('Référence')}>{current.reference || '—'}</Descriptions.Item>
      {current.notes ? (
        <Descriptions.Item label={t('Notes')}>
          <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{current.notes}</Paragraph>
        </Descriptions.Item>
      ) : null}
      <Descriptions.Item label={t('Déposée le')}>{formatDateTime(current.createdAt)}</Descriptions.Item>
      {current.status !== 'PENDING' ? (
        <>
          <Descriptions.Item label={t('Traitée par')}>{current.reviewedByName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label={t('Traitée le')}>{formatDateTime(current.reviewedAt)}</Descriptions.Item>
        </>
      ) : null}
      {current.rejectReason ? (
        <Descriptions.Item label={t('Motif de rejet')}>{rejectReasonLabel(current.rejectReason)}</Descriptions.Item>
      ) : null}
      {current.reviewNote ? (
        <Descriptions.Item label={t('Note de revue')}>
          <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{current.reviewNote}</Paragraph>
        </Descriptions.Item>
      ) : null}
      {current.paymentId ? <Descriptions.Item label={t('Paiement créé')}>{current.paymentId}</Descriptions.Item> : null}
    </Descriptions>
  );

  const renderProof = (current: RentalPaymentDeclarationDto) => {
    if (!current.hasProof) return <Text type="secondary">{t('Aucune capture jointe')}</Text>;
    return (
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Button icon={<FileImageOutlined aria-hidden />} loading={proofLoading} onClick={() => void viewProof()}>
          {t('Voir la capture')}
        </Button>
        {proofError ? <Text type="danger">{t('Capture indisponible')}</Text> : null}
        {proofUrl ? (
          <img
            src={proofUrl}
            alt={t('Capture du paiement déclaré')}
            style={{ maxWidth: '100%', maxHeight: 360, display: 'block' }}
          />
        ) : null}
      </Space>
    );
  };

  const renderBody = () => {
    if (loadError === 'NOT_FOUND') return <Empty description={t('Déclaration introuvable')} />;
    if (loadError === 'OTHER') {
      return (
        <Alert
          type="error"
          showIcon
          message={errorText}
          action={
            <Button size="small" onClick={() => void load()}>
              {t('Réessayer')}
            </Button>
          }
        />
      );
    }
    if (!row) return <Skeleton active />;
    return (
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {row.alerts.length > 0 ? (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {row.alerts.map((alert, index) => {
              const view = alertView(alert);
              return <Alert key={`${alert.kind}-${index}`} type={view.severity} showIcon message={view.text} />;
            })}
          </Space>
        ) : null}
        <section aria-label={t('Paiement déclaré')}>
          <Typography.Title level={5}>{t('Paiement déclaré')}</Typography.Title>
          {renderDetails(row)}
        </section>
        <section aria-label={t('Capture')}>
          <Typography.Title level={5}>{t('Capture')}</Typography.Title>
          {renderProof(row)}
        </section>
      </Space>
    );
  };

  const footer = (() => {
    if (!row) return null;
    if (!pending) return <Text type="secondary">{t('Cette déclaration a déjà été traitée.')}</Text>;
    if (!canReview) return null;
    return (
      <Space wrap>
        <Button type="primary" icon={<CheckOutlined aria-hidden />} onClick={() => onApprove(row)}>
          {t('Valider')}
        </Button>
        <Button danger icon={<CloseOutlined aria-hidden />} onClick={() => onReject(row)}>
          {t('Rejeter')}
        </Button>
      </Space>
    );
  })();

  return (
    <Drawer
      open={declarationId !== null}
      onClose={onClose}
      width="min(100vw, 640px)"
      destroyOnHidden
      title={
        row ? (
          <Space size={4} wrap>
            <span>{t('Paiement déclaré')}</span>
            <Tag color={STATUS_COLOR[row.status]}>{statusLabel(row.status)}</Tag>
            {pending && row.overdue ? <Tag color="red">{t('En retard')}</Tag> : null}
            {pending && row.duplicateSuspected ? <Tag color="orange">{t('Doublon probable')}</Tag> : null}
          </Space>
        ) : (
          t('Paiement déclaré')
        )
      }
      footer={footer}
    >
      {renderBody()}
    </Drawer>
  );
};

export default DeclarationDrawer;
