import type React from 'react';
import { NAVIGATION, SECTION_LABELS } from './model';
import type { NavFeature, NavGroup, PersonaId, SectionId } from './model';
import { t } from '../i18n/t';

/**
 * Catalogue des menus, dérivé du modèle de navigation.
 *
 * L'écran « Rôles et permissions » avait un angle mort : il listait des
 * permissions techniques (`RENTAL_LEASES_VIEW`, `CRM_DEALS_EDIT`, …) sans
 * jamais dire **ce que la personne verrait dans son menu**. On réglait des
 * verrous sans voir les portes. Ce fichier fournit les portes : exactement
 * l'arbre affiché par la sidebar, découpé par les mêmes catégories.
 *
 * Il est *dérivé* de `NAVIGATION`, jamais recopié. Ajouter une entrée au menu
 * la fait apparaître ici — et donc dans l'écran d'administration — sans
 * qu'aucune liste parallèle ait à être tenue à jour.
 */

/**
 * Clés des deux personas qui n'ont pas de ligne dans `roles`.
 *
 * Les rôles d'agence et de plateforme viennent de la table `roles`. Le
 * propriétaire et le locataire, eux, sont déduits de `clientType` : ils n'y
 * figurent pas. Ils restent pourtant des rôles du point de vue de
 * l'administrateur qui règle les menus, d'où ces deux pseudo-clés.
 */
export const PORTAL_OWNER_ROLE_KEY = 'PORTAL_OWNER';
export const PORTAL_RENTER_ROLE_KEY = 'PORTAL_RENTER';

/** Rôles qui n'existent pas en base mais qui ont bel et bien une navigation. */
export interface PortalPseudoRole {
  key: string;
  name: string;
  description: string;
  persona: PersonaId;
}

export const PORTAL_PSEUDO_ROLES: PortalPseudoRole[] = [
  {
    key: PORTAL_OWNER_ROLE_KEY,
    name: 'Propriétaire (portail)',
    description: t(
      "Bailleur rattaché à l'agence. Accède au portail propriétaire : ses biens, ses revenus, les incidents de ses immeubles."
    ),
    persona: 'proprietaire'
  },
  {
    key: PORTAL_RENTER_ROLE_KEY,
    name: 'Locataire (portail)',
    description: t(
      'Occupant rattaché à un bail. Accède au portail locataire : son bail, ses paiements, ses incidents.'
    ),
    persona: 'locataire'
  }
];

/**
 * Persona de navigation associé à une clé de rôle.
 *
 * Tous les rôles `TENANT_*` partagent la navigation du collaborateur : ce qui
 * les distingue, ce sont les entrées ouvertes par défaut, pas l'arbre.
 */
export function personaForRoleKey(roleKey: string): PersonaId | null {
  if (roleKey === PORTAL_OWNER_ROLE_KEY) return 'proprietaire';
  if (roleKey === PORTAL_RENTER_ROLE_KEY) return 'locataire';
  if (roleKey.startsWith('PLATFORM_')) return 'super-admin';
  if (roleKey.startsWith('TENANT_')) return 'collaborateur';
  return null;
}

/**
 * Clé de menu persistée.
 *
 * Préfixée par le persona parce que `accueil`, `biens` et `incidents` existent
 * dans plusieurs arbres sans désigner la même destination : couper « Biens »
 * au propriétaire ne doit pas couper « Biens » au collaborateur.
 */
export function menuKeyFor(persona: PersonaId, groupKey: string, leafKey?: string): string {
  return leafKey ? `${persona}.${groupKey}.${leafKey}` : `${persona}.${groupKey}`;
}

export interface MenuCatalogLeaf {
  menuKey: string;
  label: string;
  href: string;
  /** Permissions RBAC dont une seule suffit à ouvrir l'entrée par défaut. */
  requires: string[];
  /** Fonctionnalité d'abonnement requise (héritée du groupe, `CORE` à défaut). */
  feature: NavFeature;
}

export interface MenuCatalogEntry {
  menuKey: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  requires: string[];
  /** Fonctionnalité d'abonnement du groupe ; `CORE` quand il n'en déclare pas. */
  feature: NavFeature;
  children: MenuCatalogLeaf[];
}

export interface MenuCatalogSection {
  id: SectionId | 'general';
  label: string;
  entries: MenuCatalogEntry[];
}

/**
 * Permissions ouvrant chaque entrée **par défaut**.
 *
 * Indexé par clé de navigation, sans préfixe de persona : ces permissions ne
 * concernent que les rôles qui en ont, c'est-à-dire la plateforme et l'agence.
 * Un tableau vide signifie « ouvert à tous les rôles du persona » — le tableau
 * de bord, par exemple, n'est conditionné par rien.
 *
 * Une entrée absente de cette table est traitée comme un tableau vide : un
 * nouveau menu apparaît donc ouvert, et c'est l'administrateur qui le referme.
 * L'inverse — apparaître fermé — donnerait un menu manquant que personne ne
 * saurait où rallumer.
 */
