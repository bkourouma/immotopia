import React from 'react';
import { Table, Tag, Typography } from 'antd';
import type { ContactSearchResultItem } from '../../services/contact-search.service';
import { t as translate } from '../../i18n/t';
import { getContactStatusLabel, getMaturityLabel } from '../../utils/crm-utils';

interface ContactSearchResultsProps {
  contacts: ContactSearchResultItem[];
  selectedContacts: ContactSearchResultItem[];
  onSelectContact?: (contact: ContactSearchResultItem) => void;
  onSelectionChange?: (selected: ContactSearchResultItem[]) => void;
  mode: 'select' | 'view';
  multiSelect?: boolean;
  loading?: boolean;
  pagination?: { total: number; page: number; limit: number; totalPages: number };
  onPageChange?: (page: number, limit: number) => void;
}

export function ContactSearchResults({
  contacts,
  selectedContacts,
  onSelectContact,
  onSelectionChange,
  mode,
  multiSelect = true,
  loading = false,
  pagination,
  onPageChange
}: ContactSearchResultsProps) {
  const rowSelection =
    mode === 'select'
      ? {
          selectedRowKeys: selectedContacts.map(c => c.id),
          onChange: (_: React.Key[], selectedRows: ContactSearchResultItem[]) => {
            if (onSelectionChange) {
              onSelectionChange(selectedRows);
            } else if (onSelectContact) {
              if (multiSelect) selectedRows.forEach(r => onSelectContact(r));
              else if (selectedRows.length) onSelectContact(selectedRows[0]);
            }
          },
          getCheckboxProps: (record: ContactSearchResultItem) => ({
            name: record.id
          })
        }
      : undefined;

  const columns = [
    {
      title: translate('Nom'),
      key: 'name',
      render: (_: unknown, r: ContactSearchResultItem) => `${r.firstName} ${r.lastName}`.trim() || '—'
    },
    {
      title: translate('Email'),
      dataIndex: 'email',
      key: 'email',
      render: (v: string) => <Typography.Text copyable>{v}</Typography.Text>
    },
    {
      title: translate('Téléphone'),
      key: 'phone',
      render: (_: unknown, r: ContactSearchResultItem) => r.phonePrimary || r.whatsappNumber || '—'
    },
    {
      title: translate('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => <Tag>{getContactStatusLabel(s)}</Tag>
    },
    {
      title: translate('Maturité'),
      dataIndex: 'maturityLevel',
      key: 'maturityLevel',
      render: (v: string) => (v ? <Tag color="blue">{getMaturityLabel(v)}</Tag> : '—')
    },
    {
      title: translate('Commune'),
      key: 'commune',
      render: (_: unknown, r: ContactSearchResultItem) => r.commune?.name ?? '—'
    },
    {
      title: translate('Tags'),
      key: 'tags',
      render: (_: unknown, r: ContactSearchResultItem) =>
        r.tags?.length
          ? r.tags.map(t => (
              <Tag key={t.id} color={t.color ?? undefined}>
                {t.name}
              </Tag>
            ))
          : '—'
    }
  ];

  return (
    <Table<ContactSearchResultItem>
      scroll={{ x: 'max-content' }}
      rowKey="id"
      loading={loading}
      dataSource={contacts}
      columns={columns}
      rowSelection={rowSelection}
      pagination={
        pagination && onPageChange
          ? {
              current: pagination.page,
              pageSize: pagination.limit,
              total: pagination.total,
              showSizeChanger: true,
              showTotal: total => translate('Total : {{total}}', { total }),
              onChange: (page, pageSize) => onPageChange(page, pageSize ?? pagination.limit)
            }
          : false
      }
      size="small"
    />
  );
}
