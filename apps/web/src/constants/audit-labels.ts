import { t } from '../i18n/t';
/**
 * Libellés en français pour la page Audit (actions et types de ressources).
 */

/** Libellé français détaillé pour chaque clé d'action d'audit (description explicite de l'action) */
export const AUDIT_ACTION_LABELS_FR: Record<string, string> = {
  // Authentification (BUG-2026-09-28-003 : AUTH_LOGIN_SUCCEEDED s'affichait en code brut)
  AUTH_LOGIN_SUCCEEDED: t("Connexion réussie de l'utilisateur"),
  AUTH_LOGIN_FAILED: t('Tentative de connexion échouée'),
  AUTH_LOGOUT: t("Déconnexion de l'utilisateur"),
  AUTH_GOOGLE_LOGIN: t('Connexion via Google'),
  AUTH_TOKEN_REFRESHED: t('Renouvellement du jeton de session'),
  AUTH_TOKEN_REUSE_DETECTED: t("Réutilisation détectée d'un jeton de rafraîchissement révoqué"),
  AUTH_PASSWORD_RESET_REQUESTED: t('Demande de réinitialisation du mot de passe'),
  AUTH_PASSWORD_RESET_COMPLETED: t('Réinitialisation du mot de passe effectuée'),
  AUTH_EMAIL_VERIFIED: t('Vérification de l’adresse e-mail'),

  // Tenant
  // Création en un clic (lot F) : clé distincte de TENANT_CREATED, pas encore
  // dans l'enum AuditActionKey (packages/api/src/types/audit-types.ts).
  TENANT_PROVISIONED: t("Provisionnement d'une agence en un clic (packs et administrateur créés)"),
  TENANT_CREATED: t("Création d'un nouveau tenant (agence ou opérateur) sur la plateforme"),
  TENANT_UPDATED: t('Modification des paramètres ou informations du tenant'),
  TENANT_SUSPENDED: t('Suspension du tenant (accès désactivé temporairement)'),
  TENANT_ACTIVATED: t('Réactivation du tenant (accès rétabli)'),
  TENANT_DATA_EXPORT_REQUESTED: t("Demande d'export complet des données de l'agence"),
  TENANT_DATA_EXPORT_DOWNLOADED: t("Téléchargement de l'export des données de l'agence"),
  TENANT_DATA_EXPORT_DELETED: t("Suppression de l'export des données de l'agence"),

  // Modules
  MODULE_ENABLED: t("Activation d'un module fonctionnel pour le tenant"),
  MODULE_DISABLED: t("Désactivation d'un module fonctionnel pour le tenant"),
  MODULE_OVERRIDE_CLEARED: t("Suppression d'une dérogation manuelle de module"),

  // Utilisateurs / collaborateurs
  USER_INVITED: t("Envoi d'une invitation à un nouveau collaborateur par e-mail"),
  USER_CREATED: t("Création d'un compte collaborateur"),
  USER_UPDATED: t('Modification des informations ou rôles du collaborateur'),
  USER_DISABLED: t('Désactivation du compte collaborateur (accès révoqué)'),
  USER_ENABLED: t('Réactivation du compte collaborateur'),
  ROLE_ASSIGNED: t('Attribution de rôles et permissions à un collaborateur'),
  ROLE_REMOVED: t("Retrait de rôles ou permissions d'un collaborateur"),
  PASSWORD_RESET: t('Demande de réinitialisation du mot de passe du collaborateur'),
  SESSIONS_REVOKED: t('Révocation de toutes les sessions du collaborateur (déconnexion forcée)'),

  // Abonnements
  SUBSCRIPTION_CREATED: t("Création d'un abonnement pour le tenant"),
  SUBSCRIPTION_UPDATED: t("Modification du plan ou des options d'abonnement"),
  SUBSCRIPTION_CANCELED: t("Annulation de l'abonnement du tenant"),
  // Abonnements par packs (docs/architecture/PLAN-ABONNEMENTS.md)
  SUBSCRIPTION_ITEM_ADDED: t("Ajout d'un pack ou d'une extension à l'abonnement"),
  SUBSCRIPTION_ITEM_REMOVED: t("Retrait d'un pack ou d'une extension de l'abonnement"),
  SUBSCRIPTION_ITEM_UPDATED: t("Modification d'un élément de l'abonnement (remise, prix figé)"),
  SUBSCRIPTION_PACK_CHANGED: t("Changement de pack de l'abonnement"),
  SUBSCRIPTION_SETTINGS_UPDATED: t("Modification des paramètres de l'abonnement (politique de dépassement, essai)"),
  SUBSCRIPTION_MIGRATED_TO_PACKS: t('Migration de l’abonnement vers le modèle par packs'),
  SUBSCRIPTION_EXTENSION_REQUESTED: t("Demande d'extension de capacité par l'agence"),
  SUBSCRIPTION_EXTENSION_REQUEST_HANDLED: t("Traitement d'une demande d'extension de capacité"),
  SUBSCRIPTION_MANUAL_READ_ONLY_SET: t('Passage manuel de l’agence en lecture seule'),
  SUBSCRIPTION_MANUAL_READ_ONLY_CLEARED: t('Levée de la lecture seule manuelle de l’agence'),
  CAPACITY_OVERRIDE_GRANTED: t('Octroi d’une dérogation de capacité'),
  CAPACITY_OVERRIDE_REVOKED: t('Révocation d’une dérogation de capacité'),
  CATALOG_ITEM_UPDATED: t('Modification d’un élément du catalogue d’offres'),
  PLATFORM_PAYMENT_STARTED: t("Démarrage d'un paiement en ligne d'abonnement"),

  // Factures
  INVOICE_CREATED: t("Émission d'une nouvelle facture"),
  INVOICE_MARKED_PAID: t("Marquage d'une facture comme payée"),
  INVOICE_CANCELED: t("Annulation d'une facture"),
  INVOICE_ISSUED: t('Émission d’une facture plateforme'),
  INVOICE_CREDIT_NOTE_ISSUED: t('Émission d’un avoir sur facture plateforme'),

  // CRM – Contacts
  CRM_CONTACT_CREATED: t("Création d'un nouveau contact (prospect ou client) dans le CRM"),
  CRM_CONTACT_UPDATED: t('Modification des informations du contact'),
  CRM_CONTACT_CONVERTED: t('Conversion du contact (changement de statut ou rôle)'),
  CRM_CONTACT_ROLE_DELETED: t("Suppression d'un rôle associé au contact"),
  CRM_CONTACT_ROLES_UPDATED: t('Mise à jour des rôles du contact'),

  // CRM – Affaires
  CRM_DEAL_CREATED: t("Création d'une nouvelle affaire (vente, location, etc.)"),
  CRM_DEAL_UPDATED: t("Modification des informations de l'affaire"),
  CRM_DEAL_STAGE_CHANGED: t("Changement d'étape de l'affaire dans le pipeline"),

  // CRM – Activités
  CRM_ACTIVITY_CREATED: t("Création d'une activité (appel, tâche, note)"),
  CRM_FOLLOWUP_RESCHEDULED: t('Reprogrammation de la date de suivi prévue'),
  CRM_FOLLOWUP_MARKED_DONE: t('Marquage du suivi comme effectué'),

  // Biens immobiliers
  PROPERTY_CREATED: t("Création d'un nouveau bien immobilier dans le catalogue"),
  PROPERTY_UPDATED: t('Modification des informations du bien (titre, adresse, prix, etc.)'),
  PROPERTY_DELETED: t('Suppression ou archivage du bien du catalogue'),
  PROPERTY_PUBLISHED: t('Publication du bien (mise en ligne pour les visiteurs)'),
  PROPERTY_UNPUBLISHED: t('Dépublication du bien (retrait de la vitrine)'),
  PROPERTY_STATUS_CHANGED: t('Changement du statut du bien (disponible, réservé, loué, etc.)'),
  PROPERTY_MEDIA_UPLOADED: t("Ajout d'une photo ou vidéo au bien"),
  PROPERTY_DOCUMENT_UPLOADED: t("Ajout d'un document au bien (titre de propriété, mandat, etc.)"),
  PROPERTY_MANDATE_CREATED: t("Création d'un mandat pour le bien"),
  PROPERTY_MANDATE_REVOKED: t('Révocation du mandat du bien'),
  PROPERTY_VISIT_SCHEDULED: t("Planification d'une visite pour le bien"),

  // Location – Baux
  RENTAL_LEASE_CREATED: t("Création d'un nouveau bail de location"),
  RENTAL_LEASE_UPDATED: t('Modification des termes ou informations du bail'),
  RENTAL_LEASE_STATUS_UPDATED: t('Changement du statut du bail'),
  RENTAL_LEASE_CO_RENTER_ADDED: t("Ajout d'un colocataire au bail"),
  RENTAL_LEASE_CO_RENTER_REMOVED: t("Retrait d'un colocataire du bail"),
  RENTAL_LEASE_DELETED: t('Suppression du bail'),

  // Location – Dépôts de garantie
  RENTAL_DEPOSIT_CREATED: t("Enregistrement d'un dépôt de garantie pour le bail"),
  RENTAL_DEPOSIT_MOVEMENT_CREATED: t("Enregistrement d'un mouvement sur le dépôt (entrée, sortie, etc.)"),

  // Location – Pénalités
  RENTAL_PENALTY_CALCULATED: t("Calcul automatique d'une pénalité de retard"),
  RENTAL_PENALTY_UPDATED: t('Modification du montant ou de la justification de la pénalité'),
  RENTAL_PENALTY_DELETED: t("Suppression d'une pénalité"),
  RENTAL_PENALTY_JUSTIFICATION_UPLOADED: t("Ajout d'un justificatif pour la pénalité"),

  // Location – Documents
  RENTAL_DOCUMENT_GENERATED: t("Génération d'un document (quittance, avenant, etc.)"),
  RENTAL_DOCUMENT_STATUS_UPDATED: t('Changement du statut du document location'),

  // Maintenance
  MAINTENANCE_TICKET_CREATED: t("Création d'un ticket de demande de maintenance"),
  MAINTENANCE_VENDOR_CREATED: t("Ajout d'un prestataire de maintenance"),
  MAINTENANCE_VENDOR_UPDATED: t('Modification des informations du prestataire'),
  MAINTENANCE_VENDOR_DEACTIVATED: t('Désactivation du prestataire'),
  MAINTENANCE_VENDOR_DELETED: t('Suppression du prestataire'),

  // Modèles de documents
  DOCUMENT_TEMPLATE_UPLOADED: t("Téléversement d'un nouveau modèle de document"),
  DOCUMENT_TEMPLATE_ACTIVATED: t('Activation du modèle de document'),
  DOCUMENT_TEMPLATE_DEACTIVATED: t('Désactivation du modèle de document'),
  DOCUMENT_TEMPLATE_SET_DEFAULT: t('Définition du modèle comme modèle par défaut'),
  DOCUMENT_TEMPLATE_DELETED: t('Suppression du modèle de document'),

  // Génération de documents
  DOCUMENT_GENERATED: t("Génération d'un document à partir d'un modèle"),
  DOCUMENT_REGENERATED: t('Régénération du document avec les données à jour'),

  // Identité des documents (signature et cachet)
  DOCUMENT_SIGNATURE_UPLOADED: t("Ajout d'une signature ou d'un cachet"),
  DOCUMENT_SIGNATURE_REMOVED: t("Suppression d'une signature ou d'un cachet"),

  // Syndic — fonds financiers de copropriété
  SYNDICATE_FUND_CREATED: t("Création d'un fonds de copropriété"),
  SYNDICATE_FUND_RENAMED: t('Renommage du fonds de copropriété'),
  SYNDICATE_FUND_BALANCE_ADJUSTED: t('Ajustement du solde du fonds de copropriété'),
  SYNDICATE_FUND_ASSIGNMENT_CHANGED: t("Changement d'affectation d'un appel ou poste de budget à un fonds"),

  // Syndic — factures de prestataires
  SYNDIC_PROVIDER_INVOICE_FILE_ATTACHED: t("Ajout d'une pièce jointe à une facture de prestataire"),
  SYNDIC_PROVIDER_INVOICE_FILE_REPLACED: t('Remplacement de la pièce jointe de la facture de prestataire'),
  SYNDIC_PROVIDER_INVOICE_FILE_REMOVED: t('Suppression de la pièce jointe de la facture de prestataire'),

  // Syndic — portail copropriétaire
  SYNDIC_COOWNER_PORTAL_INVITED: t("Invitation d'un copropriétaire à son portail"),
  SYNDIC_COOWNER_PORTAL_REVOKED: t("Révocation de l'accès portail d'un copropriétaire"),

  // Syndic — reçus et quittances de charges
  SYNDIC_CHARGE_RECEIPT_EMAIL_RESENT: t("Renvoi par e-mail d'une quittance de charges")
};

