/**
 * Clés des notifications email implémentées en dur.
 * Chaque clé correspond à un type d'email envoyé par l'application.
 */
export const EMAIL_NOTIFICATION_KEYS = [
  // Maintenance
  'MAINTENANCE_TICKET_CREATED_AGENCY',
  'MAINTENANCE_TICKET_CREATED_TENANT',
  'MAINTENANCE_TICKET_CREATED_OWNER',
  'MAINTENANCE_TICKET_STATUS_CHANGED_TENANT',
  'MAINTENANCE_TICKET_STATUS_CHANGED_OWNER',
  // Paiements
  'PAYMENT_DECLARATION_AGENCY',
  'PAYMENT_APPROVED_TENANT',
  'PAYMENT_APPROVED_OWNER',
  'PAYMENT_REJECTED_TENANT',
  'PAYMENT_REJECTED_OWNER',
  'PAYMENT_ALLOCATED_TENANT',
  'PAYMENT_ALLOCATED_OWNER',
  'PAYMENT_RECEIVED',
  'PAYMENT_CONFIRMED',
  'INSTALLMENT_DUE_REMINDER',
  'INSTALLMENT_OVERDUE',
  // Baux
  'LEASE_ACTIVATED',
  'LEASE_ENDING_SOON',
  'DEPOSIT_MOVEMENT_TENANT',
  'DEPOSIT_MOVEMENT_OWNER',
  // CRM
  'DEAL_CREATED',
  'DEAL_STAGE_CHANGED',
  'APPOINTMENT_REMINDER',
  // Propriétés & documents
  'PROPERTY_PUBLISHED',
  'DOCUMENT_EXPIRING',
  // Autres
  'INVITATION',
  'PASSWORD_RESET',
  'CUSTOM',
  // Syndic – appels de charges & AG & contrats
  'CHARGE_CALL_ISSUED',
  'CHARGE_CALL_REMINDER',
  'CHARGE_PAYMENT_RECEIPT',
  'CHARGE_CALL_SETTLED',
  'GENERAL_MEETING_CONVOCATION',
  'GENERAL_MEETING_MINUTES',
  'CONTRACT_RENEWAL_ALERT',
  'COMMON_AREA_INCIDENT',
  // Patrimoine
  'OWNER_STATEMENT_SENT',
  'LOAN_MATURITY_ALERT',
  'INSURANCE_DEADLINE_ALERT',
  'DOCUMENT_EXPIRY_ALERT',
  'WORK_PROGRAM_REMINDER',
  'LAND_STEP_OVERDUE_ALERT',
  'OWNER_MONTHLY_REPORT_SENT'
] as const;

export type EmailNotificationKey = (typeof EMAIL_NOTIFICATION_KEYS)[number];

export interface EmailNotificationMeta {
  key: EmailNotificationKey;
  label: string;
  description: string;
  recipientLabel: string;
}

