import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { aliasRule, isConflictError, receivingAccountErrorMessage, trimmedTextRule } from './receiving-account-form';

const { Text, Paragraph } = Typography;

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

/** Message d'erreur d'une image refusée avant envoi, `null` si elle convient. */
function qrFileProblem(file: File): string | null {
  if (!RECEIVING_ACCOUNT_QR_ACCEPTED_TYPES.includes(file.type)) {
    return t('Le QR doit être une image PNG, JPEG ou WebP.');
  }
  if (file.size > RECEIVING_ACCOUNT_QR_MAX_BYTES) return t('Le QR ne doit pas dépasser 2 Mo.');
  return null;
}

/** Champs saisis, espaces retirés ; un champ facultatif vide devient `null`. */
function toInput(values: FormValues): ReceivingAccountInput {
  const optional = (value?: string) => (value?.trim() ? value.trim() : null);
  return {
    institution: values.institution.trim(),
    scannableWith: optional(values.scannableWith),
    alias: optional(values.alias),
    holderName: values.holderName.trim(),
    instructions: optional(values.instructions),
    isActive: values.isActive,
    sortOrder: values.sortOrder ?? 0
  };
}

function formValuesOf(row: ReceivingAccountAdmin): FormValues {
  return {
    institution: row.institution,
    scannableWith: row.scannableWith ?? '',
    alias: row.alias ?? '',
    holderName: row.holderName,
    instructions: row.instructions ?? '',
    isActive: row.isActive,
    sortOrder: row.sortOrder
  };
}

