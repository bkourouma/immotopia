import React from 'react';
import { Card, Table, Tag } from 'antd';
import type { PropertyExpense } from '../../types/patrimoine-types';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
interface Props {
  expenses: PropertyExpense[];
}

function expenseCategoryLabel(category: PropertyExpense['category']): string {
  if (category === 'PROPERTY_TAX') return t('Taxe foncière');
  if (category === 'CONDO_FEES') return t('Charges de copropriété');
  if (category === 'INSURANCE') return 'Assurance';
  if (category === 'ROUTINE_MAINTENANCE') return t('Entretien courant');
  if (category === 'RENOVATION') return t('Rénovation');
  if (category === 'MANAGEMENT_FEES') return t('Honoraires de gestion');
  if (category === 'UTILITIES') return t('Charges communes');
  if (category === 'OTHER') return 'Autre';
  return category;
}

export const ExpenseTracker: React.FC<Props> = ({ expenses }) => {
  return (
    <Card title={t('Charges et dépenses')}>
      <Table
        scroll={{ x: 'max-content' }}
        rowKey="id"
        dataSource={expenses}
        pagination={{ pageSize: 6 }}
        columns={[
          {
            title: 'Date',
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
            title: 'Montant',
            dataIndex: 'amount',
            render: (value: number, record: PropertyExpense) =>
              `${Number(value).toLocaleString(activeLocale())} ${record.currency}`
          }
        ]}
      />
    </Card>
  );
};
