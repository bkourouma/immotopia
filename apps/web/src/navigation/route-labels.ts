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
export function ROUTE_LABELS(): Record<string, string> {
  return {
    // Racines
    dashboard: t('Tableau de bord'),
    settings: t('Paramètres'),
    profile: t('Profil'),

    // Propriétés
    properties: t('Propriétés'),
    new: t('Nouveau'),
    edit: t('Modifier'),
    visits: t('Visites'),
    calendar: t('Calendrier'),

    // Patrimoine
    patrimoine: t('Patrimoine'),
    performance: t('Performance'),
    'work-programs': t('Programmes de travaux'),
    statements: t('Relevés'),

    // Gestion locative
    rental: t('Gestion locative'),
    leases: t('Baux'),
    // « Encaisser » et non « Échéances » : le §4.3 renomme cette destination,
    // et le fil d'Ariane doit dire la même chose que l'onglet actif.
    installments: t('Encaisser'),
    payments: t('Paiements'),
    penalties: t('Pénalités'),
    deposits: t('Dépôts de garantie'),
    documents: t('Documents'),
    templates: t('Modèles'),

    // Syndic
    syndics: t('Copropriétés'),
    lots: t('Lots'),
    charges: t('Charges'),
    assemblees: t('Assemblées générales'),
    prestataires: t('Prestataires'),
    finances: t('Finances'),
    recouvrement: t('Recouvrement'),
    comptabilite: t('Comptabilité'),
    budgets: t('Budgets'),
    'profils-incidents': t('Profils et incidents'),
    compte: t('Compte propriétaire'),

    // CRM
    crm: 'CRM',
    contacts: t('Contacts'),
    deals: t('Affaires'),
    activities: t('Activités'),

    // Maintenance
    maintenance: t('Maintenance'),
    tickets: t('Tickets'),
    vendors: t('Prestataires'),

    // Communication et newsletter
    communication: t('Communication'),
    'email-notifications': t('Notifications e-mail'),
    'whatsapp-notifications': t('Notifications WhatsApp'),
    'whatsapp-group-message': t('Message groupé WhatsApp'),
    newsletter: t('Newsletter'),
    lists: t('Listes'),
    campaigns: t('Campagnes'),
    subscribe: t('Inscription'),
    confirm: t('Confirmation'),
    unsubscribe: t('Désinscription'),

    // Administration de plateforme
    admin: t('Administration'),
    tenants: t('Agences'),
    statistics: t('Statistiques'),
    audit: t("Journaux d'audit"),
    'roles-permissions': t('Rôles et permissions'),

    // Administration d'agence
    tenant: t('Agence'),
    collaborators: t('Collaborateurs'),
    invite: t('Inviter'),
    invitations: t('Invitations'),

    // Portails
    owner: t('Portail propriétaire'),
    revenues: t('Revenus'),
    lease: t('Mon bail'),
    deposit: t('Dépôt de garantie'),
    reports: t('Rapports'),
    preferences: t('Préférences'),

    // Divers
    clients: t('Clients'),
    groups: t('Groupes'),
    transactions: t('Transactions'),
    sales: t('Ventes'),
    rentals: t('Locations')
  };
}

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
  const known = ROUTE_LABELS()[segment];
  if (known) return known;
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
}
