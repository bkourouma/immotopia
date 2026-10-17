import type { DirectDebitMandateScope, SignatureDocumentKind } from '@prisma/client';
import { t } from '../../../i18n';
import { BadRequestError, ConflictError, NotFoundError } from '../../../middleware/error-middleware';
import { recordAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { prisma } from '../../../utils/database';
import { assertBelongsToTenant } from '../../../utils/tenant-ownership';
import { contactDisplayName, referenceOf } from '../../direct-debit/dto';
import { loadMandateSignatureData, renderMandateSignaturePdf } from '../../direct-debit/signature-pdf-data';
import { computeMandateSignatureSnapshot } from '../../direct-debit/signature-snapshot';
import type { Feature } from '../../subscription/features';
import { isUuid } from './guards';
import { registerSignatureSource } from './registry';
import { SourceChangedError, type DefaultSigner, type SignatureDocumentSource } from './types';

/**
 * Sources « mandat de prélèvement » (spec 042 §10.4) : l'autorisation de prélèvement
 * d'un mandat EN BROUILLON est envoyée en signature électronique au débiteur. Deux
 * types, une seule cible (`DirectDebitMandate`) : `DIRECT_DEBIT_MANDATE` (bail,
 * mandat `RENTAL_LEASE`) et `SYNDIC_DIRECT_DEBIT_MANDATE` (copropriété, `SYNDIC_LOT`).
 *
 * Le PDF porte l'IBAN COMPLET (le débiteur le remet à sa banque) : c'est le seul
 * endroit. Titre, empreinte, erreurs, journaux et audit n'en portent jamais.
 * L'empreinte (`documentHash`) est un HMAC à clé dérivée (`signature-snapshot.ts`).
 * Une fois scellé, le PDF signé tient lieu de scan (`signature:<id>`, lu par
 * `direct-debit/mandate-files.ts`) ; le mandat reste `DRAFT`, l'agence l'active.
 * Pas d'`onCancel` : rien n'est posé sur le mandat avant le scellement.
 */

const TARGET_TYPE = 'DIRECT_DEBIT_MANDATE';

const notFound = () => new NotFoundError(t('Mandat introuvable.'));

function createSource(config: {
  kind: SignatureDocumentKind;
  scope: DirectDebitMandateScope;
  permission: string;
  feature: Feature;
}): SignatureDocumentSource {
  const { kind, scope } = config;

  /** Le mandat de l'agence, du bon périmètre, en brouillon et sans scan ; sinon l'erreur typée. */
  const assertSignable = (mandate: { scope: string; status: string; hasSignedScan: boolean }) => {
    if (mandate.scope !== scope) {
      throw new BadRequestError(t("Ce mandat n'est pas du bon type pour cette signature."));
    }
    if (mandate.status !== 'DRAFT') {
      throw new BadRequestError(t('Seul un mandat en brouillon peut être envoyé en signature électronique.'));
    }
    if (mandate.hasSignedScan) {
      throw new ConflictError(
        t('Un scan signé est déjà déposé pour ce mandat : il ne peut pas être envoyé en signature électronique.')
      );
    }
  };

  return {
    kind,
    targetType: TARGET_TYPE,
    providerRequired: false,
    codeBeforeView: true,
    allowedChannels: ['EMAIL', 'SMS', 'WHATSAPP'],
    externalGateway: true,
    viewPermission: config.permission,
    editPermission: config.permission,
    feature: config.feature,

    async assertTarget(ctx, targetId) {
      if (!isUuid(targetId)) throw notFound();
      await assertBelongsToTenant(prisma, 'directDebitMandate', targetId, ctx.tenantId, {
        message: t('Mandat introuvable.')
      });
      const mandate = await prisma.directDebitMandate.findFirst({
        where: { id: targetId, tenantId: ctx.tenantId },
        select: { scope: true, status: true, signedScanUrl: true }
      });
      if (!mandate) throw notFound();
      assertSignable({ scope: mandate.scope, status: mandate.status, hasSignedScan: Boolean(mandate.signedScanUrl) });
    },

    async loadSource(ctx, targetId) {
      if (!isUuid(targetId)) throw notFound();
      const loaded = await loadMandateSignatureData(ctx.tenantId, targetId);
      if (!loaded) throw notFound();
      assertSignable(loaded);
      const pdf = await renderMandateSignaturePdf(ctx.tenantId, loaded.data);
      return {
        documentId: null,
        // HMAC des données qui ont servi à CE rendu (jamais une seconde lecture).
        documentHash: computeMandateSignatureSnapshot(loaded.snapshot),
        pdf,
        // SIG-S3 : jamais l'IBAN dans le titre.
        title: t('Autorisation de prélèvement {{reference}}', { reference: loaded.reference })
      };
    },

    /** SG-R2 : mandat toujours en brouillon, sans scan, et données inchangées depuis l'envoi. */
    async isSourceIntact(request) {
      if (!isUuid(request.targetId)) return false;
      try {
        const current = await loadMandateSignatureData(request.tenantId, request.targetId);
        if (!current || current.scope !== scope || current.status !== 'DRAFT' || current.hasSignedScan) return false;
        if (!request.sourceDocHash) return true;
        return computeMandateSignatureSnapshot(current.snapshot) === request.sourceDocHash;
      } catch {
        // IBAN illisible ou clé absente : le document n'est plus vérifiable, donc plus valable.
        return false;
      }
    },

    /** Le débiteur : nom, e-mail et téléphone de son compte locataire ou de son contact CRM. */
    async defaultSigners(ctx, targetId) {
      if (!isUuid(targetId)) throw notFound();
      const mandate = await prisma.directDebitMandate.findFirst({
        where: { id: targetId, tenantId: ctx.tenantId },
        select: {
          scope: true,
          holderName: true,
          debtor: { select: { details: true, user: { select: { fullName: true, email: true } } } },
          debtorContact: {
            select: {
              id: true,
              contactType: true,
              firstName: true,
              lastName: true,
              legalName: true,
              email: true,
              phonePrimary: true
            }
          }
        }
      });
      if (!mandate || mandate.scope !== scope) throw notFound();

      let contact = mandate.debtorContact;
      if (!contact && mandate.debtor) {
        const contactId = (mandate.debtor.details as { crmContactId?: unknown } | null)?.crmContactId;
        if (typeof contactId === 'string' && contactId) {
          contact = await prisma.crmContact.findFirst({
            // `tenantId` dans le filtre : un identifiant copié d'une autre agence ne résout rien.
            where: { id: contactId, tenantId: ctx.tenantId },
            select: {
              id: true,
              contactType: true,
              firstName: true,
              lastName: true,
              legalName: true,
              email: true,
              phonePrimary: true
            }
          });
        }
      }

      const fullName =
        mandate.debtor?.user?.fullName?.trim() || (contact ? contactDisplayName(contact) : null) || mandate.holderName;
      const email = mandate.debtor?.user?.email || contact?.email || null;
      const signer: DefaultSigner = {
        role: 'DEBITEUR',
        fullName,
        email,
        phone: contact?.phonePrimary ?? null,
        contactId: contact?.id ?? null
      };
      return [signer];
    },

    /**
     * Pose le PDF scellé comme scan du mandat, DANS la transaction du scellement.
     * Idempotent (même demande déjà posée : rien). Un mandat qui n'est plus en brouillon
     * ou qui porte déjà un autre scan → SourceChangedError : le noyau annule la demande.
     */
    async onSealed(tx, request, now) {
      const mandate = await tx.directDebitMandate.findFirst({
        where: { id: request.targetId, tenantId: request.tenantId },
        select: { id: true, year: true, sequence: true, status: true, signedScanUrl: true, signatureRequestId: true }
      });
      if (!mandate) throw new SourceChangedError();
      const scanKey = `signature:${request.id}`;
      if (mandate.signatureRequestId === request.id && mandate.signedScanUrl === scanKey) return;
      if (mandate.status !== 'DRAFT' || mandate.signedScanUrl) throw new SourceChangedError();

      // Date de la signature : la dernière de la demande (lue dans la transaction), à défaut `now`.
      const last = await tx.signatureSigner.findFirst({
        where: { requestId: request.id, tenantId: request.tenantId, signedAt: { not: null } },
        orderBy: { signedAt: 'desc' },
        select: { signedAt: true }
      });
      const signedAt = last?.signedAt ?? now;

      const updated = await tx.directDebitMandate.updateMany({
        where: { id: mandate.id, tenantId: request.tenantId, status: 'DRAFT', signedScanUrl: null },
        data: { signedScanUrl: scanKey, signedScanUploadedAt: now, signedAt, signatureRequestId: request.id }
      });
      if (updated.count !== 1) throw new SourceChangedError();

      // Charge utile sans coordonnées bancaires : la référence suffit.
      await recordAuditEvent(tx, {
        tenantId: request.tenantId,
        actorUserId: null,
        actorType: 'SYSTEM',
        actionKey: AuditActionKey.DIRECT_DEBIT_MANDATE_SIGNED_ELECTRONICALLY,
        entityType: 'DirectDebitMandate',
        entityId: mandate.id,
        payload: {
          reference: referenceOf(mandate.year, mandate.sequence),
          signatureRequestId: request.id,
          kind: request.kind,
          signedAt: signedAt.toISOString()
        }
      });
    }
  };
}

export const directDebitMandateSource = createSource({
  kind: 'DIRECT_DEBIT_MANDATE',
  scope: 'RENTAL_LEASE',
  permission: 'RENTAL_DIRECT_DEBIT_MANAGE',
  feature: 'RENTAL'
});

export const syndicDirectDebitMandateSource = createSource({
  kind: 'SYNDIC_DIRECT_DEBIT_MANDATE',
  scope: 'SYNDIC_LOT',
  permission: 'SYNDIC_DIRECT_DEBIT_MANAGE',
  feature: 'SYNDIC'
});

registerSignatureSource(directDebitMandateSource);
registerSignatureSource(syndicDirectDebitMandateSource);
