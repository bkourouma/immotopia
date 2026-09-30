import React from 'react';
import { Alert, Card, Descriptions, Space, Spin, Table, Typography } from 'antd';
import { MoneyValue } from '../../primitives';
import { ChargeScheduleFrequency, ChargeSchedulePreview } from '../../../types/syndic-types';
import { t } from '../../../i18n/t';
import { formatDay } from './chargeScheduleLabels';
import { displayCurrency } from '../../../utils/syndic-currency';

const { Text } = Typography;

export const SchedulePreviewPanel: React.FC<{
  preview: ChargeSchedulePreview | null;
  loading: boolean;
  currency?: string;
  frequency?: ChargeScheduleFrequency;
}> = ({ preview, loading, currency }) => {
  if (loading) {
    return (
      <div style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin />
      </div>
    );
  }
  if (!preview || preview.periods.length === 0) {
    return <Alert type="info" showIcon message={t('Aucune période à venir pour cette programmation.')} />;
  }
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {preview.periods.map(period => (
        <Card key={`${period.periodStart}-${period.periodEnd}`} size="small" title={period.label}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label={t('Émission')}>{formatDay(period.issueDate)}</Descriptions.Item>
            <Descriptions.Item label={t('Échéance')}>{formatDay(period.dueDate)}</Descriptions.Item>
            <Descriptions.Item label={t('Montant total')}>
              {period.error ? (
                <Text type="danger">{period.error}</Text>
              ) : (
                <MoneyValue value={period.totalAmount ?? 0} currency={displayCurrency(period.currency || currency)} />
              )}
            </Descriptions.Item>
          </Descriptions>
          {!period.error && period.lots.length > 0 ? (
            <Table
              style={{ marginTop: 12 }}
              size="small"
              rowKey="lotId"
              dataSource={period.lots}
              pagination={{ pageSize: 5, hideOnSinglePage: true }}
              columns={[
                { title: t('Lot'), dataIndex: 'lotNumber' },
                {
                  title: t('Montant'),
                  dataIndex: 'amount',
                  align: 'end',
                  render: (value: number) => (
                    <MoneyValue value={value} currency={displayCurrency(period.currency || currency)} />
                  )
                }
              ]}
            />
          ) : null}
        </Card>
      ))}
    </Space>
  );
};
