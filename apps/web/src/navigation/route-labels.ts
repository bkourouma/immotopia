import i18next from '../i18n/index';
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
 *
 * La table est reconstruite à chaque changement de langue (voir
 * `labelForSegment`) : construite une seule fois au chargement du module,
 * elle figeait les libellés dans la langue du moment, avant même que le
 * catalogue arabe ou anglais ne soit chargé.
 */
function buildRouteLabels(): Record<string, string> {
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
    entities: t('Entités détentrices'),
    'tax-parameters': t('Paramètres fiscaux'),

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
    caisse: t('Caisse'),
    tresorerie: t('Trésorerie'),
    budgets: t('Budgets'),
    'profils-incidents': t('Profils et incidents'),
    compte: t('Compte propriétaire'),
    // Lots S1 à S3 : sans ces entrées, le fil d'Ariane lisait l'adresse
    // (« Mandants », « Suivi mensuel ») et ne se traduisait pas.
    mandants: t('Agences mandantes'),
    'suivi-mensuel': t('Suivi mensuel'),
    quittances: t('Quittances'),
    // Lot S4 : onglet des appels automatiques.
    programmation: t('Programmation'),

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
    'ai-settings': t('Assistant IA'),

    // Administration d'agence
    tenant: t('Agence'),
    collaborators: t('Collaborateurs'),
    invite: t('Inviter'),
    invitations: t('Invitations'),

    // Portails
    owner: t('Portail propriétaire'),
    copropriete: t('Espace copropriétaire'),
    appels: t('Appels de charges'),
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
    rentals: t('Locations'),

    // Ventes immobilières (lot 9).
    mandates: t('Mandats de vente'),
    agreements: t('Compromis de vente')
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

/** Table construite au chargement, dans la langue de ce moment-là (lecture seule). */
export const ROUTE_LABELS: Record<string, string> = buildRouteLabels();

let cachedLabels: { language: string; resourcesReady: boolean; labels: Record<string, string> } | null = null;

/** Table dans la langue active, reconstruite quand la langue (ou son catalogue) change. */
function currentRouteLabels(): Record<string, string> {
  const language = i18next.language ?? '';
  const resourcesReady = i18next.hasResourceBundle?.(language, 'app') ?? false;
  if (!cachedLabels || cachedLabels.language !== language || cachedLabels.resourcesReady !== resourcesReady) {
    cachedLabels = { language, resourcesReady, labels: buildRouteLabels() };
  }
  return cachedLabels.labels;
}

/** Libellé d'un segment ; capitalise le segment brut s'il est inconnu. */
export function labelForSegment(segment: string): string {
  const known = currentRouteLabels()[segment];
  if (known) return known;
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
}
