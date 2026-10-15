import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  createCreditor,
  CreditorDto,
  listCreditors,
  updateCreditor,
  UpdateCreditorInput
} from '../../../services/direct-debit-service';
import { listTreasuryAccounts } from '../../../services/treasury-service';
import { formatMoney } from '../../primitives';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { apiErrorMessage } from './direct-debit-shared';
import { t } from '../../../i18n/t';

interface CreditorFormValues {
  treasuryAccountId?: string;
  label: string;
  creditorIdentifier?: string;
  collectionDay: number;
  prenotificationBusinessDays: number;
  rejectFeeAmount: number;
  maxConsecutiveRejects: number;
}

const DEFAULTS: Pick<
  CreditorFormValues,
  'collectionDay' | 'prenotificationBusinessDays' | 'rejectFeeAmount' | 'maxConsecutiveRejects'
> = {
  collectionDay: 5,
  prenotificationBusinessDays: 5,
  rejectFeeAmount: 0,
  maxConsecutiveRejects: 2
};

interface DirectDebitCreditorsCardProps {
  tenantId: string;
}

/**
 * Carte « Prélèvement bancaire » des paramètres financiers (spec 042, PB1) :
 * les comptes bancaires de l'agence qui reçoivent les prélèvements.
 */
export const DirectDebitCreditorsCard: React.FC<DirectDebitCreditorsCardProps> = ({ tenantId }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<CreditorFormValues>();
  const [creditors, setCreditors] = useState<CreditorDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CreditorDto | null>(null);

  const { data: accounts = [], isPending: accountsLoading } = useQuery({
    queryKey: queryKey('treasury-accounts', tenantId),
    queryFn: () => listTreasuryAccounts(tenantId),
    enabled: Boolean(tenantId) && modalOpen,
    staleTime: STALE_TIME.reference
  });

  // Un créancier par compte (PB1-R3) : on ne propose que les comptes bancaires
  // actifs encore libres.
  const accountOptions = useMemo(() => {
    const used = new Set(creditors.map(creditor => creditor.treasuryAccountId));
    return accounts
      .filter(account => account.kind === 'BANK' && account.isActive && !used.has(account.id))
      .map(account => ({
        value: account.id,
        label: [account.label, account.accountNumber].filter(Boolean).join(' · ')
      }));
  }, [accounts, creditors]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCreditors(await listCreditors(tenantId));
    } catch (err) {
      setError(apiErrorMessage(err, t('Erreur lors du chargement des créanciers')));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue(DEFAULTS);
    setModalOpen(true);
  };

  const openEdit = (creditor: CreditorDto) => {
    setEditing(creditor);
    form.setFieldsValue({
      label: creditor.label,
      creditorIdentifier: creditor.creditorIdentifier ?? '',
      collectionDay: creditor.collectionDay,
      prenotificationBusinessDays: creditor.prenotificationBusinessDays,
      rejectFeeAmount: creditor.rejectFeeAmount,
      maxConsecutiveRejects: creditor.maxConsecutiveRejects
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const replace = (updated: CreditorDto) =>
    setCreditors(previous => previous.map(creditor => (creditor.id === updated.id ? updated : creditor)));

  const handleSubmit = async () => {
    let values: CreditorFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const identifier = values.creditorIdentifier?.trim();
    setSaving(true);
    try {
      if (editing) {
        const input: UpdateCreditorInput = {
          label: values.label.trim(),
          ...(identifier ? { creditorIdentifier: identifier } : {}),
          collectionDay: values.collectionDay,
          prenotificationBusinessDays: values.prenotificationBusinessDays,
          rejectFeeAmount: values.rejectFeeAmount,
          maxConsecutiveRejects: values.maxConsecutiveRejects
        };
        replace(await updateCreditor(tenantId, editing.id, input));
        message.success(t('Créancier mis à jour'));
      } else {
        const created = await createCreditor(tenantId, {
          treasuryAccountId: values.treasuryAccountId as string,
          label: values.label.trim(),
          ...(identifier ? { creditorIdentifier: identifier } : {}),
          collectionDay: values.collectionDay,
          prenotificationBusinessDays: values.prenotificationBusinessDays,
          rejectFeeAmount: values.rejectFeeAmount,
          maxConsecutiveRejects: values.maxConsecutiveRejects
        });
        setCreditors(previous => [...previous, created]);
        message.success(t('Créancier créé'));
      }
      closeModal();
    } catch (err) {
      message.error(apiErrorMessage(err, t("Erreur lors de l'enregistrement du créancier")));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (creditor: CreditorDto, isActive: boolean) => {
    try {
      replace(await updateCreditor(tenantId, creditor.id, { isActive }));
    } catch (err) {
      message.error(apiErrorMessage(err, t('Erreur lors de la mise à jour du créancier')));
    }
  };

  const columns: ColumnsType<CreditorDto> = [
    { title: t('Libellé'), dataIndex: 'label', key: 'label' },
    {
      title: t('Compte de trésorerie'),
      key: 'account',
      render: (_value, creditor) => creditor.treasuryAccountLabel
    },
    { title: t('Banque'), key: 'bank', render: (_value, creditor) => creditor.bankName ?? '—' },
    {
      title: t("Numéro d'émetteur"),
      key: 'identifier',
      render: (_value, creditor) =>
        creditor.creditorIdentifier ?? <Tag color="warning">{t('Convention non signée')}</Tag>
    },
    { title: t('Jour de collecte'), dataIndex: 'collectionDay', key: 'collectionDay' },
    { title: t('Prénotification (jours ouvrés)'), dataIndex: 'prenotificationBusinessDays', key: 'prenotification' },
    {
      title: t('Frais de rejet'),
      key: 'fee',
      render: (_value, creditor) => formatMoney(creditor.rejectFeeAmount)
    },
    { title: t('Seuil de suspension'), dataIndex: 'maxConsecutiveRejects', key: 'threshold' },
    { title: t('Mandats ouverts'), dataIndex: 'openMandateCount', key: 'open' },
    {
      title: t('Actif'),
      key: 'active',
      render: (_value, creditor) => (
        <Switch
          checked={creditor.isActive}
          aria-label={`${t('Actif')} : ${creditor.label}`}
          onChange={checked => void handleToggle(creditor, checked)}
        />
      )
    },
    {
      title: '',
      key: 'actions',
      align: 'end',
      render: (_value, creditor) => (
        <Button size="small" onClick={() => openEdit(creditor)}>
          {t('Modifier')}
        </Button>
      )
    }
  ];

  return (
    <Card
      title={t('Prélèvement bancaire')}
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          {t('Nouveau créancier')}
        </Button>
      }
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Alert
          type="info"
          showIcon
          message={t(
            "Un créancier est le compte bancaire de l'agence qui reçoit les prélèvements. Le numéro d'émetteur est attribué par la banque une fois la convention signée."
          )}
        />
        {error && <Alert type="error" showIcon message={error} />}
        {loading ? (
          <Spin />
        ) : (
          <Table<CreditorDto>
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={creditors}
            pagination={false}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: t('Aucun créancier de prélèvement configuré') }}
          />
        )}
      </Space>

      <Modal
        open={modalOpen}
        title={editing ? t('Modifier le créancier') : t('Nouveau créancier')}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        okButtonProps={{ loading: saving }}
        onOk={() => void handleSubmit()}
        onCancel={closeModal}
        forceRender
      >
        <Form form={form} layout="vertical" autoComplete="off">
          {!editing && (
            <Form.Item
              name="treasuryAccountId"
              label={t('Compte de trésorerie (banque)')}
              rules={[{ required: true, message: t('Choisissez un compte bancaire') }]}
              extra={t('Seuls les comptes de type banque, actifs et pas encore utilisés, sont proposés.')}
            >
              <Select
                loading={accountsLoading}
                options={accountOptions}
                placeholder={t('Choisir un compte bancaire')}
              />
            </Form.Item>
          )}
          <Form.Item
            name="label"
            label={t('Libellé')}
            rules={[{ required: true, whitespace: true, message: t('Le libellé est obligatoire') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="creditorIdentifier"
            label={t("Numéro d'émetteur")}
            rules={[{ max: 32, message: t('32 caractères au plus') }]}
            extra={t("Laissez vide tant que la convention n'est pas signée.")}
          >
            <Input />
          </Form.Item>
          <Form.Item name="collectionDay" label={t('Jour de collecte (1 à 28)')} rules={[{ required: true }]}>
            <InputNumber min={1} max={28} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="prenotificationBusinessDays"
            label={t('Prénotification (jours ouvrés avant le prélèvement)')}
            rules={[{ required: true }]}
          >
            <InputNumber min={0} max={30} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="rejectFeeAmount" label={t('Frais de rejet (FCFA)')} rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="maxConsecutiveRejects"
            label={t('Seuil de suspension (rejets consécutifs)')}
            rules={[{ required: true }]}
          >
            <InputNumber min={1} max={10} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
