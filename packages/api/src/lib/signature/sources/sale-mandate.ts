import { BadRequestError, ConflictError, NotFoundError } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';
import { prisma } from '../../../utils/database';
import { assertBelongsToTenant } from '../../../utils/tenant-ownership';
import { isUuid } from './guards';
import { registerSignatureSource } from './registry';
import { SourceChangedError, type DefaultSigner, type SignatureDocumentSource } from './types';

/**
 * Source « mandat de vente » (SALE_MANDATE, spec 044 lot S2) : le PDF est généré à
 * la volée depuis le `SaleMandate` (`lib/sales/mandate-pdf`), sans fichier stocké
 * et sans jamais lire le prix plancher. Le mandat porte `signed_at` et
 * `signature_request_id` une fois scellé ; l'empreinte des données détecte une
 * modification après l'envoi (SG-R2).
 *
 * Le générateur de PDF est importé à l'usage (module lourd : pdf-lib, images).
 */
const notFound = () => new NotFoundError(t('Mandat de vente introuvable.'));

type Person = { fullName: string | null; email: string | null };

function signer(role: string, user: Person | null | undefined, details?: unknown): DefaultSigner[] {
  if (!user) return [];
  const contactId = ((details ?? {}) as { crmContactId?: string }).crmContactId ?? null;
  return [{ role, fullName: user.fullName ?? '', email: user.email, phone: null, contactId }];
}

export const saleMandateSource: SignatureDocumentSource = {
  kind: 'SALE_MANDATE',
  targetType: 'SaleMandate',
  viewPermission: 'CRM_DEALS_VIEW',
  editPermission: 'CRM_DEALS_EDIT',
  feature: 'SALES',

  async assertTarget(ctx, targetId) {
    // La colonne est un UUID : un autre format est une cible inconnue, pas une erreur de base.
    if (!isUuid(targetId)) throw notFound();
    await assertBelongsToTenant(prisma, 'saleMandate', targetId, ctx.tenantId, {
      message: t('Mandat de vente introuvable.')
    });
    const mandate = await prisma.saleMandate.findFirst({
      where: { id: targetId, tenantId: ctx.tenantId },
      select: { status: true, revokedAt: true, signedAt: true }
    });
    if (!mandate) throw notFound();
    if (mandate.status !== 'ACTIVE' || mandate.revokedAt) {
      throw new BadRequestError(t("Ce mandat de vente n'est plus actif : il ne peut plus être envoyé en signature."));
    }
    if (mandate.signedAt) {
      throw new ConflictError(
        t('Ce mandat est déjà signé : il ne peut pas être envoyé une seconde fois en signature.')
      );
    }
  },

  async loadSource(ctx, targetId) {
    const { renderSaleMandatePdf, saleMandateSnapshot } = await import('../../sales/mandate-pdf');
    const rendered = await renderSaleMandatePdf(ctx.tenantId, targetId);
    if (!rendered) throw notFound();
    return {
      documentId: null,
      // Empreinte des données qui ont servi à ce rendu (jamais une seconde lecture).
      documentHash: saleMandateSnapshot(rendered.data),
      pdf: rendered.pdf,
      title: t('Mandat de vente {{number}}', { number: rendered.data.number })
    };
  },

  async snapshotHash(ctx, targetId) {
    const { loadSaleMandateData, saleMandateSnapshot } = await import('../../sales/mandate-pdf');
    const data = await loadSaleMandateData(ctx.tenantId, targetId);
    return data ? saleMandateSnapshot(data) : null;
  },

  /** SG-R2 : mandat toujours actif et données inchangées depuis l'envoi. */
  async isSourceIntact(request) {
    if (!isUuid(request.targetId)) return false;
    const mandate = await prisma.saleMandate.findFirst({
      where: { id: request.targetId, tenantId: request.tenantId },
      select: { status: true, revokedAt: true }
    });
    if (!mandate || mandate.status !== 'ACTIVE' || mandate.revokedAt) return false;
    if (!request.sourceDocHash) return true;
    const { loadSaleMandateData, saleMandateSnapshot } = await import('../../sales/mandate-pdf');
    const data = await loadSaleMandateData(request.tenantId, request.targetId);
    return data !== null && saleMandateSnapshot(data) === request.sourceDocHash;
  },

  /**
   * Marque le mandat signé DANS la transaction du scellement, après avoir relu ses données
   * et recalculé l'empreinte : un mandat modifié ou révoqué depuis l'envoi n'est pas marqué
   * (SourceChangedError : le noyau annule la demande). Pas d'onCancel : `signedAt` n'est posé
   * qu'au scellement, et une demande scellée ne s'annule plus.
   */
  async onSealed(tx, request, now) {
    if (!isUuid(request.targetId)) throw new SourceChangedError();
    const { loadSaleMandateData, saleMandateSnapshot } = await import('../../sales/mandate-pdf');
    const data = await loadSaleMandateData(request.tenantId, request.targetId, tx);
    if (!data || data.status !== 'ACTIVE') throw new SourceChangedError();
    if (request.sourceDocHash && saleMandateSnapshot(data) !== request.sourceDocHash) throw new SourceChangedError();
    await tx.saleMandate.updateMany({
      where: { id: request.targetId, tenantId: request.tenantId },
      data: { signedAt: now, signatureRequestId: request.id }
    });
  },

  /** Vendeur, co-vendeurs (indivision) puis négociateur du mandat (à défaut, l'agent qui envoie). */
  async defaultSigners(ctx, targetId) {
    if (!isUuid(targetId)) throw notFound();
    const mandate = await prisma.saleMandate.findFirst({
      where: { id: targetId, tenantId: ctx.tenantId },
      select: {
        propertyId: true,
        sellerClientId: true,
        agentUserId: true,
        sellerClient: { select: { details: true, user: { select: { fullName: true, email: true } } } }
      }
    });
    if (!mandate) throw notFound();
    const [shares, agent] = await Promise.all([
      prisma.propertyOwnershipShare.findMany({
        where: {
          tenantId: ctx.tenantId,
          propertyId: mandate.propertyId,
          ownerClientId: { not: mandate.sellerClientId }
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { ownerClient: { select: { details: true, user: { select: { fullName: true, email: true } } } } }
      }),
      prisma.user.findUnique({
        where: { id: mandate.agentUserId ?? ctx.userId },
        select: { fullName: true, email: true }
      })
    ]);
    return [
      ...signer('VENDEUR', mandate.sellerClient.user, mandate.sellerClient.details),
      ...shares.flatMap(share => signer('COVENDEUR', share.ownerClient.user, share.ownerClient.details)),
      ...signer('AGENT', agent)
    ];
  }
};

registerSignatureSource(saleMandateSource);
