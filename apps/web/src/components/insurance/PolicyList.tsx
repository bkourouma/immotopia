import React from 'react';
import { Button, Popconfirm, Space, Table, Tag } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import type { InsurancePolicyDto } from '../../types/insurance-types';
import { t } from '../../i18n/t';
import {
  coverageLabel,
  daysToExpiryLabel,
  formatAmount,
  formatDay,
  policyStatusColor,
  policyStatusLabel
} from './insurance-labels';

interface Props {
  policies: InsurancePolicyDto[];
  canEdit: boolean;
  deletingId: string | null;
  onEdit: (policy: InsurancePolicyDto) => void;
  onDelete: (policy: InsurancePolicyDto) => void;
}

/** Tableau des polices du bien, statut dérivé en pastille. */
export const PolicyList: React.FC<Props> = ({ policies, canEdit, deletingId, onEdit, onDelete }) => (
  <Table<InsurancePolicyDto>
    rowKey="id"
    size="small"
    pagination={false}
    dataSource={policies}
    scroll={{ x: 'max-content' }}
    columns={[
      { title: t('Assureur'), dataIndex: 'insurer' },
      { title: t('Numéro de police'), dataIndex: 'policyNumber' },
      { title: t('Couverture'), dataIndex: 'coverageType', render: (value: string) => coverageLabel(value) },
      { title: t('Début'), dataIndex: 'startDate', render: (value: string) => formatDay(value) },
      { title: t('Fin'), dataIndex: 'endDate', render: (value: string) => formatDay(value) },
      {
        title: t('Prime annuelle'),
        dataIndex: 'annualPremium',
        align: 'end' as const,
        render: (value: number | null, row) => formatAmount(value, row.currency)
      },
      {
        title: t('Statut'),
        dataIndex: 'status',
        render: (value: string) => <Tag color={policyStatusColor(value)}>{policyStatusLabel(value)}</Tag>
      },
      {
        title: t('Échéance'),
        dataIndex: 'daysToExpiry',
        render: (_: number, row: InsurancePolicyDto) => daysToExpiryLabel(row.status, row.daysToExpiry)
      },
      ...(canEdit
        ? [
            {
              title: t('Actions'),
              key: 'actions',
              render: (_: unknown, row: InsurancePolicyDto) => (
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(row)}>
                    {t('Modifier')}
                  </Button>
                  <Popconfirm
                    title={t('Supprimer cette police ?')}
                    okText={t('Supprimer')}
                    cancelText={t('Annuler')}
                    onConfirm={() => onDelete(row)}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} loading={deletingId === row.id}>
                      {t('Supprimer')}
                    </Button>
                  </Popconfirm>
                </Space>
              )
            }
          ]
        : [])
    ]}
  />
);
