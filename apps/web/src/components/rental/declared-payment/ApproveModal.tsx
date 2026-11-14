import React, { useEffect, useState } from 'react';
import { Alert, App, Descriptions, Input, InputNumber, Modal, Space, Typography } from 'antd';
import { approveRentalDeclaration } from '../../../services/rental-declared-payment-service';
import {
  RENTAL_MAX_DECLARATION_AMOUNT,
  type ApproveDeclarationBody,
  type ApproveDeclarationResponse,
  type RentalPaymentDeclarationDto
} from '../../../types/rental-declared-payment';
import { TreasuryAccountSelector } from '../../finance/TreasuryAccountSelector';
import { t } from '../../../i18n/t';
import { HelpSectionTitle } from '../../../help';
import {
  DECLARATION_ALREADY_REVIEWED_CODE,
  NOTE_MAX_LENGTH,
  NOTE_MIN_LENGTH,
  alertView,
  apiErrorCode,
  apiErrorMessage,
  declarationTenantName,
  formatAmount,
  formatDateTime,
  formatDay,
  installmentLabel
} from './helpers';

const { Text } = Typography;

export interface ApproveModalProps {
  tenantId: string;
  /** Déclaration à valider ; `null` = modale fermée. */
  declaration: RentalPaymentDeclarationDto | null;
  onClose: () => void;
  onApproved: (result: ApproveDeclarationResponse) => void;
  /** La déclaration n'est plus `PENDING` : la page recharge. */
  onStale?: () => void;
}

/**
 * Validation d'une déclaration de paiement locatif (contrat §1.6). Montant
 * retenu = montant déclaré par défaut ; un montant différent exige une note de
 * correction. Le compte de trésorerie est dérivé du numéro de réception (mobile
 * money) ou du mode de paiement, sauf choix explicite du gestionnaire.
 */
