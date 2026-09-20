import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spin, Card, Space, Typography } from 'antd';
import { ContactForm } from '../../components/crm/ContactForm';
import {
  getContact,
  createContact,
  updateContact,
  CrmContact,
  CreateCrmContactRequest,
  UpdateCrmContactRequest
} from '../../services/crm-service';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;

export const ContactFormPage: React.FC = () => {
  const { tenantId, contactId } = useParams<{ tenantId: string; contactId?: string }>();
  const navigate = useNavigate();
  const [contact, setContact] = React.useState<CrmContact | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (contactId && tenantId) {
      loadContact();
    }
  }, [contactId, tenantId]);

  const loadContact = async () => {
    if (!tenantId || !contactId) return;
    setLoading(true);
    try {
      const response = await getContact(tenantId, contactId);
      if (response.success) {
        setContact(response.data);
      }
    } catch (error) {
      console.error('Error loading contact:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (data: CreateCrmContactRequest | UpdateCrmContactRequest) => {
    if (!tenantId) return;
    try {
      if (contactId) {
        await updateContact(tenantId, contactId, data as UpdateCrmContactRequest);
      } else {
        await createContact(tenantId, data as CreateCrmContactRequest);
      }
      navigate(`/tenant/${tenantId}/crm/contacts`);
    } catch (error) {
      throw error;
    }
  };

  const handleCancel = () => {
    if (contactId && tenantId) {
      navigate(`/tenant/${tenantId}/crm/contacts/${contactId}`);
    } else if (tenantId) {
      navigate(`/tenant/${tenantId}/crm/contacts`);
    }
  };

  if (loading) {
    return (
      <>
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">{t('Chargement du contact...')}</Text>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <Card>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <Title level={2} style={{ margin: 0 }}>
                {contactId ? t('Modifier le contact') : t('Nouveau contact')}
              </Title>
              <Text type="secondary">
                {contactId ? t('Modifiez les informations du contact') : t('Créez un nouveau contact')}
              </Text>
            </div>
            <ContactForm contact={contact || undefined} onSubmit={handleSubmit} onCancel={handleCancel} />
          </Space>
        </Card>
      </div>
    </>
  );
};
