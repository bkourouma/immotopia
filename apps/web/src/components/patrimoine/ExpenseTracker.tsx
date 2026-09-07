import React from 'react';
import { Card, Table, Tag } from 'antd';
import type { PropertyExpense } from '../../types/patrimoine-types';

interface Props {
  expenses: PropertyExpense[];
}

function expenseCategoryLabel(category: PropertyExpense['category']): string {
  if (category === 'PROPERTY_TAX') return 'Taxe foncière';
  if (category === 'CONDO_FEES') return 'Charges de copropriété';
  if (category === 'INSURANCE') return 'Assurance';
  if (category === 'ROUTINE_MAINTENANCE') return 'Entretien courant';
  if (category === 'RENOVATION') return 'Rénovation';
  if (category === 'MANAGEMENT_FEES') return 'Honoraires de gestion';
  if (category === 'UTILITIES') return 'Charges communes';
  if (category === 'OTHER') return 'Autre';
  return category;
}

export const ExpenseTracker: React.FC<Props> = ({ expenses }) => {
  return (
    <Card title="Charges et dépenses">
      <Table
        rowKey="id"
        dataSource={expenses}
        pagination={{ pageSize: 6 }}
        columns={[
          {
            title: 'Date',
            dataIndex: 'paidAt',
            render: (value: string) => new Date(value).toLocaleDateString('fr-FR')
          },
          { title: 'Libellé', dataIndex: 'label' },
          {
            title: 'Catégorie',
            dataIndex: 'category',
            render: (value: PropertyExpense['category']) => <Tag>{expenseCategoryLabel(value)}</Tag>
          },
          {
            title: 'Montant',
            dataIndex: 'amount',
            render: (value: number, record: PropertyExpense) => `${Number(value).toLocaleString('fr-FR')} ${record.currency}`
          }
        ]}
      />
    </Card>
  );
};
