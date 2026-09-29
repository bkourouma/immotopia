import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Drawer, Form, Input, InputNumber, Select, Space } from 'antd';
import type { FormInstance } from 'antd';
import {
  createAsset,
  updateAsset,
  type AssetClass,
  type AssetDto,
  type CreateAssetInput,
  type UpdateAssetInput
} from '../../../services/patrimoine-assets-service';
import { listProperties } from '../../../services/property-service';
import { t } from '../../../i18n/t';
import {
  assetClassFields,
  assetClassLabel,
  assetClassOptions,
  buildAssetDetails,
  validateAssetField,
  type AssetFieldSpec
} from './asset-classes';
import { apiErrorMessage, serverFieldErrors, todayIso } from './asset-format';
import { valuationMethodLabel } from '../patrimoine-labels';

const { TextArea } = Input;

export interface AssetFormDrawerProps {
  open: boolean;
  tenantId: string;
  /** Renseigné : modification (classe et bien non modifiables, pas de valorisation initiale). */
  asset?: AssetDto | null;
  /** Biens déjà liés à un actif : écartés du sélecteur. */
  linkedPropertyIds?: string[];
  onClose: () => void;
  onSaved: (asset: AssetDto) => void;
}

interface FormValues {
  assetClass: AssetClass;
  name: string;
  propertyId?: string;
  currency: string;
  exchangeRateToXof?: number | null;
  acquisitionCost?: number | null;
  acquisitionDate?: string;
  details?: Record<string, unknown>;
  notes?: string;
  initialValuation?: {
    valuatedAt?: string;
    estimatedValue?: number | null;
    method?: 'MANUAL' | 'MARKET_ESTIMATE' | 'EXPERT_APPRAISAL';
    source?: string;
  };
}

const CURRENCIES = ['XOF', 'EUR', 'USD'];
const BASE_FIELDS = [
  'assetClass',
  'name',
  'propertyId',
  'currency',
  'exchangeRateToXof',
  'acquisitionCost',
  'acquisitionDate',
  'notes'
];
const VALUATION_FIELDS = ['valuatedAt', 'estimatedValue', 'method', 'source'];

function knownPath(path: string[], assetClass: AssetClass): boolean {
  if (path.length === 1) return BASE_FIELDS.includes(path[0]);
  if (path[0] === 'details') return assetClassFields(assetClass).some(spec => spec.name === path[1]);
  if (path[0] === 'initialValuation') return VALUATION_FIELDS.includes(path[1]);
  return false;
}

/** Reçoit `id`, `value` et `onChange` de `Form.Item` et les transmet au champ réel. */
function DetailInput({ spec, ...props }: { spec: AssetFieldSpec } & Record<string, unknown>) {
  if (spec.type === 'select') return <Select {...props} options={spec.options} allowClear={!spec.required} />;
  if (spec.type === 'date') return <Input {...props} type="date" />;
  if (spec.type === 'text') {
    return <Input {...props} maxLength={spec.maxLength ?? 160} inputMode={spec.pattern ? 'numeric' : undefined} />;
  }
  // Pas de `min`/`max` sur le champ : Ant Design les rabattrait en silence à la
  // sortie du champ, et la saisie invalide ne serait plus signalée à l'utilisateur.
  return <InputNumber {...props} style={{ width: '100%' }} precision={spec.type === 'integer' ? 0 : undefined} />;
}

function ClassFields({ assetClass }: { assetClass: AssetClass }) {
  return (
    <>
      {assetClassFields(assetClass).map(spec => (
        <Form.Item
          key={spec.name}
          name={['details', spec.name]}
          label={spec.label}
          extra={spec.help}
          required={spec.required}
          validateFirst
          rules={[
            {
              validator: (_rule, value) => {
                const message = validateAssetField(spec, value);
                return message ? Promise.reject(new Error(message)) : Promise.resolve();
              }
            }
          ]}
        >
          <DetailInput spec={spec} />
        </Form.Item>
      ))}
    </>
  );
}

