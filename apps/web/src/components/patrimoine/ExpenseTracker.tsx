import React from 'react';
import { Card, Tag } from 'antd';
import { Table } from '../primitives';
import type { PropertyExpense } from '../../types/patrimoine-types';
import { t } from '../../i18n/t';
import { expenseCategoryLabel, expenseRecurrenceLabel } from './patrimoine-labels';

import { activeLocale } from '../../i18n/format';
interface Props {
  expenses: PropertyExpense[];
}

export const ExpenseTracker: React.FC<Props> = ({ expenses }) => {
  return (
    <Card title={t('Charges et dépenses')}>
      <Table
        exportFilename={t('Charges et dépenses')}
        scroll={{ x: 'max-content' }}
        rowKey="id"
        dataSource={expenses}
        pagination={{ pageSize: 6 }}
        columns={[
          {
            title: t('Date'),
            dataIndex: 'paidAt',
            render: (value: string) => new Date(value).toLocaleDateString(activeLocale())
          },
          { title: t('Libellé'), dataIndex: 'label' },
          {
            title: t('Catégorie'),
            dataIndex: 'category',
            render: (value: PropertyExpense['category']) => <Tag>{expenseCategoryLabel(value)}</Tag>
          },
          {
            title: t('Périodicité'),
            dataIndex: 'recurrence',
            render: (value: PropertyExpense['recurrence']) => expenseRecurrenceLabel(value)
          },
          {
            title: t('Montant'),
            dataIndex: 'amount',
            render: (value: number, record: PropertyExpense) =>
              `${Number(value).toLocaleString(activeLocale())} ${record.currency}`
          }
        ]}
      />
    </Card>
  );
};
