import type { HelpRoute } from '../../types';

/** Motifs de route -> fiche de page du module « communication ». */
export const routes: HelpRoute[] = [
  { pattern: '/dashboard', helpId: 'communication.accueil.tableau-de-bord' },
  { pattern: '/tenant/:tenantId/assistant', helpId: 'communication.assistant.page' },
  { pattern: '/notifications', helpId: 'communication.messagerie.notifications' },
  { pattern: '/messages', helpId: 'communication.messagerie.messages' },
  { pattern: '/messages/:conversationId', helpId: 'communication.messagerie.messages' },
  { pattern: '/tenant/:tenantId/notifications-journal', helpId: 'communication.messagerie.journal' },
  { pattern: '/admin/notifications', helpId: 'communication.messagerie.journal-plateforme' },
  { pattern: '/tenant/:tenantId/communication/email-notifications', helpId: 'communication.canaux.email' },
  { pattern: '/tenant/:tenantId/email-notifications', helpId: 'communication.canaux.email' },
  { pattern: '/tenant/:tenantId/communication/whatsapp-notifications', helpId: 'communication.canaux.whatsapp' },
  { pattern: '/tenant/:tenantId/communication/whatsapp-group-message', helpId: 'communication.canaux.whatsapp-groupe' },
  { pattern: '/tenant/:tenantId/newsletter/lists', helpId: 'communication.newsletter.listes' },
  { pattern: '/tenant/:tenantId/newsletter/campaigns', helpId: 'communication.newsletter.campagnes' },
  { pattern: '/tenant/:tenantId/newsletter/templates', helpId: 'communication.newsletter.modeles' },
  { pattern: '/tenant/:tenantId/documents/templates', helpId: 'communication.documents.modeles' }
];
