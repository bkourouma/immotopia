import React, { useEffect, useState } from 'react';
import { App, Alert, Button, Card, Form, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { EditOutlined, UndoOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
  FeeTerms,
  OwnerFeeTerms,
  OwnerFeeTermsInput,
  OwnerTaxStatus,
  deleteOwnerFeeTerms,
  listOwnerFeeTerms,
  updateOwnerFeeTerms
} from '../../services/agency-finance-settings-service';
import { ConfirmAction, formatMoney } from '../../components/primitives';
import { onAntFormValidationFailed } from '../../lib/antFormFailure';
import { FeeTermsFields } from './FeeTermsFields';
import { t } from '../../i18n/t';

const { Text } = Typography;

/** Conditions par défaut proposées à l'ouverture de la modale d'édition. */
const DEFAULT_TERMS: OwnerFeeTermsInput = {
  managementFeeMode: 'PERCENT',
  managementFeeRate: null,
  managementFeeFixedAmount: null,
  managementFeeBase: 'RENT_ONLY',
  ownerTaxStatus: null
};

/** Libellés du statut fiscal, utilisés à la fois dans la modale et le tableau. */
const TAX_STATUS_LABELS: Record<OwnerTaxStatus, string> = {
  INDIVIDUAL: t('Personne physique'),
  COMPANY: t('Personne morale'),
  EXEMPT: t('Exonéré')
};

function taxStatusLabel(status: OwnerTaxStatus | null): string {
  return status ? TAX_STATUS_LABELS[status] : t('Non renseigné');
}

/** Résumé lisible des conditions d'un propriétaire, pour la colonne du tableau. */
function summarizeTerms(terms: FeeTerms | null): string {
  if (!terms) return t("Suit l'agence");
  if (terms.managementFeeMode === 'FIXED') {
    return t('Forfait {{amount}}', { amount: formatMoney(terms.managementFeeFixedAmount) });
  }
  if (terms.managementFeeRate === null) {
    return t('Taux non défini');
  }
  return terms.managementFeeBase === 'ALL_COLLECTED'
    ? t('{{rate}} % de tout ce qui est encaissé', { rate: terms.managementFeeRate })
    : t('{{rate}} % du loyer seul', { rate: terms.managementFeeRate });
}

export interface OwnerFeeTermsCardProps {
  tenantId: string;
}

/**
 * Carte « Conditions par propriétaire » (Lot 2, `lot2-contrat-api.md` §2).
 *
 * Un propriétaire sans conditions particulières suit les paramètres de
 * l'agence ; le taux applicable à un encaissement se résout dans l'ordre
 * bail, puis propriétaire, puis agence.
 */
export const OwnerFeeTermsCard: React.FC<OwnerFeeTermsCardProps> = ({ tenantId }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<OwnerFeeTermsInput>();
  const [owners, setOwners] = useState<OwnerFeeTerms[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<OwnerFeeTerms | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listOwnerFeeTerms(tenantId);
      setOwners(data);
    } catch (e: any) {
      setError(e?.response?.data?.message || t('Erreur lors du chargement des propriétaires'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [tenantId]);

  const openEdit = (owner: OwnerFeeTerms) => {
    setEditing(owner);
    form.setFieldsValue({
      ...(owner.terms ?? DEFAULT_TERMS),
      ownerTaxStatus: owner.ownerTaxStatus
    });
  };

  const closeEdit = () => {
    setEditing(null);
    form.resetFields();
  };

  const handleSave = async (values: OwnerFeeTermsInput) => {
    if (!editing) return;
    setSaving(true);
    try {
      await updateOwnerFeeTerms(tenantId, editing.ownerClientId, {
        ...values,
        managementFeeRate: values.managementFeeRate ?? null,
        managementFeeFixedAmount: values.managementFeeFixedAmount ?? null,
        ownerTaxStatus: values.ownerTaxStatus ?? null
      });
      message.success(t('Conditions du propriétaire enregistrées'));
      closeEdit();
      await load();
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('Erreur lors de la sauvegarde'));
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async (owner: OwnerFeeTerms) => {
    try {
      await deleteOwnerFeeTerms(tenantId, owner.ownerClientId);
      message.success(t("Le propriétaire suit maintenant les conditions de l'agence"));
      await load();
    } catch (e: any) {
      message.error(e?.response?.data?.message || t('Erreur lors de la suppression'));
    }
  };

  const columns: ColumnsType<OwnerFeeTerms> = [
    {
      title: t('Propriétaire'),
      dataIndex: 'ownerName',
      key: 'ownerName'
    },
    {
      title: t('Baux'),
      dataIndex: 'leaseCount',
      key: 'leaseCount',
      width: 100,
      align: 'end'
    },
    {
      title: t('Conditions'),
      key: 'terms',
      render: (_, owner) =>
        owner.terms ? (
          <Tag color="blue">{summarizeTerms(owner.terms)}</Tag>
        ) : (
          <Text type="secondary">{summarizeTerms(owner.terms)}</Text>
        )
    },
    {
      title: t('Statut fiscal (retenue à la source)'),
      key: 'ownerTaxStatus',
      render: (_, owner) =>
        owner.ownerTaxStatus ? (
          <Tag>{taxStatusLabel(owner.ownerTaxStatus)}</Tag>
        ) : (
          <Text type="secondary">{taxStatusLabel(owner.ownerTaxStatus)}</Text>
        )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_, owner) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(owner)}>
            {t('Modifier')}
          </Button>
          {owner.terms ? (
            <ConfirmAction
              title={t("Revenir aux conditions de l'agence pour {{name}} ?", { name: owner.ownerName })}
              description={t('Les conditions particulières de {{name}} seront supprimées.', {
                name: owner.ownerName
              })}
              okText={t('Revenir')}
              cancelText={t('Annuler')}
              onConfirm={() => handleRevert(owner)}
            >
              <Button size="small" icon={<UndoOutlined />}>
                {t("Revenir aux conditions de l'agence")}
              </Button>
            </ConfirmAction>
          ) : null}
        </Space>
      )
    }
  ];

  return (
    <Card title={t('Conditions par propriétaire')}>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {t(
          "Un propriétaire sans conditions particulières suit les paramètres de l'agence. Les conditions d'un bail, si elles existent, priment sur celles-ci."
        )}
      </Text>
      {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
      <Table rowKey="ownerClientId" columns={columns} dataSource={owners} loading={loading} pagination={false} />

      <Modal
        title={editing ? t('Conditions de {{name}}', { name: editing.ownerName }) : ''}
        open={editing !== null}
        onCancel={closeEdit}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSave} onFinishFailed={onAntFormValidationFailed(form)}>
          <FeeTermsFields />
          <Form.Item
            label={t('Statut fiscal (retenue à la source)')}
            name="ownerTaxStatus"
            extra={t(
              "Sert à déterminer le taux de retenue à la source applicable à ce propriétaire, une fois la retenue activée."
            )}
          >
            <Select
              allowClear
              placeholder={t('Non renseigné')}
              options={[
                { value: 'INDIVIDUAL', label: t('Personne physique') },
                { value: 'COMPANY', label: t('Personne morale') },
                { value: 'EXEMPT', label: t('Exonéré') }
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
