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
  createSyndicReceivingNumber,
  deleteSyndicReceivingNumber,
  listSyndicReceivingNumbers,
  updateSyndicReceivingNumber,
  type CreateReceivingNumberBody,
  type MobileMoneyOperator,
  type ReceivingNumberAdmin,
  type UpdateReceivingNumberBody
} from '../../../services/syndic-declared-payment-service';
import { MoneyValue } from '../../primitives';
import { t } from '../../../i18n/t';
import { OPERATOR_OPTIONS, apiErrorCode, apiErrorMessage, formatPhone, operatorLabel } from './helpers';

const { Text, Paragraph } = Typography;

interface FormValues {
  operator: MobileMoneyOperator;
  phoneNumber: string;
  holderName: string;
  label?: string;
  isActive: boolean;
}

export interface ReceivingNumbersCardProps {
  tenantId: string;
  syndicId: string;
  /** Faux : lecture seule, aucun bouton d'écriture. */
  canEdit?: boolean;
  /** Change quand une autre partie de la page a modifié des déclarations. */
  refreshToken?: number;
  /** Appelé après chaque écriture réussie. */
  onChanged?: () => void;
}

/**
 * Numéros de réception mobile money d'une copropriété (spec 047, contrat §1.1 à §1.4).
 * Le serveur normalise le numéro et refuse de changer opérateur ou numéro dès qu'une
 * déclaration existe (RECEIVING_NUMBER_IN_USE) : l'écran affiche alors son message et
 * propose de désactiver plutôt que de modifier.
 */
