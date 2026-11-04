import { prisma } from '../../utils/database';
import type { AccountingMeta } from './types';

const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

/** Journaux de l'agence, bornes des écritures et années civiles couvertes (comptabilité opérationnelle). */
export async function getAccountingMeta(tenantId: string): Promise<AccountingMeta> {
  const [journals, bounds] = await Promise.all([
    prisma.accountingJournal.findMany({
      where: { tenantId, scope: 'OPERATIONS' },
      select: { code: true, label: true },
      distinct: ['code'],
      orderBy: { code: 'asc' }
    }),
    prisma.journalEntry.aggregate({
      where: { tenantId, journal: { scope: 'OPERATIONS' } },
      _min: { entryDate: true },
      _max: { entryDate: true }
    })
  ]);

  const minDate = day(bounds._min.entryDate);
  const maxDate = day(bounds._max.entryDate);
  const years: number[] = [];
  if (minDate && maxDate) {
    for (let year = Number(maxDate.slice(0, 4)); year >= Number(minDate.slice(0, 4)); year--) years.push(year);
  }

  return { journals, years, minDate, maxDate };
}
