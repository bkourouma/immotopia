import { t } from '../i18n/t';
/**
 * Libellés en français pour la page Audit (actions et types de ressources).
 */

/** Libellé français détaillé pour chaque clé d'action d'audit (description explicite de l'action) */
export function AUDIT_ACTION_LABELS_FR(): Record<string, string> {
  return {
    // Tenant
    TENANT_CREATED: t("Création d'un nouveau tenant (agence ou opérateur) sur la plateforme"),
    TENANT_UPDATED: t('Modification des paramètres ou informations du tenant'),
    TENANT_SUSPENDED: t('Suspension du tenant (accès désactivé temporairement)'),
    TENANT_ACTIVATED: t('Réactivation du tenant (accès rétabli)'),

    // Modules
    MODULE_ENABLED: t("Activation d'un module fonctionnel pour le tenant"),
    MODULE_DISABLED: t("Désactivation d'un module fonctionnel pour le tenant"),

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

    // Factures
    INVOICE_CREATED: t("Émission d'une nouvelle facture"),
    INVOICE_MARKED_PAID: t("Marquage d'une facture comme payée"),
    INVOICE_CANCELED: t("Annulation d'une facture"),

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
    DOCUMENT_REGENERATED: t('Régénération du document avec les données à jour')
  };
}

/** Libellé français pour chaque type d'entité (ressource) */
export function AUDIT_ENTITY_TYPE_LABELS_FR(): Record<string, string> {
  return {
    PROPERTY: t('Bien immobilier'),
    PROPERTY_MEDIA: t('Média (bien)'),
    PROPERTY_DOCUMENT: t('Document (bien)'),
    PROPERTY_MANDATE: t('Mandat'),
    PROPERTY_VISIT: t('Visite'),
    CONTACT: t('Contact'),
    DEAL: t('Affaire'),
    ACTIVITY: t('Activité'),
    TENANT: t('Tenant'),
    Tenant: t('Tenant'),
    USER: t('Utilisateur'),
    User: t('Utilisateur'),
    SUBSCRIPTION: t('Abonnement'),
    Subscription: t('Abonnement'),
    INVOICE: t('Facture'),
    Invoice: t('Facture'),
    LEASE: t('Bail'),
    RENTAL_LEASE: t('Bail'),
    RENTAL_SECURITY_DEPOSIT: t('Dépôt de garantie'),
    RENTAL_DEPOSIT_MOVEMENT: t('Mouvement de dépôt'),
    RENTAL_PENALTY: t('Pénalité'),
    RENTAL_DOCUMENT: t('Document location'),
    MAINTENANCE_TICKET: t('Ticket de maintenance'),
    MaintenanceTicket: t('Ticket de maintenance'),
    MAINTENANCE_VENDOR: t('Prestataire'),
    MaintenanceVendor: t('Prestataire'),
    VENDOR: t('Prestataire'),
    DOCUMENT_TEMPLATE: t('Modèle de document'),
    TenantModule: t('Module tenant'),
    Membership: t('Adhésion'),
    Invitation: t('Invitation'),
    UserRole: t('Rôle utilisateur')
  };
}

export function getAuditActionLabelFr(actionKey: string): string {
  return AUDIT_ACTION_LABELS_FR()[actionKey] ?? actionKey;
}

export function getAuditEntityTypeLabelFr(entityType: string): string {
  return AUDIT_ENTITY_TYPE_LABELS_FR()[entityType] ?? entityType;
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