const MENU_REQUIREMENTS: Record<string, string[]> = {
  // Super-administrateur.
  administration: ['PLATFORM_TENANTS_VIEW'],
  'admin-tenants': ['PLATFORM_TENANTS_VIEW'],
  'admin-roles': ['PLATFORM_TENANTS_EDIT'],
  'admin-statistics': ['PLATFORM_TENANTS_VIEW'],
  'admin-audit': ['PLATFORM_TENANTS_VIEW'],

  // Parc immobilier.
  biens: ['PROPERTIES_VIEW'],
  'properties-list': ['PROPERTIES_VIEW'],
  'properties-visits-calendar': ['PROPERTIES_VISITS_SCHEDULE', 'PROPERTIES_VIEW'],

  // Gestion locative.
  baux: ['RENTAL_LEASES_VIEW'],
  encaisser: ['RENTAL_INSTALLMENTS_VIEW', 'RENTAL_PAYMENTS_VIEW'],
  'rental-installments': ['RENTAL_INSTALLMENTS_VIEW'],
  'rental-payments': ['RENTAL_PAYMENTS_VIEW'],

  // Finance. Une entrée à onglets ouvre plusieurs écrans : elle n'exige une
  // permission que si CHACUN de ses écrans en exigeait une, sinon un rôle
  // perdrait par défaut un écran qu'il voyait. D'où l'absence volontaire de
  // `finance-tresorerie` (Caisse exigeait FINANCE_DOCUMENTS_CREATE, Trésorerie
  // rien) et de `finance-owner-accounts` (Comptes propriétaires exigeait
  // FINANCE_ACCOUNTS_READ, Associations rien). Les cinq groupes, comme
  // l'ancien groupe « Finance », ne sont conditionnés par rien.
  'finance-comptabilite': ['FINANCE_REPORTS_READ'],

  // Patrimoine et entretien.
  patrimoine: ['PROPERTIES_VIEW'],
  'patrimoine-overview': ['PROPERTIES_VIEW'],
  'patrimoine-performance': ['PROPERTIES_VIEW'],
  'patrimoine-work-programs': ['PROPERTIES_VIEW'],
  'patrimoine-statements': ['PROPERTIES_VIEW'],
  maintenance: ['MAINTENANCE_ADMIN', 'MAINTENANCE_TENANT'],
  'maintenance-agence-tickets': ['MAINTENANCE_ADMIN'],
  'maintenance-mes-demandes': ['MAINTENANCE_TENANT', 'MAINTENANCE_ADMIN'],
  'maintenance-agence-vendors': ['MAINTENANCE_ADMIN'],

  // Ventes immobilières (lot 9).
  ventes: ['CRM_DEALS_VIEW', 'FINANCE_ACCOUNTS_READ'],
  'sales-dashboard': ['CRM_DEALS_VIEW'],
  'sales-mandates': ['CRM_DEALS_VIEW'],
  'sales-commissions': ['CRM_DEALS_VIEW', 'FINANCE_ACCOUNTS_READ'],

  // Commercial et communication.
  crm: ['CRM_CONTACTS_VIEW', 'CRM_DEALS_VIEW', 'CRM_ACTIVITIES_VIEW'],
  'crm-dashboard': ['CRM_CONTACTS_VIEW', 'CRM_DEALS_VIEW'],
  'crm-calendar': ['CRM_APPOINTMENTS_VIEW'],
  'crm-contacts': ['CRM_CONTACTS_VIEW'],
  'crm-deals': ['CRM_DEALS_VIEW'],
  'crm-activities': ['CRM_ACTIVITIES_VIEW'],
  communication: ['COMMUNICATION_VIEW'],
  'communication-email': ['COMMUNICATION_VIEW'],
  'communication-whatsapp': ['COMMUNICATION_VIEW'],
  'communication-whatsapp-groupe': ['COMMUNICATION_VIEW'],
  'newsletter-lists': ['COMMUNICATION_VIEW'],
  'newsletter-campaigns': ['COMMUNICATION_VIEW'],
  'newsletter-templates': ['COMMUNICATION_VIEW'],

  // Paramétrage.
  documents: ['RENTAL_DOCUMENTS_VIEW'],
  'documents-templates': ['RENTAL_DOCUMENTS_VIEW'],
  agence: ['USERS_VIEW', 'TENANT_SETTINGS_VIEW'],
  'agence-collaborators': ['USERS_VIEW'],
  'agence-invitations': ['USERS_CREATE'],
  'agence-settings': ['TENANT_SETTINGS_VIEW'],
  'agence-finance-settings': ['TENANT_SETTINGS_VIEW']
};

