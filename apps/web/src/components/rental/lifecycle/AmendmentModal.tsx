import React, { useEffect, useState } from 'react';
import { Alert, Form, Input, Modal, DatePicker } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { AddAmendmentRequest } from '../../../services/lease-lifecycle-service';
import { t } from '../../../i18n/t';

interface AmendmentModalProps {
  open: boolean;
  onCancel: () => void;
  onSubmit: (data: AddAmendmentRequest) => Promise<void>;
}

interface AmendmentFormValues {
  effectiveDate: Dayjs;
  summary: string;
}

/** Enregistrement d'un avenant. Le document signé se dépose dans l'onglet Documents. */
export const AmendmentModal: React.FC<AmendmentModalProps> = ({ open, onCancel, onSubmit }) => {
  const [form] = Form.useForm<AmendmentFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      form.setFieldsValue({ effectiveDate: dayjs(), summary: undefined });
    }
  }, [open, form]);

  const handleFinish = async (values: AmendmentFormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        effectiveDate: values.effectiveDate.format('YYYY-MM-DD'),
        summary: values.summary.trim()
      });
      form.resetFields();
    } catch (e: any) {
      setError(e?.response?.data?.message || t("Erreur lors de l'enregistrement de l'avenant"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={t('Enregistrer un avenant')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={t('Enregistrer')}
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
          label={t("Date d'effet")}
          name="effectiveDate"
          rules={[{ required: true, message: t("La date d'effet est requise") }]}
        >
          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
        </Form.Item>

        <Form.Item
          label={t('Objet')}
          name="summary"
          rules={[{ required: true, message: t("L'objet de l'avenant est requis") }]}
          help={t("Déposez l'avenant signé dans l'onglet Documents.")}
        >
          <Input.TextArea rows={3} placeholder={t('Ex : changement de destination du bien')} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