interface AccountRowProps {
  row: ReceivingAccountAdmin;
  canEdit: boolean;
  /** Une requête est en cours sur cette ligne : activation et suppression bloquées. */
  busy: boolean;
  onEdit: () => void;
  onToggle: (isActive: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
}

function AccountRowActions({ row, busy, onEdit, onToggle, onDelete }: Omit<AccountRowProps, 'canEdit'>) {
  return (
    <Space wrap size={4} align="start">
      <Button size="small" icon={<EditOutlined />} onClick={onEdit}>
        {t('Modifier')}
      </Button>
      {row.isActive ? (
        <Popconfirm
          title={t('Désactiver ce compte ?')}
          description={t('Il ne sera plus montré aux payeurs.')}
          okText={t('Désactiver')}
          cancelText={t('Annuler')}
          disabled={busy}
          onConfirm={() => onToggle(false)}
        >
          <Button size="small" disabled={busy}>
            {t('Désactiver')}
          </Button>
        </Popconfirm>
      ) : (
        <Button size="small" disabled={busy} onClick={() => void onToggle(true)}>
          {t('Activer')}
        </Button>
      )}
      <Popconfirm
        title={t('Supprimer ce compte ?')}
        okText={t('Supprimer')}
        okButtonProps={{ danger: true }}
        cancelText={t('Annuler')}
        disabled={busy}
        onConfirm={onDelete}
      >
        <Button size="small" danger icon={<DeleteOutlined />} disabled={busy}>
          {t('Supprimer')}
        </Button>
      </Popconfirm>
    </Space>
  );
}

function AccountRow(props: AccountRowProps) {
  const { row, canEdit } = props;
  return (
    <div
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
        // La clé porte `updatedAt` : une image remplacée garde la même route mais se recharge.
        <ReceivingAccountQr
          key={`${row.id}:${row.updatedAt}`}
          qrPath={row.qrPath}
          version={row.updatedAt}
          institution={row.institution}
          size={96}
        />
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
          <Text dir="ltr" style={{ overflowWrap: 'anywhere', direction: 'ltr', unicodeBidi: 'isolate' }}>
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
      {canEdit ? <AccountRowActions {...props} /> : null}
    </div>
  );
}

function AccountTextFields() {
  return (
    <>
      <Form.Item
        label={t('Établissement')}
        name="institution"
        extra={t('Par exemple Wave, Orange Money ou le nom de la banque')}
        rules={[
          { required: true, whitespace: true, message: t("L'établissement est requis") },
          trimmedTextRule({ min: 1, max: 60, lengthMessage: t('60 caractères au plus') })
        ]}
      >
        <Input maxLength={60} />
      </Form.Item>
      <Form.Item
        label={t('Scannable avec (facultatif)')}
        name="scannableWith"
        rules={[trimmedTextRule({ max: 80, lengthMessage: t('80 caractères au plus') })]}
      >
        <Input maxLength={80} />
      </Form.Item>
      <Form.Item label={t('Alias (facultatif)')} name="alias" rules={[aliasRule]}>
        <Input
          maxLength={80}
          autoComplete="off"
          dir="ltr"
          style={{ direction: 'ltr', unicodeBidi: 'isolate', textAlign: 'start' }}
        />
      </Form.Item>
      <Form.Item
        label={t('Nom attendu du bénéficiaire')}
        name="holderName"
        rules={[
          { required: true, whitespace: true, message: t('Le nom du bénéficiaire est requis') },
          trimmedTextRule({ min: 2, max: 80, lengthMessage: t('Le nom doit comporter de 2 à 80 caractères') })
        ]}
      >
        <Input maxLength={80} />
      </Form.Item>
      <Form.Item
        label={t('Instructions (facultatif)')}
        name="instructions"
        rules={[trimmedTextRule({ max: 500, lengthMessage: t('500 caractères au plus'), allowLines: true })]}
      >
        <Input.TextArea rows={3} maxLength={500} />
      </Form.Item>
    </>
  );
}

interface QrFieldProps {
  editing: ReceivingAccountAdmin | null;
  qrFile: File | null;
  removeQr: boolean;
  onPickFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveQrChange: (value: boolean) => void;
}

function QrField({ editing, qrFile, removeQr, onPickFile, onRemoveQrChange }: QrFieldProps) {
  return (
    <Form.Item label={t('QR de paiement (facultatif)')} extra={t('Image PNG, JPEG ou WebP, 2 Mo au plus.')}>
      {editing?.hasQr && !removeQr && !qrFile && editing.qrPath ? (
        <div style={{ marginBottom: 8 }}>
          <ReceivingAccountQr
            key={`${editing.id}:${editing.updatedAt}`}
            qrPath={editing.qrPath}
            version={editing.updatedAt}
            institution={editing.institution}
            size={120}
          />
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
          <Switch checked={removeQr} onChange={onRemoveQrChange} aria-label={t('Retirer le QR actuel')} />{' '}
          <Text>{t('Retirer le QR actuel')}</Text>
        </div>
      ) : null}
    </Form.Item>
  );
}

interface Banner {
  type: 'warning' | 'error';
  message: string;
}

/**
 * Comptes de réception de l'agence (loyers) ou d'une copropriété (spec 048,
 * lot Q) : liste, ajout, modification, ordre, activation, suppression et
 * aperçu du QR. ImmoTopia ne génère ni ne modifie le QR téléversé.
 *
 * Chaque modification envoie l'`updatedAt` lu : si quelqu'un d'autre a changé
 * le compte entre-temps, l'API refuse (409), le message est affiché et la
 * liste rechargée, plutôt que d'écraser le changement avec des données périmées.
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
  const [banner, setBanner] = useState<Banner | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReceivingAccountAdmin | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [removeQr, setRemoveQr] = useState(false);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const busyRef = useRef(new Set<string>());

  const scopeKey = scope.kind === 'agency' ? scope.tenantId : `${scope.tenantId}/${scope.syndicId}`;

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setLoadError(null);
      try {
        setItems(await listReceivingAccounts(scope));
      } catch (e) {
        setLoadError(receivingAccountErrorMessage(e, t('Erreur lors du chargement des informations')));
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

  const openModal = (row: ReceivingAccountAdmin | null) => {
    setEditing(row);
    setFormError(null);
    resetQr();
    setModalOpen(true);
    form.setFieldsValue(
      row
        ? formValuesOf(row)
        : {
            institution: '',
            scannableWith: '',
            alias: '',
            holderName: '',
            instructions: '',
            isActive: true,
            sortOrder: items.length
          }
    );
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

  /** 409 : message du serveur affiché, liste rechargée (la version lue est périmée). */
  const handleConflict = (error: unknown) => {
    setBanner({
      type: 'warning',
      message: receivingAccountErrorMessage(
        error,
        t('Ce compte a été modifié par quelqu’un d’autre. Rechargez la liste avant de recommencer.')
      )
    });
    void load(true);
  };

  const hasQrAfterSave = Boolean(qrFile) || Boolean(editing?.hasQr && !removeQr);

