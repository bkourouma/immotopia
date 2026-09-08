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
  dashboard: 'Tableau de bord',
  settings: 'Paramètres',
  profile: 'Profil',

  // Propriétés
  properties: 'Propriétés',
  new: 'Nouveau',
  edit: 'Modifier',
  visits: 'Visites',
  calendar: 'Calendrier',

  // Patrimoine
  patrimoine: 'Patrimoine',
  performance: 'Performance',
  'work-programs': 'Programmes de travaux',
  statements: 'Relevés',

  // Gestion locative
  rental: 'Gestion locative',
  leases: 'Baux',
  // « Encaisser » et non « Échéances » : le §4.3 renomme cette destination,
  // et le fil d'Ariane doit dire la même chose que l'onglet actif.
  installments: 'Encaisser',
  payments: 'Paiements',
  penalties: 'Pénalités',
  deposits: 'Dépôts de garantie',
  documents: 'Documents',
  templates: 'Modèles',

  // Syndic
  syndics: 'Copropriétés',
  lots: 'Lots',
  charges: 'Charges',
  assemblees: 'Assemblées générales',
  prestataires: 'Prestataires',
  finances: 'Finances',
  recouvrement: 'Recouvrement',
  comptabilite: 'Comptabilité',
  budgets: 'Budgets',
  'profils-incidents': 'Profils et incidents',
  compte: 'Compte propriétaire',

  // CRM
  crm: 'CRM',
  contacts: 'Contacts',
  deals: 'Affaires',
  activities: 'Activités',

  // Maintenance
  maintenance: 'Maintenance',
  tickets: 'Tickets',
  vendors: 'Prestataires',

  // Communication et newsletter
  communication: 'Communication',
  'email-notifications': 'Notifications e-mail',
  'whatsapp-notifications': 'Notifications WhatsApp',
  'whatsapp-group-message': 'Message groupé WhatsApp',
  newsletter: 'Newsletter',
  lists: 'Listes',
  campaigns: 'Campagnes',
  subscribe: 'Inscription',
  confirm: 'Confirmation',
  unsubscribe: 'Désinscription',

  // Administration de plateforme
  admin: 'Administration',
  tenants: 'Agences',
  statistics: 'Statistiques',
  audit: "Journaux d'audit",
  'roles-permissions': 'Rôles et permissions',

  // Administration d'agence
  tenant: 'Agence',
  collaborators: 'Collaborateurs',
  invite: 'Inviter',
  invitations: 'Invitations',

  // Portails
  owner: 'Portail propriétaire',
  revenues: 'Revenus',
  lease: 'Mon bail',
  deposit: 'Dépôt de garantie',
  reports: 'Rapports',
  preferences: 'Préférences',

  // Divers
  clients: 'Clients',
  groups: 'Groupes',
  transactions: 'Transactions',
  sales: 'Ventes',
  rentals: 'Locations'
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
