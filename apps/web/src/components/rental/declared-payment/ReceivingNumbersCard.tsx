import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  createRentalReceivingNumber,
  deleteRentalReceivingNumber,
  listRentalReceivingNumbers,
  updateRentalReceivingNumber
} from '../../../services/rental-declared-payment-service';
import type {
  RentalMobileMoneyOperator,
  RentalReceivingNumberDto,
  UpdateRentalReceivingNumberBody
} from '../../../types/rental-declared-payment';
import { useMyMenuAccess } from '../../../hooks/useMenuAccess';
import { t } from '../../../i18n/t';
import {
  LABEL_MAX_LENGTH,
  apiErrorCode,
  apiErrorMessage,
  formatPhone,
  operatorLabel,
  operatorOptions
} from './helpers';

const { Text, Paragraph } = Typography;

interface FormValues {
  operator: RentalMobileMoneyOperator;
  phone: string;
  label?: string;
  active: boolean;
}

export interface RentalReceivingNumbersCardProps {
  tenantId: string;
}

/**
 * Numéros de réception mobile money de l'agence, côté locatif (spec 049, contrat §1.1).
 * Lecture : RENTAL_PAYMENTS_VIEW ; écriture : RENTAL_PAYMENTS_ALLOCATE.
 */
export const ReceivingNumbersCard: React.FC<RentalReceivingNumbersCardProps> = ({ tenantId }) => {
  const { message } = App.useApp();
  const { permissions } = useMyMenuAccess(tenantId);
  const canEdit = permissions === null || permissions.has('RENTAL_PAYMENTS_ALLOCATE');
  const [form] = Form.useForm<FormValues>();
  const [items, setItems] = useState<RentalReceivingNumberDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RentalReceivingNumberDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setLoadError(null);
      try {
        setItems(await listRentalReceivingNumbers(tenantId));
      } catch (e) {
        setLoadError(apiErrorMessage(e, t('Erreur lors du chargement des informations')));
      } finally {
        setLoading(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setFormError(null);
    setModalOpen(true);
    form.setFieldsValue({ operator: 'ORANGE', phone: '', label: '', active: true });
  };

  const openEdit = (row: RentalReceivingNumberDto) => {
    setEditing(row);
    setFormError(null);
    setModalOpen(true);
    form.setFieldsValue({
      operator: row.operator,
      phone: formatPhone(row.phone),
      label: row.label ?? '',
      active: row.active
    });
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
  };

  const handleError = (e: unknown) => {
    const code = apiErrorCode(e);
    const text = apiErrorMessage(e, t('Enregistrement impossible'));
    if (code === 'INVALID_PHONE' || code === 'RENTAL_RECEIVING_NUMBER_DUPLICATE') {
      form.setFields([{ name: 'phone', errors: [text] }]);
    }
    setFormError(text);
  };

  const handleSubmit = async (values: FormValues) => {
    setSaving(true);
    setFormError(null);
    try {
      const label = values.label?.trim() ? values.label.trim() : null;
      if (editing) {
        const body: UpdateRentalReceivingNumberBody = {};
        if (values.operator !== editing.operator) body.operator = values.operator;
        if (values.phone.trim() !== formatPhone(editing.phone)) body.phone = values.phone.trim();
        if (label !== editing.label) body.label = label;
        if (values.active !== editing.active) body.active = values.active;
        if (Object.keys(body).length === 0) {
          // Rien n'a changé : on ferme sans appel.
          closeModal();
          return;
        }
        await updateRentalReceivingNumber(tenantId, editing.id, body);
        message.success(t('Numéro de réception modifié'));
      } else {
        await createRentalReceivingNumber(tenantId, {
          operator: values.operator,
          phone: values.phone.trim(),
          label,
          active: values.active
        });
        message.success(t('Numéro de réception ajouté'));
      }
      closeModal();
      await load(true);
    } catch (e) {
      handleError(e);
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (row: RentalReceivingNumberDto, active: boolean) => {
    try {
      await updateRentalReceivingNumber(tenantId, row.id, { active });
      message.success(active ? t('Numéro de réception activé') : t('Numéro de réception désactivé'));
      await load(true);
    } catch (e) {
      message.error(apiErrorMessage(e, t('Enregistrement impossible')));
    }
  };

  const handleDelete = async (row: RentalReceivingNumberDto) => {
    try {
      const result = await deleteRentalReceivingNumber(tenantId, row.id);
      if (result.deactivated) {
        message.success(t('Numéro de réception désactivé car des déclarations y sont liées'));
      } else {
        message.success(t('Numéro de réception supprimé'));
      }
      await load(true);
    } catch (e) {
      message.error(apiErrorMessage(e, t('Suppression impossible')));
    }
  };

  const columns: ColumnsType<RentalReceivingNumberDto> = [
    {
      title: t('Opérateur'),
      dataIndex: 'operator',
      key: 'operator',
      render: (op: RentalMobileMoneyOperator) => operatorLabel(op)
    },
    {
      title: t('Numéro'),
      dataIndex: 'phone',
      key: 'phone',
      render: (phone: string) => <Text strong>{formatPhone(phone)}</Text>
    },
    {
      title: t('Libellé'),
      dataIndex: 'label',
      key: 'label',
      render: (label: string | null) => label || '—'
    },
    {
      title: t('Compte de trésorerie'),
      key: 'treasury',
      render: (_: unknown, row) =>
        row.treasuryAccountNumber ? t('Compte {{numero}}', { numero: row.treasuryAccountNumber }) : '—'
    },
    {
      title: t('En attente'),
      dataIndex: 'pendingDeclarations',
      key: 'pendingDeclarations',
      align: 'end'
    },
    {
      title: t('État'),
      dataIndex: 'active',
      key: 'active',
      render: (active: boolean, row) =>
        canEdit ? (
          <Switch
            checked={active}
            aria-label={t('Activer ou désactiver le numéro {{numero}}', { numero: formatPhone(row.phone) })}
            onChange={checked => void setActive(row, checked)}
          />
        ) : active ? (
          <Tag color="success">{t('Actif')}</Tag>
        ) : (
          <Tag>{t('Inactif')}</Tag>
        )
    }
  ];

  if (canEdit) {
    columns.push({
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_: unknown, row) => (
        <Space wrap size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
            {t('Modifier')}
          </Button>
          <Popconfirm
            title={t('Supprimer ce numéro ?')}
            description={t('Si des déclarations y sont liées, il sera seulement désactivé.')}
            okText={t('Supprimer')}
            okButtonProps={{ danger: true }}
            cancelText={t('Annuler')}
            onConfirm={() => handleDelete(row)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              {t('Supprimer')}
            </Button>
          </Popconfirm>
        </Space>
      )
    });
  }

  const title = t('Paiement par transfert mobile money');

  if (loadError && items.length === 0) {
    return (
      <Card title={title}>
        <Alert
          type="error"
          showIcon
          message={t('Erreur')}
          description={loadError}
          action={
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>
              {t('Réessayer')}
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card
      title={title}
      extra={
        canEdit ? (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t('Ajouter un numéro')}
          </Button>
        ) : null
      }
    >
      <Paragraph type="secondary">
        {t(
          'Les locataires envoient leur paiement à l’un de ces numéros puis le déclarent sur le portail. Chaque numéro est suivi sur son propre compte de trésorerie.'
        )}
      </Paragraph>
      <Table<RentalReceivingNumberDto>
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={items}
        pagination={false}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: t('Aucun numéro de réception pour le moment.') }}
      />

      <Modal
        open={modalOpen}
        title={editing ? t('Modifier le numéro de réception') : t('Ajouter un numéro de réception')}
        onCancel={closeModal}
        onOk={() => form.submit()}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        confirmLoading={saving}
        destroyOnClose
        forceRender
      >
        {formError ? <Alert type="error" showIcon style={{ marginBottom: 16 }} message={formError} /> : null}
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label={t('Opérateur')}
            name="operator"
            rules={[{ required: true, message: t('L’opérateur est requis') }]}
          >
            <Select options={operatorOptions()} />
          </Form.Item>
          <Form.Item
            label={t('Numéro de téléphone')}
            name="phone"
            extra={t('Par exemple 07 07 07 07 07')}
            rules={[{ required: true, whitespace: true, message: t('Le numéro est requis') }]}
          >
            <Input inputMode="tel" autoComplete="off" maxLength={30} />
          </Form.Item>
          <Form.Item
            label={t('Libellé (facultatif)')}
            name="label"
            rules={[{ max: LABEL_MAX_LENGTH, message: t('60 caractères au plus') }]}
          >
            <Input maxLength={LABEL_MAX_LENGTH} />
          </Form.Item>
          <Form.Item label={t('Actif')} name="active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ReceivingNumbersCard;
