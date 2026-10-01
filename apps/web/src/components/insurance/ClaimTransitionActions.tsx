import React, { useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, Space } from 'antd';
import { changeInsuranceClaimStatus } from '../../services/insurance-service';
import type { InsuranceClaimDetailDto, InsuranceClaimStatus } from '../../types/insurance-types';
import { apiErrorMessage } from '../patrimoine/patrimoine-labels';
import { feedback } from '../../lib/feedback';
import { t } from '../../i18n/t';
import { claimStatusLabel, currencyLabel } from './insurance-labels';

interface Props {
  tenantId: string;
  claim: InsuranceClaimDetailDto;
  onChanged: () => void;
}

interface Values {
  note?: string;
  indemnifiedAmount?: number;
  deductible?: number | null;
  rejectionReason?: string;
}

/**
 * Boutons de transition : uniquement les statuts de `allowedNextStatuses`
 * (la table des transitions vit côté API). « Indemnisé » demande le montant
 * indemnisé, « Rejeté » le motif. Le reste à charge n'est jamais saisi.
 * Les montants sont dans la devise du sinistre.
 */
export const ClaimTransitionActions: React.FC<Props> = ({ tenantId, claim, onChanged }) => {
  const [form] = Form.useForm<Values>();
  const [target, setTarget] = useState<InsuranceClaimStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const devise = currencyLabel(claim.currency);

  const send = async (toStatus: InsuranceClaimStatus, values: Values = {}) => {
    setSaving(true);
    try {
      const note = values.note?.trim();
      await changeInsuranceClaimStatus(tenantId, claim.id, {
        toStatus,
        ...(note ? { note } : {}),
        ...(toStatus === 'SETTLED' ? { indemnifiedAmount: values.indemnifiedAmount } : {}),
        ...(toStatus === 'SETTLED' && values.deductible != null ? { deductible: values.deductible } : {}),
        ...(toStatus === 'REJECTED' ? { rejectionReason: values.rejectionReason?.trim() } : {})
      });
      feedback.success(t('Statut mis à jour.'));
      setTarget(null);
      onChanged();
    } catch (error) {
      feedback.error(apiErrorMessage(error, t('Changement de statut impossible.')));
    } finally {
      setSaving(false);
    }
  };

  const choose = (status: InsuranceClaimStatus) => {
    if (status === 'SETTLED' || status === 'REJECTED') {
      form.resetFields();
      setTarget(status);
    } else {
      void send(status);
    }
  };

  const allowed = claim.allowedNextStatuses ?? [];
  if (allowed.length === 0) return null;
  const required = [{ required: true, message: t('Champ requis') }];

  return (
    <>
      <Space wrap data-testid="claim-transitions">
        {allowed.map(status => (
          <Button
            key={status}
            danger={status === 'REJECTED'}
            loading={saving && target === null}
            onClick={() => choose(status)}
          >
            {t('Passer à « {{statut}} »', { statut: claimStatusLabel(status) })}
          </Button>
        ))}
      </Space>
      <Modal
        open={target !== null}
        title={target === 'SETTLED' ? t('Indemnisation') : t('Rejet du sinistre')}
        okText={t('Confirmer')}
        cancelText={t('Annuler')}
        confirmLoading={saving}
        onCancel={() => setTarget(null)}
        onOk={() => form.submit()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={values => send(target as InsuranceClaimStatus, values)}>
          {target === 'SETTLED' ? (
            <>
              <Form.Item
                name="indemnifiedAmount"
                label={t('Montant indemnisé ({{devise}})', { devise })}
                rules={required}
              >
                <InputNumber min={0} max={claim.claimedAmount} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="deductible" label={t('Franchise ({{devise}})', { devise })}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </>
          ) : (
            <Form.Item name="rejectionReason" label={t('Motif du rejet')} rules={required}>
              <Input.TextArea rows={3} />
            </Form.Item>
          )}
          <Form.Item name="note" label={t('Note (facultative)')}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
