/**
 * Messages par defaut (texte seul) pour les notifications WhatsApp.
 * Variables au format {{nom}} (ex: {{ticketTitle}}, {{agencyName}}).
 */
import type { WhatsappNotificationKey } from './whatsapp-notification-keys';

export const WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES: Record<WhatsappNotificationKey, string> = {
  MAINTENANCE_TICKET_CREATED_AGENCY:
    'Nouveau ticket de maintenance : {{ticketTitle}}. Locataire : {{renterName}}. Propriete : {{propertyReference}}. Cree le {{ticketCreatedAt}}. {{agencyName}}.',
  MAINTENANCE_TICKET_CREATED_TENANT:
    'Bonjour {{tenantName}}, votre demande de maintenance "{{ticketTitle}}" a bien ete enregistree par {{agencyName}}. Propriete : {{propertyReference}}. Suivez votre ticket dans le portail locataire.',
  MAINTENANCE_TICKET_STATUS_CHANGED_TENANT:
    'Bonjour {{tenantName}}, le statut de votre ticket "{{ticketTitle}}" a ete mis a jour : {{newStatusLabel}}. {{agencyName}}.',
  PAYMENT_APPROVED_TENANT:
    'Bonjour {{tenantName}}, votre declaration de paiement a ete approuvee par {{agencyName}}. Merci.',
  PAYMENT_REJECTED_TENANT:
    'Bonjour {{tenantName}}, votre declaration de paiement a ete rejetee par {{agencyName}}. Contactez l agence pour plus d informations.',
  PAYMENT_ALLOCATED_TENANT:
    'Bonjour {{tenantName}}, votre paiement a ete alloue aux echeances ({{amountAllocated}}). Bail {{leaseLabel}}. {{agencyName}}.',
  INSTALLMENT_DUE_REMINDER:
    'Bonjour {{tenantName}}, rappel : votre echeance de loyer est prevue le {{dueDate}}. Montant : {{amount}}. {{agencyName}}.',
  INSTALLMENT_OVERDUE:
    'Bonjour {{tenantName}}, votre echeance du {{dueDate}} n a pas ete reglee. Merci de regulariser au plus tot. {{agencyName}}.',
  LEASE_ACTIVATED:
    'Bonjour {{tenantName}}, votre bail {{leaseLabel}} a été activé. Période : {{leaseStartDate}} à {{leaseEndDate}}. Loyer : {{rentAmount}}. Connexion : {{loginUrl}}. Mot de passe oublié : {{forgotPasswordUrl}}. {{agencyName}} vous souhaite une bonne installation.',
  LEASE_ENDING_SOON:
    'Bonjour {{tenantName}}, votre bail se termine bientot ({{endDate}}). Pensez a prendre contact avec {{agencyName}} pour la suite.',
  DEPOSIT_MOVEMENT_TENANT:
    'Bonjour {{tenantName}}, un mouvement sur votre depot de garantie : {{movementTypeLabel}}, {{amount}} {{currency}}. Bail {{leaseLabel}}. {{agencyName}}.',
  APPOINTMENT_REMINDER: 'Rappel : vous avez un rendez-vous prevu le {{appointmentDate}}. {{agencyName}}.',
  DEAL_STAGE_CHANGED:
    'Bonjour {{contactName}}, l etape de votre affaire a ete mise a jour : {{stageLabel}}. {{agencyName}}.',
  CRM_CONTACT_GROUP_INVITE:
    'Bonjour {{contactName}}, rejoignez notre groupe WhatsApp pour recevoir les nouvelles proprietes disponibles.\nLien d invitation:\n{{inviteLink}}',
  PROPERTY_PUBLISHED_GROUP_BROADCAST:
    '✨ *NOUVEAU BIEN DISPONIBLE*\n🏠 *{{propertyTitle}}*\n\n🏷️ Type: {{propertyTypeLabel}}\n🔁 Transaction: {{transactionModesLabel}}\n💰 Prix: *{{propertyPrice}}*\n📍 Adresse: {{propertyAddress}}\n🧭 Zone: {{locationZone}}\n\n📌 *Caractéristiques*\n• Surface: {{surfaceAreaLabel}}\n• Pièces: {{roomsLabel}}\n• Chambres: {{bedroomsLabel}}\n• SDB: {{bathroomsLabel}}\n• Ameublement: {{furnishingStatusLabel}}\n• Disponibilité: {{availabilityLabel}}\n\n📝 {{propertySummary}}\n\n👉 Voir l’annonce:\n{{propertyPublicUrl}}\n\n⏱️ Publié le {{publishedAtLabel}}',
  PORTAL_ACCOUNT_CREATED:
    'Bonjour {{userName}}, votre compte ImmoTopia a ete cree pour {{tenantName}}. Definissez votre mot de passe ici :\n{{resetUrl}}',
  OWNER_STATEMENT_SENT:
    'Bonjour {{ownerName}}, votre relevÃ© de gÃ©rance pour la pÃ©riode {{period}} est disponible. Revenus : {{totalRevenue}} {{currency}}, charges : {{totalExpenses}} {{currency}}, net : {{netAmount}} {{currency}}.',
  CHARGE_CALL_ISSUED:
    'Bonjour {{ownerName}}, un nouvel appel de charges a Ã©tÃ© Ã©mis pour votre lot {{lotLabel}} dans la copropriÃ©tÃ© {{syndicateName}}. Montant : {{amount}} {{currency}}. Ã‰chÃ©ance : {{dueDate}}.',
  CHARGE_CALL_REMINDER:
    'Bonjour {{ownerName}}, rappel pour l appel de charges de la pÃ©riode {{period}} concernant le lot {{lotLabel}}. Montant restant : {{remainingAmount}} {{currency}}. Ã‰chÃ©ance : {{dueDate}}.',
  GENERAL_MEETING_CONVOCATION:
    'Bonjour {{ownerName}}, vous etes convoque a l assemblee generale de la copropriete {{syndicateName}} le {{meetingDate}} a {{meetingTime}}, lieu : {{meetingLocation}}.',
  GENERAL_MEETING_MINUTES:
    'Bonjour {{ownerName}}, le proces-verbal de l assemblee generale de la copropriete {{syndicateName}} est disponible ici : {{minutesUrl}}',
  CONTRACT_RENEWAL_ALERT:
    'Alerte contrat : le contrat {{contractNature}} du prestataire {{providerName}} pour la copropriete {{syndicateName}} arrive a echeance le {{contractEndDate}}.',
  COMMON_AREA_INCIDENT:
    'Incident partie commune : {{assetName}} dans la copropriete {{syndicateName}}. Description : {{incidentDescription}}.'
};
