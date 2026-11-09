import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App, Alert, Button, Card, Statistic, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { MoneyValue, Table, formatMoney } from '../../primitives';
import {
  getRentalCollectionAccount,
  listRentalCollectionPayouts
} from '../../../services/rental-online-payment-service';
import type {
  CreateCollectionPayoutResultDto,
  RentalCollectionAccountDto,
  RentalCollectionPayoutDto,
  RentalCollectionProviderUnavailableReason
} from '../../../types/rental-online-payment';
import { t } from '../../../i18n/t';
import { apiErrorMessage, formatDateTime, formatDay } from './helpers';
import { RentalPayoutModal } from './PayoutModal';

const { Text } = Typography;
const PAGE_SIZE = 10;

export interface CollectionAccountPanelProps {
  tenantId: string;
  /** Change après une opération qui touche au 5525 : recharge le panneau. */
  refreshToken: number;
  /** Droit de reverser (RENTAL_PAYMENTS_ALLOCATE) ; sans lui, le bouton est masqué. */
  canReverse: boolean;
  onRecorded?: (result: CreateCollectionPayoutResultDto) => void;
}

function unavailableText(reason: RentalCollectionProviderUnavailableReason | null, message: string | null): string {
  switch (reason) {
    case 'NOT_CONFIGURED':
      return t('Le paiement en ligne n’est pas configuré : le solde PaySecureHub n’est pas disponible.');
    case 'SIMULATOR':
      return t('Mode simulateur : aucun solde réel chez PaySecureHub.');
    case 'NO_CREDENTIALS':
      return t('Identifiants PaySecureHub manquants : le solde n’est pas disponible.');
    case 'UNREACHABLE':
      return t('PaySecureHub est injoignable : le solde n’a pas pu être lu.');
    default:
      return message || t('Le solde PaySecureHub n’est pas disponible.');
  }
}

/** Compte de collecte 5525 du locatif : soldes, historique et reversement (contrat §2.7). */
export const CollectionAccountPanel: React.FC<CollectionAccountPanelProps> = ({
  tenantId,
  refreshToken,
  canReverse,
  onRecorded
}) => {
  const { message } = App.useApp();
  const [account, setAccount] = useState<RentalCollectionAccountDto | null>(null);
  const [payouts, setPayouts] = useState<RentalCollectionPayoutDto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const version = useRef(0);

  const load = useCallback(async () => {
    const current = ++version.current;
    setLoading(true);
    setError(null);
    try {
      const [acc, list] = await Promise.all([
        getRentalCollectionAccount(tenantId),
        listRentalCollectionPayouts(tenantId, { page, pageSize: PAGE_SIZE })
      ]);
      if (current !== version.current) return;
      setAccount(acc);
      setPayouts(list.items);
      setTotal(list.total);
    } catch (e) {
      if (current === version.current) setError(apiErrorMessage(e, t('Impossible de charger le compte de collecte')));
    } finally {
      if (current === version.current) setLoading(false);
    }
  }, [tenantId, page]);

  useEffect(() => {
    void load();
    return () => {
      version.current += 1;
    };
  }, [load, refreshToken]);

  const ledgerBalance = account?.ledgerBalance ?? 0;
  const providerBalance = account?.provider.balance ?? null;

  const columns: ColumnsType<RentalCollectionPayoutDto> = [
    { title: t('Numéro'), dataIndex: 'number', key: 'number' },
    { title: t('Date'), dataIndex: 'date', key: 'date', render: (value: string) => formatDay(value) },
    { title: t('Destination'), dataIndex: 'toLabel', key: 'toLabel' },
    {
      title: t('Montant'),
      dataIndex: 'amount',
      key: 'amount',
      align: 'end',
      render: (value: number) => <MoneyValue value={value} />
    },
    { title: t('Note'), dataIndex: 'note', key: 'note', render: (value: string | null) => value || '—' },
    {
      title: t('Saisi par'),
      dataIndex: 'createdByName',
      key: 'createdByName',
      render: (value: string | null) => value || '—'
    }
  ];

  const reverseButton = canReverse ? (
    <Tooltip title={account && ledgerBalance <= 0 ? t('Aucun solde à reverser') : undefined}>
      <span>
        <Button
          type="primary"
          icon={<PlusOutlined aria-hidden />}
          disabled={!account || ledgerBalance <= 0}
          onClick={() => setModalOpen(true)}
        >
          {t('Reverser vers la trésorerie')}
        </Button>
      </span>
    </Tooltip>
  ) : null;

  return (
    <Card title={t('Compte de collecte')} extra={reverseButton}>
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

      {account ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, marginBottom: 16 }}>
          <Statistic
            title={t('Solde comptable (5525)')}
            valueRender={() => <span>{formatMoney(account.ledgerBalance)}</span>}
          />
          {providerBalance ? (
            <Statistic
              title={t('Solde PaySecureHub')}
              valueRender={() => <span>{formatMoney(providerBalance.amount)}</span>}
              suffix={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('au {{date}}', { date: formatDateTime(providerBalance.at) })}
                </Text>
              }
            />
          ) : (
            <Text type="secondary">
              {unavailableText(account.provider.unavailableReason, account.provider.message)}
            </Text>
          )}
        </div>
      ) : null}

      <Table<RentalCollectionPayoutDto>
        dataSource={payouts}
        rowKey="transferId"
        size="middle"
        loading={loading}
        columns={columns}
        aria-label={t('Reversements vers la trésorerie')}
        exportFilename={t('Reversements vers la trésorerie')}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: next => setPage(next)
        }}
        locale={{ emptyText: t('Aucun reversement enregistré') }}
      />

      <RentalPayoutModal
        tenantId={tenantId}
        open={modalOpen}
        ledgerBalance={ledgerBalance}
        onClose={() => setModalOpen(false)}
        onRecorded={result => {
          setModalOpen(false);
          message.success(
            t('Reversement {{number}} enregistré. Solde du compte de collecte : {{amount}}', {
              number: result.payout.number,
              amount: formatMoney(result.ledgerBalanceAfter)
            })
          );
          void load();
          onRecorded?.(result);
        }}
      />
    </Card>
  );
};

export default CollectionAccountPanel;
