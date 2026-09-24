/**
 * Tests de `utils/tenant-ownership.ts` (lot B7, audit multi-tenant du
 * 24 septembre 2026) — généralisation de `property-tenant-guard.ts` à tout
 * modèle du schéma qui porte un champ d'agence.
 *
 * Aucune base requise : `client` est un magasin en mémoire minimal, qui
 * n'expose que le `findFirst` dont `assertBelongsToTenant` a besoin.
 */

import { assertBelongsToTenant } from '../../src/utils/tenant-ownership';

type Row = Record<string, any>;

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => row[key] === expected);
}

/** Un client Prisma/transaction minimal, avec deux délégués de test. */
function makeClient(rows: { constructionSite: Row[]; supplier: Row[] }) {
  return {
    constructionSite: {
      findFirst: jest.fn(async ({ where, select }: Row) => {
        const row = rows.constructionSite.find(r => matches(r, where));
        if (!row) return null;
        return select ? { id: row.id } : row;
      })
    },
    supplier: {
      findFirst: jest.fn(async ({ where, select }: Row) => {
        const row = rows.supplier.find(r => matches(r, where));
        if (!row) return null;
        return select ? { id: row.id } : row;
      })
    }
  } as any;
}

const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';

describe('assertBelongsToTenant', () => {
  it('ne lève pas quand l’enregistrement appartient à l’agence', async () => {
    const client = makeClient({
      constructionSite: [{ id: 'site-1', tenantId: TENANT_A }],
      supplier: []
    });

    await expect(assertBelongsToTenant(client, 'constructionSite', 'site-1', TENANT_A)).resolves.toBeUndefined();
    expect(client.constructionSite.findFirst).toHaveBeenCalledWith({
      where: { id: 'site-1', tenantId: TENANT_A },
      select: { id: true }
    });
  });

  it('lève NotFoundError quand l’enregistrement appartient à une AUTRE agence — le coeur de la garde', async () => {
    const client = makeClient({
      constructionSite: [{ id: 'site-1', tenantId: TENANT_B }],
      supplier: []
    });

    await expect(assertBelongsToTenant(client, 'constructionSite', 'site-1', TENANT_A)).rejects.toMatchObject({
      statusCode: 404
    });
  });

  it('lève NotFoundError quand l’enregistrement n’existe pas du tout', async () => {
    const client = makeClient({ constructionSite: [], supplier: [] });

    await expect(assertBelongsToTenant(client, 'constructionSite', 'chantier-fantome', TENANT_A)).rejects.toMatchObject(
      { statusCode: 404 }
    );
  });

  it('lève exactement la même erreur pour "inexistant" et pour "d’une autre agence" — ne confirme jamais l’existence d’ailleurs', async () => {
    const withOther = makeClient({ constructionSite: [{ id: 'site-1', tenantId: TENANT_B }], supplier: [] });
    const withNone = makeClient({ constructionSite: [], supplier: [] });

    const [errOther, errNone] = await Promise.all([
      assertBelongsToTenant(withOther, 'constructionSite', 'site-1', TENANT_A).catch(e => e),
      assertBelongsToTenant(withNone, 'constructionSite', 'site-1', TENANT_A).catch(e => e)
    ]);

    expect(errOther.statusCode).toBe(errNone.statusCode);
    expect(errOther.message).toBe(errNone.message);
  });

  it('accepte id null ou undefined sans lever — rien à vérifier', async () => {
    const client = makeClient({ constructionSite: [], supplier: [] });

    await expect(assertBelongsToTenant(client, 'constructionSite', null, TENANT_A)).resolves.toBeUndefined();
    await expect(assertBelongsToTenant(client, 'constructionSite', undefined, TENANT_A)).resolves.toBeUndefined();
    expect(client.constructionSite.findFirst).not.toHaveBeenCalled();
  });

  it('porte le message fourni par l’appelant', async () => {
    const client = makeClient({ constructionSite: [], supplier: [] });

    await expect(
      assertBelongsToTenant(client, 'constructionSite', 'chantier-fantome', TENANT_A, {
        message: 'Chantier introuvable.'
      })
    ).rejects.toMatchObject({ message: 'Chantier introuvable.', statusCode: 404 });
  });

  it('interroge le bon délégué de modèle, indépendamment du premier', async () => {
    const client = makeClient({
      constructionSite: [],
      supplier: [{ id: 'sup-1', tenantId: TENANT_A }]
    });

    await expect(assertBelongsToTenant(client, 'supplier', 'sup-1', TENANT_A)).resolves.toBeUndefined();
    expect(client.constructionSite.findFirst).not.toHaveBeenCalled();
  });

  it('accepte un champ d’agence alternatif (`tenant_id`) pour les modèles qui ne portent pas `tenantId`', async () => {
    // `RentalLease` est l'un des modèles du schéma dont le champ d'agence
    // s'appelle littéralement `tenant_id` (non camelCase) côté client Prisma —
    // voir `prisma/schema.prisma`, modèle `RentalLease`. On réutilise son nom
    // de délégué réel (`rentalLease`) pour que ce test reste dans les types
    // que `TenantOwnedModel` accepte réellement, plutôt qu'un nom inventé.
    const client = {
      rentalLease: {
        findFirst: jest.fn(async ({ where, select }: Row) => {
          const row = [{ id: 'bail-1', tenant_id: TENANT_A }].find(r => matches(r, where));
          return row ? (select ? { id: row.id } : row) : null;
        })
      }
    } as any;

    await expect(
      assertBelongsToTenant(client, 'rentalLease', 'bail-1', TENANT_A, { tenantField: 'tenant_id' })
    ).resolves.toBeUndefined();
    expect(client.rentalLease.findFirst).toHaveBeenCalledWith({
      where: { id: 'bail-1', tenant_id: TENANT_A },
      select: { id: true }
    });
  });
});
