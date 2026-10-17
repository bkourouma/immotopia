import { t } from '../../i18n';
import { getEmailNotificationConfig } from '../../services/email-notification-config-service';
import { emailService } from '../../services/email-service';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { withExclusiveSection } from '../ai/advisory-lock';
import { formatFrenchDate } from './business-days';
import { resolveDebtorNames } from './dto';
import { maskIban } from './iban';
import { mandateReferenceOf, remittanceReferenceOf, type PrenotificationStatus } from './remittance-dto';

/**
 * Prénotification des débiteurs (spec 042, P2, data-model §7.5, décision D7).
 *
 * Lancée EN ARRIÈRE-PLAN après la transaction de validation ou sur demande de
 * renvoi (la route répond sans attendre les e-mails). Une section exclusive par
 * remise (verrou consultatif PostgreSQL, `lib/ai/advisory-lock.ts` : mécanisme
 * générique, seul son dossier est celui de l'IA) empêche deux envois
 * simultanés : un deuxième déclenchement attend la fin du premier, puis ne relit
 * que les lignes pas encore SENT, donc n'envoie aucun doublon. Chaque ligne est
 * traitée isolément (une erreur d'envoi n'arrête pas les autres et ne défait pas
 * la validation), cinq envois au plus en même temps. Le message ne contient que
 * l'IBAN MASQUÉ ; dans les journaux l'adresse du débiteur est masquée
 * (`j***@domaine`, option `redactRecipient` de `sendEmail`) et une erreur de
 * transport n'est journalisée que par son nom et son code.
 */

export interface PrenotificationCounters {
  sent: number;
  noEmail: number;
  disabled: number;
  failed: number;
}

/** Nombre maximal d'e-mails envoyés en même temps pour une remise. */
export const PRENOTIFICATION_CONCURRENCY = 5;

/** Une remise de plusieurs centaines de lignes peut durer plusieurs minutes. */
const SECTION_OPTIONS = { maxWaitMs: 10_000, timeoutMs: 15 * 60_000 };

const amountLabel = (amount: number) => `${new Intl.NumberFormat('fr-FR').format(amount)} FCFA`;
const errorNameOf = (error: unknown) => (error instanceof Error ? error.name : 'UnknownError');

/** E-mail du débiteur : le compte utilisateur, sinon le contact CRM de l'agence. Jamais renvoyé. */
async function resolveEmails(
  tenantId: string,
  debtors: Array<{ id: string; details: unknown; user: { email: string | null } | null }>
): Promise<Map<string, string | null>> {
  const emails = new Map<string, string | null>();
  const missing: Array<{ id: string; contactId: string }> = [];
  for (const debtor of debtors) {
    const own = debtor.user?.email?.trim();
    if (own) {
      emails.set(debtor.id, own);
      continue;
    }
    emails.set(debtor.id, null);
    const contactId = (debtor.details as { crmContactId?: unknown } | null)?.crmContactId;
    if (typeof contactId === 'string' && contactId) missing.push({ id: debtor.id, contactId });
  }
  if (missing.length > 0) {
    const contacts = await prisma.crmContact.findMany({
      where: { id: { in: [...new Set(missing.map(entry => entry.contactId))] }, tenantId },
      select: { id: true, email: true }
    });
    const byId = new Map(contacts.map(contact => [contact.id, contact.email?.trim() || null]));
    for (const entry of missing) emails.set(entry.id, byId.get(entry.contactId) ?? null);
  }
  return emails;
}

