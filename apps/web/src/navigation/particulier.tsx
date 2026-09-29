import React from 'react';
import {
  ApartmentOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  FileTextOutlined,
  MenuOutlined
} from '@ant-design/icons';
import { MORE_TAB_HREF } from './model';
import type { NavGroup, PersonaNav } from './model';
import { t } from '../i18n/t';

/**
 * Navigation d'un espace PARTICULIER (lot 4C, specs/026-particuliers-libre-service).
 *
 * Réduite à ce qu'un particulier utilise : patrimoine (valeur nette, actifs,
 * projections), biens, baux, paramètres et abonnement. Ni copropriété, ni
 * chantiers, ni ventes, ni mandats.
 *
 * Elle est choisie par le TYPE de l'espace renvoyé par le serveur
 * (`useTenantType`), jamais par l'abonnement : en mode `warn`, l'API laisse
 * tout passer et le menu ne doit pas suivre. Elle dérive de l'arbre du
 * collaborateur (mêmes libellés, mêmes clés, donc mêmes menus coupables) au
 * lieu d'en recopier les hrefs.
 */

export const PARTICULIER_HOME_HREF = '/tenant/:tenantId/patrimoine/valeur-nette';

const NET_WORTH_LEAVES = ['patrimoine-net-worth', 'patrimoine-assets', 'patrimoine-projections'];

function pick(tree: NavGroup[], key: string): NavGroup | undefined {
  return tree.find(group => group.key === key);
}

export function particulierNavigation(base: PersonaNav): PersonaNav {
  const patrimoine = pick(base.tree, 'patrimoine');
  const biens = pick(base.tree, 'biens');
  const baux = pick(base.tree, 'baux');

  const tree: NavGroup[] = [
    {
      key: 'accueil',
      label: t('Valeur nette'),
      icon: <DashboardOutlined />,
      zone: 'primary',
      href: PARTICULIER_HOME_HREF
    }
  ];

  if (patrimoine) {
    const children = (patrimoine.children ?? []).filter(leaf => NET_WORTH_LEAVES.includes(leaf.key));
    tree.push({ ...patrimoine, zone: 'primary', href: PARTICULIER_HOME_HREF, children });
  }
  if (biens) {
    tree.push({
      ...biens,
      children: (biens.children ?? []).filter(leaf => leaf.key === 'properties-list')
    });
  }
  if (baux) tree.push(baux);

  tree.push({
    key: 'particulier-parametres',
    label: t('Paramètres'),
    icon: <CreditCardOutlined />,
    zone: 'more',
    section: 'parametrage',
    href: '/tenant/:tenantId/settings/abonnement',
    children: [
      { key: 'particulier-abonnement', label: t('Abonnement'), href: '/tenant/:tenantId/settings/abonnement' },
      { key: 'particulier-settings', label: t("Paramètres de l'espace"), href: '/tenant/:tenantId/settings' }
    ]
  });

  return {
    ...base,
    tabs: [
      { key: 'tab-accueil', label: t('Accueil'), href: PARTICULIER_HOME_HREF, icon: <DashboardOutlined /> },
      { key: 'tab-biens', label: t('Biens'), href: '/tenant/:tenantId/properties', icon: <ApartmentOutlined /> },
      { key: 'tab-baux', label: t('Baux'), href: '/tenant/:tenantId/rental/leases', icon: <FileTextOutlined /> },
      { key: 'tab-plus', label: t('Plus'), href: MORE_TAB_HREF, icon: <MenuOutlined /> }
    ],
    tree
  };
}
