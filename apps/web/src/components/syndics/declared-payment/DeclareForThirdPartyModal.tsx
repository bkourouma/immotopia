import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Typography, Upload } from 'antd';
import { DeleteOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { formatMoney } from '../../primitives';
import {
  CreateManagerDeclarationInput,
  ReceivingNumberAdmin,
  SyndicDeclarationRow,
  createSyndicDeclaration,
  listSyndicReceivingNumbers
} from '../../../services/syndic-declared-payment-service';
import { listSyndicateLots } from '../../../services/syndic-service';
import { listOpenLotCharges } from '../../../services/syndic-lot-payment-service';
import type { LotOpenChargeCall, SyndicateLot } from '../../../types/syndic-types';
import { formatLotLabel } from '../../../utils/syndic-lot-label';
import { t } from '../../../i18n/t';
import { MAX_DECLARATION_AMOUNT, apiErrorCode, apiErrorMessage, formatPhone, operatorLabel } from './helpers';

const { Text, Paragraph } = Typography;

export const MAX_LINES = 10;
export const MAX_CHARGE_CALLS_PER_LINE = 24;
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
export const PROOF_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_AGE_DAYS = 90;
const REFERENCE_PATTERN = /^[A-Z0-9.-]{4,40}$/;
const COMMENT_MAX = 500;

/** Forme normalisée côté serveur : majuscules, sans espaces (R8). */
export function normalizeReference(value: string | undefined | null): string {
  return (value ?? '').replace(/\s+/g, '').toUpperCase();
}

interface LineValues {
  lotId?: string;
  amount?: number | null;
  chargeCallIds?: string[];
}

interface FormValues {
  coownerId?: string;
  lines: LineValues[];
  receivingNumberId?: string;
  payerPhone?: string;
  paidAt?: Dayjs;
  transactionReference?: string;
  comment?: string;
}

export interface DeclareForThirdPartyModalProps {
  tenantId: string;
  syndicId: string;
  open: boolean;
  onClose: () => void;
  onCreated: (row: SyndicDeclarationRow) => void;
}

/** Codes dont le message s'affiche en tête de la modale (hors champs référence et payeur). */
const FIELD_ERROR_CODES = {
  transactionReference: ['DECLARATION_REFERENCE_USED', 'INVALID_TRANSACTION_REFERENCE'],
  payerPhone: ['INVALID_PHONE']
} as const;

/**
 * Déclaration saisie par le gestionnaire pour le compte d'un copropriétaire
 * (spec 047, parcours P4, contrat §1.11). La déclaration reste `PENDING` : elle
 * ne crédite rien tant que le gestionnaire ne l'a pas validée. Le serveur reste
 * l'autorité sur toutes les règles ; les contrôles d'ici ne servent qu'à guider.
 */
export const DeclareForThirdPartyModal: React.FC<DeclareForThirdPartyModalProps> = ({
  tenantId,
  syndicId,
  open,
  onClose,
  onCreated
}) => {
  const [form] = Form.useForm<FormValues>();
  const [numbers, setNumbers] = useState<ReceivingNumberAdmin[]>([]);
  const [lots, setLots] = useState<SyndicateLot[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [callsByLot, setCallsByLot] = useState<Record<string, LotOpenChargeCall[] | 'loading' | 'error'>>({});
  const [proof, setProof] = useState<File | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const coownerId = Form.useWatch('coownerId', form);
  const watchedLines = Form.useWatch('lines', form);
  const referenceValue = Form.useWatch('transactionReference', form);
  const lines: LineValues[] = useMemo(() => watchedLines ?? [], [watchedLines]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [allNumbers, allLots] = await Promise.all([
        listSyndicReceivingNumbers(tenantId, syndicId),
        listSyndicateLots(tenantId, syndicId)
      ]);
      setNumbers(allNumbers.filter(n => n.isActive));
      setLots(allLots);
    } catch (e) {
      setLoadError(apiErrorMessage(e, t('Impossible de charger les numéros de réception et les lots.')));
    } finally {
      setLoading(false);
    }
  }, [tenantId, syndicId]);

  useEffect(() => {
    if (!open) return;
    // Remise à zéro à chaque ouverture.
    setProof(null);
    setProofError(null);
    setFormError(null);
    setSubmitting(false);
    setCallsByLot({});
    form.resetFields();
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, load]);

  const owners = useMemo(() => {
    const seen = new Map<string, string>();
    for (const lot of lots) {
      for (const owner of lot.owners ?? []) {
        if (!seen.has(owner.contactId)) seen.set(owner.contactId, owner.name);
      }
    }
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [lots]);

  const eligibleLots = useMemo(
    () => (coownerId ? lots.filter(lot => (lot.owners ?? []).some(o => o.contactId === coownerId)) : lots),
    [lots, coownerId]
  );

  const total = lines.reduce((sum, line) => sum + (Number(line?.amount) > 0 ? Number(line.amount) : 0), 0);
  const overMax = total > MAX_DECLARATION_AMOUNT;
  const normalizedReference = normalizeReference(referenceValue);

  const loadCalls = async (lotId: string) => {
    setCallsByLot(prev => ({ ...prev, [lotId]: 'loading' }));
    try {
      const calls = await listOpenLotCharges(tenantId, syndicId, lotId);
      setCallsByLot(prev => ({ ...prev, [lotId]: calls }));
    } catch {
      setCallsByLot(prev => ({ ...prev, [lotId]: 'error' }));
    }
  };

  const onCoownerChange = (value?: string) => {
    // Les lignes dont le lot n'appartient pas au copropriétaire choisi sont retirées.
    const kept = (form.getFieldValue('lines') as LineValues[] | undefined) ?? [];
    const ownedIds = new Set(
      lots.filter(lot => !value || (lot.owners ?? []).some(o => o.contactId === value)).map(lot => lot.id)
    );
    const next = kept.map(line => (line.lotId && !ownedIds.has(line.lotId) ? {} : line));
    form.setFieldValue('lines', next.length ? next : [{}]);
  };

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
    if (overMax || !values.paidAt || !values.receivingNumberId || !values.coownerId) return;
    const body: CreateManagerDeclarationInput = {
      receivingNumberId: values.receivingNumberId,
      payerPhone: (values.payerPhone ?? '').trim(),
      amount: total,
      paidAt: dayjs(values.paidAt).format(),
      transactionReference: normalizeReference(values.transactionReference),
      lines: values.lines.map(line => ({
        lotId: line.lotId as string,
        amount: Number(line.amount),
        chargeCallIds: line.chargeCallIds ?? []
      })),
      comment: values.comment?.trim() ? values.comment.trim() : null,
      declaredForContactId: values.coownerId
    };
    setSubmitting(true);
    setFormError(null);
    try {
      const row = await createSyndicDeclaration(tenantId, syndicId, body, proof ?? undefined);
      onCreated(row);
    } catch (e) {
      const code = apiErrorCode(e);
      const message = apiErrorMessage(e, t('La déclaration n’a pas pu être créée.'));
      if (code && (FIELD_ERROR_CODES.transactionReference as readonly string[]).includes(code)) {
        form.setFields([{ name: 'transactionReference', errors: [message] }]);
      } else if (code && (FIELD_ERROR_CODES.payerPhone as readonly string[]).includes(code)) {
        form.setFields([{ name: 'payerPhone', errors: [message] }]);
      } else {
        setFormError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const callOptions = (lotId?: string) => {
    const entry = lotId ? callsByLot[lotId] : undefined;
    if (!Array.isArray(entry)) return [];
    return entry.map(call => ({
      value: call.id,
      label: `${call.period} · ${t('reste')} ${formatMoney(call.outstanding)}`
    }));
  };

  const hasForm = !loadError;

  return (
    <Modal
      open={open}
      title={t('Déclarer un paiement pour un copropriétaire')}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={t('Créer la déclaration')}
      cancelText={t('Annuler')}
      okButtonProps={{ disabled: !hasForm || loading }}
      confirmLoading={submitting}
      cancelButtonProps={{ disabled: submitting }}
      mask={{ closable: false }}
      width={720}
      style={{ top: 24, maxWidth: 'calc(100vw - 16px)' }}
      forceRender
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title={t('Cette déclaration restera à valider : elle ne crédite rien tant que vous ne l’avez pas validée.')}
      />
      {loadError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title={loadError}
          action={
            <Button size="small" onClick={() => void load()}>
              {t('Réessayer')}
            </Button>
          }
        />
      )}
      {formError && <Alert type="error" showIcon style={{ marginBottom: 16 }} title={formError} />}
      <Form<FormValues>
        form={form}
        layout="vertical"
        onFinish={values => void handleFinish(values)}
        initialValues={{ lines: [{}] }}
        disabled={submitting}
      >
        <Form.Item
          name="coownerId"
          label={t('Copropriétaire')}
          rules={[{ required: true, message: t('Choisissez le copropriétaire.') }]}
        >
          <Select
            showSearch
            allowClear
            loading={loading}
            options={owners}
            optionFilterProp="label"
            placeholder={t('Rechercher un copropriétaire')}
            onChange={value => onCoownerChange(value)}
            disabled={!hasForm}
          />
        </Form.Item>

        <Form.List name="lines">
          {(fields, { add, remove }) => (
            <div style={{ marginBottom: 16 }}>
              <Text strong>{t('Lots concernés')}</Text>
              {fields.map((field, index) => {
                const line = lines[index] ?? {};
                const chosenElsewhere = new Set(
                  lines
                    .filter((_, i) => i !== index)
                    .map(l => l?.lotId)
                    .filter((id): id is string => Boolean(id))
                );
                const lotOptions = eligibleLots
                  .filter(lot => !chosenElsewhere.has(lot.id))
                  .map(lot => ({ value: lot.id, label: formatLotLabel(lot) }));
                const entry = line.lotId ? callsByLot[line.lotId] : undefined;
                return (
                  <div
                    key={field.key}
                    style={{
                      border: '1px solid var(--ant-color-border-secondary, #f0f0f0)',
                      borderRadius: 8,
                      padding: 12,
                      marginTop: 8
                    }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                      <Form.Item
                        name={[field.name, 'lotId']}
                        label={t('Lot')}
                        rules={[{ required: true, message: t('Choisissez un lot.') }]}
                        style={{ flex: '2 1 240px', marginBottom: 12 }}
                      >
                        <Select
                          showSearch
                          options={lotOptions}
                          optionFilterProp="label"
                          placeholder={t('Lot')}
                          onChange={(value: string) => {
                            form.setFieldValue(['lines', field.name, 'chargeCallIds'], []);
                            void loadCalls(value);
                          }}
                          disabled={!hasForm}
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'amount']}
                        label={t('Part du lot (FCFA)')}
                        rules={[
                          { required: true, message: t('Saisissez la part du lot.') },
                          {
                            validator: (_, value) =>
                              value === undefined || value === null || (Number.isInteger(value) && value > 0)
                                ? Promise.resolve()
                                : Promise.reject(new Error(t('Saisissez un montant entier supérieur à 0.')))
                          }
                        ]}
                        style={{ flex: '1 1 160px', marginBottom: 12 }}
                      >
                        <InputNumber<number> min={1} precision={0} style={{ width: '100%' }} inputMode="numeric" />
                      </Form.Item>
                    </div>
                    <Form.Item
                      name={[field.name, 'chargeCallIds']}
                      label={t('Appels visés')}
                      extra={t('Laissez vide pour imputer sur les appels les plus anciens d’abord.')}
                      rules={[
                        {
                          type: 'array',
                          max: MAX_CHARGE_CALLS_PER_LINE,
                          message: t('{{n}} appels au plus par lot.', { n: MAX_CHARGE_CALLS_PER_LINE })
                        }
                      ]}
                      style={{ marginBottom: 8 }}
                    >
                      <Select
                        mode="multiple"
                        options={callOptions(line.lotId)}
                        optionFilterProp="label"
                        maxCount={MAX_CHARGE_CALLS_PER_LINE}
                        loading={entry === 'loading'}
                        disabled={!line.lotId}
                        placeholder={t('Plus anciens d’abord')}
                      />
                    </Form.Item>
                    {entry === 'error' && (
                      <Text type="warning">{t('Les appels ouverts de ce lot n’ont pas pu être chargés.')}</Text>
                    )}
                    {fields.length > 1 && (
                      <div style={{ textAlign: 'end' }}>
                        <Button
                          type="link"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => remove(field.name)}
                          aria-label={t('Retirer ce lot')}
                        >
                          {t('Retirer')}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                style={{ marginTop: 8 }}
                disabled={fields.length >= MAX_LINES || !hasForm}
                onClick={() => add({})}
              >
                {t('Ajouter un lot')}
              </Button>
            </div>
          )}
        </Form.List>

        <Form.Item label={t('Montant total')} style={{ marginBottom: 16 }}>
          <Text strong data-testid="declared-total">
            {formatMoney(total)}
          </Text>
          {overMax && (
            <Paragraph type="danger" style={{ marginBottom: 0 }}>
              {t('Le montant total ne peut pas dépasser {{max}}.', { max: formatMoney(MAX_DECLARATION_AMOUNT) })}
            </Paragraph>
          )}
        </Form.Item>

        <Form.Item
          name="receivingNumberId"
          label={t('Numéro de réception')}
          rules={[{ required: true, message: t('Choisissez le numéro de réception.') }]}
        >
          <Select
            loading={loading}
            placeholder={t('Numéro qui a reçu le transfert')}
            disabled={!hasForm}
            options={numbers.map(n => ({
              value: n.id,
              label: `${operatorLabel(n.operator)} · ${formatPhone(n.phoneNumber)} · ${n.holderName}`
            }))}
          />
        </Form.Item>

        <Form.Item
          name="payerPhone"
          label={t('Numéro du payeur')}
          rules={[{ required: true, whitespace: true, message: t('Saisissez le numéro du payeur.') }]}
        >
          <Input inputMode="tel" autoComplete="off" placeholder="07 07 07 07 07" />
        </Form.Item>

        <Form.Item
          name="paidAt"
          label={t('Date et heure du transfert')}
          rules={[
            { required: true, message: t('Indiquez la date et l’heure du transfert.') },
            {
              validator: (_, value: Dayjs | undefined) => {
                if (!value) return Promise.resolve();
                if (value.isAfter(dayjs())) {
                  return Promise.reject(new Error(t('La date du transfert ne peut pas être dans le futur.')));
                }
                if (value.isBefore(dayjs().subtract(MAX_AGE_DAYS, 'day'))) {
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
              (current.isAfter(dayjs(), 'day') || current.isBefore(dayjs().subtract(MAX_AGE_DAYS, 'day'), 'day'))
            }
          />
        </Form.Item>

        <Form.Item
          name="transactionReference"
          label={t('Référence de transaction')}
          validateFirst
          rules={[
            { required: true, whitespace: true, message: t('Saisissez la référence de transaction.') },
            {
              validator: (_, value: string | undefined) =>
                !value || REFERENCE_PATTERN.test(normalizeReference(value))
                  ? Promise.resolve()
                  : Promise.reject(
                      new Error(t('La référence compte 4 à 40 caractères : lettres, chiffres, point ou tiret.'))
                    )
            }
          ]}
          extra={
            normalizedReference ? (
              <span>
                {t('Référence enregistrée :')} <Text code>{normalizedReference}</Text>
              </span>
            ) : undefined
          }
        >
          <Input autoComplete="off" />
        </Form.Item>

        <Form.Item name="comment" label={t('Commentaire (facultatif)')}>
          <Input.TextArea rows={2} maxLength={COMMENT_MAX} showCount />
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
          <Space orientation="vertical" size={0}>
            <Text type="secondary">{t('JPEG, PNG, WebP ou PDF, 5 Mo au plus.')}</Text>
            {proofError && <Text type="danger">{proofError}</Text>}
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default DeclareForThirdPartyModal;
