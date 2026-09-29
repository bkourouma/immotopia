import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  createAssetValuation,
  deleteAssetValuation,
  listAssetValuations,
  updateAssetValuation,
  type AssetDto,
  type AssetValuationDto,
  type AssetValuationInput
} from '../../../services/patrimoine-assets-service';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { ConfirmAction, StateBlock } from '../../primitives';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { apiErrorMessage, formatAmount, formatDay, serverFieldErrors, todayIso } from './asset-format';
import { valuationMethodLabel } from '../patrimoine-labels';

interface ValuationFormValues {
  valuatedAt: string;
  estimatedValue: number;
  currency: string;
  method: AssetValuationDto['method'];
  source?: string;
  notes?: string;
}

const METHODS = ['MANUAL', 'MARKET_ESTIMATE', 'EXPERT_APPRAISAL'] as const;
const FORM_FIELDS = ['valuatedAt', 'estimatedValue', 'currency', 'method', 'source', 'notes'];

const ValuationFormModal: React.FC<{
  open: boolean;
  asset: AssetDto;
  valuation: AssetValuationDto | null;
  onClose: () => void;
  onSubmit: (payload: AssetValuationInput) => Promise<void>;
}> = ({ open, asset, valuation, onClose, onSubmit }) => {
  const [form] = Form.useForm<ValuationFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMessage(null);
    form.resetFields();
    form.setFieldsValue(
      valuation
        ? {
            valuatedAt: valuation.valuatedAt.slice(0, 10),
            estimatedValue: valuation.estimatedValue,
            currency: valuation.currency,
            method: valuation.method,
            source: valuation.source ?? undefined,
            notes: valuation.notes ?? undefined
          }
        : { valuatedAt: todayIso(), currency: asset.currency, method: 'MANUAL' }
    );
  }, [open, valuation, asset.currency, form]);

  const handleOk = async () => {
    setErrorMessage(null);
    let values: ValuationFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        valuatedAt: values.valuatedAt,
        estimatedValue: values.estimatedValue,
        currency: values.currency,
        method: values.method,
        source: values.source?.trim() || null,
        notes: values.notes?.trim() || null
      });
      onClose();
    } catch (error) {
      const issues = serverFieldErrors(error).filter(issue => FORM_FIELDS.includes(issue.path[0]));
      if (issues.length > 0) {
        form.setFields(
          issues.map(issue => ({ name: issue.path[0] as keyof ValuationFormValues, errors: [issue.message] }))
        );
      } else {
        setErrorMessage(apiErrorMessage(error, t("Impossible d'enregistrer cette valeur.")));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={valuation ? t('Modifier une valeur') : t('Ajouter une valeur')}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={submitting}
      okText={valuation ? t('Enregistrer') : t('Ajouter')}
      cancelText={t('Annuler')}
      destroyOnHidden
    >
      {errorMessage && <Alert type="error" showIcon title={errorMessage} style={{ marginBottom: 'var(--space-3)' }} />}
      <Form form={form} layout="vertical">
        <Form.Item
          name="valuatedAt"
          label={t('Date de la valeur')}
          rules={[{ required: true, message: t('Champ obligatoire') }]}
        >
          <Input type="date" />
        </Form.Item>
        <Form.Item
          name="estimatedValue"
          label={t('Valeur estimée')}
          rules={[
            { required: true, message: t('Champ obligatoire') },
            {
              validator: (_rule, value) =>
                value === undefined || value === null || Number(value) > 0
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('La valeur doit être supérieure à 0')))
            }
          ]}
        >
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="currency" label={t('Devise')} rules={[{ required: true }]}>
          <Select options={['XOF', 'EUR', 'USD'].map(value => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item name="method" label={t('Méthode')} rules={[{ required: true }]}>
          <Select options={METHODS.map(value => ({ value, label: valuationMethodLabel(value) }))} />
        </Form.Item>
        <Form.Item name="source" label={t('Source')}>
          <Input maxLength={160} />
        </Form.Item>
        <Form.Item name="notes" label={t('Notes')}>
          <Input.TextArea rows={2} maxLength={1000} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

const ValuationCurve: React.FC<{ valuations: AssetValuationDto[] }> = ({ valuations }) => {
  const points = useMemo(
    () =>
      [...valuations]
        .sort((a, b) => a.valuatedAt.localeCompare(b.valuatedAt))
        .map(v => ({ date: v.valuatedAt, value: v.estimatedValue })),
    [valuations]
  );
  if (points.length < 2) return null;
  const day = (value: unknown) => new Date(String(value)).toLocaleDateString(activeLocale());
  return (
    <div style={{ width: '100%', height: 220, marginBottom: 'var(--space-4)' }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={day} />
          <YAxis
            width={70}
            tickFormatter={value =>
              new Intl.NumberFormat(activeLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(
                Number(value)
              )
            }
          />
          <Tooltip labelFormatter={day} formatter={value => formatAmount(Number(value), 'XOF')} />
          <Line type="monotone" dataKey="value" stroke="#1677ff" strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

/** Onglet « Valeurs » : historique des valorisations avec ajout, modification, suppression et courbe. */
export const AssetValuationsTab: React.FC<{ tenantId: string; asset: AssetDto }> = ({ tenantId, asset }) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AssetValuationDto | null>(null);

  const valuationsQuery = useQuery({
    queryKey: queryKey('patrimoine-asset-valuations', tenantId, { assetId: asset.id }),
    queryFn: () => listAssetValuations(tenantId, asset.id),
    staleTime: STALE_TIME.list
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['patrimoine-asset-valuations'] }),
      queryClient.invalidateQueries({ queryKey: ['patrimoine-asset'] }),
      queryClient.invalidateQueries({ queryKey: ['patrimoine-assets'] }),
      queryClient.invalidateQueries({ queryKey: ['patrimoine-net-worth'] }),
      queryClient.invalidateQueries({ queryKey: ['patrimoine-net-worth-history'] })
    ]);
  };

  const handleSubmit = async (payload: AssetValuationInput) => {
    if (editing) {
      await updateAssetValuation(tenantId, asset.id, editing.id, payload);
      message.success(t('Valeur modifiée.'));
    } else {
      await createAssetValuation(tenantId, asset.id, payload);
      message.success(t('Valeur ajoutée.'));
    }
    await refresh();
  };

  const handleDelete = async (valuation: AssetValuationDto) => {
    try {
      await deleteAssetValuation(tenantId, asset.id, valuation.id);
      message.success(t('Valeur supprimée.'));
      await refresh();
    } catch (error) {
      message.error(apiErrorMessage(error, t('Impossible de supprimer cette valeur.')));
    }
  };

  const openForm = (valuation: AssetValuationDto | null) => {
    setEditing(valuation);
    setModalOpen(true);
  };

  return (
    <Card
      title={t('Historique des valeurs')}
      extra={
        <Button icon={<PlusOutlined />} onClick={() => openForm(null)}>
          {t('Ajouter une valeur')}
        </Button>
      }
    >
      {valuationsQuery.error ? (
        <StateBlock
          variant="error"
          actions={[{ label: t('Réessayer'), onClick: () => valuationsQuery.refetch(), primary: true }]}
        />
      ) : (
        <>
          <ValuationCurve valuations={valuationsQuery.data ?? []} />
          <Table<AssetValuationDto>
            rowKey="id"
            size="small"
            loading={valuationsQuery.isPending}
            dataSource={valuationsQuery.data ?? []}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            scroll={{ x: 'max-content' }}
            locale={{
              emptyText: t(
                'Aucune valeur enregistrée : ajoutez-en une pour que cet actif compte dans votre valeur nette.'
              )
            }}
            columns={[
              { title: t('Date'), dataIndex: 'valuatedAt', render: (value: string) => formatDay(value) },
              {
                title: t('Valeur'),
                dataIndex: 'estimatedValue',
                align: 'end',
                render: (value: number, row) => formatAmount(value, row.currency)
              },
              {
                title: t('Méthode'),
                dataIndex: 'method',
                render: (value: AssetValuationDto['method']) => <Tag>{valuationMethodLabel(value)}</Tag>
              },
              { title: t('Source'), dataIndex: 'source', render: (value: string | null) => value || '—' },
              {
                title: t('Actions'),
                key: 'actions',
                render: (_: unknown, row) => (
                  <Space>
                    <a onClick={() => openForm(row)}>{t('Modifier')}</a>
                    <ConfirmAction title={t('Supprimer cette valeur ?')} danger onConfirm={() => handleDelete(row)}>
                      <a>{t('Supprimer')}</a>
                    </ConfirmAction>
                  </Space>
                )
              }
            ]}
          />
        </>
      )}
      <ValuationFormModal
        open={modalOpen}
        asset={asset}
        valuation={editing}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
      />
    </Card>
  );
};
