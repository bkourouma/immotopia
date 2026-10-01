import React, { useEffect, useRef, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Select, Typography } from 'antd';
import { createMaintenanceLogEntry, updateMaintenanceLogEntry } from '../../services/insurance-service';
import { uploadDocument } from '../../services/property-service';
import type { MaintenanceLogCategory, MaintenanceLogEntryDto } from '../../types/insurance-types';
import { apiErrorMessage } from '../patrimoine/patrimoine-labels';
import { feedback } from '../../lib/feedback';
import { t } from '../../i18n/t';
import { CurrencyField, DEFAULT_CURRENCY, changedCurrency } from './CurrencyField';
import { LOG_CATEGORY_VALUES, currencyLabel, logCategoryLabel, options } from './insurance-labels';
import { useVendorOptions } from './useVendorOptions';

interface Props {
  open: boolean;
  tenantId: string;
  propertyId: string;
  entry: MaintenanceLogEntryDto | null;
  onClose: () => void;
  onSaved: () => void;
}

interface Values {
  category: MaintenanceLogCategory;
  performedAt: string;
  vendorId?: string;
  cost?: number | null;
  currency: string;
  description: string;
  nextDueDate?: string;
  warrantyEndDate?: string;
}

const day = (value?: string | null) => (value ? value.slice(0, 10) : undefined);

function initialValues(entry: MaintenanceLogEntryDto | null): Partial<Values> {
  if (!entry) return { category: 'OTHER', currency: DEFAULT_CURRENCY };
  return {
    category: entry.category,
    performedAt: day(entry.performedAt),
    vendorId: entry.vendorId ?? undefined,
    cost: entry.cost,
    currency: entry.currency,
    description: entry.description,
    nextDueDate: day(entry.nextDueDate),
    warrantyEndDate: day(entry.warrantyEndDate)
  };
}

/** Création et modification d'une entrée du carnet d'entretien. */
export const MaintenanceLogFormModal: React.FC<Props> = ({ open, tenantId, propertyId, entry, onClose, onSaved }) => {
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const vendors = useVendorOptions(open, tenantId, entry);
  const devise = currencyLabel(Form.useWatch('currency', form));

  useEffect(() => {
    if (!open) return;
    setFile(null);
    form.resetFields();
    form.setFieldsValue(initialValues(entry));
  }, [open, entry, form]);

  const submit = async (values: Values) => {
    setSaving(true);
    try {
      const document = file ? await uploadDocument(tenantId, propertyId, file, 'OTHER', undefined, false) : null;
      const payload = {
        category: values.category,
        performedAt: values.performedAt,
        description: values.description.trim(),
        vendorId: values.vendorId ?? null,
        cost: values.cost ?? null,
        nextDueDate: values.nextDueDate || null,
        warrantyEndDate: values.warrantyEndDate || null,
        ...(document?.id ? { documentId: document.id as string } : {})
      };
      if (entry) {
        await updateMaintenanceLogEntry(tenantId, entry.id, {
          ...payload,
          ...changedCurrency(values.currency, entry.currency)
        });
      } else {
        await createMaintenanceLogEntry(tenantId, {
          ...payload,
          currency: values.currency || DEFAULT_CURRENCY,
          propertyId
        });
      }
      feedback.success(entry ? t('Entrée mise à jour.') : t('Entrée ajoutée.'));
      onSaved();
    } catch (error) {
      feedback.error(apiErrorMessage(error, t('Enregistrement impossible.')));
    } finally {
      setSaving(false);
    }
  };

  const required = [{ required: true, message: t('Champ requis') }];

  return (
    <Modal
      open={open}
      title={entry ? t("Modifier l'intervention") : t('Ajouter une intervention')}
      okText={t('Enregistrer')}
      cancelText={t('Annuler')}
      confirmLoading={saving}
      onCancel={onClose}
      onOk={() => form.submit()}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="category" label={t('Catégorie')} rules={required}>
          <Select options={options(LOG_CATEGORY_VALUES, logCategoryLabel)} />
        </Form.Item>
        <Form.Item name="performedAt" label={t("Date de l'intervention")} rules={required}>
          <Input type="date" />
        </Form.Item>
        <Form.Item name="vendorId" label={t('Prestataire')}>
          <Select allowClear showSearch optionFilterProp="label" options={vendors} placeholder={t('Aucun')} />
        </Form.Item>
        <Form.Item name="cost" label={t('Coût ({{devise}})', { devise })}>
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <CurrencyField />
        <Form.Item name="description" label={t('Description')} rules={required}>
          <Input.TextArea rows={3} />
        </Form.Item>
        <Form.Item name="nextDueDate" label={t('Prochaine échéance')}>
          <Input type="date" />
        </Form.Item>
        <Form.Item name="warrantyEndDate" label={t('Fin de garantie')}>
          <Input type="date" />
        </Form.Item>
        <Form.Item label={t('Pièce justificative')}>
          <input
            ref={input}
            type="file"
            hidden
            data-testid="log-file-input"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tiff"
            onChange={event => setFile(event.target.files?.[0] ?? null)}
          />
          <Button onClick={() => input.current?.click()}>{t('Choisir un fichier')}</Button>{' '}
          {file && <Typography.Text type="secondary">{file.name}</Typography.Text>}
        </Form.Item>
      </Form>
    </Modal>
  );
};
