import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import './WorkspaceTabs.css';

/**
 * `<WorkspaceTabs>` — barre d'onglets horizontale reliant des ROUTES, pas des
 * panneaux locaux.
 *
 * Chaque onglet est un `<Link>` réel vers une URL existante : clic milieu,
 * ouverture dans un nouvel onglet, copie de lien, tout continue de marcher. Le
 * composant ne fait que choisir lequel est actif (préfixe de chemin le plus
 * long qui matche l'URL courante — même règle que `AppNavigation`) et anime un
 * indicateur qui glisse sous lui.
 *
 * Couleur : l'orange de marque marque la POSITION (`--color-accent`, jamais un
 * statut), le texte de l'onglet actif passe en bleu de marque
 * (`--color-primary`, 7,3:1 — AA texte). Voir `styles/tokens.css` §accent.
 *
 * Clavier : `role="tablist"`/`role="tab"` avec un focus roving — Flèche
 * droite/gauche déplace le focus (Home/End vers les extrémités), en tenant
 * compte du RTL ; Entrée/Espace active le lien focalisé comme n'importe quel
 * lien. Rien ne navigue au seul déplacement du focus : un utilisateur clavier
 * doit pouvoir parcourir les onglets sans quitter la page à chaque flèche.
 */

export interface WorkspaceTabItem {
  key: string;
  label: string;
  /** URL absolue de la route existante — jamais un fragment de panneau local. */
  href: string;
  icon?: React.ReactNode;
}

export interface WorkspaceTabsProps {
  items: WorkspaceTabItem[];
  /** `aria-label` du groupe d'onglets — passer par `t()` côté appelant. */
  ariaLabel: string;
  className?: string;
}

/** Vrai si `pathname` désigne `href` ou une de ses sous-routes. */
function matchesTab(pathname: string, href: string): boolean {
  const [path] = href.split('?');
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Remonte les ancêtres jusqu'au premier `dir` explicite, `<html>` compris. */
function isWithinRtl(node: HTMLElement | null): boolean {
  let current: HTMLElement | null = node;
  while (current) {
    const dir = current.getAttribute('dir');
    if (dir === 'rtl') return true;
    if (dir === 'ltr') return false;
    current = current.parentElement;
  }
  return false;
}

export const WorkspaceTabs: React.FC<WorkspaceTabsProps> = ({ items, ariaLabel, className }) => {
  const location = useLocation();
  const listRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  /** Onglet actif : le préfixe le plus long qui matche le chemin courant. */
  const activeIndex = useMemo(() => {
    let best = -1;
    let bestLength = -1;
    items.forEach((item, index) => {
      const [path] = item.href.split('?');
      if (matchesTab(location.pathname, item.href) && path.length > bestLength) {
        best = index;
        bestLength = path.length;
      }
    });
    return best;
  }, [items, location.pathname]);

  const activeItem = activeIndex >= 0 ? items[activeIndex] : undefined;

  // Repositionne l'indicateur sur l'onglet actif. Le calcul est fait dans le
  // référentiel du conteneur `listRef` — qui défile AVEC les onglets — et non
  // dans celui de la fenêtre : le décalage obtenu reste correct quelle que
  // soit la position de défilement, sans écouteur `scroll` à entretenir, et
  // reste juste en RTL puisque `getBoundingClientRect` rend déjà la position
  // physique réellement peinte.
  useLayoutEffect(() => {
    const container = listRef.current;
    const activeEl = activeItem ? tabRefs.current.get(activeItem.key) : undefined;
    if (!container || !activeEl) {
      setIndicator(null);
      return;
    }

    const update = () => {
      const containerRect = container.getBoundingClientRect();
      const tabRect = activeEl.getBoundingClientRect();
      setIndicator({ left: tabRect.left - containerRect.left, width: tabRect.width });
    };
    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeItem, items]);

  const focusTabAt = (index: number) => {
    const item = items[index];
    const el = item && tabRefs.current.get(item.key);
    el?.focus();
    // jsdom (tests) n'implémente pas `scrollIntoView` : la navigation
    // clavier reste utilisable sans lui, l'appel est donc défensif.
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!items.length) return;
    const currentIndex = items.findIndex(item => tabRefs.current.get(item.key) === document.activeElement);
    // WAI-ARIA APG : en RTL, la flèche qui avance visuellement vers la droite
    // pointe vers l'onglet PRÉCÉDENT — la direction logique s'inverse, pas
    // seulement l'affichage. `<LanguageProvider>` pose `dir="rtl"` sur `<html>`
    // (jamais sur une simple feuille de style), donc c'est l'attribut DOM — et
    // non `getComputedStyle`, que jsdom ne cascade pas depuis `[dir]` — qui
    // fait foi.
    const rtl = isWithinRtl(listRef.current);
    const nextKey = rtl ? 'ArrowLeft' : 'ArrowRight';
    const previousKey = rtl ? 'ArrowRight' : 'ArrowLeft';

    switch (event.key) {
      case nextKey:
        event.preventDefault();
        focusTabAt(currentIndex < 0 ? 0 : (currentIndex + 1) % items.length);
        break;
      case previousKey:
        event.preventDefault();
        focusTabAt(currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length);
        break;
      case 'Home':
        event.preventDefault();
        focusTabAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusTabAt(items.length - 1);
        break;
      default:
        break;
    }
  };

  if (items.length === 0) return null;

  return (
    <div className={cn('workspace-tabs-scroll overflow-x-auto', className)}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
        className="relative flex min-w-max items-center gap-1 border-b border-line-subtle"
      >
        {items.map((item, index) => {
          const active = index === activeIndex;
          // Roving tabindex : un seul onglet dans l'ordre de tabulation — le
          // repli sur le premier tient au cas où aucune route ne matche
          // encore (donnée en cours de résolution du contexte syndic).
          const roving = activeIndex >= 0 ? activeIndex : 0;
          return (
            <Link
              key={item.key}
              to={item.href}
              ref={node => {
                if (node) tabRefs.current.set(item.key, node);
                else tabRefs.current.delete(item.key);
              }}
              role="tab"
              aria-selected={active}
              tabIndex={index === roving ? 0 : -1}
              className={cn(
                'relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-sm px-4 py-3 text-sm font-medium text-content-secondary',
                'transition-colors duration-fast ease-standard',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                active ? 'font-semibold text-primary' : 'hover:bg-brand-bg hover:text-brand-strong'
              )}
            >
              {item.icon && (
                <span aria-hidden="true" className="text-base leading-none">
                  {item.icon}
                </span>
              )}
              {item.label}
            </Link>
          );
        })}
        {indicator && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 h-[3px] rounded-full bg-brand"
            style={{
              width: indicator.width,
              left: indicator.left,
              transition:
                'left var(--duration-base) var(--ease-standard), width var(--duration-base) var(--ease-standard)'
            }}
          />
        )}
      </div>
    </div>
  );
};
