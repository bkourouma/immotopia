/**
 * Enregistrement du service worker (PWA).
 *
 * Uniquement en production : en développement, Vite réécrit les modules à
 * adresse inchangée et un cache-d'abord servirait du code périmé. Si un service
 * worker d'une session précédente traîne encore sur ce port, on le retire.
 *
 * Un échec (http hors localhost, navigation privée) ne se voit pas et ne doit
 * pas se voir : l'application fonctionne à l'identique sans service worker.
 */
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  if (!import.meta.env.PROD) {
    void navigator.serviceWorker
      .getRegistrations()
      .then(regs => Promise.all(regs.map(r => r.unregister())))
      .catch(() => undefined);
    return;
  }

  const enregistrer = () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  };
  // Après le chargement : l'enregistrement ne dispute pas le premier écran.
  if (document.readyState === 'complete') enregistrer();
  else window.addEventListener('load', enregistrer, { once: true });
}
