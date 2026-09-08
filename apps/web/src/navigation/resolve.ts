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
export type ShellAudience = PersonaId | 'non-rattache';

export function resolvePersona(input: {
  globalRole?: string | null;
  hasTenantMembership: boolean;
  clientType?: string | null;
  isLoadingMembership: boolean;
}): ShellAudience | null {
  if (input.globalRole === 'SUPER_ADMIN') return 'super-admin';
  if (input.hasTenantMembership) return 'collaborateur';
  if (input.clientType === 'OWNER') return 'proprietaire';
  if (input.clientType === 'RENTER') return 'locataire';
  // Tant que l'appartenance charge, on ne tranche pas : afficher un menu faux,
  // meme une seconde, est pire que de n'afficher aucun menu.
  if (input.isLoadingMembership) return null;
  // Authentifie, rattache a rien. Ce n'est pas un persona : il n'a aucune
  // destination, donc aucune navigation. Voir <AccountNotLinked>.
  return 'non-rattache';
}

/** Extrait `tenantId` et `syndicId` d'un chemin de route, s'ils s'y trouvent. */
export function contextFromPath(pathname: string): NavContext {
  const syndic = pathname.match(/^\/tenant\/([^/]+)\/syndics\/([^/]+)/);
  if (syndic) return { tenantId: syndic[1], syndicId: syndic[2] };

  const tenant = pathname.match(/^\/tenant\/([^/]+)\//);
  if (tenant) return { tenantId: tenant[1] };

  return {};
}

/**
 * Segments de premier niveau du portail LOCATAIRE.
 *
 * `/tenant` recouvre deux espaces disjoints : le portail locataire
 * (`/tenant`, `/tenant/lease`, ...) et le prefixe d'agence
 * (`/tenant/<id>/properties`). On les distingue par une liste FERMEE de
 * segments connus, et non en testant si le segment ressemble a un
 * identifiant : rien ne garantit que les identifiants d'agence resteront des
 * UUID, et une heuristique de forme ferait basculer TOUTES les routes
 * d'agence du cote portail le jour ou elle se tromperait.
 */
export const TENANT_PORTAL_SEGMENTS = ['lease', 'payments', 'deposit', 'maintenance', 'documents'] as const;

/** Le chemin appartient-il au portail LOCATAIRE ? */
export function isTenantPortalPath(pathname: string): boolean {
  if (pathname === '/tenant') return true;
  const match = pathname.match(/^\/tenant\/([^/]+)/);
  if (!match) return false;
  return (TENANT_PORTAL_SEGMENTS as readonly string[]).includes(match[1]);
}

/** Le chemin appartient-il au portail PROPRIETAIRE ? */
export function isOwnerPortalPath(pathname: string): boolean {
  return pathname === '/owner' || pathname.startsWith('/owner/');
}

/**
 * Ou rediriger un client qui atteint le mauvais portail, ou `null` s'il est
 * au bon endroit.
 *
 * `TenantPortal/Layout` portait cette garde ; `OwnerPortal/Layout` n'en avait
 * AUCUNE (§4.3), si bien qu'un locataire atteignant /owner obtenait la
 * coquille proprietaire. La coquille unique la pose pour les deux.
 */
export function portalRedirect(pathname: string, clientType?: string | null): string | null {
  const inTenantPortal = isTenantPortalPath(pathname);
  const inOwnerPortal = isOwnerPortalPath(pathname);
  if (!inTenantPortal && !inOwnerPortal) return null;

  if (clientType === 'OWNER') return inTenantPortal ? '/owner' : null;
  if (clientType === 'RENTER') return inOwnerPortal ? '/tenant' : null;

  // Ni proprietaire ni locataire : un collaborateur ou un administrateur qui
  // atterrit sur un portail client n'y a rien a faire.
  return '/dashboard';
}
