/**
 * ImmoCopilot — cohérence entre le pool de connexions Prisma et les plafonds de
 * concurrence de l'assistant, et avertissement sur les limiteurs par instance.
 *
 * Module PUR (aucun import de la base, de l'environnement ni du journal) : il
 * est appelé par `config/env.ts` au chargement. Ne rien y importer qui dépende
 * de `config/env` (cycle).
 */

/**
 * Plafond de sections exclusives SIMULTANÉES par processus (quittances
 * générées sous verrou consultatif, `advisory-lock.ts`). Chacune garde 1
 * connexion « gardienne » pendant toute sa durée, plus au moins 1 connexion de
 * travail (`generateDocument`).
 */
export const MAX_CONCURRENT_EXCLUSIVE_SECTIONS = 2;

/** Connexions occupées au pire par les sections exclusives : 2 par section. */
export const AI_POOL_CONNECTIONS = MAX_CONCURRENT_EXCLUSIVE_SECTIONS * 2;

/** Connexions à garder libres pour le trafic ordinaire de l'API. */
export const TRAFFIC_HEADROOM_CONNECTIONS = 4;

/** Valeur minimale recommandée de `connection_limit` quand l'assistant est actif. */
export const RECOMMENDED_CONNECTION_LIMIT = AI_POOL_CONNECTIONS + TRAFFIC_HEADROOM_CONNECTIONS;

export type ConnectionLimit = { kind: 'absent' } | { kind: 'invalid'; raw: string } | { kind: 'ok'; value: number };

/**
 * Lit `connection_limit` dans la chaîne de connexion, sans jamais lever ni
 * renvoyer autre chose que la valeur de ce paramètre (l'URL porte un mot de
 * passe : elle ne doit apparaître dans aucun message).
 */
export function parseConnectionLimit(databaseUrl: string): ConnectionLimit {
  const queryStart = databaseUrl.indexOf('?');
  if (queryStart === -1) return { kind: 'absent' };
  const query = databaseUrl.slice(queryStart + 1).split('#')[0];
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    if (key !== 'connection_limit') continue;
    const raw = eq === -1 ? '' : pair.slice(eq + 1);
    // Entier décimal strict : « 10 », pas « 10abc », « 1e1 » ni « 0x10 ».
    if (!/^[+-]?\d+$/.test(raw)) return { kind: 'invalid', raw };
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0) return { kind: 'invalid', raw };
    return { kind: 'ok', value };
  }
  return { kind: 'absent' };
}

/**
 * Avertissements (jamais bloquants) sur `connection_limit`.
 * - valeur non numérique ou <= 0 : signalée toujours (Prisma la refusera ou
 *   l'ignorera) ;
 * - absente ou trop basse : signalée seulement si l'assistant est actif
 *   (`aiEnabled`), seul cas où les sections exclusives existent.
 */
export function connectionLimitWarnings(databaseUrl: string, aiEnabled: boolean): string[] {
  const limit = parseConnectionLimit(databaseUrl);
  if (limit.kind === 'invalid') {
    return [
      `DATABASE_URL : connection_limit="${limit.raw.slice(0, 32)}" n'est pas un entier strictement positif. ` +
        `Corrigez-le (recommandé pour ImmoCopilot : ${RECOMMENDED_CONNECTION_LIMIT} ou plus).`
    ];
  }
  if (!aiEnabled) return [];
  if (limit.kind === 'absent') {
    return [
      `DATABASE_URL ne fixe pas connection_limit : Prisma retient alors 2 × nombre de processeurs + 1, valeur ` +
        `imprévisible selon la machine. ImmoCopilot peut occuper ${AI_POOL_CONNECTIONS} connexions ` +
        `(${MAX_CONCURRENT_EXCLUSIVE_SECTIONS} sections × 2) : ajoutez ?connection_limit=${RECOMMENDED_CONNECTION_LIMIT} ou plus.`
    ];
  }
  if (limit.value < RECOMMENDED_CONNECTION_LIMIT) {
    return [
      `DATABASE_URL : connection_limit=${limit.value} est trop bas pour ImmoCopilot (${AI_POOL_CONNECTIONS} connexions ` +
        `pour les sections exclusives + ${TRAFFIC_HEADROOM_CONNECTIONS} pour le trafic = ${RECOMMENDED_CONNECTION_LIMIT}). ` +
        `Risque d'erreurs de délai d'attente du pool (P2024) sur toute l'API.`
    ];
  }
  return [];
}

/**
 * Message unique, émis au démarrage en production quand l'assistant est actif :
 * les limiteurs de débit (`middleware/rate-limit-middleware.ts`) comptent en
 * mémoire, par instance d'API. Aucune infrastructure partagée (Redis, table de
 * compteurs) n'existe dans le dépôt.
 */
export function perInstanceLimitersWarning(limits: { tenantMinute: number; tenantDaily: number }): string {
  return (
    `ImmoCopilot : les plafonds de débit (par utilisateur 20/min et 300/jour, chat ; 10/min, confirmations ; ` +
    `par agence ${limits.tenantMinute}/min et ${limits.tenantDaily}/jour) sont comptés EN MÉMOIRE, par instance d'API. ` +
    `Avec N instances, le plafond effectif est N × la valeur configurée. ` +
    `Répartir par affinité de session ou diviser AI_TENANT_*_LIMIT par N ; voir docs/architecture/ai-limiteurs.md.`
  );
}
