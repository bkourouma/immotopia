/**
 * Libellés en français pour la page Audit (actions et types de ressources).
 */

/** Libellé français détaillé pour chaque clé d'action d'audit (description explicite de l'action) */
export const AUDIT_ACTION_LABELS_FR: Record<string, string> = {
  // Tenant
  TENANT_CREATED: 'Création d\'un nouveau tenant (agence ou opérateur) sur la plateforme',
  TENANT_UPDATED: 'Modification des paramètres ou informations du tenant',
  TENANT_SUSPENDED: 'Suspension du tenant (accès désactivé temporairement)',
  TENANT_ACTIVATED: 'Réactivation du tenant (accès rétabli)',

  // Modules
  MODULE_ENABLED: 'Activation d\'un module fonctionnel pour le tenant',
  MODULE_DISABLED: 'Désactivation d\'un module fonctionnel pour le tenant',

  // Utilisateurs / collaborateurs
  USER_INVITED: 'Envoi d\'une invitation à un nouveau collaborateur par e-mail',
  USER_CREATED: 'Création d\'un compte collaborateur',
  USER_UPDATED: 'Modification des informations ou rôles du collaborateur',
  USER_DISABLED: 'Désactivation du compte collaborateur (accès révoqué)',
  USER_ENABLED: 'Réactivation du compte collaborateur',
  ROLE_ASSIGNED: 'Attribution de rôles et permissions à un collaborateur',
  ROLE_REMOVED: 'Retrait de rôles ou permissions d\'un collaborateur',
  PASSWORD_RESET: 'Demande de réinitialisation du mot de passe du collaborateur',
  SESSIONS_REVOKED: 'Révocation de toutes les sessions du collaborateur (déconnexion forcée)',

  // Abonnements
  SUBSCRIPTION_CREATED: 'Création d\'un abonnement pour le tenant',
  SUBSCRIPTION_UPDATED: 'Modification du plan ou des options d\'abonnement',
  SUBSCRIPTION_CANCELED: 'Annulation de l\'abonnement du tenant',

  // Factures
  INVOICE_CREATED: 'Émission d\'une nouvelle facture',
  INVOICE_MARKED_PAID: 'Marquage d\'une facture comme payée',
  INVOICE_CANCELED: 'Annulation d\'une facture',

  // CRM – Contacts
  CRM_CONTACT_CREATED: 'Création d\'un nouveau contact (prospect ou client) dans le CRM',
  CRM_CONTACT_UPDATED: 'Modification des informations du contact',
  CRM_CONTACT_CONVERTED: 'Conversion du contact (changement de statut ou rôle)',
  CRM_CONTACT_ROLE_DELETED: 'Suppression d\'un rôle associé au contact',
  CRM_CONTACT_ROLES_UPDATED: 'Mise à jour des rôles du contact',

  // CRM – Affaires
  CRM_DEAL_CREATED: 'Création d\'une nouvelle affaire (vente, location, etc.)',
  CRM_DEAL_UPDATED: 'Modification des informations de l\'affaire',
  CRM_DEAL_STAGE_CHANGED: 'Changement d\'étape de l\'affaire dans le pipeline',

  // CRM – Activités
  CRM_ACTIVITY_CREATED: 'Création d\'une activité (appel, tâche, note)',
  CRM_FOLLOWUP_RESCHEDULED: 'Reprogrammation de la date de suivi prévue',
  CRM_FOLLOWUP_MARKED_DONE: 'Marquage du suivi comme effectué',

  // Biens immobiliers
  PROPERTY_CREATED: 'Création d\'un nouveau bien immobilier dans le catalogue',
  PROPERTY_UPDATED: 'Modification des informations du bien (titre, adresse, prix, etc.)',
  PROPERTY_DELETED: 'Suppression ou archivage du bien du catalogue',
  PROPERTY_PUBLISHED: 'Publication du bien (mise en ligne pour les visiteurs)',
  PROPERTY_UNPUBLISHED: 'Dépublication du bien (retrait de la vitrine)',
  PROPERTY_STATUS_CHANGED: 'Changement du statut du bien (disponible, réservé, loué, etc.)',
  PROPERTY_MEDIA_UPLOADED: 'Ajout d\'une photo ou vidéo au bien',
  PROPERTY_DOCUMENT_UPLOADED: 'Ajout d\'un document au bien (titre de propriété, mandat, etc.)',
  PROPERTY_MANDATE_CREATED: 'Création d\'un mandat pour le bien',
  PROPERTY_MANDATE_REVOKED: 'Révocation du mandat du bien',
  PROPERTY_VISIT_SCHEDULED: 'Planification d\'une visite pour le bien',

  // Location – Baux
  RENTAL_LEASE_CREATED: 'Création d\'un nouveau bail de location',
  RENTAL_LEASE_UPDATED: 'Modification des termes ou informations du bail',
  RENTAL_LEASE_STATUS_UPDATED: 'Changement du statut du bail',
  RENTAL_LEASE_CO_RENTER_ADDED: 'Ajout d\'un colocataire au bail',
  RENTAL_LEASE_CO_RENTER_REMOVED: 'Retrait d\'un colocataire du bail',
  RENTAL_LEASE_DELETED: 'Suppression du bail',

  // Location – Dépôts de garantie
  RENTAL_DEPOSIT_CREATED: 'Enregistrement d\'un dépôt de garantie pour le bail',
  RENTAL_DEPOSIT_MOVEMENT_CREATED: 'Enregistrement d\'un mouvement sur le dépôt (entrée, sortie, etc.)',

  // Location – Pénalités
  RENTAL_PENALTY_CALCULATED: 'Calcul automatique d\'une pénalité de retard',
  RENTAL_PENALTY_UPDATED: 'Modification du montant ou de la justification de la pénalité',
  RENTAL_PENALTY_DELETED: 'Suppression d\'une pénalité',
  RENTAL_PENALTY_JUSTIFICATION_UPLOADED: 'Ajout d\'un justificatif pour la pénalité',

  // Location – Documents
  RENTAL_DOCUMENT_GENERATED: 'Génération d\'un document (quittance, avenant, etc.)',
  RENTAL_DOCUMENT_STATUS_UPDATED: 'Changement du statut du document location',

  // Maintenance
  MAINTENANCE_TICKET_CREATED: 'Création d\'un ticket de demande de maintenance',
  MAINTENANCE_VENDOR_CREATED: 'Ajout d\'un prestataire de maintenance',
  MAINTENANCE_VENDOR_UPDATED: 'Modification des informations du prestataire',
  MAINTENANCE_VENDOR_DEACTIVATED: 'Désactivation du prestataire',
  MAINTENANCE_VENDOR_DELETED: 'Suppression du prestataire',

  // Modèles de documents
  DOCUMENT_TEMPLATE_UPLOADED: 'Téléversement d\'un nouveau modèle de document',
  DOCUMENT_TEMPLATE_ACTIVATED: 'Activation du modèle de document',
  DOCUMENT_TEMPLATE_DEACTIVATED: 'Désactivation du modèle de document',
  DOCUMENT_TEMPLATE_SET_DEFAULT: 'Définition du modèle comme modèle par défaut',
  DOCUMENT_TEMPLATE_DELETED: 'Suppression du modèle de document',

  // Génération de documents
  DOCUMENT_GENERATED: 'Génération d\'un document à partir d\'un modèle',
  DOCUMENT_REGENERATED: 'Régénération du document avec les données à jour',
};

