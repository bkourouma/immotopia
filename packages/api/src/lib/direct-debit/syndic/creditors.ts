import { t } from '../../../i18n';
import { ConflictError, NotFoundError, ValidationError } from '../../../middleware/error-middleware';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { prisma } from '../../../utils/database';
import { CREDITOR_SELECT, toCreditorDto, type CreditorDto } from '../dto';
import { parseIbanInput } from '../iban';
import type { UpsertSyndicCreditorInput } from '../schemas';

/**
 * Créancier du prélèvement d'un syndicat (spec 042, P4, data-model §9.1 et
 * §9.3) : le compte bancaire DU SYNDICAT (sa banque, sa convention
 * d'émetteur), pas un compte de trésorerie de l'agence. Un seul par syndicat.
 * Les frais de rejet sont toujours 0 (non refacturés en copropriété).
 *
 * Toute lecture et toute écriture est filtrée par `tenantId` ET par syndicat.
 */

/** La référence du compte est affichée en clair : un IBAN ou un RIB n'y a pas sa place. */
function assertNotAnIban(value: string | null | undefined): void {
  if (value && parseIbanInput(value).ok) {
    throw new ValidationError(t('La référence du compte ne doit pas être un IBAN ni un RIB.'), [
      { field: 'bankAccountRef', message: t('Saisissez une référence courte, pas un IBAN ni un RIB.') }
    ]);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

/** Le syndicat doit appartenir à l'agence ; sinon la même 404 qu'un syndicat inexistant. */
export async function assertSyndicateOfTenant(tenantId: string, syndicateId: string): Promise<{ name: string }> {
  const syndicate = await prisma.syndicate.findFirst({
    where: { id: syndicateId, tenantId },
    select: { id: true, name: true }
  });
  if (!syndicate) throw new NotFoundError(t('Copropriété introuvable ou inaccessible.'));
  return { name: syndicate.name };
}

export async function getSyndicCreditor(tenantId: string, syndicateId: string): Promise<CreditorDto | null> {
  await assertSyndicateOfTenant(tenantId, syndicateId);
  const row = await prisma.directDebitCreditor.findFirst({
    where: { tenantId, scope: 'SYNDIC_LOT', syndicateId },
    select: CREDITOR_SELECT
  });
  return row ? toCreditorDto(row) : null;
}

/** Identifiant du créancier du syndicat, ou `null`. */
export async function findSyndicCreditorId(tenantId: string, syndicateId: string): Promise<string | null> {
  const row = await prisma.directDebitCreditor.findFirst({
    where: { tenantId, scope: 'SYNDIC_LOT', syndicateId },
    select: { id: true }
  });
  return row?.id ?? null;
}

type Changes = Record<string, { before: unknown; after: unknown }>;

/**
 * `PUT /creancier` : crée le créancier du syndicat, ou met à jour l'existant.
 * Sur une mise à jour, un champ absent du corps reste inchangé ; `null` efface
 * une valeur facultative (banque, référence, numéro d'émetteur).
 */
export async function upsertSyndicCreditor(
  tenantId: string,
  syndicateId: string,
  input: UpsertSyndicCreditorInput,
  actorUserId?: string | null
): Promise<CreditorDto> {
  await assertSyndicateOfTenant(tenantId, syndicateId);
  assertNotAnIban(input.bankAccountRef);

  const existing = await prisma.directDebitCreditor.findFirst({
    where: { tenantId, scope: 'SYNDIC_LOT', syndicateId },
    select: {
      id: true,
      label: true,
      bankName: true,
      bankAccountRef: true,
      creditorIdentifier: true,
      collectionDay: true,
      prenotificationBusinessDays: true,
      maxConsecutiveRejects: true,
      isActive: true
    }
  });

  if (!existing) {
    try {
      const created = await prisma.directDebitCreditor.create({
        data: {
          tenantId,
          scope: 'SYNDIC_LOT',
          syndicateId,
          label: input.label,
          bankName: input.bankName ?? null,
          bankAccountRef: input.bankAccountRef ?? null,
          creditorIdentifier: input.creditorIdentifier ?? null,
          collectionDay: input.collectionDay,
          prenotificationBusinessDays: input.prenotificationBusinessDays,
          maxConsecutiveRejects: input.maxConsecutiveRejects,
          isActive: input.isActive ?? true,
          // Jamais de frais de rejet refacturés en copropriété.
          rejectFeeAmount: 0,
          createdByUserId: actorUserId ?? null
        },
        select: { id: true }
      });
      logAuditEvent({
        actorUserId: actorUserId ?? null,
        tenantId,
        actionKey: AuditActionKey.DIRECT_DEBIT_CREDITOR_CREATED,
        entityType: 'DirectDebitCreditor',
        entityId: created.id,
        payload: {
          scope: 'SYNDIC_LOT',
          syndicateId,
          label: input.label,
          hasCreditorIdentifier: Boolean(input.creditorIdentifier)
        }
      });
      return readCreditor(tenantId, syndicateId);
    } catch (error) {
      // Création concurrente : le créancier existe maintenant, on le met à jour.
      if (!isUniqueViolation(error)) throw error;
      return upsertSyndicCreditor(tenantId, syndicateId, input, actorUserId);
    }
  }

  const data: Record<string, unknown> = {};
  const changes: Changes = {};
  const set = (field: keyof typeof existing, value: unknown, before: unknown) => {
    if (value === undefined || value === before) return;
    data[field] = value;
    // Jamais la valeur de la référence de compte dans l'audit : seulement le nom du champ.
    changes[field] =
      field === 'bankAccountRef' ? { before: '[modifié]', after: '[modifié]' } : { before, after: value };
  };
  set('label', input.label, existing.label);
  set('bankName', input.bankName, existing.bankName);
  set('bankAccountRef', input.bankAccountRef, existing.bankAccountRef);
  set('creditorIdentifier', input.creditorIdentifier, existing.creditorIdentifier);
  set('collectionDay', input.collectionDay, existing.collectionDay);
  set('prenotificationBusinessDays', input.prenotificationBusinessDays, existing.prenotificationBusinessDays);
  set('maxConsecutiveRejects', input.maxConsecutiveRejects, existing.maxConsecutiveRejects);
  set('isActive', input.isActive, existing.isActive);

  if (Object.keys(data).length > 0) {
    const result = await prisma.directDebitCreditor.updateMany({
      where: { id: existing.id, tenantId, scope: 'SYNDIC_LOT', syndicateId },
      data
    });
    if (result.count === 0) throw new ConflictError(t("Le créancier vient d'être modifié : rechargez la page."));
    logAuditEvent({
      actorUserId: actorUserId ?? null,
      tenantId,
      actionKey: AuditActionKey.DIRECT_DEBIT_CREDITOR_UPDATED,
      entityType: 'DirectDebitCreditor',
      entityId: existing.id,
      payload: { scope: 'SYNDIC_LOT', syndicateId, fields: Object.keys(changes) },
      changes
    });
  }
  return readCreditor(tenantId, syndicateId);
}

async function readCreditor(tenantId: string, syndicateId: string): Promise<CreditorDto> {
  const dto = await getSyndicCreditor(tenantId, syndicateId);
  if (!dto) throw new NotFoundError(t('Créancier introuvable.'));
  return dto;
}
