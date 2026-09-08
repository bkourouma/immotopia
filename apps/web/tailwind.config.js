/**
 * Tailwind lit les mêmes variables que le `ConfigProvider` AntD
 * (`src/styles/tokens.css`, §3.2). Aucune couleur, aucun rayon, aucune hauteur
 * n'est écrit ici : c'est ce qui rend un contrôle shadcn et un contrôle AntD
 * visuellement interchangeables, garde-fou n°1 du §9.7.
 *
 * L'échelle `slate` reste celle de Tailwind : le §3.2 la reprend telle quelle
 * comme échelle de neutres, et les modificateurs d'opacité (`bg-slate-900/90`)
 * doivent continuer de fonctionner.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    /**
     * Breakpoints §3.4 : les paliers Ant Design font autorité, Tailwind s'y
     * aligne. `lg` passe de 1024 à 992 px, ce qui supprime la zone morte
     * 992-1023 où la grille était en 3 colonnes alors que la coquille était
     * encore en mode mobile.
     */
    screens: {
      sm: '576px',
      md: '768px',
      lg: '992px',
      xl: '1200px',
      '2xl': '1600px'
    },
    extend: {
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)'
      },

      /**
       * Rôles typographiques du §3.2. L'échelle numérique de Tailwind
       * (`text-sm`, `text-xs`…) est conservée pour ne rien déplacer dans les
       * écrans existants ; les rôles sont disponibles pour le code à venir.
       * Chaque taille est responsive par la variable elle-même.
       */
      fontSize: {
        display: ['var(--font-size-display)', { lineHeight: 'var(--line-height-display)' }],
        h1: ['var(--font-size-h1)', { lineHeight: 'var(--line-height-h1)' }],
        h2: ['var(--font-size-h2)', { lineHeight: 'var(--line-height-h2)' }],
        h3: ['var(--font-size-h3)', { lineHeight: 'var(--line-height-h3)' }],
        body: ['var(--font-size-body)', { lineHeight: 'var(--line-height-body)' }],
        input: ['var(--font-size-input)', { lineHeight: 'var(--line-height-input)' }],
        small: ['var(--font-size-small)', { lineHeight: 'var(--line-height-small)' }],
        caption: ['var(--font-size-caption)', { lineHeight: 'var(--line-height-caption)' }],
        numeric: ['var(--font-size-numeric)', { lineHeight: 'var(--line-height-numeric)' }]
      },

      colors: {
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          active: 'var(--color-primary-active)',
          bg: 'var(--color-primary-bg)',
          border: 'var(--color-primary-border)',
          // Texte posé sur un aplat primaire.
          foreground: 'var(--surface-card)'
        },
        success: {
          DEFAULT: 'var(--color-success)',
          text: 'var(--color-success-text)',
          bg: 'var(--color-success-bg)'
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          text: 'var(--color-warning-text)',
          bg: 'var(--color-warning-bg)'
        },
        error: {
          DEFAULT: 'var(--color-error)',
          text: 'var(--color-error-text)',
          bg: 'var(--color-error-bg)'
        },
        info: 'var(--color-info)',

        surface: {
          page: 'var(--surface-page)',
          card: 'var(--surface-card)',
          raised: 'var(--surface-raised)',
          sunken: 'var(--surface-sunken)',
          inverse: 'var(--surface-inverse)'
        },
        line: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)'
        },
        content: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          disabled: 'var(--text-disabled)',
          'on-inverse': 'var(--text-on-inverse)',
          'on-inverse-muted': 'var(--text-on-inverse-muted)'
        },

        /**
         * Alias de compatibilité shadcn. Ces noms sont déjà employés par
         * `components/ui/` (`ring-ring`, `text-muted-foreground`,
         * `ring-offset-background`) mais n'étaient résolus par aucune valeur :
         * les classes concernées étaient purement et simplement supprimées à la
         * compilation (§3.1 point 4, §7.3). Les brancher sur les tokens rend le
         * rendu de la couche gelée prévisible jusqu'à sa suppression en Lot 4.
         */
        background: 'var(--surface-card)',
        foreground: 'var(--text-primary)',
        muted: {
          DEFAULT: 'var(--surface-sunken)',
          foreground: 'var(--text-secondary)'
        },
        accent: {
          DEFAULT: 'var(--surface-sunken)',
          foreground: 'var(--text-primary)'
        },
        destructive: {
          DEFAULT: 'var(--color-error)',
          foreground: 'var(--surface-card)'
        },
        ring: 'var(--color-primary)'
      },

      /**
       * `rounded` (4 px) et `rounded-md` (6 px), `rounded-lg` (8 px) et
       * `rounded-xl` (12 px) tombent déjà sur les valeurs du §3.2 : le passage
       * aux variables ne déplace rien à l'écran, sauf `rounded-sm` qui monte de
       * 2 à 4 px pour rejoindre `--radius-sm`.
       */
      borderRadius: {
        DEFAULT: 'var(--radius-sm)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)'
      },

      boxShadow: {
        xs: 'var(--shadow-xs)',
        DEFAULT: 'var(--shadow-sm)',
        sm: 'var(--shadow-xs)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        // Le système ne définit rien au-delà de `lg` : `shadow-xl` y retombe.
        xl: 'var(--shadow-lg)',
        sheet: 'var(--shadow-sheet)'
      },

      /** Hauteurs de contrôle §3.2 — 44 px est le plancher tactile sous 992 px. */
      height: {
        'control-sm': 'var(--control-h-sm)',
        'control-md': 'var(--control-h-md)',
        'control-lg': 'var(--control-h-lg)'
      },
      minHeight: {
        'control-sm': 'var(--control-h-sm)',
        'control-md': 'var(--control-h-md)',
        'control-lg': 'var(--control-h-lg)'
      },
      minWidth: {
        'control-sm': 'var(--control-h-sm)',
        'control-md': 'var(--control-h-md)',
        'control-lg': 'var(--control-h-lg)'
      },
      // Pour les boutons-icône, qui doivent rester carrés.
      width: {
        'control-sm': 'var(--control-h-sm)',
        'control-md': 'var(--control-h-md)',
        'control-lg': 'var(--control-h-lg)'
      },

      spacing: {
        gutter: 'var(--grid-gutter)',
        page: 'var(--page-padding)'
      },

      zIndex: {
        sticky: 'var(--z-sticky)',
        sidebar: 'var(--z-sidebar)',
        header: 'var(--z-header)',
        'bottom-bar': 'var(--z-bottom-bar)',
        drawer: 'var(--z-drawer)',
        modal: 'var(--z-modal)',
        popover: 'var(--z-popover)',
        toast: 'var(--z-toast)'
      },

      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)'
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        enter: 'var(--ease-enter)',
        exit: 'var(--ease-exit)'
      }
    }
  },
  plugins: []
};
