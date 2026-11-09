import React, { useEffect, useState } from 'react';
import { Alert, Button, DatePicker, Input, InputNumber, Modal, Select, Space, Typography } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { formatMoney } from '../../primitives';
import { createRentalCollectionPayout } from '../../../services/rental-online-payment-service';
import { listTreasuryAccounts, type TreasuryAccountDto } from '../../../services/treasury-service';
import type { CreateCollectionPayoutResultDto } from '../../../types/rental-online-payment';
import { t } from '../../../i18n/t';
import { apiErrorMessage } from './helpers';

const { Text, Paragraph } = Typography;

export interface RentalPayoutModalProps {
  tenantId: string;
  open: boolean;
  /** Solde comptable du 5525 : plafond du reversement. */
  ledgerBalance: number;
  onClose: () => void;
  onRecorded: (result: CreateCollectionPayoutResultDto) => void;
}

/** Banques (521) et caisses (571) : jamais le compte de collecte 5525. */
function isDestination(account: TreasuryAccountDto): boolean {
  return account.isActive && (account.accountNumber.startsWith('521') || account.accountNumber.startsWith('571'));
}

/** Reversement du solde du 5525 vers un compte de trésorerie (contrat §2.7). Aucun virement réel. */
export const RentalPayoutModal: React.FC<RentalPayoutModalProps> = ({
  tenantId,
  open,
  ledgerBalance,
  onClose,
  onRecorded
}) => {
  const [accounts, setAccounts] = useState<TreasuryAccountDto[]>([]);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [toId, setToId] = useState<string | undefined>(undefined);
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState<Dayjs | null>(dayjs());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setToId(undefined);
    setAmount(null);
    setDate(dayjs());
    setNote('');
    setError(null);
    setAccountsError(null);
    setSubmitting(false);
    listTreasuryAccounts(tenantId)
      .then(list => {
        if (!cancelled) setAccounts(list.filter(isDestination));
      })
      .catch(e => {
        if (!cancelled) setAccountsError(apiErrorMessage(e, t('Impossible de charger les comptes de trésorerie')));
      });
    return () => {
      cancelled = true;
    };
  }, [open, tenantId]);

  const cap = Math.max(ledgerBalance, 0);
  const exceeds = amount !== null && amount > cap;
  const valid = cap > 0 && !!toId && amount !== null && amount > 0 && !exceeds && date !== null && note.length <= 500;

  const submit = async () => {
    if (!valid || !toId || amount === null || !date) return;
    setSubmitting(true);
    setError(null);
    try {
      const trimmed = note.trim();
      const result = await createRentalCollectionPayout(tenantId, {
        toTreasuryAccountId: toId,
        amount,
        date: date.format('YYYY-MM-DD'),
        ...(trimmed ? { note: trimmed } : {})
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
      title={t('Reverser vers la trésorerie')}
      onCancel={onClose}
      onOk={() => void submit()}
      okText={t('Enregistrer')}
      cancelText={t('Annuler')}
      okButtonProps={{ disabled: !valid, loading: submitting }}
      destroyOnClose
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {t("Enregistrement comptable seulement : aucun virement réel n'est déclenché chez PaySecureHub.")}
        </Paragraph>
        <Text>{t('Solde du compte de collecte : {{amount}}', { amount: formatMoney(ledgerBalance) })}</Text>

        <div>
          <label htmlFor="rental-payout-account">
            <Text strong>{t('Compte de destination')}</Text>
          </label>
          <Select
            id="rental-payout-account"
            style={{ display: 'block', marginTop: 8, width: '100%' }}
            value={toId}
            onChange={value => setToId(value)}
            placeholder={t('Choisir un compte')}
            options={accounts.map(account => ({
              value: account.id,
              label: `${account.label} (${account.accountNumber})`
            }))}
          />
          {accountsError ? <Text type="danger">{accountsError}</Text> : null}
        </div>

        <div>
          <label htmlFor="rental-payout-amount">
            <Text strong>{t('Montant reversé')}</Text>
          </label>
          <Space.Compact style={{ display: 'flex', marginTop: 8 }}>
            <InputNumber
              id="rental-payout-amount"
              style={{ width: '100%' }}
              min={0}
              max={cap}
              value={amount}
              onChange={value => setAmount(typeof value === 'number' ? value : null)}
              status={exceeds ? 'error' : undefined}
            />
            <Button disabled={cap <= 0} onClick={() => setAmount(cap)}>
              {t('Tout reverser')}
            </Button>
          </Space.Compact>
          {exceeds ? (
            <Text type="danger" style={{ fontSize: 12 }}>
              {t('Le montant dépasse le solde du compte de collecte.')}
            </Text>
          ) : null}
        </div>

        <div>
          <label htmlFor="rental-payout-date">
            <Text strong>{t('Date du reversement')}</Text>
          </label>
          <DatePicker
            id="rental-payout-date"
            style={{ display: 'block', marginTop: 8, width: '100%' }}
            format="DD/MM/YYYY"
            value={date}
            allowClear={false}
            onChange={value => setDate(value)}
            disabledDate={current => current.isAfter(dayjs(), 'day')}
          />
        </div>

        <div>
          <label htmlFor="rental-payout-note">
            <Text strong>{t('Note (facultative)')}</Text>
          </label>
          <Input
            id="rental-payout-note"
            style={{ marginTop: 8 }}
            maxLength={500}
            value={note}
            onChange={event => setNote(event.target.value)}
          />
        </div>

        {error ? <Alert type="error" showIcon message={error} /> : null}
      </Space>
    </Modal>
  );
};

export default RentalPayoutModal;
