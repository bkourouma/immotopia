import React from 'react';
import { Card, Progress, Table, Tag } from 'antd';
import type { PropertyLoan } from '../../types/patrimoine-types';
import { t } from '../../i18n/t';
import { loanStatusLabel } from './patrimoine-labels';

import { activeLocale } from '../../i18n/format';
interface Props {
  loans: PropertyLoan[];
}

export const LoanWidget: React.FC<Props> = ({ loans }) => {
  const noWrap = { whiteSpace: 'nowrap' as const };
  const columns = [
    { title: t('Prêteur'), dataIndex: 'lender', onCell: () => ({ style: noWrap }) },
    {
      title: t('Restant dû'),
      dataIndex: 'remainingCapital',
      onCell: () => ({ style: noWrap }),
      render: (value: number, record: PropertyLoan) =>
        `${Number(value).toLocaleString(activeLocale())} ${record.currency}`
    },
    {
      title: t('Mensualité'),
      dataIndex: 'monthlyPayment',
      onCell: () => ({ style: noWrap }),
      render: (value: number, record: PropertyLoan) =>
        `${Number(value).toLocaleString(activeLocale())} ${record.currency}`
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      onCell: () => ({ style: noWrap }),
      render: (value: PropertyLoan['status']) => <Tag>{loanStatusLabel(value)}</Tag>
    }
  ];

  return (
    <Card title={t('Crédits immobiliers')}>
      {loans.map(loan => {
        const total = Number(loan.capitalAmount) || 1;
        const paidPercent = ((total - Number(loan.remainingCapital)) / total) * 100;
        return (
          <div key={loan.id} style={{ marginBlockEnd: 16 }}>
            <div style={{ marginBlockEnd: 8 }}>{loan.lender}</div>
            <Progress percent={Math.max(0, Math.min(100, paidPercent))} />
          </div>
        );
      })}
      <Table rowKey="id" dataSource={loans} columns={columns} pagination={{ pageSize: 4 }} scroll={{ x: 760 }} />
    </Card>
  );
};
