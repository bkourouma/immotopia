import React, { useState, useEffect } from 'react';
import { App, Form, Input, Select, Button, Row, Col, Alert, InputNumber, DatePicker, Space } from 'antd';
import dayjs from 'dayjs';
import { CreatePaymentRequest, RentalPaymentMethod } from '../../services/rental-service';
import { formatNumberWithSpaces, parseFormattedNumber } from '../../lib/utils';
import { t } from '../../i18n/t';

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
        pspReference: values.pspReference || undefined,
        paidAt: values.paidAt ? values.paidAt.format('YYYY-MM-DD') : undefined
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
        const errorMsg = t("Une erreur est survenue lors de l'enregistrement du paiement");
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
        currency: defaultCurrency,
        paidAt: dayjs()
      }}
    >
      {errors.submit && (
        <Alert
          message={t('Erreur')}
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
            label={t('Méthode de paiement')}
            name="method"
            required
            rules={[{ required: true, message: t('La méthode de paiement est requise') }]}
          >
            <Select showSearch optionFilterProp="children">
              <Select.Option value={RentalPaymentMethod.CASH}>{t('Espèces')}</Select.Option>
              <Select.Option value={RentalPaymentMethod.BANK_TRANSFER}>{t('Virement bancaire')}</Select.Option>
              <Select.Option value={RentalPaymentMethod.CHECK}>{t('Chèque')}</Select.Option>
              <Select.Option value={RentalPaymentMethod.MOBILE_MONEY}>{t('Mobile Money')}</Select.Option>
              <Select.Option value={RentalPaymentMethod.CARD}>{t('Carte bancaire')}</Select.Option>
              <Select.Option value={RentalPaymentMethod.OTHER}>{t('Autre')}</Select.Option>
            </Select>
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label={t('Montant')}
            name="amount"
            required
            validateStatus={errors.amount ? 'error' : ''}
            help={errors.amount}
            rules={[
              { required: true, message: t('Le montant est requis') },
              { type: 'number', min: 0.01, message: t('Le montant doit être supérieur à 0') }
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
              placeholder={t('Ex: 150000')}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item
            label={t('Date du règlement')}
            name="paidAt"
            required
            validateStatus={errors.paidAt ? 'error' : ''}
            help={errors.paidAt}
            extra={t('La date à laquelle le locataire a payé, pas celle de la saisie.')}
            rules={[{ required: true, message: t('La date du règlement est requise') }]}
          >
            <DatePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              disabledDate={current => current && current > dayjs().endOf('day')}
              placeholder={t('Sélectionner la date')}
            />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item label={t('Devise')} name="currency">
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
                label={t('Opérateur')}
                name="mmOperator"
                required
                validateStatus={errors.mmOperator ? 'error' : ''}
                help={errors.mmOperator}
                rules={[{ required: true, message: t("L'opérateur mobile money est requis") }]}
              >
                <Select showSearch optionFilterProp="children" placeholder={t('Sélectionner un opérateur')}>
                  <Select.Option value="ORANGE">{'Orange Money'}</Select.Option>
                  <Select.Option value="MTN">{'MTN Mobile Money'}</Select.Option>
                  <Select.Option value="MOOV">{'Moov Money'}</Select.Option>
                  <Select.Option value="WAVE">{'Wave'}</Select.Option>
                  <Select.Option value="OTHER">{t('Autre')}</Select.Option>
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} md={12}>
              <Form.Item
                label={t('Numéro de téléphone')}
                name="mmPhone"
                required
                validateStatus={errors.mmPhone ? 'error' : ''}
                help={errors.mmPhone}
                rules={[{ required: true, message: t('Le numéro de téléphone est requis') }]}
              >
                <Input type="tel" placeholder={t('+225 XX XX XX XX XX')} />
              </Form.Item>
            </Col>
          </>
        )}

        <Col xs={24} md={12}>
          <Form.Item label={t('PSP (optionnel)')} name="pspName">
            <Input placeholder={t('Nom du prestataire de services de paiement')} />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item label={t('ID Transaction PSP (optionnel)')} name="pspTransactionId">
            <Input placeholder={t('ID de transaction')} />
          </Form.Item>
        </Col>

        <Col xs={24} md={12}>
          <Form.Item label={t('Référence PSP (optionnel)')} name="pspReference">
            <Input placeholder={t('Référence PSP')} />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item>
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          {onCancel && (
            <Button onClick={onCancel} disabled={isSubmitting || loading}>
              {t('Annuler')}
            </Button>
          )}
          <Button type="primary" htmlType="submit" loading={isSubmitting || loading}>
            {t('Enregistrer le paiement')}
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
};
