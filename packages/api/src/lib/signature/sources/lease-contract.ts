import { AppError, BadRequestError, NotFoundError } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';
import { prisma } from '../../../utils/database';
import { assertBelongsToTenant } from '../../../utils/tenant-ownership';
import { registerSignatureSource } from './registry';
import type { SignatureDocumentSource } from './types';

/**
 * Source « bail » (LEASE_CONTRACT, spec 044 lot S1) : le dernier `RentalDocument`
 * FINAL de type LEASE_CONTRACT du bail, DOCX converti en PDF. Le bail porte
 * `signed_at` et `signature_request_id` une fois scellé.
 *
 * `document-generation-service` et `lib/pdf-convert` sont importés à l'usage : le
 * premier importe lui-même l'annulation des demandes (cycle d'imports sinon).
 */
export const leaseContractSource: SignatureDocumentSource = {
  kind: 'LEASE_CONTRACT',
  targetType: 'RentalLease',
  viewPermission: 'RENTAL_LEASES_VIEW',
  editPermission: 'RENTAL_LEASES_EDIT',
  feature: 'RENTAL',

  async assertTarget(ctx, targetId) {
    await assertBelongsToTenant(prisma, 'rentalLease', targetId, ctx.tenantId, {
      tenantField: 'tenant_id',
      message: t('Bail introuvable.')
    });
    const lease = await prisma.rentalLease.findFirst({
      where: { id: targetId, tenant_id: ctx.tenantId },
      select: { id: true, status: true }
    });
    if (!lease) throw new NotFoundError(t('Bail introuvable.'));
    if (lease.status === 'CANCELED' || lease.status === 'ENDED') {
      throw new BadRequestError(t('Ce bail est terminé ou annulé : il ne peut plus être envoyé en signature.'));
    }
  },

  async loadSource(ctx, targetId) {
    const lease = await prisma.rentalLease.findFirst({
      where: { id: targetId, tenant_id: ctx.tenantId },
      select: { id: true, lease_number: true }
    });
    if (!lease) throw new NotFoundError(t('Bail introuvable.'));
    const document = await prisma.rentalDocument.findFirst({
      where: { tenant_id: ctx.tenantId, lease_id: lease.id, type: 'LEASE_CONTRACT', status: 'FINAL' },
      orderBy: { created_at: 'desc' },
      select: { id: true, mime_type: true, file_hash: true }
    });
    if (!document) {
      throw new BadRequestError(
        t("Aucun contrat n'a été généré pour ce bail : générez le contrat avant de l'envoyer en signature.")
      );
    }
    const { getDocumentFile } = await import('../../../services/document-generation-service');
    const { convertDocxToPdf } = await import('../../pdf-convert');
    const file = await getDocumentFile(ctx.tenantId, document.id);
    const pdf = document.mime_type === 'application/pdf' ? file : await convertDocxToPdf(file);
    if (pdf.subarray(0, 4).toString('latin1') !== '%PDF') {
      throw new AppError(t('La conversion du contrat en PDF a échoué.'), 502, 'SERVICE_UNAVAILABLE');
    }
    return {
      documentId: document.id,
      documentHash: document.file_hash ?? null,
      pdf,
      title: t('Contrat de bail {{number}}', { number: lease.lease_number })
    };
  },

  /** Locataire, co-locataires et bailleur du bail (e-mail de leur compte). */
  async defaultSigners(ctx, targetId) {
    const lease = await prisma.rentalLease.findFirst({
      where: { id: targetId, tenant_id: ctx.tenantId },
      select: {
        primaryRenter: { select: { user: { select: { fullName: true, email: true } } } },
        ownerClient: { select: { user: { select: { fullName: true, email: true } } } },
        coRenters: { select: { renterClient: { select: { user: { select: { fullName: true, email: true } } } } } }
      }
    });
    if (!lease) throw new NotFoundError(t('Bail introuvable.'));
    const signer = (role: string, user: { fullName: string | null; email: string | null } | undefined | null) =>
      user ? [{ role, fullName: user.fullName ?? '', email: user.email, phone: null, contactId: null }] : [];
    return [
      ...signer('LOCATAIRE', lease.primaryRenter?.user),
      ...lease.coRenters.flatMap(co => signer('CO_LOCATAIRE', co.renterClient?.user)),
      ...signer('BAILLEUR', lease.ownerClient?.user)
    ];
  },

  /** SG-R2 : contrat toujours FINAL et DOCX inchangé depuis l'envoi. */
  async isSourceIntact(request) {
    if (!request.sourceDocumentId) return true;
    const document = await prisma.rentalDocument.findFirst({
      where: { id: request.sourceDocumentId, tenant_id: request.tenantId },
      select: { status: true, file_hash: true }
    });
    if (!document || document.status !== 'FINAL') return false;
    return !(request.sourceDocHash && document.file_hash !== request.sourceDocHash);
  },

  async onSealed(tx, request, now) {
    await tx.rentalLease.updateMany({
      where: { id: request.targetId, tenant_id: request.tenantId },
      data: { signed_at: now, signature_request_id: request.id }
    });
  }
};

registerSignatureSource(leaseContractSource);