function requirementsFor(navKey: string): string[] {
  return MENU_REQUIREMENTS[navKey] ?? [];
}

/**
 * Anciennes clés de menu reprises par une clé actuelle.
 *
 * Le serveur ne connaît que des clés opaques (`role-menu-service.ts`) : quand
 * l'arbre change, les décisions déjà enregistrées portent sur des clés qui
 * n'existent plus. Sans reprise, `resolveMenuMap` les ignorerait et la
 * coquille ne les verrait plus — un menu coupé par un administrateur
 * réapparaîtrait sans que personne l'ait décidé.
 *
 * Règle : tant qu'une clé actuelle n'a pas de décision propre, elle hérite de
 * ses anciennes clés, et reste visible dès qu'**une seule** l'était — un rôle
 * qui voyait un écran continue de le voir. Au premier enregistrement du rôle,
 * l'écran d'administration écrit les clés actuelles et efface les anciennes
 * (`replaceMenuAccessForRole` remplace tout) : la reprise s'éteint d'elle-même.
 *
 * Une ancienne clé ne doit plus être une clé vivante : sinon deux entrées
 * différentes se disputeraient la même décision. C'est pourquoi aucun des
 * cinq groupes de la finance ne garde la clé `finance`.
 */
const LEGACY_FINANCE_GROUP = 'finance';

/**
 * Finance, septembre 2026 : l'unique groupe `finance` et ses vingt-trois
 * feuilles deviennent cinq groupes. Chaque feuille actuelle → les anciennes
 * feuilles du groupe `finance` dont elle ouvre désormais les écrans.
 */
const LEGACY_FINANCE_LEAVES: Record<string, string[]> = {
  'finance-tresorerie': ['finance-caisse', 'finance-tresorerie'],
  'finance-validation': ['finance-validation', 'finance-importation'],
  'finance-comptabilite': ['finance-comptabilite'],
  'finance-clients': ['finance-facturation', 'finance-clients', 'finance-clients-agee'],
  'finance-owner-accounts': ['finance-owner-accounts', 'finance-associations', 'finance-agent-commissions'],
  'finance-fournisseurs': ['finance-fournisseurs', 'finance-bons-de-commande', 'finance-fournisseurs-balance'],
  'finance-retenues': ['finance-retenues'],
  'finance-chantiers': ['finance-chantiers', 'finance-tableau-de-bord-chantiers', 'finance-baux-terrain'],
  'finance-stock': ['finance-stock', 'finance-stock-inventaire', 'finance-stock-parametrage'],
  'finance-salaires': ['finance-salaires'],
  'finance-tacherons': ['finance-tacherons']
};

function buildLegacyMenuKeys(): Record<string, string[]> {
  const persona: PersonaId = 'collaborateur';
  const legacy: Record<string, string[]> = {};
  for (const group of NAVIGATION[persona].tree) {
    if (group.section !== 'finance') continue;
    legacy[menuKeyFor(persona, group.key)] = [menuKeyFor(persona, LEGACY_FINANCE_GROUP)];
    for (const leaf of group.children ?? []) {
      const previous = LEGACY_FINANCE_LEAVES[leaf.key] ?? [];
      legacy[menuKeyFor(persona, group.key, leaf.key)] = previous.map(old =>
        menuKeyFor(persona, LEGACY_FINANCE_GROUP, old)
      );
    }
  }
  return legacy;
}

const LEGACY_MENU_KEYS = buildLegacyMenuKeys();

/** Anciennes clés dont `menuKey` reprend les décisions enregistrées. */
export function legacyMenuKeysFor(menuKey: string): string[] {
  return LEGACY_MENU_KEYS[menuKey] ?? [];
}

/**
 * Vrai si la coquille doit masquer `menuKey`, d'après la liste des clés coupées
 * que renvoie le serveur : coupée elle-même, ou toutes ses anciennes clés
 * coupées.
 */
export function isMenuKeyDisabled(menuKey: string, disabled: Set<string>): boolean {
  if (disabled.has(menuKey)) return true;
  const legacy = legacyMenuKeysFor(menuKey);
  return legacy.length > 0 && legacy.every(key => disabled.has(key));
}

/** Intitulé des entrées sans domaine : un menu sans catégorie reste un menu. */
const GENERAL_SECTION_LABEL = t('Général');

