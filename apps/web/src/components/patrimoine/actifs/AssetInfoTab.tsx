import React, { useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Form, Input, Modal, Space } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { archiveAsset, disposeAsset, type AssetDto } from '../../../services/patrimoine-assets-service';
import { ConfirmAction } from '../../primitives';
import { t } from '../../../i18n/t';
import { assetClassFields, assetClassLabel, assetStatusLabel, type AssetFieldSpec } from './asset-classes';
import { apiErrorMessage, formatAmount, formatDay, todayIso } from './asset-format';

function detailValue(spec: AssetFieldSpec, value: unknown): React.ReactNode {
  if (value === undefined || value === null || value === '') return '—';
  if (spec.type === 'select') return spec.options?.find(option => option.value === value)?.label ?? String(value);
  if (spec.type === 'date') return formatDay(String(value));
  if (spec.type === 'percent') return `${value} %`;
  return String(value);
}

const DisposeModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: (disposedAt: string) => Promise<void>;
}> = ({ open, onClose, onConfirm }) => {
  const [form] = Form.useForm<{ disposedAt: string }>();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleOk = async () => {
    let values: { disposedAt: string };
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await onConfirm(values.disposedAt);
      onClose();
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, t('Impossible de marquer cet actif comme cédé.')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('Marquer comme cédé')}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={submitting}
      okText={t('Confirmer')}
      cancelText={t('Annuler')}
      destroyOnHidden
    >
      <p>{t("L'actif sortira de la valeur nette à la date de cession ; son historique est conservé.")}</p>
      {errorMessage && <Alert type="error" showIcon title={errorMessage} style={{ marginBottom: 'var(--space-3)' }} />}
      <Form form={form} layout="vertical" initialValues={{ disposedAt: todayIso() }}>
        <Form.Item
          name="disposedAt"
          label={t('Date de cession')}
          rules={[{ required: true, message: t('Champ obligatoire') }]}
        >
          <Input type="date" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

/** Onglet « Informations » : détails de la classe et actions de fin de vie (céder, archiver). */
export const AssetInfoTab: React.FC<{ tenantId: string; asset: AssetDto; onEdit: () => void }> = ({
  tenantId,
  asset,
  onEdit
}) => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [disposeOpen, setDisposeOpen] = useState(false);
  const active = asset.status === 'ACTIVE';

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['patrimoine-asset'] }),
      queryClient.invalidateQueries({ queryKey: ['patrimoine-assets'] }),
      queryClient.invalidateQueries({ queryKey: ['patrimoine-net-worth'] }),
      queryClient.invalidateQueries({ queryKey: ['patrimoine-net-worth-history'] })
    ]);
  };

  const handleDispose = async (disposedAt: string) => {
    await disposeAsset(tenantId, asset.id, disposedAt);
    message.success(t('Actif marqué comme cédé.'));
    await refresh();
  };

  const handleArchive = async () => {
    try {
      await archiveAsset(tenantId, asset.id);
      message.success(t('Actif archivé.'));
      await refresh();
    } catch (error) {
      message.error(apiErrorMessage(error, t("Impossible d'archiver cet actif.")));
    }
  };

  return (
    <Card
      title={t('Informations')}
      extra={
        active && (
          <Space wrap>
            <Button onClick={onEdit}>{t('Modifier')}</Button>
            <Button onClick={() => setDisposeOpen(true)}>{t('Marquer comme cédé')}</Button>
            <ConfirmAction title={t('Archiver {{nom}} ?', { nom: asset.name })} onConfirm={handleArchive}>
              <Button danger>{t('Archiver')}</Button>
            </ConfirmAction>
          </Space>
        )
      }
    >
      <Descriptions column={{ xs: 1, md: 2 }} bordered size="small">
        <Descriptions.Item label={t('Classe')}>{assetClassLabel(asset.assetClass)}</Descriptions.Item>
        <Descriptions.Item label={t('Statut')}>{assetStatusLabel(asset.status)}</Descriptions.Item>
        <Descriptions.Item label={t('Devise')}>
          {asset.currency}
          {asset.exchangeRateToXof ? (
            <span style={{ marginInlineStart: 8 }}>
              {t('1 {{devise}} = {{taux}} XOF', { devise: asset.currency, taux: asset.exchangeRateToXof })}
            </span>
          ) : null}
        </Descriptions.Item>
        <Descriptions.Item label={t("Coût d'acquisition")}>
          {asset.acquisitionCost !== null ? formatAmount(asset.acquisitionCost, asset.currency) : '—'}
        </Descriptions.Item>
        <Descriptions.Item label={t("Date d'acquisition")}>{formatDay(asset.acquisitionDate)}</Descriptions.Item>
        {asset.disposedAt && (
          <Descriptions.Item label={t('Date de cession')}>{formatDay(asset.disposedAt)}</Descriptions.Item>
        )}
        {assetClassFields(asset.assetClass).map(spec => (
          <Descriptions.Item key={spec.name} label={spec.label}>
            {detailValue(spec, asset.details?.[spec.name])}
          </Descriptions.Item>
        ))}
        <Descriptions.Item label={t('Notes')} span={2}>
          {asset.notes || '—'}
        </Descriptions.Item>
      </Descriptions>
      <DisposeModal open={disposeOpen} onClose={() => setDisposeOpen(false)} onConfirm={handleDispose} />
    </Card>
  );
};
