import { BadRequestError, ConflictError, NotFoundError } from '../../../middleware/error-middleware';
import { t } from '../../../i18n';
import { prisma } from '../../../utils/database';
import { assertBelongsToTenant } from '../../../utils/tenant-ownership';
import { isUuid } from './guards';
import { registerSignatureSource } from './registry';
import type { DefaultSigner, SignatureDocumentSource } from './types';

/**
 * Source « état des lieux » (LEASE_INSPECTION, spec 044 lot S3) : le PDF est
 * généré par `lib/lease-inspections/inspection-pdf.ts` (aucun fichier source
 * n'existe en base). Seul un état des lieux FINALISÉ se signe : il est alors
 * figé (`updateInspection`, `addInspectionPhoto`, `deleteInspection`… refusent
 * tout sur un état finalisé, et la finalisation est irréversible).
 *
 * Aucune colonne ne porte « signé » : la preuve est la demande de signature
 * elle-même (statut COMPLETED, PDF scellé), donc `onSealed` n'a rien à poser.
 * `isSourceIntact` compare l'empreinte du contenu (données et photos) prise à
 * l'envoi (`snapshotHash`) à l'état courant.
 *
 * `inspection-pdf` est importé à l'usage : il tire pdf-lib et le rendu du
 * papier à en-tête, inutiles tant qu'on ne fait pas un PDF.
 */

const NOT_FOUND = () => t('État des lieux introuvable.');

async function findInspection(tenantId: string, targetId: string) {
  return prisma.leaseInspection.findFirst({
    where: { id: targetId, tenantId },
    select: { id: true, status: true, type: true, lease: { select: { lease_number: true } } }
  });
}

/** Contact CRM lié à un client (`TenantClient.details.crmContactId`), s'il existe. */
function crmContactIdOf(details: unknown): string | null {
  const id = (details as { crmContactId?: unknown } | null)?.crmContactId;
  return typeof id === 'string' && id ? id : null;
}

type ClientRow = {
  details: unknown;
  user: { fullName: string | null; email: string | null } | null;
} | null;

