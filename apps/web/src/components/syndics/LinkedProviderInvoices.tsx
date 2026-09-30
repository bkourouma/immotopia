import React, { useEffect, useState } from 'react';
import { App, Alert, Button, Spin, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { MoneyValue } from '../primitives/MoneyValue';
import { listProviderInvoices } from '../../services/syndic-provider-invoice-service';
import { listSyndicateFunds } from '../../services/syndic-service';
import { ProviderInvoice, SyndicateFund } from '../../types/syndic-types';
import { providerInvoiceStatusColors, providerInvoiceStatusLabels } from './labels';
import { ProviderInvoiceDrawer } from './ProviderInvoiceDrawer';
import { dateFormat } from '../../i18n/format';
import { t } from '../../i18n/t';
import { displayCurrency } from '../../utils/syndic-currency';

interface LinkedProviderInvoicesProps {
  tenantId: string;
  syndicId: string;
  /** L'un des deux, jamais les deux : un contrat ou un incident. */
  contractId?: string;
  incidentId?: string;
}

/**
 * « Factures liées » (lot S6) — depuis un contrat ou un incident, la liste
 * (filtrée côté serveur par `GET .../factures-prestataires?contractId=` ou
 * `?incidentId=`) des factures qui s'y rattachent, avec accès au même détail
 * que l'onglet « Factures » de la page Prestataires.
 */
export const LinkedProviderInvoices: React.FC<LinkedProviderInvoicesProps> = ({
  tenantId,
  syndicId,
  contractId,
  incidentId
}) => {
  const { message } = App.useApp();
  const [items, setItems] = useState<ProviderInvoice[]>([]);
  const [funds, setFunds] = useState<SyndicateFund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [tenantId, syndicId, contractId, incidentId]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, fundsData] = await Promise.all([
        listProviderInvoices(tenantId, syndicId, { contractId, incidentId, limit: 50 }),
        listSyndicateFunds(tenantId, syndicId)
      ]);
      setItems(data.items);
      setFunds(fundsData);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger les factures liées'));
    } finally {
      setLoading(false);
    }
  };

  const handleChanged = () => {
    void load().catch(() => message.error(t('Impossible de recharger les factures liées')));
  };

  const columns: ColumnsType<ProviderInvoice> = [
    { title: t('Numéro'), dataIndex: 'number', key: 'number' },
    { title: t('Libellé'), dataIndex: 'label', key: 'label' },
    {
      title: t('Date'),
      dataIndex: 'invoiceDate',
      key: 'invoiceDate',
      render: (value: string) => dayjs(value).format(dateFormat('short'))
    },
    {
      title: t('Montant TTC'),
      key: 'amountTTC',
      align: 'end',
      render: (_: unknown, row) => <MoneyValue value={row.amountTTC} currency={displayCurrency(row.currency)} />
    },
    {
      title: t('Reste dû'),
      key: 'amountDue',
      align: 'end',
      render: (_: unknown, row) => <MoneyValue value={row.amountDue} currency={displayCurrency(row.currency)} />
    },
    {
      title: t('Statut'),
      key: 'status',
      render: (_: unknown, row) => (
        <Tag color={providerInvoiceStatusColors[row.status]}>{providerInvoiceStatusLabels[row.status]}</Tag>
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_: unknown, row) => (
        <Button size="small" onClick={() => setOpenInvoiceId(row.id)}>
          {t('Ouvrir')}
        </Button>
      )
    }
  ];

  if (loading) {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <Spin />
      </div>
    );
  }
  if (error) return <Alert type="error" message={error} showIcon />;

  return (
    <>
      <Table
        rowKey="id"
        size="small"
        dataSource={items}
        columns={columns}
        pagination={{ pageSize: 5, hideOnSinglePage: true }}
        locale={{ emptyText: t('Aucune facture liée') }}
      />
      <ProviderInvoiceDrawer
        tenantId={tenantId}
        syndicId={syndicId}
        invoiceId={openInvoiceId}
        funds={funds}
        onClose={() => setOpenInvoiceId(null)}
        onChanged={handleChanged}
      />
    </>
  );
};