function toEntry(persona: PersonaId, group: NavGroup): MenuCatalogEntry {
  return {
    menuKey: menuKeyFor(persona, group.key),
    label: group.label,
    icon: group.icon,
    href: group.href,
    requires: requirementsFor(group.key),
    feature: group.feature ?? 'CORE',
    children: (group.children ?? []).map(leaf => ({
      menuKey: menuKeyFor(persona, group.key, leaf.key),
      label: leaf.label,
      href: leaf.href,
      requires: requirementsFor(leaf.key),
      feature: leaf.feature ?? group.feature ?? 'CORE'
    }))
  };
}

/**
 * Catalogue d'un persona, découpé par les catégories de la sidebar.
 *
 * L'ordre des sections suit l'ordre d'apparition dans l'arbre, pas un ordre
 * alphabétique : l'écran d'administration doit se lire comme le menu, sinon
 * la comparaison avec ce que voit l'utilisateur redevient un exercice de
 * mémoire.
 */
export function catalogForPersona(persona: PersonaId): MenuCatalogSection[] {
  const sections: MenuCatalogSection[] = [];
  const bySection = new Map<string, MenuCatalogSection>();

  for (const group of NAVIGATION[persona].tree) {
    const id: SectionId | 'general' = group.section ?? 'general';
    let section = bySection.get(id);
    if (!section) {
      section = {
        id,
        label: id === 'general' ? GENERAL_SECTION_LABEL : SECTION_LABELS[id as SectionId],
        entries: []
      };
      bySection.set(id, section);
      sections.push(section);
    }
    section.entries.push(toEntry(persona, group));
  }

  return sections;
}

/** Toutes les clés de menu d'un persona, entrées et sous-entrées confondues. */
export function menuKeysForPersona(persona: PersonaId): string[] {
  return catalogForPersona(persona).flatMap(section =>
    section.entries.flatMap(entry => [entry.menuKey, ...entry.children.map(child => child.menuKey)])
  );
}

/**
 * État par défaut d'un menu pour un rôle, avant toute décision d'administrateur.
 *
 * Pour les rôles RBAC, « par défaut » n'est pas une opinion : c'est ce que les
 * permissions du rôle autorisent déjà. Afficher une case cochée sur un menu que
 * le rôle ne peut de toute façon pas ouvrir serait un mensonge d'interface.
 *
 * Les personas de portail n'ont pas de permissions RBAC — leur portail est
 * délimité par le rattachement, pas par des droits. Tout y est donc ouvert par
 * défaut, et c'est `null` qui signale ce cas.
 */
export function defaultMenuEnabled(requires: string[], rolePermissionKeys: Set<string> | null): boolean {
  if (rolePermissionKeys === null) return true;
  if (requires.length === 0) return true;
  return requires.some(key => rolePermissionKeys.has(key));
}

/** Carte complète des états par défaut d'un rôle. */
export function defaultMenuMap(persona: PersonaId, rolePermissionKeys: Set<string> | null): Record<string, boolean> {
  const map: Record<string, boolean> = {};

  for (const section of catalogForPersona(persona)) {
    for (const entry of section.entries) {
      const entryEnabled = defaultMenuEnabled(entry.requires, rolePermissionKeys);
      map[entry.menuKey] = entryEnabled;
      for (const child of entry.children) {
        // Une sous-entrée ne peut pas être ouverte sous un parent fermé : le
        // menu ne l'afficherait nulle part.
        map[child.menuKey] = entryEnabled && defaultMenuEnabled(child.requires, rolePermissionKeys);
      }
    }
  }

  return map;
}

/**
 * Fusionne les défauts avec les décisions enregistrées.
 *
 * L'enregistrement gagne quand il existe : c'est la décision explicite d'un
 * administrateur. À défaut, les décisions prises sur les anciennes clés que la
 * clé reprend (`legacyMenuKeysFor`) — ouverte si l'une l'était. Sinon on
 * retombe sur le défaut, ce qui fait qu'un menu ajouté après coup apparaît
 * sans qu'il faille ré-enregistrer chaque rôle.
 */
export function resolveMenuMap(
  persona: PersonaId,
  rolePermissionKeys: Set<string> | null,
  overrides: Record<string, boolean> | undefined
): Record<string, boolean> {
  const map = defaultMenuMap(persona, rolePermissionKeys);
  if (!overrides) return map;

  for (const menuKey of Object.keys(map)) {
    if (typeof overrides[menuKey] === 'boolean') {
      map[menuKey] = overrides[menuKey];
      continue;
    }
    const legacy = legacyMenuKeysFor(menuKey);
    if (legacy.some(key => typeof overrides[key] === 'boolean')) {
      // Même lecture que la coquille (`isMenuKeyDisabled`) : fermée seulement
      // si TOUTES ses anciennes clés étaient explicitement coupées.
      map[menuKey] = legacy.some(key => overrides[key] !== false);
    }
  }
  return map;
}
