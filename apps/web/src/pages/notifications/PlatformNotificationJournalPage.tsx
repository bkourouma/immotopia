import React from 'react';
import { Space, Typography } from 'antd';
import { NotificationJournal } from '../../components/notifications/NotificationJournal';
import { t } from '../../i18n/t';

const { Title, Paragraph } = Typography;

/** Journal des notifications de toutes les agences (super-administrateur). */
export const PlatformNotificationJournalPage: React.FC = () => (
  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    <div>
      <Title level={2} style={{ margin: 0 }}>
        {t('Notifications (plateforme)')}
      </Title>
      <Paragraph type="secondary" style={{ margin: 0 }}>
        {t("Les notifications de toutes les agences, avec les échecs d'envoi à rejouer.")}
      </Paragraph>
    </div>
    <NotificationJournal mode={{ kind: 'platform' }} />
  </Space>
);

export default PlatformNotificationJournalPage;
