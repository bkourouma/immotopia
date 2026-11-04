/**
 * Lot JOK — les jokers `%` et `_` d'une recherche sont cherchés TELS QUELS,
 * prouvé sur une VRAIE base PostgreSQL.
 *
 * Prisma 5 traduit `contains` en `ILIKE '%…%'` sans échapper la valeur : sans
 * `escapeLike`, « % » trouverait tous les contacts et « a_c » trouverait
 * « abc ». Les tests unitaires (Prisma mocké) vérifient la valeur passée à
 * `contains` ; cette suite vérifie ce que PostgreSQL en fait réellement, avec
 * le `where` produit par le service des contacts (`buildContactListWhere`).
 *
 * Base : DÉDIÉE aux tests, résolue via `DATABASE_URL_TEST` (voir env.example).
 * Absente (ou `DATABASE_URL` différente de `DATABASE_URL_TEST`) : la suite est
 * ignorée (`describe.skip`) pour ne pas casser `npm test`. Lancement ciblé :
 *   DATABASE_URL_TEST=<url> TEST_DATABASE_URL=<url> DATABASE_URL=<url> \
 *     npx jest --runInBand __tests__/integration/like-escape-sql.test.ts
 * (les migrations doivent être appliquées : `npx prisma migrate deploy`).
 */

import { randomUUID } from 'crypto';
import { TenantStatus } from '@prisma/client';
import { prisma } from '../../src/utils/database';
import { buildContactListWhere } from '../../src/services/crm-list-where';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

if (!HAS_TEST_DATABASE) {
  // eslint-disable-next-line no-console
  console.log(
    'DATABASE_URL_TEST absente (ou DATABASE_URL différente) : like-escape-sql.test.ts est ignorée. ' +
      'Voir env.example et __tests__/helpers/run-isolation-tests.js.'
  );
}

jest.setTimeout(120_000);

/** Une seule barre oblique inverse. */
const BS = String.fromCharCode(92);

/** Noms de famille semés dans l'agence A (aucun e-mail ni prénom ne contient `%`, `_` ni `\`). */
const NAMES_A = [
  'Remise 100%',
  'Remise 1000',
  'a_c',
  'abc',
  'aXc',
  'a%c',
  'lot_7',
  'lotA7',
  `dos${BS}barre`,
  'Ordinaire'
];
/** Agence B : un `%` et un `_` qui ne doivent jamais remonter dans les recherches de A. */
const NAMES_B = ['Autre 100%', 'b_a_c'];

const tenantsToClean: string[] = [];
let tenantA = '';

async function seedTenant(prefix: string, lastNames: string[]): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({
    data: { name: `${prefix} ${suffix}`, slug: `${prefix}-${suffix}`, type: 'AGENCY', status: TenantStatus.ACTIVE }
  });
  tenantsToClean.push(tenant.id);
  await prisma.crmContact.createMany({
    data: lastNames.map((lastName, index) => ({
      tenantId: tenant.id,
      firstName: 'Jok',
      lastName,
      email: `jok${index}-${suffix}@exemple.test`
    }))
  });
  return tenant.id;
}

async function search(term: string): Promise<string[]> {
  const rows = await prisma.crmContact.findMany({
    where: buildContactListWhere(tenantA, { search: term } as never),
    select: { lastName: true }
  });
  return rows.map(row => row.lastName).sort();
}

maybeDescribe('recherche LIKE : jokers cherchés tels quels (PostgreSQL réel)', () => {
  beforeAll(async () => {
    tenantA = await seedTenant('jok-a', NAMES_A);
    await seedTenant('jok-b', NAMES_B);
  });

  afterAll(async () => {
    for (const id of tenantsToClean) {
      try {
        await prisma.crmContact.deleteMany({ where: { tenantId: id } });
        await prisma.tenant.delete({ where: { id } });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`nettoyage agence ${id} : ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await prisma.$disconnect();
  });

  it('« % » ne trouve que les libellés qui contiennent un pourcentage', async () => {
    expect(await search('%')).toEqual(['Remise 100%', 'a%c'].sort());
  });

  it('« 100% » ne trouve pas « Remise 1000 »', async () => {
    expect(await search('100%')).toEqual(['Remise 100%']);
  });

  it('« _ » ne trouve que les libellés qui contiennent un souligné', async () => {
    expect(await search('_')).toEqual(['a_c', 'lot_7'].sort());
  });

  it('« a_c » ne trouve ni « abc » ni « aXc » ni « a%c »', async () => {
    expect(await search('a_c')).toEqual(['a_c']);
  });

  it('« lot_7 » ne trouve pas « lotA7 »', async () => {
    expect(await search('lot_7')).toEqual(['lot_7']);
  });

  it('une barre oblique inverse est cherchée telle quelle', async () => {
    expect(await search(BS)).toEqual([`dos${BS}barre`]);
  });

  it('sans joker, la recherche est inchangée (insensible à la casse)', async () => {
    expect(await search('remise')).toEqual(['Remise 100%', 'Remise 1000'].sort());
    expect(await search('LOT')).toEqual(['lot_7', 'lotA7'].sort());
  });

  it("aucune ligne d'une autre agence ne remonte", async () => {
    const all = await search('Jok');
    expect(all).toEqual([...NAMES_A].sort());
  });
});
