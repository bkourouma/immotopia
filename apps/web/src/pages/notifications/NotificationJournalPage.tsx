import React from 'react';
import { useParams } from 'react-router-dom';
import { Space, Typography } from 'antd';
import { NotificationJournal } from '../../components/notifications/NotificationJournal';
import { t } from '../../i18n/t';

const { Title, Paragraph } = Typography;

/** Journal des notifications de l'agence (permission TENANT_NOTIFICATIONS_ADMIN). */
export const NotificationJournalPage: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div>
        <Title level={2} style={{ margin: 0 }}>
          {t('Journal des notifications')}
        </Title>
        <Paragraph type="secondary" style={{ margin: 0 }}>
          {t("Toutes les notifications envoyées par l'agence, canal par canal, avec les échecs et leur motif.")}
        </Paragraph>
      </div>
      {tenantId && <NotificationJournal mode={{ kind: 'agency', tenantId }} />}
    </Space>
  );
};

export default NotificationJournalPage;
