import { MORE_TAB_HREF } from './model';
import type { PersonaId } from './model';

/**
 * Résolution des `href` du modèle de navigation.
 *
 * Le modèle porte les segments littéraux `:tenantId` et `:syndicId`. Deux
 * raisons de ne pas les interpoler à la déclaration :
 *
 *   1. `sidebar.tsx` le faisait, et produisait littéralement
 *      `/tenant/undefined/properties` tant que l'appartenance n'était pas
 *      chargée — des liens morts pendant tout le premier rendu.
 *   2. `:syndicId` n'est **pas** connu statiquement : il dépend de la dernière
 *      copropriété consultée, mémorisée dans `localStorage`.
 */

/** Clé de mémorisation de la dernière copropriété consultée, par agence. */
export const lastSyndicKey = (tenantId: string) => `last-syndic:${tenantId}`;

export interface NavContext {
  tenantId?: string | null;
  syndicId?: string | null;
}

/**
 * Sections du module Syndic, dans l'ordre du menu. Sert au repli : sans
 * copropriété active, chaque entrée renvoie vers la liste en lui indiquant la
 * section visée, comportement déjà en place aujourd'hui (`withFallback`).
 */
const SYNDIC_SECTIONS = [
  'lots',
  'charges',
  'assemblees',
  'prestataires',
  'documents',
  'finances',
  'recouvrement',
  'comptabilite',
  'budgets',
  'profils-incidents'
] as const;

/**
 * Résout un `href` du modèle. Renvoie `null` quand la destination n'est pas
 * atteignable — l'appelant doit alors masquer l'entrée plutôt que rendre un
 * lien mort.
 */
export function resolveHref(href: string, ctx: NavContext): string | null {
  if (href === MORE_TAB_HREF) return href;

  if (href.includes(':tenantId')) {
    if (!ctx.tenantId) return null;
    href = href.replace(':tenantId', ctx.tenantId);
  }

  if (href.includes(':syndicId')) {
    if (ctx.syndicId) {
      return href.replace(':syndicId', ctx.syndicId);
    }
    // Aucune copropriété active : on retombe sur la liste, en lui passant la
    // section visée pour qu'elle ouvre le bon volet après sélection.
    const section = SYNDIC_SECTIONS.find(s => href.endsWith(`/${s}`));
    const base = href.replace(/\/syndics\/:syndicId.*$/, '/syndics');
    return section ? `${base}?openSyndicSection=${section}` : base;
  }

  return href;
}

/**
 * Persona d'un utilisateur. Reprend la résolution de `sidebar.tsx:54-57`, à
 * ceci près qu'elle est désormais nommée, testable, et lue par la coquille,
 * la barre d'onglets et le drawer plutôt que recalculée dans chacun.
 */
export function resolvePersona(input: {
  globalRole?: string | null;
  hasTenantMembership: boolean;
  clientType?: string | null;
  isLoadingMembership: boolean;
}): PersonaId | null {
  if (input.globalRole === 'SUPER_ADMIN') return 'super-admin';
  if (input.hasTenantMembership) return 'collaborateur';
  if (input.clientType === 'OWNER') return 'proprietaire';
  if (input.clientType === 'RENTER') return 'locataire';
  // Tant que l'appartenance est en cours de chargement, on ne tranche pas :
  // afficher le menu public à un collaborateur, même une seconde, est pire
  // que de n'afficher aucun menu.
  if (input.isLoadingMembership) return null;
  return 'public';
}

/** Extrait `tenantId` et `syndicId` d'un chemin de route, s'ils s'y trouvent. */
export function contextFromPath(pathname: string): NavContext {
  const syndic = pathname.match(/^\/tenant\/([^/]+)\/syndics\/([^/]+)/);
  if (syndic) return { tenantId: syndic[1], syndicId: syndic[2] };

  const tenant = pathname.match(/^\/tenant\/([^/]+)\//);
  if (tenant) return { tenantId: tenant[1] };

  return {};
}
