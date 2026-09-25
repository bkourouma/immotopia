import React from 'react';
import { PlusOutlined } from '@ant-design/icons';
import { t } from '../i18n/t';

/**
 * Actions primaires par écran (REFONTE_UI_UX.md §4.3).
 *
 * « Ajouter une propriété », « Nouveau contact », « Nouveau bail » et
 * « Nouveau ticket » étaient des **entrées de menu**, rangées au même niveau
 * que des destinations. Le menu mélangeait donc navigation et création.
 *
 * Elles en sont sorties. Le §4.3 leur donne deux points de chute :
 *   - le bouton primaire du `<PageHeader>` de la liste, en desktop ;
 *   - un **FAB** ancré en bas à droite, au-dessus de la barre d'onglets, en
 *     mobile.
 *
 * Le FAB est rendu par la coquille et non par chaque écran : le Lot 1 ne
 * refond aucun écran, et une action déclarée ici est disponible sans qu'aucune
 * page ne change. Le passage au bouton primaire du `<PageHeader>` se fera
 * écran par écran, dans le lot qui refond l'écran concerné.
 */
export interface ScreenAction {
  /** Chemin de l'écran hôte, avec `:tenantId` littéral. */
  on: string;
  label: string;
  /** Destination de l'action, avec `:tenantId` littéral. */
  href: string;
  icon: React.ReactNode;
}

export function SCREEN_ACTIONS(): ScreenAction[] {
  return [
    {
      on: '/tenant/:tenantId/properties',
      label: t('Ajouter une propriété'),
      href: '/tenant/:tenantId/properties/new',
      icon: <PlusOutlined />
    },
    {
      on: '/tenant/:tenantId/crm/contacts',
      label: t('Nouveau contact'),
      href: '/tenant/:tenantId/crm/contacts/new',
      icon: <PlusOutlined />
    },
    {
      on: '/tenant/:tenantId/rental/leases',
      label: t('Nouveau bail'),
      href: '/tenant/:tenantId/rental/leases/new',
      icon: <PlusOutlined />
    },
    {
      on: '/tenant/:tenantId/maintenance',
      label: t('Signaler un problème'),
      href: '/tenant/:tenantId/maintenance/new',
      icon: <PlusOutlined />
    }
  ];
}

/**
 * Action de l'écran courant, ou `null`.
 *
 * La correspondance est **exacte** : on ne propose pas « Nouveau bail » depuis
 * la fiche d'un bail ou depuis son formulaire de création.
 */
export function actionForPath(pathname: string, tenantId?: string | null): ScreenAction | null {
  if (!tenantId) return null;
  const match = SCREEN_ACTIONS().find(a => a.on.replace(':tenantId', tenantId) === pathname);
  if (!match) return null;
  return { ...match, href: match.href.replace(':tenantId', tenantId) };
}
