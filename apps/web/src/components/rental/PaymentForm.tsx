import React, { useState, useEffect } from 'react';
import { App, Form, Input, Select, Button, Row, Col, Alert, InputNumber, Space } from 'antd';
import { CreatePaymentRequest, RentalPaymentMethod } from '../../services/rental-service';
import { formatNumberWithSpaces, parseFormattedNumber } from '../../lib/utils';

interface PaymentFormProps {
  tenantId: string;
  leaseId?: string;
  defaultAmount?: number;
  defaultCurrency?: string;
  onSubmit: (data: CreatePaymentRequest) => Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
}

export const PaymentForm: React.FC<PaymentFormProps> = ({
  tenantId,
  leaseId,
  defaultAmount,
  defaultCurrency = 'FCFA',
  onSubmit,
  onCancel,
  loading = false
}) => {
  const { message } = App.useApp();

  const [form] = Form.useForm();
  const [method, setMethod] = useState<RentalPaymentMethod>(RentalPaymentMethod.CASH);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update form when defaultAmount or defaultCurrency changes
  useEffect(() => {
    if (defaultAmount !== undefined || defaultCurrency) {
      form.setFieldsValue({
        amount: defaultAmount,
        currency: defaultCurrency
      });
    }
  }, [defaultAmount, defaultCurrency, form]);

  const handleSubmit = async (values: any) => {
    setIsSubmitting(true);
    try {
      const submitData: CreatePaymentRequest = {
        leaseId: leaseId || undefined,
        method: values.method,
        amount: values.amount || 0,
        currency: values.currency || 'FCFA',
        mmOperator: values.mmOperator || undefined,
        mmPhone: values.mmPhone || undefined,
        pspName: values.pspName || undefined,
        pspTransactionId: values.pspTransactionId || undefined,
        pspReference: values.pspReference || undefined
      };

      await onSubmit(submitData);
    } catch (error: any) {
      if (error.response?.data?.errors) {
        const apiErrors: Record<string, string> = {};
        const fieldErrors: { name: string[]; errors: string[] }[] = [];
        error.response.data.errors.forEach((err: { field: string; message: string }) => {
          apiErrors[err.field] = err.message;
          fieldErrors.push({
            name: [err.field],
            errors: [err.message]
          });
        });
        setErrors(apiErrors);
        form.setFields(fieldErrors);
      } else if (error.response?.data?.message) {
        const errorMsg = error.response.data.message;
        setErrors({ submit: errorMsg });
        message.error(errorMsg);
      } else {
        const errorMsg = "Une erreur est survenue lors de l'enregistrement du paiement";
        setErrors({ submit: errorMsg });
        message.error(errorMsg);
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
        method: RentalPaymentMethod.CASH,
        amount: defaultAmount,
        currency: defaultCurrency
      }}
    >
      {errors.submit && (
        <Alert
          message="Erreur"
          description={errors.submit}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 24 }}
        />
      )}

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item
            label="Méthode de paiement"
            name="method"
            required
            rules={[{ required: true, message: 'La méthode de paiement est requise' }]}
          >
            <Select>
              <Select.Option value={RentalPaymentMethod.CASH}>Espèces</Select.Option>
              <Select.Option value={RentalPaymentMethod.BANK_TRANSFER}>Virement bancaire</Select.Option>
              <Select.Option value={RentalPaymentMethod.CHECK}>Chèque</Select.Option>
              <Select.Option value={RentalPaymentMethod.MOBILE_MONEY}>Mobile Money</Select.Option>
              <Select.Option value={RentalPaymentMethod.CARD}>Carte bancaire</Select.Option>
              <Select.Option value={RentalPaymentMethod.OTHER}>Autre</Select.Option>
            </Select>
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label="Montant"
            name="amount"
            required
            validateStatus={errors.amount ? 'error' : ''}
            help={errors.amount}
            rules={[
              { required: true, message: 'Le montant est requis' },
              { type: 'number', min: 0.01, message: 'Le montant doit être supérieur à 0' }
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              step={1000}
              formatter={value => formatNumberWithSpaces(value?.toString() || '')}
              parser={
                (value => {
                  if (!value) return 0;
                  const parsed = parseFormattedNumber(value);
                  const num = parseFloat(parsed);
                  return isNaN(num) ? 0 : num;
                }) as (displayValue: string | undefined) => number
              }
              placeholder="Ex: 150000"
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item label="Devise" name="currency">
            <Select>
              <Select.Option value="FCFA">FCFA</Select.Option>
              <Select.Option value="EUR">EUR</Select.Option>
              <Select.Option value="USD">USD</Select.Option>
            </Select>
          </Form.Item>
        </Col>

        {method === RentalPaymentMethod.MOBILE_MONEY && (
          <>
            <Col xs={24} md={12}>
              <Form.Item
                label="Opérateur"
                name="mmOperator"
                required
                validateStatus={errors.mmOperator ? 'error' : ''}
                help={errors.mmOperator}
                rules={[{ required: true, message: "L'opérateur mobile money est requis" }]}
              >
                <Select placeholder="Sélectionner un opérateur">
                  <Select.Option value="ORANGE">Orange Money</Select.Option>
                  <Select.Option value="MTN">MTN Mobile Money</Select.Option>
                  <Select.Option value="MOOV">Moov Money</Select.Option>
                  <Select.Option value="WAVE">Wave</Select.Option>
                  <Select.Option value="OTHER">Autre</Select.Option>
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label="Numéro de téléphone"
                name="mmPhone"
                required
                validateStatus={errors.mmPhone ? 'error' : ''}
                help={errors.mmPhone}
                rules={[{ required: true, message: 'Le numéro de téléphone est requis' }]}
              >
                <Input type="tel" placeholder="+225 XX XX XX XX XX" />
              </Form.Item>
            </Col>
          </>
        )}

        <Col xs={24} md={12}>
          <Form.Item label="PSP (optionnel)" name="pspName">
            <Input placeholder="Nom du prestataire de services de paiement" />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item label="ID Transaction PSP (optionnel)" name="pspTransactionId">
            <Input placeholder="ID de transaction" />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item label="Référence PSP (optionnel)" name="pspReference">
            <Input placeholder="Référence PSP" />
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
            Enregistrer le paiement
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
};
