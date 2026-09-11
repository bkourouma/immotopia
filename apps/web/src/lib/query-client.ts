import { QueryClient } from '@tanstack/react-query';
import { STALE_TIME } from './query-keys';

/**
 * Client de cache applicatif (REFONTE_UI_UX.md §8.4).
 *
 * Le dépôt n'avait ni cache, ni déduplication : les 24 services de
 * `src/services/` appellent `apiClient` directement, et deux composants montés
 * ensemble déclenchaient deux requêtes identiques. Chaque retour arrière
 * rechargeait tout, squelette compris.
 *
 * Les valeurs ci-dessous sont les conventions du §8.4, pas des réglages par
 * défaut hérités de la bibliothèque. Chacune est justifiée.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Défaut prudent : celui des listes. Un référentiel demande
        // explicitement `STALE_TIME.reference`, ce qui rend le choix visible à
        // la lecture de l'appel plutôt que caché dans une configuration.
        staleTime: STALE_TIME.list,

        // Le nouvel essai vit dans `apiClient`, pas ici (§8.4 : « 2 tentatives,
        // backoff 1 s / 3 s, sur les seules requêtes GET »). Le laisser aux
        // deux étages les multiplierait : 3 tentatives axios × 3 React Query
        // font 9 appels pour une API en difficulté, exactement au moment où il
        // ne faut pas la marteler.
        retry: false,

        // Revenir sur l'onglet revalide en arrière-plan. C'est la correction
        // demandée pour `TenantPortal/Payments.tsx:207-216`, qui rechargeait
        // tout sur `visibilitychange` et renvoyait l'écran au squelette : la
        // donnée affichée reste à l'écran pendant la revalidation.
        refetchOnWindowFocus: true,

        // Un changement de réseau justifie une revalidation ; le Lot 5 s'appuie
        // dessus pour le retour en ligne.
        refetchOnReconnect: true,

        // Remonter dans un écran déjà ouvert ne doit pas redemander la donnée
        // si elle est encore fraîche. `staleTime` tranche, pas le montage.
        refetchOnMount: true
      },
      mutations: {
        // Jamais de nouvel essai automatique sur une mutation : rejouer un
        // encaissement dont la réponse s'est perdue crée un doublon. Le rejeu
        // sûr passe par la file hors-ligne et sa clé d'idempotence (§8.5),
        // livrée au Lot 5.
        retry: false
      }
    }
  });
}
