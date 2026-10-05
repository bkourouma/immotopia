import React from 'react';
import {
  AlertOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  BuildOutlined,
  CameraOutlined,
  CarryOutOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  HistoryOutlined,
  IdcardOutlined,
  ImportOutlined,
  InboxOutlined,
  MobileOutlined,
  PercentageOutlined,
  ProfileOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  WalletOutlined,
  WhatsAppOutlined
} from '@ant-design/icons';
import type { WorkspaceTabItem } from '../components/navigation/WorkspaceTabs';
import { t } from '../i18n/t';
import type { FeatureAccessMap } from './feature-access';
import { featureForAgencyPath } from './route-features';

/**
 * Espaces à onglets du module Finance — source unique des onglets de
 * `<FinanceWorkspaceLayout>` ET des `activeFor` des entrées de la sidebar
 * (`navigation/model.tsx`). Un onglet ajouté ici allume donc aussitôt la bonne
 * entrée du menu : les deux ne peuvent pas diverger.
 *
 * Chaque espace regroupe les écrans d'un même flux de travail, dans l'ordre où
 * on les parcourt. Les URL sont celles qui existaient déjà : un onglet est un
 * lien vers une route existante, jamais un panneau local. Les sous-routes de
 * détail (`/chantiers/:siteId/budget`, `/bons-de-commande/:orderId`…)
 * prolongent le chemin de leur onglet et s'y rattachent d'elles-mêmes ; seul
 * ce qui vit ailleurs est déclaré dans `activeFor`.
 *
 * Les `href` portent le segment littéral `:tenantId`, comme `model.tsx` :
 * `financeWorkspaceTabs()` l'interpole au rendu.
 *
 * Les libellés sont des fonctions : `<FinanceWorkspaceLayout>` les traduit au
 * rendu, dans la langue affichée, et non une fois pour toutes au chargement du
 * module.
 */

export type FinanceWorkspaceFamily =
  | 'caisse-tresorerie'
  | 'saisie-validation'
  | 'facturation-balances'
  | 'reversements-commissions'
  | 'fournisseurs-commandes'
  | 'suivi-chantiers'
  | 'gestion-stock';

export interface FinanceWorkspaceTab {
  key: string;
  label: () => string;
  href: string;
  icon: React.ReactNode;
  /** Chemins hors du préfixe de l'onglet qui l'allument quand même. */
  activeFor?: string[];
}

export interface FinanceWorkspace {
  label: () => string;
  tabs: FinanceWorkspaceTab[];
}

const FINANCE = '/tenant/:tenantId/finance';

