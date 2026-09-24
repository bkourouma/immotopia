import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import {
  AdminInvoice,
  AdminInvoiceStatus,
  createAdminInvoice,
  listAdminInvoices,
  markAdminInvoicePaid,
  updateAdminInvoice
} from '../../../services/admin-subscription-service';
import { formatMoney, StatusTag, useConfirmAction } from '../../primitives';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';

/** Onglet Factures SaaS de la fiche agence (lot G2). */

const STATUS_OPTIONS: Array<{ value: AdminInvoiceStatus; label: string }> = [
  { value: 'DRAFT', label: t('Brouillon') },
  { value: 'ISSUED', label: t('Émise') },
  { value: 'PAID', label: t('Payée') },
  { value: 'FAILED', label: t('Échouée') },
  { value: 'CANCELED', label: t('Annulée') },
  { value: 'REFUNDED', label: t('Remboursée') }
];

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(activeLocale());
}

interface CreateValues {
  amountTotal: number;
  currency: string;
  dueDate: Dayjs;
  issueDate?: Dayjs;
  notes?: string;
}

interface EditValues {
  status: AdminInvoiceStatus;
  paidAt?: Dayjs | null;
  notes?: string;
}

export const InvoicesTab: React.FC<{ tenantId: string }> = ({ tenantId }) => {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm] = Form.useForm<CreateValues>();

  const [editing, setEditing] = useState<AdminInvoice | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm] = Form.useForm<EditValues>();

  const load = useCallback(
    async (page = pagination.page) => {
      setLoading(true);
      try {
        const result = await listAdminInvoices(tenantId, { page, limit: pagination.limit });
        setInvoices(result.invoices);
        setPagination({ page: result.pagination.page, limit: result.pagination.limit, total: result.pagination.total });
      } catch (err: any) {
        message.error(err.response?.data?.message || t('Erreur lors du chargement des factures'));
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenantId]
  );

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const handleCreate = async (values: CreateValues) => {
    setCreating(true);
    try {
      await createAdminInvoice(tenantId, {
        amountTotal: values.amountTotal,
        currency: values.currency || 'FCFA',
        dueDate: values.dueDate.toISOString(),
        issueDate: values.issueDate?.toISOString(),
        notes: values.notes || undefined
      });
      setCreateOpen(false);
      createForm.resetFields();
      message.success(t('Facture créée'));
      load(1);
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors de la création de la facture'));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (invoice: AdminInvoice) => {
    setEditing(invoice);
    editForm.setFieldsValue({
      status: invoice.status,
      paidAt: invoice.paidAt ? dayjs(invoice.paidAt) : null,
      notes: invoice.notes ?? undefined
    });
  };

  const handleSaveEdit = async (values: EditValues) => {
    if (!editing) return;
    setSaving(true);
    try {
      await updateAdminInvoice(editing.id, {
        status: values.status,
        paidAt: values.paidAt ? values.paidAt.toISOString() : values.paidAt === null ? null : undefined,
        notes: values.notes
      });
      message.success(t('Facture mise à jour'));
      setEditing(null);
      load(pagination.page);
    } catch (err: any) {
      message.error(err.response?.data?.message || t('Erreur lors de la mise à jour de la facture'));
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = (invoice: AdminInvoice) => {
    confirmAction({
      title: t('Marquer la facture {{value}} comme payée ?', { value: invoice.invoiceNumber }),
      okText: t('Marquer payée'),
      onConfirm: async () => {
        try {
          await markAdminInvoicePaid(invoice.id);
          message.success(t('Facture marquée comme payée'));
          load(pagination.page);
        } catch (err: any) {
          message.error(err.response?.data?.message || t('Erreur lors du marquage de la facture'));
        }
      }
    });
  };

  const columns: ColumnsType<AdminInvoice> = [
    { title: t('Numéro'), dataIndex: 'invoiceNumber', key: 'invoiceNumber' },
    { title: t('Date'), dataIndex: 'issueDate', key: 'issueDate', render: formatDate },
    { title: t('Échéance'), dataIndex: 'dueDate', key: 'dueDate', render: formatDate },
    {
      title: t('Montant'),
      dataIndex: 'amountTotal',
      key: 'amountTotal',
      align: 'end',
      render: (_, record) => formatMoney(record.amountTotal, { currency: record.currency })
    },
    { title: t('Statut'), dataIndex: 'status', key: 'status', render: (status: AdminInvoiceStatus) => <StatusTag status={status} /> },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, record) => (
        <span style={{ display: 'inline-flex', gap: 'var(--space-2)' }}>
          <Button size="small" onClick={() => openEdit(record)}>
            {t('Modifier')}
          </Button>
          {record.status !== 'PAID' && (
            <Button size="small" type="primary" onClick={() => handleMarkPaid(record)}>
              {t('Marquer payée')}
            </Button>
          )}
        </span>
      )
    }
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          {t('Nouvelle facture')}
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={invoices}
        loading={loading}
        pagination={{
          current: pagination.page,
          pageSize: pagination.limit,
          total: pagination.total,
          onChange: page => load(page)
        }}
        locale={{ emptyText: t('Aucune facture pour cette agence') }}
      />

      <Modal
        title={t('Nouvelle facture')}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={creating}
        okText={t('Créer la facture')}
        cancelText={t('Annuler')}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate} initialValues={{ currency: 'FCFA' }}>
          <Form.Item label={t('Montant')} name="amountTotal" rules={[{ required: true, message: t('Le montant est requis') }]}>
            <InputNumber<number> style={{ width: '100%' }} min={0} step={1000} />
          </Form.Item>
          <Form.Item label={t('Devise')} name="currency">
            <Input placeholder="FCFA" />
          </Form.Item>
          <Form.Item label={t('Date d’échéance')} name="dueDate" rules={[{ required: true, message: t("La date d'échéance est requise") }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label={t('Date d’émission')} name="issueDate">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label={t('Notes')} name="notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editing ? t('Facture {{value}}', { value: editing.invoiceNumber }) : ''}
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={() => editForm.submit()}
        confirmLoading={saving}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
      >
        <Form form={editForm} layout="vertical" onFinish={handleSaveEdit}>
          <Form.Item label={t('Statut')} name="status" rules={[{ required: true }]}>
            <Select options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item label={t('Date de paiement')} name="paidAt">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label={t('Notes')} name="notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
