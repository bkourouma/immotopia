import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { cn } from '../../lib/utils';
import { t } from '../../i18n/t';
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
 *
 * Défilement : quand les onglets débordent de la largeur disponible, une flèche
 * apparaît du côté où il reste des onglets cachés (début et/ou fin, inversés en
 * RTL) et fait défiler d'une bonne portion de la barre ; l'onglet actif est
 * recentré à l'ouverture. Le défilement tactile, la molette horizontale et le
 * clavier restent actifs.
 */

export interface WorkspaceTabItem {
  key: string;
  label: string;
  /** URL absolue de la route existante — jamais un fragment de panneau local. */
  href: string;
  icon?: React.ReactNode;
  /** Compteur affiché après le libellé quand il est supérieur à zéro (ex. éléments à traiter). */
  badge?: number;
  /**
   * Autres chemins qui allument cet onglet sans en prolonger l'URL — la
   * facture d'un fournisseur (`/finance/factures-fournisseurs`) relève de
   * l'onglet « Fournisseurs » sans vivre sous `/finance/fournisseurs`.
   */
  activeFor?: string[];
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

/** Flèche de défilement posée au bord de la barre ; hors de l'ordre de tabulation (le clavier a déjà les flèches du tablist). */
const ScrollButton: React.FC<{
  side: 'start' | 'end';
  rtl: boolean;
  label: string;
  onClick: () => void;
}> = ({ side, rtl, label, onClick }) => {
  // Début de la barre = gauche en LTR, droite en RTL.
  const pointsLeft = (side === 'start') !== rtl;
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      data-testid={`workspace-tabs-scroll-${side}`}
      onClick={onClick}
      style={side === 'start' ? { insetInlineStart: 0 } : { insetInlineEnd: 0 }}
      className="absolute top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-line-subtle bg-surface-card text-content-secondary shadow-sm transition-colors hover:bg-brand-bg hover:text-brand-strong"
    >
      {pointsLeft ? <LeftOutlined aria-hidden="true" /> : <RightOutlined aria-hidden="true" />}
    </button>
  );
};

export const WorkspaceTabs: React.FC<WorkspaceTabsProps> = ({ items, ariaLabel, className }) => {
  const location = useLocation();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = useState({ start: false, end: false });
  const [rtl, setRtl] = useState(false);
  const tabRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  /** Onglet actif : le préfixe le plus long qui matche le chemin courant. */
  const activeIndex = useMemo(() => {
    let best = -1;
    let bestLength = -1;
    items.forEach((item, index) => {
      for (const href of [item.href, ...(item.activeFor ?? [])]) {
        const [path] = href.split('?');
        if (matchesTab(location.pathname, href) && path.length > bestLength) {
          best = index;
          bestLength = path.length;
        }
      }
    });
    return best;
  }, [items, location.pathname]);

  const activeItem = activeIndex >= 0 ? items[activeIndex] : undefined;

  // Reste-t-il des onglets cachés avant et/ou après ? `scrollLeft` part de 0 au début de la barre et
  // devient négatif en RTL : sa valeur absolue est donc la distance parcourue, dans les deux sens d'écriture.
  const updateOverflow = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const travelled = Math.abs(scroller.scrollLeft);
    const max = scroller.scrollWidth - scroller.clientWidth;
    const next = { start: travelled > 1, end: travelled < max - 1 };
    setOverflow(previous => (previous.start === next.start && previous.end === next.end ? previous : next));
  }, []);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    setRtl(isWithinRtl(scroller));
    updateOverflow();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateOverflow);
      return () => window.removeEventListener('resize', updateOverflow);
    }
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(scroller);
    if (listRef.current) observer.observe(listRef.current);
    return () => observer.disconnect();
  }, [items, updateOverflow]);

  // À l'ouverture d'un onglet lointain, la barre se recentre dessus (la barre seule défile, jamais la page).
  const activeKey = activeItem?.key;
  useEffect(() => {
    const scroller = scrollerRef.current;
    const activeEl = activeKey ? tabRefs.current.get(activeKey) : undefined;
    if (!scroller || !activeEl) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const tabRect = activeEl.getBoundingClientRect();
    if (tabRect.left >= scrollerRect.left && tabRect.right <= scrollerRect.right) return;
    const delta = tabRect.left + tabRect.width / 2 - (scrollerRect.left + scrollerRect.width / 2);
    scroller.scrollBy?.({ left: delta, behavior: 'smooth' });
  }, [activeKey]);

  const scrollTabs = (direction: 'start' | 'end') => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const step = Math.max(160, scroller.clientWidth * 0.6);
    // `scrollBy` est physique : vers la fin, c'est la droite en LTR et la gauche en RTL.
    const physical = (direction === 'end' ? 1 : -1) * (rtl ? -1 : 1);
    scroller.scrollBy?.({ left: physical * step, behavior: 'smooth' });
  };

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
    <div className={cn('relative', className)}>
      <div ref={scrollerRef} onScroll={updateOverflow} className="workspace-tabs-scroll overflow-x-auto">
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
                {item.badge && item.badge > 0 ? (
                  <span
                    data-testid={`tab-badge-${item.key}`}
                    aria-label={`${item.badge}`}
                    className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand-bg px-1.5 text-xs font-semibold text-brand-strong"
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                ) : null}
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
      {overflow.start ? (
        <ScrollButton
          side="start"
          rtl={rtl}
          label={t('Voir les onglets précédents')}
          onClick={() => scrollTabs('start')}
        />
      ) : null}
      {overflow.end ? (
        <ScrollButton side="end" rtl={rtl} label={t('Voir les onglets suivants')} onClick={() => scrollTabs('end')} />
      ) : null}
    </div>
  );
};
