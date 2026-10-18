import React, { useCallback, useEffect, useState } from 'react';
import { App, Alert, Button, Card, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { MoneyValue, formatMoney } from '../../primitives';
import {
  RecordGatewayPayoutResult,
  SyndicGatewayPayout,
  listSyndicGatewayPayouts
} from '../../../services/syndic-online-payment-service';
import { listSyndicReceivingNumbers } from '../../../services/syndic-declared-payment-service';
import { t } from '../../../i18n/t';
import { apiErrorMessage, formatDay } from './helpers';
import { PayoutModal, type PayoutAccountOption } from './PayoutModal';

export interface PayoutsPanelProps {
  tenantId: string;
  syndicId: string;
  /** Solde comptable du 5525 (`null` tant que la configuration n'est pas chargée). */
  collectionBalance: number | null;
  /** Pour relire les soldes après un reversement. */
  onRecorded?: (result: RecordGatewayPayoutResult) => void;
  /** Droit d'écriture ; sans lui, le bouton est masqué. */
  canEdit: boolean;
}

/** Reversements PaySecureHub vers la banque : liste (§1.8) et saisie (§1.9). */
export const PayoutsPanel: React.FC<PayoutsPanelProps> = ({
  tenantId,
  syndicId,
  collectionBalance,
  onRecorded,
  canEdit
}) => {
  const { message } = App.useApp();
  const [items, setItems] = useState<SyndicGatewayPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [receivingAccounts, setReceivingAccounts] = useState<PayoutAccountOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listSyndicGatewayPayouts(tenantId, syndicId);
      setItems(result.items);
      // Sous-comptes 5521x des numéros de réception : reversables comme le 5525 (R23). Un échec ne bloque pas le 5525.
      try {
        const numbers = await listSyndicReceivingNumbers(tenantId, syndicId);
        setReceivingAccounts(
          numbers.map(number => ({
            accountNumber: number.treasuryAccountNumber,
            label: `${number.holderName} (${number.treasuryAccountNumber})`,
            balance: number.treasuryBalance
          }))
        );
      } catch {
        setReceivingAccounts([]);
      }
    } catch (e) {
      setError(apiErrorMessage(e, t('Impossible de charger les reversements')));
    } finally {
      setLoading(false);
    }
  }, [tenantId, syndicId]);

  useEffect(() => {
    void load();
  }, [load]);

  const accounts: PayoutAccountOption[] = [
    { accountNumber: '5525', label: t('PaySecureHub (5525)'), balance: collectionBalance ?? 0 },
    ...receivingAccounts
  ];
  const reversible = accounts.some(account => account.balance > 0);

  const columns: ColumnsType<SyndicGatewayPayout> = [
    { title: t('Date'), dataIndex: 'date', key: 'date', render: (value: string) => formatDay(value) },
    {
      title: t('Compte'),
      dataIndex: 'treasuryAccountNumber',
      key: 'treasuryAccountNumber',
      render: (value?: string) => value ?? '5525'
    },
    { title: t('Référence'), dataIndex: 'reference', key: 'reference' },
    {
      title: t('Montant'),
      dataIndex: 'amount',
      key: 'amount',
      align: 'end',
      render: (value: number) => <MoneyValue value={value} />
    },
    { title: t('Note'), dataIndex: 'note', key: 'note', render: (value: string | null) => value || '—' }
  ];

  return (
    <Card
      title={t('Reversements vers la banque')}
      extra={
        canEdit ? (
          <Button
            type="primary"
            icon={<PlusOutlined aria-hidden />}
            disabled={!reversible}
            onClick={() => setModalOpen(true)}
          >
            {t('Enregistrer un reversement')}
          </Button>
        ) : null
      }
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={error}
          action={
            <Button size="small" onClick={() => void load()}>
              {t('Réessayer')}
            </Button>
          }
        />
      ) : null}

      <Table<SyndicGatewayPayout>
        rowKey="entryId"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={items}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: t('Aucun reversement enregistré') }}
      />

      <PayoutModal
        tenantId={tenantId}
        syndicId={syndicId}
        open={modalOpen}
        accounts={accounts}
        onClose={() => setModalOpen(false)}
        onRecorded={result => {
          setModalOpen(false);
          message.success(
            t('Reversement enregistré. Solde du compte {{account}} : {{amount}}', {
              account: result.treasuryAccountNumber ?? '5525',
              amount: formatMoney(result.collectionBalanceAfter)
            })
          );
          void load();
          onRecorded?.(result);
        }}
      />
    </Card>
  );
};

export default PayoutsPanel;
