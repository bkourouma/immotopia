/**
 * Cles des notifications WhatsApp (provider-agnostic: WaSender/Twilio).
 * Sous-ensemble d'evenements pertinents pour le canal WhatsApp
 * (destinataires avec numero + consent_whatsapp).
 */
export const WHATSAPP_NOTIFICATION_KEYS = [
  'MAINTENANCE_TICKET_CREATED_AGENCY',
  'MAINTENANCE_TICKET_CREATED_TENANT',
  'MAINTENANCE_TICKET_STATUS_CHANGED_TENANT',
  'PAYMENT_APPROVED_TENANT',
  'PAYMENT_REJECTED_TENANT',
  'PAYMENT_ALLOCATED_TENANT',
  'INSTALLMENT_DUE_REMINDER',
  'INSTALLMENT_OVERDUE',
  'LEASE_ACTIVATED',
  'LEASE_ENDING_SOON',
  'DEPOSIT_MOVEMENT_TENANT',
  'APPOINTMENT_REMINDER',
  'DEAL_STAGE_CHANGED',
  'CRM_CONTACT_GROUP_INVITE',
  'PROPERTY_PUBLISHED_GROUP_BROADCAST',
  'PORTAL_ACCOUNT_CREATED',
  'OWNER_STATEMENT_SENT',
  // Syndic – appels de charges & AG & incidents
  'CHARGE_CALL_ISSUED',
  'CHARGE_CALL_REMINDER',
  'GENERAL_MEETING_CONVOCATION',
  'GENERAL_MEETING_MINUTES',
  'CONTRACT_RENEWAL_ALERT',
  'COMMON_AREA_INCIDENT'
] as const;

export type WhatsappNotificationKey = (typeof WHATSAPP_NOTIFICATION_KEYS)[number];

export interface WhatsappNotificationMeta {
  key: WhatsappNotificationKey;
  label: string;
  description: string;
  recipientLabel: string;
}

