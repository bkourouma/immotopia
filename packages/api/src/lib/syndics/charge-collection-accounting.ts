import type { PrismaTransactionClient } from '../../utils/database';
import { t } from '../../i18n';
import { roundMoney } from './finance-utils';
import {
  assertFiscalYearOpenTx,
  ensureSyndicAccountsTx,
  ensureSyndicJournalTx,
  postSyndicEntryTx,
  reverseSyndicEntryTx
} from './provider-invoice-accounting';

/**
 * Ecriture comptable d'un encaissement d'appel de charges (BUG-2026-09-30-086).
 *
 * Meme comptabilite de copropriete (portee SYNDICATE) que les factures et
 * paiements de prestataires (`provider-invoice-accounting.ts`), en miroir :
 *
 *   debit  521 Banque (571 Caisse si le reglement est en especes) ;
 *   credit 450 Coproprietaires, ligne rattachee au lot payeur.
 *
 * UNE ecriture par paiement (et non par affectation) : l'argent arrive une
 * fois. Imputer plus tard une avance sur un appel n'est pas un mouvement de
 * tresorerie et n'ecrit rien. L'affectation aux fonds (roulement, travaux)
 * reste tracee par les mouvements de fonds (`fund-credits.ts`), comme pour les
 * decaissements des prestataires.
 *
 * Idempotence : la cle est (`documentType`, `documentId` = paiement) ; une
 * seconde demande pour le meme paiement renvoie l'ecriture existante. L'appel
 * se fait sous le verrou du lot pris par `recordLotPaymentTx`, ce qui empeche
 * deux transactions concurrentes de doubler l'ecriture.
 *
 * Numerotation SYSCOHADA a valider par un comptable.
 */

export const CHARGE_PAYMENT_DOCUMENT_TYPE = 'SYNDIC_CHARGE_PAYMENT';
export const CHARGE_PAYMENT_CANCEL_DOCUMENT_TYPE = 'SYNDIC_CHARGE_PAYMENT_CANCEL';

/** Un reglement en especes passe par la caisse, tout autre par la banque. */
export function isCashMethod(method: string | null | undefined): boolean {
  return /^\s*(cash|caisse|esp[eè]ces?)\s*$/i.test(method ?? '');
}

export interface ChargePaymentEntryInput {
  tenantId: string;
  syndicateId: string;
  lotId: string;
  paymentId: string;
  amount: number;
  paidAt: Date;
  method?: string | null;
  reference?: string | null;
}

/** Reference de l'ecriture : \`EC-\` puis le debut de l'identifiant du paiement. */
export function chargePaymentEntryReference(paymentId: string): string {
  return `EC-${paymentId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

/**
 * Passe l'ecriture d'un encaissement (ou renvoie celle qui existe deja).
 * Refuse un exercice clos ; cree les comptes et le journal manquants.
 */
export async function postChargePaymentEntryTx(
  tx: PrismaTransactionClient,
  input: ChargePaymentEntryInput
): Promise<string> {
  const existing = await tx.journalEntry.findFirst({
    where: { tenantId: input.tenantId, documentType: CHARGE_PAYMENT_DOCUMENT_TYPE, documentId: input.paymentId },
    select: { id: true }
  });
  if (existing) return existing.id;

  const amount = roundMoney(input.amount);
  await assertFiscalYearOpenTx(tx, input.syndicateId, input.paidAt);

  const cash = isCashMethod(input.method);
  const treasuryNumber = cash ? '571' : '521';
  const accounts = await ensureSyndicAccountsTx(tx, input.tenantId, input.syndicateId, ['450', treasuryNumber]);
  const journalId = await ensureSyndicJournalTx(
    tx,
    input.tenantId,
    input.syndicateId,
    cash ? 'CASH' : 'BANK',
    input.paidAt
  );

  const lot = await tx.syndicateLot.findFirst({
    where: { id: input.lotId, syndicateId: input.syndicateId },
    select: { lotNumber: true }
  });
  const lotText = lot?.lotNumber ? ` - lot ${lot.lotNumber}` : '';
  const referenceText = input.reference ? ` (${input.reference})` : '';
  const label = `${t('Encaissement appel de charges')}${lotText}${referenceText}`.slice(0, 250);

  return postSyndicEntryTx(tx, {
    tenantId: input.tenantId,
    journalId,
    entryDate: input.paidAt,
    reference: chargePaymentEntryReference(input.paymentId),
    description: label,
    sourceType: 'CHARGE_PAYMENT',
    sourceId: input.paymentId,
    documentType: CHARGE_PAYMENT_DOCUMENT_TYPE,
    lines: [
      { accountId: accounts.get(treasuryNumber)!, debit: amount, credit: 0, label },
      { accountId: accounts.get('450')!, lotId: input.lotId, debit: 0, credit: amount, label }
    ]
  });
}

/**
 * Annule l'encaissement d'un paiement : contre-passation de son ecriture (sens
 * inverses, lot conserve). Sans effet si le paiement n'a pas d'ecriture ou si
 * elle est deja annulee. Renvoie l'identifiant de la contre-ecriture.
 */
export async function reverseChargePaymentEntryTx(
  tx: PrismaTransactionClient,
  params: { tenantId: string; paymentId: string; date: Date; reason?: string | null }
): Promise<string | null> {
  const entry = await tx.journalEntry.findFirst({
    where: {
      tenantId: params.tenantId,
      documentType: CHARGE_PAYMENT_DOCUMENT_TYPE,
      documentId: params.paymentId,
      voidedByEntryId: null
    },
    select: { id: true, reference: true }
  });
  if (!entry) return null;
  const reason = params.reason ? ` - ${params.reason}` : '';
  return reverseSyndicEntryTx(tx, {
    tenantId: params.tenantId,
    entryId: entry.id,
    date: params.date,
    description: `${t('Annulation encaissement')} ${entry.reference}${reason}`.slice(0, 250),
    documentType: CHARGE_PAYMENT_CANCEL_DOCUMENT_TYPE
  });
}
