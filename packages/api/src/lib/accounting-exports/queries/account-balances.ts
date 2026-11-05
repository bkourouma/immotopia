import { Prisma } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { roundMoney } from '../../finance/money';
import { amount, Period } from '../service';
import type { AccountBalanceRow } from '../types';
import { compareStrings } from './sql';

interface RawBalance {
  id: string;
  account_number: string;
  account_name: string;
  account_class: number;
  opening: unknown;
  period_debit: unknown;
  period_credit: unknown;
}

/** Date SQL robuste au fuseau de session : l'ISO est lu comme heure murale UTC d'une colonne `timestamp`. */
export const ts = (date: Date) => Prisma.sql`${date.toISOString()}::timestamp`;

/**
 * Soldes de TOUS les comptes mouvementés de l'agence sur la période, en un
 * seul passage SQL (ouverture, mouvements de la période). Alimente la balance
 * générale, le récapitulatif du grand livre et les voisins « précédent /
 * suivant ». Sens : débit − crédit. Un compte sans ouverture ni mouvement est
 * écarté.
 *
 * `journal_entry_lines` n'a pas de `tenant_id` : le filtre d'agence est posé
 * sur `journal_entries` ET sur `chart_of_accounts`.
 */
export async function getAccountBalances(
  tenantId: string,
  period: Pick<Period, 'from' | 'to'>
): Promise<AccountBalanceRow[]> {
  const from = ts(period.from);
  const rows = await prisma.$queryRaw<RawBalance[]>(Prisma.sql`
    SELECT a.id, a.account_number, a.account_name, a.account_class,
      COALESCE(SUM(l.debit - l.credit) FILTER (WHERE e.entry_date < ${from}), 0) AS opening,
      COALESCE(SUM(l.debit) FILTER (WHERE e.entry_date >= ${from}), 0) AS period_debit,
      COALESCE(SUM(l.credit) FILTER (WHERE e.entry_date >= ${from}), 0) AS period_credit
    FROM journal_entry_lines l
    JOIN journal_entries e ON e.id = l.entry_id AND e.tenant_id = ${tenantId}
    JOIN chart_of_accounts a ON a.id = l.account_id AND a.tenant_id = ${tenantId}
      AND a.scope = 'OPERATIONS'::"AccountingScope"
    WHERE e.entry_date <= ${ts(period.to)}
    GROUP BY a.id, a.account_number, a.account_name, a.account_class
    ORDER BY a.account_number, a.id
  `);

  return (
    rows
      .map(row => {
        const openingBalance = amount(row.opening);
        const totalDebit = amount(row.period_debit);
        const totalCredit = amount(row.period_credit);
        return {
          id: row.id,
          accountNumber: row.account_number,
          accountName: row.account_name,
          accountClass: Number(row.account_class),
          openingBalance,
          totalDebit,
          totalCredit,
          closingBalance: roundMoney(openingBalance + totalDebit - totalCredit)
        };
      })
      // Un compte sans solde d'ouverture ni mouvement n'a rien à dire.
      .filter(r => r.openingBalance !== 0 || r.totalDebit !== 0 || r.totalCredit !== 0)
      .sort((a, b) => compareStrings(a.accountNumber, b.accountNumber) || compareStrings(a.id, b.id))
  );
}
