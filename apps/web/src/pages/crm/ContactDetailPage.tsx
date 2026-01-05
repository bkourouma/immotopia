import React from 'react';
import { useParams } from 'react-router-dom';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { ContactDetail } from '../../components/crm/ContactDetail';

export const ContactDetailPage: React.FC = () => {
  const { tenantId, contactId } = useParams<{ tenantId: string; contactId: string }>();

  if (!tenantId || !contactId) {
    return <div>Invalid route parameters</div>;
  }

  return (
    <DashboardLayout>
      <ContactDetail tenantId={tenantId} contactId={contactId} />
    </DashboardLayout>
  );
};





