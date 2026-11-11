import React, { useEffect, useState } from 'react';
import { Alert, App, Descriptions, Input, Modal, Select, Space, Typography } from 'antd';
import { rejectRentalDeclaration } from '../../../services/rental-declared-payment-service';
import type {
  RentalDeclarationRejectReason,
  RentalPaymentDeclarationDto
} from '../../../types/rental-declared-payment';
import { t } from '../../../i18n/t';
import {
  DECLARATION_ALREADY_REVIEWED_CODE,
  NOTE_MAX_LENGTH,
  NOTE_MIN_LENGTH,
  apiErrorCode,
  apiErrorMessage,
  declarationTenantName,
  formatAmount,
  formatDateTime,
  rejectReasonOptions
} from './helpers';

const { Text } = Typography;

export interface RejectModalProps {
  tenantId: string;
  /** Déclaration à rejeter ; `null` = modale fermée. */
  declaration: RentalPaymentDeclarationDto | null;
  onClose: () => void;
  onRejected: (declaration: RentalPaymentDeclarationDto) => void;
  /** La déclaration n'est plus `PENDING` : la page recharge. */
  onStale?: () => void;
}

/** Rejet d'une déclaration (contrat §1.6) : motif obligatoire, note obligatoire pour « Autre ». */
export const RejectModal: React.FC<RejectModalProps> = ({ tenantId, declaration, onClose, onRejected, onStale }) => {
  const { message } = App.useApp();
  const [reason, setReason] = useState<RentalDeclarationRejectReason | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReason(null);
    setNote('');
    setError(null);
    setSubmitting(false);
  }, [declaration?.id]);

  if (!declaration) return null;

  const noteTrimmed = note.trim();
  const noteLengthOk = noteTrimmed.length >= NOTE_MIN_LENGTH && noteTrimmed.length <= NOTE_MAX_LENGTH;
  const noteRequired = reason === 'OTHER';
  const noteOk = noteRequired ? noteLengthOk : noteTrimmed.length === 0 || noteLengthOk;
  const canSubmit = reason !== null && noteOk;

  const submit = async () => {
    if (!reason || !noteOk || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await rejectRentalDeclaration(tenantId, declaration.id, {
        rejectReason: reason,
        note: noteTrimmed || null
      });
      message.success(t('Déclaration rejetée'));
      onRejected(result);
    } catch (e) {
      if (apiErrorCode(e) === DECLARATION_ALREADY_REVIEWED_CODE) {
        message.warning(t('Cette déclaration vient d’être traitée ou annulée.'));
        onStale?.();
      } else {
        setError(apiErrorMessage(e, t('Le rejet n’a pas pu être enregistré')));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title={t('Rejeter la déclaration de paiement')}
      onCancel={onClose}
      onOk={() => void submit()}
      okText={t('Rejeter la déclaration')}
      cancelText={t('Annuler')}
      okButtonProps={{ danger: true, disabled: !canSubmit, loading: submitting }}
      cancelButtonProps={{ disabled: submitting }}
      destroyOnClose
      width={560}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label={t('Locataire')}>{declarationTenantName(declaration)}</Descriptions.Item>
          <Descriptions.Item label={t('Bail')}>{declaration.leaseNumber ?? '—'}</Descriptions.Item>
          <Descriptions.Item label={t('Référence')}>{declaration.reference ?? '—'}</Descriptions.Item>
          <Descriptions.Item label={t('Montant déclaré')}>{formatAmount(declaration.amount)}</Descriptions.Item>
          <Descriptions.Item label={t('Date et heure déclarées')}>
            {formatDateTime(declaration.paidAt)}
          </Descriptions.Item>
        </Descriptions>

        <div>
          <label htmlFor="reject-reason">
            <Text strong>{t('Motif')}</Text>
          </label>
          <Select
            id="reject-reason"
            style={{ display: 'block', marginBlockStart: 8, width: '100%' }}
            placeholder={t('Choisir un motif')}
            value={reason}
            onChange={value => setReason(value)}
            options={rejectReasonOptions()}
          />
        </div>

        <div>
          <label htmlFor="reject-note">
            <Text strong>{noteRequired ? t('Texte (obligatoire)') : t('Texte (facultatif)')}</Text>
          </label>
          <Input.TextArea
            id="reject-note"
            style={{ marginBlockStart: 8 }}
            rows={3}
            maxLength={NOTE_MAX_LENGTH}
            showCount
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder={t('Entre 10 et 500 caractères')}
          />
          {!noteOk ? (
            <Text type="danger" style={{ fontSize: 12 }}>
              {t('Le texte doit comporter entre 10 et 500 caractères.')}
            </Text>
          ) : null}
        </div>

        {error ? <Alert type="error" showIcon message={error} /> : null}
      </Space>
    </Modal>
  );
};

export default RejectModal;
