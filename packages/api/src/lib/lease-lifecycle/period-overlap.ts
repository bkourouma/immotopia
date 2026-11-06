import { RentalLeaseStatus } from '@prisma/client';
import type { PrismaTransactionClient } from '../../utils/database';
import { ConflictError } from '../../middleware/error-middleware';
import { t } from '../../i18n';

/**
 * Un bien n'a pas deux baux en cours sur la même période (hypothèse H39,
 * BUG-2026-11-04-059).
 *
 * Le contrôle lit les baux ACTIVE et SUSPENDED du bien, dans l'agence : le statut
 * « Loué » du bien n'y entre pas, il peut être désynchronisé. Les baux terminés,
 * annulés ou en brouillon ne comptent pas. Un bail qui commence le jour où un
 * autre finit n'est pas un chevauchement (fin exclusive). Le modèle `RentalLease`
 * n'a pas de champ d'unité : le bien est la maille.
 *
 * À appeler DANS la transaction qui écrit le bail : la ligne du bien est verrouillée
 * (`SELECT … FOR UPDATE`) pour que deux écritures simultanées sur le même bien
 * passent l'une après l'autre au lieu de passer ensemble.
 */
export async function assertNoLeaseOverlapTx(
  tx: PrismaTransactionClient,
  params: {
    tenantId: string;
    propertyId: string;
    startDate: Date;
    endDate: Date | null;
    /** Le bail lui-même, quand on en modifie ou réactive un. */
    excludeLeaseId?: string;
  }
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM properties WHERE id = ${params.propertyId} FOR UPDATE`;

  const overlapping = await tx.rentalLease.findFirst({
    where: {
      tenant_id: params.tenantId,
      property_id: params.propertyId,
      status: { in: [RentalLeaseStatus.ACTIVE, RentalLeaseStatus.SUSPENDED] },
      ...(params.excludeLeaseId ? { id: { not: params.excludeLeaseId } } : {}),
      // [début, fin ou infini[ de l'existant contre celui du bail écrit.
      AND: [
        params.endDate ? { start_date: { lt: params.endDate } } : {},
        { OR: [{ end_date: null }, { end_date: { gt: params.startDate } }] }
      ]
    },
    select: { id: true }
  });

  if (overlapping) {
    throw new ConflictError(t('Ce bien a déjà un bail en cours sur cette période.'));
  }
}
