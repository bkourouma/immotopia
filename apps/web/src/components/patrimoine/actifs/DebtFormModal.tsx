import React, { useEffect, useState } from 'react';
import { Alert, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { DebtDto, DebtInput } from '../../../services/patrimoine-assets-service';
import { t } from '../../../i18n/t';
import { apiErrorMessage, serverFieldErrors, todayIso } from './asset-format';
import { loanStatusLabel } from '../patrimoine-labels';

interface FormValues {
  lender: string;
  capitalAmount: number;
  remainingCapital: number;
  interestRate: number;
  monthlyPayment: number;
  currency: string;
  startDate: string;
  endDate: string;
  status: DebtDto['status'];
}

export interface DebtFormModalProps {
  open: boolean;
  /** Renseigné : la dette est adossée à cet actif ; absent : dette personnelle. */
  assetId?: string;
  debt?: DebtDto | null;
  onClose: () => void;
  onSubmit: (payload: DebtInput) => Promise<void>;
}

const FIELDS = [
  'lender',
  'capitalAmount',
  'remainingCapital',
  'interestRate',
  'monthlyPayment',
  'currency',
  'startDate',
  'endDate',
  'status'
];

const requiredNumber = (label: string) => ({ required: true, type: 'number' as const, message: label });

/** `<DebtFormModal>` — ajout ou modification d'une dette (adossée à un actif ou personnelle). */
export const DebtFormModal: React.FC<DebtFormModalProps> = ({ open, assetId, debt, onClose, onSubmit }) => {
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMessage(null);
    form.resetFields();
    form.setFieldsValue(
      debt
        ? {
            lender: debt.lender,
            capitalAmount: debt.capitalAmount,
            remainingCapital: debt.remainingCapital,
            interestRate: debt.interestRate,
            monthlyPayment: debt.monthlyPayment,
            currency: debt.currency,
            startDate: debt.startDate.slice(0, 10),
            endDate: debt.endDate.slice(0, 10),
            status: debt.status
          }
        : { currency: 'XOF', status: 'ACTIVE', startDate: todayIso() }
    );
  }, [open, debt, form]);

  const handleOk = async () => {
    setErrorMessage(null);
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        ...(assetId && !debt ? { assetId } : {}),
        lender: values.lender.trim(),
        capitalAmount: values.capitalAmount,
        remainingCapital: values.remainingCapital,
        interestRate: values.interestRate,
        monthlyPayment: values.monthlyPayment,
        currency: values.currency,
        startDate: values.startDate,
        endDate: values.endDate,
        status: values.status
      });
      onClose();
    } catch (error) {
      const issues = serverFieldErrors(error).filter(issue => FIELDS.includes(issue.path[0]));
      if (issues.length > 0) {
        form.setFields(issues.map(issue => ({ name: issue.path[0] as keyof FormValues, errors: [issue.message] })));
      } else {
        setErrorMessage(apiErrorMessage(error, t("Impossible d'enregistrer cette dette.")));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={debt ? t('Modifier une dette') : t('Ajouter une dette')}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={submitting}
      okText={debt ? t('Enregistrer') : t('Ajouter')}
      cancelText={t('Annuler')}
      destroyOnHidden
    >
      {errorMessage && <Alert type="error" showIcon title={errorMessage} style={{ marginBottom: 'var(--space-3)' }} />}
      <Form form={form} layout="vertical">
        <Form.Item
          name="lender"
          label={t('Prêteur')}
          rules={[{ required: true, whitespace: true, message: t('Le prêteur est requis') }]}
        >
          <Input maxLength={160} />
        </Form.Item>
        <Form.Item name="capitalAmount" label={t('Capital emprunté')} rules={[requiredNumber(t('Champ obligatoire'))]}>
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="remainingCapital"
          label={t('Capital restant dû')}
          rules={[requiredNumber(t('Champ obligatoire'))]}
        >
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="interestRate" label={t("Taux d'intérêt (%)")} rules={[requiredNumber(t('Champ obligatoire'))]}>
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="monthlyPayment" label={t('Mensualité')} rules={[requiredNumber(t('Champ obligatoire'))]}>
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="currency" label={t('Devise')} rules={[{ required: true }]}>
          <Select options={['XOF', 'EUR', 'USD'].map(value => ({ value, label: value }))} />
        </Form.Item>
        <Form.Item
          name="startDate"
          label={t('Date de début')}
          rules={[{ required: true, message: t('Champ obligatoire') }]}
        >
          <Input type="date" />
        </Form.Item>
        <Form.Item
          name="endDate"
          label={t('Date de fin')}
          dependencies={['startDate']}
          rules={[
            { required: true, message: t('Champ obligatoire') },
            ({ getFieldValue }) => ({
              validator: (_rule, value) =>
                !value || !getFieldValue('startDate') || value >= getFieldValue('startDate')
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('La date de fin doit suivre la date de début')))
            })
          ]}
        >
          <Input type="date" />
        </Form.Item>
        <Form.Item name="status" label={t('Statut')} rules={[{ required: true }]}>
          <Select
            options={(['ACTIVE', 'CLOSED', 'DEFAULTED'] as const).map(value => ({
              value,
              label: loanStatusLabel(value)
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};