function RealEstatePicker({ tenantId, linkedPropertyIds }: { tenantId: string; linkedPropertyIds: string[] }) {
  const [options, setOptions] = useState<Array<{ value: string; label: string }>>([]);
  useEffect(() => {
    let cancelled = false;
    listProperties(tenantId, { limit: 100 })
      .then(response => {
        if (cancelled) return;
        setOptions(
          (response.properties ?? [])
            .filter(property => !linkedPropertyIds.includes(property.id))
            .map(property => ({
              value: property.id,
              label: `${property.internalReference}${property.title ? ` — ${property.title}` : ''}`
            }))
        );
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, linkedPropertyIds]);

  return (
    <Form.Item
      name="propertyId"
      label={t('Bien immobilier')}
      rules={[{ required: true, message: t('Choisissez un bien existant') }]}
      extra={
        <span>
          {t("Aucun bien n'est créé ici.")}{' '}
          <Link to={`/tenant/${tenantId}/properties`}>{t('Ouvrir le module Biens')}</Link>
        </span>
      }
    >
      <Select showSearch optionFilterProp="label" options={options} placeholder={t('Sélectionner un bien')} />
    </Form.Item>
  );
}

function CurrencyFields({ form }: { form: FormInstance<FormValues> }) {
  const currency = Form.useWatch('currency', form);
  return (
    <>
      <Form.Item name="currency" label={t('Devise')} rules={[{ required: true }]}>
        <Select options={CURRENCIES.map(value => ({ value, label: value }))} />
      </Form.Item>
      {currency && currency !== 'XOF' && (
        <Form.Item
          name="exchangeRateToXof"
          label={t('Taux de change vers XOF')}
          extra={t('Nombre de XOF pour une unité de cette devise.')}
          rules={[
            { required: true, message: t('Le taux de change est obligatoire hors XOF') },
            {
              validator: (_rule, value) =>
                value === undefined || value === null || Number(value) > 0
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('Le taux de change doit être supérieur à 0')))
            }
          ]}
        >
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
      )}
    </>
  );
}

function ValuationFields() {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>
        {t('Première valorisation (facultative)')}
      </legend>
      <Form.Item name={['initialValuation', 'estimatedValue']} label={t('Valeur estimée')}>
        <InputNumber style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item name={['initialValuation', 'valuatedAt']} label={t('Date de la valeur')}>
        <Input type="date" />
      </Form.Item>
      <Form.Item name={['initialValuation', 'method']} label={t('Méthode')}>
        <Select
          options={(['MANUAL', 'MARKET_ESTIMATE', 'EXPERT_APPRAISAL'] as const).map(value => ({
            value,
            label: valuationMethodLabel(value)
          }))}
        />
      </Form.Item>
      <Form.Item name={['initialValuation', 'source']} label={t('Source')}>
        <Input maxLength={160} />
      </Form.Item>
    </fieldset>
  );
}

function initialValues(asset?: AssetDto | null): Partial<FormValues> {
  if (!asset) {
    return {
      assetClass: 'OTHER',
      currency: 'XOF',
      details: {},
      initialValuation: { valuatedAt: todayIso(), method: 'MANUAL' }
    };
  }
  return {
    assetClass: asset.assetClass,
    name: asset.name,
    propertyId: asset.propertyId ?? undefined,
    currency: asset.currency,
    exchangeRateToXof: asset.exchangeRateToXof,
    acquisitionCost: asset.acquisitionCost,
    acquisitionDate: asset.acquisitionDate ? asset.acquisitionDate.slice(0, 10) : undefined,
    details: asset.details,
    notes: asset.notes ?? undefined
  };
}

function buildCreatePayload(values: FormValues): CreateAssetInput {
  const payload: CreateAssetInput = {
    name: values.name.trim(),
    assetClass: values.assetClass,
    currency: values.currency,
    details: buildAssetDetails(values.assetClass, values.details ?? {})
  };
  if (values.currency !== 'XOF' && values.exchangeRateToXof) payload.exchangeRateToXof = values.exchangeRateToXof;
  if (typeof values.acquisitionCost === 'number') payload.acquisitionCost = values.acquisitionCost;
  if (values.acquisitionDate) payload.acquisitionDate = values.acquisitionDate;
  if (values.assetClass === 'REAL_ESTATE' && values.propertyId) payload.propertyId = values.propertyId;
  if (values.notes?.trim()) payload.notes = values.notes.trim();
  const valuation = values.initialValuation;
  if (valuation && typeof valuation.estimatedValue === 'number') {
    payload.initialValuation = {
      valuatedAt: valuation.valuatedAt || todayIso(),
      estimatedValue: valuation.estimatedValue,
      method: valuation.method ?? 'MANUAL',
      ...(valuation.source?.trim() ? { source: valuation.source.trim() } : {})
    };
  }
  return payload;
}

