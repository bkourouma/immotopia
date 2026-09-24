import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../utils/database';
import { badRequest, notFound } from '../errors';
import { roundMoney } from '../finance/money';
import { listAgencyOwners } from '../owner-account/sync';

/**
 * Indivision d'un bien — lot 4 : les quotes-parts de ses propriétaires.
 *
 * Enregistrer les quotes-parts ne touche aucun compte : chaque compte
 * propriétaire se recalcule à sa prochaine consultation (`syncOwnerAccount`),
 * qui contre-passe l'ancienne répartition et inscrit la nouvelle. Les
 * reversements déjà faits ne bougent pas.
 */

const nameOf = (user: { fullName: string | null; email: string | null }) =>
  user.fullName || user.email || 'Propriétaire';

async function assertProperty(tenantId: string, propertyId: string) {
  const property = await prisma.property.findFirst({ where: { id: propertyId, tenantId }, select: { id: true } });
  if (!property) throw notFound('Bien introuvable');
}

export async function getPropertyOwnership(tenantId: string, propertyId: string) {
  await assertProperty(tenantId, propertyId);

  const [shares, leaseOwners, owners] = await Promise.all([
    prisma.propertyOwnershipShare.findMany({
      where: { tenantId, propertyId },
      select: {
        ownerClientId: true,
        sharePercent: true,
        ownerClient: { select: { user: { select: { fullName: true, email: true } } } }
      },
      orderBy: { sharePercent: 'desc' }
    }),
    prisma.rentalLease.findMany({
      where: { tenant_id: tenantId, property_id: propertyId, owner_client_id: { not: null } },
      select: { ownerClient: { select: { id: true, user: { select: { fullName: true, email: true } } } } },
      distinct: ['owner_client_id']
    }),
    listAgencyOwners(tenantId)
  ]);

  // Un propriétaire unique sur les baux du bien sert de proposition de départ.
  const distinct = leaseOwners.map(l => l.ownerClient).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const leaseOwner =
    distinct.length === 1 ? { ownerClientId: distinct[0].id, ownerName: nameOf(distinct[0].user) } : null;

  return {
    propertyId,
    leaseOwner,
    shares: shares.map(s => ({
      ownerClientId: s.ownerClientId,
      ownerName: nameOf(s.ownerClient.user),
      email: s.ownerClient.user.email ?? null,
      sharePercent: Number(s.sharePercent)
    })),
    owners: owners.map(o => ({ ownerClientId: o.id, ownerName: nameOf(o.user), email: o.user.email ?? null }))
  };
}

const sharesSchema = z.object({
  shares: z
    .array(
      z.object({
        ownerClientId: z.string().min(1),
        sharePercent: z.coerce
          .number()
          .positive('Chaque quote-part doit être strictement positive')
          .max(100)
          .refine(v => Number(v.toFixed(4)) === v, 'Une quote-part a au plus 4 décimales')
      })
    )
    .max(50)
});

export async function setPropertyOwnership(tenantId: string, propertyId: string, body: unknown, userId?: string) {
  const { shares } = sharesSchema.parse(body);
  await assertProperty(tenantId, propertyId);

  if (shares.length) {
    const ids = shares.map(s => s.ownerClientId);
    if (new Set(ids).size !== ids.length) throw badRequest('Un même propriétaire apparaît deux fois');
    const total = roundMoney(shares.reduce((sum, s) => sum + s.sharePercent, 0) * 10000) / 10000;
    if (Math.abs(total - 100) > 0.0001) {
      throw badRequest(`Les quotes-parts doivent totaliser 100 % (actuellement ${String(total).replace('.', ',')} %).`);
    }
    const known = await prisma.tenantClient.count({ where: { tenantId, id: { in: ids } } });
    if (known !== ids.length) throw badRequest('Un propriétaire choisi n’appartient pas à cette agence');
  }

  await prisma.$transaction(async tx => {
    await tx.propertyOwnershipShare.deleteMany({ where: { tenantId, propertyId } });
    if (shares.length) {
      await tx.propertyOwnershipShare.createMany({
        data: shares.map(s => ({
          tenantId,
          propertyId,
          ownerClientId: s.ownerClientId,
          sharePercent: new Prisma.Decimal(s.sharePercent),
          updatedByUserId: userId ?? null
        }))
      });
    }
  });
  return getPropertyOwnership(tenantId, propertyId);
}

/**
 * Quote-part d'un propriétaire dans chaque bien en indivision, pour le relevé
 * de gérance. Un bien absent de la table appartient en entier à son
 * propriétaire désigné.
 */
export async function ownerSharesByProperty(tenantId: string, ownerClientId: string, propertyIds: string[]) {
  if (!propertyIds.length) return new Map<string, number>();
  const rows = await prisma.propertyOwnershipShare.findMany({
    where: { tenantId, propertyId: { in: propertyIds } },
    select: { propertyId: true, ownerClientId: true, sharePercent: true }
  });
  const result = new Map<string, number>();
  for (const row of rows) {
    if (!result.has(row.propertyId)) result.set(row.propertyId, 0);
    if (row.ownerClientId === ownerClientId) result.set(row.propertyId, Number(row.sharePercent));
  }
  return result;
}