  const handleSubmit = async (values: FormValues) => {
    const input = toInput(values);
    if (input.isActive && !input.alias && !hasQrAfterSave) {
      setFormError(t('Un compte actif doit avoir au moins un alias ou un QR.'));
      return;
    }
    setSaving(true);
    setFormError(null);
    setBanner(null);
    try {
      if (editing) {
        await updateReceivingAccount(scope, editing.id, input, {
          qrFile,
          removeQr,
          expectedUpdatedAt: editing.updatedAt
        });
        message.success(t('Compte de réception modifié'));
      } else {
        await createReceivingAccount(scope, input, { qrFile });
        message.success(t('Compte de réception ajouté'));
      }
      closeModal();
      await load(true);
    } catch (e) {
      if (isConflictError(e) && editing) {
        closeModal();
        handleConflict(e);
      } else {
        setFormError(receivingAccountErrorMessage(e, t('Enregistrement impossible')));
      }
    } finally {
      setSaving(false);
    }
  };

  /** Une seule requête à la fois par ligne : le double clic ne part pas deux fois. */
  const runOnRow = async (rowId: string, action: () => Promise<void>) => {
    // La référence voit l'envoi en cours même avant le rendu qui désactive les boutons.
    if (busyRef.current.has(rowId)) return;
    busyRef.current.add(rowId);
    setBusyIds(previous => new Set(previous).add(rowId));
    try {
      await action();
    } finally {
      busyRef.current.delete(rowId);
      setBusyIds(previous => {
        const next = new Set(previous);
        next.delete(rowId);
        return next;
      });
    }
  };

  const handleDelete = (row: ReceivingAccountAdmin) =>
    runOnRow(row.id, async () => {
      try {
        await deleteReceivingAccount(scope, row.id);
        message.success(t('Compte de réception supprimé'));
      } catch (e) {
        message.error(receivingAccountErrorMessage(e, t('Suppression impossible')));
        return;
      }
      await load(true);
    });

  // Activer ou désactiver n'envoie QUE `isActive` (avec la version lue) : rien d'autre n'est réécrit.
  const toggleActive = (row: ReceivingAccountAdmin, isActive: boolean) =>
    runOnRow(row.id, async () => {
      try {
        await updateReceivingAccount(
          scope,
          row.id,
          { isActive },
          { removeQr: false, expectedUpdatedAt: row.updatedAt }
        );
        message.success(isActive ? t('Compte de réception activé') : t('Compte de réception désactivé'));
      } catch (e) {
        if (isConflictError(e)) handleConflict(e);
        else message.error(receivingAccountErrorMessage(e, t('Enregistrement impossible')));
        return;
      }
      await load(true);
    });

  const heading = title ?? t('Comptes de réception');
  const intro =
    description ??
    t(
      'Ces coordonnées sont montrées à vos payeurs sur leur portail. ImmoTopia ne génère aucun QR et ne préremplit aucun montant : le payeur le saisit lui-même.'
    );

  const retryButton = (
    <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>
      {t('Réessayer')}
    </Button>
  );

  if (loadError && items.length === 0) {
    return (
      <Card title={heading}>
        <Alert type="error" showIcon message={t('Erreur')} description={loadError} action={retryButton} />
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
          <Button type="primary" icon={<PlusOutlined />} disabled={atLimit} onClick={() => openModal(null)}>
            {t('Ajouter un compte')}
          </Button>
        ) : null
      }
    >
      <Paragraph type="secondary">{intro}</Paragraph>
      {banner ? (
        <Alert
          type={banner.type}
          showIcon
          closable
          onClose={() => setBanner(null)}
          style={{ marginBottom: 12 }}
          message={banner.message}
        />
      ) : null}
      {loadError ? (
        // La liste affichée peut être périmée : le dire, même quand elle n'est pas vide.
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('La liste n’a pas pu être actualisée : elle peut ne pas refléter le dernier enregistrement.')}
          description={loadError}
          action={retryButton}
        />
      ) : null}
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
            <AccountRow
              key={row.id}
              row={row}
              canEdit={canEdit}
              busy={busyIds.has(row.id)}
              onEdit={() => openModal(row)}
              onToggle={isActive => toggleActive(row, isActive)}
              onDelete={() => handleDelete(row)}
            />
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
        {/* `name` préfixe les identifiants des champs (receivingAccountForm_holderName…) : sans lui,
            la page porte deux `id="holderName"` avec la modale des numéros de réception. */}
        <Form name="receivingAccountForm" form={form} layout="vertical" onFinish={handleSubmit}>
          <AccountTextFields />
          <QrField
            editing={editing}
            qrFile={qrFile}
            removeQr={removeQr}
            onPickFile={onPickFile}
            onRemoveQrChange={setRemoveQr}
          />
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
