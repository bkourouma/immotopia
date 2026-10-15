import { BadRequestError, ConflictError, NotFoundError } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';
import { prisma } from '../../../utils/database';
import { assertBelongsToTenant } from '../../../utils/tenant-ownership';
import { registerSignatureSource } from './registry';
import { SourceChangedError, type DefaultSigner, type SignatureDocumentSource } from './types';

/**
 * Source « mandat de gestion » (MANAGEMENT_MANDATE, spec 043 lot S2) : le PDF est
 * généré à la volée depuis le `PropertyMandate` (`lib/properties/management-mandate-pdf`),
 * sans fichier stocké. Le mandat porte `signed_at` et `signature_request_id`
 * une fois scellé. L'empreinte des données (`snapshotHash`) détecte une
 * modification du mandat après l'envoi (SG-R2).
 *
 * Le générateur de PDF est importé à l'usage (module lourd : pdf-lib, images).
 */
const notFound = () => new NotFoundError(t('Mandat de gestion introuvable.'));

function userSigner(
  role: string,
  user: { fullName: string | null; email: string | null } | null | undefined,
  contactId: string | null = null
): DefaultSigner[] {
  return user ? [{ role, fullName: user.fullName ?? '', email: user.email, phone: null, contactId }] : [];
}

export const managementMandateSource: SignatureDocumentSource = {
  kind: 'MANAGEMENT_MANDATE',
  targetType: 'PropertyMandate',
  viewPermission: 'PROPERTIES_VIEW',
  editPermission: 'PROPERTIES_EDIT',
  feature: 'CORE',

  async assertTarget(ctx, targetId) {
    await assertBelongsToTenant(prisma, 'propertyMandate', targetId, ctx.tenantId, {
      message: t('Mandat de gestion introuvable.')
    });
    const mandate = await prisma.propertyMandate.findFirst({
      where: { id: targetId, tenantId: ctx.tenantId },
      select: { isActive: true, revokedAt: true, signedAt: true }
    });
    if (!mandate) throw notFound();
    if (!mandate.isActive || mandate.revokedAt) {
      throw new BadRequestError(t('Ce mandat est révoqué : il ne peut plus être envoyé en signature.'));
    }
    if (mandate.signedAt) {
      throw new ConflictError(
        t('Ce mandat est déjà signé : il ne peut pas être envoyé une seconde fois en signature.')
      );
    }
  },

  async loadSource(ctx, targetId) {
    const { renderManagementMandatePdf, managementMandateSnapshot } =
      await import('../../properties/management-mandate-pdf');
    const rendered = await renderManagementMandatePdf(ctx.tenantId, targetId);
    if (!rendered) throw notFound();
    return {
      documentId: null,
      // Empreinte des données qui ont servi à ce rendu (jamais une seconde lecture).
      documentHash: managementMandateSnapshot(rendered.data),
      pdf: rendered.pdf,
      title: t('Mandat de gestion - {{property}}', { property: rendered.data.property.title })
    };
  },

  /** Empreinte des données du mandat (et des honoraires du propriétaire) lues pour le PDF. */
  async snapshotHash(ctx, targetId) {
    const { loadManagementMandateData, managementMandateSnapshot } =
      await import('../../properties/management-mandate-pdf');
    const data = await loadManagementMandateData(ctx.tenantId, targetId);
    return data ? managementMandateSnapshot(data) : null;
  },

  /** SG-R2 : mandat toujours actif et données inchangées depuis l'envoi. */
  async isSourceIntact(request) {
    const mandate = await prisma.propertyMandate.findFirst({
      where: { id: request.targetId, tenantId: request.tenantId },
      select: { isActive: true, revokedAt: true }
    });
    if (!mandate || !mandate.isActive || mandate.revokedAt) return false;
    if (!request.sourceDocHash) return true;
    const { loadManagementMandateData, managementMandateSnapshot } =
      await import('../../properties/management-mandate-pdf');
    const data = await loadManagementMandateData(request.tenantId, request.targetId);
    return data !== null && managementMandateSnapshot(data) === request.sourceDocHash;
  },

  /**
   * Marque le mandat signé DANS la transaction du scellement, après avoir relu ses données
   * et recalculé l'empreinte : un mandat modifié ou révoqué depuis l'envoi n'est pas marqué
   * (SourceChangedError : le noyau annule la demande). Pas d'onCancel : `signedAt` n'est posé
   * qu'au scellement, et une demande scellée ne s'annule plus.
   */
  async onSealed(tx, request, now) {
    const { loadManagementMandateData, managementMandateSnapshot } =
      await import('../../properties/management-mandate-pdf');
    const data = await loadManagementMandateData(request.tenantId, request.targetId, tx);
    if (!data || !data.isActive) throw new SourceChangedError();
    if (request.sourceDocHash && managementMandateSnapshot(data) !== request.sourceDocHash) {
      throw new SourceChangedError();
    }
    await tx.propertyMandate.updateMany({
      where: { id: request.targetId, tenantId: request.tenantId },
      data: { signedAt: now, signatureRequestId: request.id }
    });
  },

  /** Mandant (propriétaire du bien, avec son contact CRM) puis agent qui envoie. */
  async defaultSigners(ctx, targetId) {
    const mandate = await prisma.propertyMandate.findFirst({
      where: { id: targetId, tenantId: ctx.tenantId },
      select: { ownerUserId: true, owner: { select: { fullName: true, email: true } } }
    });
    if (!mandate) throw notFound();
    const [client, agent] = await Promise.all([
      prisma.tenantClient.findFirst({
        where: { tenantId: ctx.tenantId, userId: mandate.ownerUserId },
        select: { details: true }
      }),
      prisma.user.findUnique({ where: { id: ctx.userId }, select: { fullName: true, email: true } })
    ]);
    const crmContactId = ((client?.details ?? {}) as { crmContactId?: string }).crmContactId ?? null;
    return [...userSigner('MANDANT', mandate.owner, crmContactId), ...userSigner('AGENT', agent)];
  }
};

registerSignatureSource(managementMandateSource);
