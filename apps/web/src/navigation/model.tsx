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
  HomeOutlined,
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

export type PersonaId = 'super-admin' | 'collaborateur' | 'proprietaire' | 'locataire' | 'public';

/** Déclencheur d'interface, pas une destination : ouvre le drawer complet. */
export const MORE_TAB_HREF = '#plus';

/**
 * `primary` : destination directe, exposée par la barre d'onglets.
 * `more`    : rangée derrière « Plus ». Le §4.2 assume cette hiérarchie —
 *             ce qui est fréquent est en bas, ce qui est rare est derrière.
 */
export type NavZone = 'primary' | 'more';

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
        href: '/tenant/:tenantId/rental/leases'
      },
      {
        key: 'encaisser',
        label: 'Encaisser',
        icon: <WalletOutlined />,
        zone: 'primary',
        href: '/tenant/:tenantId/rental/installments',
        children: [
          { key: 'rental-installments', label: 'Échéances', href: '/tenant/:tenantId/rental/installments' },
          { key: 'rental-payments', label: 'Paiements', href: '/tenant/:tenantId/rental/payments' }
        ]
      },

      // --- zone « Plus » : ce qui est rare ---------------------------------
      {
        key: 'crm',
        label: 'CRM',
        icon: <RiseOutlined />,
        zone: 'more',
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
        key: 'syndic',
        label: 'Syndic',
        icon: <BankOutlined />,
        zone: 'more',
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
        key: 'patrimoine',
        label: 'Patrimoine',
        icon: <GoldOutlined />,
        zone: 'more',
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
        key: 'communication',
        label: 'Communication',
        icon: <MailOutlined />,
        zone: 'more',
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
        key: 'documents',
        label: 'Documents',
        icon: <FolderOutlined />,
        zone: 'more',
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
      { key: 'biens', label: 'Mes biens', icon: <ApartmentOutlined />, zone: 'primary', href: '/owner/properties' },
      { key: 'revenus', label: 'Revenus', icon: <DollarOutlined />, zone: 'primary', href: '/owner/revenues' },
      { key: 'incidents', label: 'Incidents', icon: <ToolOutlined />, zone: 'primary', href: '/owner/maintenance' },
      {
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
  },

  public: {
    id: 'public',
    label: 'Utilisateur sans agence',
    tabs: [],
    // Une seule destination, et c'est un constat, pas un oubli. L'ancien menu
    // public proposait « Propriétés » vers /properties — or cette route rend
    // `pages/properties/Properties.tsx`, qui exige un tenant : un utilisateur
    // public, défini justement par l'absence de tenant, y tombait TOUJOURS sur
    // l'écran « Aucune agence sélectionnée ». L'entrée est retirée plutôt que
    // de mener à un cul-de-sac. Ce persona n'a rien à consulter tant qu'il
    // n'est pas rattaché : à arbitrer côté produit (voir LOT-1-RAPPORT).
    tree: [
      {
        key: 'accueil',
        label: 'Tableau de bord',
        icon: <HomeOutlined />,
        zone: 'primary',
        href: '/dashboard'
      }
    ]
  }
};
