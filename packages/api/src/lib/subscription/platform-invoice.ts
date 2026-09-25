/**
 * Factures PLATFORM (abonnement ImmoTopia -> agence), vague 3 lot A —
 * fonctions PURES : numerotation, assemblage des lignes, avoir.
 * Reference : docs/architecture/PLAN-ABONNEMENTS.md (§6 quater).
 *
 * Montants en FCFA entiers, HT par ligne ; la TVA (18 %) est une ligne TAX
 * separee calculee sur le total HT (`finalizeInvoice`).
 */

import { PLATFORM_TAX_RATE_PERCENT } from './catalog';
import { ChargeLine, InvoiceLineKindCode, InvoiceTotals, finalizeInvoice, roundFcfa } from './pricing';

/** Prefixe de la serie continue des factures de la plateforme. */
export const PLATFORM_INVOICE_PREFIX = 'IMT';
/** Numero provisoire d'un brouillon (le vrai numero n'est attribue qu'a l'emission). */
export const DRAFT_NUMBER_PREFIX = 'BROUILLON-';

/** IMT-AAAA-NNNNN (numero sur 5 chiffres au moins). */
export function formatPlatformInvoiceNumber(year: number, sequence: number): string {
  if (!Number.isInteger(year) || !Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Numero de facture invalide : ${year}/${sequence}`);
  }
  return `${PLATFORM_INVOICE_PREFIX}-${year}-${String(sequence).padStart(5, '0')}`;
}

/** Lit un numero IMT-AAAA-NNNNN ; null pour un brouillon ou un autre format. */
export function parsePlatformInvoiceNumber(value: string): { year: number; sequence: number } | null {
  const match = /^IMT-(\d{4})-(\d{5,})$/.exec(value);
  return match ? { year: Number(match[1]), sequence: Number(match[2]) } : null;
}

export function isDraftNumber(value: string): boolean {
  return value.startsWith(DRAFT_NUMBER_PREFIX);
}

/** Mentions de l'emetteur (Alliance Consultants), figees dans la facture a l'emission. */
export interface PlatformIssuerInfo {
  name: string;
  address: string | null;
  rccm: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
}

/** Mentions du client (l'agence), figees a l'emission. */
export interface PlatformCustomerInfo {
  tenantId: string;
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
}

/** Ordre d'affichage des lignes d'une facture. */
const KIND_ORDER: Record<InvoiceLineKindCode, number> = {
  PACK: 10,
  EXTENSION: 20,
  DISCOUNT: 30,
  PRORATA: 40,
  SETUP: 50,
  OVERAGE: 60,
  USAGE: 65,
  CREDIT: 70,
  TAX: 90
};

export function sortInvoiceLines<T extends { kind: InvoiceLineKindCode }>(lines: readonly T[]): T[] {
  return lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => KIND_ORDER[a.line.kind] - KIND_ORDER[b.line.kind] || a.index - b.index)
    .map(x => x.line);
}

export const CARRY_FORWARD_LABEL = 'Solde créditeur reporté sur la prochaine facture';

export interface AssembledInvoice extends InvoiceTotals {
  /**
   * Montant HT (negatif) a reporter en ligne CREDIT en attente sur la
   * prochaine facture quand les avoirs depassent la facture ; 0 sinon.
   */
  carryForward: number;
}

/**
 * Assemble les lignes HT d'une facture (sans TVA) : tri, ligne TAX, totaux.
 * Si les credits depassent le montant du (total HT negatif), la facture est
 * ramenee a zero par une ligne CREDIT positive et le reste est reporte
 * (`carryForward`) : une facture PLATFORM n'est jamais negative, seul un
 * avoir l'est.
 */
export function assembleInvoice(lines: readonly ChargeLine[], taxRate = PLATFORM_TAX_RATE_PERCENT): AssembledInvoice {
  const sorted = sortInvoiceLines(lines.filter(l => l.kind !== 'TAX'));
  const subtotal = sorted.reduce((s, l) => s + l.amount, 0);
  let carryForward = 0;
  if (subtotal < 0) {
    carryForward = subtotal;
    sorted.push({
      kind: 'CREDIT',
      label: CARRY_FORWARD_LABEL,
      quantity: 1,
      unitPrice: -subtotal,
      amount: -subtotal
    });
  }
  return { ...finalizeInvoice(sorted, taxRate), carryForward };
}

/**
 * Lignes d'un avoir : chaque ligne de la facture annulee, TVA comprise, au
 * montant oppose. Les totaux sont exactement l'oppose de la facture.
 */
export function creditNoteLines(lines: readonly ChargeLine[]): { lines: ChargeLine[]; amountExclTax: number; taxAmount: number; amountTotal: number } {
  const out = lines.map(l => ({
    ...l,
    unitPrice: -l.unitPrice,
    amount: -l.amount
  }));
  const taxAmount = out.filter(l => l.kind === 'TAX').reduce((s, l) => s + l.amount, 0);
  const amountExclTax = out.filter(l => l.kind !== 'TAX').reduce((s, l) => s + l.amount, 0);
  return { lines: out, amountExclTax, taxAmount, amountTotal: amountExclTax + taxAmount };
}

/**
 * Retire des lignes d'un apercu celles qui correspondent aux lignes en
 * attente (prorata, avoirs) : ces dernieres ne sont pas recreees, elles sont
 * rattachees telles quelles a la facture. Correspondance par nature,
 * libelle, montant et element d'abonnement, une ligne d'apercu par ligne en
 * attente.
 */
export function withoutPendingLines(
  previewLines: readonly ChargeLine[],
  pending: ReadonlyArray<Pick<ChargeLine, 'kind' | 'label' | 'amount' | 'subscriptionItemId'>>
): ChargeLine[] {
  const remaining = [...previewLines];
  for (const p of pending) {
    const index = remaining.findIndex(
      l =>
        l.kind === p.kind &&
        l.label === p.label &&
        roundFcfa(l.amount) === roundFcfa(p.amount) &&
        (l.subscriptionItemId ?? null) === (p.subscriptionItemId ?? null)
    );
    if (index >= 0) remaining.splice(index, 1);
  }
  return remaining;
}

/** Ajoute `days` jours (UTC) a une date. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
