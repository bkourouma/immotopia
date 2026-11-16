import React from 'react';
import { Button, Card, Form, Input, Select } from 'antd';
import { t } from '../../i18n/t';
import { HelpSectionTitle } from '../../help';

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
  ownerLoading?: boolean;
  onOwnerSearch?: (term: string) => void;
  onOwnerSelect?: (value?: string) => void;
  propertyOptions: PropertyOption[];
  propertyLoading?: boolean;
  loading?: boolean;
  onOwnerChange?: (ownerContactId?: string) => void;
  onGenerate: (payload: Payload) => Promise<void> | void;
}

export const OwnerStatementGenerator: React.FC<Props> = ({
  ownerOptions,
  propertyOptions,
  propertyLoading,
  loading,
  onOwnerChange,
  ownerLoading,
  onOwnerSearch,
  onOwnerSelect,
  onGenerate
}) => {
  const [form] = Form.useForm<Payload>();
  const ownerContactId = Form.useWatch('ownerContactId', form);

  return (
    <Card title={<HelpSectionTitle title={t('Générer un relevé de gérance')} helpId="patrimoine.releves.generer" />}>
      <Form layout="vertical" form={form} onFinish={onGenerate}>
        <Form.Item
          name="ownerContactId"
          label={t('Propriétaire')}
          rules={[{ required: true, message: t('Sélectionnez un propriétaire') }]}
        >
          <Select
            showSearch
            allowClear
            filterOption={false}
            onSearch={onOwnerSearch}
            onOpenChange={open => {
              if (open) onOwnerSearch?.('');
            }}
            loading={ownerLoading}
            options={ownerOptions}
            placeholder={t('Sélectionnez le contact propriétaire')}
            onChange={(value?: string) => {
              form.setFieldValue('propertyIds', []);
              onOwnerChange?.(value);
              onOwnerSelect?.(value);
            }}
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
            loading={propertyLoading}
            disabled={!ownerContactId || propertyLoading}
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
