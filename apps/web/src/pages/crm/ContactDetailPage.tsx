import React from 'react';
import { useParams } from 'react-router-dom';
import { Alert } from 'antd';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { ContactDetail } from '../../components/crm/ContactDetail';

export const ContactDetailPage: React.FC = () => {
  const { tenantId, contactId } = useParams<{ tenantId: string; contactId: string }>();

  if (!tenantId || !contactId) {
    return (
      <DashboardLayout>
        <Alert
          message="Paramètres invalides"
          description="Les paramètres de la route sont manquants ou invalides."
          type="error"
          showIcon
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <ContactDetail tenantId={tenantId} contactId={contactId} />
    </DashboardLayout>
  );
};





