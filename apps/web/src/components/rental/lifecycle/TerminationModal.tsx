import React, { useEffect, useState } from 'react';
import { Alert, App, Form, Input, Modal, DatePicker, Select } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { LeaseEventInitiator, TerminateLeaseRequest } from '../../../services/lease-lifecycle-service';
import { useConfirmAction } from '../../primitives';
import { t } from '../../../i18n/t';

interface TerminationModalProps {
  open: boolean;
  onCancel: () => void;
  onSubmit: (data: TerminateLeaseRequest) => Promise<void>;
}

interface TerminationFormValues {
  noticeDate: Dayjs;
  effectiveDate: Dayjs;
  initiatedBy: LeaseEventInitiator;
  moveOutDate?: Dayjs;
  summary?: string;
}

/**
 * Résiliation du bail.
 *
 * La résiliation est définitive et annule les échéances pas encore facturées
 * au-delà de la fin : une confirmation explicite s'intercale donc entre la
 * validation du formulaire et l'appel réseau, via `useConfirmAction` — le
 * même dialogue que partout ailleurs dans l'application (REFONTE_UI_UX.md
 * §5.7), plutôt qu'une modale de confirmation maison.
 */
export const TerminationModal: React.FC<TerminationModalProps> = ({ open, onCancel, onSubmit }) => {
  const { message } = App.useApp();
  const confirm = useConfirmAction();
  const [form] = Form.useForm<TerminationFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      form.resetFields();
    }
  }, [open, form]);

  const runSubmit = async (values: TerminationFormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        noticeDate: values.noticeDate.format('YYYY-MM-DD'),
        effectiveDate: values.effectiveDate.format('YYYY-MM-DD'),
        initiatedBy: values.initiatedBy,
        moveOutDate: values.moveOutDate ? values.moveOutDate.format('YYYY-MM-DD') : undefined,
        summary: values.summary?.trim() || undefined
      });
      form.resetFields();
    } catch (e: any) {
      const msg = e?.response?.data?.message || t('Erreur lors de la résiliation du bail');
      setError(msg);
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinish = (values: TerminationFormValues) => {
    confirm({
      title: t('Résilier ce bail ?'),
      description: t(
        'Cette action est définitive et annule les échéances pas encore facturées au-delà de la fin du bail.'
      ),
      okText: t('Résilier'),
      cancelText: t('Annuler'),
      danger: true,
      onConfirm: () => runSubmit(values)
    });
  };

  return (
    <Modal
      title={t('Résilier le bail')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={t('Résilier')}
      okButtonProps={{ danger: true }}
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
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          label={t('Date de préavis')}
          name="noticeDate"
          rules={[{ required: true, message: t('La date de préavis est requise') }]}
        >
          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
        </Form.Item>

        <Form.Item
          label={t('Date de fin')}
          name="effectiveDate"
          rules={[{ required: true, message: t('La date de fin est requise') }]}
        >
          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
        </Form.Item>

        <Form.Item
          label={t('À l’initiative de')}
          name="initiatedBy"
          rules={[{ required: true, message: t("L'initiateur de la résiliation est requis") }]}
        >
          <Select
            options={[
              { value: 'TENANT', label: t('Locataire') },
              { value: 'LANDLORD', label: t('Bailleur') },
              { value: 'MUTUAL', label: t('Accord amiable') }
            ]}
          />
        </Form.Item>

        <Form.Item label={t('Date de sortie des lieux')} name="moveOutDate">
          <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
        </Form.Item>

        <Form.Item label={t('Motif')} name="summary">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
