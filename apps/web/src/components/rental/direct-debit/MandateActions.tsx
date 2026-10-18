import React, { useRef, useState } from 'react';
import { Alert, App, Button, DatePicker, Form, Input, InputNumber, Modal, Space, Tooltip } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import {
  activateMandate,
  downloadAuthorizationPdf,
  downloadSignedScan,
  MandateDto,
  reactivateMandate,
  revokeMandate,
  SIGNED_SCAN_MAX_BYTES,
  SIGNED_SCAN_MIME_TYPES,
  suspendMandate,
  updateMandate,
  uploadSignedScan
} from '../../../services/direct-debit-service';
import { saveBlob } from '../../../utils/save-blob';
import { apiErrorMessage } from './direct-debit-shared';
import { t } from '../../../i18n/t';

interface MandateActionsProps {
  tenantId: string;
  mandate: MandateDto;
  /** Reçoit le mandat à jour renvoyé par l'API. */
  onChanged: (mandate: MandateDto) => void;
}

type Dialog = 'activate' | 'suspend' | 'revoke' | 'edit' | null;

/**
 * Actions d'un mandat selon son statut (spec 042, PB2). Aucun crochet de
 * permission : un refus de l'API (403) s'affiche en message clair.
 */
export const MandateActions: React.FC<MandateActionsProps> = ({ tenantId, mandate, onChanged }) => {
  const { message } = App.useApp();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [signedAt, setSignedAt] = useState<Dayjs | null>(null);
  const [reasonForm] = Form.useForm<{ reason: string }>();
  const [editForm] = Form.useForm<{ maxAmount: number | null; collectionDay: number | null; notes: string }>();
  const fileInput = useRef<HTMLInputElement | null>(null);

  const isRevoked = mandate.status === 'REVOKED';

  const run = async <T,>(action: () => Promise<T>, success: string, fallback: string): Promise<T | null> => {
    setBusy(true);
    try {
      const result = await action();
      message.success(success);
      return result;
    } catch (error) {
      message.error(apiErrorMessage(error, fallback));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const closeDialog = () => {
    setDialog(null);
    setSignedAt(null);
    reasonForm.resetFields();
    editForm.resetFields();
  };

  const handleAuthorizationPdf = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await downloadAuthorizationPdf(tenantId, mandate.id, `${mandate.reference}.pdf`);
      saveBlob(blob, filename);
      message.success(t('Autorisation téléchargée : {{fichier}}', { fichier: filename }));
    } catch (error) {
      message.error(apiErrorMessage(error, t("Erreur lors du téléchargement de l'autorisation")));
    } finally {
      setBusy(false);
    }
  };

  const handleViewScan = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await downloadSignedScan(tenantId, mandate.id, `${mandate.reference}-signe`);
      saveBlob(blob, filename);
    } catch (error) {
      message.error(apiErrorMessage(error, t('Erreur lors du téléchargement du scan')));
    } finally {
      setBusy(false);
    }
  };

  const handleFileChosen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!SIGNED_SCAN_MIME_TYPES.includes(file.type)) {
      message.error(t('Format non accepté : déposez un PDF, un JPEG ou un PNG.'));
      return;
    }
    if (file.size > SIGNED_SCAN_MAX_BYTES) {
      message.error(t('Le fichier dépasse 10 Mo.'));
      return;
    }
    const updated = await run(
      () => uploadSignedScan(tenantId, mandate.id, file),
      t('Scan signé déposé'),
      t('Erreur lors du dépôt du scan')
    );
    if (updated) onChanged(updated);
  };

  const handleActivate = async () => {
    if (!signedAt) return;
    const updated = await run(
      () => activateMandate(tenantId, mandate.id, signedAt.format('YYYY-MM-DD')),
      t('Mandat activé'),
      t("Erreur lors de l'activation du mandat")
    );
    if (updated) {
      closeDialog();
      onChanged(updated);
    }
  };

  const handleReactivate = async () => {
    const updated = await run(
      () => reactivateMandate(tenantId, mandate.id),
      t('Mandat réactivé'),
      t('Erreur lors de la réactivation du mandat')
    );
    if (updated) onChanged(updated);
  };

  const handleReason = async (kind: 'suspend' | 'revoke') => {
    let reason: string;
    try {
      ({ reason } = await reasonForm.validateFields());
    } catch {
      return;
    }
    const trimmed = reason.trim();
    const updated =
      kind === 'suspend'
        ? await run(
            () => suspendMandate(tenantId, mandate.id, trimmed),
            t('Mandat suspendu'),
            t('Erreur lors de la suspension du mandat')
          )
        : await run(
            () => revokeMandate(tenantId, mandate.id, trimmed),
            t('Mandat révoqué'),
            t('Erreur lors de la révocation du mandat')
          );
    if (updated) {
      closeDialog();
      onChanged(updated);
    }
  };

  const openEdit = () => {
    editForm.setFieldsValue({
      maxAmount: mandate.maxAmount,
      collectionDay: mandate.collectionDay,
      notes: mandate.notes ?? ''
    });
    setDialog('edit');
  };

  const handleEdit = async () => {
    let values: Awaited<ReturnType<typeof editForm.validateFields>>;
    try {
      values = await editForm.validateFields();
    } catch {
      return;
    }
    const updated = await run(
      () =>
        updateMandate(tenantId, mandate.id, {
          maxAmount: values.maxAmount ?? null,
          collectionDay: values.collectionDay ?? null,
          notes: values.notes?.trim() ? values.notes.trim() : null
        }),
      t('Mandat mis à jour'),
      t('Erreur lors de la mise à jour du mandat')
    );
    if (updated) {
      closeDialog();
      onChanged(updated);
    }
  };

  /** La date de signature d'une signature électronique est reprise : l'agence peut la corriger. */
  const openActivate = () => {
    const known = mandate.signedAt ? dayjs(mandate.signedAt) : null;
    setSignedAt(known && known.isValid() ? known : null);
    setDialog('activate');
  };

  const activateButton = (
    <Button type="primary" size="small" disabled={!mandate.hasSignedScan || busy} onClick={openActivate}>
      {t('Activer')}
    </Button>
  );

  return (
    <>
      <Space wrap size={[8, 8]}>
        {mandate.status === 'DRAFT' && (
          <>
            <Button size="small" onClick={() => void handleAuthorizationPdf()} disabled={busy}>
              {t("Télécharger l'autorisation (PDF)")}
            </Button>
            <Button size="small" onClick={() => fileInput.current?.click()} disabled={busy}>
              {mandate.hasSignedScan ? t('Remplacer le scan signé') : t('Déposer le scan signé')}
            </Button>
          </>
        )}
        {mandate.hasSignedScan && (
          <Button size="small" onClick={() => void handleViewScan()} disabled={busy}>
            {t('Voir le scan')}
          </Button>
        )}
        {mandate.status === 'DRAFT' &&
          (mandate.hasSignedScan ? (
            activateButton
          ) : (
            <Tooltip title={t("Déposez d'abord le scan signé pour pouvoir activer le mandat.")}>
              <span>{activateButton}</span>
            </Tooltip>
          ))}
        {mandate.status === 'ACTIVE' && (
          <Button size="small" onClick={() => setDialog('suspend')} disabled={busy}>
            {t('Suspendre')}
          </Button>
        )}
        {mandate.status === 'SUSPENDED' && (
          <Button size="small" onClick={() => void handleReactivate()} disabled={busy}>
            {t('Réactiver')}
          </Button>
        )}
        {!isRevoked && (
          <>
            <Button size="small" onClick={openEdit} disabled={busy}>
              {t('Modifier')}
            </Button>
            <Button size="small" danger onClick={() => setDialog('revoke')} disabled={busy}>
              {t('Révoquer')}
            </Button>
          </>
        )}
      </Space>

      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        style={{ display: 'none' }}
        data-testid="signed-scan-input"
        onChange={event => void handleFileChosen(event)}
      />

      <Modal
        open={dialog === 'activate'}
        title={t('Activer le mandat')}
        okText={t('Activer')}
        cancelText={t('Annuler')}
        onOk={() => void handleActivate()}
        onCancel={closeDialog}
        okButtonProps={{ disabled: !signedAt, loading: busy }}
        destroyOnHidden
      >
        <Form layout="vertical">
          <Form.Item label={t('Date de signature')} required>
            <DatePicker
              style={{ width: '100%' }}
              value={signedAt}
              format="DD/MM/YYYY"
              onChange={value => setSignedAt(value)}
              disabledDate={date => date.isAfter(dayjs(), 'day')}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={dialog === 'suspend' || dialog === 'revoke'}
        title={dialog === 'revoke' ? t('Révoquer le mandat de prélèvement') : t('Suspendre le mandat')}
        okText={dialog === 'revoke' ? t('Révoquer') : t('Suspendre')}
        cancelText={t('Annuler')}
        okButtonProps={{ danger: dialog === 'revoke', loading: busy }}
        onOk={() => void handleReason(dialog === 'revoke' ? 'revoke' : 'suspend')}
        onCancel={closeDialog}
        destroyOnHidden
      >
        {dialog === 'revoke' && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={t('La révocation est définitive : pour prélever à nouveau, il faudra créer un nouveau mandat.')}
          />
        )}
        <Form form={reasonForm} layout="vertical">
          <Form.Item
            name="reason"
            label={t('Motif')}
            rules={[
              { required: true, whitespace: true, message: t('Le motif est obligatoire') },
              { max: 500, message: t('500 caractères au plus') }
            ]}
          >
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={dialog === 'edit'}
        title={t('Modifier le mandat')}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        okButtonProps={{ loading: busy }}
        onOk={() => void handleEdit()}
        onCancel={closeDialog}
        destroyOnHidden
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t("L'IBAN ne se modifie pas : pour changer de compte, révoquez ce mandat puis créez-en un nouveau.")}
        />
        <Form form={editForm} layout="vertical">
          <Form.Item name="maxAmount" label={t('Plafond par prélèvement (FCFA)')}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="collectionDay" label={t('Jour de collecte (1 à 28)')}>
            <InputNumber min={1} max={28} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label={t('Notes')}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
