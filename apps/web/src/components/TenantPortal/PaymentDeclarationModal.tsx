import React, { useState } from 'react';
import { App, Modal, Form, Input, InputNumber, DatePicker, Select, Upload, Button, Space, Typography } from 'antd';
import { UploadOutlined, DollarOutlined, CalendarOutlined, FileTextOutlined, PhoneOutlined } from '@ant-design/icons';
import { tenantPortalService } from '../../services/tenantPortalService';
import { formatNumberWithSpaces, parseFormattedNumber } from '../../lib/utils';
import dayjs, { Dayjs } from 'dayjs';
import type { UploadFile } from 'antd';
import { t } from '../../i18n/t';

const { TextArea } = Input;
const { Text } = Typography;

interface PaymentDeclarationModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
  installmentId?: string;
  /** Solde restant de l'echeance visee, pre-rempli comme montant propose. */
  defaultAmount?: number;
  /** Periode de l'echeance visee, rappelee dans le titre (ex. « 09/2026 »). */
  installmentLabel?: string;
}

export default function PaymentDeclarationModal({
  open,
  onCancel,
  onSuccess,
  installmentId,
  defaultAmount,
  installmentLabel
}: PaymentDeclarationModalProps) {
  const { message } = App.useApp();

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const handleSubmit = async (values: any) => {
    try {
      setLoading(true);

      const formData = new FormData();
      formData.append('amount', values.amount.toString());
      formData.append('paymentDate', values.paymentDate.format('YYYY-MM-DD'));
      formData.append('paymentMethod', values.paymentMethod);

      if (values.paymentMethod === 'MOBILE_MONEY' && values.transactionPhone?.trim()) {
        formData.append('transactionPhone', values.transactionPhone.trim());
      }
      if (values.mobileOperator) {
        formData.append('mobileOperator', values.mobileOperator);
      }
      if (values.reference) {
        formData.append('reference', values.reference);
      }
      if (installmentId) {
        formData.append('installmentId', installmentId);
      }
      if (values.notes) {
        formData.append('notes', values.notes);
      }
      if (fileList.length > 0 && fileList[0].originFileObj) {
        formData.append('proof', fileList[0].originFileObj);
      }

      await tenantPortalService.declarePayment(formData);

      message.success({
        content: t("Déclaration de paiement créée avec succès. Elle est en attente d'approbation par le gestionnaire."),
        duration: 5
      });
      form.resetFields();
      setFileList([]);
      onSuccess();
      onCancel();
    } catch (error: any) {
      message.error(error.response?.data?.message || t('Erreur lors de la déclaration du paiement'));
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (info: any) => {
    let newFileList = [...info.fileList];
    newFileList = newFileList.slice(-1); // Only keep the last file
    setFileList(newFileList);
  };

  const beforeUpload = (file: File) => {
    const isImageOrPdf = file.type.startsWith('image/') || file.type === 'application/pdf';
    if (!isImageOrPdf) {
      message.error(t('Vous ne pouvez télécharger que des images ou des PDF!'));
      return Upload.LIST_IGNORE;
    }
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) {
      message.error(t('Le fichier doit être inférieur à 5MB!'));
      return Upload.LIST_IGNORE;
    }
    return false; // Prevent auto upload
  };

  return (
    <Modal
      title={
        <Space>
          <DollarOutlined />
          <span>
            {installmentLabel
              ? t('Déclarer un paiement — échéance {{installmentLabel}}', { installmentLabel: installmentLabel })
              : t('Déclarer un paiement')}
          </span>
        </Space>
      }
      open={open}
      onCancel={onCancel}
      footer={null}
      width={600}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          paymentDate: dayjs(),
          paymentMethod: 'CASH',
          // Propose le solde restant quand la declaration part d'une echeance
          // precise ; reste modifiable pour un paiement partiel.
          ...(defaultAmount && defaultAmount > 0 ? { amount: defaultAmount } : {})
        }}
      >
        <Form.Item
          label={t('Montant')}
          name="amount"
          rules={[
            { required: true, message: t('Le montant est requis') },
            { type: 'number', min: 0.01, message: t('Le montant doit être positif') }
          ]}
        >
          <InputNumber<number>
            prefix={<DollarOutlined />}
            style={{ width: '100%' }}
            placeholder={t('Ex. 150 000')}
            min={0.01}
            step={1000}
            precision={0}
            formatter={value => formatNumberWithSpaces(value?.toString() || '')}
            parser={(value): number => parseFloat(parseFormattedNumber(value || '')) || 0}
          />
        </Form.Item>

        <Form.Item
          label={t('Date de paiement')}
          name="paymentDate"
          rules={[{ required: true, message: t('La date de paiement est requise') }]}
        >
          <DatePicker
            style={{ width: '100%' }}
            format="DD/MM/YYYY"
            disabledDate={current => current && current > dayjs().endOf('day')}
            placeholder={t('Sélectionner la date')}
          />
        </Form.Item>

        <Form.Item
          label={t('Méthode de paiement')}
          name="paymentMethod"
          rules={[{ required: true, message: t('La méthode de paiement est requise') }]}
        >
          <Select showSearch optionFilterProp="children" placeholder={t('Sélectionner la méthode')}>
            <Select.Option value="CASH">{t('Espèces')}</Select.Option>
            <Select.Option value="BANK_TRANSFER">{t('Virement bancaire')}</Select.Option>
            <Select.Option value="MOBILE_MONEY">{t('Mobile Money')}</Select.Option>
            <Select.Option value="CHECK">{t('Chèque')}</Select.Option>
            <Select.Option value="CARD">{t('Carte bancaire')}</Select.Option>
            <Select.Option value="OTHER">{t('Autre')}</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          noStyle
          shouldUpdate={(prevValues, currentValues) => prevValues.paymentMethod !== currentValues.paymentMethod}
        >
          {({ getFieldValue }) =>
            getFieldValue('paymentMethod') === 'MOBILE_MONEY' ? (
              <>
                <Form.Item
                  label={t('Numéro de téléphone (transaction)')}
                  name="transactionPhone"
                  rules={[
                    { required: true, message: t('Le numéro de téléphone ayant servi à la transaction est requis') },
                    { max: 50, message: t('Le numéro ne peut pas dépasser 50 caractères') }
                  ]}
                >
                  <Input prefix={<PhoneOutlined />} placeholder={t('Ex. 07 00 00 00 00')} maxLength={50} />
                </Form.Item>
                <Form.Item
                  label={t('Opérateur mobile')}
                  name="mobileOperator"
                  rules={[{ required: true, message: t("L'opérateur mobile est requis") }]}
                >
                  <Select showSearch optionFilterProp="children" placeholder={t("Sélectionner l'opérateur")}>
                    <Select.Option value="ORANGE">{'Orange Money'}</Select.Option>
                    <Select.Option value="MTN">{'MTN Mobile Money'}</Select.Option>
                    <Select.Option value="MOOV">{'Moov Money'}</Select.Option>
                    <Select.Option value="WAVE">{'Wave'}</Select.Option>
                    <Select.Option value="OTHER">{t('Autre')}</Select.Option>
                  </Select>
                </Form.Item>
              </>
            ) : null
          }
        </Form.Item>

        <Form.Item label={t('Référence / Numéro de transaction')} name="reference">
          <Input placeholder={t('Numéro de transaction, référence, etc.')} />
        </Form.Item>

        <Form.Item
          label={t('Justificatif de paiement')}
          name="proof"
          extra={<Text type="secondary">{t('Image ou PDF (max 5MB)')}</Text>}
        >
          <Upload
            fileList={fileList}
            onChange={handleFileChange}
            beforeUpload={beforeUpload}
            maxCount={1}
            accept="image/*,.pdf"
          >
            <Button icon={<UploadOutlined />}>{t('Télécharger un fichier')}</Button>
          </Upload>
        </Form.Item>

        <Form.Item label={t('Notes (optionnel)')} name="notes">
          <TextArea rows={3} placeholder={t('Informations complémentaires sur ce paiement...')} />
        </Form.Item>

        <Form.Item>
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={onCancel}>{t('Annuler')}</Button>
            <Button type="primary" htmlType="submit" loading={loading}>
              {t('Déclarer le paiement')}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}
