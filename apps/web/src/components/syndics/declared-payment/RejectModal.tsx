import React, { useEffect, useState } from 'react';
import { Alert, App, Descriptions, Input, Modal, Select, Space, Typography } from 'antd';
import { formatMoney } from '../../primitives';
import {
  DeclarationRejectReason,
  SyndicDeclarationRow,
  rejectSyndicDeclaration
} from '../../../services/syndic-declared-payment-service';
import { t } from '../../../i18n/t';
import {
  DECLARATION_NOT_PENDING_CODE,
  NOTE_MAX_LENGTH,
  NOTE_MIN_LENGTH,
  REJECT_REASON_OPTIONS,
  apiErrorCode,
  apiErrorMessage,
  formatDateTime,
  formatPhone
} from './helpers';

const { Text } = Typography;

export interface RejectModalProps {
  tenantId: string;
  syndicId: string;
  /** Déclaration à rejeter ; `null` = modale fermée. */
  declaration: SyndicDeclarationRow | null;
  onClose: () => void;
  onRejected: (row: SyndicDeclarationRow) => void;
  /** La déclaration n'est plus `PENDING` : la page recharge. */
  onStale?: () => void;
}

/**
 * Rejet d'une déclaration (contrat §1.10, règle R20) : motif de la liste et
 * texte de 10 à 500 caractères, montrés au copropriétaire.
 */
export const RejectModal: React.FC<RejectModalProps> = ({
  tenantId,
  syndicId,
  declaration,
  onClose,
  onRejected,
  onStale
}) => {
  const { message } = App.useApp();
  const [reason, setReason] = useState<DeclarationRejectReason | null>(null);
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
  const noteOk = noteTrimmed.length >= NOTE_MIN_LENGTH && noteTrimmed.length <= NOTE_MAX_LENGTH;
  const canSubmit = reason !== null && noteOk;

  const submit = async () => {
    if (!reason || !noteOk || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const row = await rejectSyndicDeclaration(tenantId, syndicId, declaration.id, { reason, note: noteTrimmed });
      message.success(t('Déclaration rejetée'));
      onRejected(row);
    } catch (e) {
      if (apiErrorCode(e) === DECLARATION_NOT_PENDING_CODE) {
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
          <Descriptions.Item label={t('Déclarant')}>{declaration.declaredBy.name}</Descriptions.Item>
          <Descriptions.Item label={t('Payeur')}>{formatPhone(declaration.payerPhone)}</Descriptions.Item>
          <Descriptions.Item label={t('Référence')}>{declaration.transactionReference}</Descriptions.Item>
          <Descriptions.Item label={t('Montant déclaré')}>{formatMoney(declaration.amount)}</Descriptions.Item>
          <Descriptions.Item label={t('Date et heure déclarées')}>
            {formatDateTime(declaration.paidAt)}
          </Descriptions.Item>
        </Descriptions>

        <Alert
          type="info"
          showIcon
          message={t(
            'Le motif et le texte sont montrés au copropriétaire. Une déclaration rejetée ne se rouvre pas : il en déposera une nouvelle, et la référence redevient libre.'
          )}
        />

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
            options={REJECT_REASON_OPTIONS}
          />
        </div>

        <div>
          <label htmlFor="reject-note">
            <Text strong>{t('Texte (obligatoire)')}</Text>
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
          {noteTrimmed.length > 0 && !noteOk ? (
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