export const ReceivingNumbersCard: React.FC<ReceivingNumbersCardProps> = ({
  tenantId,
  syndicId,
  canEdit = true,
  refreshToken = 0,
  onChanged
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [items, setItems] = useState<ReceivingNumberAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReceivingNumberAdmin | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<{ code?: string; message: string } | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setLoadError(null);
      try {
        setItems(await listSyndicReceivingNumbers(tenantId, syndicId));
      } catch (e) {
        setLoadError(apiErrorMessage(e, t('Erreur lors du chargement des informations')));
      } finally {
        setLoading(false);
      }
    },
    [tenantId, syndicId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (refreshToken === 0) return;
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const afterWrite = async () => {
    await load(true);
    onChanged?.();
  };

  const openCreate = () => {
    setEditing(null);
    setFormError(null);
    setModalOpen(true);
    form.setFieldsValue({ operator: 'ORANGE', phoneNumber: '', holderName: '', label: '', isActive: true });
  };

  const openEdit = (row: ReceivingNumberAdmin) => {
    setEditing(row);
    setFormError(null);
    setModalOpen(true);
    form.setFieldsValue({
      operator: row.operator,
      phoneNumber: formatPhone(row.phoneNumber),
      holderName: row.holderName,
      label: row.label ?? '',
      isActive: row.isActive
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
    if (code === 'INVALID_PHONE' || code === 'RECEIVING_NUMBER_DUPLICATE') {
      form.setFields([{ name: 'phoneNumber', errors: [text] }]);
    }
    setFormError({ code, message: text });
  };

  const handleSubmit = async (values: FormValues) => {
    setSaving(true);
    setFormError(null);
    try {
      const label = values.label?.trim() ? values.label.trim() : null;
      if (editing) {
        // Seuls les champs modifiés partent : un opérateur ou un numéro inchangé ne doit pas déclencher le refus « en usage ».
        const body: UpdateReceivingNumberBody = {};
        if (values.operator !== editing.operator) body.operator = values.operator;
        if (values.phoneNumber.trim() !== formatPhone(editing.phoneNumber)) {
          body.phoneNumber = values.phoneNumber.trim();
        }
        if (values.holderName.trim() !== editing.holderName) body.holderName = values.holderName.trim();
        if (label !== editing.label) body.label = label;
        if (values.isActive !== editing.isActive) body.isActive = values.isActive;
        await updateSyndicReceivingNumber(tenantId, syndicId, editing.id, body);
        message.success(t('Numéro de réception modifié'));
      } else {
        const body: CreateReceivingNumberBody = {
          operator: values.operator,
          phoneNumber: values.phoneNumber.trim(),
          holderName: values.holderName.trim(),
          label,
          isActive: values.isActive
        };
        await createSyndicReceivingNumber(tenantId, syndicId, body);
        message.success(t('Numéro de réception ajouté'));
      }
      closeModal();
      await afterWrite();
    } catch (e) {
      handleError(e);
    } finally {
      setSaving(false);
    }
  };

  /** Désactive (ou réactive) un numéro, depuis une ligne ou depuis la fenêtre de modification. */
  const setActive = async (row: ReceivingNumberAdmin, isActive: boolean) => {
    try {
      await updateSyndicReceivingNumber(tenantId, syndicId, row.id, { isActive });
      message.success(isActive ? t('Numéro de réception activé') : t('Numéro de réception désactivé'));
      if (modalOpen) closeModal();
      await afterWrite();
    } catch (e) {
      message.error(apiErrorMessage(e, t('Enregistrement impossible')));
    }
  };

  const handleDelete = async (row: ReceivingNumberAdmin) => {
    try {
      await deleteSyndicReceivingNumber(tenantId, syndicId, row.id);
      message.success(t('Numéro de réception supprimé'));
      await afterWrite();
    } catch (e) {
      if (apiErrorCode(e) === 'RECEIVING_NUMBER_IN_USE') {
        message.error(t('Ce numéro porte des déclarations : désactivez-le plutôt.'));
      } else {
        message.error(apiErrorMessage(e, t('Suppression impossible')));
      }
    }
  };

  const columns: ColumnsType<ReceivingNumberAdmin> = [
    {
      title: t('Opérateur'),
      dataIndex: 'operator',
      key: 'operator',
      render: (op: MobileMoneyOperator) => operatorLabel(op)
    },
    {
      title: t('Numéro'),
      dataIndex: 'phoneNumber',
      key: 'phoneNumber',
      render: (phone: string, row) => (
        <Space direction="vertical" size={2}>
          <Text strong>{formatPhone(phone)}</Text>
          {row.sharedWithCount > 0 ? (
            <Tag color="warning" style={{ whiteSpace: 'normal', marginInlineEnd: 0 }}>
              {t(
                'Ce numéro reçoit aussi les paiements de {{n}} autre(s) copropriété(s) : le rapprochement se fera sur la référence.',
                { n: row.sharedWithCount }
              )}
            </Tag>
          ) : null}
        </Space>
      )
    },
    { title: t('Titulaire'), dataIndex: 'holderName', key: 'holderName' },
    {
      title: t('Libellé'),
      dataIndex: 'label',
      key: 'label',
      render: (label: string | null) => label || '—'
    },
    {
      title: t('Compte de trésorerie'),
      key: 'treasury',
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0}>
          <Text>{row.treasuryAccountNumber}</Text>
          <Text type="secondary">
            <MoneyValue value={row.treasuryBalance} />
          </Text>
        </Space>
      )
    },
    {
      title: t('En attente'),
      dataIndex: 'pendingDeclarations',
      key: 'pendingDeclarations',
      align: 'end',
      render: (n: number) => n
    },
    {
      title: t('État'),
      dataIndex: 'isActive',
      key: 'isActive',
      render: (active: boolean) => (active ? <Tag color="success">{t('Actif')}</Tag> : <Tag>{t('Inactif')}</Tag>)
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
          {row.isActive ? (
            <Popconfirm
              title={t('Désactiver ce numéro ?')}
              description={t(
                'Il ne sera plus proposé aux copropriétaires. Les déclarations déjà en attente restent validables.'
              )}
              okText={t('Désactiver')}
              cancelText={t('Annuler')}
              onConfirm={() => setActive(row, false)}
            >
              <Button size="small">{t('Désactiver')}</Button>
            </Popconfirm>
          ) : (
            <Button size="small" onClick={() => void setActive(row, true)}>
              {t('Activer')}
            </Button>
          )}
          <Popconfirm
            title={t('Supprimer ce numéro ?')}
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
          'Les copropriétaires envoient leur paiement à l’un de ces numéros puis le déclarent sur le portail. Chaque numéro est suivi sur son propre compte de trésorerie.'
        )}
      </Paragraph>
      <Table<ReceivingNumberAdmin>
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
        {formError && formError.code === 'RECEIVING_NUMBER_IN_USE' && editing ? (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={formError.message}
            description={t('Désactivez ce numéro plutôt que de le modifier, puis ajoutez le nouveau numéro.')}
            action={
              editing.isActive ? (
                <Button size="small" onClick={() => void setActive(editing, false)}>
                  {t('Désactiver ce numéro')}
                </Button>
              ) : null
            }
          />
        ) : formError && formError.code !== 'INVALID_PHONE' && formError.code !== 'RECEIVING_NUMBER_DUPLICATE' ? (
          <Alert type="error" showIcon style={{ marginBottom: 16 }} message={formError.message} />
        ) : null}
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            label={t('Opérateur')}
            name="operator"
            rules={[{ required: true, message: t('L’opérateur est requis') }]}
          >
            <Select options={OPERATOR_OPTIONS} />
          </Form.Item>
          <Form.Item
            label={t('Numéro de téléphone')}
            name="phoneNumber"
            extra={t('Par exemple 07 07 07 07 07')}
            rules={[{ required: true, whitespace: true, message: t('Le numéro est requis') }]}
          >
            <Input inputMode="tel" autoComplete="off" maxLength={30} />
          </Form.Item>
          <Form.Item
            label={t('Titulaire du compte')}
            name="holderName"
            rules={[
              { required: true, whitespace: true, message: t('Le titulaire est requis') },
              { min: 2, max: 80, message: t('Le titulaire doit comporter de 2 à 80 caractères') }
            ]}
          >
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item
            label={t('Libellé (facultatif)')}
            name="label"
            rules={[{ max: 60, message: t('60 caractères au plus') }]}
          >
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item label={t('Actif')} name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ReceivingNumbersCard;
