import React, { useEffect, useState } from 'react';
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import type {
  EntityHolding,
  EntityHoldingInput,
  EntityHoldingUpdateInput
} from '../../../types/patrimoine-entities-types';
import type { Property } from '../../../types/property-types';
import { listProperties } from '../../../services/property-service';
import { ConfirmAction } from '../../primitives';
import { t } from '../../../i18n/t';
import { apiErrorMessage } from '../patrimoine-labels';

/**
 * `<EntityHoldingsTable>` — biens rattachés à une entité détentrice, avec
 * leur quote-part. Ajout, modification et retrait.
 */

export interface EntityHoldingsTableProps {
  tenantId: string;
  holdings: EntityHolding[];
  onAdd: (payload: EntityHoldingInput) => Promise<void>;
  onUpdate: (holdingId: string, payload: EntityHoldingUpdateInput) => Promise<void>;
  onRemove: (holdingId: string) => Promise<void>;
}

interface FormValues {
  propertyId: string;
  sharePercent: number;
  effectiveFrom?: dayjs.Dayjs | null;
  notes?: string;
}

export const EntityHoldingsTable: React.FC<EntityHoldingsTableProps> = ({
  tenantId,
  holdings,
  onAdd,
  onUpdate,
  onRemove
}) => {
  const { message } = App.useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EntityHolding | null>(null);
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);

  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    listProperties(tenantId, { limit: 100 })
      .then(response => {
        if (!cancelled) setProperties(response.properties);
      })
      .catch(() => {
        if (!cancelled) setProperties([]);
      });
    return () => {
      cancelled = true;
    };
  }, [modalOpen, tenantId]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setErrorMessage(null);
    setModalOpen(true);
  };

  const openEdit = (holding: EntityHolding) => {
    setEditing(holding);
    form.setFieldsValue({
      propertyId: holding.propertyId,
      sharePercent: holding.sharePercent,
      effectiveFrom: holding.effectiveFrom ? dayjs(holding.effectiveFrom) : null,
      notes: holding.notes ?? undefined
    });
    setErrorMessage(null);
    setModalOpen(true);
  };

  const handleOk = async () => {
    setErrorMessage(null);
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const effectiveFrom = values.effectiveFrom ? values.effectiveFrom.format('YYYY-MM-DD') : null;
      if (editing) {
        await onUpdate(editing.id, {
          sharePercent: values.sharePercent,
          effectiveFrom,
          notes: values.notes?.trim() || null
        });
      } else {
        await onAdd({
          propertyId: values.propertyId,
          sharePercent: values.sharePercent,
          effectiveFrom,
          notes: values.notes?.trim() || null
        });
      }
      setModalOpen(false);
      form.resetFields();
    } catch (error) {
      if ((error as { errorFields?: unknown }).errorFields) return;
      setErrorMessage(apiErrorMessage(error, t("Impossible d'enregistrer le rattachement.")));
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<EntityHolding> = [
    { title: t('Bien'), dataIndex: ['property', 'title'], key: 'title' },
    { title: t('Référence'), dataIndex: ['property', 'internalReference'], key: 'reference' },
    {
      title: t('Quote-part'),
      dataIndex: 'sharePercent',
      key: 'sharePercent',
      align: 'end',
      render: (value: number) => `${value.toLocaleString('fr-FR')} %`
    },
    {
      title: t('Total sur le bien'),
      dataIndex: 'propertyTotalSharePercent',
      key: 'propertyTotalSharePercent',
      align: 'end',
      render: (value: number) => `${value.toLocaleString('fr-FR')} %`
    },
    {
      title: t('Depuis'),
      dataIndex: 'effectiveFrom',
      key: 'effectiveFrom',
      render: (value: string | null) => value ?? '—'
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: unknown, holding: EntityHolding) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            aria-label={t('Modifier la quote-part')}
            onClick={() => openEdit(holding)}
          />
          <ConfirmAction
            title={t('Retirer {{bien}} de cette entité ?', { bien: holding.property.title })}
            danger
            onConfirm={async () => {
              try {
                await onRemove(holding.id);
              } catch (error) {
                message.error(apiErrorMessage(error, t('Impossible de retirer ce rattachement.')));
              }
            }}
          >
            <Button size="small" danger icon={<DeleteOutlined />} aria-label={t('Retirer')} />
          </ConfirmAction>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Space style={{ marginBottom: 'var(--space-3)' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t('Rattacher un bien')}
        </Button>
      </Space>
      <Table
        rowKey={holding => holding.id}
        columns={columns}
        dataSource={holdings}
        pagination={false}
        size="middle"
        aria-label={t('Biens rattachés')}
        locale={{ emptyText: t('Aucun bien rattaché') }}
      />

      <Modal
        open={modalOpen}
        title={editing ? t('Modifier la quote-part') : t('Rattacher un bien')}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        onOk={handleOk}
        confirmLoading={submitting}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        destroyOnClose
      >
        {errorMessage && (
          <div role="alert" style={{ color: 'var(--color-error-text)', marginBottom: 'var(--space-3)' }}>
            {errorMessage}
          </div>
        )}
        <Form form={form} layout="vertical" requiredMark="optional">
          {!editing && (
            <Form.Item
              name="propertyId"
              label={t('Bien')}
              rules={[{ required: true, message: t('Le bien est requis') }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                options={properties.map(property => ({
                  value: property.id,
                  label: `${property.title} (${property.internalReference})`
                }))}
              />
            </Form.Item>
          )}
          <Form.Item
            name="sharePercent"
            label={t('Quote-part (%)')}
            rules={[{ required: true, message: t('La quote-part est requise') }]}
          >
            <InputNumber min={0.0001} max={100} step={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="effectiveFrom" label={t("Date d'effet")}>
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="notes" label={t('Notes')}>
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
