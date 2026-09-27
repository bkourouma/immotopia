import { z } from 'zod';
import { prisma } from '../../utils/database';
import { NotFoundError } from '../../middleware/error-middleware';
import { privateUploadPath, readPrivateUpload, type PrivateFile } from '../files/private-files';

/**
 * Justificatifs de la gestion locative, jamais servis en statique
 * (`/uploads/portal/...` et `/uploads/rental/...` répondent 404,
 * middleware/uploads-access-middleware.ts) :
 *
 *   - preuve jointe par un locataire à une déclaration de paiement
 *     (`RentalPaymentDeclaration.proof_file_url`, `uploads/portal/payments/<agence>/`) :
 *     `GET /api/tenants/:tenantId/rental/payment-declarations/:declarationId/proof`,
 *     permission `RENTAL_PAYMENTS_VIEW` ;
 *   - pièce justificative d'une pénalité ajustée (`override_reason.justification`,
 *     `uploads/rental/penalties/<pénalité>/`) :
 *     `GET /api/tenants/:tenantId/rental/penalties/:penaltyId/justification`,
 *     permission `RENTAL_PENALTIES_VIEW`.
 *
 * L'objet doit appartenir à l'agence ; sinon, comme pour un identifiant
 * inconnu ou mal formé, 404. Aucun portail n'affiche ces fichiers.
 */

const uuid = z.string().uuid();

export async function getPaymentDeclarationProofForTenant(
  tenantId: string,
  declarationId: string
): Promise<PrivateFile> {
  const NOT_FOUND = 'Preuve de paiement introuvable.';
  if (!uuid.safeParse(declarationId).success) throw new NotFoundError(NOT_FOUND);

  const declaration = await prisma.rentalPaymentDeclaration.findFirst({
    where: { id: declarationId, tenant_id: tenantId },
    select: { tenant_id: true, proof_file_url: true }
  });
  if (!declaration) throw new NotFoundError(NOT_FOUND);

  const relative = privateUploadPath(declaration.proof_file_url, ['portal', 'payments', declaration.tenant_id]);
  const storedName = relative?.split('/').pop();
  return readPrivateUpload(relative, storedName ? `preuve-paiement-${storedName}` : null, NOT_FOUND);
}

/** `override_reason` porte un JSON `{ reason, justification: { fileUrl, fileName } }`, ou du texte libre. */
function readJustification(overrideReason: string | null): { fileUrl?: string; fileName?: string } | null {
  if (!overrideReason) return null;
  try {
    const parsed = JSON.parse(overrideReason);
    const justification = parsed?.justification;
    return justification && typeof justification === 'object' ? justification : null;
  } catch {
    return null;
  }
}

export async function getPenaltyJustificationForTenant(tenantId: string, penaltyId: string): Promise<PrivateFile> {
  const NOT_FOUND = 'Justificatif introuvable.';
  if (!uuid.safeParse(penaltyId).success) throw new NotFoundError(NOT_FOUND);

  const penalty = await prisma.rentalPenalty.findFirst({
    where: { id: penaltyId, tenant_id: tenantId },
    select: { id: true, override_reason: true }
  });
  if (!penalty) throw new NotFoundError(NOT_FOUND);

  const justification = readJustification(penalty.override_reason);
  return readPrivateUpload(
    privateUploadPath(justification?.fileUrl, ['rental', 'penalties', penalty.id]),
    justification?.fileName,
    NOT_FOUND
  );
}
