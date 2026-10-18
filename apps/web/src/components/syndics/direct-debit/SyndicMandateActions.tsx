import React, { useRef, useState } from 'react';
import { Alert, App, Button, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Space, Tooltip } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { SIGNED_SCAN_MAX_BYTES, SIGNED_SCAN_MIME_TYPES, type MandateDto } from '../../../services/direct-debit-service';
import {
  activateSyndicMandate,
  downloadSyndicAuthorizationPdf,
  downloadSyndicSignedScan,
  reactivateSyndicMandate,
  revokeSyndicMandate,
  suspendSyndicMandate,
  updateSyndicMandate,
  uploadSyndicSignedScan
} from '../../../services/syndic-direct-debit-service';
import { saveBlob } from '../../../utils/save-blob';
import { apiErrorMessage } from '../../rental/direct-debit/direct-debit-shared';
import { t } from '../../../i18n/t';

interface SyndicMandateActionsProps {
  tenantId: string;
  syndicId: string;
  mandate: MandateDto;
  /** Reçoit le mandat à jour renvoyé par l'API. */
  onChanged: (mandate: MandateDto) => void;
  /**
   * Ouvre ou ferme la section « Signature électronique » du brouillon (spec 042 §10.6).
   * Absent : le bouton n'est pas proposé (droit `SYNDIC_DIRECT_DEBIT_MANAGE` manquant).
   */
  onToggleSignature?: (mandate: MandateDto) => void;
}

type Dialog = 'activate' | 'suspend' | 'revoke' | 'edit' | null;

/**
 * Actions d'un mandat de copropriété selon son statut (spec 042, P4, §9.6) :
 * mêmes gestes qu'en locatif. Aucun crochet de permission : un refus de l'API
 * (403) s'affiche en message clair.
 */
export const SyndicMandateActions: React.FC<SyndicMandateActionsProps> = ({
  tenantId,
  syndicId,
  mandate,
  onChanged,
  onToggleSignature
}) => {
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
      const { blob, filename } = await downloadSyndicAuthorizationPdf(
        tenantId,
        syndicId,
        mandate.id,
        `${mandate.reference}.pdf`
      );
      saveBlob(blob, filename);
      message.success(t('Autorisation téléchargée : {{filename}}', { filename }));
    } catch (error) {
      message.error(apiErrorMessage(error, t("Erreur lors du téléchargement de l'autorisation")));
    } finally {
      setBusy(false);
    }
  };

  const handleViewScan = async () => {
    setBusy(true);
    try {
      const { blob, filename } = await downloadSyndicSignedScan(
        tenantId,
        syndicId,
        mandate.id,
        `${mandate.reference}-signe`
      );
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
      () => uploadSyndicSignedScan(tenantId, syndicId, mandate.id, file),
      t('Scan signé déposé'),
      t('Erreur lors du dépôt du scan')
    );
    if (updated) onChanged(updated);
  };

  const handleActivate = async () => {
    if (!signedAt && !mandate.signedAt) return;
    const updated = await run(
      () => activateSyndicMandate(tenantId, syndicId, mandate.id, signedAt ? signedAt.format('YYYY-MM-DD') : undefined),
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
      () => reactivateSyndicMandate(tenantId, syndicId, mandate.id),
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
            () => suspendSyndicMandate(tenantId, syndicId, mandate.id, trimmed),
            t('Mandat suspendu'),
            t('Erreur lors de la suspension du mandat')
          )
        : await run(
            () => revokeSyndicMandate(tenantId, syndicId, mandate.id, trimmed),
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
        updateSyndicMandate(tenantId, syndicId, mandate.id, {
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

  const activateButton = (
    <Button type="primary" size="small" disabled={!mandate.hasSignedScan || busy} onClick={() => setDialog('activate')}>
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
            {onToggleSignature && (
              <Button size="small" onClick={() => onToggleSignature(mandate)} disabled={busy}>
                {t('Signature électronique')}
              </Button>
            )}
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
          <Popconfirm
            title={t('Réactiver ce mandat de prélèvement ?')}
            okText={t('Réactiver')}
            cancelText={t('Annuler')}
            onConfirm={() => void handleReactivate()}
          >
            <Button size="small" disabled={busy}>
              {t('Réactiver')}
            </Button>
          </Popconfirm>
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
        okButtonProps={{ disabled: !signedAt && !mandate.signedAt, loading: busy }}
        destroyOnHidden
      >
        <Form layout="vertical">
          <Form.Item label={t('Date de signature')} required>
            <DatePicker
              style={{ width: '100%' }}
              value={signedAt}
              format="DD/MM/YYYY"
              placeholder={mandate.signedAt ? dayjs(mandate.signedAt).format('DD/MM/YYYY') : undefined}
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
        <Form form={reasonForm} name="syndicMandateReason" layout="vertical">
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
        <Form form={editForm} name="syndicMandateEdit" layout="vertical">
          <Form.Item name="maxAmount" label={t('Plafond par prélèvement (FCFA)')}>
            <InputNumber min={1} style={{ width: '100%' }} />
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
