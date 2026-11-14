import React, { useEffect, useState } from 'react';
import { Alert, Form, Input, InputNumber, Modal, DatePicker } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { ReviseLeaseRequest } from '../../../services/lease-lifecycle-service';
import { t } from '../../../i18n/t';
import { HelpSectionTitle } from '../../../help';

/** Plus grand montant que la base sait porter (Decimal 12,2), aligné sur l'API. */
const MONTANT_MAX = 9_999_999_999.99;
const MESSAGE_MONTANT_MAX = 'Le montant dépasse le maximum autorisé (9 999 999 999,99).';

interface RevisionModalProps {
  open: boolean;
  currentRent: number;
  currentCharges: number;
  onCancel: () => void;
  onSubmit: (data: ReviseLeaseRequest) => Promise<void>;
}

interface RevisionFormValues {
  effectiveMonth: Dayjs;
  newRent: number;
  newCharges: number;
  revisionRate?: number;
  summary?: string;
}

/**
 * Révision du loyer.
 *
 * Le taux, quand l'utilisateur le saisit, calcule le nouveau loyer — pas
 * l'inverse : la saisie du loyer reste libre, c'est le taux qui devient
 * accessoire dès qu'on touche directement le montant.
 */
export const RevisionModal: React.FC<RevisionModalProps> = ({
  open,
  currentRent,
  currentCharges,
  onCancel,
  onSubmit
}) => {
  const [form] = Form.useForm<RevisionFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      form.setFieldsValue({
        effectiveMonth: dayjs().add(1, 'month'),
        newRent: currentRent,
        newCharges: currentCharges,
        revisionRate: undefined,
        summary: undefined
      });
    }
  }, [open, currentRent, currentCharges, form]);

  const handleRateChange = (rate: number | null) => {
    if (rate == null) return;
    const nouveauLoyer = Math.round(currentRent * (1 + rate / 100));
    form.setFieldsValue({ newRent: nouveauLoyer });
  };

  const handleFinish = async (values: RevisionFormValues) => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        effectiveMonth: values.effectiveMonth.format('YYYY-MM'),
        newRent: values.newRent,
        newCharges: values.newCharges,
        revisionRate: values.revisionRate ?? undefined,
        summary: values.summary?.trim() || undefined
      });
      form.resetFields();
    } catch (e: any) {
      setError(e?.response?.data?.message || t('Erreur lors de la révision du loyer'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={<HelpSectionTitle title={t('Réviser le loyer')} helpId="locatif.baux.fiche.vie.revision" />}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={t('Réviser')}
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
          label={t("Mois d'effet")}
          name="effectiveMonth"
          rules={[{ required: true, message: t("Le mois d'effet est requis") }]}
        >
          <DatePicker picker="month" style={{ width: '100%' }} format="MM/YYYY" />
        </Form.Item>

        <Form.Item
          label={t('Taux de révision (%)')}
          name="revisionRate"
          extra={t('Facultatif : calcule le nouveau loyer à partir du loyer actuel.')}
        >
          <InputNumber
            style={{ width: '100%' }}
            step={0.1}
            onChange={value => handleRateChange(value as number | null)}
          />
        </Form.Item>

        <Form.Item
          label={t('Nouveau loyer')}
          name="newRent"
          rules={[
            { required: true, message: t('Le nouveau loyer est requis') },
            { type: 'number', min: 0.01, message: t('Le loyer doit être positif') },
            { type: 'number', max: MONTANT_MAX, message: t(MESSAGE_MONTANT_MAX) }
          ]}
        >
          {/* Pas de `min` : il recadrerait la saisie en silence avant la validation. */}
          <InputNumber style={{ width: '100%' }} step={1000} />
        </Form.Item>

        <Form.Item
          label={t('Nouvelles charges')}
          name="newCharges"
          rules={[
            { type: 'number', min: 0, message: t('Les charges ne peuvent pas être négatives') },
            { type: 'number', max: MONTANT_MAX, message: t(MESSAGE_MONTANT_MAX) }
          ]}
        >
          <InputNumber style={{ width: '100%' }} step={1000} />
        </Form.Item>

        <Form.Item
          label={t('Motif')}
          name="summary"
          extra={t("Les échéances pas encore réglées sont recalculées ; l'écart est inscrit au compte du locataire.")}
        >
          <Input.TextArea rows={2} placeholder={t('Ex : révision annuelle indexée')} />
        </Form.Item>
      </Form>
    </Modal>
  );
};
