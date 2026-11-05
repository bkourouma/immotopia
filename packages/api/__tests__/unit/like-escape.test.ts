/**
 * `escapeLike` : un `%`, un `_` ou un `\` saisi est cherché tel quel dans un
 * LIKE / ILIKE (Prisma `contains` / `startsWith` / `endsWith`, SQL brut).
 */
import { escapeLike } from '../../src/utils/like-escape';
import { escapeLike as reexportedFromSchemas } from '../../src/utils/list-query-schemas';
import { containsPattern, escapeLike as reexportedFromSql } from '../../src/lib/accounting-exports/queries/sql';

describe('escapeLike', () => {
  it('laisse intact un texte sans joker', () => {
    expect(escapeLike('Villa Cocody 3')).toBe('Villa Cocody 3');
  });

  it('renvoie une chaîne vide pour une chaîne vide', () => {
    expect(escapeLike('')).toBe('');
  });

  it('échappe le pourcentage', () => {
    expect(escapeLike('100%')).toBe('100\\%');
  });

  it('échappe le souligné', () => {
    expect(escapeLike('lot_7')).toBe('lot\\_7');
  });

  it("échappe la barre oblique inverse avant les jokers (pas d'échappement avalé)", () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b');
    expect(escapeLike('\\%')).toBe('\\\\\\%');
  });

  it('échappe toutes les occurrences, combinées', () => {
    expect(escapeLike('%_\\%_')).toBe('\\%\\_\\\\\\%\\_');
    expect(escapeLike('50%_off\\x')).toBe('50\\%\\_off\\\\x');
  });

  it('est le même helper partout (schémas de liste, SQL de la comptabilité)', () => {
    expect(reexportedFromSchemas).toBe(escapeLike);
    expect(reexportedFromSql).toBe(escapeLike);
    expect(containsPattern('a_c')).toBe('%a\\_c%');
  });
});
