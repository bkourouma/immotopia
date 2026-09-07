/**
 * Libellés et descriptions en français des permissions et rôles RBAC.
 * Utilisé sur la page Admin > Rôles et permissions pour clarifier les fonctionnalités.
 */

export interface PermissionLabelFr {
  label: string;
  description: string;
}

/** Libellé court + description en français par clé de permission */
export const PERMISSION_LABELS_FR: Record<string, PermissionLabelFr> = {
  // --- Plateforme (administration centrale) ---
  PLATFORM_TENANTS_VIEW: {
    label: 'Voir les tenants',
    description: 'Consulter la liste de toutes les agences / opérateurs de la plateforme.',
  },
  PLATFORM_TENANTS_CREATE: {
    label: 'Créer des tenants',
    description: 'Créer de nouveaux tenants (nouvelles agences ou opérateurs).',
  },
  PLATFORM_TENANTS_EDIT: {
    label: 'Modifier les tenants',
    description: 'Modifier les informations et paramètres des tenants existants.',
  },
  PLATFORM_MODULES_VIEW: {
    label: 'Voir les modules',
    description: 'Consulter les modules activés par tenant (Agence, Syndic, Promoteur, etc.).',
  },
  PLATFORM_MODULES_EDIT: {
    label: 'Modifier les modules',
    description: 'Activer ou désactiver les modules pour chaque tenant.',
  },
  PLATFORM_SUBSCRIPTIONS_VIEW: {
    label: 'Voir les abonnements',
    description: 'Consulter les abonnements et plans des tenants.',
  },
  PLATFORM_SUBSCRIPTIONS_EDIT: {
    label: 'Modifier les abonnements',
    description: 'Gérer les abonnements (plan, cycle, statut) des tenants.',
  },
  PLATFORM_INVOICES_VIEW: {
    label: 'Voir les factures',
    description: 'Consulter les factures des tenants.',
  },
  PLATFORM_INVOICES_CREATE: {
    label: 'Créer des factures',
    description: 'Créer de nouvelles factures pour les tenants.',
  },
  PLATFORM_INVOICES_EDIT: {
    label: 'Modifier les factures',
    description: 'Modifier les factures et les marquer comme payées ou annulées.',
  },

  // --- Paramètres du tenant ---
  TENANT_SETTINGS_VIEW: {
    label: 'Voir les paramètres du tenant',
    description: 'Consulter les paramètres de l\'agence / opérateur (nom, contact, etc.).',
  },
  TENANT_SETTINGS_EDIT: {
    label: 'Modifier les paramètres du tenant',
    description: 'Modifier les paramètres de l\'agence / opérateur.',
  },

  // --- Utilisateurs / collaborateurs ---
  USERS_VIEW: {
    label: 'Voir les collaborateurs',
    description: 'Consulter la liste des collaborateurs du tenant.',
  },
  USERS_CREATE: {
    label: 'Créer des collaborateurs',
    description: 'Inviter ou créer de nouveaux collaborateurs.',
  },
  USERS_EDIT: {
    label: 'Modifier les collaborateurs',
    description: 'Modifier les rôles et informations des collaborateurs.',
  },
  USERS_DISABLE: {
    label: 'Désactiver des collaborateurs',
    description: 'Désactiver le compte d\'un collaborateur (révoquer l\'accès).',
  },

  // --- Facturation (côté tenant) ---
  BILLING_VIEW: {
    label: 'Voir la facturation',
    description: 'Consulter les informations de facturation et abonnement du tenant.',
  },

  // --- CRM (contacts, affaires, activités) ---
  CRM_CONTACTS_VIEW: {
    label: 'Voir les contacts',
    description: 'Consulter la liste des contacts (prospects, clients).',
  },
  CRM_CONTACTS_CREATE: {
    label: 'Créer des contacts',
    description: 'Créer de nouveaux contacts.',
  },
  CRM_CONTACTS_EDIT: {
    label: 'Modifier les contacts',
    description: 'Modifier les informations des contacts.',
  },
  CRM_CONTACTS_ARCHIVE: {
    label: 'Archiver des contacts',
    description: 'Archiver ou désarchiver des contacts.',
  },
  CRM_DEALS_VIEW: {
    label: 'Voir les affaires',
    description: 'Consulter les affaires / transactions (ventes, locations).',
  },
  CRM_DEALS_CREATE: {
    label: 'Créer des affaires',
    description: 'Créer de nouvelles affaires.',
  },
  CRM_DEALS_EDIT: {
    label: 'Modifier les affaires',
    description: 'Modifier les affaires existantes.',
  },
  CRM_DEALS_STAGE_CHANGE: {
    label: 'Changer l\'étape des affaires',
    description: 'Faire évoluer une affaire dans le pipeline (étape, statut).',
  },
  CRM_ACTIVITIES_VIEW: {
    label: 'Voir les activités',
    description: 'Consulter les activités CRM (appels, tâches, notes).',
  },
  CRM_ACTIVITIES_CREATE: {
    label: 'Créer des activités',
    description: 'Créer des activités (appels, tâches, notes).',
  },
  CRM_APPOINTMENTS_VIEW: {
    label: 'Voir les rendez-vous',
    description: 'Consulter le calendrier et les rendez-vous.',
  },
  CRM_APPOINTMENTS_CREATE: {
    label: 'Créer des rendez-vous',
    description: 'Créer de nouveaux rendez-vous.',
  },
  CRM_APPOINTMENTS_EDIT: {
    label: 'Modifier les rendez-vous',
    description: 'Modifier ou annuler des rendez-vous.',
  },
  CRM_MATCHING_RUN: {
    label: 'Lancer l\'appariement biens / affaires',
    description: 'Exécuter l\'appariement entre biens et affaires CRM.',
  },
  CRM_MATCHING_VIEW: {
    label: 'Voir les appariements',
    description: 'Consulter les résultats d\'appariement biens / affaires.',
  },

  // --- Biens immobiliers ---
  PROPERTIES_VIEW: {
    label: 'Voir les biens',
    description: 'Consulter la liste et le détail des biens immobiliers.',
  },
  PROPERTIES_CREATE: {
    label: 'Créer des biens',
    description: 'Créer de nouvelles annonces / biens.',
  },
  PROPERTIES_EDIT: {
    label: 'Modifier les biens',
    description: 'Modifier les biens existants.',
  },
  PROPERTIES_DELETE: {
    label: 'Supprimer / archiver des biens',
    description: 'Supprimer ou archiver des biens.',
  },
  PROPERTIES_PUBLISH: {
    label: 'Publier / dépublier des biens',
    description: 'Mettre en ligne ou retirer des biens de la publication.',
  },
  PROPERTIES_MATCH: {
    label: 'Appariement biens pour les affaires',
    description: 'Lancer l\'appariement des biens avec les affaires CRM.',
  },
  PROPERTIES_VISITS_SCHEDULE: {
    label: 'Planifier des visites',
    description: 'Planifier et gérer les visites des biens.',
  },

  // --- Location (baux, échéances, paiements, etc.) ---
  RENTAL_LEASES_VIEW: {
    label: 'Voir les baux',
    description: 'Consulter les baux de location.',
  },
  RENTAL_LEASES_CREATE: {
    label: 'Créer des baux',
    description: 'Créer de nouveaux baux.',
  },
  RENTAL_LEASES_EDIT: {
    label: 'Modifier les baux',
    description: 'Modifier les baux existants.',
  },
  RENTAL_INSTALLMENTS_VIEW: {
    label: 'Voir les échéances',
    description: 'Consulter les échéances de loyer.',
  },
  RENTAL_INSTALLMENTS_GENERATE: {
    label: 'Générer les échéances',
    description: 'Générer les échéances de loyer (plan d’échéances).',
  },
  RENTAL_PAYMENTS_VIEW: {
    label: 'Voir les paiements',
    description: 'Consulter les paiements de loyer.',
  },
  RENTAL_PAYMENTS_CREATE: {
    label: 'Créer des paiements',
    description: 'Saisir ou enregistrer des paiements.',
  },
  RENTAL_PAYMENTS_ALLOCATE: {
    label: 'Allouer les paiements',
    description: 'Allouer les paiements aux échéances (rattacher un paiement à une échéance).',
  },
  RENTAL_PENALTIES_VIEW: {
    label: 'Voir les pénalités',
    description: 'Consulter les pénalités de retard.',
  },
  RENTAL_PENALTIES_CALCULATE: {
    label: 'Calculer les pénalités',
    description: 'Lancer ou recalculer les pénalités de retard.',
  },
  RENTAL_PENALTIES_EDIT: {
    label: 'Modifier les pénalités',
    description: 'Modifier ou annuler des pénalités.',
  },
  RENTAL_DEPOSITS_VIEW: {
    label: 'Voir les dépôts de garantie',
    description: 'Consulter les dépôts de garantie.',
  },
  RENTAL_DEPOSITS_CREATE: {
    label: 'Créer des dépôts de garantie',
    description: 'Enregistrer des dépôts de garantie.',
  },
  RENTAL_DEPOSITS_EDIT: {
    label: 'Modifier les dépôts de garantie',
    description: 'Modifier les dépôts (mouvements, remboursements).',
  },
  RENTAL_DOCUMENTS_VIEW: {
    label: 'Voir les documents location',
    description: 'Consulter les documents liés à la location (contrats, quittances).',
  },
  RENTAL_DOCUMENTS_GENERATE: {
    label: 'Générer des documents location',
    description: 'Générer des documents (quittances, avenants, etc.).',
  },
  RENTAL_DOCUMENTS_EDIT: {
    label: 'Modifier les documents location',
    description: 'Modifier ou supprimer des documents de location.',
  },

  // --- Maintenance ---
  MAINTENANCE_TENANT: {
    label: 'Créer et voir ses tickets de maintenance',
    description: 'Créer des demandes de maintenance et voir ses propres tickets (usage collaborateur).',
  },
  MAINTENANCE_ADMIN: {
    label: 'Gérer tous les tickets et prestataires',
    description: 'Voir et gérer tous les tickets de maintenance et les prestataires (fournisseurs).',
  },

  // --- Communication ---
  COMMUNICATION_VIEW: {
    label: 'Accès au module Communication',
    description: 'Voir et gérer la communication : modèles, règles, historique, préférences, analytiques.',
  },
};

