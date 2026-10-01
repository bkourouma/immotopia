import React from 'react';
import {
  AccountBookOutlined,
  ApartmentOutlined,
  BankOutlined,
  BuildOutlined,
  ContactsOutlined,
  DashboardOutlined,
  DollarOutlined,
  EllipsisOutlined,
  FileTextOutlined,
  FolderOutlined,
  GoldOutlined,
  MailOutlined,
  MenuOutlined,
  RiseOutlined,
  SafetyOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  SolutionOutlined,
  TeamOutlined,
  ToolOutlined,
  WalletOutlined
} from '@ant-design/icons';
import { t } from '../i18n/t';
import i18next from '../i18n/index';
import { financeWorkspaceActiveFor, financeWorkspaceHref } from './finance-workspaces';
import type { FinanceWorkspaceFamily } from './finance-workspaces';

/**
 * Modèle de navigation — source unique (REFONTE_UI_UX.md §4.2, §4.3).
 *
 * Extrait des 730 lignes de `components/dashboard/sidebar.tsx` et des deux
 * `Layout.tsx` de portail, puis redressé selon le §4.3. La sidebar, la barre
 * d'onglets basse et le fil d'Ariane lisent désormais **la même** définition :
 * un libellé changé ici change partout, et les deux moitiés de l'interface ne
 * peuvent plus raconter deux hiérarchies différentes.
 *
 * Décisions du §4.3 matérialisées dans ces arbres :
 *
 *   - **Les actions ont quitté le menu.** « Ajouter une propriété », « Nouveau
 *     contact », « Nouveau bail », « Nouveau ticket » étaient rangées au même
 *     niveau que des destinations. Elles deviennent le bouton primaire du
 *     `<PageHeader>` de la liste correspondante, et un FAB en mobile.
 *   - **« Baux » et « Encaisser » sont au premier niveau**, et non repliés sous
 *     un accordéon « Gestion locative ». Ce sont les deux tâches terrain les
 *     plus fréquentes : elles sont des onglets de premier rang en mobile, elles
 *     doivent l'être aussi dans la sidebar. Le regroupement de
 *     `sidebar.tsx:271` est précisément ce que la refonte défait.
 *   - **La zone `more`** matérialise la frontière du §4.2 : quatre destinations
 *     directes, le reste derrière l'onglet « Plus ». Sans ce marqueur, le
 *     drawer devrait réinventer la règle.
 *   - **Les domaines coiffent les entrées sans les enterrer.** Onze entrées à
 *     plat ne disent pas de quel métier elles relèvent ; onze accordéons
 *     rajoutent un tap devant chacune. `section` pose un intertitre non
 *     cliquable au-dessus de chaque bloc — « Gestion locative » redevient un
 *     titre, pas un parent. L'arbre est ordonné par domaine pour que chaque
 *     titre coiffe un bloc contigu.
 *   - **Suppressions actées** : `/properties/categories` (route inexistante),
 *     le groupe « Clients » (fusionné dans CRM › Contacts), les
 *     pages-passerelles « Transactions » et « Rapports ».
 *   - **Maintenance désambiguïsée** : « Tickets de l'agence » (vue
 *     gestionnaire) et « Mes demandes » (vue demandeur), au lieu de quatre
 *     entrées qui ne disaient pas à quel rôle elles s'adressaient.
 *
 * **Fiches de détail.** `/properties/:id`, `/rental/leases/:leaseId` et
 * `/rental/installments/:installmentId` ne figurent pas dans l'arbre : sans
 * identifiant, il n'y a pas de lien à produire. On y arrive par une ligne de
 * liste. `syndics-detail` fait exception parce que la dernière copropriété
 * consultée est mémorisée — c'est ce qui rend le lien constructible.
 *
 * Les `href` portent les segments littéraux `:tenantId` et `:syndicId`, jamais
 * interpolés ici : `resolveHref()` s'en charge à l'exécution. C'est ce qui
 * empêche les `/tenant/undefined/...` que produit aujourd'hui la sidebar tant
 * que l'appartenance n'est pas chargée.
 */

/**
 * Les cinq personas qui ont une navigation.
 *
 * Un cinquieme etat existe — le compte authentifie rattache a rien — mais ce
 * n'est pas un persona : il n'a aucune destination, donc aucun menu. Il est
 * traite par `<AccountNotLinked>`, hors coquille.
 */
