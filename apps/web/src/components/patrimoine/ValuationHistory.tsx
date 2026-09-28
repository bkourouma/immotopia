import React from 'react';
import { Card, Table, Tag } from 'antd';
import type { AssetValuation } from '../../types/patrimoine-types';
import { t } from '../../i18n/t';
import { valuationMethodLabel } from './patrimoine-labels';

import { activeLocale } from '../../i18n/format';
interface Props {
  valuations: AssetValuation[];
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
            title: t('Date'),
            dataIndex: 'valuatedAt',
            render: (value: string) => new Date(value).toLocaleDateString(activeLocale())
          },
          {
            title: t('Valeur'),
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