export const leaseInspectionSource: SignatureDocumentSource = {
  kind: 'LEASE_INSPECTION',
  targetType: 'LeaseInspection',
  viewPermission: 'RENTAL_LEASES_VIEW',
  editPermission: 'RENTAL_LEASES_EDIT',
  feature: 'RENTAL',

  async assertTarget(ctx, targetId) {
    if (!isUuid(targetId)) throw new NotFoundError(NOT_FOUND());
    await assertBelongsToTenant(prisma, 'leaseInspection', targetId, ctx.tenantId, { message: NOT_FOUND() });
    const inspection = await findInspection(ctx.tenantId, targetId);
    if (!inspection) throw new NotFoundError(NOT_FOUND());
    if (inspection.status !== 'FINALIZED') {
      throw new BadRequestError(
        t("Finalisez l'état des lieux avant de l'envoyer en signature : un brouillon ne peut pas être signé.")
      );
    }
    // L'état des lieux n'a aucune colonne « signé » : la demande COMPLETED fait foi. Pas de seconde signature.
    const signed = await prisma.signatureRequest.findFirst({
      where: {
        tenantId: ctx.tenantId,
        kind: 'LEASE_INSPECTION',
        targetType: 'LeaseInspection',
        targetId,
        status: 'COMPLETED'
      },
      select: { id: true }
    });
    if (signed) {
      throw new ConflictError(
        t('Cet état des lieux est déjà signé : il ne peut pas être envoyé une seconde fois en signature.')
      );
    }
  },

  async loadSource(ctx, targetId) {
    const inspection = await findInspection(ctx.tenantId, targetId);
    if (!inspection) throw new NotFoundError(NOT_FOUND());
    if (inspection.status !== 'FINALIZED') {
      throw new BadRequestError(
        t("Finalisez l'état des lieux avant de l'envoyer en signature : un brouillon ne peut pas être signé.")
      );
    }
    const { buildInspectionPdf } = await import('../../lease-inspections/inspection-pdf');
    const { buffer, contentHash } = await buildInspectionPdf(ctx.tenantId, inspection.id);
    const number = inspection.lease.lease_number;
    return {
      // Document généré : pas de RentalDocument. L'empreinte vient des données et des photos qui ont
      // servi à CE rendu (jamais une seconde lecture) ; `snapshotHash` la recalcule pour `isSourceIntact`.
      documentId: null,
      documentHash: contentHash,
      pdf: buffer,
      title:
        inspection.type === 'EXIT'
          ? t('État des lieux de sortie - bail {{number}}', { number })
          : t("État des lieux d'entrée - bail {{number}}", { number })
    };
  },

  /**
   * Locataire principal, co-locataires, bailleur (compte et contact CRM lié) et
   * agent qui ouvre l'écran (nom retenu sur l'état des lieux s'il y en a un).
   */
  async defaultSigners(ctx, targetId) {
    if (!isUuid(targetId)) throw new NotFoundError(NOT_FOUND());
    const inspection = await prisma.leaseInspection.findFirst({
      where: { id: targetId, tenantId: ctx.tenantId, lease: { tenant_id: ctx.tenantId } },
      select: {
        agentSignatoryName: true,
        lease: {
          select: {
            primaryRenter: { select: { details: true, user: { select: { fullName: true, email: true } } } },
            ownerClient: { select: { details: true, user: { select: { fullName: true, email: true } } } },
            coRenters: {
              select: { renterClient: { select: { details: true, user: { select: { fullName: true, email: true } } } } }
            }
          }
        }
      }
    });
    if (!inspection) throw new NotFoundError(NOT_FOUND());

    const clients: Array<{ role: string; client: ClientRow }> = [
      { role: 'LOCATAIRE', client: inspection.lease.primaryRenter },
      ...inspection.lease.coRenters.map(co => ({ role: 'CO_LOCATAIRE', client: co.renterClient })),
      { role: 'BAILLEUR', client: inspection.lease.ownerClient }
    ];
    const contactIds = [
      ...new Set(clients.map(({ client }) => crmContactIdOf(client?.details)).filter(Boolean))
    ] as string[];
    const contacts = contactIds.length
      ? await prisma.crmContact.findMany({
          where: { tenantId: ctx.tenantId, id: { in: contactIds } },
          select: { id: true, firstName: true, lastName: true, email: true, phonePrimary: true, whatsappNumber: true }
        })
      : [];
    const contactById = new Map(contacts.map(contact => [contact.id, contact]));

    const signers: DefaultSigner[] = [];
    for (const { role, client } of clients) {
      if (!client) continue;
      const contact = contactById.get(crmContactIdOf(client.details) ?? '');
      const contactName = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(' ') : '';
      const fullName = client.user?.fullName?.trim() || contactName;
      const email = client.user?.email || contact?.email || null;
      if (!fullName && !email) continue;
      signers.push({
        role,
        fullName,
        email,
        phone: contact?.whatsappNumber || contact?.phonePrimary || null,
        contactId: contact?.id ?? null
      });
    }

    const agent = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { fullName: true, email: true }
    });
    const agentName = inspection.agentSignatoryName?.trim() || agent?.fullName?.trim() || '';
    if (agentName || agent?.email) {
      signers.push({ role: 'AGENT', fullName: agentName, email: agent?.email ?? null, phone: null, contactId: null });
    }
    return signers;
  },

  /** Empreinte des données figées et du contenu des photos au moment de l'envoi. */
  async snapshotHash(ctx, targetId) {
    if (!isUuid(targetId)) return null;
    const { computeInspectionContentHash, loadInspectionForPdf } =
      await import('../../lease-inspections/inspection-pdf');
    return computeInspectionContentHash(await loadInspectionForPdf(ctx.tenantId, targetId));
  },

  /** SG-R2 : toujours finalisé, et contenu (données, photos) identique à celui envoyé. */
  async isSourceIntact(request) {
    if (!isUuid(request.targetId)) return false;
    const inspection = await findInspection(request.tenantId, request.targetId);
    if (!inspection || inspection.status !== 'FINALIZED') return false;
    if (!request.sourceDocHash) return true;
    const { computeInspectionContentHash, loadInspectionForPdf } =
      await import('../../lease-inspections/inspection-pdf');
    const hash = await computeInspectionContentHash(await loadInspectionForPdf(request.tenantId, request.targetId));
    return hash === request.sourceDocHash;
  },

  /** Rien à marquer : aucune colonne « signé » sur l'état des lieux, la demande COMPLETED fait foi. */
  async onSealed() {
    return undefined;
  }
};

registerSignatureSource(leaseInspectionSource);
