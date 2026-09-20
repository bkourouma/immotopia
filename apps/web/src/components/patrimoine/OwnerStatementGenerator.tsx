import React from 'react';
import { Button, Card, Form, Input, Select } from 'antd';
import { t } from '../../i18n/t';

interface PropertyOption {
  value: string;
  label: string;
}

interface Payload {
  ownerContactId: string;
  period: string;
  propertyIds: string[];
}

interface Props {
  ownerOptions: PropertyOption[];
  propertyOptions: PropertyOption[];
  loading?: boolean;
  onGenerate: (payload: Payload) => Promise<void> | void;
}

export const OwnerStatementGenerator: React.FC<Props> = ({ ownerOptions, propertyOptions, loading, onGenerate }) => {
  const [form] = Form.useForm<Payload>();

  return (
    <Card title={t('Générer un relevé de gérance')}>
      <Form layout="vertical" form={form} onFinish={onGenerate}>
        <Form.Item
          name="ownerContactId"
          label={t('Propriétaire')}
          rules={[{ required: true, message: t('Sélectionnez un propriétaire') }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={ownerOptions}
            placeholder={t('Sélectionnez le contact propriétaire')}
          />
        </Form.Item>
        <Form.Item
          name="period"
          label={t('Période (YYYY-MM)')}
          rules={[
            { required: true, message: t('Période requise') },
            { pattern: /^\d{4}-\d{2}$/, message: t('Format YYYY-MM') }
          ]}
        >
          <Input placeholder="2026-03" />
        </Form.Item>
        <Form.Item
          name="propertyIds"
          label={t('Biens concernés')}
          rules={[{ required: true, message: t('Sélectionnez au moins un bien') }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            mode="multiple"
            options={propertyOptions}
            placeholder={t('Sélectionnez les biens')}
          />
        </Form.Item>
        <Button htmlType="submit" type="primary" loading={loading}>
          {t('Générer le relevé')}
        </Button>
      </Form>
    </Card>
  );
};
