import type { Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { maskIban } from './iban';

/**
 * Objets renvoyés par l'API du prélèvement bancaire (data-model §4).
 *
 * Règle absolue : aucun de ces objets ne contient l'IBAN complet, le texte
 * chiffré (`ibanEncrypted`) ni le chemin du scan (`signedScanUrl`). Les
 * `select` ci-dessous n'ont donc JAMAIS `ibanEncrypted` ; seul le PDF
 * d'autorisation le lit, par sa propre requête.
 */

export type DbClient = PrismaTransactionClient | typeof prisma;

export interface CreditorDto {
  id: string;
  label: string;
  scope: 'RENTAL_LEASE' | 'SYNDIC_LOT';
  /** Nuls en SYNDIC_LOT (créancier = compte du syndicat, spec 042 §9.5). */
  treasuryAccountId: string | null;
  treasuryAccountLabel: string | null;
  syndicate: { id: string; name: string } | null;
  bankName: string | null;
  bankAccountRef: string | null;
  creditorIdentifier: string | null;
  fileFormat: 'GENERIC_CSV';
  collectionDay: number;
  prenotificationBusinessDays: number;
  rejectFeeAmount: number;
  maxConsecutiveRejects: number;
  isActive: boolean;
  openMandateCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface IbanCheckDto {
  valid: boolean;
  ibanMasked: string | null;
  bankCode: string | null;
  error: string | null;
  warnings: string[];
}

export type MandateStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export interface MandateDto {
  id: string;
  reference: string;
  scope: 'RENTAL_LEASE' | 'SYNDIC_LOT';
  status: MandateStatus;
  creditor: { id: string; label: string; creditorIdentifier: string | null };
  debtor: { id: string; displayName: string | null; kind: 'CLIENT' | 'CONTACT' };
  /** Nul en SYNDIC_LOT. */
  lease: { id: string; leaseNumber: string; status: string } | null;
  syndicate: { id: string; name: string } | null;
  lot: { id: string; lotNumber: string } | null;
  ibanMasked: string;
  bankCode: string;
  holderName: string;
  maxAmount: number | null;
  collectionDay: number | null;
  effectiveCollectionDay: number;
  signedAt: string | null;
  hasSignedScan: boolean;
  signedScanUploadedAt: string | null;
  activatedAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  consecutiveRejects: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Statuts d'un mandat « ouvert » : ils occupent l'emplacement (bail, créancier). */
export const OPEN_MANDATE_STATUSES = ['DRAFT', 'ACTIVE', 'SUSPENDED'] as const;

const num = (value: Prisma.Decimal | number | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);
const iso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null);

export const referenceOf = (year: number, sequence: number) => `MDT-${year}-${String(sequence).padStart(4, '0')}`;

export const CREDITOR_SELECT = {
  id: true,
  scope: true,
  label: true,
  treasuryAccountId: true,
  syndicateId: true,
  bankName: true,
  bankAccountRef: true,
  creditorIdentifier: true,
  fileFormat: true,
  collectionDay: true,
  prenotificationBusinessDays: true,
  rejectFeeAmount: true,
  maxConsecutiveRejects: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  treasuryAccount: { select: { label: true, bankName: true } },
  syndicate: { select: { id: true, name: true } },
  _count: { select: { mandates: { where: { status: { in: [...OPEN_MANDATE_STATUSES] } } } } }
} satisfies Prisma.DirectDebitCreditorSelect;

type CreditorRow = Prisma.DirectDebitCreditorGetPayload<{ select: typeof CREDITOR_SELECT }>;

export function toCreditorDto(row: CreditorRow): CreditorDto {
  return {
    id: row.id,
    scope: row.scope,
    label: row.label,
    treasuryAccountId: row.treasuryAccountId ?? null,
    treasuryAccountLabel: row.treasuryAccount?.label ?? null,
    syndicate: row.syndicate ? { id: row.syndicate.id, name: row.syndicate.name } : null,
    bankName: row.treasuryAccount?.bankName ?? row.bankName ?? null,
    bankAccountRef: row.bankAccountRef ?? null,
    creditorIdentifier: row.creditorIdentifier ?? null,
    fileFormat: row.fileFormat,
    collectionDay: row.collectionDay,
    prenotificationBusinessDays: row.prenotificationBusinessDays,
    rejectFeeAmount: Number(row.rejectFeeAmount),
    maxConsecutiveRejects: row.maxConsecutiveRejects,
    isActive: row.isActive,
    openMandateCount: row._count.mandates,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

/**
 * Lecture d'un mandat SANS `ibanEncrypted`. `signedScanUrl` n'est lu que pour
 * en déduire `hasSignedScan` : le chemin ne sort jamais.
 */
export const MANDATE_SELECT = {
  id: true,
  year: true,
  sequence: true,
  scope: true,
  status: true,
  ibanBankCode: true,
  ibanLast4: true,
  holderName: true,
  maxAmount: true,
  collectionDay: true,
  signedAt: true,
  signedScanUrl: true,
  signedScanUploadedAt: true,
  activatedAt: true,
  suspendedAt: true,
  suspensionReason: true,
  revokedAt: true,
  revocationReason: true,
  consecutiveRejects: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  creditor: { select: { id: true, label: true, creditorIdentifier: true, collectionDay: true } },
  debtor: {
    select: {
      id: true,
      details: true,
      // Jamais `include: { user: true }` : l'objet complet porte passwordHash.
      user: { select: { fullName: true } }
    }
  },
  lease: { select: { id: true, lease_number: true, status: true } },
  debtorContact: { select: { id: true, contactType: true, firstName: true, lastName: true, legalName: true } },
  syndicate: { select: { id: true, name: true } },
  lot: { select: { id: true, lotNumber: true } }
} satisfies Prisma.DirectDebitMandateSelect;

export type MandateRow = Prisma.DirectDebitMandateGetPayload<{ select: typeof MANDATE_SELECT }>;

/**
 * Nom affichable des débiteurs, comme les parties d'un bail
 * (`rental-lease-service`) : le compte utilisateur s'il porte un nom, sinon le
 * contact CRM de l'agence (`details.crmContactId`), sinon `null`.
 */
export async function resolveDebtorNames(
  db: DbClient,
  tenantId: string,
  debtors: Array<{ id: string; details: unknown; user: { fullName: string | null } | null } | null>
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  const missing: Array<{ id: string; contactId: string }> = [];

  for (const debtor of debtors) {
    // Mandat de copropriété (SYNDIC_LOT) : pas de client locatif, le débiteur est un contact CRM.
    if (!debtor) continue;
    const own = debtor.user?.fullName?.trim();
    if (own) {
      names.set(debtor.id, own);
      continue;
    }
    names.set(debtor.id, null);
    const contactId = (debtor.details as { crmContactId?: unknown } | null)?.crmContactId;
    if (typeof contactId === 'string' && contactId) missing.push({ id: debtor.id, contactId });
  }

  if (missing.length > 0) {
    const contacts = await db.crmContact.findMany({
      // `tenantId` dans le filtre : un identifiant copié d'une autre agence ne résout aucun nom.
      where: { id: { in: [...new Set(missing.map(entry => entry.contactId))] }, tenantId },
      select: { id: true, contactType: true, firstName: true, lastName: true, legalName: true }
    });
    const nameById = new Map<string, string>();
    for (const contact of contacts) {
      const name =
        contact.contactType === 'COMPANY'
          ? contact.legalName?.trim() || ''
          : `${contact.firstName?.trim() || ''} ${contact.lastName?.trim() || ''}`.trim();
      if (name) nameById.set(contact.id, name);
    }
    for (const entry of missing) names.set(entry.id, nameById.get(entry.contactId) ?? null);
  }
  return names;
}

/** Nom d'un contact CRM : raison sociale pour une société, sinon prénom et nom. */
export function contactDisplayName(contact: {
  contactType: string | null;
  firstName: string | null;
  lastName: string | null;
  legalName: string | null;
}): string | null {
  const name =
    contact.contactType === 'COMPANY'
      ? contact.legalName?.trim() || ''
      : `${contact.firstName?.trim() || ''} ${contact.lastName?.trim() || ''}`.trim();
  return name || null;
}

export function toMandateDto(row: MandateRow, debtorName: string | null): MandateDto {
  return {
    id: row.id,
    reference: referenceOf(row.year, row.sequence),
    scope: row.scope,
    status: row.status,
    creditor: {
      id: row.creditor.id,
      label: row.creditor.label,
      creditorIdentifier: row.creditor.creditorIdentifier ?? null
    },
    debtor: row.debtor
      ? { id: row.debtor.id, displayName: debtorName, kind: 'CLIENT' }
      : {
          id: row.debtorContact?.id ?? '',
          displayName: row.debtorContact ? contactDisplayName(row.debtorContact) : null,
          kind: 'CONTACT'
        },
    syndicate: row.syndicate ? { id: row.syndicate.id, name: row.syndicate.name } : null,
    lot: row.lot ? { id: row.lot.id, lotNumber: row.lot.lotNumber } : null,
    lease: row.lease ? { id: row.lease.id, leaseNumber: row.lease.lease_number, status: row.lease.status } : null,
    ibanMasked: maskIban(row.ibanLast4),
    bankCode: row.ibanBankCode,
    holderName: row.holderName,
    maxAmount: num(row.maxAmount),
    collectionDay: row.collectionDay ?? null,
    effectiveCollectionDay: row.collectionDay ?? row.creditor.collectionDay,
    signedAt: iso(row.signedAt),
    hasSignedScan: Boolean(row.signedScanUrl),
    signedScanUploadedAt: iso(row.signedScanUploadedAt),
    activatedAt: iso(row.activatedAt),
    suspendedAt: iso(row.suspendedAt),
    suspensionReason: row.suspensionReason ?? null,
    revokedAt: iso(row.revokedAt),
    revocationReason: row.revocationReason ?? null,
    consecutiveRejects: row.consecutiveRejects,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

/** Lit un mandat de l'agence et le met en forme ; `null` s'il n'existe pas dans cette agence. */
export async function loadMandateDto(db: DbClient, tenantId: string, mandateId: string): Promise<MandateDto | null> {
  const row = await db.directDebitMandate.findFirst({ where: { id: mandateId, tenantId }, select: MANDATE_SELECT });
  if (!row) return null;
  const names = await resolveDebtorNames(db, tenantId, [row.debtor]);
  return toMandateDto(row, row.debtor ? (names.get(row.debtor.id) ?? null) : null);
}
