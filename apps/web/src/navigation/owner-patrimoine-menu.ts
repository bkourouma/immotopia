import { menuKeyFor } from './menu-catalog';

/**
 * Élagage de « Mon patrimoine » (persona propriétaire) — lot P5.
 *
 * Ce menu n'est pas coupé par l'écran « Rôles et permissions » (RBAC) : il
 * est masqué par un réglage d'agence, `GET /portal/owner/patrimoine/settings`
 * → `enabled`. Même mécanique que `useDisabledMenuKeys` (une clé de menu
 * dans l'ensemble coupé), source différente — d'où une fonction à part,
 * fusionnée dans la coquille plutôt qu'un second système de filtrage.
 */
export const OWNER_PATRIMOINE_GROUP_KEY = 'mon-patrimoine';

export const OWNER_PATRIMOINE_MENU_KEY = menuKeyFor('proprietaire', OWNER_PATRIMOINE_GROUP_KEY);

/**
 * Ajoute la clé de « Mon patrimoine » à l'ensemble des menus coupés quand le
 * réglage d'agence la masque.
 *
 * `enabled === null` (réponse pas encore arrivée, ou compte non
 * propriétaire) ne coupe rien : même garde-fou que `useDisabledMenuKeys` — ne
 * jamais faire clignoter un menu amputé au chargement.
 */
export function withOwnerPatrimoineMenu(disabled: Set<string>, enabled: boolean | null): Set<string> {
  if (enabled !== false) return disabled;
  const next = new Set(disabled);
  next.add(OWNER_PATRIMOINE_MENU_KEY);
  return next;
}

/**
 * Ajoute la clé du menu « Assistant » (collaborateur) aux menus coupés tant
 * qu'ImmoCopilot n'est pas confirmé activé : l'entrée n'apparaît qu'une fois
 * l'état connu et positif, et jamais pour une agence qui n'a pas l'assistant.
 */
export function withAssistantMenu(disabled: Set<string>, enabled: boolean): Set<string> {
  if (enabled) return disabled;
  const next = new Set(disabled);
  next.add(menuKeyFor('collaborateur', 'assistant'));
  return next;
}
