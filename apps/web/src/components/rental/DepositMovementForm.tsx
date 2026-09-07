import React, { useState, useEffect } from 'react';
import {
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Alert,
  Row,
  Col,
  Spin,
} from 'antd';
import {
  CreateDepositMovementRequest,
  RentalSecurityDeposit,
  RentalDepositMovementType,
  RentalPayment,
  RentalPaymentStatus,
  listPayments,
} from '../../services/rental-service';
import { formatNumberWithSpaces, parseFormattedNumber } from '../../lib/utils';

const { TextArea } = Input;

interface DepositMovementFormProps {
  tenantId: string;
  deposit: RentalSecurityDeposit;
  leaseId?: string;
  onSubmit: (data: CreateDepositMovementRequest) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

export const DepositMovementForm: React.FC<DepositMovementFormProps> = ({
  tenantId,
  deposit,
  leaseId,
  onSubmit,
  onCancel,
  loading = false,
}) => {
  const [form] = Form.useForm();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payments, setPayments] = useState<RentalPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [movementType, setMovementType] = useState<string>(RentalDepositMovementType.COLLECT);

  // Load payments when type is COLLECT and leaseId is available.
  // On affiche uniquement les paiements non alloués aux échéances (montant alloué = 0),
  // pour éviter d'associer la collecte du dépôt à un paiement déjà affecté au loyer.
  useEffect(() => {
    const loadPayments = async () => {
      if (movementType === RentalDepositMovementType.COLLECT && leaseId && tenantId) {
        setLoadingPayments(true);
        try {
          const response = await listPayments(tenantId, {
            leaseId,
            status: RentalPaymentStatus.SUCCESS,
          });
          if (response.success) {
            const all = response.data || [];
            const allocatedSum = (p: RentalPayment) =>
              (p.allocations || []).reduce((sum, a) => sum + Number(a.amount), 0);
            const unallocated = all.filter((p) => allocatedSum(p) === 0);
            setPayments(unallocated);
          }
        } catch (err) {
          console.error('Error loading payments:', err);
        } finally {
          setLoadingPayments(false);
        }
      } else {
        setPayments([]);
      }
    };

    loadPayments();
  }, [movementType, leaseId, tenantId]);

  // Pour une Collecte, le montant doit être égal au montant cible du dépôt (règle backend).
  useEffect(() => {
    if (movementType === RentalDepositMovementType.COLLECT && deposit?.target_amount != null) {
      form.setFieldsValue({ amount: Number(deposit.target_amount) });
    }
  }, [movementType, deposit?.target_amount, form]);

  const handleSubmit = async (values: any) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const amountNum = values.amount != null ? Number(values.amount) : 0;
      const submitData: CreateDepositMovementRequest = {
        type: values.type,
        amount: amountNum,
        paymentId: values.paymentId && String(values.paymentId).trim() ? values.paymentId : undefined,
        installmentId: values.installmentId && String(values.installmentId).trim() ? values.installmentId : undefined,
        note: values.note && String(values.note).trim() ? values.note : undefined,
      };

      await onSubmit(submitData);
      form.resetFields();
    } catch (error: any) {
      if (error.response?.data?.message) {
        setSubmitError(error.response.data.message);
      } else {
        setSubmitError('Une erreur est survenue lors de l\'enregistrement du mouvement');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{
        type: RentalDepositMovementType.COLLECT,
      }}
    >
      {submitError && (
        <Alert
          message={submitError}
          type="error"
          showIcon
          closable
          onClose={() => setSubmitError(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            label="Type de mouvement"
            name="type"
            rules={[{ required: true, message: 'Le type de mouvement est requis' }]}
          >
            <Select
              onChange={(value) => {
                setMovementType(value);
                // Reset paymentId when type changes
                form.setFieldsValue({ paymentId: undefined });
              }}
            >
              <Select.Option value={RentalDepositMovementType.COLLECT}>Collecte</Select.Option>
              <Select.Option value={RentalDepositMovementType.HOLD}>Blocage</Select.Option>
              <Select.Option value={RentalDepositMovementType.RELEASE}>Libération</Select.Option>
              <Select.Option value={RentalDepositMovementType.REFUND}>Remboursement</Select.Option>
              <Select.Option value={RentalDepositMovementType.FORFEIT}>Confiscation</Select.Option>
              <Select.Option value={RentalDepositMovementType.ADJUSTMENT}>Ajustement</Select.Option>
            </Select>
          </Form.Item>
        </Col>

        {movementType === RentalDepositMovementType.COLLECT && (
          <Col xs={24} md={12}>
            <Form.Item
              label="Paiement associé"
              name="paymentId"
              rules={[
                { required: true, message: 'Le paiement est requis pour une collecte' },
              ]}
              help="Choisissez le paiement qui correspond à la collecte du dépôt. Le montant ci-dessous sera rempli automatiquement."
            >
              <Select
                placeholder="Sélectionner un paiement"
                loading={loadingPayments}
                notFoundContent={loadingPayments ? <Spin size="small" /> : 'Aucun paiement trouvé'}
                showSearch
                optionFilterProp="children"
                filterOption={(input, option) =>
                  (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
                }
                onChange={() => {
                  // Pour une Collecte, le montant doit rester égal au montant cible du dépôt (règle backend).
                  if (deposit?.target_amount != null) {
                    form.setFieldsValue({ amount: Number(deposit.target_amount) });
                  }
                }}
              >
                {payments.map((payment) => (
                  <Select.Option key={payment.id} value={payment.id}>
                    {new Intl.NumberFormat('fr-FR', {
                      style: 'currency',
                      currency: payment.currency === 'FCFA' ? 'XOF' : payment.currency,
                    }).format(payment.amount)} - {payment.method} - {new Date(payment.created_at).toLocaleDateString('fr-FR')}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        )}

        <Col xs={24} md={12}>
          <Form.Item
            label="Montant"
            name="amount"
            rules={[
              { required: true, message: 'Le montant est requis' },
              { type: 'number', min: 0.01, message: 'Le montant doit être supérieur à 0' },
            ]}
            help={movementType === RentalDepositMovementType.COLLECT ? 'Pour une collecte, ce montant doit être égal au montant cible du dépôt (rempli automatiquement).' : undefined}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={1000}
              formatter={(value) => formatNumberWithSpaces(value?.toString() || '')}
              parser={((value) => {
                if (!value) return 0;
                const parsed = parseFormattedNumber(value);
                const num = parseFloat(parsed);
                return isNaN(num) ? 0 : num;
              }) as (displayValue: string | undefined) => number}
              placeholder="Ex: 500 000"
            />
          </Form.Item>
        </Col>

        <Col xs={24}>
          <Form.Item
            label="Note"
            name="note"
          >
            <TextArea
              rows={3}
              placeholder="Note optionnelle sur le mouvement..."
            />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item>
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          {onCancel && (
            <Button onClick={onCancel} disabled={isSubmitting || loading}>
              Annuler
            </Button>
          )}
          <Button type="primary" htmlType="submit" loading={isSubmitting || loading}>
            Enregistrer
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
};





