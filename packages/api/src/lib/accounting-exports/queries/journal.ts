import type { Prisma } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { NotFoundError } from '../../../middleware/error-middleware';
import { roundMoney } from '../../finance/money';
import { amount, Cell, day, NATURE_LABELS, Period, SCOPE, Table } from '../service';
import type { JournalEntryRow, JournalFilters, JournalLineRow, JournalPage, PageRequest } from '../types';
import { cleanSearch, escapeLike, pagedResult, skipTake } from './sql';

/** Filtre Prisma des écritures de l'agence : toujours `tenantId`, journaux de la portée OPERATIONS. */
function entriesWhere(
  tenantId: string,
  period: Period,
  filters: { journal?: string; account?: string; search?: string }
): Prisma.JournalEntryWhereInput {
  const { journal, account, search: rawSearch } = filters;
  // Prisma passe contains / startsWith tels quels a LIKE : un % ou un _ saisi jouerait le joker.
  // L'echappement par barre oblique inverse est celui par defaut de PostgreSQL.
  const search = rawSearch === undefined ? undefined : escapeLike(rawSearch);
  return {
    tenantId,
    journal: { scope: SCOPE, ...(journal ? { code: journal } : {}) },
    entryDate: { gte: period.from, lte: period.to },
    ...(account
      ? { lines: { some: { account: { tenantId, scope: SCOPE, accountNumber: { startsWith: escapeLike(account) } } } } }
      : {}),
    ...(search
      ? {
          OR: [
            { reference: { contains: search, mode: 'insensitive' as const } },
            { description: { contains: search, mode: 'insensitive' as const } },
            { lines: { some: { label: { contains: search, mode: 'insensitive' as const } } } }
          ]
        }
      : {})
  };
}

export async function getJournalPage(
  tenantId: string,
  period: Period,
  filters: JournalFilters,
  page: PageRequest
): Promise<JournalPage> {
  const journal = cleanSearch(filters.journal);
  if (journal) {
    const found = await prisma.accountingJournal.findFirst({
      where: { tenantId, scope: SCOPE, code: journal },
      select: { id: true }
    });
    if (!found) throw new NotFoundError('Journal introuvable.');
  }

  const where = entriesWhere(tenantId, period, {
    journal,
    account: cleanSearch(filters.account),
    search: cleanSearch(filters.search)
  });

  const [total, entries, sums] = await Promise.all([
    prisma.journalEntry.count({ where }),
    prisma.journalEntry.findMany({
      where,
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      ...skipTake(page),
      select: {
        id: true,
        entryDate: true,
        reference: true,
        description: true,
        documentType: true,
        voidedByEntryId: true,
        journal: { select: { code: true } },
        lines: {
          select: {
            label: true,
            debit: true,
            credit: true,
            fundsNature: true,
            thirdParty: { select: { label: true } },
            account: { select: { accountNumber: true, accountName: true } }
          }
        }
      }
    }),
    // Totaux de TOUT le filtre, pas de la seule page.
    prisma.journalEntryLine.aggregate({ where: { entry: where }, _sum: { debit: true, credit: true } })
  ]);

  const items: JournalEntryRow[] = entries.map(entry => {
    const lines: JournalLineRow[] = entry.lines
      .map(line => ({
        accountNumber: line.account.accountNumber,
        accountName: line.account.accountName,
        label: line.label ?? '',
        thirdParty: line.thirdParty?.label ?? null,
        nature: line.fundsNature ? NATURE_LABELS[line.fundsNature] : null,
        debit: amount(line.debit),
        credit: amount(line.credit)
      }))
      // Débits d'abord, puis par compte : l'ordre d'un journal papier.
      .sort((a, b) => (b.debit > 0 ? 1 : 0) - (a.debit > 0 ? 1 : 0) || a.accountNumber.localeCompare(b.accountNumber));
    return {
      id: entry.id,
      date: entry.entryDate.toISOString(),
      journalCode: entry.journal.code,
      reference: entry.reference,
      description: entry.description,
      documentType: entry.documentType,
      reversed: Boolean(entry.voidedByEntryId),
      debit: roundMoney(lines.reduce((sum, l) => sum + l.debit, 0)),
      credit: roundMoney(lines.reduce((sum, l) => sum + l.credit, 0)),
      lines
    };
  });

  return {
    from: period.fromLabel,
    to: period.toLabel,
    ...pagedResult(items, total, page),
    totals: { debit: amount(sums._sum.debit), credit: amount(sums._sum.credit) }
  };
}

/** Mêmes colonnes que l'ancien export du journal. */
export function journalPageTable(data: JournalPage): Table {
  const rows: Cell[][] = [];
  for (const entry of data.items) {
    for (const line of entry.lines) {
      rows.push([
        day(entry.date),
        entry.journalCode,
        entry.reference,
        line.accountNumber,
        line.accountName,
        line.label || entry.description,
        line.thirdParty ?? '',
        line.nature ?? '',
        line.debit,
        line.credit,
        entry.reversed ? 'Oui' : ''
      ]);
    }
  }
  return {
    sheet: 'Journal',
    headers: [
      'Date',
      'Journal',
      'Pièce',
      'Compte',
      'Intitulé du compte',
      'Libellé',
      'Tiers',
      'Nature',
      'Débit',
      'Crédit',
      'Contre-passée'
    ],
    rows,
    money: [8, 9]
  };
}
