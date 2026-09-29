import { Prisma } from '@prisma/client';

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
 * - Idempotente : upsert par `propertyId` (unique) ; sur course (P2002),
 *   l'actif du concurrent est relu, jamais de doublon ni d'échec.
 * - No-op silencieux (retourne `null`) si le bien est sans agence ou
 *   n'appartient pas à `tenantId`.
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

  const existing = await client.asset.findUnique({ where: { propertyId }, select: { id: true } });
  if (existing) return existing;

  try {
    return await client.asset.upsert({
      where: { propertyId },
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
      return client.asset.findUnique({ where: { propertyId }, select: { id: true } });
    }
    throw error;
  }
}
