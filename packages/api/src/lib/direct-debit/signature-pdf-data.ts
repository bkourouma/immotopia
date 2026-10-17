import type { DirectDebitMandateScope, DirectDebitMandateStatus } from '@prisma/client';
import { prisma } from '../../utils/database';
import { resolveDocumentBranding } from '../documents/document-branding';
import { contactDisplayName, referenceOf, resolveDebtorNames, type DbClient } from './dto';
import { renderAuthorizationPdf, type AuthorizationPdfData } from './authorization-pdf';
import { decryptMandateIban } from './mandates';
import type { MandateSnapshotInput } from './signature-snapshot';

/**
 * Données du PDF d'autorisation envoyé en signature (spec 042 §10.4).
 *
 * Même contenu que `generateAuthorizationPdf`, mais SANS audit de téléchargement
 * (la source de signature n'est pas un téléchargement) et lisible dans une
 * transaction. Toute lecture est filtrée par agence. L'IBAN complet n'est
 * déchiffré que pour le rendu du PDF et l'empreinte HMAC : `data` et `snapshot`
 * le portent et ne doivent jamais être journalisés ni renvoyés.
 */

export interface MandateSignatureData {
  id: string;
  reference: string;
  scope: DirectDebitMandateScope;
  status: DirectDebitMandateStatus;
  hasSignedScan: boolean;
  data: AuthorizationPdfData;
  snapshot: MandateSnapshotInput;
}

/** Lit le mandat de l'agence et assemble les données du PDF. `null` si absent de l'agence. */
export async function loadMandateSignatureData(
  tenantId: string,
  mandateId: string,
  db: DbClient = prisma
): Promise<MandateSignatureData | null> {
  const row = await db.directDebitMandate.findFirst({
    where: { id: mandateId, tenantId },
    select: {
      id: true,
      year: true,
      sequence: true,
      scope: true,
      status: true,
      signedScanUrl: true,
      ibanEncrypted: true,
      ibanBankCode: true,
      holderName: true,
      maxAmount: true,
      collectionDay: true,
      leaseId: true,
      lotId: true,
      syndicateId: true,
      creditor: {
        select: {
          id: true,
          label: true,
          creditorIdentifier: true,
          collectionDay: true,
          bankName: true,
          treasuryAccount: { select: { bankName: true } }
        }
      },
      debtor: { select: { id: true, details: true, user: { select: { fullName: true } } } },
      debtorContact: { select: { contactType: true, firstName: true, lastName: true, legalName: true } },
      lease: { select: { lease_number: true, currency: true, property: { select: { title: true, address: true } } } },
      lot: { select: { lotNumber: true, syndicate: { select: { name: true, address: true } } } },
      syndicate: { select: { name: true, address: true } }
    }
  });
  if (!row) return null;

  const iban = decryptMandateIban(row.ibanEncrypted);
  const reference = referenceOf(row.year, row.sequence);

  let debtorName: string | null = null;
  if (row.debtor) {
    const names = await resolveDebtorNames(db, tenantId, [row.debtor]);
    debtorName = names.get(row.debtor.id) ?? null;
  } else if (row.debtorContact) {
    debtorName = contactDisplayName(row.debtorContact);
  }

  // Bail (locatif) ; en copropriété, le lot tient la place du bail et le syndicat celle du bien.
  const property = row.lease?.property;
  const syndicate = row.lot?.syndicate ?? row.syndicate;
  const leaseNumber = row.lease?.lease_number ?? row.lot?.lotNumber ?? null;
  const propertyLabel = property
    ? [property.title, property.address].filter(Boolean).join(' - ')
    : syndicate
      ? [syndicate.name, syndicate.address].filter(Boolean).join(' - ')
      : null;

  const data: AuthorizationPdfData = {
    reference,
    creditorLabel: row.creditor.label,
    creditorIdentifier: row.creditor.creditorIdentifier ?? null,
    creditorBankName: row.creditor.treasuryAccount?.bankName ?? row.creditor.bankName ?? null,
    debtorName,
    holderName: row.holderName,
    iban,
    bankCode: row.ibanBankCode,
    leaseNumber,
    propertyLabel,
    maxAmount: row.maxAmount === null ? null : Number(row.maxAmount),
    collectionDay: row.collectionDay ?? row.creditor.collectionDay,
    currency: row.lease?.currency ?? 'FCFA'
  };

  return {
    id: row.id,
    reference,
    scope: row.scope,
    status: row.status,
    hasSignedScan: Boolean(row.signedScanUrl),
    data,
    snapshot: {
      ...data,
      scope: row.scope,
      creditorId: row.creditor.id,
      leaseId: row.leaseId,
      lotId: row.lotId,
      syndicateId: row.syndicateId
    }
  };
}

/** Rend le PDF d'autorisation avec la marque de l'agence (sans audit de téléchargement). */
export async function renderMandateSignaturePdf(tenantId: string, data: AuthorizationPdfData): Promise<Buffer> {
  const branding = await resolveDocumentBranding(tenantId, null);
  return renderAuthorizationPdf(data, branding);
}
