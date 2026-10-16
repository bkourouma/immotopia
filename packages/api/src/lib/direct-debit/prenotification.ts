import { t } from '../../i18n';
import { getEmailNotificationConfig } from '../../services/email-notification-config-service';
import { emailService } from '../../services/email-service';
import { logAuditEvent } from '../../services/audit-service';
import { AuditActionKey } from '../../types/audit-types';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { formatFrenchDate } from './business-days';
import { resolveDebtorNames } from './dto';
import { maskIban } from './iban';
import { mandateReferenceOf, remittanceReferenceOf, type PrenotificationStatus } from './remittance-dto';

/**
 * Prénotification des débiteurs (spec 042, P2, data-model §7.5, décision D7).
 *
 * Appelée APRÈS la transaction de validation ou sur demande de renvoi : chaque
 * ligne est traitée isolément (une erreur d'envoi n'arrête pas les autres et ne
 * fait pas échouer la validation). Le message ne contient que l'IBAN MASQUÉ ;
 * ni l'adresse e-mail ni le texte de l'erreur du transport ne sont journalisés.
 */

export interface PrenotificationCounters {
  sent: number;
  noEmail: number;
  disabled: number;
  failed: number;
}

const amountLabel = (amount: number) => `${new Intl.NumberFormat('fr-FR').format(amount)} FCFA`;

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

/**
 * Envoie les prénotifications des lignes PENDING dont la prénotification n est
 * pas déjà SENT, met à jour leur statut et écrit l audit. Ne lève jamais pour
 * un échec d envoi.
 */
export async function sendRemittancePrenotifications(
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
      collectionDate: true,
      creditorIdentifierSnapshot: true,
      tenant: { select: { name: true } }
    }
  });
  if (!remittance) return counters;

  const lines = await prisma.directDebitRemittanceLine.findMany({
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
  if (lines.length === 0) return counters;

  const debtors = lines.map(line => line.debtor);
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
      errorName: error instanceof Error ? error.name : 'UnknownError'
    });
  }

  for (const line of lines) {
    let status: PrenotificationStatus = 'FAILED';
    try {
      if (config === null) {
        status = 'FAILED';
      } else if (!config.enabled) {
        status = 'DISABLED';
      } else {
        const to = emails.get(line.debtor.id);
        if (!to) {
          status = 'NO_EMAIL';
        } else {
          await emailService.sendDirectDebitPrenotification(
            to,
            {
              debtorName: names.get(line.debtor.id) ?? t('Locataire'),
              agencyName: remittance.tenant?.name ?? t('Votre agence'),
              amount: amountLabel(Number(line.amount)),
              collectionDate: formatFrenchDate(remittance.collectionDate),
              period: `${String(line.installment.period_month).padStart(2, '0')}/${line.installment.period_year}`,
              leaseNumber: line.lease.lease_number,
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
      // Jamais l adresse ni le message du transport : seulement le type d erreur.
      logger.warn('Prénotification de prélèvement : envoi échoué', {
        tenantId,
        remittanceId,
        errorName: error instanceof Error ? error.name : 'UnknownError'
      });
      status = 'FAILED';
    }

    if (status === 'SENT') counters.sent += 1;
    else if (status === 'NO_EMAIL') counters.noEmail += 1;
    else if (status === 'DISABLED') counters.disabled += 1;
    else counters.failed += 1;

    try {
      await prisma.directDebitRemittanceLine.updateMany({
        where: { id: line.id, tenantId, remittanceId, status: 'PENDING' },
        data: { prenotificationStatus: status, prenotifiedAt: status === 'SENT' ? new Date() : null }
      });
    } catch (error) {
      logger.warn('Prénotification de prélèvement : statut non enregistré', {
        tenantId,
        remittanceId,
        errorName: error instanceof Error ? error.name : 'UnknownError'
      });
    }
  }

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
