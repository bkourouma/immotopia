import React, { useEffect, useState } from 'react';
import { Alert, Card, DatePicker, Descriptions, Space, Spin, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import {
  getAccountStatement,
  type AccountStatement,
  type StatementEntry
} from '../../services/subscription-account-service';
import { formatMoney, StatusTag, Table } from '../primitives';
import { INVOICE_STATUS_LABEL, formatDay } from './platform-invoice-labels';
import { apiErrorMessage } from './subscription-account-labels';
import { t } from '../../i18n/t';

const { RangePicker } = DatePicker;
const { Text } = Typography;

interface Props {
  tenantId: string;
  /** Change après chaque ajout, retrait ou paiement : le relevé est relu. */
  version: number;
}

/** Onglet « Relevé de compte » : factures, avoirs, paiements et mouvements d'éléments, avec le solde. */
export const AccountStatementTab: React.FC<Props> = ({ tenantId, version }) => {
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const from = range?.[0]?.format('YYYY-MM-DD');
  const to = range?.[1]?.format('YYYY-MM-DD');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getAccountStatement(tenantId, { from, to })
      .then(result => {
        if (cancelled) return;
        setStatement(result);
        setError(null);
      })
      .catch(err => {
        if (!cancelled) setError(apiErrorMessage(err, t('Erreur lors du chargement du relevé')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, from, to, version]);

  const money = (value: number) => formatMoney(value);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Space direction="vertical" size={4}>
          <label htmlFor="statement-range">
            <Text strong>{t('Période')}</Text>
          </label>
          <RangePicker
            id="statement-range"
            allowEmpty={[true, true]}
            value={range}
            onChange={value => setRange(value)}
            style={{ maxWidth: '100%' }}
          />
        </Space>
      </Card>

      {error && <Alert type="error" showIcon message={error} />}
      {loading && !statement && <Spin />}

      {statement && (
        <Card title={t('Relevé de compte')} loading={loading && !statement}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
              <Descriptions.Item label={t("Solde d'ouverture (TTC)")}>
                {money(statement.openingBalance)}
              </Descriptions.Item>
              <Descriptions.Item label={t('Facturé (TTC)')}>{money(statement.totals.invoiced)}</Descriptions.Item>
              <Descriptions.Item label={t('Avoirs (TTC)')}>{money(statement.totals.credited)}</Descriptions.Item>
              <Descriptions.Item label={t('Payé (TTC)')}>{money(statement.totals.paid)}</Descriptions.Item>
              <Descriptions.Item label={t('Solde dû (TTC)')}>
                <Text strong>{money(statement.totals.balanceDue)}</Text>
              </Descriptions.Item>
            </Descriptions>

            <Table<StatementEntry>
              exportFilename={t('Relevé de compte')}
              aria-label={t('Mouvements du compte')}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 20, hideOnSinglePage: true }}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: t('Aucun mouvement sur cette période.') }}
              dataSource={statement.entries}
              columns={[
                {
                  title: t('Date'),
                  key: 'date',
                  exportValue: entry => formatDay(entry.date),
                  render: (_: unknown, entry) => formatDay(entry.date)
                },
                {
                  title: t('Mouvement'),
                  key: 'label',
                  exportValue: entry => entry.label,
                  render: (_: unknown, entry) => {
                    const info = entry.status ? INVOICE_STATUS_LABEL[entry.status] : undefined;
                    return (
                      <Space wrap size={4}>
                        <span>{entry.label}</span>
                        {info && <StatusTag status={entry.status as string} tone={info.tone} label={info.label} />}
                      </Space>
                    );
                  }
                },
                {
                  title: t('Référence'),
                  key: 'reference',
                  exportValue: entry => entry.reference ?? '',
                  render: (_: unknown, entry) => entry.reference ?? '—'
                },
                {
                  title: t('Débit'),
                  key: 'debit',
                  align: 'end',
                  exportValue: entry => entry.debit,
                  render: (_: unknown, entry) => (entry.debit ? money(entry.debit) : '—')
                },
                {
                  title: t('Crédit'),
                  key: 'credit',
                  align: 'end',
                  exportValue: entry => entry.credit,
                  render: (_: unknown, entry) => (entry.credit ? money(entry.credit) : '—')
                },
                {
                  title: t('Solde'),
                  key: 'balanceAfter',
                  align: 'end',
                  exportValue: entry => entry.balanceAfter ?? '',
                  render: (_: unknown, entry) => (entry.balanceAfter === null ? '—' : money(entry.balanceAfter))
                },
                {
                  title: t('Par'),
                  key: 'actorName',
                  exportValue: entry => entry.actorName ?? '',
                  render: (_: unknown, entry) => entry.actorName ?? '—'
                }
              ]}
            />
          </Space>
        </Card>
      )}
    </Space>
  );
};
