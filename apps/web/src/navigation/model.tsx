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
  parc: 'Parc immobilier',
  locatif: 'Gestion locative',
  finance: 'Finance',
  patrimoine: 'Patrimoine et entretien',
  commercial: 'Commercial et communication',
  copropriete: 'Copropriété',
  parametrage: 'Paramétrage',
  portefeuille: 'Mon portefeuille',
  batiments: 'Suivi des bâtiments'
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
    label: 'Super-administrateur de la plateforme',
    // Aucune barre d'onglets : 5 destinations au total, usage desktop exclusif.
    // Investir dans le mobile ici n'a aucun retour (§4.2).
    tabs: [],
    tree: [
      {
        key: 'accueil',
        label: 'Tableau de bord',
        icon: <DashboardOutlined />,
        zone: 'primary',
        href: '/dashboard'
      },
      {
        key: 'administration',
        label: 'Administration',
        icon: <SafetyOutlined />,
        zone: 'primary',
        children: [
          { key: 'admin-tenants', label: 'Agences', href: '/admin/tenants' },
          { key: 'admin-roles', label: 'Rôles et permissions', href: '/admin/roles-permissions' },
          { key: 'admin-statistics', label: 'Statistiques', href: '/admin/statistics' },
          { key: 'admin-audit', label: "Journaux d'audit", href: '/admin/audit' }
        ]
      }
    ]
  },

  collaborateur: {
    id: 'collaborateur',
    label: "Collaborateur d'agence",
    tabs: [
      { key: 'tab-accueil', label: 'Accueil', href: '/dashboard', icon: <DashboardOutlined /> },
      { key: 'tab-biens', label: 'Biens', href: '/tenant/:tenantId/properties', icon: <ApartmentOutlined /> },
      { key: 'tab-baux', label: 'Baux', href: '/tenant/:tenantId/rental/leases', icon: <FileTextOutlined /> },
      {
        key: 'tab-encaisser',
        label: 'Encaisser',
        href: '/tenant/:tenantId/rental/installments',
        icon: <WalletOutlined />
      },
      { key: 'tab-plus', label: 'Plus', href: MORE_TAB_HREF, icon: <MenuOutlined /> }
    ],
    tree: [
      // --- zone primaire : les quatre tâches terrain, 1 tap en mobile -------
      {
        key: 'accueil',
        label: 'Tableau de bord',
        icon: <DashboardOutlined />,
        zone: 'primary',
        href: '/dashboard'
      },
      {
        key: 'biens',
        label: 'Biens',
        icon: <ApartmentOutlined />,
        zone: 'primary',
        section: 'parc',
        href: '/tenant/:tenantId/properties',
        children: [
          { key: 'properties-list', label: 'Toutes les propriétés', href: '/tenant/:tenantId/properties' },
          {
            key: 'properties-visits-calendar',
            label: 'Calendrier des visites',
            href: '/tenant/:tenantId/properties/visits/calendar'
          }
        ]
      },
      {
        key: 'baux',
        label: 'Baux',
        icon: <FileTextOutlined />,
        zone: 'primary',
        section: 'locatif',
        href: '/tenant/:tenantId/rental/leases'
      },
      {
        key: 'encaisser',
        label: 'Encaisser',
        icon: <WalletOutlined />,
        zone: 'primary',
        section: 'locatif',
        href: '/tenant/:tenantId/rental/installments',
        children: [
          { key: 'rental-installments', label: 'Échéances', href: '/tenant/:tenantId/rental/installments' },
          { key: 'rental-payments', label: 'Paiements', href: '/tenant/:tenantId/rental/payments' }
        ]
      },

      // --- zone « Plus » : ce qui est rare ---------------------------------
      {
        key: 'finance',
        label: 'Finance',
        icon: <BankOutlined />,
        zone: 'more',
        section: 'finance',
        href: '/tenant/:tenantId/finance/balance-clients',
        children: [
          { key: 'finance-clients', label: 'Balance clients', href: '/tenant/:tenantId/finance/balance-clients' },
          { key: 'finance-clients-agee', label: 'Balance âgée', href: '/tenant/:tenantId/finance/balance-agee' },
          { key: 'finance-facturation', label: 'Facturation du mois', href: '/tenant/:tenantId/finance/facturation' }
        ]
      },
      {
        key: 'patrimoine',
        label: 'Patrimoine',
        icon: <GoldOutlined />,
        zone: 'more',
        section: 'patrimoine',
        href: '/tenant/:tenantId/patrimoine',
        children: [
          { key: 'patrimoine-overview', label: 'Vue consolidée', href: '/tenant/:tenantId/patrimoine' },
          {
            key: 'patrimoine-performance',
            label: 'Performance',
            href: '/tenant/:tenantId/patrimoine/performance'
          },
          {
            key: 'patrimoine-work-programs',
            label: 'Travaux',
            href: '/tenant/:tenantId/patrimoine/work-programs'
          },
          {
            key: 'patrimoine-statements',
            label: 'Relevés',
            href: '/tenant/:tenantId/patrimoine/statements'
          }
        ]
      },
      {
        key: 'maintenance',
        label: 'Maintenance',
        icon: <ToolOutlined />,
        zone: 'more',
        section: 'patrimoine',
        href: '/tenant/:tenantId/admin/maintenance/tickets',
        children: [
          {
            key: 'maintenance-agence-tickets',
            label: "Tickets de l'agence",
            href: '/tenant/:tenantId/admin/maintenance/tickets'
          },
          { key: 'maintenance-mes-demandes', label: 'Mes demandes', href: '/tenant/:tenantId/maintenance' },
          {
            key: 'maintenance-agence-vendors',
            label: 'Prestataires',
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
          { key: 'crm-dashboard', label: 'Tableau de bord CRM', href: '/tenant/:tenantId/crm/dashboard' },
          { key: 'crm-calendar', label: 'Calendrier', href: '/tenant/:tenantId/crm/calendar' },
          { key: 'crm-contacts', label: 'Contacts', href: '/tenant/:tenantId/crm/contacts' },
          { key: 'crm-deals', label: 'Affaires', href: '/tenant/:tenantId/crm/deals' },
          { key: 'crm-activities', label: 'Activités', href: '/tenant/:tenantId/crm/activities' }
        ]
      },
      {
        key: 'communication',
        label: 'Communication',
        icon: <MailOutlined />,
        zone: 'more',
        section: 'commercial',
        href: '/tenant/:tenantId/communication/email-notifications',
        children: [
          {
            key: 'communication-email',
            label: 'Notifications e-mail',
            href: '/tenant/:tenantId/communication/email-notifications'
          },
          {
            key: 'communication-whatsapp',
            label: 'Notifications WhatsApp',
            href: '/tenant/:tenantId/communication/whatsapp-notifications'
          },
          {
            key: 'communication-whatsapp-groupe',
            label: 'Message groupé WhatsApp',
            href: '/tenant/:tenantId/communication/whatsapp-group-message'
          },
          { key: 'newsletter-lists', label: 'Newsletter — Listes', href: '/tenant/:tenantId/newsletter/lists' },
          {
            key: 'newsletter-campaigns',
            label: 'Newsletter — Campagnes',
            href: '/tenant/:tenantId/newsletter/campaigns'
          },
          {
            key: 'newsletter-templates',
            label: 'Newsletter — Modèles',
            href: '/tenant/:tenantId/newsletter/templates'
          }
        ]
      },
      {
        key: 'syndic',
        label: 'Syndic',
        icon: <BankOutlined />,
        zone: 'more',
        section: 'copropriete',
        href: '/tenant/:tenantId/syndics',
        children: [
          { key: 'syndics-list', label: 'Copropriétés', href: '/tenant/:tenantId/syndics' },
          {
            key: 'syndics-detail',
            label: 'Fiche de la copropriété',
            href: '/tenant/:tenantId/syndics/:syndicId'
          },
          { key: 'syndics-lots', label: 'Lots', href: '/tenant/:tenantId/syndics/:syndicId/lots' },
          { key: 'syndics-charges', label: 'Charges', href: '/tenant/:tenantId/syndics/:syndicId/charges' },
          {
            key: 'syndics-assemblees',
            label: 'Assemblées générales',
            href: '/tenant/:tenantId/syndics/:syndicId/assemblees'
          },
          {
            key: 'syndics-prestataires',
            label: 'Prestataires',
            href: '/tenant/:tenantId/syndics/:syndicId/prestataires'
          },
          {
            key: 'syndics-documents',
            label: 'Documents',
            href: '/tenant/:tenantId/syndics/:syndicId/documents'
          },
          { key: 'syndics-finances', label: 'Finances', href: '/tenant/:tenantId/syndics/:syndicId/finances' },
          {
            key: 'syndics-recouvrement',
            label: 'Recouvrement',
            href: '/tenant/:tenantId/syndics/:syndicId/recouvrement'
          },
          {
            key: 'syndics-comptabilite',
            label: 'Comptabilité',
            href: '/tenant/:tenantId/syndics/:syndicId/comptabilite'
          },
          { key: 'syndics-budgets', label: 'Budgets', href: '/tenant/:tenantId/syndics/:syndicId/budgets' },
          {
            key: 'syndics-profils-incidents',
            label: 'Profils et incidents',
            href: '/tenant/:tenantId/syndics/:syndicId/profils-incidents'
          }
        ]
      },
      {
        key: 'documents',
        label: 'Documents',
        icon: <FolderOutlined />,
        zone: 'more',
        section: 'parametrage',
        href: '/tenant/:tenantId/documents/templates',
        children: [
          {
            key: 'documents-templates',
            label: 'Modèles de documents',
            href: '/tenant/:tenantId/documents/templates'
          }
        ]
      },
      {
        key: 'agence',
        label: 'Agence',
        icon: <TeamOutlined />,
        zone: 'more',
        section: 'parametrage',
        href: '/tenant/:tenantId/collaborators',
        children: [
          { key: 'agence-collaborators', label: 'Collaborateurs', href: '/tenant/:tenantId/collaborators' },
          { key: 'agence-invitations', label: 'Invitations', href: '/tenant/:tenantId/invitations' },
          { key: 'agence-settings', label: "Paramètres de l'agence", href: '/tenant/:tenantId/settings' }
        ]
      }
    ]
  },

  proprietaire: {
    id: 'proprietaire',
    label: 'Propriétaire',
    tabs: [
      { key: 'tab-accueil', label: 'Accueil', href: '/owner', icon: <DashboardOutlined /> },
      { key: 'tab-biens', label: 'Biens', href: '/owner/properties', icon: <ApartmentOutlined /> },
      { key: 'tab-revenus', label: 'Revenus', href: '/owner/revenues', icon: <DollarOutlined /> },
      { key: 'tab-incidents', label: 'Incidents', href: '/owner/maintenance', icon: <ToolOutlined /> },
      { key: 'tab-plus', label: 'Plus', href: MORE_TAB_HREF, icon: <EllipsisOutlined /> }
    ],
    tree: [
      { key: 'accueil', label: 'Tableau de bord', icon: <DashboardOutlined />, zone: 'primary', href: '/owner' },
      {
        key: 'biens',
        label: 'Mes biens',
        icon: <ApartmentOutlined />,
        zone: 'primary',
        section: 'portefeuille',
        href: '/owner/properties'
      },
      {
        key: 'revenus',
        label: 'Revenus',
        icon: <DollarOutlined />,
        zone: 'primary',
        section: 'portefeuille',
        href: '/owner/revenues'
      },
      {
        key: 'incidents',
        label: 'Incidents',
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
        label: 'Plus',
        icon: <EllipsisOutlined />,
        zone: 'more',
        children: [
          { key: 'owner-documents', label: 'Documents', href: '/owner/documents' },
          { key: 'owner-reports', label: 'Rapports', href: '/owner/reports' },
          { key: 'owner-preferences', label: 'Préférences', href: '/owner/preferences' }
        ]
      }
    ]
  },

  locataire: {
    id: 'locataire',
    label: 'Locataire',
    // Usage 100 % mobile : 4 onglets couvrent tout. Une sidebar de 256 px sur
    // ce persona est un contresens (§4.2) — elle est supprimée.
    tabs: [
      { key: 'tab-accueil', label: 'Accueil', href: '/tenant', icon: <DashboardOutlined /> },
      { key: 'tab-payer', label: 'Payer', href: '/tenant/payments', icon: <WalletOutlined /> },
      { key: 'tab-incidents', label: 'Incidents', href: '/tenant/maintenance', icon: <ToolOutlined /> },
      { key: 'tab-bail', label: 'Mon bail', href: '/tenant/lease', icon: <FileTextOutlined /> }
    ],
    tree: [
      { key: 'accueil', label: 'Accueil', icon: <DashboardOutlined />, zone: 'primary', href: '/tenant' },
      { key: 'payer', label: 'Payer', icon: <WalletOutlined />, zone: 'primary', href: '/tenant/payments' },
      { key: 'incidents', label: 'Incidents', icon: <ToolOutlined />, zone: 'primary', href: '/tenant/maintenance' },
      { key: 'bail', label: 'Mon bail', icon: <FileTextOutlined />, zone: 'primary', href: '/tenant/lease' }
    ]
  }
};
