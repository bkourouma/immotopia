import { Prisma } from '@prisma/client';
import { computeStoredReliability } from './assets/stored-reliability';
import { isFreeTierLimitReached } from '../../services/personal-space/free-tier';
import type { Reliability, ReliabilityReason, ValuationMethodKey } from './assets';

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Client Prisma, client de transaction ou client étendu (garde tenant) : seules
 * ces trois opérations sont utilisées. Le type structurel évite de dépendre de
 * la forme exacte du client étendu, que `Prisma.TransactionClient` refuse.
 */
export interface PropertyAssetClient {
  property: {
    findFirst(args: any): PromiseLike<{ id: string; internalReference: string; title: string | null } | null>;
  };
  asset: {
    findUnique(args: any): PromiseLike<{ id: string } | null>;
    upsert(args: any): PromiseLike<{ id: string }>;
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Garantit l'existence de l'actif REAL_ESTATE d'un bien (ADR-005). La
 * migration ne crée un actif que pour les biens déjà valorisés ; un bien créé
 * ou valorisé ensuite reste invisible de la valeur nette tant qu'aucun actif
 * ne le porte. Cette fonction le crée à la volée.
 *
 * - Idempotente : upsert par `propertyId` (unique) et `tenantId` ; sur course (P2002),
 *   l'actif du concurrent est relu, jamais de doublon ni d'échec.
 * - No-op silencieux (retourne `null`) si le bien est sans agence ou
 *   n'appartient pas à `tenantId`, ou si le plafond d'actifs du palier
 *   gratuit est atteint.
 * - Ne touche à aucune ligne existante : valorisations, prêts et parts d'un
 *   actif immobilier restent sur `propertyId`.
 */
export async function ensurePropertyAsset(
  client: PropertyAssetClient,
  tenantId: string | null | undefined,
  propertyId: string
): Promise<{ id: string } | null> {
  if (!tenantId) return null;
  const property = await client.property.findFirst({
    where: { id: propertyId, tenantId },
    select: { id: true, internalReference: true, title: true }
  });
  if (!property) return null;

  const existing = await client.asset.findUnique({ where: { propertyId, tenantId }, select: { id: true } });
  if (existing) return existing;
  // Palier gratuit (lot 4B) : plafond atteint, on ne crée pas l'actif (la valorisation du bien reste enregistrée).
  if (await isFreeTierLimitReached(tenantId)) return null;

  try {
    return await client.asset.upsert({
      where: { propertyId, tenantId },
      update: {},
      create: {
        tenantId,
        name: property.internalReference || property.title || 'Bien',
        assetClass: 'REAL_ESTATE',
        status: 'ACTIVE',
        currency: 'XOF',
        propertyId,
        details: {},
        detailsVersion: 1
      },
      select: { id: true }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return client.asset.findUnique({ where: { propertyId, tenantId }, select: { id: true } });
    }
    throw error;
  }
}

/** Client capable de relire les détails de l'actif lié : celui de `ensurePropertyAsset` plus `findFirst`. */
export interface PropertyReliabilityClient extends PropertyAssetClient {
  asset: PropertyAssetClient['asset'] & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findFirst(args: any): PromiseLike<{ details: unknown } | null>;
  };
}

/**
 * Fiabilité à stocker pour une valorisation saisie par le module Bien, calculée
 * comme celle du service des actifs : le statut juridique vient des `details`
 * de l'actif immobilier lié (créé à la volée si besoin). Sans agence ou sans
 * actif, le statut est inconnu : la fiabilité est plafonnée en conséquence.
 */
export async function storedPropertyReliability(
  client: PropertyReliabilityClient,
  tenantId: string,
  propertyId: string,
  line: { method: ValuationMethodKey; valuatedAt: Date; source: string | null }
): Promise<{ reliability: Reliability; reliabilityReasons: ReliabilityReason[] }> {
  const asset = await ensurePropertyAsset(client, tenantId, propertyId);
  const row = asset
    ? await client.asset.findFirst({ where: { id: asset.id, tenantId }, select: { details: true } })
    : null;
  return computeStoredReliability({ assetClass: 'REAL_ESTATE', details: row?.details ?? {} }, line);
}
