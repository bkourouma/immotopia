import React from 'react';
import {
  ApartmentOutlined,
  BankOutlined,
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
  TeamOutlined,
  ToolOutlined,
  WalletOutlined
} from '@ant-design/icons';
import { t } from '../i18n/t';

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
 * Les quatre personas qui ont une navigation.
 *
 * Un cinquieme etat existe — le compte authentifie rattache a rien — mais ce
 * n'est pas un persona : il n'a aucune destination, donc aucun menu. Il est
 * traite par `<AccountNotLinked>`, hors coquille.
 */
export type PersonaId = 'super-admin' | 'collaborateur' | 'proprietaire' | 'locataire';

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
  | 'patrimoine'
  | 'commercial'
  | 'copropriete'
  | 'parametrage'
  // Propriétaire : deux questions, pas six métiers.
  | 'portefeuille'
  | 'batiments';

export const SECTION_LABELS: Record<SectionId, string> = {
  parc: t('Parc immobilier'),
  locatif: t('Gestion locative'),
  finance: 'Finance',
  patrimoine: t('Patrimoine et entretien'),
  commercial: t('Commercial et communication'),
  copropriete: t('Copropriété'),
  parametrage: t('Paramétrage'),
  portefeuille: t('Mon portefeuille'),
  batiments: t('Suivi des bâtiments')
};

export interface NavLeaf {
  key: string;
  label: string;
  href: string;
}

export interface NavGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  zone: NavZone;
  /** Domaine métier coiffant l'entrée. Absent = pas d'intertitre (l'accueil). */
  section?: SectionId;
  href?: string;
  children?: NavLeaf[];
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

