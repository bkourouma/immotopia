import React, { useEffect, useState } from 'react';
import { App, Button, Card, Form, Input, InputNumber, Select, Typography } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import {
  createExtensionRequest,
  listOwnExtensionRequests,
  type ExtensionRequest
} from '../../services/subscription-extras-service';
import { StatusTag, Table } from '../primitives';
import { EXTENSION_REQUIRED_PACKS, isExtensionAllowed } from '../../utils/extension-rules';
import { apiErrorMessage, formatLongDate } from './subscription-account-labels';
import { t } from '../../i18n/t';

const { Paragraph } = Typography;

/** Offres d'extension proposées à la demande (codes du catalogue, PLAN-ABONNEMENTS.md §2). */
const extensionOptions = () => [
  { value: 'EXT_LOTS_10', label: t('Bloc de 10 lots') },
  { value: 'EXT_COPRO', label: t('Copropriété supplémentaire') },
  { value: 'EXT_CHANTIER', label: t('Chantier supplémentaire') },
  { value: 'EXT_BIENS_10', label: t('Bloc de 10 biens détenus') }
];

const requestStatus = (): Record<
  string,
  { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' }
> => ({
  OPEN: { label: t('En attente'), tone: 'warning' },
  HANDLED: { label: t('Traitée'), tone: 'success' },
  DECLINED: { label: t('Refusée'), tone: 'neutral' }
});

interface RequestValues {
  catalogCode?: string;
  quantity?: number;
  message: string;
}

interface Props {
  tenantId: string;
  /** Packs détenus : seules les extensions vendables avec eux sont proposées (BUG-061). */
  packs: string[];
}

/** Formulaire « Autre demande » : demande libre ou d'extension adressée à l'équipe ImmoTopia. */
export const ExtensionRequestCard: React.FC<Props> = ({ tenantId, packs }) => {
  const { message } = App.useApp();
  const [requests, setRequests] = useState<ExtensionRequest[]>([]);
  const [sending, setSending] = useState(false);
  const [form] = Form.useForm<RequestValues>();
  const options = extensionOptions().filter(option =>
    isExtensionAllowed(EXTENSION_REQUIRED_PACKS[option.value], packs)
  );

  useEffect(() => {
    listOwnExtensionRequests(tenantId)
      .then(setRequests)
      .catch(() => setRequests([]));
  }, [tenantId]);

  const handleSubmit = async (values: RequestValues) => {
    setSending(true);
    try {
      const created = await createExtensionRequest(tenantId, {
        catalogCode: values.catalogCode ?? null,
        quantity: values.catalogCode ? (values.quantity ?? 1) : null,
        message: values.message
      });
      setRequests(previous => [created, ...previous]);
      form.resetFields();
      message.success(t("Demande envoyée à l'équipe ImmoTopia"));
    } catch (err) {
      message.error(apiErrorMessage(err, t("Erreur lors de l'envoi de la demande")));
    } finally {
      setSending(false);
    }
  };

  return (
    <Card title={t('Autre demande')}>
      <Paragraph type="secondary">
        {t("Besoin d'autre chose que ce qui est proposé ci-dessus ? Envoyez une demande à l'équipe ImmoTopia.")}
      </Paragraph>
      <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ maxWidth: 560 }}>
        <Form.Item label={t('Offre souhaitée')} name="catalogCode">
          <Select allowClear placeholder={t('Autre demande')} options={options} />
        </Form.Item>
        <Form.Item label={t('Quantité')} name="quantity">
          <InputNumber<number> min={1} max={1000} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          label={t('Votre demande')}
          name="message"
          rules={[{ required: true, min: 3, message: t('Décrivez votre demande.') }]}
        >
          <Input.TextArea rows={3} maxLength={2000} />
        </Form.Item>
        <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={sending}>
          {t('Envoyer la demande')}
        </Button>
      </Form>
      {requests.length > 0 && (
        <Table<ExtensionRequest>
          exportFilename={t('Mes demandes')}
          style={{ marginBlockStart: 'var(--space-4)' }}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
          dataSource={requests}
          aria-label={t('Mes demandes')}
          columns={[
            { title: t('Date'), dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => formatLongDate(v) },
            { title: t('Demande'), dataIndex: 'message', key: 'message' },
            {
              title: t('Statut'),
              dataIndex: 'status',
              key: 'status',
              render: (status: string) => {
                const info = requestStatus()[status];
                return <StatusTag status={status} tone={info?.tone} label={info?.label} />;
              }
            }
          ]}
        />
      )}
    </Card>
  );
};
