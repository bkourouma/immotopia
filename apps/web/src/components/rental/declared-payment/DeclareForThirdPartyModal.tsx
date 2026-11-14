import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Typography,
  Upload
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import {
  createRentalDeclarationForThirdParty,
  listRentalReceivingNumbers
} from '../../../services/rental-declared-payment-service';
import { RentalInstallmentStatus, listInstallments, type RentalInstallment } from '../../../services/rental-service';
import {
  RENTAL_MAX_DECLARATION_AMOUNT,
  RENTAL_PAID_AT_FUTURE_TOLERANCE_MINUTES,
  RENTAL_PAID_AT_MAX_AGE_DAYS,
  type CreateDeclarationForThirdPartyBody,
  type RentalMobileMoneyOperator,
  type RentalPaymentDeclarationDto,
  type RentalReceivingNumberDto
} from '../../../types/rental-declared-payment';
import { LeaseSelectField } from '../LeaseSelectField';
import { t } from '../../../i18n/t';
import { HelpSectionTitle } from '../../../help';
import { NOTE_MAX_LENGTH, apiErrorMessage, formatAmount, formatPhone, operatorLabel, operatorOptions } from './helpers';

const { Text } = Typography;

export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const PROOF_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const REFERENCE_PATTERN = /^[A-Za-z0-9. -]{4,40}$/;

/** Référence sans espaces superflus (le motif accepte espace, point, tiret). */
const cleanReference = (value: string | undefined | null): string => (value ?? '').trim();
/** Le motif est contrôlé après retrait des espaces. */
const referenceForPattern = (value: string | undefined | null): string => (value ?? '').replace(/\s+/g, '');

interface FormValues {
  leaseId?: string;
  installmentId?: string;
  receivingNumberId?: string;
  operator?: RentalMobileMoneyOperator;
  reference?: string;
  amount?: number | null;
  paidAt?: Dayjs;
  payerPhone?: string;
  notes?: string;
}

export interface DeclareForThirdPartyModalProps {
  tenantId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (declaration: RentalPaymentDeclarationDto) => void;
}

/**
 * Déclaration saisie par le gestionnaire pour le compte du locataire d'un bail
 * (contrat §1.6). Elle reste `PENDING` tant qu'elle n'est pas validée. Le
 * serveur reste l'autorité ; les contrôles d'ici ne servent qu'à guider.
 */
