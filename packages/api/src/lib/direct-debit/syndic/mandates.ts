import type { Prisma } from '@prisma/client';
import { t } from '../../../i18n';
import { BadRequestError, ConflictError, NotFoundError } from '../../../middleware/error-middleware';
import { recordAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { prisma } from '../../../utils/database';
import type { DbClient } from '../dto';
import { contactDisplayName, MANDATE_SELECT, referenceOf, toMandateDto, type MandateDto } from '../dto';
import { encryptIban, isIbanEncryptionAvailable } from '../iban-crypto';
import { parseIbanInput } from '../iban';
import { nextSequenceTx } from '../../sales/numbering';
import type { CreateSyndicMandateInput, ListSyndicMandatesQuery } from '../schemas';
import { getMandate } from '../mandates';
import { assertSyndicateOfTenant } from './creditors';
import { syndicCtx } from './scope';

/**
 * Mandats de prélèvement des lots d'un syndicat (spec 042, P4, data-model
 * §9.1 et §9.3).
 *
 * - Un mandat est rattaché à un LOT : le débiteur est un contact copropriétaire
 *   de ce lot (`ownerContactId`, `coownerId` ou un `LotOwnerProfile` en cours),
 *   pas un client locatif. Un seul mandat ouvert par (lot, créancier).
 * - Le lot doit appartenir au syndicat de la route, le syndicat à l'agence, le
 *   contact à l'agence ET au lot : toute référence étrangère lève la même
 *   `NotFoundError` qu'un objet inexistant.
 * - Même régime d'IBAN que le locatif : contrôlé, chiffré, jamais renvoyé ni
 *   journalisé (l'audit ne reçoit que `bankCode` et `last4Digits`).
 * - Les transitions de statut, le PDF et le scan sont ceux de `../mandates`
 *   et `../authorization-pdf`, appelés avec le périmètre `SYNDIC_LOT`.
 */

const MAX_SEQUENCE_ATTEMPTS = 3;

const openMandateExists = () => new ConflictError(t('Un mandat ouvert existe déjà pour ce lot et ce créancier.'));
const lotNotFound = () => new NotFoundError(t('Lot introuvable ou inaccessible pour cette copropriété.'));

function uniqueViolationTarget(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || (error as { code?: string }).code !== 'P2002') return null;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  return Array.isArray(target) ? target.join(',') : String(target ?? '');
}

export interface LotDebtorDto {
  contactId: string;
  displayName: string | null;
  hasEmail: boolean;
}

/**
 * Copropriétaires du lot : le propriétaire et le co-propriétaire portés par le
 * lot, plus les profils propriétaires en cours (`ownedUntil` absent ou à venir,
 * profil actif). Le lot doit être du syndicat ET de l'agence.
 */
async function loadLotOwnerContactIds(
  db: DbClient,
  tenantId: string,
  syndicateId: string,
  lotId: string,
  now: Date
): Promise<string[]> {
  const lot = await db.syndicateLot.findFirst({
    where: { id: lotId, syndicateId, syndicate: { tenantId } },
    select: {
      id: true,
      ownerContactId: true,
      coownerId: true,
      ownerProfiles: {
        where: { isActive: true, OR: [{ ownedUntil: null }, { ownedUntil: { gt: now } }] },
        select: { contactId: true }
      }
    }
  });
  if (!lot) throw lotNotFound();
  return Array.from(
    new Set(
      [lot.ownerContactId, lot.coownerId, ...lot.ownerProfiles.map(profile => profile.contactId)].filter(
        (id): id is string => Boolean(id)
      )
    )
  );
}

/** `GET /lots/:lotId/debiteurs` : les contacts qui peuvent signer un mandat pour ce lot. */
export async function listLotDebtors(
  tenantId: string,
  syndicateId: string,
  lotId: string,
  now: Date = new Date()
): Promise<LotDebtorDto[]> {
  await assertSyndicateOfTenant(tenantId, syndicateId);
  const ids = await loadLotOwnerContactIds(prisma, tenantId, syndicateId, lotId, now);
  if (ids.length === 0) return [];
  const contacts = await prisma.crmContact.findMany({
    // `tenantId` dans le filtre : un contact d'une autre agence ne ressort jamais.
    where: { id: { in: ids }, tenantId },
    select: { id: true, contactType: true, firstName: true, lastName: true, legalName: true, email: true }
  });
  return contacts
    .map(contact => ({
      contactId: contact.id,
      displayName: contactDisplayName(contact),
      hasEmail: Boolean(contact.email?.trim())
    }))
    .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? '', 'fr'));
}

