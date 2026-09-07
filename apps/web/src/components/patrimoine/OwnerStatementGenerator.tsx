import React from 'react';
import { Button, Card, Form, Input, Select } from 'antd';

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
    <Card title="Générer un relevé de gérance">
      <Form layout="vertical" form={form} onFinish={onGenerate}>
        <Form.Item
          name="ownerContactId"
          label="Propriétaire"
          rules={[{ required: true, message: 'Sélectionnez un propriétaire' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={ownerOptions}
            placeholder="Sélectionnez le contact propriétaire"
          />
        </Form.Item>
        <Form.Item
          name="period"
          label="Période (YYYY-MM)"
          rules={[{ required: true, message: 'Période requise' }, { pattern: /^\d{4}-\d{2}$/, message: 'Format YYYY-MM' }]}
        >
          <Input placeholder="2026-03" />
        </Form.Item>
        <Form.Item
          name="propertyIds"
          label="Biens concernés"
          rules={[{ required: true, message: 'Sélectionnez au moins un bien' }]}
        >
          <Select mode="multiple" options={propertyOptions} placeholder="Sélectionnez les biens" />
        </Form.Item>
        <Button htmlType="submit" type="primary" loading={loading}>
          Générer le relevé
        </Button>
      </Form>
    </Card>
  );
};
