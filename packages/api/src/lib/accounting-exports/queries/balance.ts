import { roundMoney } from '../../finance/money';
import type { Period } from '../service';
import type {
  AccountBalanceRow,
  TrialBalanceData,
  TrialBalanceFilters,
  TrialBalanceLine,
  TrialBalanceTotals
} from '../types';
import { getAccountBalances } from './account-balances';
import { cleanSearch } from './sql';

/** Un solde présenté du côté de son signe : débiteur ou créditeur. */
function split(balance: number) {
  return balance >= 0 ? { debit: balance, credit: 0 } : { debit: 0, credit: roundMoney(-balance) };
}

function toLine(row: AccountBalanceRow): TrialBalanceLine {
  const o = split(row.openingBalance);
  const c = split(row.closingBalance);
  return {
    id: row.id,
    accountNumber: row.accountNumber,
    accountName: row.accountName,
    accountClass: row.accountClass,
    openingDebit: o.debit,
    openingCredit: o.credit,
    periodDebit: row.totalDebit,
    periodCredit: row.totalCredit,
    closingDebit: c.debit,
    closingCredit: c.credit
  };
}

function sumLines(lines: TrialBalanceLine[]): TrialBalanceTotals {
  const totals: TrialBalanceTotals = {
    openingDebit: 0,
    openingCredit: 0,
    periodDebit: 0,
    periodCredit: 0,
    closingDebit: 0,
    closingCredit: 0
  };
  for (const l of lines) {
    totals.openingDebit += l.openingDebit;
    totals.openingCredit += l.openingCredit;
    totals.periodDebit += l.periodDebit;
    totals.periodCredit += l.periodCredit;
    totals.closingDebit += l.closingDebit;
    totals.closingCredit += l.closingCredit;
  }
  for (const key of Object.keys(totals) as Array<keyof TrialBalanceTotals>) totals[key] = roundMoney(totals[key]);
  return totals;
}

/** Numéro commençant par la saisie, ou intitulé la contenant, sans tenir compte de la casse. */
export function matchesAccountSearch(row: { accountNumber: string; accountName: string }, search: string): boolean {
  const needle = search.toLowerCase();
  return row.accountNumber.toLowerCase().startsWith(needle) || row.accountName.toLowerCase().includes(needle);
}

export async function getTrialBalanceData(
  tenantId: string,
  period: Period,
  filters: TrialBalanceFilters = {}
): Promise<TrialBalanceData> {
  const all = (await getAccountBalances(tenantId, period)).map(toLine);
  const control = sumLines(all);

  const search = cleanSearch(filters.search);
  const lines = all.filter(l => {
    if (filters.accountClass !== undefined && l.accountClass !== filters.accountClass) return false;
    if (search && !matchesAccountSearch(l, search)) return false;
    if (filters.hideZero && l.closingDebit === 0 && l.closingCredit === 0) return false;
    return true;
  });

  return {
    from: period.fromLabel,
    to: period.toLabel,
    lines,
    totals: sumLines(lines),
    control,
    // Chaque écriture est équilibrée à sa création ; une balance qui ne l'est
    // pas trahirait une écriture passée hors du moteur.
    isBalanced: control.periodDebit === control.periodCredit && control.closingDebit === control.closingCredit
  };
}