/** Libellés des groupes de permissions (préfixes) pour l’affichage en sections */
export const PERMISSION_GROUP_LABELS_FR: Record<string, string> = {
  PLATFORM: 'Plateforme (administration centrale)',
  TENANT: 'Paramètres du tenant',
  USERS: 'Collaborateurs',
  BILLING: 'Facturation',
  CRM: 'CRM (contacts, affaires, activités)',
  PROPERTIES: 'Biens immobiliers',
  RENTAL: 'Location (baux, loyers, documents)',
  MAINTENANCE: 'Maintenance',
  COMMUNICATION: 'Communication',
};

/** Noms et descriptions en français des rôles (clé technique → libellé) */
export const ROLE_LABELS_FR: Record<string, { name: string; description: string }> = {
  PLATFORM_SUPER_ADMIN: {
    name: 'Super administrateur plateforme',
    description: 'Accès complet à la plateforme : tous les tenants, modules, abonnements et factures.',
  },
  TENANT_ADMIN: {
    name: 'Administrateur tenant',
    description: 'Gestion complète du tenant : paramètres, collaborateurs, CRM, biens, location, facturation.',
  },
  TENANT_MANAGER: {
    name: 'Gestionnaire tenant',
    description: 'Droits de gestion sans modification de la facturation : paramètres en lecture, collaborateurs, biens, location, CRM.',
  },
  TENANT_AGENT: {
    name: 'Agent tenant',
    description: 'Droits limités : consulter paramètres et collaborateurs, gérer biens et visites, contacts et affaires CRM.',
  },
  TENANT_ACCOUNTANT: {
    name: 'Comptable tenant',
    description: 'Accès à la facturation et aux informations comptables du tenant.',
  },
};

/**
 * Retourne le libellé et la description en français pour une permission (clé).
 * Si aucune traduction n’existe, retourne la clé et la description API.
 */
export function getPermissionLabelFr(
  key: string,
  fallbackDescription?: string | null
): PermissionLabelFr {
  const fr = PERMISSION_LABELS_FR[key];
  if (fr) return fr;
  return {
    label: key,
    description: fallbackDescription || 'Aucune description.',
  };
}

/**
 * Retourne le libellé du groupe (section) en français à partir du préfixe de la clé.
 */
export function getPermissionGroupLabelFr(prefix: string): string {
  return PERMISSION_GROUP_LABELS_FR[prefix] || prefix;
}

/**
 * Retourne le nom et la description en français pour un rôle (clé).
 */
export function getRoleLabelFr(key: string, fallbackName?: string, fallbackDescription?: string | null) {
  const fr = ROLE_LABELS_FR[key];
  if (fr) return { name: fr.name, description: fr.description };
  return {
    name: fallbackName || key,
    description: fallbackDescription || '',
  };
}
