import { t } from '../i18n/t';
/**
 * Table segment de route → libellé français (REFONTE_UI_UX.md §4.3).
 *
 * Alimente `<Breadcrumbs>`, qui est **dérivé du routeur** et non écrit à la
 * main écran par écran. C'est la même source que le menu : un libellé changé
 * ici change partout.
 *
 * Un segment absent de cette table est rendu tel quel, en capitalisant sa
 * première lettre — visible, donc corrigeable, plutôt que masqué.
 */
export const ROUTE_LABELS: Record<string, string> = {
  // Racines
  dashboard: t('Tableau de bord'),
  settings: t('Paramètres'),
  profile: 'Profil',

  // Propriétés
  properties: t('Propriétés'),
  new: 'Nouveau',
  edit: 'Modifier',
  visits: 'Visites',
  calendar: 'Calendrier',

  // Patrimoine
  patrimoine: 'Patrimoine',
  performance: 'Performance',
  'work-programs': t('Programmes de travaux'),
  statements: t('Relevés'),

  // Gestion locative
  rental: t('Gestion locative'),
  leases: 'Baux',
  // « Encaisser » et non « Échéances » : le §4.3 renomme cette destination,
  // et le fil d'Ariane doit dire la même chose que l'onglet actif.
  installments: 'Encaisser',
  payments: 'Paiements',
  penalties: t('Pénalités'),
  deposits: t('Dépôts de garantie'),
  documents: 'Documents',
  templates: t('Modèles'),

  // Syndic
  syndics: t('Copropriétés'),
  lots: 'Lots',
  charges: 'Charges',
  assemblees: t('Assemblées générales'),
  prestataires: 'Prestataires',
  finances: 'Finances',
  recouvrement: 'Recouvrement',
  comptabilite: t('Comptabilité'),
  caisse: t('Caisse'),
  tresorerie: t('Trésorerie'),
  budgets: 'Budgets',
  'profils-incidents': t('Profils et incidents'),
  compte: t('Compte propriétaire'),

  // Gestion locative, lots 2 et 3 : sans ces entrées, le fil d'Ariane
  // affichait « Owner accounts » et « Account », tels que dans l'adresse.
  'owner-accounts': t('Comptes propriétaires'),
  commissions: t('Commissions des agents'),
  account: t('Mon compte'),

  // Finance : mêmes mots que les onglets de `finance-workspaces.tsx`. Sans
  // ces entrées, le fil d'Ariane lisait l'adresse — « Balance agee »,
  // « Baux terrain », « Tacherons », sans accents ni traduction.
  finance: t('Finance'),
  facturation: t('Facturation du mois'),
  'balance-clients': t('Balance clients'),
  'balance-agee': t('Balance âgée'),
  associations: t('Associations'),
  comptes: t('Relevé de compte'),
  validation: t('Pièces à valider'),
  importation: t('Importation'),
  fournisseurs: t('Fournisseurs'),
  'factures-fournisseurs': t('Factures fournisseurs'),
  'pieces-de-caisse': t('Pièce de caisse'),
  balance: t('Balance fournisseurs'),
  'bons-de-commande': t('Bons de commande'),
  nouveau: t('Nouveau'),
  retenues: t('Retenues de garantie'),
  chantiers: t('Chantiers'),
  budget: t('Budget du chantier'),
  cloture: t('Lots et clôture'),
  'tableau-de-bord-chantiers': t('Tableau de bord chantiers'),
  'baux-terrain': t('Baux de terrain'),
  stock: t('Stock'),
  inventaire: t('Inventaire'),
  parametrage: t('Articles et lieux'),
  salaires: t('Salaires'),
  tacherons: t('Tâcherons'),

  // CRM
  crm: 'CRM',
  contacts: 'Contacts',
  deals: 'Affaires',
  activities: t('Activités'),

  // Maintenance
  maintenance: 'Maintenance',
  tickets: 'Tickets',
  vendors: 'Prestataires',

  // Communication et newsletter
  communication: 'Communication',
  'email-notifications': t('Notifications e-mail'),
  'whatsapp-notifications': t('Notifications WhatsApp'),
  'whatsapp-group-message': t('Message groupé WhatsApp'),
  newsletter: 'Newsletter',
  lists: 'Listes',
  campaigns: 'Campagnes',
  subscribe: 'Inscription',
  confirm: 'Confirmation',
  unsubscribe: t('Désinscription'),

  // Administration de plateforme
  admin: 'Administration',
  tenants: 'Agences',
  statistics: 'Statistiques',
  audit: t("Journaux d'audit"),
  'roles-permissions': t('Rôles et permissions'),

  // Administration d'agence
  tenant: 'Agence',
  collaborators: 'Collaborateurs',
  invite: 'Inviter',
  invitations: 'Invitations',

  // Portails
  owner: t('Portail propriétaire'),
  revenues: 'Revenus',
  lease: t('Mon bail'),
  deposit: t('Dépôt de garantie'),
  reports: 'Rapports',
  preferences: t('Préférences'),

  // Divers
  clients: 'Clients',
  groups: 'Groupes',
  transactions: 'Transactions',
  sales: 'Ventes',
  rentals: 'Locations',

  // Ventes immobilières (lot 9).
  mandates: t('Mandats de vente'),
  agreements: t('Compromis de vente')
};

/** Vrai pour un segment d'identifiant : UUID, ObjectId ou entier. */
export function isIdSegment(segment: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
    /^[0-9a-f]{24}$/i.test(segment) ||
    /^\d+$/.test(segment)
  );
}

/** Libellé d'un segment ; capitalise le segment brut s'il est inconnu. */
export function labelForSegment(segment: string): string {
  const known = ROUTE_LABELS[segment];
  if (known) return known;
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
}