function loadPendingLines(tenantId: string, remittanceId: string) {
  return prisma.directDebitRemittanceLine.findMany({
    where: { tenantId, remittanceId, status: 'PENDING', prenotificationStatus: { not: 'SENT' } },
    select: {
      id: true,
      amount: true,
      mandate: { select: { year: true, sequence: true, ibanLast4: true } },
      lease: { select: { lease_number: true } },
      installment: { select: { period_year: true, period_month: true } },
      debtor: { select: { id: true, details: true, user: { select: { fullName: true, email: true } } } }
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
): Promise<PrenotificationCounters> {
  const counters: PrenotificationCounters = { sent: 0, noEmail: 0, disabled: 0, failed: 0 };

  const remittance = await prisma.directDebitRemittance.findFirst({
    where: { id: remittanceId, tenantId },
    select: {
      year: true,
      sequence: true,
      status: true,
      collectionDate: true,
      creditorIdentifierSnapshot: true,
      tenant: { select: { name: true } }
    }
  });
  if (!remittance) return counters;
  // Une remise annulée entre-temps n'envoie plus rien.
  if (remittance.status !== 'VALIDATED' && remittance.status !== 'EXPORTED') return counters;

  // Relu DANS la section exclusive : ce qu'un envoi précédent a déjà marqué SENT est exclu.
  const lines = await loadPendingLines(tenantId, remittanceId);
  if (lines.length === 0) return counters;

  const debtors = lines
    .map(line => line.debtor)
    .filter((debtor): debtor is NonNullable<typeof debtor> => debtor !== null);
  const [names, emails] = await Promise.all([
    resolveDebtorNames(prisma, tenantId, debtors),
    resolveEmails(tenantId, debtors)
  ]);

  let config: Awaited<ReturnType<typeof getEmailNotificationConfig>> | null = null;
  try {
    config = await getEmailNotificationConfig(tenantId, 'DIRECT_DEBIT_PRENOTIFICATION');
  } catch (error) {
    logger.warn('Prénotification de prélèvement : lecture de la configuration impossible', {
      tenantId,
      errorName: errorNameOf(error)
    });
  }

  const processLine = async (line: PendingLine): Promise<void> => {
    let status: PrenotificationStatus = 'FAILED';
    try {
      const { debtor, installment, lease } = line;
      if (!debtor || !installment || !lease) {
        // Ligne de copropriété : sa prénotification est réalisée en P4 (spec 042 §9.3).
        throw new Error('Prénotification : ligne hors périmètre locatif');
      }
      if (config === null) {
        status = 'FAILED';
      } else if (!config.enabled) {
        status = 'DISABLED';
      } else {
        const to = emails.get(debtor.id);
        if (!to) {
          status = 'NO_EMAIL';
        } else {
          await emailService.sendDirectDebitPrenotification(
            to,
            {
              debtorName: names.get(debtor.id) ?? t('Locataire'),
              agencyName: remittance.tenant?.name ?? t('Votre agence'),
              amount: amountLabel(Number(line.amount)),
              collectionDate: formatFrenchDate(remittance.collectionDate),
              period: `${String(installment.period_month).padStart(2, '0')}/${installment.period_year}`,
              leaseNumber: lease.lease_number,
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
      logger.warn('Prénotification de prélèvement : envoi échoué', {
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
        data: { prenotificationStatus: status, prenotifiedAt: status === 'SENT' ? new Date() : null }
      });
    } catch (error) {
      logger.warn('Prénotification de prélèvement : statut non enregistré', {
        tenantId,
        remittanceId,
        errorName: errorNameOf(error)
      });
    }
  };

  await forEachLimited(lines, PRENOTIFICATION_CONCURRENCY, processLine);

  logAuditEvent({
    actorUserId: actorUserId ?? null,
    tenantId,
    actionKey: AuditActionKey.DIRECT_DEBIT_REMITTANCE_PRENOTIFIED,
    entityType: 'DirectDebitRemittance',
    entityId: remittanceId,
    payload: {
      reference: remittanceReferenceOf(remittance.year, remittance.sequence),
      lineCount: lines.length,
      collectionDate: formatFrenchDate(remittance.collectionDate),
      ...counters
    }
  });
  return counters;
}

/**
 * Envoie les prénotifications des lignes PENDING dont la prénotification n'est
 * pas déjà SENT, met à jour leur statut ligne par ligne et écrit l'audit avec
 * les compteurs. Sous verrou exclusif par remise. Ne lève pas pour un échec
 * d'envoi ; attendable (tests, arrêt propre).
 */
export function sendRemittancePrenotifications(
  tenantId: string,
  remittanceId: string,
  actorUserId?: string | null
): Promise<PrenotificationCounters> {
  return withExclusiveSection(
    `direct-debit-remittance-prenotification:${tenantId}:${remittanceId}`,
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
export function startRemittancePrenotifications(
  tenantId: string,
  remittanceId: string,
  actorUserId?: string | null
): void {
  const task: Promise<unknown> = sendRemittancePrenotifications(tenantId, remittanceId, actorUserId)
    .catch(error => {
      logger.warn('Prénotification de prélèvement : envoi en arrière-plan interrompu', {
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
export async function waitForRemittancePrenotifications(): Promise<void> {
  while (inFlight.size > 0) await Promise.all([...inFlight]);
}
