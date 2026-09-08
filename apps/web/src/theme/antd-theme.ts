/**
 * Thème Ant Design câblé sur les design tokens (REFONTE_UI_UX.md §3.2).
 *
 * Aucune valeur n'est écrite ici : tout est lu dans `src/styles/tokens.css`,
 * qui reste la source unique. Le `ConfigProvider` et `tailwind.config.js`
 * consomment donc littéralement les mêmes variables — c'est le garde-fou n°1
 * du §9.7 (les deux design systems rendent les mêmes couleurs, rayons et
 * hauteurs).
 *
 * Hors navigateur (tests jsdom sans CSS, rendu serveur), `getComputedStyle`
 * ne renvoie rien : la clé concernée est alors omise et Ant Design retombe sur
 * sa propre valeur par défaut. On préfère cela à une duplication des valeurs,
 * qui recréerait la seconde source de vérité que le §3.2 supprime.
 */
import type { ThemeConfig } from 'antd';

/** Lit une variable CSS ; `undefined` si elle est absente ou vide. */
function token(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === '' ? undefined : value;
}

/** Lit une variable CSS exprimée en px et la renvoie en nombre. */
function pxToken(name: string): number | undefined {
  const raw = token(name);
  if (raw === undefined) return undefined;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** Retire les clés non résolues, pour laisser Ant Design appliquer ses défauts. */
function defined<T extends object>(source: T): Partial<T> {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined)) as Partial<T>;
}

/**
 * Construit le thème. Appelé au premier rendu, donc après l'import des
 * feuilles de style par `index.tsx` : les variables sont résolues.
 */
export function buildAntdTheme(): ThemeConfig {
  return {
    token: defined({
      // Marque et sémantique — remplace #1677ff (seed AntD) et #1890ff (en dur)
      colorPrimary: token('--color-primary'),
      colorSuccess: token('--color-success'),
      colorWarning: token('--color-warning'),
      colorError: token('--color-error'),
      colorInfo: token('--color-info'),
      colorLink: token('--color-primary'),
      colorLinkHover: token('--color-primary-hover'),
      colorLinkActive: token('--color-primary-active'),

      // Texte — colorTextSecondary passe de rgba(0,0,0,.45) (3,0:1) à 7,24:1
      colorText: token('--text-primary'),
      colorTextSecondary: token('--text-secondary'),
      colorTextTertiary: token('--text-tertiary'),
      colorTextQuaternary: token('--text-disabled'),
      colorTextDescription: token('--text-secondary'),
      colorTextPlaceholder: token('--text-tertiary'),
      colorTextDisabled: token('--text-disabled'),

      // Surfaces et bordures
      colorBgLayout: token('--surface-page'),
      colorBgContainer: token('--surface-card'),
      colorBgElevated: token('--surface-raised'),
      colorFillAlter: token('--surface-sunken'),
      colorBorder: token('--border-default'),
      colorBorderSecondary: token('--border-subtle'),

      // Typographie
      fontFamily: token('--font-sans'),
      fontSize: 14,

      // Formes et densité
      borderRadius: pxToken('--radius-md'),
      borderRadiusLG: pxToken('--radius-lg'),
      borderRadiusSM: pxToken('--radius-sm'),
      controlHeightSM: pxToken('--control-h-sm'),
      controlHeight: pxToken('--control-h-md'),
      controlHeightLG: pxToken('--control-h-lg'),

      // Ombres
      boxShadow: token('--shadow-sm'),
      boxShadowSecondary: token('--shadow-md'),
      boxShadowTertiary: token('--shadow-xs'),

      // Empilement — aligne les popups AntD sur l'échelle unique du §3.2
      zIndexPopupBase: pxToken('--z-drawer'),

      // Mouvement
      motionDurationFast: token('--duration-fast'),
      motionDurationMid: token('--duration-base'),
      motionDurationSlow: token('--duration-slow'),
      motionEaseInOut: token('--ease-standard'),
      motionEaseOut: token('--ease-enter'),
      motionEaseIn: token('--ease-exit')
    }),
    components: {
      Table: defined({
        cellPaddingBlockSM: 8,
        headerBg: token('--surface-sunken')
      }),
      Menu: { darkItemBg: 'transparent' },
      Layout: defined({
        bodyBg: token('--surface-page'),
        siderBg: token('--surface-inverse'),
        headerBg: token('--surface-card')
      })
    }
  };
}
