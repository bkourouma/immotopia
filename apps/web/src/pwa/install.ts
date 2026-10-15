import { useSyncExternalStore } from 'react';

/**
 * Proposition d'installation de l'application (PWA).
 *
 * `beforeinstallprompt` part très tôt, parfois avant le premier rendu React :
 * l'écoute est donc posée à l'import de ce module (depuis `index.tsx`) et
 * l'évènement gardé ici, hors de tout composant.
 *
 * iOS ne déclenche jamais cet évènement : l'installation y passe par le menu de
 * partage de Safari, d'où l'état `ios` qui n'affiche qu'une consigne.
 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type InstallState = 'unavailable' | 'prompt' | 'ios';

let invite: InstallPromptEvent | null = null;
const abonnes = new Set<() => void>();
const notifier = () => abonnes.forEach(fn => fn());

function estInstallee(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia?.('(display-mode: standalone)').matches === true || iosStandalone === true;
}

function estIos(): boolean {
  const ua = navigator.userAgent;
  // Un iPad récent se présente comme un Macintosh : les points de contact le trahissent.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    // Sans cela, Chrome pose sa propre bannière.
    event.preventDefault();
    invite = event as InstallPromptEvent;
    notifier();
  });
  window.addEventListener('appinstalled', () => {
    invite = null;
    notifier();
  });
}

function lireEtat(): InstallState {
  if (estInstallee()) return 'unavailable';
  if (invite) return 'prompt';
  if (estIos()) return 'ios';
  return 'unavailable';
}

function sAbonner(fn: () => void) {
  abonnes.add(fn);
  return () => {
    abonnes.delete(fn);
  };
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(sAbonner, lireEtat, () => 'unavailable');
}

/** Ouvre la boîte d'installation du navigateur. L'évènement ne se rejoue pas. */
export async function promptInstall(): Promise<void> {
  if (!invite) return;
  const courant = invite;
  invite = null;
  notifier();
  await courant.prompt();
  await courant.userChoice;
}
