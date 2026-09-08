import { Grid } from 'antd';

/**
 * Paliers responsive de l'application (REFONTE_UI_UX.md §3.4).
 *
 * Une seule source de vérité : `Grid.useBreakpoint()` d'Ant Design, dont les
 * paliers font autorité et sur lesquels `tailwind.config.js` est réaligné.
 *
 * Remplace l'ancien hook de media query fixé à `min-width: 1024px`, qui créait
 * une zone morte : entre 992 et 1023 px, la grille AntD basculait en `lg`
 * (3 colonnes) alors que la coquille était encore en mode mobile avec un
 * drawer. La tablette en paysage tombait exactement là.
 *
 * | Palier | min-width | Terminal cible                  |
 * |--------|-----------|---------------------------------|
 * | xs     | 0         | téléphone portrait              |
 * | sm     | 576       | grand téléphone                 |
 * | md     | 768       | tablette portrait               |
 * | lg     | 992       | tablette paysage, petit portable|
 * | xl     | 1200      | desktop                         |
 * | xxl    | 1600      | grand écran                     |
 */
export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

const ORDER: Breakpoint[] = ['xxl', 'xl', 'lg', 'md', 'sm', 'xs'];

export interface BreakpointState {
  /** Paliers actifs, tels que rendus par Ant Design. */
  screens: Partial<Record<Breakpoint, boolean>>;
  /** Le plus grand palier actif. `xs` tant que rien n'est encore mesuré. */
  active: Breakpoint;
  /** < 768 px — téléphone. Cartes plutôt que tableaux, formulaire pleine page. */
  isMobile: boolean;
  /** 768–991 px — tablette. Rail de 72 px, grilles en 2 colonnes. */
  isTablet: boolean;
  /** ≥ 992 px — sidebar fixe, contrôles à 36 px, `Popconfirm` ancré. */
  isDesktop: boolean;
}

export function useBreakpoint(): BreakpointState {
  const screens = Grid.useBreakpoint();

  const active = ORDER.find(bp => screens[bp]) ?? 'xs';

  return {
    screens,
    active,
    isMobile: !screens.md,
    isTablet: Boolean(screens.md) && !screens.lg,
    isDesktop: Boolean(screens.lg)
  };
}