export const ApproveModal: React.FC<ApproveModalProps> = ({ tenantId, declaration, onClose, onApproved, onStale }) => {
  const { message } = App.useApp();
  const [accepted, setAccepted] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [treasuryAccountId, setTreasuryAccountId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAccepted(declaration ? declaration.amount : null);
    setNote('');
    setTreasuryAccountId(null);
    setError(null);
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [declaration?.id]);

  if (!declaration) return null;

  // Le montant déclaré tel quel reste valide même non entier (ancienne donnée) ; une
  // correction, elle, est un entier dans les bornes.
  const unchanged = typeof accepted === 'number' && accepted === declaration.amount;
  const amountValid =
    unchanged ||
    (typeof accepted === 'number' &&
      Number.isInteger(accepted) &&
      accepted >= 1 &&
      accepted <= RENTAL_MAX_DECLARATION_AMOUNT);
  const differs = amountValid && !unchanged;
  const noteTrimmed = note.trim();
  const noteLengthOk = noteTrimmed.length >= NOTE_MIN_LENGTH && noteTrimmed.length <= NOTE_MAX_LENGTH;
  const noteOk = differs ? noteLengthOk : noteTrimmed.length === 0 || noteLengthOk;
  const canSubmit = amountValid && noteOk;
  const receivingPhone = declaration.receivingNumber?.phone;
  // Hors mobile money il n'y a pas de numéro de réception : le serveur retient
  // le compte de l'agence pour le mode déclaré (sauf choix explicite).
  const paymentMethod = declaration.paymentMethod ?? 'MOBILE_MONEY';
  const isMobileMoney = paymentMethod === 'MOBILE_MONEY';

  const submit = async () => {
    if (!canSubmit || submitting) return;
    const body: ApproveDeclarationBody & { treasuryAccountId?: string | null } = {};
    if (differs && typeof accepted === 'number') body.acceptedAmount = accepted;
    if (noteTrimmed) body.note = noteTrimmed;
    if (treasuryAccountId) body.treasuryAccountId = treasuryAccountId;
    setSubmitting(true);
    setError(null);
    try {
      const result = await approveRentalDeclaration(tenantId, declaration.id, body);
      message.success(t('Déclaration validée'));
      onApproved(result);
    } catch (e) {
      if (apiErrorCode(e) === DECLARATION_ALREADY_REVIEWED_CODE) {
        message.warning(t('Cette déclaration vient d’être traitée ou annulée.'));
        onStale?.();
      } else {
        setError(apiErrorMessage(e, t('La validation n’a pas pu être enregistrée')));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title={
        <HelpSectionTitle
          title={t('Valider la déclaration de paiement')}
          helpId="locatif.paiements.declarations.approuver"
        />
      }
      onCancel={onClose}
      onOk={() => void submit()}
      okText={differs ? t('Valider avec correction') : t('Valider telle que déclarée')}
      cancelText={t('Annuler')}
      okButtonProps={{ disabled: !canSubmit, loading: submitting }}
      cancelButtonProps={{ disabled: submitting }}
      destroyOnClose
      width={640}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {declaration.alerts.map((alert, index) => {
          const { severity, text } = alertView(alert);
          return <Alert key={`${alert.kind}-${index}`} type={severity} showIcon message={text} />;
        })}

        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label={t('Locataire')}>{declarationTenantName(declaration)}</Descriptions.Item>
          <Descriptions.Item label={t('Bail')}>{declaration.leaseNumber ?? '—'}</Descriptions.Item>
          <Descriptions.Item label={t('Échéance')}>
            {installmentLabel(declaration.installment)}
            {declaration.installment ? ` · ${formatDay(declaration.installment.dueDate)}` : ''}
          </Descriptions.Item>
          <Descriptions.Item label={t('Référence')}>{declaration.reference ?? '—'}</Descriptions.Item>
          <Descriptions.Item label={t('Montant déclaré')}>{formatAmount(declaration.amount)}</Descriptions.Item>
          <Descriptions.Item label={t('Date et heure déclarées')}>
            {formatDateTime(declaration.paidAt)}
          </Descriptions.Item>
        </Descriptions>

        <div>
          <label htmlFor="approve-accepted">
            <Text strong>{t('Montant retenu')}</Text>
          </label>
          <InputNumber<number>
            id="approve-accepted"
            min={1}
            max={RENTAL_MAX_DECLARATION_AMOUNT}
            precision={Number.isInteger(declaration.amount) ? 0 : 2}
            step={1000}
            style={{ display: 'block', width: '100%', marginBlockStart: 8 }}
            value={accepted}
            onChange={value => setAccepted(value)}
          />
          {differs ? (
            <Alert
              style={{ marginBlockStart: 8 }}
              type="warning"
              showIcon
              message={t('Le montant retenu diffère du montant déclaré : une note de correction est obligatoire.')}
            />
          ) : null}
        </div>

        <div>
          <label htmlFor="approve-note">
            <Text strong>{differs ? t('Note de correction (obligatoire)') : t('Note (facultative)')}</Text>
          </label>
          <Input.TextArea
            id="approve-note"
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
              {t('La note doit comporter entre 10 et 500 caractères.')}
            </Text>
          ) : null}
        </div>

        <div>
          <Text strong style={{ display: 'block', marginBlockEnd: 8 }}>
            {t('Compte de trésorerie')}
          </Text>
          <TreasuryAccountSelector
            tenantId={tenantId}
            paymentMethod={paymentMethod}
            value={treasuryAccountId}
            onChange={setTreasuryAccountId}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {!isMobileMoney
              ? t('Par défaut : le compte de trésorerie de l’agence pour ce mode de paiement')
              : receivingPhone
                ? t('Par défaut : le compte de trésorerie du numéro de réception ({{numero}})', {
                    numero: receivingPhone
                  })
                : t('Par défaut : le compte de trésorerie du numéro de réception')}
          </Text>
        </div>

        {error ? <Alert type="error" showIcon message={error} /> : null}
      </Space>
    </Modal>
  );
};

export default ApproveModal;
