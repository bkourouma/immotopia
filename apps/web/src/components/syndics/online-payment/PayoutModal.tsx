import React, { useEffect, useState } from 'react';
import { Alert, DatePicker, Input, InputNumber, Modal, Space, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { formatMoney } from '../../primitives';
import { RecordGatewayPayoutResult, recordSyndicGatewayPayout } from '../../../services/syndic-online-payment-service';
import { t } from '../../../i18n/t';
import { apiErrorMessage } from './helpers';

const { Text, Paragraph } = Typography;

export interface PayoutModalProps {
  tenantId: string;
  syndicId: string;
  open: boolean;
  /** Solde comptable du compte 5525 : plafond du reversement. */
  collectionBalance: number;
  onClose: () => void;
  onRecorded: (result: RecordGatewayPayoutResult) => void;
}

/**
 * Enregistrement d'un reversement PaySecureHub vers la banque de la copropriété
 * (contrat §1.9 : débit 521 / crédit 5525). Aucun virement n'est déclenché.
 */
export const PayoutModal: React.FC<PayoutModalProps> = ({
  tenantId,
  syndicId,
  open,
  collectionBalance,
  onClose,
  onRecorded
}) => {
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState<Dayjs | null>(dayjs());
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount(null);
    setDate(dayjs());
    setReference('');
    setNote('');
    setError(null);
    setSubmitting(false);
  }, [open]);

  const exceeds = amount !== null && amount > collectionBalance;
  const valid = amount !== null && amount > 0 && !exceeds && date !== null && reference.trim().length > 0;

  const submit = async () => {
    if (!valid || amount === null || !date) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await recordSyndicGatewayPayout(tenantId, syndicId, {
        amount,
        date: date.format('YYYY-MM-DD'),
        reference: reference.trim(),
        note: note.trim() ? note.trim() : null
      });
      onRecorded(result);
    } catch (e) {
      setError(apiErrorMessage(e, t('Le reversement n’a pas pu être enregistré')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('Enregistrer un reversement')}
      onCancel={onClose}
      onOk={() => void submit()}
      okText={t('Enregistrer')}
      cancelText={t('Annuler')}
      okButtonProps={{ disabled: !valid, loading: submitting }}
      destroyOnClose
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {t(
            'À saisir quand PaySecureHub a versé l’argent sur le compte bancaire de la copropriété. Cet écran enregistre l’écriture comptable (5525 vers 521) ; il ne déclenche aucun virement.'
          )}
        </Paragraph>
        <Text>{t('Solde du compte 5525 : {{amount}}', { amount: formatMoney(collectionBalance) })}</Text>

        <div>
          <label htmlFor="payout-amount">
            <Text strong>{t('Montant reversé')}</Text>
          </label>
          <InputNumber
            id="payout-amount"
            style={{ display: 'block', marginTop: 8, width: '100%' }}
            min={0}
            max={Math.max(collectionBalance, 0)}
            value={amount}
            onChange={value => setAmount(typeof value === 'number' ? value : null)}
            status={exceeds ? 'error' : undefined}
          />
          {exceeds ? (
            <Text type="danger" style={{ fontSize: 12 }}>
              {t('Le montant dépasse le solde du compte 5525.')}
            </Text>
          ) : null}
        </div>

        <div>
          <label htmlFor="payout-date">
            <Text strong>{t('Date du reversement')}</Text>
          </label>
          <DatePicker
            id="payout-date"
            style={{ display: 'block', marginTop: 8, width: '100%' }}
            format="DD/MM/YYYY"
            value={date}
            allowClear={false}
            onChange={value => setDate(value)}
            disabledDate={current => current.isAfter(dayjs(), 'day')}
          />
        </div>

        <div>
          <label htmlFor="payout-reference">
            <Text strong>{t('Référence du virement')}</Text>
          </label>
          <Input
            id="payout-reference"
            style={{ marginTop: 8 }}
            maxLength={120}
            value={reference}
            onChange={event => setReference(event.target.value)}
            placeholder={t('Référence chez le fournisseur')}
          />
        </div>

        <div>
          <label htmlFor="payout-note">
            <Text strong>{t('Note (facultative)')}</Text>
          </label>
          <Input
            id="payout-note"
            style={{ marginTop: 8 }}
            maxLength={250}
            value={note}
            onChange={event => setNote(event.target.value)}
          />
        </div>

        {error ? <Alert type="error" showIcon message={error} /> : null}
      </Space>
    </Modal>
  );
};

export default PayoutModal;