export const EMAIL_NOTIFICATION_META: Record<EmailNotificationKey, EmailNotificationMeta> = {
  MAINTENANCE_TICKET_CREATED_AGENCY: {
    key: 'MAINTENANCE_TICKET_CREATED_AGENCY',
    label: 'Nouveau ticket de maintenance (agence)',
    description: "Envoyé à l'agence lorsqu'un locataire crée un ticket de maintenance.",
    recipientLabel: 'Agence (admins)'
  },
  MAINTENANCE_TICKET_CREATED_TENANT: {
    key: 'MAINTENANCE_TICKET_CREATED_TENANT',
    label: 'Nouveau ticket de maintenance (locataire)',
    description: 'Accusé de réception envoyé au locataire après création de son ticket.',
    recipientLabel: 'Locataire'
  },
  MAINTENANCE_TICKET_CREATED_OWNER: {
    key: 'MAINTENANCE_TICKET_CREATED_OWNER',
    label: 'Nouveau ticket de maintenance (propriétaire)',
    description: "Envoyé au propriétaire lorsqu'un ticket est créé sur son bien.",
    recipientLabel: 'Propriétaire'
  },
  MAINTENANCE_TICKET_STATUS_CHANGED_TENANT: {
    key: 'MAINTENANCE_TICKET_STATUS_CHANGED_TENANT',
    label: 'Changement de statut du ticket (locataire)',
    description: 'Envoyé au locataire lorsque le statut de son ticket de maintenance change.',
    recipientLabel: 'Locataire'
  },
  MAINTENANCE_TICKET_STATUS_CHANGED_OWNER: {
    key: 'MAINTENANCE_TICKET_STATUS_CHANGED_OWNER',
    label: 'Changement de statut du ticket (propriétaire)',
    description: "Envoyé au propriétaire lorsque le statut d'un ticket concernant son bien change.",
    recipientLabel: 'Propriétaire'
  },
  PAYMENT_DECLARATION_AGENCY: {
    key: 'PAYMENT_DECLARATION_AGENCY',
    label: 'Déclaration de paiement',
    description: "Envoyé à l'agence (et au propriétaire) lorsqu'un locataire déclare un paiement.",
    recipientLabel: 'Agence + Propriétaire'
  },
  PAYMENT_APPROVED_TENANT: {
    key: 'PAYMENT_APPROVED_TENANT',
    label: 'Paiement approuvé (locataire)',
    description: "Envoyé au locataire lorsque l'agence approuve sa déclaration de paiement.",
    recipientLabel: 'Locataire'
  },
  PAYMENT_APPROVED_OWNER: {
    key: 'PAYMENT_APPROVED_OWNER',
    label: 'Paiement approuvé (propriétaire)',
    description: 'Envoyé au propriétaire lorsque la déclaration de paiement de son locataire est approuvée.',
    recipientLabel: 'Propriétaire'
  },
  PAYMENT_REJECTED_TENANT: {
    key: 'PAYMENT_REJECTED_TENANT',
    label: 'Paiement rejeté (locataire)',
    description: "Envoyé au locataire lorsque l'agence rejette sa déclaration de paiement.",
    recipientLabel: 'Locataire'
  },
  PAYMENT_REJECTED_OWNER: {
    key: 'PAYMENT_REJECTED_OWNER',
    label: 'Paiement rejeté (propriétaire)',
    description: 'Envoyé au propriétaire lorsque la déclaration de paiement de son locataire est rejetée.',
    recipientLabel: 'Propriétaire'
  },
  PAYMENT_ALLOCATED_TENANT: {
    key: 'PAYMENT_ALLOCATED_TENANT',
    label: 'Paiement alloué aux échéances (locataire)',
    description: "Envoyé au locataire lorsque l'agence alloue son paiement à des échéances.",
    recipientLabel: 'Locataire'
  },
  PAYMENT_ALLOCATED_OWNER: {
    key: 'PAYMENT_ALLOCATED_OWNER',
    label: 'Paiement alloué aux échéances (propriétaire)',
    description: "Envoyé au propriétaire lorsque l'agence alloue le paiement du locataire aux échéances.",
    recipientLabel: 'Propriétaire'
  },
  DEPOSIT_MOVEMENT_TENANT: {
    key: 'DEPOSIT_MOVEMENT_TENANT',
    label: 'Mouvement sur le dépôt de garantie (locataire)',
    description:
      "Envoyé au locataire lorsqu'un mouvement est enregistré sur le dépôt de garantie (collecte, remboursement, blocage, etc.).",
    recipientLabel: 'Locataire'
  },
  DEPOSIT_MOVEMENT_OWNER: {
    key: 'DEPOSIT_MOVEMENT_OWNER',
    label: 'Mouvement sur le dépôt de garantie (propriétaire)',
    description: "Envoyé au propriétaire lorsqu'un mouvement est enregistré sur le dépôt de garantie du bail.",
    recipientLabel: 'Propriétaire'
  },
  PAYMENT_RECEIVED: {
    key: 'PAYMENT_RECEIVED',
    label: 'Paiement reçu',
    description: "Confirmation d'un paiement reçu (locataire ou propriétaire).",
    recipientLabel: 'Locataire / Propriétaire'
  },
  PAYMENT_CONFIRMED: {
    key: 'PAYMENT_CONFIRMED',
    label: 'Paiement confirmé',
    description: 'Notification de confirmation de paiement.',
    recipientLabel: 'Destinataire concerné'
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
    recipientLabel: 'Locataire / Propriétaire'
  },
  LEASE_ENDING_SOON: {
    key: 'LEASE_ENDING_SOON',
    label: 'Fin de bail prochaine',
    description: 'Rappel de fin de bail (ex. 30 jours avant).',
    recipientLabel: 'Locataire / Propriétaire'
  },
  DEAL_CREATED: {
    key: 'DEAL_CREATED',
    label: 'Affaire créée',
    description: "Notification de création d'une affaire CRM.",
    recipientLabel: 'Contact CRM / Agence'
  },
  DEAL_STAGE_CHANGED: {
    key: 'DEAL_STAGE_CHANGED',
    label: 'Étape affaire modifiée',
    description: "Changement d'étape d'une affaire CRM.",
    recipientLabel: 'Contact CRM / Agence'
  },
  APPOINTMENT_REMINDER: {
    key: 'APPOINTMENT_REMINDER',
    label: 'Rappel rendez-vous',
    description: 'Rappel de rendez-vous CRM.',
    recipientLabel: 'Contact'
  },
  PROPERTY_PUBLISHED: {
    key: 'PROPERTY_PUBLISHED',
    label: 'Propriété publiée',
    description: "Notification de publication d'une propriété.",
    recipientLabel: 'Agence / Contact'
  },
  DOCUMENT_EXPIRING: {
    key: 'DOCUMENT_EXPIRING',
    label: 'Document expirant',
    description: "Alerte d'expiration de document.",
    recipientLabel: 'Destinataire concerné'
  },
  CHARGE_CALL_ISSUED: {
    key: 'CHARGE_CALL_ISSUED',
    label: 'Appel de charges émis',
    description: 'Envoyé au copropriétaire lorsqu’un nouvel appel de charges est émis pour son lot.',
    recipientLabel: 'Copropriétaire'
  },
  CHARGE_CALL_REMINDER: {
    key: 'CHARGE_CALL_REMINDER',
    label: 'Rappel appel de charges',
    description: 'Rappel d’appel de charges proche de l’échéance ou en retard.',
    recipientLabel: 'Copropriétaire'
  },
  CHARGE_PAYMENT_RECEIPT: {
    key: 'CHARGE_PAYMENT_RECEIPT',
    label: 'Reçu de paiement de charges',
    description:
      'Envoyé au copropriétaire, avec le reçu PDF, quand un paiement laisse un reste dû ou est conservé en avance.',
    recipientLabel: 'Copropriétaire'
  },
  CHARGE_CALL_SETTLED: {
    key: 'CHARGE_CALL_SETTLED',
    label: 'Quittance de charges',
    description:
      'Envoyé au copropriétaire, avec la quittance PDF, quand un appel de charges est entièrement réglé (paiement ou avance).',
    recipientLabel: 'Copropriétaire'
  },
  GENERAL_MEETING_CONVOCATION: {
    key: 'GENERAL_MEETING_CONVOCATION',
    label: 'Convocation Assemblée Générale',
    description: 'Convocation à une Assemblée Générale de copropriété.',
    recipientLabel: 'Copropriétaire'
  },
  GENERAL_MEETING_MINUTES: {
    key: 'GENERAL_MEETING_MINUTES',
    label: 'Procès-verbal d’AG',
    description: 'Envoi du procès-verbal d’Assemblée Générale aux copropriétaires.',
    recipientLabel: 'Copropriétaire'
  },
  CONTRACT_RENEWAL_ALERT: {
    key: 'CONTRACT_RENEWAL_ALERT',
    label: 'Alerte renouvellement contrat prestataire',
    description: 'Alerte envoyée à l’agence pour un contrat prestataire de copropriété arrivant à échéance.',
    recipientLabel: 'Agence / Gestionnaire'
  },
  COMMON_AREA_INCIDENT: {
    key: 'COMMON_AREA_INCIDENT',
    label: 'Incident sur partie commune',
    description: 'Notification d’incident déclaré sur une partie commune (ascenseur, portail, etc.).',
    recipientLabel: 'Agence / Gestionnaire'
  },
  OWNER_STATEMENT_SENT: {
    key: 'OWNER_STATEMENT_SENT',
    label: 'Relevé de gérance envoyé',
    description: "Notification d'envoi d'un relevé de gérance au propriétaire.",
    recipientLabel: 'Propriétaire'
  },
  LOAN_MATURITY_ALERT: {
    key: 'LOAN_MATURITY_ALERT',
    label: 'Alerte fin de prêt',
    description: 'Alerte de prêt immobilier arrivant à son terme.',
    recipientLabel: 'Agence / Gestionnaire'
  },
  INSURANCE_DEADLINE_ALERT: {
    key: 'INSURANCE_DEADLINE_ALERT',
    label: 'Alerte échéance assurance et entretien',
    description: "Alerte d'échéance d'une police d'assurance, d'une prochaine intervention ou d'une fin de garantie.",
    recipientLabel: 'Agence / Gestionnaire'
  },
  DOCUMENT_EXPIRY_ALERT: {
    key: 'DOCUMENT_EXPIRY_ALERT',
    label: 'Alerte expiration document patrimoine',
    description: 'Alerte document patrimoine expirant prochainement.',
    recipientLabel: 'Propriétaire / Gestionnaire'
  },
  WORK_PROGRAM_REMINDER: {
    key: 'WORK_PROGRAM_REMINDER',
    label: 'Rappel programme de travaux',
    description: 'Rappel sur un programme de travaux planifié.',
    recipientLabel: 'Gestionnaire'
  },
  LAND_STEP_OVERDUE_ALERT: {
    key: 'LAND_STEP_OVERDUE_ALERT',
    label: 'Relance étape de régularisation foncière en retard',
    description:
      "Alerte envoyée aux administrateurs de l'agence lorsqu'une étape d'un dossier de régularisation foncière en cours a dépassé son échéance (une seule fois par échéance).",
    recipientLabel: 'Agence / Gestionnaire'
  },
  OWNER_MONTHLY_REPORT_SENT: {
    key: 'OWNER_MONTHLY_REPORT_SENT',
    label: 'Rapport mensuel du propriétaire',
    description:
      'Envoi au propriétaire du lien sécurisé vers son rapport mensuel (lecture seule, durée limitée), lorsque le canal e-mail est retenu.',
    recipientLabel: 'Propriétaire'
  },
  INVITATION: {
    key: 'INVITATION',
    label: 'Invitation',
    description: "Email d'invitation (collaborateur, portail, etc.).",
    recipientLabel: 'Invité'
  },
  PASSWORD_RESET: {
    key: 'PASSWORD_RESET',
    label: 'Réinitialisation mot de passe',
    description: 'Lien de réinitialisation du mot de passe.',
    recipientLabel: 'Utilisateur'
  },
  CUSTOM: {
    key: 'CUSTOM',
    label: 'Personnalisé',
    description: 'Événement personnalisé (template libre).',
    recipientLabel: 'Selon règle'
  }
};