export const FINANCE_WORKSPACES: Record<FinanceWorkspaceFamily, FinanceWorkspace> = {
  // L'argent tel qu'il est : la caisse du jour, puis les comptes où il dort.
  'caisse-tresorerie': {
    label: () => t('Caisse et trésorerie'),
    tabs: [
      {
        key: 'caisse',
        label: () => t('Caisse'),
        href: `${FINANCE}/caisse`,
        icon: <WalletOutlined />,
        // La pièce de caisse s'ouvre depuis cette adresse ou depuis un
        // chantier, mais sous une autre adresse (`?chantierId=` en paramètre
        // de requête, comme les factures fournisseurs) : c'est un document
        // de la caisse, pas une fiche de chantier.
        activeFor: [`${FINANCE}/pieces-de-caisse`]
      },
      { key: 'tresorerie', label: () => t('Trésorerie'), href: `${FINANCE}/tresorerie`, icon: <BankOutlined /> }
    ]
  },
  // La file reçoit les pièces de toutes les natures ; l'import n'est qu'une
  // de ses sources, d'où la file en premier.
  'saisie-validation': {
    label: () => t('Saisie et validation'),
    tabs: [
      { key: 'validation', label: () => t('Pièces à valider'), href: `${FINANCE}/validation`, icon: <AuditOutlined /> },
      { key: 'importation', label: () => t('Importation'), href: `${FINANCE}/importation`, icon: <ImportOutlined /> }
    ]
  },
  // Facturer, puis suivre ce qui reste dû, puis ce qui traîne.
  'facturation-balances': {
    label: () => t('Facturation et balances'),
    tabs: [
      {
        key: 'facturation',
        label: () => t('Facturation du mois'),
        href: `${FINANCE}/facturation`,
        icon: <FileTextOutlined />
      },
      {
        key: 'balance-clients',
        label: () => t('Balance clients'),
        href: `${FINANCE}/balance-clients`,
        icon: <ProfileOutlined />
      },
      {
        key: 'balance-agee',
        label: () => t('Balance âgée'),
        href: `${FINANCE}/balance-agee`,
        icon: <HistoryOutlined />
      }
    ]
  },
  // Ce qui a été encaissé, et à qui il revient : propriétaires, associés,
  // puis agents.
  'reversements-commissions': {
    label: () => t('Reversements et commissions'),
    tabs: [
      {
        key: 'owner-accounts',
        label: () => t('Comptes propriétaires'),
        href: `${FINANCE}/owner-accounts`,
        icon: <IdcardOutlined />
      },
      { key: 'associations', label: () => t('Associations'), href: `${FINANCE}/associations`, icon: <TeamOutlined /> },
      {
        key: 'commissions',
        label: () => t('Commissions des agents'),
        href: `${FINANCE}/commissions`,
        icon: <PercentageOutlined />
      }
    ]
  },
  // Le registre des fournisseurs, les commandes qu'on leur passe, puis ce
  // qu'on leur doit.
  'fournisseurs-commandes': {
    label: () => t('Fournisseurs et commandes'),
    tabs: [
      {
        key: 'fournisseurs',
        label: () => t('Fournisseurs'),
        href: `${FINANCE}/fournisseurs`,
        icon: <ShopOutlined />,
        // Les factures d'un fournisseur s'ouvrent depuis sa ligne, mais sous
        // une autre adresse (`?fournisseur=` en paramètre de requête).
        activeFor: [`${FINANCE}/factures-fournisseurs`]
      },
      {
        key: 'bons-de-commande',
        label: () => t('Bons de commande'),
        href: `${FINANCE}/bons-de-commande`,
        icon: <ShoppingCartOutlined />
      },
      {
        key: 'balance-fournisseurs',
        label: () => t('Balance fournisseurs'),
        href: `${FINANCE}/fournisseurs/balance`,
        icon: <ProfileOutlined />
      }
    ]
  },
  // Le chantier (fiche, budget, stock, clôture sous `/chantiers/:siteId`),
  // son pilotage, puis le terrain loué qui l'accueille.
  'suivi-chantiers': {
    label: () => t('Suivi des chantiers'),
    tabs: [
      { key: 'chantiers', label: () => t('Chantiers'), href: `${FINANCE}/chantiers`, icon: <BuildOutlined /> },
      {
        key: 'tableau-de-bord-chantiers',
        label: () => t('Tableau de bord'),
        href: `${FINANCE}/tableau-de-bord-chantiers`,
        icon: <DashboardOutlined />
      },
      {
        key: 'baux-terrain',
        label: () => t('Baux de terrain'),
        href: `${FINANCE}/baux-terrain`,
        icon: <EnvironmentOutlined />
      }
    ]
  },
  // Le quotidien (réceptions, sorties), le terrain (le Magasin, au
  // téléphone), le comptage, le carnet des preneurs, le contrôle, puis le
  // référentiel qu'on ne touche qu'à l'installation (lot 040, ecrans §2.2).
  //
  // Liste DÉCLARATIVE : un onglet de plus (le lot 041 en ajoute deux,
  // « Comptages terrain » et « WhatsApp », après « Contrôle ») est une ligne
  // de plus ici, rien d'autre. L'entrée de menu « Gestion du stock » s'allume d'elle-même sur
  // chacun (`financeWorkspaceActiveFor`), et l'onglet actif reste le préfixe
  // le plus long : `/stock/magasin` allume « Magasin », pas « Stock ».
  'gestion-stock': {
    label: () => t('Gestion du stock'),
    tabs: [
      { key: 'stock', label: () => t('Stock'), href: `${FINANCE}/stock`, icon: <InboxOutlined /> },
      {
        key: 'stock-magasin',
        label: () => t('Magasin'),
        href: `${FINANCE}/stock/magasin`,
        icon: <MobileOutlined />
      },
      {
        key: 'stock-inventaire',
        label: () => t('Inventaire'),
        href: `${FINANCE}/stock/inventaire`,
        icon: <CarryOutOutlined />
      },
      {
        key: 'stock-preneurs',
        label: () => t('Preneurs'),
        href: `${FINANCE}/stock/preneurs`,
        icon: <TeamOutlined />
      },
      {
        key: 'stock-controle',
        label: () => t('Contrôle'),
        href: `${FINANCE}/stock/controle`,
        icon: <AlertOutlined />
      },
      // Lot 041 — après « Contrôle » du lot 040, avant « Articles et lieux ».
      {
        key: 'stock-comptages-terrain',
        label: () => t('Comptages terrain'),
        href: `${FINANCE}/stock/comptages-terrain`,
        icon: <CameraOutlined />
      },
      {
        key: 'stock-whatsapp',
        label: () => t('WhatsApp'),
        href: `${FINANCE}/stock/whatsapp`,
        icon: <WhatsAppOutlined />
      },
      {
        key: 'stock-parametrage',
        label: () => t('Articles et lieux'),
        href: `${FINANCE}/stock/parametrage`,
        icon: <AppstoreOutlined />
      }
    ]
  }
};