/** Libellé français pour chaque type d'entité (ressource) */
export const AUDIT_ENTITY_TYPE_LABELS_FR: Record<string, string> = {
  PROPERTY: 'Bien immobilier',
  PROPERTY_MEDIA: 'Média (bien)',
  PROPERTY_DOCUMENT: 'Document (bien)',
  PROPERTY_MANDATE: 'Mandat',
  PROPERTY_VISIT: 'Visite',
  CONTACT: 'Contact',
  DEAL: 'Affaire',
  ACTIVITY: 'Activité',
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
  RENTAL_SECURITY_DEPOSIT: 'Dépôt de garantie',
  RENTAL_DEPOSIT_MOVEMENT: 'Mouvement de dépôt',
  RENTAL_PENALTY: 'Pénalité',
  RENTAL_DOCUMENT: 'Document location',
  MAINTENANCE_TICKET: 'Ticket de maintenance',
  MaintenanceTicket: 'Ticket de maintenance',
  MAINTENANCE_VENDOR: 'Prestataire',
  MaintenanceVendor: 'Prestataire',
  VENDOR: 'Prestataire',
  DOCUMENT_TEMPLATE: 'Modèle de document',
  TenantModule: 'Module tenant',
  Membership: 'Adhésion',
  Invitation: 'Invitation',
  UserRole: 'Rôle utilisateur',
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
    if (ref) return { label: `${typeLabel} – Réf. ${ref}` };
    if (title) return { label: `${typeLabel} – ${title}` };
  }

  if (resourceType === 'RENTAL_LEASE') {
    const num = d.leaseNumber;
    if (num) return { label: `${typeLabel} – n° ${num}` };
  }

  if (resourceType === 'MaintenanceVendor' || resourceType === 'MAINTENANCE_VENDOR') {
    const name = d.name || d.vendorName;
    if (name) return { label: `${typeLabel} – ${name}` };
  }

  if (resourceType === 'Invoice') {
    const num = d.invoiceNumber;
    if (num) return { label: `${typeLabel} – n° ${num}` };
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
    if (num) return { label: `${typeLabel} – n° ${num}` };
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
    tooltip: resourceId
      ? `Identifiant technique : ${resourceId}`
      : undefined
  };
}