export type PersonaId = 'super-admin' | 'collaborateur' | 'proprietaire' | 'locataire' | 'coproprietaire';

/** Déclencheur d'interface, pas une destination : ouvre le drawer complet. */
export const MORE_TAB_HREF = '#plus';

/**
 * `primary` : destination directe, exposée par la barre d'onglets.
 * `more`    : rangée derrière « Plus ». Le §4.2 assume cette hiérarchie —
 *             ce qui est fréquent est en bas, ce qui est rare est derrière.
 */
export type NavZone = 'primary' | 'more';

/**
 * Titres de domaine de la sidebar.
 *
 * Ce ne sont **pas** des accordéons : rien ne se replie sous eux et rien ne se
 * clique. Ce sont les intertitres non interactifs d'AntD (`type: 'group'`), qui
 * disent de quel métier relèvent les entrées qui suivent. La distinction est
 * exactement celle que défait le §4.3 : « Gestion locative » redevient un
 * *titre* au-dessus de Baux et d'Encaisser, jamais le *parent* qui les enterrait
 * à trois taps dans `sidebar.tsx:271`. Les deux entrées restent des
 * destinations de premier niveau, atteignables en un clic.
 *
 * Conséquence sur l'ordre de l'arbre : les entrées d'un même domaine sont
 * contiguës, sinon le titre coifferait un bloc discontinu. C'est testé.
 */
export type SectionId =
  // Collaborateur d'agence.
  | 'parc'
  | 'locatif'
  | 'finance'
  | 'ventes'
  | 'patrimoine'
  | 'commercial'
  | 'copropriete'
  | 'parametrage'
  // Propriétaire : deux questions, pas six métiers.
  | 'portefeuille'
  | 'batiments';

function buildSectionLabels(): Record<SectionId, string> {
  return {
    parc: t('Parc immobilier'),
    locatif: t('Gestion locative'),
    finance: t('Finance'),
    ventes: t('Ventes'),
    patrimoine: t('Patrimoine et entretien'),
    commercial: t('Commercial et communication'),
    copropriete: t('Copropriété'),
    parametrage: t('Paramétrage'),
    portefeuille: t('Mon portefeuille'),
    batiments: t('Suivi des bâtiments')
  };
}

let cachedSectionLabels: { language: string; resourcesReady: boolean; labels: Record<SectionId, string> } | null = null;

/**
 * Intertitres de domaine, dans la langue active.
 *
 * Fonction et non constante de module : un objet construit une fois au
 * chargement du module figeait ses `t()` dans la langue de ce moment-là —
 * toujours le français, puisque `LanguageProvider` démarre sur cette langue
 * avant même que le catalogue mémorisé n'arrive (voir son commentaire). Le
 * remontage de `<LocalizedScreens>` reconstruit les composants qui LISENT
 * cette fonction, mais ne réexécute jamais le corps d'un module déjà importé
 * — d'où la nécessité de recalculer à chaque appel plutôt qu'une fois pour
 * toutes. Le cache évite de reconstruire l'objet à chaque rendu tant que la
 * langue (et son catalogue) n'a pas changé — même principe que
 * `route-labels.ts:currentRouteLabels`.
 */
export function getSectionLabels(): Record<SectionId, string> {
  const language = i18next.language ?? '';
  const resourcesReady = i18next.hasResourceBundle?.(language, 'app') ?? false;
  if (
    !cachedSectionLabels ||
    cachedSectionLabels.language !== language ||
    cachedSectionLabels.resourcesReady !== resourcesReady
  ) {
    cachedSectionLabels = { language, resourcesReady, labels: buildSectionLabels() };
  }
  return cachedSectionLabels.labels;
}

/**
 * Fonctionnalité d'abonnement qui ouvre une entrée (vague 2 des abonnements,
 * docs/architecture/PLAN-ABONNEMENTS.md). Même vocabulaire que
 * `packages/api/src/lib/subscription/features.ts`. Absente = `CORE`, compris
 * dans tous les packs.
 */
export type NavFeature = 'CORE' | 'CRM' | 'SALES' | 'RENTAL' | 'PATRIMOINE' | 'SYNDIC' | 'CONSTRUCTION';

