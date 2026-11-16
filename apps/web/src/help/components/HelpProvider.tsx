import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { FeatureAccessMap } from '../../navigation/feature-access';
import { HelpContext, type HelpContextValue } from '../help-context';
import { getHelpEntry, resolvePageHelpId } from '../registry';
import { canAutoStartTour } from '../tour-storage';
import type { HelpEntry } from '../types';

const HelpDrawer = /* @__PURE__ */ React.lazy(() => import('./HelpDrawer'));
const HelpTour = /* @__PURE__ */ React.lazy(() => import('./HelpTour'));

/** Delai avant de proposer une visite automatique : laisse l'ecran se stabiliser. */
const AUTO_TOUR_DELAY_MS = 800;
/** Reessais tant que l'ecran est occupe ou que la cible de la 1re etape n'est pas montee. */
const AUTO_TOUR_RETRY_MS = 500;
const AUTO_TOUR_MAX_WAIT_MS = 10_000;

export interface HelpProviderProps {
  children: React.ReactNode;
  tenantId?: string | null;
  featureAccess?: FeatureAccessMap | null;
  copilotAvailable?: boolean;
}

/**
 * Fournit l'etat de l'aide (panneau, fiche de bloc, visite guidee) a la
 * coquille. A rendre SOUS un `<Router>`.
 */
export function HelpProvider({
  children,
  tenantId = null,
  featureAccess = null,
  copilotAvailable = false
}: HelpProviderProps) {
  const { pathname } = useLocation();
  const pageHelpId = useMemo(() => resolvePageHelpId(pathname), [pathname]);

  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [blockHelpId, setBlockHelpId] = useState<string | null>(null);
  const [tourHelpId, setTourHelpId] = useState<string | null>(null);
  const [claimCount, setClaimCount] = useState(0);
  const claimRef = useRef(0);

  // Etat lu par les ecouteurs et le timer sans les reabonner.
  const openRef = useRef(open);
  openRef.current = open;
  const blockRef = useRef(blockHelpId);
  blockRef.current = blockHelpId;
  const tourRef = useRef(tourHelpId);
  tourRef.current = tourHelpId;
  const pageRef = useRef(pageHelpId);
  pageRef.current = pageHelpId;

  const openedSincePageRef = useRef(false);

  const openHelp = useCallback((helpId?: string) => {
    openedSincePageRef.current = true;
    setBlockHelpId(helpId && helpId !== pageRef.current ? helpId : null);
    setEverOpened(true);
    setOpen(true);
  }, []);
  const closeHelp = useCallback(() => setOpen(false), []);
  const startTour = useCallback((helpId: string) => setTourHelpId(helpId), []);
  const stopTour = useCallback(() => setTourHelpId(null), []);

  const claimPageHelp = useCallback(() => {
    claimRef.current += 1;
    setClaimCount(claimRef.current);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      claimRef.current = Math.max(0, claimRef.current - 1);
      setClaimCount(claimRef.current);
    };
  }, []);

  // Le panneau reste ouvert sur la nouvelle page, mais la fiche de bloc ne suit pas.
  useEffect(() => {
    setBlockHelpId(null);
  }, [pathname]);

  // F1 ouvre / referme l'aide ; Echap la ferme. Ctrl/Cmd+J (Copilot) n'est jamais touche.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F1') {
        if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
        event.preventDefault();
        if (openRef.current && blockRef.current === null) {
          setOpen(false);
          return;
        }
        if (pageRef.current) openHelp();
        return;
      }
      if (event.key === 'Escape' && openRef.current && !event.defaultPrevented) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openHelp]);

  // Proposition automatique de visite, une fois la page stabilisee.
  // Reessaie tant que la page n'a pas change : un ecran charge directement par son URL
  // est encore `aria-busy`, ou n'a pas encore monte ses ancres, au premier essai.
  useEffect(() => {
    if (!pageHelpId) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    let entry: HelpEntry | null = null;
    const startedAt = Date.now();
    openedSincePageRef.current = false;

    const attempt = () => {
      if (cancelled || tourRef.current || openedSincePageRef.current || openRef.current) return;
      if (entry && canAutoStartTour(entry)) {
        setTourHelpId(entry.id);
        return;
      }
      if (Date.now() - startedAt >= AUTO_TOUR_MAX_WAIT_MS) return;
      timer = window.setTimeout(attempt, AUTO_TOUR_RETRY_MS);
    };

    timer = window.setTimeout(() => {
      void getHelpEntry(pageHelpId)
        .then(found => {
          if (cancelled || !found) return;
          // Pas de visite automatique pour une fiche sans visite : inutile de reessayer.
          if (!found.entry.tour?.autoStart) return;
          entry = found.entry;
          attempt();
        })
        .catch(() => undefined);
    }, AUTO_TOUR_DELAY_MS);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [pageHelpId]);

  const value = useMemo<HelpContextValue>(
    () => ({
      available: true,
      open,
      blockHelpId,
      pageHelpId,
      tenantId,
      featureAccess,
      copilotAvailable,
      openHelp,
      closeHelp,
      tourHelpId,
      startTour,
      stopTour,
      pageHelpClaimed: claimCount > 0,
      claimPageHelp
    }),
    [
      open,
      blockHelpId,
      pageHelpId,
      tenantId,
      featureAccess,
      copilotAvailable,
      openHelp,
      closeHelp,
      tourHelpId,
      startTour,
      stopTour,
      claimCount,
      claimPageHelp
    ]
  );

  return (
    <HelpContext.Provider value={value}>
      {children}
      {everOpened && (
        <Suspense fallback={null}>
          <HelpDrawer />
        </Suspense>
      )}
      {tourHelpId !== null && (
        <Suspense fallback={null}>
          <HelpTour />
        </Suspense>
      )}
    </HelpContext.Provider>
  );
}

export default HelpProvider;
