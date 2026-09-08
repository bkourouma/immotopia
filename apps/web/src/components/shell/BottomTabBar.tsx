import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MORE_TAB_HREF } from '../../navigation/model';
import type { BottomTab } from '../../navigation/model';
import { resolveHref } from '../../navigation/resolve';
import type { NavContext } from '../../navigation/resolve';

/**
 * `<BottomTabBar>` — navigation principale sous 992 px (REFONTE_UI_UX.md §4.2).
 *
 * Le drawer seul coûtait **3 taps** pour atteindre « Échéances » : burger,
 * ouvrir « Gestion Locative », choisir — et il se refermait après chaque
 * navigation. Sur un parcours d'encaissement où l'agent enchaîne dix
 * locataires, cela faisait trente taps de navigation pure. La barre d'onglets
 * ramène ce parcours à **1 tap**.
 *
 * Elle n'expose pas les cinquante destinations, et n'essaie pas : le dernier
 * onglet, « Plus », ouvre l'arbre complet. La hiérarchie est assumée — ce qui
 * est fréquent est en bas, ce qui est rare est derrière « Plus ».
 *
 * Hauteur 44 px plus la zone sûre du terminal : sur iPhone, une barre collée
 * au bas de l'écran passe sinon sous l'indicateur d'accueil.
 */
export interface BottomTabBarProps {
  tabs: BottomTab[];
  context: NavContext;
  /** Appelé par l'onglet « Plus ». Absent = l'onglet n'est pas rendu. */
  onOpenMore?: () => void;
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({ tabs, context, onOpenMore }) => {
  const navigate = useNavigate();
  const location = useLocation();

  if (tabs.length === 0) return null;

  const isActive = (href: string | null): boolean => {
    if (!href || href === MORE_TAB_HREF) return false;
    const [path] = href.split('?');
    if (path === '/dashboard' || path === '/tenant' || path === '/owner') {
      return location.pathname === path;
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <nav
      aria-label="Navigation principale"
      style={{
        position: 'fixed',
        insetInline: 0,
        bottom: 0,
        zIndex: 'var(--z-bottom-bar)' as unknown as number,
        display: 'flex',
        backgroundColor: 'var(--surface-card)',
        borderTop: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-sheet)',
        // La zone sûre évite que la barre passe sous l'indicateur d'accueil iOS.
        paddingBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
    >
      {tabs.map(tab => {
        const href = resolveHref(tab.href, context);
        const active = isActive(href);
        const isMore = tab.href === MORE_TAB_HREF;

        // Une destination non résolue (agence inconnue) est désactivée plutôt
        // que rendue en lien mort.
        const disabled = !isMore && href === null;

        return (
          <button
            key={tab.key}
            type="button"
            disabled={disabled}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              if (isMore) return onOpenMore?.();
              if (href) navigate(href);
            }}
            style={{
              flex: 1,
              // 44 px de haut : plancher tactile du §3.2.
              minHeight: 'var(--control-h-lg)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              padding: 'var(--space-2) var(--space-1)',
              border: 'none',
              background: 'transparent',
              cursor: disabled ? 'default' : 'pointer',
              color: disabled ? 'var(--text-disabled)' : active ? 'var(--color-primary)' : 'var(--text-secondary)',
              transitionProperty: 'color',
              transitionDuration: 'var(--duration-fast)',
              transitionTimingFunction: 'var(--ease-standard)'
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }} aria-hidden="true">
              {tab.icon}
            </span>
            <span
              style={{
                fontSize: 'var(--font-size-caption)',
                lineHeight: 'var(--line-height-caption)',
                fontWeight: active ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)'
              }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
