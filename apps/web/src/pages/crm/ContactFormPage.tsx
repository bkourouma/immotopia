import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { App, Card } from 'antd';
import { ContactForm } from '../../components/crm/ContactForm';
import { PageHeader, StateBlock, SkeletonDetail } from '../../components/primitives';
import {
  getContact,
  createContact,
  updateContact,
  CrmContact,
  CreateCrmContactRequest,
  UpdateCrmContactRequest
} from '../../services/crm-service';
import { t } from '../../i18n/t';

export const ContactFormPage: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId, contactId } = useParams<{ tenantId: string; contactId?: string }>();
  const navigate = useNavigate();
  const [contact, setContact] = React.useState<CrmContact | null>(null);
  // En modification, le formulaire ne s'affiche qu'une fois la fiche lue : jamais un formulaire vide à la place.
  const [loading, setLoading] = React.useState(Boolean(contactId));
  const [loadError, setLoadError] = React.useState(false);

  const loadContact = React.useCallback(async () => {
    if (!tenantId || !contactId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const response = await getContact(tenantId, contactId);
      if (response.success) {
        setContact(response.data);
      } else {
        setLoadError(true);
      }
    } catch (error) {
      console.error('Error loading contact:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [tenantId, contactId]);

  React.useEffect(() => {
    if (contactId && tenantId) {
      void loadContact();
    }
  }, [contactId, tenantId, loadContact]);

  const handleSubmit = async (data: CreateCrmContactRequest | UpdateCrmContactRequest) => {
    if (!tenantId) return;
    if (contactId) {
      await updateContact(tenantId, contactId, data as UpdateCrmContactRequest);
    } else {
      await createContact(tenantId, data as CreateCrmContactRequest);
    }
    message.success(t('Contact enregistré'));
    navigate(`/tenant/${tenantId}/crm/contacts`);
  };

  const handleCancel = () => {
    if (contactId && tenantId) {
      navigate(`/tenant/${tenantId}/crm/contacts/${contactId}`);
    } else if (tenantId) {
      navigate(`/tenant/${tenantId}/crm/contacts`);
    }
  };

  const title = contactId ? t('Modifier le contact') : t('Nouveau contact');

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader
        title={title}
        subtitle={contactId ? t('Modifiez les informations du contact') : t('Créez un nouveau contact')}
        breadcrumbs={[{ label: t('Contacts'), to: `/tenant/${tenantId}/crm/contacts` }, { label: title }]}
      />
      {loading ? (
        <SkeletonDetail aria-label={t('Chargement du contact...')} />
      ) : loadError ? (
        <StateBlock
          variant="error"
          description={t('Impossible de charger ce contact. Vérifiez votre connexion puis réessayez.')}
          onRetry={() => void loadContact()}
        />
      ) : (
        <Card>
          <ContactForm contact={contact || undefined} onSubmit={handleSubmit} onCancel={handleCancel} />
        </Card>
      )}
    </div>
  );
};
