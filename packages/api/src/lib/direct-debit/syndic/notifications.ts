import { t } from '../../../i18n';
import { getEmailNotificationConfig } from '../../../services/email-notification-config-service';
import { emailService } from '../../../services/email-service';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { formatFrenchDate } from '../business-days';
import { contactDisplayName } from '../dto';
import { maskIban } from '../iban';
import { mandateReferenceOf } from '../remittance-dto';
import { emailReasonOf } from '../returns/shared';

/**
 * Avis de rejet d'un prélèvement de charges au copropriétaire (spec 042, P4,
 * data-model §9.3, clé `SYNDIC_DIRECT_DEBIT_REJECTED`).
 *
 * À APPELER PAR LE SERVICE DE RETOUR (lot P3) une fois la transaction du rejet
 * validée, pour une ligne `SYNDIC_LOT` : le constat est déjà enregistré, un
 * échec d'envoi ne le défait jamais. La fonction ne lève pas : elle renvoie
 * l'issue. Destinataire : e-mail de la fiche CRM du contact débiteur. Le message
 * ne porte que l'IBAN masqué ; dans les journaux, l'adresse est masquée
 * (`redactRecipient`) et une erreur de transport n'est journalisée que par son nom.
 */

export type SyndicRejectionNoticeOutcome = 'SENT' | 'NO_EMAIL' | 'DISABLED' | 'FAILED' | 'NOT_APPLICABLE';

const amountLabel = (amount: number) => `${new Intl.NumberFormat('fr-FR').format(amount)} FCFA`;
const errorNameOf = (error: unknown) => (error instanceof Error ? error.name : 'UnknownError');

/**
 * @param suspended le rejet a fait suspendre le mandat (seuil de rejets consécutifs atteint)
 */
export async function sendSyndicDirectDebitRejectionNotice(
  tenantId: string,
  lineId: string,
  options: { suspended?: boolean } = {}
): Promise<SyndicRejectionNoticeOutcome> {
  try {
    const line = await prisma.directDebitRemittanceLine.findFirst({
      where: { id: lineId, tenantId, remittance: { scope: 'SYNDIC_LOT' } },
      select: {
        amount: true,
        debtorContactId: true,
        rejectionCode: true,
        rejectionReason: true,
        mandate: { select: { year: true, sequence: true, ibanLast4: true } },
        lot: { select: { lotNumber: true } },
        debtorContact: {
          select: { contactType: true, firstName: true, lastName: true, legalName: true, email: true }
        },
        remittance: {
          select: {
            collectionDate: true,
            tenant: { select: { name: true } },
            syndicate: { select: { name: true } }
          }
        }
      }
    });
    if (!line || !line.debtorContact || !line.lot) return 'NOT_APPLICABLE';

    const config = await getEmailNotificationConfig(tenantId, 'SYNDIC_DIRECT_DEBIT_REJECTED');
    if (!config.enabled) return 'DISABLED';
    const to = line.debtorContact.email?.trim();
    if (!to) return 'NO_EMAIL';

    await emailService.sendSyndicDirectDebitRejected(
      to,
      {
        debtorName: contactDisplayName(line.debtorContact) ?? t('Copropriétaire'),
        agencyName: line.remittance.tenant?.name ?? t('Votre agence'),
        syndicateName: line.remittance.syndicate?.name ?? t('Votre copropriété'),
        lotNumber: line.lot.lotNumber,
        mandateReference: mandateReferenceOf(line.mandate.year, line.mandate.sequence),
        ibanMasked: maskIban(line.mandate.ibanLast4),
        amount: amountLabel(Number(line.amount)),
        collectionDate: formatFrenchDate(line.remittance.collectionDate),
        // Texte venu d'un fichier de la banque : sans lien, court (comme l'avis locatif).
        reason: emailReasonOf(line.rejectionReason) || line.rejectionCode?.trim() || t('Rejet par la banque'),
        // Aucun frais de rejet n'est refacturé en copropriété.
        rejectFee: '',
        suspensionNotice: options.suspended
          ? t(
              "Le mandat de prélèvement est suspendu : aucun prélèvement ne sera présenté tant qu'il n'est pas réactivé."
            )
          : ''
      },
      {
        tenantId,
        templateOverrides:
          config.subjectOverride || config.bodyHtmlOverride
            ? { subject: config.subjectOverride, bodyHtml: config.bodyHtmlOverride }
            : undefined,
        journal: {
          recipient: { email: to, ...(line.debtorContactId ? { contactId: line.debtorContactId } : {}) },
          relatedEntity: { type: 'DirectDebit', id: lineId }
        }
      }
    );
    return 'SENT';
  } catch (error) {
    // Jamais l'adresse ni le message du transport : seulement le type d'erreur.
    logger.warn('Rejet de prélèvement de charges : avis non envoyé', {
      tenantId,
      lineId,
      errorName: errorNameOf(error)
    });
    return 'FAILED';
  }
}