/** Libellé français pour chaque type d'entité (ressource) */
export const AUDIT_ENTITY_TYPE_LABELS_FR: Record<string, string> = {
  PROPERTY: t('Bien immobilier'),
  PROPERTY_MEDIA: t('Média (bien)'),
  PROPERTY_DOCUMENT: t('Document (bien)'),
  PROPERTY_MANDATE: 'Mandat',
  PROPERTY_VISIT: 'Visite',
  CONTACT: 'Contact',
  DEAL: 'Affaire',
  ACTIVITY: t('Activité'),
  TENANT: 'Tenant',
  Tenant: 'Tenant',
  USER: 'Utilisateur',
  User: 'Utilisateur',
  SUBSCRIPTION: 'Abonnement',
  Subscription: 'Abonnement',
  INVOICE: 'Facture',
  Invoice: 'Facture',
  LEASE: 'Bail',
  RENTAL_LEASE: 'Bail',
  RENTAL_SECURITY_DEPOSIT: t('Dépôt de garantie'),
  RENTAL_DEPOSIT_MOVEMENT: t('Mouvement de dépôt'),
  RENTAL_PENALTY: t('Pénalité'),
  RENTAL_DOCUMENT: t('Document location'),
  MAINTENANCE_TICKET: t('Ticket de maintenance'),
  MaintenanceTicket: t('Ticket de maintenance'),
  MAINTENANCE_VENDOR: 'Prestataire',
  MaintenanceVendor: 'Prestataire',
  VENDOR: 'Prestataire',
  DOCUMENT_TEMPLATE: t('Modèle de document'),
  TenantModule: t('Module tenant'),
  Membership: t('Adhésion'),
  Invitation: 'Invitation',
  UserRole: t('Rôle utilisateur')
};

