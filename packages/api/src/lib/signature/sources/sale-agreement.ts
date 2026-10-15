import { BadRequestError, NotFoundError } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';
import { prisma, type PrismaTransactionClient } from '../../../utils/database';
import { assertBelongsToTenant } from '../../../utils/tenant-ownership';
import { agreementNumber } from '../../sales/numbering';
import { isUuid } from './guards';
import { registerSignatureSource } from './registry';
import { SourceChangedError, type DefaultSigner, type SignatureDocumentSource } from './types';

/**
 * Source « compromis de vente » (SALE_AGREEMENT, spec 044 lot S4). Le PDF est
 * généré à la volée (`lib/sales/agreement-pdf`) ; son empreinte de données
 * (`snapshotHash`) sert de repère : tout changement du compromis après l'envoi
 * l'invalide (`isSourceIntact`, et annulation active depuis `lib/sales/agreements`).
 *
 * SG-R1 : l'exigence d'un prestataire qualifié n'est plus portée par la source : le noyau
 * lit `SIGNATURE_PROVIDER_REQUIRED_KINDS` (défaut : ce type) pour TOUS les types.
 */

/** Empreinte des données imprimées, ou `null` si le compromis, son offre, son mandat ou son bien a disparu. */
async function fingerprintOf(tenantId: string, agreementId: string, client?: PrismaTransactionClient) {
  if (!isUuid(agreementId)) return null;
  const { loadAgreementPdfData, agreementFingerprint } = await import('../../sales/agreement-pdf');
  try {
    return agreementFingerprint(await loadAgreementPdfData(tenantId, agreementId, client));
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

/** Contact CRM lié à un client (`TenantClient.details.crmContactId`), s'il existe. */
function crmContactIdOf(details: unknown): string | null {
  const id = (details as { crmContactId?: unknown } | null)?.crmContactId;
  return typeof id === 'string' && id ? id : null;
}

const nameOf = (user: { fullName: string | null; email: string } | null | undefined): string =>
  user?.fullName || user?.email || '';

export const saleAgreementSource: SignatureDocumentSource = {
  kind: 'SALE_AGREEMENT',
  targetType: 'SaleAgreement',
  viewPermission: 'CRM_DEALS_VIEW',
  editPermission: 'CRM_DEALS_EDIT',
  feature: 'SALES',

  async assertTarget(ctx, targetId) {
    if (!isUuid(targetId)) throw new NotFoundError(t('Compromis introuvable.'));
    await assertBelongsToTenant(prisma, 'saleAgreement', targetId, ctx.tenantId, {
      message: t('Compromis introuvable.')
    });
    const agreement = await prisma.saleAgreement.findFirst({
      where: { id: targetId, tenantId: ctx.tenantId },
      select: { status: true }
    });
    if (!agreement) throw new NotFoundError(t('Compromis introuvable.'));
    if (agreement.status !== 'DRAFT') {
      throw new BadRequestError(
        t('Seul un compromis en brouillon peut être envoyé en signature : celui-ci est déjà signé, conclu ou annulé.')
      );
    }
  },

  async loadSource(ctx, targetId) {
    const agreement = await prisma.saleAgreement.findFirst({
      where: { id: targetId, tenantId: ctx.tenantId },
      select: { year: true, sequence: true }
    });
    if (!agreement) throw new NotFoundError(t('Compromis introuvable.'));
    const { loadAgreementPdfData, agreementFingerprint, renderSaleAgreementPdf } =
      await import('../../sales/agreement-pdf');
    const { resolveDocumentBranding } = await import('../../documents/document-branding');
    // Une seule lecture : le PDF et son empreinte viennent des MÊMES données.
    const data = await loadAgreementPdfData(ctx.tenantId, targetId);
    const branding = await resolveDocumentBranding(ctx.tenantId, null);
    return {
      documentId: null,
      documentHash: agreementFingerprint(data),
      pdf: await renderSaleAgreementPdf(data, branding),
      title: t('Compromis de vente {{number}}', { number: agreementNumber(agreement.year, agreement.sequence) })
    };
  },

  async snapshotHash(ctx, targetId) {
    return fingerprintOf(ctx.tenantId, targetId);
  },

  /** SG-R2 : compromis toujours en brouillon et données imprimées inchangées depuis l'envoi. */
  async isSourceIntact(request) {
    if (!isUuid(request.targetId)) return false;
    const agreement = await prisma.saleAgreement.findFirst({
      where: { id: request.targetId, tenantId: request.tenantId },
      select: { status: true }
    });
    if (!agreement || agreement.status !== 'DRAFT') return false;
    if (!request.sourceDocHash) return true;
    // Offre, mandat ou bien disparu : l'empreinte est nulle, donc différente (false, jamais une erreur).
    return (await fingerprintOf(request.tenantId, request.targetId)) === request.sourceDocHash;
  },

  /**
   * Même transition que `signAgreement` (DRAFT -> SIGNED, bien en UNDER_OFFER),
   * `signedAt` = date du scellement, dans la transaction du scellement. Idempotente :
   * un compromis déjà signé (scellement rejoué) ou annulé n'est pas touché.
   */
  async onSealed(tx, request, now) {
    if (!isUuid(request.targetId)) throw new SourceChangedError();
    const { markAgreementSignedTx } = await import('../../sales/agreement-sign');
    const created = await tx.signatureRequest.findFirst({
      where: { id: request.id, tenantId: request.tenantId },
      select: { createdByUserId: true }
    });
    if (!created) throw new SourceChangedError();
    // Données relues DANS la transaction : un compromis modifié depuis l'envoi n'est pas marqué signé.
    if (request.sourceDocHash) {
      const current = await fingerprintOf(request.tenantId, request.targetId, tx);
      if (current !== request.sourceDocHash) throw new SourceChangedError();
    }
    const signed = await markAgreementSignedTx(tx, {
      tenantId: request.tenantId,
      agreementId: request.targetId,
      actorUserId: created.createdByUserId,
      signedAt: now,
      // Le scellement ne doit jamais échouer en boucle : statut du bien incompatible = audit à régulariser.
      tolerateStatusConflict: true
    });
    // Plus en brouillon (annulé, déjà signé à la main) : le document a changé depuis l'envoi.
    if (!signed) throw new SourceChangedError();
  },

  /** Vendeur (compte client de l'agence, contact CRM de même e-mail), acquéreur (contact CRM), agent du mandat. */
  async defaultSigners(ctx, targetId) {
    if (!isUuid(targetId)) throw new NotFoundError(t('Compromis introuvable.'));
    const agreement = await prisma.saleAgreement.findFirst({
      where: { id: targetId, tenantId: ctx.tenantId },
      select: { offerId: true, mandateId: true }
    });
    if (!agreement) throw new NotFoundError(t('Compromis introuvable.'));
    const [offer, mandate] = await Promise.all([
      prisma.saleOffer.findFirst({
        where: { id: agreement.offerId, tenantId: ctx.tenantId },
        select: { buyerContactId: true }
      }),
      prisma.saleMandate.findFirst({
        where: { id: agreement.mandateId, tenantId: ctx.tenantId },
        select: { sellerClientId: true, agentUserId: true }
      })
    ]);
    const signers: DefaultSigner[] = [];

    const seller = mandate
      ? await prisma.tenantClient.findFirst({
          where: { id: mandate.sellerClientId, tenantId: ctx.tenantId },
          select: { details: true, user: { select: { fullName: true, email: true } } }
        })
      : null;
    if (seller) {
      // Rapprochement par le lien du client (details.crmContactId), jamais par l'e-mail : sans lien, ni téléphone ni WhatsApp.
      const linkedId = crmContactIdOf(seller.details);
      const contact = linkedId
        ? await prisma.crmContact.findFirst({
            where: { id: linkedId, tenantId: ctx.tenantId },
            select: { id: true, phonePrimary: true, whatsappNumber: true }
          })
        : null;
      signers.push({
        role: 'VENDEUR',
        fullName: nameOf(seller.user),
        email: seller.user.email,
        phone: contact?.whatsappNumber ?? contact?.phonePrimary ?? null,
        contactId: contact?.id ?? null
      });
    }

    const buyer = offer
      ? await prisma.crmContact.findFirst({
          where: { id: offer.buyerContactId, tenantId: ctx.tenantId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            legalName: true,
            email: true,
            phonePrimary: true,
            whatsappNumber: true
          }
        })
      : null;
    if (buyer) {
      signers.push({
        role: 'ACQUEREUR',
        fullName: buyer.legalName || `${buyer.firstName} ${buyer.lastName}`.trim(),
        email: buyer.email,
        phone: buyer.whatsappNumber ?? buyer.phonePrimary ?? null,
        contactId: buyer.id
      });
    }

    // Négociateur du mandat, à défaut l'agent qui ouvre l'écran (comme le mandat de vente).
    {
      const agent = await prisma.user.findFirst({
        where: { id: mandate?.agentUserId ?? ctx.userId },
        select: { fullName: true, email: true }
      });
      if (agent) {
        signers.push({ role: 'AGENT', fullName: nameOf(agent), email: agent.email, phone: null, contactId: null });
      }
    }
    return signers;
  }
};

registerSignatureSource(saleAgreementSource);
