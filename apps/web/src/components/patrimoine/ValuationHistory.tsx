import React from 'react';
import { Card, Table, Tag } from 'antd';
import type { AssetValuation } from '../../types/patrimoine-types';

interface Props {
  valuations: AssetValuation[];
}

function valuationMethodLabel(method: AssetValuation['method']): string {
  if (method === 'MANUAL') return 'Manuelle';
  if (method === 'MARKET_ESTIMATE') return 'Estimation du marché';
  if (method === 'EXPERT_APPRAISAL') return 'Expertise';
  return method;
}

export const ValuationHistory: React.FC<Props> = ({ valuations }) => {
  return (
    <Card title="Historique des valorisations">
      <Table
        scroll={{ x: 'max-content' }}
        rowKey="id"
        dataSource={valuations}
        pagination={{ pageSize: 5 }}
        columns={[
          {
            title: 'Date',
            dataIndex: 'valuatedAt',
            render: (value: string) => new Date(value).toLocaleDateString('fr-FR')
          },
          {
            title: 'Valeur',
            dataIndex: 'estimatedValue',
            render: (value: number, record: AssetValuation) =>
              `${Number(value).toLocaleString('fr-FR')} ${record.currency}`
          },
          {
            title: 'Méthode',
            dataIndex: 'method',
            render: (value: AssetValuation['method']) => <Tag>{valuationMethodLabel(value)}</Tag>
          }
        ]}
      />
    </Card>
  );
};