function buildUpdatePayload(values: FormValues): UpdateAssetInput {
  return {
    name: values.name.trim(),
    currency: values.currency,
    exchangeRateToXof: values.currency === 'XOF' ? null : (values.exchangeRateToXof ?? null),
    acquisitionCost: typeof values.acquisitionCost === 'number' ? values.acquisitionCost : null,
    acquisitionDate: values.acquisitionDate || null,
    details: buildAssetDetails(values.assetClass, values.details ?? {}),
    notes: values.notes?.trim() || null
  };
}

/**
 * `<AssetFormDrawer>` — création ou modification d'un actif de n'importe
 * quelle classe. Les champs propres à la classe sont générés depuis
 * `asset-classes.ts` ; les erreurs `{ path, message }` du serveur sont
 * reportées sur les champs.
 */
export const AssetFormDrawer: React.FC<AssetFormDrawerProps> = ({
  open,
  tenantId,
  asset,
  linkedPropertyIds,
  onClose,
  onSaved
}) => {
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const assetClass = Form.useWatch('assetClass', form) ?? asset?.assetClass ?? 'OTHER';
  const editing = Boolean(asset);
  const linked = useMemo(() => linkedPropertyIds ?? [], [linkedPropertyIds]);

  useEffect(() => {
    if (!open) return;
    setErrorMessage(null);
    form.resetFields();
    form.setFieldsValue(initialValues(asset));
  }, [open, asset, form]);

  const reportServerError = (error: unknown) => {
    const issues = serverFieldErrors(error);
    const matched = issues.filter(issue => knownPath(issue.path, form.getFieldValue('assetClass')));
    if (matched.length > 0) {
      form.setFields(matched.map(issue => ({ name: issue.path, errors: [issue.message] })));
    }
    const unmatched = issues.filter(issue => !matched.includes(issue));
    const fallback = t("Impossible d'enregistrer cet actif.");
    setErrorMessage(
      unmatched.length > 0
        ? unmatched.map(issue => issue.message).join(' ')
        : matched.length > 0
          ? null
          : apiErrorMessage(error, fallback)
    );
  };

  const handleSubmit = async () => {
    setErrorMessage(null);
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    try {
      const saved =
        asset != null
          ? await updateAsset(tenantId, asset.id, buildUpdatePayload(values))
          : await createAsset(tenantId, buildCreatePayload(values));
      onSaved(saved);
      onClose();
    } catch (error) {
      reportServerError(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      open={open}
      size={520}
      title={editing ? t('Modifier un actif') : t('Ajouter un actif')}
      onClose={onClose}
      destroyOnHidden
      footer={
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button onClick={onClose}>{t('Annuler')}</Button>
          <Button type="primary" loading={submitting} onClick={handleSubmit}>
            {editing ? t('Enregistrer') : t("Créer l'actif")}
          </Button>
        </Space>
      }
    >
      {errorMessage && <Alert type="error" showIcon title={errorMessage} style={{ marginBottom: 'var(--space-3)' }} />}
      <Form form={form} layout="vertical" initialValues={initialValues(asset)}>
        <Form.Item name="assetClass" label={t("Classe d'actif")} rules={[{ required: true }]}>
          <Select disabled={editing} options={assetClassOptions()} onChange={() => form.setFieldValue('details', {})} />
        </Form.Item>
        {editing && asset?.assetClass === 'REAL_ESTATE' && (
          <p>
            {t('Bien lié : {{bien}}', { bien: asset.property?.internalReference ?? assetClassLabel('REAL_ESTATE') })}
          </p>
        )}
        {!editing && assetClass === 'REAL_ESTATE' && (
          <RealEstatePicker tenantId={tenantId} linkedPropertyIds={linked} />
        )}
        <Form.Item
          name="name"
          label={t("Nom de l'actif")}
          rules={[{ required: true, whitespace: true, message: t("Le nom de l'actif est requis") }]}
        >
          <Input maxLength={160} />
        </Form.Item>
        <ClassFields assetClass={assetClass} />
        <CurrencyFields form={form} />
        <Form.Item name="acquisitionCost" label={t("Coût d'acquisition")}>
          <InputNumber style={{ width: '100%' }} min={0} />
        </Form.Item>
        <Form.Item name="acquisitionDate" label={t("Date d'acquisition")}>
          <Input type="date" />
        </Form.Item>
        <Form.Item name="notes" label={t('Notes')}>
          <TextArea rows={3} maxLength={2000} />
        </Form.Item>
        {!editing && <ValuationFields />}
      </Form>
    </Drawer>
  );
};
