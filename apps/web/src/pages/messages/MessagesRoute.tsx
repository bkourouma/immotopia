import React from 'react';
import { useNotificationScope } from '../../components/notifications/useNotificationScope';
import MessagesPage from './MessagesPage';

/**
 * Page Messagerie des routes `/messages` : un client de portail impose son scope
 * (le serveur ne lui montre que le personnel) ; pour l'agence, la page garde son
 * propre calcul (agence active de la session).
 */
const MessagesRoute: React.FC = () => {
  const scope = useNotificationScope();
  return <MessagesPage scope={scope?.kind === 'portal' ? scope : undefined} />;
};

export default MessagesRoute;
