import React from 'react';
import { Card, Progress, Table, Tag } from 'antd';
import type { PropertyLoan } from '../../types/patrimoine-types';

interface Props {
  loans: PropertyLoan[];
}

function loanStatusLabel(status: PropertyLoan['status']): string {
  if (status === 'ACTIVE') return 'Actif';
  if (status === 'CLOSED') return 'Clôturé';
  if (status === 'DEFAULTED') return 'Défaillant';
  return status;
}

export const LoanWidget: React.FC<Props> = ({ loans }) => {
  const noWrap = { whiteSpace: 'nowrap' as const };
  const columns = [
    { title: 'Prêteur', dataIndex: 'lender', onCell: () => ({ style: noWrap }) },
    {
      title: 'Restant dû',
      dataIndex: 'remainingCapital',
      onCell: () => ({ style: noWrap }),
      render: (value: number, record: PropertyLoan) => `${Number(value).toLocaleString('fr-FR')} ${record.currency}`
    },
    {
      title: 'Mensualité',
      dataIndex: 'monthlyPayment',
      onCell: () => ({ style: noWrap }),
      render: (value: number, record: PropertyLoan) => `${Number(value).toLocaleString('fr-FR')} ${record.currency}`
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      onCell: () => ({ style: noWrap }),
      render: (value: PropertyLoan['status']) => <Tag>{loanStatusLabel(value)}</Tag>
    }
  ];

  return (
    <Card title="Crédits immobiliers">
      {loans.map(loan => {
        const total = Number(loan.capitalAmount) || 1;
        const paidPercent = ((total - Number(loan.remainingCapital)) / total) * 100;
        return (
          <div key={loan.id} style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 8 }}>{loan.lender}</div>
            <Progress percent={Math.max(0, Math.min(100, paidPercent))} />
          </div>
        );
      })}
      <Table rowKey="id" dataSource={loans} columns={columns} pagination={{ pageSize: 4 }} scroll={{ x: 760 }} />
    </Card>
  );
};