export function getAuditActionLabelFr(actionKey: string): string {
  return AUDIT_ACTION_LABELS_FR[actionKey] ?? actionKey;
}

export function getAuditEntityTypeLabelFr(entityType: string): string {
  return AUDIT_ENTITY_TYPE_LABELS_FR[entityType] ?? entityType;
}

/**
 * Construit un libellé lisible pour la colonne Ressource à partir du type, de l'id et des détails (payload).
 * Affiche une référence ou un nom quand le payload le contient, sinon un identifiant court.
 */
export function getAuditResourceDisplayLabel(
  resourceType: string,
  resourceId: string | undefined,
  details: Record<string, any> | undefined
): { label: string; tooltip?: string } {
  const typeLabel = getAuditEntityTypeLabelFr(resourceType);
  const d = details || {};

  if (resourceType === 'PROPERTY' || resourceType === 'Property') {
    const ref = d.internalReference || d.reference;
    const title = d.title;
    if (ref) return { label: t('{{typeLabel}} – Réf. {{ref}}', { typeLabel: typeLabel, ref: ref }) };
    if (title) return { label: `${typeLabel} – ${title}` };
  }

  if (resourceType === 'RENTAL_LEASE') {
    const num = d.leaseNumber;
    if (num) return { label: t('{{typeLabel}} – n° {{num}}', { typeLabel: typeLabel, num: num }) };
  }

  if (resourceType === 'MaintenanceVendor' || resourceType === 'MAINTENANCE_VENDOR') {
    const name = d.name || d.vendorName;
    if (name) return { label: `${typeLabel} – ${name}` };
  }

  if (resourceType === 'Invoice') {
    const num = d.invoiceNumber;
    if (num) return { label: t('{{typeLabel}} – n° {{num}}', { typeLabel: typeLabel, num: num }) };
  }

  if (resourceType === 'CONTACT' || resourceType === 'Contact') {
    const full = [d.firstName, d.lastName].filter(Boolean).join(' ') || d.email;
    if (full) return { label: `${typeLabel} – ${full}` };
  }

  if (resourceType === 'DOCUMENT_TEMPLATE') {
    const name = d.name;
    if (name) return { label: `${typeLabel} – ${name}` };
  }

  if (resourceType === 'RENTAL_DOCUMENT') {
    const num = d.documentNumber;
    if (num) return { label: t('{{typeLabel}} – n° {{num}}', { typeLabel: typeLabel, num: num }) };
  }

  if (resourceType === 'Subscription') {
    const plan = d.planKey;
    if (plan) return { label: `${typeLabel} – ${plan}` };
  }

  if (resourceType === 'Invitation') {
    const email = d.email;
    if (email) return { label: `${typeLabel} – ${email}` };
  }

  if (resourceType === 'Tenant') {
    const name = d.name;
    if (name) return { label: `${typeLabel} – ${name}` };
  }

  const shortId = resourceId ? resourceId.slice(0, 8) : '';
  return {
    label: shortId ? `${typeLabel} (${shortId}…)` : typeLabel,
    tooltip: resourceId ? t('Identifiant technique : {{resourceId}}', { resourceId: resourceId }) : undefined
  };
}
