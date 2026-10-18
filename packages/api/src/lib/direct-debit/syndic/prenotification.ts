import { t } from '../../../i18n';
import { getEmailNotificationConfig } from '../../../services/email-notification-config-service';
import { emailService } from '../../../services/email-service';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { withExclusiveSection } from '../../ai/advisory-lock';
import { formatFrenchDate } from '../business-days';
import { contactDisplayName } from '../dto';
import { maskIban } from '../iban';
import { maskEmail } from '../recipient';
import { mandateReferenceOf, remittanceReferenceOf, type PrenotificationStatus } from '../remittance-dto';

/**
 * Prénotification des copropriétaires débiteurs (spec 042, P4, data-model
 * §9.3) : même mécanique que `../prenotification` pour les loyers.
 *
 * Lancée EN ARRIÈRE-PLAN après la validation d'une remise de copropriété ou sur
 * demande de renvoi. Une section exclusive par remise (verrou consultatif) évite
 * deux envois simultanés ; un deuxième déclenchement attend, puis ne relit que
 * les lignes pas encore SENT. Chaque ligne est traitée isolément, cinq envois au
 * plus en même temps, et son statut est écrit dès l'envoi.
 *
 * Destinataire : l'e-mail de la fiche CRM du contact débiteur. Pour une ligne
 * SENT ou FAILED, l'adresse MASQUÉE (`maskEmail`) et sa source (`CONTACT`) sont
 * gardées sur la ligne ; l'adresse complète n'est jamais stockée, renvoyée ni
 * journalisée (option `redactRecipient` de l'envoi). Le message ne porte que
 * l'IBAN masqué.
 */

export interface SyndicPrenotificationCounters {
  sent: number;
  noEmail: number;
  disabled: number;
  failed: number;
}

/** Nombre maximal d'e-mails envoyés en même temps pour une remise. */
export const SYNDIC_PRENOTIFICATION_CONCURRENCY = 5;

/** Une remise de plusieurs centaines de lignes peut durer plusieurs minutes. */
const SECTION_OPTIONS = { maxWaitMs: 10_000, timeoutMs: 15 * 60_000 };

const amountLabel = (amount: number) => `${new Intl.NumberFormat('fr-FR').format(amount)} FCFA`;
const errorNameOf = (error: unknown) => (error instanceof Error ? error.name : 'UnknownError');

function loadPendingLines(tenantId: string, remittanceId: string) {
  return prisma.directDebitRemittanceLine.findMany({
    where: { tenantId, remittanceId, status: 'PENDING', prenotificationStatus: { not: 'SENT' } },
    select: {
      id: true,
      amount: true,
      mandate: { select: { year: true, sequence: true, ibanLast4: true } },
      lot: { select: { lotNumber: true } },
      debtorContact: {
        select: { id: true, contactType: true, firstName: true, lastName: true, legalName: true, email: true }
      }
    }
  });
}

type PendingLine = Awaited<ReturnType<typeof loadPendingLines>>[number];

