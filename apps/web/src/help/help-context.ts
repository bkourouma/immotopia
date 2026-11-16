import { createContext, useContext } from 'react';
import type { FeatureAccessMap } from '../navigation/feature-access';

/**
 * Etat partage de l'aide : panneau, fiche courante, visite guidee.
 *
 * Fichier de CONTRAT : `HelpProvider` (components/HelpProvider.tsx) l'alimente ;
 * `HelpButton`, `HelpDrawer`, `PageHeader` et la coquille le lisent. Hors
 * `<HelpProvider>` (ecrans publics, tests existants), `useHelp()` renvoie une
 * valeur inerte (`available: false`) : aucun « ? » n'est alors affiche et rien
 * ne leve.
 */
export interface HelpContextValue {
  /** Vrai sous `<HelpProvider>`. Faux : les primitives n'affichent aucun « ? ». */
  available: boolean;
  open: boolean;
  /** Fiche du bloc dont le « ? » a ete clique (onglet « Ce bloc »), sinon `null`. */
  blockHelpId: string | null;
  /** Fiche de la page courante, resolue par la route (`resolvePageHelpId`), sinon `null`. */
  pageHelpId: string | null;
  /** Identifiant d'agence de la coquille (sert a lire l'abonnement et a lier le Copilot). */
  tenantId: string | null;
  /** Droits d'abonnement de l'agence ; `null` = pas de restriction connue. */
  featureAccess: FeatureAccessMap | null;
  /** ImmoCopilot disponible pour cet utilisateur (bouton « Demander a ImmoCopilot »). */
  copilotAvailable: boolean;
  /** Ouvre le panneau sur `helpId`, ou sur la page courante si absent. */
  openHelp: (helpId?: string) => void;
  closeHelp: () => void;
  /** Fiche dont la visite guidee est en cours, sinon `null`. */
  tourHelpId: string | null;
  startTour: (helpId: string) => void;
  stopTour: () => void;
  /** Vrai quand un `<PageHeader>` affiche deja le « ? » de page : la coquille ne le duplique pas. */
  pageHelpClaimed: boolean;
  /** Appele par `<PageHeader>` (effet) ; renvoie la fonction qui libere la revendication. */
  claimPageHelp: () => () => void;
}

const noop = (): void => undefined;

/** Valeur hors `<HelpProvider>`. */
export const INERT_HELP: HelpContextValue = {
  available: false,
  open: false,
  blockHelpId: null,
  pageHelpId: null,
  tenantId: null,
  featureAccess: null,
  copilotAvailable: false,
  openHelp: noop,
  closeHelp: noop,
  tourHelpId: null,
  startTour: noop,
  stopTour: noop,
  pageHelpClaimed: false,
  claimPageHelp: () => noop
};

export const HelpContext = createContext<HelpContextValue>(INERT_HELP);

export function useHelp(): HelpContextValue {
  return useContext(HelpContext);
}