export async function listSyndicMandates(
  tenantId: string,
  syndicateId: string,
  query: ListSyndicMandatesQuery
): Promise<{ items: MandateDto[]; total: number; page: number; pageSize: number }> {
  await assertSyndicateOfTenant(tenantId, syndicateId);
  const where: Prisma.DirectDebitMandateWhereInput = { tenantId, scope: 'SYNDIC_LOT', syndicateId };
  if (query.lotId) where.lotId = query.lotId;
  if (query.status) where.status = query.status;
  if (query.search) {
    const search = query.search;
    const or: Prisma.DirectDebitMandateWhereInput[] = [
      { holderName: { contains: search, mode: 'insensitive' } },
      { lot: { is: { lotNumber: { contains: search, mode: 'insensitive' } } } },
      {
        debtorContact: {
          is: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { legalName: { contains: search, mode: 'insensitive' } }
            ]
          }
        }
      }
    ];
    const reference = /^MDT-(\d{4})-(\d{1,6})$/i.exec(search);
    if (reference) or.push({ year: Number(reference[1]), sequence: Number(reference[2]) });
    if (/^\d{4}$/.test(search)) or.push({ ibanLast4: search });
    where.OR = or;
  }

  const [total, rows] = await Promise.all([
    prisma.directDebitMandate.count({ where }),
    prisma.directDebitMandate.findMany({
      where,
      select: MANDATE_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize
    })
  ]);
  return {
    items: rows.map(row => toMandateDto(row, null)),
    total,
    page: query.page,
    pageSize: query.pageSize
  };
}

export async function createSyndicMandate(
  tenantId: string,
  syndicateId: string,
  input: CreateSyndicMandateInput,
  actorUserId?: string | null,
  now: Date = new Date()
): Promise<{ mandate: MandateDto; warnings: string[] }> {
  // Défense en profondeur : le garde de route a déjà répondu 404 pour un syndicat d'une autre agence.
  await assertSyndicateOfTenant(tenantId, syndicateId);
  const parsed = parseIbanInput(input.iban);
  if (!parsed.ok) throw new BadRequestError(parsed.error);
  // Sans clé de chiffrement valide, rien n'est écrit.
  if (!isIbanEncryptionAvailable()) {
    throw new BadRequestError(t("Le chiffrement des coordonnées bancaires n'est pas configuré sur ce serveur."));
  }
  const ibanEncrypted = encryptIban(parsed.iban);
  const year = now.getFullYear();

  let createdId: string | null = null;
  for (let attempt = 1; attempt <= MAX_SEQUENCE_ATTEMPTS && !createdId; attempt += 1) {
    try {
      createdId = await prisma.$transaction(async tx => {
        const creditor = await tx.directDebitCreditor.findFirst({
          where: { tenantId, scope: 'SYNDIC_LOT', syndicateId },
          select: { id: true, isActive: true }
        });
        if (!creditor) {
          throw new BadRequestError(t("Configurez d'abord le compte de prélèvement du syndicat."));
        }
        if (!creditor.isActive) {
          throw new BadRequestError(t('Ce créancier est désactivé : choisissez-en un autre.'));
        }

        // Lot du syndicat de la route (et de l'agence), puis débiteur parmi les copropriétaires du lot.
        const ownerIds = await loadLotOwnerContactIds(tx, tenantId, syndicateId, input.lotId, now);
        if (!ownerIds.includes(input.debtorContactId)) {
          throw new NotFoundError(t('Débiteur introuvable.'));
        }
        const contact = await tx.crmContact.findFirst({
          where: { id: input.debtorContactId, tenantId },
          select: { id: true }
        });
        if (!contact) throw new NotFoundError(t('Débiteur introuvable.'));

        // Un seul mandat ouvert par (lot, créancier).
        const openSlotKey = `lot:${input.lotId}:${creditor.id}`;
        const open = await tx.directDebitMandate.findFirst({
          where: { tenantId, openSlotKey },
          select: { id: true }
        });
        if (open) throw openMandateExists();

        const sequence = await nextSequenceTx(tx.directDebitMandate, tenantId, year);
        const created = await tx.directDebitMandate.create({
          data: {
            tenantId,
            year,
            sequence,
            scope: 'SYNDIC_LOT',
            creditorId: creditor.id,
            syndicateId,
            lotId: input.lotId,
            debtorContactId: input.debtorContactId,
            status: 'DRAFT',
            ibanEncrypted,
            ibanBankCode: parsed.bankCode,
            ibanLast4: parsed.last4,
            holderName: input.holderName,
            maxAmount: input.maxAmount ?? null,
            collectionDay: input.collectionDay ?? null,
            openSlotKey,
            notes: input.notes ?? null,
            createdByUserId: actorUserId ?? null
          },
          select: { id: true }
        });

        await recordAuditEvent(tx, {
          actorUserId: actorUserId ?? null,
          tenantId,
          actionKey: AuditActionKey.DIRECT_DEBIT_MANDATE_CREATED,
          entityType: 'DirectDebitMandate',
          entityId: created.id,
          payload: {
            scope: 'SYNDIC_LOT',
            syndicateId,
            reference: referenceOf(year, sequence),
            creditorId: creditor.id,
            lotId: input.lotId,
            debtorContactId: input.debtorContactId,
            bankCode: parsed.bankCode,
            last4Digits: parsed.last4
          }
        });
        return created.id;
      });
    } catch (error) {
      const target = uniqueViolationTarget(error);
      if (target === null) throw error;
      if (target.includes('open_slot_key') || target.includes('openSlotKey')) throw openMandateExists();
      // Séquence prise entre-temps par une requête concurrente : on retente.
      if (attempt === MAX_SEQUENCE_ATTEMPTS) throw new ConflictError(t('Réessayez : la numérotation est occupée.'));
    }
  }

  const mandate = await getMandate(tenantId, createdId as string, syndicCtx(syndicateId));
  return { mandate, warnings: parsed.warnings };
}
