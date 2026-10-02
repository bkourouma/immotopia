import React, { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Modal, Select } from 'antd';
import { createInsuranceClaim } from '../../services/insurance-service';
import { propertyMaintenanceService } from '../../services/maintenance-service';
import { listExpenses } from '../../services/patrimoine-service';
import type { InsuranceClaimCause, InsurancePolicyDto } from '../../types/insurance-types';
import { apiErrorMessage, applyApiFieldErrors } from '../patrimoine/patrimoine-labels';
import { feedback } from '../../lib/feedback';
import { t } from '../../i18n/t';
import { CAUSE_VALUES, causeLabel, currencyLabel, formatAmount, formatDay, options } from './insurance-labels';

interface Props {
  open: boolean;
  tenantId: string;
  propertyId: string;
  policies: InsurancePolicyDto[];
  onClose: () => void;
  onSaved: () => void;
}

interface Values {
  policyId: string;
  occurredAt: string;
  cause: InsuranceClaimCause;
  description: string;
  claimedAmount: number;
  deductible?: number | null;
  ticketId?: string;
  expenseId?: string;
}

const FIELDS = [
  'policyId',
  'occurredAt',
  'cause',
  'description',
  'claimedAmount',
  'deductible',
  'ticketId',
  'expenseId'
];

type Choice = { value: string; label: string };

/**
 * Déclaration d'un sinistre. Le ticket de maintenance et la dépense du bien
 * sont des LIENS facultatifs : aucune dépense n'est créée ici (la saisie
 * d'une dépense écrit au journal comptable).
 */
export const ClaimFormModal: React.FC<Props> = ({ open, tenantId, propertyId, policies, onClose, onSaved }) => {
  const [form] = Form.useForm<Values>();
  const policyId = Form.useWatch('policyId', form);
  // Le sinistre est déclaré dans la devise de sa police.
  const devise = currencyLabel(policies.find(policy => policy.id === policyId)?.currency);
  const [saving, setSaving] = useState(false);
  const [tickets, setTickets] = useState<Choice[]>([]);
  const [expenses, setExpenses] = useState<Choice[]>([]);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    let cancelled = false;
    propertyMaintenanceService
      .getHistory(tenantId, propertyId)
      .then(response => {
        if (!cancelled) setTickets((response.data ?? []).map(item => ({ value: item.id, label: item.title })));
      })
      .catch(() => {
        if (!cancelled) setTickets([]);
      });
    listExpenses(tenantId, propertyId)
      .then(list => {
        if (!cancelled) {
          setExpenses(
            list.map(item => ({
              value: item.id,
              label: `${item.label} · ${formatAmount(item.amount, item.currency)} · ${formatDay(item.paidAt)}`
            }))
          );
        }
      })
      .catch(() => {
        if (!cancelled) setExpenses([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, propertyId, form]);

  const submit = async (values: Values) => {
    setSaving(true);
    try {
      await createInsuranceClaim(tenantId, {
        propertyId,
        policyId: values.policyId,
        occurredAt: values.occurredAt,
        cause: values.cause,
        description: values.description.trim(),
        claimedAmount: values.claimedAmount,
        ...(values.deductible !== null && values.deductible !== undefined ? { deductible: values.deductible } : {}),
        ...(values.ticketId ? { ticketId: values.ticketId } : {}),
        ...(values.expenseId ? { expenseId: values.expenseId } : {})
      });
      feedback.success(t('Sinistre déclaré.'));
      onSaved();
    } catch (error) {
      applyApiFieldErrors(form, error, FIELDS);
      feedback.error(apiErrorMessage(error, t('Déclaration impossible.')));
    } finally {
      setSaving(false);
    }
  };

  const required = [{ required: true, message: t('Champ requis') }];

  return (
    <Modal
      open={open}
      title={t('Déclarer un sinistre')}
      okText={t('Déclarer')}
      cancelText={t('Annuler')}
      confirmLoading={saving}
      onCancel={onClose}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="policyId" label={t('Police')} rules={required}>
          <Select
            options={policies.map(policy => ({
              value: policy.id,
              label: t('{{assureur}} · n° {{numero}}', { assureur: policy.insurer, numero: policy.policyNumber })
            }))}
          />
        </Form.Item>
        <Form.Item name="occurredAt" label={t('Date du sinistre')} rules={required}>
          <Input type="date" max={new Date().toISOString().slice(0, 10)} />
        </Form.Item>
        <Form.Item name="cause" label={t('Cause')} rules={required}>
          <Select options={options(CAUSE_VALUES, causeLabel)} />
        </Form.Item>
        <Form.Item name="description" label={t('Description')} rules={required}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item name="claimedAmount" label={t('Montant réclamé ({{devise}})', { devise })} rules={required}>
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="deductible" label={t('Franchise ({{devise}})', { devise })}>
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="ticketId" label={t('Ticket de maintenance lié')}>
          <Select allowClear options={tickets} placeholder={t('Aucun')} />
        </Form.Item>
        <Form.Item name="expenseId" label={t('Dépense liée')}>
          <Select allowClear options={expenses} placeholder={t('Aucune')} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
