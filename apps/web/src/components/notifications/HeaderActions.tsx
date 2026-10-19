import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button } from 'antd';
import { MessageOutlined } from '@ant-design/icons';
import { useVisiblePolling } from '../../hooks/useVisiblePolling';
import { getMessagingUnreadCount } from '../../services/messaging-service';
import { NotificationBell, NOTIFICATION_POLL_MS } from './NotificationBell';
import { useNotificationScope } from './useNotificationScope';
import { t } from '../../i18n/t';

/**
 * Cloche de notifications et icône « Messagerie » de l'en-tête. Chargé à part
 * (`React.lazy` dans la coquille) : le chunk d'entrée n'en porte que le nom.
 * Sert l'agence et les trois portails (scope de `useNotificationScope`) ; rien n'est
 * rendu pour un compte sans scope (super-administrateur, compte non rattaché).
 */
const HeaderActions: React.FC = () => {
  const scope = useNotificationScope();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useVisiblePolling(
    async () => {
      if (!scope) return false;
      try {
        setUnread(await getMessagingUnreadCount(scope));
      } catch {
        // Dernière valeur conservée.
      }
      return undefined;
    },
    {
      enabled: Boolean(scope),
      intervalMs: NOTIFICATION_POLL_MS,
      resetKey: scope ? (scope.kind === 'agency' ? scope.tenantId : scope.portal) : null
    }
  );

  if (!scope) return null;

  return (
    <>
      <NotificationBell scope={scope} />
      <Badge count={unread} size="small" overflowCount={99} offset={[-4, 4]}>
        <Button
          type="text"
          aria-label={unread > 0 ? t('Messagerie ({{count}} non lues)', { count: unread }) : t('Messagerie')}
          icon={<MessageOutlined style={{ fontSize: 20 }} />}
          style={{ minWidth: 44, height: 44 }}
          onClick={() => navigate('/messages')}
        />
      </Badge>
    </>
  );
};

export default HeaderActions;
