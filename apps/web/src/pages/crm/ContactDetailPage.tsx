import React from 'react';
import { useParams } from 'react-router-dom';
import { Alert } from 'antd';
import { ContactDetail } from '../../components/crm/ContactDetail';
import { t } from '../../i18n/t';

export const ContactDetailPage: React.FC = () => {
  const { tenantId, contactId } = useParams<{ tenantId: string; contactId: string }>();

  if (!tenantId || !contactId) {
    return (
      <>
        <Alert
          message={t('Paramètres invalides')}
          description={t('Les paramètres de la route sont manquants ou invalides.')}
          type="error"
          showIcon
        />
      </>
    );
  }

  return (
    <>
      <ContactDetail tenantId={tenantId} contactId={contactId} />
    </>
  );
};
