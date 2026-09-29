import React, { useEffect, useState } from 'react';
import { Alert, App, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteAssetHolding,
  listAssetHoldings,
  upsertAssetHolding,
  type AssetDto,
  type HoldingDto
} from '../../../services/patrimoine-assets-service';
import { listHoldingEntities } from '../../../services/patrimoine-entities-service';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { ConfirmAction, StateBlock } from '../../primitives';
import { activeLocale } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { apiErrorMessage, formatDay } from './asset-format';

interface HoldingFormValues {
  entityId: string;
  sharePercent: number;
  effectiveFrom?: string;
}

const HoldingFormModal: React.FC<{
  open: boolean;
  tenantId: string;
  holding: HoldingDto | null;
  onClose: () => void;
  onSubmit: (entityId: string, payload: { sharePercent: number; effectiveFrom?: string | null }) => Promise<void>;
}> = ({ open, tenantId, holding, onClose, onSubmit }) => {
  const [form] = Form.useForm<HoldingFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const entities = useQuery({
    queryKey: queryKey('holding-entities', tenantId, {}),
    queryFn: () => listHoldingEntities(tenantId),
    enabled: open,
    staleTime: STALE_TIME.reference
  });

  useEffect(() => {
    if (!open) return;
    setErrorMessage(null);
    form.resetFields();
    form.setFieldsValue(
      holding
        ? {
            entityId: holding.entityId,
            sharePercent: holding.sharePercent,
            effectiveFrom: holding.effectiveFrom?.slice(0, 10)
          }
        : {}
    );
  }, [open, holding, form]);

  const handleOk = async () => {
    setErrorMessage(null);
    let values: HoldingFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(values.entityId, {
        sharePercent: values.sharePercent,
        effectiveFrom: values.effectiveFrom || null
      });
      onClose();
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, t("Impossible d'enregistrer cette part.")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={holding ? t('Modifier une part') : t('Ajouter un détenteur')}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={submitting}
      okText={t('Enregistrer')}
      cancelText={t('Annuler')}
      destroyOnHidden
    >
      {errorMessage && <Alert type="error" showIcon title={errorMessage} style={{ marginBottom: 'var(--space-3)' }} />}
      <Form form={form} layout="vertical">
        <Form.Item
          name="entityId"
          label={t('Entité détentrice')}
          rules={[{ required: true, message: t('Champ obligatoire') }]}
        >
          <Select
            disabled={Boolean(holding)}
            showSearch
            optionFilterProp="label"
            loading={entities.isPending}
            options={(entities.data ?? []).map(entity => ({ value: entity.id, label: entity.name }))}
          />
        </Form.Item>
        <Form.Item
          name="sharePercent"
          label={t('Part détenue (%)')}
          rules={[
            { required: true, message: t('Champ obligatoire') },
            {
              validator: (_rule, value) =>
                value === undefined || value === null || (Number(value) > 0 && Number(value) <= 100)
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('La part doit être supérieure à 0 et au plus égale à 100')))
            }
          ]}
        >
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="effectiveFrom" label={t('Détenue depuis')}>
          <Input type="date" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

/** Onglet « Détenteurs » : parts d'un actif non immobilier (les biens passent par leurs entités). */
export const AssetHoldingsTab: React.FC<{ tenantId: string; asset: AssetDto }> = ({ tenantId, asset }) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HoldingDto | null>(null);

  const holdingsQuery = useQuery({
    queryKey: queryKey('patrimoine-asset-holdings', tenantId, { assetId: asset.id }),
    queryFn: () => listAssetHoldings(tenantId, asset.id),
    staleTime: STALE_TIME.list
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['patrimoine-asset-holdings'] });
  const holdings = holdingsQuery.data ?? [];
  const total = holdings.reduce((sum, holding) => sum + holding.sharePercent, 0);

  const handleSubmit = async (entityId: string, payload: { sharePercent: number; effectiveFrom?: string | null }) => {
    await upsertAssetHolding(tenantId, asset.id, entityId, payload);
    message.success(t('Part enregistrée.'));
    await refresh();
  };

  const handleDelete = async (holding: HoldingDto) => {
    try {
      await deleteAssetHolding(tenantId, asset.id, holding.entityId);
      message.success(t('Détenteur retiré.'));
      await refresh();
    } catch (error) {
      message.error(apiErrorMessage(error, t('Impossible de retirer ce détenteur.')));
    }
  };

  return (
    <Card
      title={t('Détenteurs')}
      extra={
        <Button
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          {t('Ajouter un détenteur')}
        </Button>
      }
    >
      {holdingsQuery.error ? (
        <StateBlock
          variant="error"
          actions={[{ label: t('Réessayer'), onClick: () => holdingsQuery.refetch(), primary: true }]}
        />
      ) : (
        <>
          {total > 100 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 'var(--space-3)' }}
              title={t('Les parts déclarées dépassent 100 %')}
            />
          )}
          <Table<HoldingDto>
            rowKey="id"
            size="small"
            loading={holdingsQuery.isPending}
            dataSource={holdings}
            pagination={false}
            locale={{ emptyText: t('Aucun détenteur déclaré pour cet actif.') }}
            columns={[
              { title: t('Entité'), dataIndex: 'entityName' },
              {
                title: t('Part'),
                dataIndex: 'sharePercent',
                align: 'end',
                render: (value: number) =>
                  `${new Intl.NumberFormat(activeLocale(), { maximumFractionDigits: 2 }).format(value)} %`
              },
              { title: t('Depuis'), dataIndex: 'effectiveFrom', render: (value: string | null) => formatDay(value) },
              {
                title: t('Actions'),
                key: 'actions',
                render: (_: unknown, row) => (
                  <Space>
                    <a
                      onClick={() => {
                        setEditing(row);
                        setModalOpen(true);
                      }}
                    >
                      {t('Modifier')}
                    </a>
                    <ConfirmAction
                      title={t('Retirer {{nom}} ?', { nom: row.entityName })}
                      danger
                      onConfirm={() => handleDelete(row)}
                    >
                      <a>{t('Retirer')}</a>
                    </ConfirmAction>
                  </Space>
                )
              }
            ]}
          />
        </>
      )}
      <HoldingFormModal
        open={modalOpen}
        tenantId={tenantId}
        holding={editing}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
      />
    </Card>
  );
};
