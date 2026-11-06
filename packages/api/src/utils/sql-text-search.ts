import { Prisma } from '@prisma/client';
import { escapeLike } from './like-escape';

/** Meme pliage des accents latins que les anciennes listes locales, sans extension PostgreSQL. */
export function containsFoldedSql(expression: Prisma.Sql, search: string): Prisma.Sql {
  const needle = search.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return Prisma.sql`regexp_replace(normalize(COALESCE(${expression}, ''), NFD), ${'[\u0300-\u036f]'}, '', 'g') ILIKE ${`%${escapeLike(needle)}%`}`;
}

/** Les anciens tableaux locaux exigeaient chaque mot, eventuellement dans des colonnes differentes. */
export function searchWordsSql(search: string, matchWord: (word: string) => Prisma.Sql): Prisma.Sql {
  const words = search.trim().split(/\s+/).filter(Boolean);
  return words.length ? Prisma.sql`(${Prisma.join(words.map(matchWord), ' AND ')})` : Prisma.sql`TRUE`;
}
