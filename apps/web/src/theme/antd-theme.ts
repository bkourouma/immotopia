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
      // WCAG 1.4.11 : colorTextQuaternary porte la fleche du Select, l'icone du
      // DatePicker, la croix allowClear, la piste du Switch a l'arret et le
      // separateur du RangePicker — des pixels porteurs de sens, pas des etats
      // desactives. --text-disabled les laissait a 2,56:1.
      //
      // On ne les monte PAS a --text-tertiary : AntD construit ces pixels sur
      // une paire repos/survol dont colorTextTertiary est deja le survol
      // (switch/style/index.js:246 vs :254, input/style/index.js:331 vs :341,
      // select/style/index.js:60 vs :79, date-picker/style/index.js:176 vs
      // :193). Les egaliser supprimerait le retour visuel au survol.
      // --icon-muted est cale au plancher (3,46:1) et laisse --text-tertiary
      // (4,76:1) assombrir au survol.
      colorTextQuaternary: token('--icon-muted'),
      colorTextDescription: token('--text-secondary'),
      colorTextPlaceholder: token('--text-tertiary'),
      colorTextDisabled: token('--text-disabled'),

      // Surfaces et bordures
      colorBgLayout: token('--surface-page'),
      colorBgContainer: token('--surface-card'),
      colorBgElevated: token('--surface-raised'),
      colorFillAlter: token('--surface-sunken'),
      // Bordure de controle : role dedie, conforme a WCAG 1.4.11 (3,46:1 sur
      // --surface-card, 3,31:1 sur --surface-page, 3,16:1 sur --surface-sunken),
      // la ou --border-default plafonnait a 1,48:1 alors qu'il etait le seul
      // pixel delimitant un champ blanc pose sur une carte blanche.
      //
      // PORTEE REELLE, plus large que les seuls champs : dans AntD, colorBorder
      // pilote aussi la bordure des Tag neutres, de Collapse, de List bordered,
      // des onglets `type="card"`, de Pagination, Checkbox, Radio, Form et
      // InputNumber. Checkbox, Radio, Pagination et InputNumber sont des
      // controles et relevent bien de 1.4.11 ; les autres s'assombrissent sans
      // en avoir besoin. Assombrissement uniforme assume, a reevaluer a l'audit
      // RGAA du Lot 5.
      colorBorder: token('--border-control'),
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
        headerBg: token('--surface-sunken'),
        // AntD rend le message d'etat vide en colorTextDisabled
        // (table/style/empty.js). C'est du TEXTE, pas un etat desactive : il
        // tombait a 2,56:1 dans les 11 ecrans qui passent une chaine brute a
        // `locale.emptyText`. Surcharge par token de composant plutot que par
        // regle CSS : une surcharge CSS a la meme specificite que la regle
        // generee et ne l'emporte que grace au hashPriority 'low' par defaut de
        // cssinjs — un StyleProvider hashPriority="high" l'inverserait en
        // silence.
        colorTextDisabled: token('--text-tertiary')
      }),
      Layout: defined({
        bodyBg: token('--surface-page'),
        siderBg: token('--surface-nav'),
        headerBg: token('--surface-card')
      })
    }
  };
}
