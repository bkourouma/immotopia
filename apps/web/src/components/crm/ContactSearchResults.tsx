import React from 'react';
import { Table, Tag, Typography } from 'antd';
import type { ContactSearchResultItem } from '../../services/contact-search.service';

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
          selectedRowKeys: selectedContacts.map((c) => c.id),
          onChange: (_: React.Key[], selectedRows: ContactSearchResultItem[]) => {
            if (onSelectionChange) {
              onSelectionChange(selectedRows);
            } else if (onSelectContact) {
              if (multiSelect) selectedRows.forEach((r) => onSelectContact(r));
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
      title: 'Nom',
      key: 'name',
      render: (_: unknown, r: ContactSearchResultItem) =>
        `${r.firstName} ${r.lastName}`.trim() || '—'
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (v: string) => <Typography.Text copyable>{v}</Typography.Text>
    },
    {
      title: 'Téléphone',
      key: 'phone',
      render: (_: unknown, r: ContactSearchResultItem) => r.phonePrimary || r.whatsappNumber || '—'
    },
    {
      title: 'Statut',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => <Tag>{s}</Tag>
    },
    {
      title: 'Maturité',
      dataIndex: 'maturityLevel',
      key: 'maturityLevel',
      render: (v: string) => (v ? <Tag color="blue">{v}</Tag> : '—')
    },
    {
      title: 'Commune',
      key: 'commune',
      render: (_: unknown, r: ContactSearchResultItem) => r.commune?.name ?? '—'
    },
    {
      title: 'Tags',
      key: 'tags',
      render: (_: unknown, r: ContactSearchResultItem) =>
        r.tags?.length
          ? r.tags.map((t) => (
              <Tag key={t.id} color={t.color ?? undefined}>
                {t.name}
              </Tag>
            ))
          : '—'
    }
  ];

  return (
    <Table<ContactSearchResultItem>
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
              showTotal: (total) => `Total: ${total}`,
              onChange: (page, pageSize) => onPageChange(page, pageSize ?? pagination.limit)
            }
          : false
      }
      size="small"
    />
  );
}
