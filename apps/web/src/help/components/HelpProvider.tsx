import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { FeatureAccessMap } from '../../navigation/feature-access';
import { HelpContext, type HelpContextValue } from '../help-context';
import { getHelpEntry, resolvePageHelpId } from '../registry';
import { canAutoStartTour } from '../tour-storage';

const HelpDrawer = React.lazy(() => import('./HelpDrawer'));
const HelpTour = React.lazy(() => import('./HelpTour'));

/** Delai avant de proposer une visite automatique : laisse l'ecran se stabiliser. */
const AUTO_TOUR_DELAY_MS = 800;

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

  const openHelp = useCallback((helpId?: string) => {
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
  useEffect(() => {
    if (!pageHelpId) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void getHelpEntry(pageHelpId)
        .then(found => {
          if (cancelled || !found || tourRef.current) return;
          if (canAutoStartTour(found.entry)) setTourHelpId(found.entry.id);
        })
        .catch(() => undefined);
    }, AUTO_TOUR_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
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
