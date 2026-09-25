import { t } from '../i18n/t';
/**
 * Libellés et descriptions en français des permissions et rôles RBAC.
 * Utilisé sur la page Admin > Rôles et permissions pour clarifier les fonctionnalités.
 */

export interface PermissionLabelFr {
  label: string;
  description: string;
}

/** Libellé court + description en français par clé de permission */
export function PERMISSION_LABELS_FR(): Record<string, PermissionLabelFr> {
  return {
    // --- Plateforme (administration centrale) ---
    PLATFORM_TENANTS_VIEW: {
      label: t('Voir les tenants'),
      description: t('Consulter la liste de toutes les agences / opérateurs de la plateforme.')
    },
    PLATFORM_TENANTS_CREATE: {
      label: t('Créer des tenants'),
      description: t('Créer de nouveaux tenants (nouvelles agences ou opérateurs).')
    },
    PLATFORM_TENANTS_EDIT: {
      label: t('Modifier les tenants'),
      description: t('Modifier les informations et paramètres des tenants existants.')
    },
    PLATFORM_MODULES_VIEW: {
      label: t('Voir les modules'),
      description: t('Consulter les modules activés par tenant (Agence, Syndic, Promoteur, etc.).')
    },
    PLATFORM_MODULES_EDIT: {
      label: t('Modifier les modules'),
      description: t('Activer ou désactiver les modules pour chaque tenant.')
    },
    PLATFORM_SUBSCRIPTIONS_VIEW: {
      label: t('Voir les abonnements'),
      description: t('Consulter les abonnements et plans des tenants.')
    },
    PLATFORM_SUBSCRIPTIONS_EDIT: {
      label: t('Modifier les abonnements'),
      description: t('Gérer les abonnements (plan, cycle, statut) des tenants.')
    },
    PLATFORM_INVOICES_VIEW: {
      label: t('Voir les factures'),
      description: t('Consulter les factures des tenants.')
    },
    PLATFORM_INVOICES_CREATE: {
      label: t('Créer des factures'),
      description: t('Créer de nouvelles factures pour les tenants.')
    },
    PLATFORM_INVOICES_EDIT: {
      label: t('Modifier les factures'),
      description: t('Modifier les factures et les marquer comme payées ou annulées.')
    },

    // --- Paramètres du tenant ---
    TENANT_SETTINGS_VIEW: {
      label: t('Voir les paramètres du tenant'),
      description: t("Consulter les paramètres de l'agence / opérateur (nom, contact, etc.).")
    },
    TENANT_SETTINGS_EDIT: {
      label: t('Modifier les paramètres du tenant'),
      description: t("Modifier les paramètres de l'agence / opérateur.")
    },

    // --- Utilisateurs / collaborateurs ---
    USERS_VIEW: {
      label: t('Voir les collaborateurs'),
      description: t('Consulter la liste des collaborateurs du tenant.')
    },
    USERS_CREATE: {
      label: t('Créer des collaborateurs'),
      description: t('Inviter ou créer de nouveaux collaborateurs.')
    },
    USERS_EDIT: {
      label: t('Modifier les collaborateurs'),
      description: t('Modifier les rôles et informations des collaborateurs.')
    },
    USERS_DISABLE: {
      label: t('Désactiver des collaborateurs'),
      description: t("Désactiver le compte d'un collaborateur (révoquer l'accès).")
    },

    // --- Facturation (côté tenant) ---
    BILLING_VIEW: {
      label: t('Voir la facturation'),
      description: t('Consulter les informations de facturation et abonnement du tenant.')
    },

    // --- CRM (contacts, affaires, activités) ---
    CRM_CONTACTS_VIEW: {
      label: t('Voir les contacts'),
      description: t('Consulter la liste des contacts (prospects, clients).')
    },
    CRM_CONTACTS_CREATE: {
      label: t('Créer des contacts'),
      description: t('Créer de nouveaux contacts.')
    },
    CRM_CONTACTS_EDIT: {
      label: t('Modifier les contacts'),
      description: t('Modifier les informations des contacts.')
    },
    CRM_CONTACTS_ARCHIVE: {
      label: t('Archiver des contacts'),
      description: t('Archiver ou désarchiver des contacts.')
    },
    CRM_DEALS_VIEW: {
      label: t('Voir les affaires'),
      description: t('Consulter les affaires / transactions (ventes, locations).')
    },
    CRM_DEALS_CREATE: {
      label: t('Créer des affaires'),
      description: t('Créer de nouvelles affaires.')
    },
    CRM_DEALS_EDIT: {
      label: t('Modifier les affaires'),
      description: t('Modifier les affaires existantes.')
    },
    CRM_DEALS_STAGE_CHANGE: {
      label: t("Changer l'étape des affaires"),
      description: t('Faire évoluer une affaire dans le pipeline (étape, statut).')
    },
    CRM_ACTIVITIES_VIEW: {
      label: t('Voir les activités'),
      description: t('Consulter les activités CRM (appels, tâches, notes).')
    },
    CRM_ACTIVITIES_CREATE: {
      label: t('Créer des activités'),
      description: t('Créer des activités (appels, tâches, notes).')
    },
    CRM_APPOINTMENTS_VIEW: {
      label: t('Voir les rendez-vous'),
      description: t('Consulter le calendrier et les rendez-vous.')
    },
    CRM_APPOINTMENTS_CREATE: {
      label: t('Créer des rendez-vous'),
      description: t('Créer de nouveaux rendez-vous.')
    },
    CRM_APPOINTMENTS_EDIT: {
      label: t('Modifier les rendez-vous'),
      description: t('Modifier ou annuler des rendez-vous.')
    },
    CRM_MATCHING_RUN: {
      label: t("Lancer l'appariement biens / affaires"),
      description: t("Exécuter l'appariement entre biens et affaires CRM.")
    },
    CRM_MATCHING_VIEW: {
      label: t('Voir les appariements'),
      description: t("Consulter les résultats d'appariement biens / affaires.")
    },

    // --- Biens immobiliers ---
    PROPERTIES_VIEW: {
      label: t('Voir les biens'),
      description: t('Consulter la liste et le détail des biens immobiliers.')
    },
    PROPERTIES_CREATE: {
      label: t('Créer des biens'),
      description: t('Créer de nouvelles annonces / biens.')
    },
    PROPERTIES_EDIT: {
      label: t('Modifier les biens'),
      description: t('Modifier les biens existants.')
    },
    PROPERTIES_DELETE: {
      label: t('Supprimer / archiver des biens'),
      description: t('Supprimer ou archiver des biens.')
    },
    PROPERTIES_PUBLISH: {
      label: t('Publier / dépublier des biens'),
      description: t('Mettre en ligne ou retirer des biens de la publication.')
    },
    PROPERTIES_MATCH: {
      label: t('Appariement biens pour les affaires'),
      description: t("Lancer l'appariement des biens avec les affaires CRM.")
    },
    PROPERTIES_VISITS_SCHEDULE: {
      label: t('Planifier des visites'),
      description: t('Planifier et gérer les visites des biens.')
    },

    // --- Location (baux, échéances, paiements, etc.) ---
    RENTAL_LEASES_VIEW: {
      label: t('Voir les baux'),
      description: t('Consulter les baux de location.')
    },
    RENTAL_LEASES_CREATE: {
      label: t('Créer des baux'),
      description: t('Créer de nouveaux baux.')
    },
    RENTAL_LEASES_EDIT: {
      label: t('Modifier les baux'),
      description: t('Modifier les baux existants.')
    },
    RENTAL_INSTALLMENTS_VIEW: {
      label: t('Voir les échéances'),
      description: t('Consulter les échéances de loyer.')
    },
    RENTAL_INSTALLMENTS_GENERATE: {
      label: t('Générer les échéances'),
      description: t('Générer les échéances de loyer (plan d’échéances).')
    },
    RENTAL_PAYMENTS_VIEW: {
      label: t('Voir les paiements'),
      description: t('Consulter les paiements de loyer.')
    },
    RENTAL_PAYMENTS_CREATE: {
      label: t('Créer des paiements'),
      description: t('Saisir ou enregistrer des paiements.')
    },
    RENTAL_PAYMENTS_ALLOCATE: {
      label: t('Allouer les paiements'),
      description: t('Allouer les paiements aux échéances (rattacher un paiement à une échéance).')
    },
    RENTAL_PENALTIES_VIEW: {
      label: t('Voir les pénalités'),
      description: t('Consulter les pénalités de retard.')
    },
    RENTAL_PENALTIES_CALCULATE: {
      label: t('Calculer les pénalités'),
      description: t('Lancer ou recalculer les pénalités de retard.')
    },
    RENTAL_PENALTIES_EDIT: {
      label: t('Modifier les pénalités'),
      description: t('Modifier ou annuler des pénalités.')
    },
    RENTAL_DEPOSITS_VIEW: {
      label: t('Voir les dépôts de garantie'),
      description: t('Consulter les dépôts de garantie.')
    },
    RENTAL_DEPOSITS_CREATE: {
      label: t('Créer des dépôts de garantie'),
      description: t('Enregistrer des dépôts de garantie.')
    },
    RENTAL_DEPOSITS_EDIT: {
      label: t('Modifier les dépôts de garantie'),
      description: t('Modifier les dépôts (mouvements, remboursements).')
    },
    RENTAL_DOCUMENTS_VIEW: {
      label: t('Voir les documents location'),
      description: t('Consulter les documents liés à la location (contrats, quittances).')
    },
    RENTAL_DOCUMENTS_GENERATE: {
      label: t('Générer des documents location'),
      description: t('Générer des documents (quittances, avenants, etc.).')
    },
    RENTAL_DOCUMENTS_EDIT: {
      label: t('Modifier les documents location'),
      description: t('Modifier ou supprimer des documents de location.')
    },

    // --- Maintenance ---
    MAINTENANCE_TENANT: {
      label: t('Créer et voir ses tickets de maintenance'),
      description: t('Créer des demandes de maintenance et voir ses propres tickets (usage collaborateur).')
    },
    MAINTENANCE_ADMIN: {
      label: t('Gérer tous les tickets et prestataires'),
      description: t('Voir et gérer tous les tickets de maintenance et les prestataires (fournisseurs).')
    },

    // --- Communication ---
    COMMUNICATION_VIEW: {
      label: t('Accès au module Communication'),
      description: t('Voir et gérer la communication : modèles, règles, historique, préférences, analytiques.')
    }
  };
}

