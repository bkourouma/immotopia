import React, { useEffect, useState } from 'react';
import { Alert, Form, Input, InputNumber, Modal, DatePicker } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { RenewLeaseRequest } from '../../../services/lease-lifecycle-service';
import { t } from '../../../i18n/t';

interface RenewalModalProps {
  open: boolean;
  currentEndDate: string | null;
  onCancel: () => void;
  onSubmit: (data: RenewLeaseRequest) => Promise<void>;
}

interface RenewalFormValues {
  newEndDate: Dayjs;
  newRent?: number;
  newCharges?: number;
  summary?: string;
}

/** Renouvellement du bail. */
export const RenewalModal: React.FC<RenewalModalProps> = ({ open, currentEndDate, onCancel, onSubmit }) => {
  const [form] = Form.useForm<RenewalFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      form.resetFields();
    }
  }, [open, form]);

  const borneMin = currentEndDate ? dayjs(currentEndDate) : null;

  const handleFinish = async (values: RenewalFormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        newEndDate: values.newEndDate.format('YYYY-MM-DD'),
        newRent: values.newRent ?? undefined,
        newCharges: values.newCharges ?? undefined,
        summary: values.summary?.trim() || undefined
      });
      form.resetFields();
    } catch (e: any) {
      setError(e?.response?.data?.message || t('Erreur lors du renouvellement du bail'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={t('Renouveler le bail')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={t('Renouveler')}
      cancelText={t('Annuler')}
      confirmLoading={submitting}
      destroyOnHidden
    >
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError(null)}
        />
      )}
      <Form form={form} layout="vertical" onFinish={values => void handleFinish(values)}>
        <Form.Item
          label={t('Nouvelle date de fin')}
          name="newEndDate"
          rules={[
            { required: true, message: t('La nouvelle date de fin est requise') },
            {
              validator: (_, value: Dayjs | undefined) => {
                if (!value || !borneMin) return Promise.resolve();
                return value.isAfter(borneMin, 'day')
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('La nouvelle fin doit être postérieure à la fin actuelle')));
              }
            }
          ]}
        >
          <DatePicker
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            disabledDate={current => !!borneMin && !!current && !current.isAfter(borneMin, 'day')}
          />
        </Form.Item>

        <Form.Item
          label={t('Nouveau loyer')}
          name="newRent"
          help={t('Facultatif : appliqué au premier mois qui suit l’ancienne fin.')}
        >
          <InputNumber style={{ width: '100%' }} min={0} step={1000} />
        </Form.Item>

        <Form.Item label={t('Nouvelles charges')} name="newCharges">
          <InputNumber style={{ width: '100%' }} min={0} step={1000} />
        </Form.Item>

        <Form.Item label={t('Observations')} name="summary">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
