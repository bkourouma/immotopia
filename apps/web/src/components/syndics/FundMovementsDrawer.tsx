import React, { useEffect, useState } from 'react';
import { Alert, Drawer, Spin, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { MoneyValue } from '../primitives/MoneyValue';
import { listFundMovements } from '../../services/syndic-provider-invoice-service';
import { FundMovement } from '../../types/syndic-types';
import { dateFormat } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Text } = Typography;

const SOURCE_LABELS: Record<FundMovement['sourceType'], string> = {
  MANUAL_ADJUSTMENT: t('Ajustement manuel'),
  PROVIDER_PAYMENT: t('Paiement prestataire'),
  PROVIDER_PAYMENT_REVERSAL: t('Annulation de paiement prestataire')
};

interface FundMovementsDrawerProps {
  tenantId: string;
  syndicId: string;
  fund: { id: string; name: string } | null;
  onClose: () => void;
}

/**
 * Historique des mouvements d'un fonds (lot S6, `SyndicateFundMovement`) :
 * ajustements manuels et débits/crédits générés par les paiements
 * prestataires, avec le solde après chaque mouvement.
 */
export const FundMovementsDrawer: React.FC<FundMovementsDrawerProps> = ({ tenantId, syndicId, fund, onClose }) => {
  const [items, setItems] = useState<FundMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [currency, setCurrency] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [fund?.id]);

  useEffect(() => {
    if (!fund) return;
    void load(fund.id);
  }, [fund?.id, page, pageSize]);

  const load = async (fundId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listFundMovements(tenantId, syndicId, fundId, { page, limit: pageSize });
      setItems(data.items);
      setTotal(data.total);
      setCurrency(data.fund.currency);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger les mouvements du fonds'));
    } finally {
      setLoading(false);
    }
  };

  const columns: ColumnsType<FundMovement> = [
    {
      title: t('Date'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => dayjs(value).format(dateFormat('short'))
    },
    {
      title: t('Sens'),
      dataIndex: 'direction',
      key: 'direction',
      render: (value: FundMovement['direction']) =>
        value === 'CREDIT' ? <Tag color="green">{t('Crédit')}</Tag> : <Tag color="red">{t('Débit')}</Tag>
    },
    {
      title: t('Montant'),
      dataIndex: 'amount',
      key: 'amount',
      align: 'end',
      render: (_: number, row) => <MoneyValue value={row.amount} currency={currency} />
    },
    {
      title: t('Solde après'),
      dataIndex: 'balanceAfter',
      key: 'balanceAfter',
      align: 'end',
      render: (_: number, row) => (
        <Text type={row.balanceAfter < 0 ? 'danger' : undefined}>
          <MoneyValue value={row.balanceAfter} currency={currency} />
        </Text>
      )
    },
    { title: t('Libellé'), dataIndex: 'label', key: 'label' },
    {
      title: t('Origine'),
      dataIndex: 'sourceType',
      key: 'sourceType',
      render: (value: FundMovement['sourceType']) => SOURCE_LABELS[value] || value
    }
  ];

  return (
    <Drawer
      title={fund ? t('Mouvements du fonds « {{name}} »', { name: fund.name }) : t('Mouvements du fonds')}
      open={Boolean(fund)}
      onClose={onClose}
      width={640}
    >
      {error ? <Alert type="error" message={error} showIcon /> : null}
      {loading && items.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          columns={columns}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            }
          }}
          locale={{ emptyText: t('Aucun mouvement pour ce fonds') }}
        />
      )}
    </Drawer>
  );
};