export interface NavLeaf {
  key: string;
  label: string;
  href: string;
  /** Fonctionnalité requise ; hérite de celle du groupe, `CORE` à défaut. */
  feature?: NavFeature;
  /**
   * Posé par `useFilteredNavigation`, jamais dans l'arbre : le module qui
   * ouvre l'entrée a été retiré de l'abonnement (D11). L'entrée reste
   * cliquable — la lecture est permise — mais grisée, « Lecture seule ».
   */
  readOnly?: boolean;
  /**
   * Autres destinations qui allument cette entrée. Une entrée qui ouvre un
   * espace à onglets (Syndic › Finances, Finance › Suivi des chantiers) doit
   * rester active sur chaque onglet, pas seulement sur celui où son lien
   * atterrit.
   */
  activeFor?: string[];
}

export interface NavGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  zone: NavZone;
  /** Domaine métier coiffant l'entrée. Absent = pas d'intertitre (l'accueil). */
  section?: SectionId;
  href?: string;
  /** Fonctionnalité requise par l'entrée et, par défaut, par ses enfants. */
  feature?: NavFeature;
  /** Voir `NavLeaf.readOnly`. */
  readOnly?: boolean;
  children?: NavLeaf[];
}

/**
 * Entrée de menu qui ouvre un espace à onglets de la finance : elle atterrit
 * sur le premier onglet et reste allumée sur tous les autres. Tirée de
 * `finance-workspaces.tsx`, la même source que les onglets eux-mêmes.
 */
function financeLeaf(key: string, label: string, family: FinanceWorkspaceFamily): NavLeaf {
  return { key, label, href: financeWorkspaceHref(family), activeFor: financeWorkspaceActiveFor(family) };
}

export interface BottomTab {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}

export interface PersonaNav {
  id: PersonaId;
  label: string;
  tabs: BottomTab[];
  tree: NavGroup[];
}

/**
 * Modèle de navigation, dans la langue active.
 *
 * Même raison qu'au-dessus (`getSectionLabels`) : une constante de module
 * figeait tous ses libellés dans la langue lue au premier import, presque
 * toujours le français. `buildNavigation()` est rappelée à chaque appel de
 * `getNavigation()`, dont le cache n'est invalidé que lorsque la langue (ou
 * son catalogue) change réellement.
 */
