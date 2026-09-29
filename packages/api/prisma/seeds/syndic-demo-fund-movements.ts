/**
 * Calcul pur de l'historique des fonds de copropriete pour le seed de demo
 * (`syndic-demo-seed.ts`), extrait pour etre teste sans base de donnees.
 *
 * Journal `SyndicateFundMovement` (schema de main : `tenantId`, `fundId`,
 * `direction` CREDIT/DEBIT, `amount`, `balanceAfter`, `label`, `sourceType`,
 * `sourceId`, `createdAt`) — meme sens que le journal tenu par l'application
 * (`src/lib/syndics/fund-credits.ts`, `recordFundMovementTx`) :
 *
 * - OPENING : solde repris a la date de debut de gestion (un credit par fonds).
 * - CHARGE_PAYMENT : part d'un paiement de charges versee au fonds de travaux,
 *   au prorata de la part annuelle du lot sur le poste "fonds de travaux"
 *   (`fundShare`) rapportee a sa part annuelle totale (`annual`) — meme regle
 *   que `budgetSharesTx` dans `fund-credits.ts`, ici appliquee directement
 *   plutot que via `BudgetAllocation.breakdown` puisque le seed connait deja
 *   ces totaux. Seuls les paiements d'un appel REGULAR (trimestriel, issu
 *   d'un budget) alimentent le fonds ; un appel EXCEPTIONAL ou REPRISE n'a pas
 *   de part "fonds de travaux".
 * - MANUAL_EXPENSE : prelevement sur le fonds (travaux voted, saisi a la main).
 *
 * Le solde d'un fonds est TOUJOURS la somme de son journal : cette fonction
 * calcule `balanceAfter` en cumulant les mouvements tries chronologiquement
 * (ordre stable a date egale) et leve si un solde intermediaire devient
 * negatif, pour que l'appelant ne puisse pas ecrire un journal incoherent.
 */

export type FundMovementDirection = 'CREDIT' | 'DEBIT';
export type FundMovementSource = 'OPENING' | 'CHARGE_PAYMENT' | 'MANUAL_EXPENSE';

export interface FundOpeningInput {
  fundId: string;
  amount: number;
  date: Date;
  label: string;
}

/** Paiement d'un appel, tel qu'ecrit dans `paymentRows` par le seed. */
export interface FundPaymentInput {
  paymentId: string;
  chargeCallId: string;
  amount: number;
  paidAt: Date;
  lotId: string;
  lotNum: string;
  period: string;
  year: number;
  kind: 'REGULAR' | 'EXCEPTIONAL' | 'REPRISE';
}

export interface FundExpenseInput {
  fundId: string;
  amount: number;
  date: Date;
  label: string;
}

export interface BuildFundMovementsInput {
  tenantId: string;
  /** Fonds credite par la part "fonds de travaux" des paiements. */
  travauxFundId: string;
  openings: FundOpeningInput[];
  payments: FundPaymentInput[];
  /** Part annuelle totale (tous postes) du lot, par annee — cle `${year}`. */
  lotAnnualByYear: Map<string, Map<string, number>>;
  /** Part annuelle du lot au poste "fonds de travaux", par annee. */
  fundLotAnnualByYear: Map<number, Map<string, number>>;
  expenses: FundExpenseInput[];
}

export interface FundMovementRow {
  tenantId: string;
  fundId: string;
  direction: FundMovementDirection;
  amount: number;
  balanceAfter: number;
  label: string;
  sourceType: FundMovementSource;
  sourceId: string | null;
  createdAt: Date;
}

export interface BuildFundMovementsResult {
  movements: FundMovementRow[];
  /** Solde final de chaque fonds = somme de son journal (dernier `balanceAfter`). */
  balances: Map<string, number>;
}

/** Arrondi au centime, comme `roundMoney` (`lib/syndics/finance-utils.ts`). */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

interface Candidate {
  fundId: string;
  direction: FundMovementDirection;
  amount: number;
  label: string;
  sourceType: FundMovementSource;
  sourceId: string | null;
  date: Date;
  order: number;
}

function creditLabel(lotNum: string, period: string): string {
  return `Part du paiement ${period} — lot ${lotNum}`;
}

/**
 * Construit le journal complet (ouvertures, parts de paiements, depenses),
 * trie par date puis par ordre d'insertion (stable), et calcule le solde
 * cumule de chaque fonds. Leve si un solde intermediaire devient negatif.
 */
export function buildSyndicFundMovements(input: BuildFundMovementsInput): BuildFundMovementsResult {
  const candidates: Candidate[] = [];
  let order = 0;

  for (const opening of input.openings) {
    const amount = roundCents(opening.amount);
    if (amount <= 0) continue;
    candidates.push({
      fundId: opening.fundId,
      direction: 'CREDIT',
      amount,
      label: opening.label,
      sourceType: 'OPENING',
      sourceId: null,
      date: opening.date,
      order: order++
    });
  }

  for (const payment of input.payments) {
    if (payment.kind !== 'REGULAR') continue;
    const annual = input.lotAnnualByYear.get(String(payment.year))?.get(payment.lotId) ?? 0;
    const fundShare = input.fundLotAnnualByYear.get(payment.year)?.get(payment.lotId) ?? 0;
    if (annual <= 0 || fundShare <= 0) continue;
    const amount = roundCents((payment.amount * fundShare) / annual);
    if (amount <= 0) continue;
    candidates.push({
      fundId: input.travauxFundId,
      direction: 'CREDIT',
      amount,
      label: creditLabel(payment.lotNum, payment.period),
      sourceType: 'CHARGE_PAYMENT',
      sourceId: payment.paymentId,
      date: payment.paidAt,
      order: order++
    });
  }

  for (const expense of input.expenses) {
    const amount = roundCents(expense.amount);
    if (amount <= 0) continue;
    candidates.push({
      fundId: expense.fundId,
      direction: 'DEBIT',
      amount,
      label: expense.label,
      sourceType: 'MANUAL_EXPENSE',
      sourceId: null,
      date: expense.date,
      order: order++
    });
  }

  candidates.sort((a, b) => a.date.getTime() - b.date.getTime() || a.order - b.order);

  const balances = new Map<string, number>();
  const movements: FundMovementRow[] = candidates.map(c => {
    const previous = balances.get(c.fundId) ?? 0;
    const next = roundCents(c.direction === 'CREDIT' ? previous + c.amount : previous - c.amount);
    if (next < 0) {
      throw new Error(
        `Solde negatif pour le fonds ${c.fundId} apres "${c.label}" (${c.direction} ${c.amount}) : ${next}`
      );
    }
    balances.set(c.fundId, next);
    return {
      tenantId: input.tenantId,
      fundId: c.fundId,
      direction: c.direction,
      amount: c.amount,
      balanceAfter: next,
      label: c.label,
      sourceType: c.sourceType,
      sourceId: c.sourceId,
      createdAt: c.date
    };
  });

  return { movements, balances };
}