/** Libellés des groupes de permissions (préfixes) pour l’affichage en sections */
export function PERMISSION_GROUP_LABELS_FR(): Record<string, string> {
  return {
    PLATFORM: t('Plateforme (administration centrale)'),
    TENANT: t('Paramètres du tenant'),
    USERS: t('Collaborateurs'),
    BILLING: t('Facturation'),
    CRM: t('CRM (contacts, affaires, activités)'),
    PROPERTIES: t('Biens immobiliers'),
    RENTAL: t('Location (baux, loyers, documents)'),
    MAINTENANCE: t('Maintenance'),
    COMMUNICATION: t('Communication')
  };
}

/** Noms et descriptions en français des rôles (clé technique → libellé) */
export function ROLE_LABELS_FR(): Record<string, { name: string; description: string }> {
  return {
    PLATFORM_SUPER_ADMIN: {
      name: t('Super administrateur plateforme'),
      description: t('Accès complet à la plateforme : tous les tenants, modules, abonnements et factures.')
    },
    TENANT_ADMIN: {
      name: t('Administrateur tenant'),
      description: t('Gestion complète du tenant : paramètres, collaborateurs, CRM, biens, location, facturation.')
    },
    TENANT_MANAGER: {
      name: t('Gestionnaire tenant'),
      description: t(
        'Droits de gestion sans modification de la facturation : paramètres en lecture, collaborateurs, biens, location, CRM.'
      )
    },
    TENANT_AGENT: {
      name: t('Agent tenant'),
      description: t(
        'Droits limités : consulter paramètres et collaborateurs, gérer biens et visites, contacts et affaires CRM.'
      )
    },
    TENANT_ACCOUNTANT: {
      name: t('Comptable tenant'),
      description: t('Accès à la facturation et aux informations comptables du tenant.')
    }
  };
}

/**
 * Retourne le libellé et la description en français pour une permission (clé).
 * Si aucune traduction n’existe, retourne la clé et la description API.
 */
export function getPermissionLabelFr(key: string, fallbackDescription?: string | null): PermissionLabelFr {
  const fr = PERMISSION_LABELS_FR()[key];
  if (fr) return fr;
  return {
    label: key,
    description: fallbackDescription || t('Aucune description.')
  };
}

/**
 * Retourne le libellé du groupe (section) en français à partir du préfixe de la clé.
 */
export function getPermissionGroupLabelFr(prefix: string): string {
  return PERMISSION_GROUP_LABELS_FR()[prefix] || prefix;
}

/**
 * Retourne le nom et la description en français pour un rôle (clé).
 */
export function getRoleLabelFr(key: string, fallbackName?: string, fallbackDescription?: string | null) {
  const fr = ROLE_LABELS_FR()[key];
  if (fr) return { name: fr.name, description: fr.description };
  return {
    name: fallbackName || key,
    description: fallbackDescription || ''
  };
}
