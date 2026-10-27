import React, { useEffect, useRef, useState } from 'react';
import { Alert, App, Descriptions, Form, Input, InputNumber, Modal, Select, Typography } from 'antd';
import {
  checkIban,
  createMandate,
  CreditorDto,
  IbanCheckDto,
  MandateDto
} from '../../../services/direct-debit-service';
import { apiErrorMessage } from './direct-debit-shared';
import { t } from '../../../i18n/t';

const { Text } = Typography;

export interface DebtorOption {
  /** Identifiant du client locataire (`TenantClient`). */
  id: string;
  label: string;
}

interface MandateFormValues {
  creditorId: string;
  debtorClientId: string;
  iban: string;
  holderName: string;
  maxAmount?: number | null;
  collectionDay?: number | null;
  notes?: string;
}

interface MandateFormModalProps {
  tenantId: string;
  leaseId: string;
  open: boolean;
  creditors: CreditorDto[];
  debtors: DebtorOption[];
  onClose: () => void;
  /** Appelé avec le mandat créé et les avertissements de l'API. */
  onCreated: (mandate: MandateDto, warnings: string[]) => void;
}

const IBAN_DEBOUNCE_MS = 400;

/**
 * Création d'un mandat de prélèvement pour un bail (spec 042, PB2).
 *
 * L'IBAN ou le RIB saisi est contrôlé à la volée (`POST /iban-check`) mais ne
 * quitte jamais ce composant : le formulaire est vidé à la fermeture et le
 * résultat n'affiche que le masque et le code banque renvoyés par l'API.
 */
export const MandateFormModal: React.FC<MandateFormModalProps> = ({
  tenantId,
  leaseId,
  open,
  creditors,
  debtors,
  onClose,
  onCreated
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<MandateFormValues>();
  const [saving, setSaving] = useState(false);
  const [check, setCheck] = useState<IbanCheckDto | null>(null);
  const [checking, setChecking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  const activeCreditors = creditors.filter(creditor => creditor.isActive);

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      creditorId: activeCreditors.length === 1 ? activeCreditors[0].id : undefined,
      debtorClientId: debtors.length === 1 ? debtors[0].id : undefined
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    requestSeq.current += 1;
    form.resetFields();
    setCheck(null);
    setChecking(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleIbanChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (timer.current) clearTimeout(timer.current);
    requestSeq.current += 1;
    const seq = requestSeq.current;
    if (!value.trim()) {
      setCheck(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    timer.current = setTimeout(async () => {
      try {
        const result = await checkIban(tenantId, value);
        if (seq === requestSeq.current) setCheck(result);
      } catch (error) {
        if (seq === requestSeq.current) {
          setCheck({
            valid: false,
            ibanMasked: null,
            bankCode: null,
            error: apiErrorMessage(error, t("Impossible de vérifier l'IBAN pour le moment")),
            warnings: []
          });
        }
      } finally {
        if (seq === requestSeq.current) setChecking(false);
      }
    }, IBAN_DEBOUNCE_MS);
  };

  const handleOk = async () => {
    let values: MandateFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    if (check && !check.valid) return;
    setSaving(true);
    try {
      const result = await createMandate(tenantId, {
        creditorId: values.creditorId,
        leaseId,
        debtorClientId: values.debtorClientId,
        iban: values.iban,
        holderName: values.holderName.trim(),
        ...(values.maxAmount != null ? { maxAmount: values.maxAmount } : {}),
        ...(values.collectionDay != null ? { collectionDay: values.collectionDay } : {}),
        ...(values.notes?.trim() ? { notes: values.notes.trim() } : {})
      });
      // L'IBAN saisi disparaît dès l'envoi réussi.
      reset();
      message.success(t('Mandat créé'));
      onCreated(result.mandate, result.warnings ?? []);
    } catch (error) {
      message.error(apiErrorMessage(error, t('Erreur lors de la création du mandat')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('Nouveau mandat de prélèvement')}
      okText={t('Créer le mandat de prélèvement')}
      cancelText={t('Annuler')}
      onOk={() => void handleOk()}
      onCancel={handleClose}
      okButtonProps={{ loading: saving, disabled: Boolean(check && !check.valid) }}
      destroyOnHidden
      forceRender
    >
      {activeCreditors.length === 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('Aucun créancier actif : créez-en un dans Paramètres financiers, carte « Prélèvement bancaire ».')}
        />
      )}
      <Form form={form} layout="vertical" autoComplete="off">
        <Form.Item
          name="creditorId"
          label={t('Créancier')}
          rules={[{ required: true, message: t('Choisissez un créancier') }]}
        >
          <Select
            options={activeCreditors.map(creditor => ({ value: creditor.id, label: creditor.label }))}
            placeholder={t('Choisir un créancier')}
          />
        </Form.Item>
        <Form.Item
          name="debtorClientId"
          label={t('Débiteur')}
          rules={[{ required: true, message: t('Choisissez le débiteur') }]}
        >
          <Select
            options={debtors.map(debtor => ({ value: debtor.id, label: debtor.label }))}
            placeholder={t('Locataire principal ou colocataire')}
          />
        </Form.Item>
        <Form.Item
          name="iban"
          label={t('IBAN ou RIB')}
          rules={[{ required: true, whitespace: true, message: t("Saisissez l'IBAN ou le RIB") }]}
          extra={
            <>
              {checking && <Text type="secondary">{t('Vérification en cours…')}</Text>}
              {!checking && check && !check.valid && check.error && <Text type="danger">{check.error}</Text>}
              {!checking && check?.valid && (
                <Descriptions size="small" column={1} style={{ marginTop: 4 }}>
                  <Descriptions.Item label={t('IBAN')}>
                    <bdi dir="ltr">{check.ibanMasked}</bdi>
                  </Descriptions.Item>
                  <Descriptions.Item label={t('Code banque')}>{check.bankCode}</Descriptions.Item>
                </Descriptions>
              )}
              {!checking &&
                (check?.warnings ?? []).map(warning => (
                  <Alert key={warning} type="warning" showIcon message={warning} style={{ marginTop: 4 }} />
                ))}
            </>
          }
        >
          <Input
            dir="ltr"
            style={{ textAlign: 'start' }}
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            onChange={handleIbanChange}
            placeholder={t('CI93 CI000 01234 012345678901 05')}
          />
        </Form.Item>
        <Form.Item
          name="holderName"
          label={t('Titulaire du compte')}
          rules={[{ required: true, whitespace: true, message: t('Saisissez le titulaire du compte') }]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item name="maxAmount" label={t('Plafond par prélèvement (FCFA), facultatif')}>
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="collectionDay" label={t('Jour de collecte (1 à 28), facultatif')}>
          <InputNumber min={1} max={28} precision={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="notes" label={t('Notes')}>
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
