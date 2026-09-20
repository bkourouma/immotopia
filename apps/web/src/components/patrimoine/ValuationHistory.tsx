import React from 'react';
import { Card, Table, Tag } from 'antd';
import type { AssetValuation } from '../../types/patrimoine-types';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
interface Props {
  valuations: AssetValuation[];
}

function valuationMethodLabel(method: AssetValuation['method']): string {
  if (method === 'MANUAL') return 'Manuelle';
  if (method === 'MARKET_ESTIMATE') return t('Estimation du marché');
  if (method === 'EXPERT_APPRAISAL') return 'Expertise';
  return method;
}

export const ValuationHistory: React.FC<Props> = ({ valuations }) => {
  return (
    <Card title={t('Historique des valorisations')}>
      <Table
        scroll={{ x: 'max-content' }}
        rowKey="id"
        dataSource={valuations}
        pagination={{ pageSize: 5 }}
        columns={[
          {
            title: 'Date',
            dataIndex: 'valuatedAt',
            render: (value: string) => new Date(value).toLocaleDateString(activeLocale())
          },
          {
            title: 'Valeur',
            dataIndex: 'estimatedValue',
            render: (value: number, record: AssetValuation) =>
              `${Number(value).toLocaleString(activeLocale())} ${record.currency}`
          },
          {
            title: t('Méthode'),
            dataIndex: 'method',
            render: (value: AssetValuation['method']) => <Tag>{valuationMethodLabel(value)}</Tag>
          }
        ]}
      />
    </Card>
  );
};