function buildNavigation(): Record<PersonaId, PersonaNav> {
  return {
    'super-admin': {
      id: 'super-admin',
      label: t('Super-administrateur de la plateforme'),
      // Aucune barre d'onglets : 5 destinations au total, usage desktop exclusif.
      // Investir dans le mobile ici n'a aucun retour (§4.2).
      tabs: [],
      tree: [
        {
          key: 'accueil',
          label: t('Tableau de bord'),
          icon: <DashboardOutlined />,
          zone: 'primary',
          href: '/dashboard'
        },
        {
          key: 'administration',
          label: t('Administration'),
          icon: <SafetyOutlined />,
          zone: 'primary',
          children: [
            { key: 'admin-tenants', label: t('Agences'), href: '/admin/tenants' },
            { key: 'admin-roles', label: t('Rôles et permissions'), href: '/admin/roles-permissions' },
            { key: 'admin-statistics', label: t('Statistiques'), href: '/admin/statistics' },
            { key: 'admin-audit', label: t("Journaux d'audit"), href: '/admin/audit' },
            { key: 'admin-ai-settings', label: t('Assistant IA'), href: '/admin/ai-settings' }
          ]
        }
      ]
    },

    collaborateur: {
      id: 'collaborateur',
      label: t("Collaborateur d'agence"),
      tabs: [
        { key: 'tab-accueil', label: t('Accueil'), href: '/dashboard', icon: <DashboardOutlined /> },
        { key: 'tab-biens', label: t('Biens'), href: '/tenant/:tenantId/properties', icon: <ApartmentOutlined /> },
        { key: 'tab-baux', label: t('Baux'), href: '/tenant/:tenantId/rental/leases', icon: <FileTextOutlined /> },
        {
          key: 'tab-encaisser',
          label: t('Encaisser'),
          href: '/tenant/:tenantId/rental/installments',
          icon: <WalletOutlined />
        },
        { key: 'tab-plus', label: t('Plus'), href: MORE_TAB_HREF, icon: <MenuOutlined /> }
      ],
      tree: [
        // --- zone primaire : les quatre tâches terrain, 1 tap en mobile -------
        {
          key: 'accueil',
          label: t('Tableau de bord'),
          icon: <DashboardOutlined />,
          zone: 'primary',
          href: '/dashboard'
        },
        {
          key: 'biens',
          label: t('Biens'),
          icon: <ApartmentOutlined />,
          zone: 'primary',
          section: 'parc',
          href: '/tenant/:tenantId/properties',
          children: [
            { key: 'properties-list', label: t('Toutes les propriétés'), href: '/tenant/:tenantId/properties' },
            {
              key: 'properties-visits-calendar',
              label: t('Calendrier des visites'),
              href: '/tenant/:tenantId/properties/visits/calendar'
            }
          ]
        },
        {
          key: 'baux',
          label: t('Baux'),
          icon: <FileTextOutlined />,
          zone: 'primary',
          section: 'locatif',
          feature: 'RENTAL',
          href: '/tenant/:tenantId/rental/leases'
        },
        {
          key: 'encaisser',
          label: t('Encaisser'),
          icon: <WalletOutlined />,
          zone: 'primary',
          section: 'locatif',
          feature: 'RENTAL',
          href: '/tenant/:tenantId/rental/installments',
          children: [
            { key: 'rental-installments', label: t('Échéances'), href: '/tenant/:tenantId/rental/installments' },
            { key: 'rental-payments', label: t('Paiements'), href: '/tenant/:tenantId/rental/payments' }
          ]
        },

        // --- zone « Plus » : ce qui est rare ---------------------------------
        //
        // Finance : cinq groupes au lieu d'un accordéon de vingt-trois entrées.
        // Une entrée à onglets (`financeLeaf`) ouvre un espace de
        // `FinanceWorkspaceLayout` et reste allumée sur chacun de ses onglets ;
        // les autres sont des écrans seuls. Les segments de clé réutilisent la
        // feuille principale de chaque espace ; les anciennes clés de menu
        // enregistrées sont reprises par `LEGACY_MENU_KEYS` (menu-catalog.ts).
        {
          key: 'finance-caisse-compta',
          label: t('Caisse et comptabilité'),
          icon: <AccountBookOutlined />,
          zone: 'more',
          section: 'finance',
          href: financeWorkspaceHref('caisse-tresorerie'),
          children: [
            financeLeaf('finance-tresorerie', t('Caisse et trésorerie'), 'caisse-tresorerie'),
            financeLeaf('finance-validation', t('Saisie et validation'), 'saisie-validation'),
            { key: 'finance-comptabilite', label: t('Comptabilité'), href: '/tenant/:tenantId/finance/comptabilite' }
          ]
        },
        {
          key: 'finance-clients-proprietaires',
          label: t('Clients et propriétaires'),
          icon: <ContactsOutlined />,
          zone: 'more',
          section: 'finance',
          href: financeWorkspaceHref('facturation-balances'),
          children: [
            financeLeaf('finance-clients', t('Facturation et balances'), 'facturation-balances'),
            {
              ...financeLeaf('finance-owner-accounts', t('Reversements et commissions'), 'reversements-commissions'),
              feature: 'RENTAL'
            }
          ]
        },
        {
          key: 'finance-achats',
          label: t('Achats et fournisseurs'),
          icon: <ShoppingCartOutlined />,
          zone: 'more',
          section: 'finance',
          href: financeWorkspaceHref('fournisseurs-commandes'),
          children: [
            financeLeaf('finance-fournisseurs', t('Fournisseurs et commandes'), 'fournisseurs-commandes'),
            // Hors de l'espace fournisseurs : une retenue naît aussi bien d'une
            // facture fournisseur que d'une situation de tâcheron.
            {
              key: 'finance-retenues',
              label: t('Retenues de garantie'),
              href: '/tenant/:tenantId/finance/retenues',
              feature: 'CONSTRUCTION'
            }
          ]
        },
        {
          key: 'finance-chantiers-stock',
          label: t('Chantiers et stock'),
          icon: <BuildOutlined />,
          zone: 'more',
          section: 'finance',
          feature: 'CONSTRUCTION',
          href: financeWorkspaceHref('suivi-chantiers'),
          children: [
            financeLeaf('finance-chantiers', t('Suivi des chantiers'), 'suivi-chantiers'),
            financeLeaf('finance-stock', t('Gestion du stock'), 'gestion-stock')
          ]
        },
        {
          key: 'finance-main-oeuvre',
          label: t("Main-d'œuvre"),
          icon: <SolutionOutlined />,
          zone: 'more',
          section: 'finance',
          feature: 'CONSTRUCTION',
          href: '/tenant/:tenantId/finance/salaires',
          children: [
            { key: 'finance-salaires', label: t('Salaires'), href: '/tenant/:tenantId/finance/salaires' },
            { key: 'finance-tacherons', label: t('Tâcherons'), href: '/tenant/:tenantId/finance/tacherons' }
          ]
        },
        {
          key: 'patrimoine',
          label: t('Patrimoine'),
          icon: <GoldOutlined />,
          zone: 'more',
          section: 'patrimoine',
          feature: 'PATRIMOINE',
          href: '/tenant/:tenantId/patrimoine',
          children: [
            { key: 'patrimoine-overview', label: t('Vue consolidée'), href: '/tenant/:tenantId/patrimoine' },
            {
              key: 'patrimoine-performance',
              label: t('Performance'),
              href: '/tenant/:tenantId/patrimoine/performance'
            },
            {
              key: 'patrimoine-work-programs',
              label: t('Travaux'),
              href: '/tenant/:tenantId/patrimoine/work-programs'
            },
            {
              key: 'patrimoine-cash-plan',
              label: t('Trésorerie prévisionnelle'),
              href: '/tenant/:tenantId/patrimoine/plan-tresorerie'
            },
            {
              key: 'patrimoine-import',
              label: t('Importer mon patrimoine'),
              href: '/tenant/:tenantId/patrimoine/importation'
            },
            {
              key: 'patrimoine-claims',
              label: t('Sinistres'),
              href: '/tenant/:tenantId/patrimoine/claims'
            },
            {
              key: 'patrimoine-statements',
              label: t('Relevés'),
              href: '/tenant/:tenantId/patrimoine/statements',
              // Relevés de gérance des mandants : gestion locative.
              feature: 'RENTAL'
            },
            {
              key: 'patrimoine-entities',
              label: t('Entités détentrices'),
              href: '/tenant/:tenantId/patrimoine/entities'
            },
            {
              key: 'patrimoine-tax-parameters',
              label: t('Paramètres fiscaux'),
              href: '/tenant/:tenantId/patrimoine/tax-parameters'
            },
            {
              key: 'patrimoine-land',
              label: t('Régularisation foncière'),
              href: '/tenant/:tenantId/patrimoine/land'
            }
          ]
        },
        {
          key: 'maintenance',
          label: t('Maintenance'),
          icon: <ToolOutlined />,
          zone: 'more',
          section: 'patrimoine',
          href: '/tenant/:tenantId/admin/maintenance/tickets',
          children: [
            {
              key: 'maintenance-agence-tickets',
              label: t("Tickets de l'agence"),
              href: '/tenant/:tenantId/admin/maintenance/tickets'
            },
            { key: 'maintenance-mes-demandes', label: t('Mes demandes'), href: '/tenant/:tenantId/maintenance' },
            {
              key: 'maintenance-agence-vendors',
              label: t('Prestataires'),
              href: '/tenant/:tenantId/admin/maintenance/vendors'
            }
          ]
        },
        {
          // Ventes immobilières (lot 9) : mandats, offres, compromis, actes,
          // commissions. Posée juste avant CRM — l'affaire CRM gagnée est le
          // point d'entrée d'où naît un mandat de vente.
          key: 'ventes',
          label: t('Ventes'),
          icon: <ShopOutlined />,
          zone: 'more',
          section: 'ventes',
          feature: 'SALES',
          href: '/tenant/:tenantId/sales',
          children: [
            { key: 'sales-dashboard', label: t('Tableau des ventes'), href: '/tenant/:tenantId/sales' },
            { key: 'sales-mandates', label: t('Mandats de vente'), href: '/tenant/:tenantId/sales/mandates' },
            { key: 'sales-commissions', label: t('Commissions de vente'), href: '/tenant/:tenantId/sales/commissions' }
          ]
        },
        {
          key: 'crm',
          label: 'CRM',
          icon: <RiseOutlined />,
          zone: 'more',
          section: 'commercial',
          href: '/tenant/:tenantId/crm/dashboard',
          children: [
            // Les contacts sont du socle (tous les packs) ; le pipeline est CRM.
            {
              key: 'crm-dashboard',
              label: t('Tableau de bord CRM'),
              href: '/tenant/:tenantId/crm/dashboard',
              feature: 'CRM'
            },
            { key: 'crm-calendar', label: t('Calendrier'), href: '/tenant/:tenantId/crm/calendar', feature: 'CRM' },
            { key: 'crm-contacts', label: t('Contacts'), href: '/tenant/:tenantId/crm/contacts' },
            { key: 'crm-deals', label: t('Affaires'), href: '/tenant/:tenantId/crm/deals', feature: 'CRM' },
            { key: 'crm-activities', label: t('Activités'), href: '/tenant/:tenantId/crm/activities', feature: 'CRM' }
          ]
        },
        {
          key: 'communication',
          label: t('Communication'),
          icon: <MailOutlined />,
          zone: 'more',
          section: 'commercial',
          href: '/tenant/:tenantId/communication/email-notifications',
          children: [
            {
              key: 'communication-email',
              label: t('Notifications e-mail'),
              href: '/tenant/:tenantId/communication/email-notifications'
            },
            {
              key: 'communication-whatsapp',
              label: t('Notifications WhatsApp'),
              href: '/tenant/:tenantId/communication/whatsapp-notifications'
            },
            {
              key: 'communication-whatsapp-groupe',
              label: t('Message groupé WhatsApp'),
              href: '/tenant/:tenantId/communication/whatsapp-group-message'
            },
            { key: 'newsletter-lists', label: t('Newsletter — Listes'), href: '/tenant/:tenantId/newsletter/lists' },
            {
              key: 'newsletter-campaigns',
              label: t('Newsletter — Campagnes'),
              href: '/tenant/:tenantId/newsletter/campaigns'
            },
            {
              key: 'newsletter-templates',
              label: t('Newsletter — Modèles'),
              href: '/tenant/:tenantId/newsletter/templates'
            }
          ]
        },
        {
          key: 'syndic',
          label: t('Syndic'),
          icon: <BankOutlined />,
          zone: 'more',
          section: 'copropriete',
          feature: 'SYNDIC',
          href: '/tenant/:tenantId/syndics',
          children: [
            // Quatre entrées dans l'ordre du travail d'un syndic : choisir la
            // copropriété, la décrire, gérer son argent, la faire voter. Le
            // détail vit dans les onglets de SyndicWorkspaceLayout ; les clés
            // réutilisent les anciennes pour garder les réglages de menu des rôles.
            { key: 'syndics-list', label: t('Copropriétés'), href: '/tenant/:tenantId/syndics' },
            {
              key: 'syndics-mandating-agencies',
              label: t('Agences mandantes'),
              href: '/tenant/:tenantId/syndics/mandants'
            },
            {
              key: 'syndics-detail',
              label: t('Copropriété'),
              href: '/tenant/:tenantId/syndics/:syndicId',
              activeFor: [
                '/tenant/:tenantId/syndics/:syndicId/lots',
                '/tenant/:tenantId/syndics/:syndicId/prestataires',
                '/tenant/:tenantId/syndics/:syndicId/profils-incidents'
              ]
            },
            {
              key: 'syndics-finances',
              label: t('Finances'),
              href: '/tenant/:tenantId/syndics/:syndicId/budgets',
              activeFor: [
                '/tenant/:tenantId/syndics/:syndicId/charges',
                '/tenant/:tenantId/syndics/:syndicId/suivi-mensuel',
                '/tenant/:tenantId/syndics/:syndicId/quittances',
                '/tenant/:tenantId/syndics/:syndicId/recouvrement',
                '/tenant/:tenantId/syndics/:syndicId/finances',
                '/tenant/:tenantId/syndics/:syndicId/comptabilite'
              ]
            },
            {
              key: 'syndics-assemblees',
              label: t('Assemblées et documents'),
              href: '/tenant/:tenantId/syndics/:syndicId/assemblees',
              activeFor: ['/tenant/:tenantId/syndics/:syndicId/documents']
            }
          ]
        },
        {
          key: 'documents',
          label: t('Documents'),
          icon: <FolderOutlined />,
          zone: 'more',
          section: 'parametrage',
          href: '/tenant/:tenantId/documents/templates',
          children: [
            {
              key: 'documents-templates',
              label: t('Modèles de documents'),
              href: '/tenant/:tenantId/documents/templates'
            }
          ]
        },
        {
          key: 'agence',
          label: t('Agence'),
          icon: <TeamOutlined />,
          zone: 'more',
          section: 'parametrage',
          href: '/tenant/:tenantId/collaborators',
          children: [
            { key: 'agence-collaborators', label: t('Collaborateurs'), href: '/tenant/:tenantId/collaborators' },
            { key: 'agence-invitations', label: t('Invitations'), href: '/tenant/:tenantId/invitations' },
            { key: 'agence-settings', label: t("Paramètres de l'agence"), href: '/tenant/:tenantId/settings' },
            {
              key: 'agence-finance-settings',
              label: t('Paramètres financiers'),
              href: '/tenant/:tenantId/settings/finance'
            }
          ]
        }
      ]
    },

    proprietaire: {
      id: 'proprietaire',
      label: t('Propriétaire'),
      tabs: [
        { key: 'tab-accueil', label: t('Accueil'), href: '/owner', icon: <DashboardOutlined /> },
        { key: 'tab-biens', label: t('Biens'), href: '/owner/properties', icon: <ApartmentOutlined /> },
        { key: 'tab-revenus', label: t('Revenus'), href: '/owner/revenues', icon: <DollarOutlined /> },
        { key: 'tab-incidents', label: t('Incidents'), href: '/owner/maintenance', icon: <ToolOutlined /> },
        { key: 'tab-plus', label: t('Plus'), href: MORE_TAB_HREF, icon: <EllipsisOutlined /> }
      ],
      tree: [
        { key: 'accueil', label: t('Tableau de bord'), icon: <DashboardOutlined />, zone: 'primary', href: '/owner' },
        {
          key: 'biens',
          label: t('Mes biens'),
          icon: <ApartmentOutlined />,
          zone: 'primary',
          section: 'portefeuille',
          href: '/owner/properties'
        },
        {
          key: 'revenus',
          label: t('Revenus'),
          icon: <DollarOutlined />,
          zone: 'primary',
          section: 'portefeuille',
          href: '/owner/revenues'
        },
        {
          // Le compte courant tenu par l'agence : ce qu'elle doit au
          // propriétaire, et ce qu'elle lui a déjà reversé.
          key: 'compte',
          label: t('Mon compte'),
          icon: <WalletOutlined />,
          zone: 'primary',
          section: 'portefeuille',
          href: '/owner/account'
        },
        {
          // Lot P5 : valorisation, rendements, emprunts, travaux — masquable
          // par l'agence (`OwnerPortalSettings.patrimonyEnabled`), voir
          // `navigation/owner-patrimoine-menu.ts` fusionné dans la coquille.
          key: 'mon-patrimoine',
          label: t('Mon patrimoine'),
          icon: <GoldOutlined />,
          zone: 'primary',
          section: 'portefeuille',
          href: '/owner/patrimoine'
        },
        {
          key: 'incidents',
          label: t('Incidents'),
          icon: <ToolOutlined />,
          zone: 'primary',
          section: 'batiments',
          href: '/owner/maintenance'
        },
        {
          // Sans `section` : un intertitre au-dessus d'un groupe qui s'appelle
          // deja « Plus » nommerait deux fois la meme chose. C'est un contenant,
          // pas un domaine.
          key: 'plus',
          label: t('Plus'),
          icon: <EllipsisOutlined />,
          zone: 'more',
          children: [
            { key: 'owner-documents', label: t('Documents'), href: '/owner/documents' },
            { key: 'owner-reports', label: t('Rapports'), href: '/owner/reports' },
            // Un bailleur peut AUSSI etre coproprietaire d'un lot : l'espace
            // s'ouvre s'il a ete invite, sinon l'ecran le dit.
            { key: 'owner-copropriete', label: t('Ma copropriété'), href: '/copropriete' },
            { key: 'owner-preferences', label: t('Préférences'), href: '/owner/preferences' }
          ]
        }
      ]
    },

    locataire: {
      id: 'locataire',
      label: t('Locataire'),
      // Usage 100 % mobile : 4 onglets couvrent tout. Une sidebar de 256 px sur
      // ce persona est un contresens (§4.2) — elle est supprimée.
      tabs: [
        { key: 'tab-accueil', label: t('Accueil'), href: '/tenant', icon: <DashboardOutlined /> },
        { key: 'tab-payer', label: t('Payer'), href: '/tenant/payments', icon: <WalletOutlined /> },
        { key: 'tab-incidents', label: t('Incidents'), href: '/tenant/maintenance', icon: <ToolOutlined /> },
        { key: 'tab-bail', label: t('Mon bail'), href: '/tenant/lease', icon: <FileTextOutlined /> }
      ],
      tree: [
        { key: 'accueil', label: t('Accueil'), icon: <DashboardOutlined />, zone: 'primary', href: '/tenant' },
        { key: 'payer', label: t('Payer'), icon: <WalletOutlined />, zone: 'primary', href: '/tenant/payments' },
        {
          key: 'incidents',
          label: t('Incidents'),
          icon: <ToolOutlined />,
          zone: 'primary',
          href: '/tenant/maintenance'
        },
        { key: 'bail', label: t('Mon bail'), icon: <FileTextOutlined />, zone: 'primary', href: '/tenant/lease' }
      ]
    },

    coproprietaire: {
      id: 'coproprietaire',
      label: t('Copropriétaire'),
      // Portail en lecture seule, surtout consulté sur téléphone : quatre
      // onglets couvrent les destinations les plus fréquentes, la cinquième
      // (« Plus ») ouvre les quatre écrans ajoutés par le lot S5.
      tabs: [
        { key: 'tab-lots', label: t('Mes lots'), href: '/copropriete', icon: <ApartmentOutlined /> },
        { key: 'tab-appels', label: t('Appels'), href: '/copropriete/appels', icon: <WalletOutlined /> },
        { key: 'tab-assemblees', label: t('Assemblées'), href: '/copropriete/assemblees', icon: <TeamOutlined /> },
        { key: 'tab-documents', label: t('Documents'), href: '/copropriete/documents', icon: <FolderOutlined /> },
        { key: 'tab-plus', label: t('Plus'), href: MORE_TAB_HREF, icon: <EllipsisOutlined /> }
      ],
      tree: [
        { key: 'lots', label: t('Mes lots'), icon: <ApartmentOutlined />, zone: 'primary', href: '/copropriete' },
        {
          key: 'appels',
          label: t('Appels de charges'),
          icon: <WalletOutlined />,
          zone: 'primary',
          href: '/copropriete/appels'
        },
        {
          key: 'assemblees',
          label: t('Assemblées générales'),
          icon: <TeamOutlined />,
          zone: 'primary',
          href: '/copropriete/assemblees'
        },
        {
          key: 'documents',
          label: t('Documents'),
          icon: <FolderOutlined />,
          zone: 'primary',
          href: '/copropriete/documents'
        },
        // Lot S5 (besoin 2) : paiements, quittances, suivi mensuel, fiche de la
        // copropriété. Derrière « Plus », comme le fait le portail propriétaire.
        {
          key: 'plus',
          label: t('Plus'),
          icon: <EllipsisOutlined />,
          zone: 'more',
          children: [
            { key: 'coprop-paiements', label: t('Mes paiements'), href: '/copropriete/paiements' },
            { key: 'coprop-quittances', label: t('Mes quittances'), href: '/copropriete/quittances' },
            { key: 'coprop-suivi-mensuel', label: t('Suivi mensuel'), href: '/copropriete/suivi-mensuel' },
            { key: 'coprop-ma-copropriete', label: t('Ma copropriété'), href: '/copropriete/ma-copropriete' }
          ]
        }
      ]
    }
  };
}

let cachedNavigation: {
  language: string;
  resourcesReady: boolean;
  navigation: Record<PersonaId, PersonaNav>;
} | null = null;

/** Modèle de navigation dans la langue active ; voir `buildNavigation`. */
export function getNavigation(): Record<PersonaId, PersonaNav> {
  const language = i18next.language ?? '';
  const resourcesReady = i18next.hasResourceBundle?.(language, 'app') ?? false;
  if (
    !cachedNavigation ||
    cachedNavigation.language !== language ||
    cachedNavigation.resourcesReady !== resourcesReady
  ) {
    cachedNavigation = { language, resourcesReady, navigation: buildNavigation() };
  }
  return cachedNavigation.navigation;
}
