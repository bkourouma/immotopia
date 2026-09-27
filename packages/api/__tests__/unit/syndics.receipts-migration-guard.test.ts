/**
 * Lot S3 — garde statique sur l'index unique PARTIEL « une quittance par
 * appel » (`syndic_charge_receipts_quittance_call_key`).
 *
 * Prisma ne sait pas exprimer un index partiel dans `schema.prisma` : une
 * future `prisma migrate dev` peut proposer de le supprimer. Ce test échoue
 * si la migration qui le crée le perd, ou si une migration ultérieure le
 * supprime (ou recrée sans sa condition).
 */

import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS = path.join(__dirname, '..', '..', 'prisma', 'migrations');
const CREATING = '20260929120000_syndic_quittances';
const INDEX = 'syndic_charge_receipts_quittance_call_key';

function migrationSql(name: string): string {
  return fs.readFileSync(path.join(MIGRATIONS, name, 'migration.sql'), 'utf8');
}

function migrationNames(): string[] {
  return fs
    .readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

/** SQL sans commentaires `--` (un commentaire qui cite l'index ne compte pas). */
function withoutComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map(line => line.replace(/--.*$/, ''))
    .join('\n');
}

describe("index unique partiel d'une quittance par appel", () => {
  it('est cree par la migration du lot S3, avec sa condition', () => {
    const sql = withoutComments(migrationSql(CREATING)).replace(/\s+/g, ' ');
    expect(sql).toContain(
      `CREATE UNIQUE INDEX "${INDEX}" ON "syndic_charge_receipts"("charge_call_id") WHERE "kind" = 'QUITTANCE'`
    );
  });

  it("n'est supprime ni modifie par aucune migration ulterieure", () => {
    const later = migrationNames().filter(name => name > CREATING);
    for (const name of later) {
      const sql = withoutComments(migrationSql(name));
      expect({ name, drops: new RegExp(`DROP\\s+INDEX[^;]*${INDEX}`, 'i').test(sql) }).toEqual({ name, drops: false });
      expect({ name, recreates: sql.includes(INDEX) }).toEqual({ name, recreates: false });
    }
  });

  it('la migration de creation existe bien parmi les migrations', () => {
    expect(migrationNames()).toContain(CREATING);
  });
});