export const DeclareForThirdPartyModal: React.FC<DeclareForThirdPartyModalProps> = ({
  tenantId,
  open,
  onClose,
  onCreated
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const [numbers, setNumbers] = useState<RentalReceivingNumberDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [installments, setInstallments] = useState<RentalInstallment[]>([]);
  const [proof, setProof] = useState<File | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);

  const leaseId = Form.useWatch('leaseId', form);

  const loadNumbers = async () => {
    setLoadError(null);
    try {
      setNumbers(await listRentalReceivingNumbers(tenantId, true));
    } catch (e) {
      setLoadError(apiErrorMessage(e, t('Impossible de charger les numéros de réception.')));
    }
  };

  useEffect(() => {
    if (!open) return;
    setProof(null);
    setProofError(null);
    setFormError(null);
    setSubmitting(false);
    setInstallments([]);
    form.resetFields();
    void loadNumbers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tenantId]);

  useEffect(() => {
    setInstallments([]);
    form.setFieldValue('installmentId', undefined);
    if (!open || !leaseId) return;
    let canceled = false;
    listInstallments(tenantId, { leaseId, limit: 100 })
      .then(res => {
        if (canceled) return;
        const unpaid = (res?.data ?? []).filter(
          i => i.status !== RentalInstallmentStatus.PAID && i.status !== RentalInstallmentStatus.DRAFT
        );
        setInstallments(unpaid);
      })
      .catch(() => {
        if (!canceled) setInstallments([]);
      });
    return () => {
      canceled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaseId, open, tenantId]);

  const installmentOptions = useMemo(
    () =>
      installments.map(i => ({
        value: i.id,
        label: `${String(i.period_month).padStart(2, '0')}/${i.period_year} · ${formatAmount(
          Math.max(0, i.amount_rent + i.amount_service + i.amount_other_fees + i.penalty_amount - i.amount_paid)
        )}`
      })),
    [installments]
  );

  const beforeUpload = (file: File): false | string => {
    if (!PROOF_MIME_TYPES.includes(file.type)) {
      setProofError(t('Format non accepté : joignez une image JPEG, PNG, WebP ou un PDF.'));
      return Upload.LIST_IGNORE;
    }
    if (file.size > MAX_PROOF_BYTES) {
      setProofError(t('Capture trop lourde : 5 Mo au plus.'));
      return Upload.LIST_IGNORE;
    }
    setProofError(null);
    setProof(file);
    return false;
  };

  const handleFinish = async (values: FormValues) => {
    if (!values.leaseId || !values.receivingNumberId || !values.operator || !values.paidAt || !values.amount) return;
    const body: CreateDeclarationForThirdPartyBody = {
      leaseId: values.leaseId,
      installmentId: values.installmentId ?? null,
      receivingNumberId: values.receivingNumberId,
      operator: values.operator,
      reference: cleanReference(values.reference),
      amount: Number(values.amount),
      paidAt: dayjs(values.paidAt).format(),
      payerPhone: values.payerPhone?.trim() ? values.payerPhone.trim() : null,
      notes: values.notes?.trim() ? values.notes.trim() : null
    };
    setSubmitting(true);
    setFormError(null);
    try {
      const created = await createRentalDeclarationForThirdParty(tenantId, body, proof ?? undefined);
      onCreated(created);
    } catch (e) {
      const text = apiErrorMessage(e, t('La déclaration n’a pas pu être créée.'));
      setFormError(text);
      void message.error(text);
      window.setTimeout(() => formErrorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }), 0);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={
        <HelpSectionTitle
          title={t('Déclarer un paiement pour un locataire')}
          helpId="locatif.paiements.declarations.tiers"
        />
      }
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={t('Créer la déclaration')}
      cancelText={t('Annuler')}
      okButtonProps={{ disabled: Boolean(loadError) }}
      confirmLoading={submitting}
      cancelButtonProps={{ disabled: submitting }}
      mask={{ closable: false }}
      width={680}
      style={{ top: 24, maxWidth: 'calc(100vw - 16px)' }}
      forceRender
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBlockEnd: 16 }}
        message={t('Cette déclaration restera à valider : elle ne crédite rien tant que vous ne l’avez pas validée.')}
      />
      {loadError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBlockEnd: 16 }}
          message={loadError}
          action={
            <Button size="small" onClick={() => void loadNumbers()}>
              {t('Réessayer')}
            </Button>
          }
        />
      ) : null}
      {formError ? (
        <div ref={formErrorRef}>
          <Alert type="error" showIcon style={{ marginBlockEnd: 16 }} message={formError} />
        </div>
      ) : null}
      <Form<FormValues>
        form={form}
        layout="vertical"
        onFinish={values => void handleFinish(values)}
        disabled={submitting}
      >
        <Form.Item name="leaseId" label={t('Bail')} rules={[{ required: true, message: t('Choisissez le bail.') }]}>
          <LeaseSelectField tenantId={tenantId} />
        </Form.Item>

        <Form.Item name="installmentId" label={t('Échéance (facultative)')}>
          <Select
            allowClear
            disabled={!leaseId}
            options={installmentOptions}
            placeholder={t('Sans échéance')}
            notFoundContent={t('Aucune échéance impayée')}
          />
        </Form.Item>

        <Form.Item
          name="receivingNumberId"
          label={t('Numéro de réception')}
          rules={[{ required: true, message: t('Choisissez le numéro de réception.') }]}
        >
          <Select
            placeholder={t('Numéro qui a reçu le transfert')}
            options={numbers.map(n => ({
              value: n.id,
              label: `${operatorLabel(n.operator)} · ${formatPhone(n.phone)}${n.label ? ` · ${n.label}` : ''}`
            }))}
          />
        </Form.Item>

        <Form.Item
          name="operator"
          label={t('Opérateur')}
          rules={[{ required: true, message: t('Choisissez l’opérateur.') }]}
        >
          <Select placeholder={t('Opérateur')} options={operatorOptions()} />
        </Form.Item>

        <Form.Item
          name="reference"
          label={t('Référence de transaction')}
          validateFirst
          rules={[
            { required: true, whitespace: true, message: t('Saisissez la référence de transaction.') },
            {
              validator: (_, value: string | undefined) =>
                !value || REFERENCE_PATTERN.test(referenceForPattern(value))
                  ? Promise.resolve()
                  : Promise.reject(
                      new Error(t('La référence compte 4 à 40 caractères : lettres, chiffres, point ou tiret.'))
                    )
            }
          ]}
        >
          <Input autoComplete="off" />
        </Form.Item>

        <Form.Item
          name="amount"
          label={t('Montant (FCFA)')}
          rules={[
            { required: true, message: t('Saisissez le montant.') },
            {
              validator: (_, value) =>
                value === undefined ||
                value === null ||
                (Number.isInteger(value) && value >= 1 && value <= RENTAL_MAX_DECLARATION_AMOUNT)
                  ? Promise.resolve()
                  : Promise.reject(
                      new Error(
                        t('Saisissez un montant entier entre 1 et {{max}}.', {
                          max: formatAmount(RENTAL_MAX_DECLARATION_AMOUNT)
                        })
                      )
                    )
            }
          ]}
        >
          <InputNumber<number> min={1} precision={0} style={{ width: '100%' }} inputMode="numeric" />
        </Form.Item>

        <Form.Item
          name="paidAt"
          label={t('Date et heure du transfert')}
          rules={[
            { required: true, message: t('Indiquez la date et l’heure du transfert.') },
            {
              validator: (_, value: Dayjs | undefined) => {
                if (!value) return Promise.resolve();
                if (value.isAfter(dayjs().add(RENTAL_PAID_AT_FUTURE_TOLERANCE_MINUTES, 'minute'))) {
                  return Promise.reject(new Error(t('La date du transfert ne peut pas être dans le futur.')));
                }
                if (value.isBefore(dayjs().subtract(RENTAL_PAID_AT_MAX_AGE_DAYS, 'day'))) {
                  return Promise.reject(new Error(t('Le transfert date de plus de 90 jours.')));
                }
                return Promise.resolve();
              }
            }
          ]}
        >
          <DatePicker
            showTime={{ format: 'HH:mm' }}
            format="DD/MM/YYYY HH:mm"
            style={{ width: '100%' }}
            disabledDate={current =>
              Boolean(current) &&
              (current.isAfter(dayjs(), 'day') ||
                current.isBefore(dayjs().subtract(RENTAL_PAID_AT_MAX_AGE_DAYS, 'day'), 'day'))
            }
          />
        </Form.Item>

        <Form.Item name="payerPhone" label={t('Numéro du payeur (facultatif)')}>
          <Input inputMode="tel" autoComplete="off" placeholder="07 07 07 07 07" />
        </Form.Item>

        <Form.Item name="notes" label={t('Notes (facultatives)')}>
          <Input.TextArea rows={2} maxLength={NOTE_MAX_LENGTH} showCount />
        </Form.Item>

        <Form.Item label={t('Capture du transfert (facultative)')} validateStatus={proofError ? 'error' : undefined}>
          <Upload
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            maxCount={1}
            beforeUpload={beforeUpload}
            fileList={proof ? [{ uid: 'proof', name: proof.name, status: 'done' }] : []}
            onRemove={() => {
              setProof(null);
              setProofError(null);
            }}
          >
            <Button icon={<UploadOutlined />}>{t('Joindre une capture')}</Button>
          </Upload>
          <Space direction="vertical" size={0}>
            <Text type="secondary">{t('JPEG, PNG, WebP ou PDF, 5 Mo au plus.')}</Text>
            {proofError ? <Text type="danger">{proofError}</Text> : null}
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default DeclareForThirdPartyModal;
