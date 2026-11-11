import { prisma } from '../../../utils/database';
import { t } from '../../../i18n';
import { AppError, ErrorCode } from '../../../middleware/error-middleware';

/**
 * Une déclaration de paiement (mobile money déclaré) en attente de validation bloque
 * le paiement en ligne de la même échéance : sans cela, le locataire pourrait payer
 * deux fois (déclaré puis en ligne). Lecture seule de `RentalPaymentDeclaration`.
 *
 * « Récente » = créée il y a moins de 7 jours (même fenêtre que l'exclusion de relance
 * `PENDING_DECLARATION`). Une déclaration sans échéance couvre tout le bail.
 */
export const PENDING_DECLARATION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function assertNoPendingDeclaration(
  tenantId: string,
  leaseId: string,
  installmentIds: string[],
  now: Date = new Date()
): Promise<void> {
  const since = new Date(now.getTime() - PENDING_DECLARATION_WINDOW_MS);
  const found = await prisma.rentalPaymentDeclaration.findFirst({
    where: {
      tenant_id: tenantId,
      lease_id: leaseId,
      status: 'PENDING',
      created_at: { gte: since },
      OR: [{ installment_id: { in: installmentIds } }, { installment_id: null }]
    },
    select: { id: true }
  });
  if (found) {
    throw new AppError(
      t(
        'Une déclaration de paiement est en attente de validation pour cette échéance : le paiement en ligne est momentanément indisponible.'
      ),
      409,
      ErrorCode.CONFLICT
    );
  }
}
