import React, { useEffect, useRef, useState } from 'react';
import { Alert, App, Descriptions, Form, Input, InputNumber, Modal, Select, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import type { IbanCheckDto, MandateDto } from '../../../services/direct-debit-service';
import { checkSyndicIban, createSyndicMandate, listLotDebtors } from '../../../services/syndic-direct-debit-service';
import { apiErrorMessage } from '../../rental/direct-debit/direct-debit-shared';
import { SYNDIC_DD_KEYS } from './keys';
import { STALE_TIME } from '../../../lib/query-keys';
import { t } from '../../../i18n/t';

const { Text } = Typography;

export interface LotOption {
  id: string;
  label: string;
}

interface FormValues {
  lotId: string;
  debtorContactId: string;
  iban: string;
  holderName: string;
  maxAmount?: number | null;
  collectionDay?: number | null;
  notes?: string;
}

interface SyndicMandateFormModalProps {
  tenantId: string;
  syndicId: string;
  open: boolean;
  lots: LotOption[];
  onClose: () => void;
  /** Appelé avec le mandat créé et les avertissements de l'API. */
  onCreated: (mandate: MandateDto, warnings: string[]) => void;
}

const IBAN_DEBOUNCE_MS = 400;

/**
 * Création d'un mandat de prélèvement pour un lot (spec 042, P4, §9.6) : lot,
 * puis copropriétaire du lot, puis IBAN ou RIB contrôlé. Comme en locatif,
 * l'IBAN saisi ne quitte pas ce composant et le formulaire est vidé à la
 * fermeture.
 */
export const SyndicMandateFormModal: React.FC<SyndicMandateFormModalProps> = ({
  tenantId,
  syndicId,
  open,
  lots,
  onClose,
  onCreated
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [lotId, setLotId] = useState<string | undefined>();
  const [debtorId, setDebtorId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [check, setCheck] = useState<IbanCheckDto | null>(null);
  const [checking, setChecking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  const { data: debtors = [], isFetching: debtorsLoading } = useQuery({
    queryKey: SYNDIC_DD_KEYS.debtors(tenantId, syndicId, lotId ?? ''),
    queryFn: () => listLotDebtors(tenantId, syndicId, lotId as string),
    enabled: open && Boolean(lotId),
    staleTime: STALE_TIME.list
  });

  const debtor = debtors.find(item => item.contactId === debtorId);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  // Un lot n'a qu'un copropriétaire : on le propose d'emblée.
  useEffect(() => {
    if (debtors.length === 1 && !debtorId) {
      setDebtorId(debtors[0].contactId);
      form.setFieldsValue({ debtorContactId: debtors[0].contactId, holderName: debtors[0].displayName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debtors]);

  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    requestSeq.current += 1;
    form.resetFields();
    setLotId(undefined);
    setDebtorId(undefined);
    setCheck(null);
    setChecking(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleLotChange = (value: string) => {
    setLotId(value);
    setDebtorId(undefined);
    form.setFieldsValue({ debtorContactId: undefined, holderName: undefined });
  };

  const handleDebtorChange = (value: string) => {
    setDebtorId(value);
    const selected = debtors.find(item => item.contactId === value);
    // Le titulaire du compte est, le plus souvent, le copropriétaire lui-même.
    if (selected && !form.getFieldValue('holderName')) form.setFieldsValue({ holderName: selected.displayName });
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
        const result = await checkSyndicIban(tenantId, syndicId, value);
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
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    if (check && !check.valid) return;
    setSaving(true);
    try {
      const result = await createSyndicMandate(tenantId, syndicId, {
        lotId: values.lotId,
        debtorContactId: values.debtorContactId,
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

  const stepTwoReady = Boolean(debtorId);

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
      <Form form={form} name="syndicMandate" layout="vertical" autoComplete="off">
        <Form.Item name="lotId" label={t('Lot')} rules={[{ required: true, message: t('Choisissez un lot') }]}>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={t('Choisir un lot')}
            options={lots.map(lot => ({ value: lot.id, label: lot.label }))}
            onChange={handleLotChange}
            notFoundContent={t('Aucun lot')}
          />
        </Form.Item>
        <Form.Item
          name="debtorContactId"
          label={t('Copropriétaire à prélever')}
          rules={[{ required: true, message: t('Choisissez le copropriétaire') }]}
          extra={
            debtor && !debtor.hasEmail ? (
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 4 }}
                message={t(
                  "Ce copropriétaire n'a pas d'adresse e-mail : l'avis de prélèvement ne pourra pas lui être envoyé."
                )}
              />
            ) : undefined
          }
        >
          <Select
            disabled={!lotId}
            loading={debtorsLoading}
            placeholder={lotId ? t('Choisir le copropriétaire') : t("Choisissez d'abord un lot")}
            options={debtors.map(item => ({
              value: item.contactId,
              label: item.hasEmail ? item.displayName : `${item.displayName} — ${t('sans e-mail')}`
            }))}
            onChange={handleDebtorChange}
            notFoundContent={t('Aucun copropriétaire pour ce lot')}
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
            disabled={!stepTwoReady}
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
          <Input autoComplete="off" disabled={!stepTwoReady} />
        </Form.Item>
        <Form.Item name="maxAmount" label={t('Plafond par prélèvement (FCFA), facultatif')}>
          <InputNumber min={1} style={{ width: '100%' }} disabled={!stepTwoReady} />
        </Form.Item>
        <Form.Item name="collectionDay" label={t('Jour de collecte (1 à 28), facultatif')}>
          <InputNumber min={1} max={28} precision={0} style={{ width: '100%' }} disabled={!stepTwoReady} />
        </Form.Item>
        <Form.Item name="notes" label={t('Notes')}>
          <Input.TextArea rows={2} disabled={!stepTwoReady} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
