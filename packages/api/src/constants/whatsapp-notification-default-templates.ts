/**
 * Messages par défaut (texte seul) pour les notifications WhatsApp.
 * Variables au format {{nom}} (ex: {{ticketTitle}}, {{agencyName}}).
 */
import type { WhatsappNotificationKey } from './whatsapp-notification-keys';

export const WHATSAPP_NOTIFICATION_DEFAULT_TEMPLATES: Record<WhatsappNotificationKey, string> = {
  MAINTENANCE_TICKET_CREATED_AGENCY:
    'Nouveau ticket de maintenance : {{ticketTitle}}. Locataire : {{renterName}}. Propriété : {{propertyReference}}. Créé le {{ticketCreatedAt}}. {{agencyName}}.',
  MAINTENANCE_TICKET_CREATED_TENANT:
    'Bonjour {{tenantName}}, votre demande de maintenance "{{ticketTitle}}" a bien été enregistrée par {{agencyName}}. Propriété : {{propertyReference}}. Suivez votre ticket dans le portail locataire.',
  MAINTENANCE_TICKET_STATUS_CHANGED_TENANT:
    'Bonjour {{tenantName}}, le statut de votre ticket "{{ticketTitle}}" a été mis à jour : {{newStatusLabel}}. {{agencyName}}.',
  PAYMENT_APPROVED_TENANT:
    'Bonjour {{tenantName}}, votre déclaration de paiement a été approuvée par {{agencyName}}. Merci.',
  PAYMENT_REJECTED_TENANT:
    'Bonjour {{tenantName}}, votre déclaration de paiement a été rejetée par {{agencyName}}. Contactez l’agence pour plus d’informations.',
  PAYMENT_ALLOCATED_TENANT:
    'Bonjour {{tenantName}}, votre paiement a été alloué aux échéances ({{amountAllocated}}). Bail {{leaseLabel}}. {{agencyName}}.',
  INSTALLMENT_DUE_REMINDER:
    'Bonjour {{tenantName}}, rappel : votre échéance de loyer est prévue le {{dueDate}}. Montant : {{amount}}. {{agencyName}}.',
  INSTALLMENT_OVERDUE:
    'Bonjour {{tenantName}}, votre échéance du {{dueDate}} n’a pas été réglée. Merci de régulariser au plus tôt. {{agencyName}}.',
  LEASE_ACTIVATED:
    'Bonjour {{tenantName}}, votre bail {{leaseLabel}} a été activé. Période : {{leaseStartDate}} à {{leaseEndDate}}. Loyer : {{rentAmount}}. Connexion : {{loginUrl}}. Mot de passe oublié : {{forgotPasswordUrl}}. {{agencyName}} vous souhaite une bonne installation.',
  LEASE_ENDING_SOON:
    'Bonjour {{tenantName}}, votre bail se termine bientôt ({{endDate}}). Pensez à prendre contact avec {{agencyName}} pour la suite.',
  DEPOSIT_MOVEMENT_TENANT:
    'Bonjour {{tenantName}}, un mouvement sur votre dépôt de garantie : {{movementTypeLabel}}, {{amount}} {{currency}}. Bail {{leaseLabel}}. {{agencyName}}.',
  APPOINTMENT_REMINDER: 'Rappel : vous avez un rendez-vous prévu le {{appointmentDate}}. {{agencyName}}.',
  DEAL_STAGE_CHANGED:
    'Bonjour {{contactName}}, l’étape de votre affaire a été mise à jour : {{stageLabel}}. {{agencyName}}.',
  CRM_CONTACT_GROUP_INVITE:
    'Bonjour {{contactName}}, rejoignez notre groupe WhatsApp pour recevoir les nouvelles propriétés disponibles.\nLien d’invitation :\n{{inviteLink}}',
  PROPERTY_PUBLISHED_GROUP_BROADCAST:
    '✨ *NOUVEAU BIEN DISPONIBLE*\n🏠 *{{propertyTitle}}*\n\n🏷️ Type: {{propertyTypeLabel}}\n🔁 Transaction: {{transactionModesLabel}}\n💰 Prix: *{{propertyPrice}}*\n📍 Adresse: {{propertyAddress}}\n🧭 Zone: {{locationZone}}\n\n📌 *Caractéristiques*\n• Surface: {{surfaceAreaLabel}}\n• Pièces: {{roomsLabel}}\n• Chambres: {{bedroomsLabel}}\n• SDB: {{bathroomsLabel}}\n• Ameublement: {{furnishingStatusLabel}}\n• Disponibilité: {{availabilityLabel}}\n\n📝 {{propertySummary}}\n\n👉 Voir l’annonce:\n{{propertyPublicUrl}}\n\n⏱️ Publié le {{publishedAtLabel}}',
  PORTAL_ACCOUNT_CREATED:
    'Bonjour {{userName}}, votre compte ImmoTopia a été créé pour {{tenantName}}. Définissez votre mot de passe ici :\n{{resetUrl}}',
  OWNER_STATEMENT_SENT:
    'Bonjour {{ownerName}}, votre relevé de gérance pour la période {{period}} est disponible. Loyers encaissés : {{totalRevenue}} {{currency}}, honoraires : {{managementFees}} {{currency}}, TVA : {{managementFeesVat}} {{currency}}, dépenses : {{totalExpenses}} {{currency}}. Net à vous reverser : {{netAmount}} {{currency}}.',
  OWNER_LEASE_ENDING_SOON:
    'Bonjour {{ownerName}}, le bail {{leaseLabel}} arrive à échéance le {{leaseEndDate}}. Contactez {{agencyName}} pour préparer la suite.',
  OWNER_DOCUMENT_EXPIRY_ALERT:
    'Bonjour {{ownerName}}, le document « {{documentTitle}} » ({{documentType}}) du bien {{propertyReference}} expire le {{expiresAt}}. Pensez à le renouveler.',
  OWNER_MONTHLY_REPORT_SENT:
    'Bonjour {{ownerName}}, votre rapport mensuel {{agencyName}} pour la période {{period}} est disponible : {{reportUrl}} (lien personnel en lecture seule, valable jusqu’au {{expiresAt}}).',
  RENTER_PAYMENT_LINK_SENT:
    'Bonjour {{renterName}}, votre loyer {{agencyName}} pour la période {{period}} est à régler : {{amountDue}}. Payez en ligne par Mobile Money : {{paymentUrl}} (lien personnel, valable jusqu’au {{expiresAt}}).',
  CHARGE_CALL_ISSUED:
    'Bonjour {{ownerName}}, un nouvel appel de charges a été émis pour votre lot {{lotLabel}} dans la copropriété {{syndicateName}}. Montant : {{amount}} {{currency}}. Échéance : {{dueDate}}.',
  CHARGE_CALL_REMINDER:
    'Bonjour {{ownerName}}, rappel pour l’appel de charges de la période {{period}} concernant le lot {{lotLabel}}. Montant restant : {{remainingAmount}} {{currency}}. Échéance : {{dueDate}}.',
  GENERAL_MEETING_CONVOCATION:
    'Bonjour {{ownerName}}, vous êtes convoqué(e) à l’assemblée générale de la copropriété {{syndicateName}} le {{meetingDate}} à {{meetingTime}}, lieu : {{meetingLocation}}.',
  GENERAL_MEETING_MINUTES:
    'Bonjour {{ownerName}}, le procès-verbal de l’assemblée générale de la copropriété {{syndicateName}} est disponible ici : {{minutesUrl}}',
  CONTRACT_RENEWAL_ALERT:
    'Alerte contrat : le contrat {{contractNature}} du prestataire {{providerName}} pour la copropriété {{syndicateName}} arrive à échéance le {{contractEndDate}}.',
  COMMON_AREA_INCIDENT:
    'Incident partie commune : {{assetName}} dans la copropriété {{syndicateName}}. Description : {{incidentDescription}}.'
};
