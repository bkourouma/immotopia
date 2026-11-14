import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Tour, message as staticMessage } from 'antd';
import type { TourStepProps } from 'antd';
import { t } from '../../i18n/t';
import { useHelp } from '../help-context';
import { useHelpEntry } from '../registry';
import { markTourSeen } from '../tour-storage';

/** Intervalle et durée maximale d'attente des cibles (l'écran peut encore charger). */
const RETRY_INTERVAL_MS = 250;
const RETRY_MAX_MS = 3000;

/** Valeur d'attribut échappée pour un sélecteur entre guillemets. */
function anchorSelector(target: string): string {
  const escaped = target.replace(/["\\]/g, char => `\\${char}`);
  return `[data-help-anchor="${escaped}"]`;
}

function findAnchor(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(anchorSelector(target));
}

/**
 * Visite guidée d'une fiche d'aide (antd `Tour`). Rendue par `HelpProvider`
 * tant que `tourHelpId` est non nul. Les étapes dont la cible est absente de
 * l'écran sont ignorées ; si aucune n'est présente au bout de 3 s, la visite
 * s'arrête (avec un message discret sauf lancement automatique).
 */
const HelpTour: React.FC = () => {
  const { tourHelpId, stopTour } = useHelp();
  const { entry, status } = useHelpEntry(tourHelpId);
  const app = App.useApp();

  const stopRef = useRef(stopTour);
  stopRef.current = stopTour;
  const notifyRef = useRef<(text: string) => void>(() => undefined);
  notifyRef.current = (text: string) => {
    // Hors <App>, le contexte renvoie des objets vides : repli sur l'API statique.
    if (typeof app?.message?.info === 'function') app.message.info(text);
    else void staticMessage.info(text);
  };

  const [running, setRunning] = useState<{ helpId: string; targets: string[] } | null>(null);

  useEffect(() => {
    setRunning(null);
    if (!tourHelpId) return undefined;
    if (status === 'missing') {
      stopRef.current();
      return undefined;
    }
    if (status !== 'ready' || !entry || entry.id !== tourHelpId) return undefined;

    const wanted = entry.tour?.steps ?? [];
    const present = () => wanted.filter(step => findAnchor(step.target)).map(step => step.target);

    const begin = (targets: string[]) => {
      markTourSeen(entry.id);
      setRunning({ helpId: entry.id, targets });
    };
    const giveUp = () => {
      stopRef.current();
      if (!entry.tour?.autoStart) {
        notifyRef.current(t("Cette visite guidée n'est pas disponible sur cet écran pour le moment."));
      }
    };

    if (wanted.length === 0) {
      giveUp();
      return undefined;
    }
    const first = present();
    if (first.length > 0) {
      begin(first);
      return undefined;
    }

    let elapsed = 0;
    const timer = window.setInterval(() => {
      elapsed += RETRY_INTERVAL_MS;
      const targets = present();
      if (targets.length > 0) {
        window.clearInterval(timer);
        begin(targets);
      } else if (elapsed >= RETRY_MAX_MS) {
        window.clearInterval(timer);
        giveUp();
      }
    }, RETRY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [tourHelpId, entry, status]);

  const steps = useMemo<TourStepProps[]>(() => {
    if (!running || !entry || entry.id !== running.helpId) return [];
    return (entry.tour?.steps ?? [])
      .filter(step => running.targets.includes(step.target))
      .map(step => ({
        title: step.title,
        description: <span style={{ whiteSpace: 'pre-line' }}>{step.description}</span>,
        target: () => findAnchor(step.target) as HTMLElement
      }));
  }, [running, entry]);

  if (steps.length === 0) return null;

  return <Tour open steps={steps} onClose={() => stopTour()} onFinish={() => stopTour()} />;
};

export default HelpTour;