export const WHATSAPP_NOTIFICATION_META: Record<WhatsappNotificationKey, WhatsappNotificationMeta> = {
  MAINTENANCE_TICKET_CREATED_AGENCY: {
    key: 'MAINTENANCE_TICKET_CREATED_AGENCY',
    label: 'Nouveau ticket de maintenance (agence)',
    description:
      "Envoyé à l'agence (admins) lorsqu'un locataire crée un ticket. Envoi aux contacts CRM dont l'email correspond à un admin et qui ont consentement WhatsApp.",
    recipientLabel: 'Agence (admins)'
  },
  MAINTENANCE_TICKET_CREATED_TENANT: {
    key: 'MAINTENANCE_TICKET_CREATED_TENANT',
    label: 'Nouveau ticket de maintenance',
    description: 'Accusé de réception WhatsApp au locataire après création de son ticket.',
    recipientLabel: 'Locataire'
  },
  MAINTENANCE_TICKET_STATUS_CHANGED_TENANT: {
    key: 'MAINTENANCE_TICKET_STATUS_CHANGED_TENANT',
    label: 'Changement de statut du ticket (locataire)',
    description: 'Envoyé au locataire lorsque le statut de son ticket de maintenance change.',
    recipientLabel: 'Locataire'
  },
  PAYMENT_APPROVED_TENANT: {
    key: 'PAYMENT_APPROVED_TENANT',
    label: 'Paiement approuvé (locataire)',
    description: "Envoyé au locataire lorsque l'agence approuve sa déclaration de paiement.",
    recipientLabel: 'Locataire'
  },
  PAYMENT_REJECTED_TENANT: {
    key: 'PAYMENT_REJECTED_TENANT',
    label: 'Paiement rejeté (locataire)',
    description: "Envoyé au locataire lorsque l'agence rejette sa déclaration de paiement.",
    recipientLabel: 'Locataire'
  },
  PAYMENT_ALLOCATED_TENANT: {
    key: 'PAYMENT_ALLOCATED_TENANT',
    label: 'Paiement alloué aux échéances (locataire)',
    description: "Envoyé au locataire lorsque l'agence alloue son paiement à des échéances.",
    recipientLabel: 'Locataire'
  },
  INSTALLMENT_DUE_REMINDER: {
    key: 'INSTALLMENT_DUE_REMINDER',
    label: "Rappel d'échéance (loyer)",
    description: "Rappel envoyé avant l'échéance du loyer.",
    recipientLabel: 'Locataire'
  },
  INSTALLMENT_OVERDUE: {
    key: 'INSTALLMENT_OVERDUE',
    label: 'Échéance dépassée (impayé)',
    description: "Notification d'échéance en retard.",
    recipientLabel: 'Locataire'
  },
  LEASE_ACTIVATED: {
    key: 'LEASE_ACTIVATED',
    label: 'Bail activé',
    description: 'Envoyé lorsque le bail est activé.',
    recipientLabel: 'Locataire'
  },
  LEASE_ENDING_SOON: {
    key: 'LEASE_ENDING_SOON',
    label: 'Fin de bail prochaine',
    description: 'Rappel de fin de bail (ex. 30 jours avant).',
    recipientLabel: 'Locataire'
  },
  DEPOSIT_MOVEMENT_TENANT: {
    key: 'DEPOSIT_MOVEMENT_TENANT',
    label: 'Mouvement sur le dépôt de garantie (locataire)',
    description: "Envoyé au locataire lorsqu'un mouvement est enregistré sur le dépôt de garantie.",
    recipientLabel: 'Locataire'
  },
  APPOINTMENT_REMINDER: {
    key: 'APPOINTMENT_REMINDER',
    label: 'Rappel rendez-vous',
    description: 'Rappel de rendez-vous CRM.',
    recipientLabel: 'Contact'
  },
  DEAL_STAGE_CHANGED: {
    key: 'DEAL_STAGE_CHANGED',
    label: 'Étape affaire modifiée',
    description: "Changement d'étape d'une affaire CRM.",
    recipientLabel: 'Contact CRM'
  },
  CRM_CONTACT_GROUP_INVITE: {
    key: 'CRM_CONTACT_GROUP_INVITE',
    label: 'Invitation groupe WhatsApp (contact CRM)',
    description:
      'Envoyé automatiquement au contact CRM (avec consentement WhatsApp) pour rejoindre le groupe WhatsApp de diffusion des nouvelles propriétés.',
    recipientLabel: 'Contact CRM'
  },
  PROPERTY_PUBLISHED_GROUP_BROADCAST: {
    key: 'PROPERTY_PUBLISHED_GROUP_BROADCAST',
    label: 'Annonce de bien publié (groupe WhatsApp)',
    description: 'Publie automatiquement une annonce dans le groupe WhatsApp quand un bien est publié.',
    recipientLabel: 'Groupe WhatsApp'
  },
  PORTAL_ACCOUNT_CREATED: {
    key: 'PORTAL_ACCOUNT_CREATED',
    label: 'Compte portail créé',
    description:
      'Envoyé lorsqu’un compte utilisateur est créé et lié automatiquement à partir d’un contact CRM (invitation à définir le mot de passe).',
    recipientLabel: 'Contact CRM'
  },
  OWNER_STATEMENT_SENT: {
    key: 'OWNER_STATEMENT_SENT',
    label: 'Relevé de gérance envoyé (WhatsApp)',
    description: 'Envoi WhatsApp du relevé de gérance au propriétaire quand un numéro est renseigné.',
    recipientLabel: 'Propriétaire'
  },
  CHARGE_CALL_ISSUED: {
    key: 'CHARGE_CALL_ISSUED',
    label: 'Appel de charges émis (WhatsApp)',
    description: 'Envoyé au copropriétaire lorsqu’un nouvel appel de charges est émis pour son lot.',
    recipientLabel: 'Copropriétaire'
  },
  CHARGE_CALL_REMINDER: {
    key: 'CHARGE_CALL_REMINDER',
    label: 'Rappel appel de charges (WhatsApp)',
    description: 'Rappel WhatsApp avant ou après l’échéance d’un appel de charges.',
    recipientLabel: 'Copropriétaire'
  },
  GENERAL_MEETING_CONVOCATION: {
    key: 'GENERAL_MEETING_CONVOCATION',
    label: 'Convocation AG (WhatsApp)',
    description: 'Convocation à une Assemblée Générale de copropriété envoyée par WhatsApp.',
    recipientLabel: 'Copropriétaire'
  },
  GENERAL_MEETING_MINUTES: {
    key: 'GENERAL_MEETING_MINUTES',
    label: 'PV d’AG (WhatsApp)',
    description: 'Envoi du lien vers le procès-verbal d’Assemblée Générale.',
    recipientLabel: 'Copropriétaire'
  },
  CONTRACT_RENEWAL_ALERT: {
    key: 'CONTRACT_RENEWAL_ALERT',
    label: 'Alerte renouvellement contrat (WhatsApp)',
    description: 'Alerte WhatsApp à l’agence pour un contrat prestataire arrivant à échéance.',
    recipientLabel: 'Agence / Gestionnaire'
  },
  COMMON_AREA_INCIDENT: {
    key: 'COMMON_AREA_INCIDENT',
    label: 'Incident partie commune (WhatsApp)',
    description: 'Notification d’incident sur une partie commune (ascenseur, portail, etc.).',
    recipientLabel: 'Agence / Gestionnaire'
  }
};