/** Exécute `worker` sur chaque élément, `limit` à la fois. */
async function forEachLimited<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function runPrenotifications(
  tenantId: string,
  remittanceId: string,
  actorUserId?: string | null
): Promise<SyndicPrenotificationCounters> {
  const counters: SyndicPrenotificationCounters = { sent: 0, noEmail: 0, disabled: 0, failed: 0 };

  const remittance = await prisma.directDebitRemittance.findFirst({
    where: { id: remittanceId, tenantId, scope: 'SYNDIC_LOT' },
    select: {
      year: true,
      sequence: true,
      status: true,
      syndicateId: true,
      collectionDate: true,
      creditorIdentifierSnapshot: true,
      tenant: { select: { name: true } },
      syndicate: { select: { name: true } }
    }
  });
  if (!remittance) return counters;
  // Une remise annulée entre-temps n'envoie plus rien.
  if (remittance.status !== 'VALIDATED' && remittance.status !== 'EXPORTED') return counters;

  // Relu DANS la section exclusive : ce qu'un envoi précédent a déjà marqué SENT est exclu.
  const lines = await loadPendingLines(tenantId, remittanceId);
  if (lines.length === 0) return counters;

  let config: Awaited<ReturnType<typeof getEmailNotificationConfig>> | null = null;
  try {
    config = await getEmailNotificationConfig(tenantId, 'SYNDIC_DIRECT_DEBIT_PRENOTIFICATION');
  } catch (error) {
    logger.warn('Prénotification de prélèvement de charges : lecture de la configuration impossible', {
      tenantId,
      errorName: errorNameOf(error)
    });
  }

  const processLine = async (line: PendingLine): Promise<void> => {
    let status: PrenotificationStatus = 'FAILED';
    let recipient: string | null = null;
    try {
      const { debtorContact, lot } = line;
      if (!debtorContact || !lot) {
        // Une ligne de copropriété porte toujours un lot et un contact débiteur.
        throw new Error('Prénotification : ligne sans lot ni contact débiteur');
      }
      if (config === null) {
        status = 'FAILED';
      } else if (!config.enabled) {
        status = 'DISABLED';
      } else {
        recipient = debtorContact.email?.trim() || null;
        if (!recipient) {
          status = 'NO_EMAIL';
        } else {
          await emailService.sendSyndicDirectDebitPrenotification(
            recipient,
            {
              debtorName: contactDisplayName(debtorContact) ?? t('Copropriétaire'),
              agencyName: remittance.tenant?.name ?? t('Votre agence'),
              syndicateName: remittance.syndicate?.name ?? t('Votre copropriété'),
              lotNumber: lot.lotNumber,
              amount: amountLabel(Number(line.amount)),
              collectionDate: formatFrenchDate(remittance.collectionDate),
              ibanMasked: maskIban(line.mandate.ibanLast4),
              mandateReference: mandateReferenceOf(line.mandate.year, line.mandate.sequence),
              creditorIdentifier: remittance.creditorIdentifierSnapshot ?? ''
            },
            {
              tenantId,
              templateOverrides:
                config.subjectOverride || config.bodyHtmlOverride
                  ? { subject: config.subjectOverride, bodyHtml: config.bodyHtmlOverride }
                  : undefined
            }
          );
          status = 'SENT';
        }
      }
    } catch (error) {
      // Jamais l'adresse ni le message du transport : seulement le type d'erreur.
      logger.warn('Prénotification de prélèvement de charges : envoi échoué', {
        tenantId,
        remittanceId,
        errorName: errorNameOf(error)
      });
      status = 'FAILED';
    }

    if (status === 'SENT') counters.sent += 1;
    else if (status === 'NO_EMAIL') counters.noEmail += 1;
    else if (status === 'DISABLED') counters.disabled += 1;
    else counters.failed += 1;

    // Statut écrit ligne par ligne, dès l'envoi : un arrêt du serveur ne fait pas renvoyer ce qui est parti.
    try {
      await prisma.directDebitRemittanceLine.updateMany({
        where: { id: line.id, tenantId, remittanceId, status: 'PENDING' },
        data: {
          prenotificationStatus: status,
          prenotifiedAt: status === 'SENT' ? new Date() : null,
          // Adresse masquée seulement, quand un avis est parti (ou a échoué) vers une adresse connue.
          ...((status === 'SENT' || status === 'FAILED') && recipient
            ? {
                prenotificationRecipientMasked: maskEmail(recipient),
                prenotificationRecipientSource: 'CONTACT' as const
              }
            : {})
        }
      });
    } catch (error) {
      logger.warn('Prénotification de prélèvement de charges : statut non enregistré', {
        tenantId,
        remittanceId,
        errorName: errorNameOf(error)
      });
    }
  };

  await forEachLimited(lines, SYNDIC_PRENOTIFICATION_CONCURRENCY, processLine);

  logAuditEvent({
    actorUserId: actorUserId ?? null,
    tenantId,
    actionKey: AuditActionKey.DIRECT_DEBIT_REMITTANCE_PRENOTIFIED,
    entityType: 'DirectDebitRemittance',
    entityId: remittanceId,
    payload: {
      scope: 'SYNDIC_LOT',
      syndicateId: remittance.syndicateId,
      reference: remittanceReferenceOf(remittance.year, remittance.sequence),
      lineCount: lines.length,
      collectionDate: formatFrenchDate(remittance.collectionDate),
      ...counters
    }
  });
  return counters;
}

/**
 * Envoie les prénotifications des lignes PENDING de la remise de copropriété
 * dont la prénotification n'est pas déjà SENT, met à jour leur statut ligne par
 * ligne et écrit l'audit avec les compteurs. Sous verrou exclusif par remise.
 * Ne lève pas pour un échec d'envoi ; attendable (tests, arrêt propre).
 */
export function sendSyndicRemittancePrenotifications(
  tenantId: string,
  remittanceId: string,
  actorUserId?: string | null
): Promise<SyndicPrenotificationCounters> {
  return withExclusiveSection(
    `syndic-direct-debit-remittance-prenotification:${tenantId}:${remittanceId}`,
    () => runPrenotifications(tenantId, remittanceId, actorUserId),
    SECTION_OPTIONS
  );
}

const inFlight = new Set<Promise<unknown>>();

/**
 * Lance l'envoi en arrière-plan : la promesse n'est pas attendue par l'appelant,
 * son échec (verrou indisponible, base injoignable…) est attrapé et journalisé
 * sans adresse ni IBAN.
 */
export function startSyndicRemittancePrenotifications(
  tenantId: string,
  remittanceId: string,
  actorUserId?: string | null
): void {
  const task: Promise<unknown> = sendSyndicRemittancePrenotifications(tenantId, remittanceId, actorUserId)
    .catch(error => {
      logger.warn('Prénotification de prélèvement de charges : envoi en arrière-plan interrompu', {
        tenantId,
        remittanceId,
        errorName: errorNameOf(error)
      });
    })
    .finally(() => {
      inFlight.delete(task);
    });
  inFlight.add(task);
}

/** Attend les envois lancés en arrière-plan (tests, arrêt du serveur). */
export async function waitForSyndicRemittancePrenotifications(): Promise<void> {
  while (inFlight.size > 0) await Promise.all([...inFlight]);
}
