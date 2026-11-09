import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Tag,
  Typography
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { t } from '../../i18n/t';
import {
  RECEIVING_ACCOUNT_LIMIT,
  RECEIVING_ACCOUNT_QR_ACCEPTED_TYPES,
  RECEIVING_ACCOUNT_QR_MAX_BYTES,
  createReceivingAccount,
  deleteReceivingAccount,
  listReceivingAccounts,
  updateReceivingAccount,
  type ReceivingAccountAdmin,
  type ReceivingAccountInput,
  type ReceivingAccountScope
} from '../../services/receiving-account-service';
import { ReceivingAccountQr } from './ReceivingAccountQr';

const { Text, Paragraph } = Typography;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

interface FormValues {
  institution: string;
  scannableWith?: string;
  alias?: string;
  holderName: string;
  instructions?: string;
  isActive: boolean;
  sortOrder: number;
}

export interface ReceivingAccountsManagerCardProps {
  scope: ReceivingAccountScope;
  /** Faux : lecture seule, aucun bouton d'écriture. */
  canEdit?: boolean;
  title?: string;
  description?: string;
}

function apiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { message?: string; error?: string } } })?.response?.data;
  return data?.message || data?.error || fallback;
}

/** Message d'erreur d'une image refusée avant envoi, `null` si elle convient. */
function qrFileProblem(file: File): string | null {
  if (!RECEIVING_ACCOUNT_QR_ACCEPTED_TYPES.includes(file.type)) {
    return t('Le QR doit être une image PNG, JPEG ou WebP.');
  }
  if (file.size > RECEIVING_ACCOUNT_QR_MAX_BYTES) return t('Le QR ne doit pas dépasser 2 Mo.');
  return null;
}

/**
 * Comptes de réception de l'agence (loyers) ou d'une copropriété (spec 048,
 * lot Q) : liste, ajout, modification, ordre, activation, suppression et
 * aperçu du QR. ImmoTopia ne génère ni ne modifie le QR téléversé.
 */
