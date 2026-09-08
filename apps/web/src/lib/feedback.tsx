/**
 * Passerelle de retour d'action pour le code qui n'est pas un composant React.
 *
 * Depuis Ant Design 5, les fonctions statiques `message.*`, `notification.*` et
 * `Modal.confirm` ne consomment pas le contexte du `ConfigProvider` : elles
 * s'afficheraient au thème par défaut, à côté d'une application thémée par les
 * tokens du §3.2. La réponse standard est `App.useApp()` — mais c'est un hook,
 * inutilisable depuis un module utilitaire.
 *
 * `<FeedbackBridge/>`, monté une fois sous `<App>`, dépose les instances
 * contextualisées ici ; `feedback.*` les rejoue. Tant que le pont n'est pas
 * monté (tout premier rendu, tests sans `<App>`), les appels sont ignorés avec
 * un avertissement en développement plutôt que de retomber sur les fonctions
 * statiques, ce qui réintroduirait exactement le défaut que l'on supprime.
 *
 * À réserver au code hors composant. Dans un composant, on utilise
 * `App.useApp()` directement.
 */
import { useEffect } from 'react';
import { App } from 'antd';

type AppInstances = ReturnType<typeof App.useApp>;

let instances: AppInstances | null = null;

function warnUnbound(method: string): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[feedback] ${method} appelé avant le montage de <FeedbackBridge/> : le message est perdu.`);
  }
}

/**
 * Monté une seule fois, sous `<App>` (voir `App.tsx`). Ne rend rien.
 */
export function FeedbackBridge(): null {
  const app = App.useApp();

  useEffect(() => {
    instances = app;
    return () => {
      instances = null;
    };
  }, [app]);

  // Le premier rendu précède l'effet : on publie tout de suite pour qu'un appel
  // synchrone déclenché au montage d'une page ne soit pas perdu.
  instances = app;

  return null;
}

/** Retour d'action utilisable depuis n'importe quel module. */
export const feedback = {
  success(content: string): void {
    if (!instances) return warnUnbound('success');
    instances.message.success(content);
  },
  error(content: string): void {
    if (!instances) return warnUnbound('error');
    instances.message.error(content);
  },
  warning(content: string): void {
    if (!instances) return warnUnbound('warning');
    instances.message.warning(content);
  },
  info(content: string): void {
    if (!instances) return warnUnbound('info');
    instances.message.info(content);
  }
};

/** Réservé aux tests : injecte ou réinitialise les instances. */
export function __setFeedbackInstances(next: AppInstances | null): void {
  instances = next;
}
