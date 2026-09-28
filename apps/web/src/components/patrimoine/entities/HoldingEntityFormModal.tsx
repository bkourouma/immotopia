import React, { useEffect, useState } from 'react';
import { Form, Input, Modal, Select } from 'antd';
import type {
  CreateHoldingEntityInput,
  FiscalCountry,
  FiscalOwnerKind,
  HoldingEntityForm as HoldingEntityFormValue,
  HoldingEntitySummary
} from '../../../types/patrimoine-entities-types';

/** L'appelant fournit au moins un résumé ; les champs du détail sont facultatifs. */
export type EditableHoldingEntity = HoldingEntitySummary & {
  notes?: string | null;
  fiscalOwnerKind?: FiscalOwnerKind | null;
};
import { fiscalCountryOptions, fiscalOwnerKindOptions, legalFormOptions } from './tax-labels';
import { listContacts } from '../../../services/crm-service';
import { t } from '../../../i18n/t';
import { apiErrorMessage } from '../patrimoine-labels';

const { TextArea } = Input;

/**
 * `<HoldingEntityFormModal>` — création ou modification d'une entité
 * détentrice (SCI, holding, société…).
 */

export interface HoldingEntityFormModalProps {
  open: boolean;
  tenantId: string;
  entity?: EditableHoldingEntity | null;
  entities: HoldingEntitySummary[];
  onClose: () => void;
  onSubmit: (payload: CreateHoldingEntityInput) => Promise<void>;
}

interface FormValues {
  name: string;
  legalForm: HoldingEntityFormValue;
  country: FiscalCountry;
  rccm?: string;
  taxId?: string;
  contactId?: string;
  parentEntityId?: string;
  fiscalOwnerKind?: 'INDIVIDUAL' | 'COMPANY';
  notes?: string;
}

export const HoldingEntityFormModal: React.FC<HoldingEntityFormModalProps> = ({
  open,
  tenantId,
  entity,
  entities,
  onClose,
  onSubmit
}) => {
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [contactOptions, setContactOptions] = useState<Array<{ value: string; label: string }>>([]);

  useEffect(() => {
    if (!open) return;
    setErrorMessage(null);
    form.setFieldsValue({
      name: entity?.name ?? '',
      legalForm: entity?.legalForm ?? 'SCI',
      country: entity?.country ?? 'CI',
      rccm: entity?.rccm ?? undefined,
      taxId: entity?.taxId ?? undefined,
      contactId: entity?.contact?.id ?? undefined,
      parentEntityId: entity?.parentEntity?.id ?? undefined,
      fiscalOwnerKind: entity?.fiscalOwnerKind ?? undefined,
      notes: entity?.notes ?? undefined
    });
  }, [open, entity, form]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listContacts(tenantId, { limit: 50 })
      .then(response => {
        if (cancelled) return;
        const options = (response.contacts ?? []).map(contact => ({
          value: contact.id,
          label:
            contact.contactType === 'COMPANY'
              ? contact.legalName || t('Contact sans nom')
              : `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || t('Contact sans nom')
        }));
        setContactOptions(options);
      })
      .catch(() => {
        if (!cancelled) setContactOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, tenantId]);

  const parentOptions = entities
    .filter(candidate => candidate.id !== entity?.id)
    .map(candidate => ({ value: candidate.id, label: candidate.name }));

  const handleOk = async () => {
    setErrorMessage(null);
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await onSubmit({
        name: values.name.trim(),
        legalForm: values.legalForm,
        country: values.country,
        rccm: values.rccm?.trim() || null,
        taxId: values.taxId?.trim() || null,
        contactId: values.contactId || null,
        parentEntityId: values.parentEntityId || null,
        fiscalOwnerKind: values.fiscalOwnerKind || null,
        notes: values.notes?.trim() || null
      });
      form.resetFields();
      onClose();
    } catch (error) {
      if ((error as { errorFields?: unknown }).errorFields) return;
      setErrorMessage(apiErrorMessage(error, t("Impossible d'enregistrer l'entité.")));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={entity ? t('Modifier une entité détentrice') : t('Nouvelle entité détentrice')}
      onCancel={() => {
        form.resetFields();
        setErrorMessage(null);
        onClose();
      }}
      onOk={handleOk}
      confirmLoading={submitting}
      okText={entity ? t('Enregistrer') : t('Créer')}
      cancelText={t('Annuler')}
      destroyOnClose
    >
      {errorMessage && (
        <div role="alert" style={{ color: 'var(--color-error-text)', marginBottom: 'var(--space-3)' }}>
          {errorMessage}
        </div>
      )}
      <Form form={form} layout="vertical" requiredMark="optional">
        <Form.Item
          name="name"
          label={t('Nom')}
          rules={[{ required: true, whitespace: true, message: t("Le nom de l'entité est requis") }]}
        >
          <Input maxLength={160} />
        </Form.Item>
        <Form.Item name="legalForm" label={t('Forme juridique')} rules={[{ required: true }]}>
          <Select options={legalFormOptions()} />
        </Form.Item>
        <Form.Item name="country" label={t('Pays')} rules={[{ required: true }]}>
          <Select options={fiscalCountryOptions()} />
        </Form.Item>
        <Form.Item name="rccm" label={t('RCCM')}>
          <Input maxLength={60} />
        </Form.Item>
        <Form.Item name="taxId" label={t('NCC / NIF')}>
          <Input maxLength={60} />
        </Form.Item>
        <Form.Item name="contactId" label={t('Contact associé')}>
          <Select allowClear showSearch optionFilterProp="label" options={contactOptions} />
        </Form.Item>
        <Form.Item name="parentEntityId" label={t('Entité mère')}>
          <Select allowClear showSearch optionFilterProp="label" options={parentOptions} />
        </Form.Item>
        <Form.Item
          name="fiscalOwnerKind"
          label={t('Statut fiscal (surcharge)')}
          extra={t('Laisser vide pour déduire le statut de la forme juridique.')}
        >
          <Select allowClear options={fiscalOwnerKindOptions()} />
        </Form.Item>
        <Form.Item name="notes" label={t('Notes')}>
          <TextArea rows={3} maxLength={2000} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
