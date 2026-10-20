import React from 'react';
import { Alert, Card, Descriptions, Space } from 'antd';
import type { ChargeLine } from '../../services/subscription-v2-service';
import { TenantInvoicesSection } from './TenantInvoicesSection';
import { formatMoney, Table } from '../primitives';
import { formatPeriod } from './platform-invoice-labels';
import type { SubscriptionAccount } from './useSubscriptionAccount';
import { t } from '../../i18n/t';

interface Props {
  tenantId: string;
  account: SubscriptionAccount;
  /** Un paiement a abouti : les droits et l'usage ont pu changer. */
  onPaid: () => void;
}

/** Onglet « Factures » : prochaine facture estimée à ce jour, puis les factures émises. */
export const SubscriptionInvoicesTab: React.FC<Props> = ({ tenantId, account, onPaid }) => {
  const { preview } = account;
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card title={t('Prochaine facture estimée à ce jour')}>
        {preview ? (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label={t('Période')}>
                {formatPeriod(preview.periodStart, preview.periodEnd)}
              </Descriptions.Item>
              <Descriptions.Item label={t('Total HT')}>{formatMoney(preview.amountExclTax)}</Descriptions.Item>
              <Descriptions.Item label={t('TVA ({{rate}} %)', { rate: preview.taxRate })}>
                {formatMoney(preview.taxAmount)}
              </Descriptions.Item>
              <Descriptions.Item label={t('Total TTC')}>
                <strong>{formatMoney(preview.amountTotal)}</strong>
              </Descriptions.Item>
            </Descriptions>
            <Table<ChargeLine>
              exportFilename={t('Prochaine facture estimée')}
              aria-label={t('Lignes de la prochaine facture estimée')}
              rowKey={(line, index) => `${line.kind}-${line.code ?? ''}-${index}`}
              size="small"
              pagination={false}
              scroll={{ x: 'max-content' }}
              dataSource={preview.lines}
              columns={[
                { title: t('Libellé'), dataIndex: 'label', key: 'label' },
                { title: t('Quantité'), dataIndex: 'quantity', key: 'quantity' },
                {
                  title: t('Prix unitaire (HT)'),
                  key: 'unitPrice',
                  exportValue: line => line.unitPrice,
                  render: (_: unknown, line) => formatMoney(line.unitPrice)
                },
                {
                  title: t('Montant (HT)'),
                  key: 'amount',
                  exportValue: line => line.amount,
                  render: (_: unknown, line) => formatMoney(line.amount)
                }
              ]}
            />
          </Space>
        ) : (
          <Alert type="info" showIcon message={t('Aucune facture estimée pour le moment.')} />
        )}
      </Card>

      <TenantInvoicesSection tenantId={tenantId} onPaid={onPaid} />
    </Space>
  );
};