export const NAVIGATION: Record<PersonaId, PersonaNav> = {
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
          { key: 'admin-audit', label: t("Journaux d'audit"), href: '/admin/audit' }
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
        href: '/tenant/:tenantId/rental/leases'
      },
      {
        key: 'encaisser',
        label: t('Encaisser'),
        icon: <WalletOutlined />,
        zone: 'primary',
        section: 'locatif',
        href: '/tenant/:tenantId/rental/installments',
        children: [
          { key: 'rental-installments', label: t('Échéances'), href: '/tenant/:tenantId/rental/installments' },
          { key: 'rental-payments', label: t('Paiements'), href: '/tenant/:tenantId/rental/payments' }
        ]
      },

      // --- zone « Plus » : ce qui est rare ---------------------------------
      {
        key: 'finance',
        label: t('Finance'),
        icon: <BankOutlined />,
        zone: 'more',
        section: 'finance',
        href: '/tenant/:tenantId/finance/balance-clients',
        children: [
          {
            key: 'finance-comptabilite',
            label: t('Comptabilité'),
            href: '/tenant/:tenantId/finance/comptabilite'
          },
          { key: 'finance-clients', label: t('Balance clients'), href: '/tenant/:tenantId/finance/balance-clients' },
          { key: 'finance-clients-agee', label: t('Balance âgée'), href: '/tenant/:tenantId/finance/balance-agee' },
          {
            key: 'finance-agent-commissions',
            label: t('Commissions des agents'),
            href: '/tenant/:tenantId/finance/commissions'
          },
          {
            key: 'finance-owner-accounts',
            label: t('Comptes propriétaires'),
            href: '/tenant/:tenantId/finance/owner-accounts'
          },
          {
            key: 'finance-facturation',
            label: t('Facturation du mois'),
            href: '/tenant/:tenantId/finance/facturation'
          },
          {
            key: 'finance-tableau-de-bord-chantiers',
            label: t('Tableau de bord chantiers'),
            href: '/tenant/:tenantId/finance/tableau-de-bord-chantiers'
          },
          {
            key: 'finance-bons-de-commande',
            label: t('Bons de commande'),
            href: '/tenant/:tenantId/finance/bons-de-commande'
          },
          {
            key: 'finance-baux-terrain',
            label: t('Baux de terrain'),
            href: '/tenant/:tenantId/finance/baux-terrain'
          },
          {
            key: 'finance-associations',
            label: t('Associations'),
            href: '/tenant/:tenantId/finance/associations'
          },
          {
            key: 'finance-salaires',
            label: t('Salaires'),
            href: '/tenant/:tenantId/finance/salaires'
          },
          {
            key: 'finance-tacherons',
            label: t('Tâcherons'),
            href: '/tenant/:tenantId/finance/tacherons'
          },
          {
            key: 'finance-retenues',
            label: t('Retenues de garantie'),
            href: '/tenant/:tenantId/finance/retenues'
          },
          { key: 'finance-stock', label: t('Stock'), href: '/tenant/:tenantId/finance/stock' },
          {
            key: 'finance-stock-inventaire',
            label: t('Inventaire'),
            href: '/tenant/:tenantId/finance/stock/inventaire'
          },
          {
            key: 'finance-stock-parametrage',
            label: t('Articles et lieux'),
            href: '/tenant/:tenantId/finance/stock/parametrage'
          },
          { key: 'finance-fournisseurs', label: t('Fournisseurs'), href: '/tenant/:tenantId/finance/fournisseurs' },
          {
            key: 'finance-fournisseurs-balance',
            label: t('Balance fournisseurs'),
            href: '/tenant/:tenantId/finance/fournisseurs/balance'
          },
          { key: 'finance-chantiers', label: t('Chantiers'), href: '/tenant/:tenantId/finance/chantiers' },
          { key: 'finance-validation', label: t('Pièces à valider'), href: '/tenant/:tenantId/finance/validation' },
          { key: 'finance-importation', label: t('Importation'), href: '/tenant/:tenantId/finance/importation' }
        ]
      },
      {
        key: 'patrimoine',
        label: t('Patrimoine'),
        icon: <GoldOutlined />,
        zone: 'more',
        section: 'patrimoine',
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
            key: 'patrimoine-statements',
            label: t('Relevés'),
            href: '/tenant/:tenantId/patrimoine/statements'
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
        key: 'crm',
        label: 'CRM',
        icon: <RiseOutlined />,
        zone: 'more',
        section: 'commercial',
        href: '/tenant/:tenantId/crm/dashboard',
        children: [
          { key: 'crm-dashboard', label: t('Tableau de bord CRM'), href: '/tenant/:tenantId/crm/dashboard' },
          { key: 'crm-calendar', label: t('Calendrier'), href: '/tenant/:tenantId/crm/calendar' },
          { key: 'crm-contacts', label: t('Contacts'), href: '/tenant/:tenantId/crm/contacts' },
          { key: 'crm-deals', label: t('Affaires'), href: '/tenant/:tenantId/crm/deals' },
          { key: 'crm-activities', label: t('Activités'), href: '/tenant/:tenantId/crm/activities' }
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
        href: '/tenant/:tenantId/syndics',
        children: [
          { key: 'syndics-list', label: t('Copropriétés'), href: '/tenant/:tenantId/syndics' },
          {
            key: 'syndics-detail',
            label: t('Fiche de la copropriété'),
            href: '/tenant/:tenantId/syndics/:syndicId'
          },
          { key: 'syndics-lots', label: t('Lots'), href: '/tenant/:tenantId/syndics/:syndicId/lots' },
          { key: 'syndics-charges', label: t('Charges'), href: '/tenant/:tenantId/syndics/:syndicId/charges' },
          {
            key: 'syndics-assemblees',
            label: t('Assemblées générales'),
            href: '/tenant/:tenantId/syndics/:syndicId/assemblees'
          },
          {
            key: 'syndics-prestataires',
            label: t('Prestataires'),
            href: '/tenant/:tenantId/syndics/:syndicId/prestataires'
          },
          {
            key: 'syndics-documents',
            label: t('Documents'),
            href: '/tenant/:tenantId/syndics/:syndicId/documents'
          },
          { key: 'syndics-finances', label: t('Finances'), href: '/tenant/:tenantId/syndics/:syndicId/finances' },
          {
            key: 'syndics-recouvrement',
            label: t('Recouvrement'),
            href: '/tenant/:tenantId/syndics/:syndicId/recouvrement'
          },
          {
            key: 'syndics-comptabilite',
            label: t('Comptabilité'),
            href: '/tenant/:tenantId/syndics/:syndicId/comptabilite'
          },
          { key: 'syndics-budgets', label: t('Budgets'), href: '/tenant/:tenantId/syndics/:syndicId/budgets' },
          {
            key: 'syndics-profils-incidents',
            label: t('Profils et incidents'),
            href: '/tenant/:tenantId/syndics/:syndicId/profils-incidents'
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
      { key: 'incidents', label: t('Incidents'), icon: <ToolOutlined />, zone: 'primary', href: '/tenant/maintenance' },
      { key: 'bail', label: t('Mon bail'), icon: <FileTextOutlined />, zone: 'primary', href: '/tenant/lease' }
    ]
  }
};