/** Première route de l'espace : celle où atterrit son entrée de menu. */
export function financeWorkspaceHref(family: FinanceWorkspaceFamily): string {
  return FINANCE_WORKSPACES[family].tabs[0].href;
}

/**
 * Toutes les autres routes de l'espace — onglets suivants et chemins
 * rattachés — pour `NavLeaf.activeFor` : l'entrée de menu reste allumée sur
 * chacun de ses onglets.
 */
export function financeWorkspaceActiveFor(family: FinanceWorkspaceFamily): string[] {
  const [first, ...rest] = FINANCE_WORKSPACES[family].tabs;
  return [...(first.activeFor ?? []), ...rest.flatMap(tab => [tab.href, ...(tab.activeFor ?? [])])];
}

/** Onglets d'un espace pour une agence donnée, libellés traduits maintenant. */
export function financeWorkspaceTabs(family: FinanceWorkspaceFamily, tenantId: string): WorkspaceTabItem[] {
  const withTenant = (href: string) => href.replace(':tenantId', tenantId);
  return FINANCE_WORKSPACES[family].tabs.map(tab => ({
    key: tab.key,
    label: tab.label(),
    href: withTenant(tab.href),
    icon: tab.icon,
    activeFor: tab.activeFor?.map(withTenant)
  }));
}

/**
 * Retire les onglets d'une fonctionnalité que l'abonnement ne comprend pas
 * (`NONE`), comme le menu. La fonctionnalité d'un onglet se déduit de son
 * adresse (`featureForAgencyPath`, la même table que la garde de route) : un
 * onglet ajouté ci-dessus est classé sans rien déclarer de plus. `access` nul
 * (droits en lecture, lecture échouée, contrôle non appliqué) : tout reste
 * visible ; la lecture seule aussi.
 */
export function filterWorkspaceTabsByAccess(
  tabs: WorkspaceTabItem[],
  access: FeatureAccessMap | null
): WorkspaceTabItem[] {
  if (!access) return tabs;
  return tabs.filter(tab => {
    const feature = featureForAgencyPath(tab.href);
    return feature === null || access[feature] !== 'NONE';
  });
}
