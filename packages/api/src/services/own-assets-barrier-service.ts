import { PropertyOwnershipType } from '@prisma/client';
import type { PrismaTransactionClient } from '../utils/database';
import { prisma } from '../utils/database';
import { getSubscriptionEnforcement } from '../lib/subscription/enforcement';
import { assertThirdPartyManagementAllowed } from '../lib/subscription/guards';
import type { ThirdPartyAction } from '../middleware/error-middleware';
import { getEntitlements } from './subscription-v2-service';

/**
 * Barriere « detenu en propre » (pack Patrimoine, lot P1, 28/09) : une agence
 * dont le SEUL module pleinement ouvert est MODULE_PATRIMOINE gere des biens
 * detenus en propre — gestion locative directe comprise — mais ne cree jamais
 * de mandat ni ne rattache de proprietaire tiers. Une agence qui detient un
 * autre module (Agence, Syndic, Promoteur, Integre) n'est jamais concernee :
 * `getEntitlements` calcule `ownAssetsOnly` en consequence
 * (`lib/subscription/entitlements.ts`).
 *
 * Chaque service point d'appel (mandats de gestion, mandats de vente,
 * biens, indivision, baux) appelle cette fonction AVANT toute ecriture, avec
 * `db: tx` quand l'appel a lieu dans une transaction.
 */

type Db = PrismaTransactionClient | typeof prisma;

export async function assertThirdPartyAllowedForTenant(
  tenantId: string,
  action: ThirdPartyAction,
  options: { db?: Db } = {}
): Promise<void> {
  // `off` : ne lit meme pas les droits (meme geste que les gardes de
  // lib/subscription/guards.ts et le middleware de fonctionnalites).
  if (getSubscriptionEnforcement() === 'off') return;

  const entitlements = await getEntitlements(tenantId, { db: options.db });
  assertThirdPartyManagementAllowed(entitlements, action);
}

/**
 * Decide, a partir de la seule saisie d'un bien (sans acces base), si elle
 * rattache d'emblee un proprietaire tiers : un type de detention autre que
 * TENANT, ou un `ownerEmail` fourni (creation/rattachement d'un utilisateur
 * externe). Le cas « ownerUserId fourni, different de l'acteur, et pas
 * membre ACTIF de l'agence » demande une lecture en base et reste a la
 * charge de l'appelant (voir `services/property-service.ts`).
 */
export function isThirdPartyOwnershipInput(data: {
  ownershipType?: PropertyOwnershipType;
  ownerEmail?: string | null;
}): boolean {
  if (data.ownershipType !== undefined && data.ownershipType !== PropertyOwnershipType.TENANT) return true;
  if (data.ownerEmail) return true;
  return false;
}
