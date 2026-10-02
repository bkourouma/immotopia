import React, { useEffect, useRef, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Typography } from 'antd';
import { createInsurancePolicy, updateInsurancePolicy } from '../../services/insurance-service';
import { uploadDocument } from '../../services/property-service';
import type { InsuranceCoverageType, InsurancePolicyDto } from '../../types/insurance-types';
import { apiErrorMessage, applyApiFieldErrors } from '../patrimoine/patrimoine-labels';
import { feedback } from '../../lib/feedback';
import { t } from '../../i18n/t';
import { CurrencyField, DEFAULT_CURRENCY, changedCurrency } from './CurrencyField';
import { COVERAGE_VALUES, coverageLabel, currencyLabel, options } from './insurance-labels';

interface Props {
  open: boolean;
  tenantId: string;
  propertyId: string;
  policy: InsurancePolicyDto | null;
  onClose: () => void;
  onSaved: () => void;
}

interface Values {
  insurer: string;
  policyNumber: string;
  coverageType: InsuranceCoverageType;
  startDate: string;
  endDate: string;
  annualPremium?: number | null;
  currency: string;
  notes?: string;
}

const day = (value?: string | null) => (value ? value.slice(0, 10) : '');

const FIELDS = [
  'insurer',
  'policyNumber',
  'coverageType',
  'startDate',
  'endDate',
  'annualPremium',
  'currency',
  'notes'
];

/** Création et modification d'une police d'assurance du bien. */
export const PolicyFormModal: React.FC<Props> = ({ open, tenantId, propertyId, policy, onClose, onSaved }) => {
  const [form] = Form.useForm<Values>();
  const devise = currencyLabel(Form.useWatch('currency', form));
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    form.resetFields();
    if (policy) {
      form.setFieldsValue({
        insurer: policy.insurer,
        policyNumber: policy.policyNumber,
        coverageType: policy.coverageType,
        startDate: day(policy.startDate),
        endDate: day(policy.endDate),
        annualPremium: policy.annualPremium,
        currency: policy.currency,
        notes: policy.notes ?? ''
      });
    } else {
      form.setFieldsValue({ coverageType: 'MULTIRISK_HOME', currency: DEFAULT_CURRENCY });
    }
  }, [open, policy, form]);

  const submit = async (values: Values) => {
    setSaving(true);
    try {
      // Pièce justificative (FR-004) : téléversée dans les documents du bien,
      // puis liée à la police par son identifiant.
      const document = file ? await uploadDocument(tenantId, propertyId, file, 'INSURANCE', undefined, false) : null;
      const payload = {
        insurer: values.insurer.trim(),
        policyNumber: values.policyNumber.trim(),
        coverageType: values.coverageType,
        startDate: values.startDate,
        endDate: values.endDate,
        annualPremium: values.annualPremium ?? null,
        notes: values.notes?.trim() || null,
        ...(document?.id ? { documentId: document.id as string } : {})
      };
      // PATCH : la devise n'est envoyée que si elle a changé (409 si la police a des sinistres).
      if (policy) {
        await updateInsurancePolicy(tenantId, policy.id, {
          ...payload,
          ...changedCurrency(values.currency, policy.currency)
        });
      } else {
        await createInsurancePolicy(tenantId, {
          ...payload,
          currency: values.currency || DEFAULT_CURRENCY,
          propertyId
        });
      }
      feedback.success(policy ? t('Police mise à jour.') : t('Police ajoutée.'));
      onSaved();
    } catch (error) {
      applyApiFieldErrors(form, error, FIELDS);
      feedback.error(apiErrorMessage(error, t('Enregistrement impossible.')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={policy ? t('Modifier la police') : t('Ajouter une police')}
      okText={t('Enregistrer')}
      cancelText={t('Annuler')}
      confirmLoading={saving}
      onCancel={onClose}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="insurer" label={t('Assureur')} rules={[{ required: true, message: t('Champ requis') }]}>
          <Input />
        </Form.Item>
        <Form.Item
          name="policyNumber"
          label={t('Numéro de police')}
          rules={[{ required: true, message: t('Champ requis') }]}
        >
          <Input />
        </Form.Item>
        <Form.Item name="coverageType" label={t('Type de couverture')} rules={[{ required: true }]}>
          <Select options={options(COVERAGE_VALUES, coverageLabel)} />
        </Form.Item>
        <Form.Item name="startDate" label={t('Début')} rules={[{ required: true, message: t('Champ requis') }]}>
          <Input type="date" />
        </Form.Item>
        <Form.Item
          name="endDate"
          label={t('Fin')}
          dependencies={['startDate']}
          rules={[
            { required: true, message: t('Champ requis') },
            ({ getFieldValue }) => ({
              validator: (_rule, value) =>
                !value || !getFieldValue('startDate') || value >= getFieldValue('startDate')
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('La fin doit suivre le début.')))
            })
          ]}
        >
          <Input type="date" />
        </Form.Item>
        <Form.Item name="annualPremium" label={t('Prime annuelle ({{devise}})', { devise })}>
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <CurrencyField />
        <Form.Item name="notes" label={t('Notes')}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item label={t('Pièce justificative')}>
          <input
            ref={input}
            type="file"
            hidden
            data-testid="policy-file-input"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tiff"
            onChange={event => setFile(event.target.files?.[0] ?? null)}
          />
          <Button onClick={() => input.current?.click()}>{t('Choisir un fichier')}</Button>{' '}
          {file ? (
            <Typography.Text type="secondary">{file.name}</Typography.Text>
          ) : (
            policy?.documentId && <Typography.Text type="secondary">{t('Une pièce est déjà jointe.')}</Typography.Text>
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
};
