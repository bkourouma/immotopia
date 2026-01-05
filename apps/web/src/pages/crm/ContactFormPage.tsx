import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { ContactForm } from '../../components/crm/ContactForm';
import { getContact, createContact, updateContact, CrmContact, CreateCrmContactRequest, UpdateCrmContactRequest } from '../../services/crm-service';

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
      <DashboardLayout>
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="mt-2 text-gray-600">Loading contact...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto overflow-visible">
        <div className="bg-white rounded-lg shadow p-6 overflow-visible">
          <h1 className="text-2xl font-bold mb-6">
            {contactId ? 'Edit Contact' : 'New Contact'}
          </h1>
          <ContactForm
            contact={contact || undefined}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};