export const ReceivingAccountsManagerCard: React.FC<ReceivingAccountsManagerCardProps> = ({
  scope,
  canEdit = true,
  title,
  description
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [items, setItems] = useState<ReceivingAccountAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReceivingAccountAdmin | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [removeQr, setRemoveQr] = useState(false);

  const scopeKey = scope.kind === 'agency' ? scope.tenantId : `${scope.tenantId}/${scope.syndicId}`;

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setLoadError(null);
      try {
        setItems(await listReceivingAccounts(scope));
      } catch (e) {
        setLoadError(apiErrorMessage(e, t('Erreur lors du chargement des informations')));
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopeKey]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const resetQr = () => {
    setQrFile(null);
    setRemoveQr(false);
  };

  const openCreate = () => {
    setEditing(null);
    setFormError(null);
    resetQr();
    setModalOpen(true);
    form.setFieldsValue({
      institution: '',
      scannableWith: '',
      alias: '',
      holderName: '',
      instructions: '',
      isActive: true,
      sortOrder: items.length
    });
  };

  const openEdit = (row: ReceivingAccountAdmin) => {
    setEditing(row);
    setFormError(null);
    resetQr();
    setModalOpen(true);
    form.setFieldsValue({
      institution: row.institution,
      scannableWith: row.scannableWith ?? '',
      alias: row.alias ?? '',
      holderName: row.holderName,
      instructions: row.instructions ?? '',
      isActive: row.isActive,
      sortOrder: row.sortOrder
    });
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
    resetQr();
  };

  const onPickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    const problem = qrFileProblem(file);
    if (problem) {
      setQrFile(null);
      setFormError(problem);
      return;
    }
    setFormError(null);
    setQrFile(file);
    setRemoveQr(false);
  };

  const hasQrAfterSave = Boolean(qrFile) || Boolean(editing?.hasQr && !removeQr);

  const handleSubmit = async (values: FormValues) => {
    const alias = values.alias?.trim() ? values.alias.trim() : null;
    if (values.isActive && !alias && !hasQrAfterSave) {
      setFormError(t('Un compte actif doit avoir au moins un alias ou un QR.'));
      return;
    }
    const input: ReceivingAccountInput = {
      institution: values.institution.trim(),
      scannableWith: values.scannableWith?.trim() ? values.scannableWith.trim() : null,
      alias,
      holderName: values.holderName.trim(),
      instructions: values.instructions?.trim() ? values.instructions.trim() : null,
      isActive: values.isActive,
      sortOrder: values.sortOrder ?? 0
    };
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updateReceivingAccount(scope, editing.id, input, { qrFile, removeQr });
        message.success(t('Compte de réception modifié'));
      } else {
        await createReceivingAccount(scope, input, { qrFile });
        message.success(t('Compte de réception ajouté'));
      }
      closeModal();
      await load(true);
    } catch (e) {
      setFormError(apiErrorMessage(e, t('Enregistrement impossible')));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: ReceivingAccountAdmin) => {
    try {
      await deleteReceivingAccount(scope, row.id);
      message.success(t('Compte de réception supprimé'));
      await load(true);
    } catch (e) {
      message.error(apiErrorMessage(e, t('Suppression impossible')));
    }
  };

  const toggleActive = async (row: ReceivingAccountAdmin, isActive: boolean) => {
    try {
      await updateReceivingAccount(
        scope,
        row.id,
        {
          institution: row.institution,
          scannableWith: row.scannableWith,
          alias: row.alias,
          holderName: row.holderName,
          instructions: row.instructions,
          isActive,
          sortOrder: row.sortOrder
        },
        { removeQr: false }
      );
      message.success(isActive ? t('Compte de réception activé') : t('Compte de réception désactivé'));
      await load(true);
    } catch (e) {
      message.error(apiErrorMessage(e, t('Enregistrement impossible')));
    }
  };

  const heading = title ?? t('Comptes de réception');
  const intro =
    description ??
    t(
      'Ces coordonnées sont montrées à vos payeurs sur leur portail. ImmoTopia ne génère aucun QR et ne préremplit aucun montant : le payeur le saisit lui-même.'
    );

  if (loadError && items.length === 0) {
    return (
      <Card title={heading}>
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

  const atLimit = items.length >= RECEIVING_ACCOUNT_LIMIT;

  return (
    <Card
      title={heading}
      loading={loading}
      extra={
        canEdit ? (
          <Button type="primary" icon={<PlusOutlined />} disabled={atLimit} onClick={openCreate}>
            {t('Ajouter un compte')}
          </Button>
        ) : null
      }
    >
      <Paragraph type="secondary">{intro}</Paragraph>
      {atLimit ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('Limite de {{n}} comptes atteinte.', { n: RECEIVING_ACCOUNT_LIMIT })}
        />
      ) : null}
      {items.length === 0 ? (
        <Text type="secondary">{t('Aucun compte de réception pour le moment.')}</Text>
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {items.map(row => (
            <div
              key={row.id}
              role="group"
              aria-label={row.institution}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 16,
                border: '1px solid var(--ant-color-border-secondary, #f0f0f0)',
                borderRadius: 8,
                padding: 12
              }}
            >
              {row.hasQr && row.qrPath ? (
                <ReceivingAccountQr qrPath={row.qrPath} institution={row.institution} size={96} />
              ) : null}
              <Space direction="vertical" size={2} style={{ flex: 1, minWidth: 200 }}>
                <Space wrap>
                  <Text strong>{row.institution}</Text>
                  {row.isActive ? <Tag color="success">{t('Actif')}</Tag> : <Tag>{t('Inactif')}</Tag>}
                  <Text type="secondary">{t('Ordre {{n}}', { n: row.sortOrder })}</Text>
                </Space>
                {row.scannableWith ? (
                  <Text type="secondary">{t('À scanner avec : {{apps}}', { apps: row.scannableWith })}</Text>
                ) : null}
                {row.alias ? (
                  <Text dir="ltr" style={{ overflowWrap: 'anywhere' }}>
                    {row.alias}
                  </Text>
                ) : null}
                <Text>
                  {t('Nom attendu du bénéficiaire')} : {row.holderName}
                </Text>
                {row.instructions ? (
                  <Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
                    {row.instructions}
                  </Text>
                ) : null}
              </Space>
              {canEdit ? (
                <Space wrap size={4} align="start">
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
                    {t('Modifier')}
                  </Button>
                  {row.isActive ? (
                    <Popconfirm
                      title={t('Désactiver ce compte ?')}
                      description={t('Il ne sera plus montré aux payeurs.')}
                      okText={t('Désactiver')}
                      cancelText={t('Annuler')}
                      onConfirm={() => toggleActive(row, false)}
                    >
                      <Button size="small">{t('Désactiver')}</Button>
                    </Popconfirm>
                  ) : (
                    <Button size="small" onClick={() => void toggleActive(row, true)}>
                      {t('Activer')}
                    </Button>
                  )}
                  <Popconfirm
                    title={t('Supprimer ce compte ?')}
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
              ) : null}
            </div>
          ))}
        </Space>
      )}

      <Modal
        open={modalOpen}
        title={editing ? t('Modifier le compte de réception') : t('Ajouter un compte de réception')}
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
            label={t('Établissement')}
            name="institution"
            extra={t('Par exemple Wave, Orange Money ou le nom de la banque')}
            rules={[
              { required: true, whitespace: true, message: t("L'établissement est requis") },
              { max: 60, message: t('60 caractères au plus') }
            ]}
          >
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item
            label={t('Scannable avec (facultatif)')}
            name="scannableWith"
            rules={[{ max: 80, message: t('80 caractères au plus') }]}
          >
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item
            label={t('Alias (facultatif)')}
            name="alias"
            rules={[
              { max: 80, message: t('80 caractères au plus') },
              {
                validator: (_rule, value?: string) =>
                  value && CONTROL_CHARS.test(value)
                    ? Promise.reject(new Error(t("L'alias ne doit pas contenir de caractère de contrôle")))
                    : Promise.resolve()
              }
            ]}
          >
            <Input maxLength={80} autoComplete="off" dir="ltr" />
          </Form.Item>
          <Form.Item
            label={t('Nom attendu du bénéficiaire')}
            name="holderName"
            rules={[
              { required: true, whitespace: true, message: t('Le nom du bénéficiaire est requis') },
              { min: 2, max: 80, message: t('Le nom doit comporter de 2 à 80 caractères') }
            ]}
          >
            <Input maxLength={80} />
          </Form.Item>
          <Form.Item
            label={t('Instructions (facultatif)')}
            name="instructions"
            rules={[{ max: 500, message: t('500 caractères au plus') }]}
          >
            <Input.TextArea rows={3} maxLength={500} />
          </Form.Item>

          <Form.Item label={t('QR de paiement (facultatif)')} extra={t('Image PNG, JPEG ou WebP, 2 Mo au plus.')}>
            {editing?.hasQr && !removeQr && !qrFile && editing.qrPath ? (
              <div style={{ marginBottom: 8 }}>
                <ReceivingAccountQr qrPath={editing.qrPath} institution={editing.institution} size={120} />
              </div>
            ) : null}
            <input
              type="file"
              accept={RECEIVING_ACCOUNT_QR_ACCEPTED_TYPES.join(',')}
              onChange={onPickFile}
              aria-label={t('Choisir l’image du QR')}
            />
            {qrFile ? (
              <div>
                <Text type="secondary">{qrFile.name}</Text>
              </div>
            ) : null}
            {editing?.hasQr ? (
              <div style={{ marginTop: 8 }}>
                <Switch checked={removeQr} onChange={setRemoveQr} aria-label={t('Retirer le QR actuel')} />{' '}
                <Text>{t('Retirer le QR actuel')}</Text>
              </div>
            ) : null}
          </Form.Item>

          <Form.Item label={t("Ordre d'affichage")} name="sortOrder">
            <InputNumber min={0} max={999} />
          </Form.Item>
          <Form.Item label={t('Actif')} name="isActive" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default ReceivingAccountsManagerCard;
