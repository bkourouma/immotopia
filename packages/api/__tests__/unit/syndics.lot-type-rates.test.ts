/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Menu lot 2 — barème par type de lot d'une copropriété, sur une base en
 * mémoire qui applique vraiment les filtres `where`.
 *
 * Agence A : copropriété S1 (2 appartements, 1 parking). Agence B : copropriété SB.
 */
import { createFakePrisma } from '../helpers/fake-prisma';

const mockPrisma = createFakePrisma();
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import { NotFoundError } from '../../src/middleware/error-middleware';
import { getLotTypeRates, updateLotTypeRates } from '../../src/lib/syndics/lot-type-rates';
import { updateLotTypeRatesSchema } from '../../src/lib/syndics/lot-type-rates-schemas';
import { logger } from '../../src/utils/logger';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const S1 = id(1);
const SB = id(2);
const SOMEONE = 'user-1';

function seed() {
  mockPrisma.reset();
  mockPrisma.syndicate.rows.push(
    { id: S1, tenantId: TENANT_A, name: 'Residence A', lotTypeRates: null, lotTypeRatesUpdatedAt: null },
    { id: SB, tenantId: TENANT_B, name: 'Residence B', lotTypeRates: null, lotTypeRatesUpdatedAt: null }
  );
  const lot = (n: number, syndicateId: string, lotType: string, tenantId: string) => ({
    id: id(100 + n),
    syndicateId,
    lotNumber: String(n),
    lotType,
    generalShares: 100,
    syndicate: { tenantId }
  });
  mockPrisma.syndicateLot.rows.push(
    lot(1, S1, 'APARTMENT', TENANT_A),
    lot(2, S1, 'APARTMENT', TENANT_A),
    lot(3, S1, 'PARKING', TENANT_A),
    lot(4, SB, 'OFFICE', TENANT_B)
  );
}

beforeEach(() => {
  seed();
  jest.spyOn(logger, 'info').mockImplementation((() => logger) as any);
});

afterEach(() => jest.restoreAllMocks());

describe('barème par type de lot', () => {
  it('rend un barème vide avec les types présents et manquants', async () => {
    const view = await getLotTypeRates(TENANT_A, S1);
    expect(view.rates).toEqual({});
    expect(view.isEmpty).toBe(true);
    expect(view.updatedAt).toBeNull();
    expect(view.lotTypesPresent).toEqual([
      { lotType: 'APARTMENT', count: 2 },
      { lotType: 'PARKING', count: 1 }
    ]);
    expect(view.missingTypes).toEqual(['APARTMENT', 'PARKING']);
  });

  it('enregistre le barème, la date et l’auteur, et journalise', async () => {
    const view = await updateLotTypeRates(TENANT_A, S1, { APARTMENT: 25000, PARKING: 5000 }, SOMEONE);
    expect(view.rates).toEqual({ APARTMENT: 25000, PARKING: 5000 });
    expect(view.isEmpty).toBe(false);
    expect(view.missingTypes).toEqual([]);
    expect(view.updatedAt).toEqual(expect.any(String));
    const row: any = mockPrisma.syndicate.rows.find((r: any) => r.id === S1);
    expect(row.lotTypeRatesUpdatedById).toBe(SOMEONE);
    expect(row.lotTypeRatesUpdatedAt).toBeInstanceOf(Date);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Audit: syndic lot type rates updated'),
      expect.objectContaining({ tenantId: TENANT_A, syndicateId: S1, actorUserId: SOMEONE })
    );
  });

  it('signale un type présent sans montant', async () => {
    const view = await updateLotTypeRates(TENANT_A, S1, { APARTMENT: 100 }, SOMEONE);
    expect(view.missingTypes).toEqual(['PARKING']);
    expect((await getLotTypeRates(TENANT_A, S1)).missingTypes).toEqual(['PARKING']);
  });

  it('un montant à 0 est un choix explicite (pas manquant)', async () => {
    const view = await updateLotTypeRates(TENANT_A, S1, { APARTMENT: 100, PARKING: 0 }, SOMEONE);
    expect(view.rates).toEqual({ APARTMENT: 100, PARKING: 0 });
    expect(view.missingTypes).toEqual([]);
  });

  it('remplace le barème précédent au lieu de le fusionner', async () => {
    await updateLotTypeRates(TENANT_A, S1, { APARTMENT: 100, PARKING: 50 }, SOMEONE);
    const view = await updateLotTypeRates(TENANT_A, S1, { APARTMENT: 200 }, SOMEONE);
    expect(view.rates).toEqual({ APARTMENT: 200 });
    expect(view.missingTypes).toEqual(['PARKING']);
  });

  it('rejette un type inconnu, un montant négatif ou infini, et un barème vide', async () => {
    await expect(updateLotTypeRates(TENANT_A, S1, { GARAGE: 10 }, SOMEONE)).rejects.toThrow();
    await expect(updateLotTypeRates(TENANT_A, S1, { APARTMENT: -1 }, SOMEONE)).rejects.toThrow();
    await expect(updateLotTypeRates(TENANT_A, S1, { APARTMENT: Infinity }, SOMEONE)).rejects.toThrow();
    await expect(updateLotTypeRates(TENANT_A, S1, { APARTMENT: 10_000_000_000 }, SOMEONE)).rejects.toThrow();
    await expect(updateLotTypeRates(TENANT_A, S1, {}, SOMEONE)).rejects.toThrow();
    expect((await getLotTypeRates(TENANT_A, S1)).isEmpty).toBe(true);
  });

  it('le schéma de corps est strict', () => {
    expect(updateLotTypeRatesSchema.safeParse({ rates: { APARTMENT: 1 } }).success).toBe(true);
    expect(updateLotTypeRatesSchema.safeParse({ rates: { APARTMENT: 1 }, extra: 1 }).success).toBe(false);
    expect(updateLotTypeRatesSchema.safeParse({ rates: { APARTMENT: '1' } }).success).toBe(false);
    expect(updateLotTypeRatesSchema.safeParse({}).success).toBe(false);
  });
});

describe('étanchéité entre agences', () => {
  it('l’agence B ne lit pas le barème de A', async () => {
    await updateLotTypeRates(TENANT_A, S1, { APARTMENT: 100 }, SOMEONE);
    await expect(getLotTypeRates(TENANT_B, S1)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('l’agence B n’écrit pas le barème de A', async () => {
    await updateLotTypeRates(TENANT_A, S1, { APARTMENT: 100 }, SOMEONE);
    await expect(updateLotTypeRates(TENANT_B, S1, { APARTMENT: 1 }, 'user-b')).rejects.toBeInstanceOf(NotFoundError);
    expect((await getLotTypeRates(TENANT_A, S1)).rates).toEqual({ APARTMENT: 100 });
  });

  it('même erreur qu’une copropriété inexistante', async () => {
    const missing = await getLotTypeRates(TENANT_A, id(999)).catch(error => error);
    const foreign = await getLotTypeRates(TENANT_B, S1).catch(error => error);
    expect(missing).toBeInstanceOf(NotFoundError);
    expect(foreign.message).toBe(missing.message);
    expect(foreign.statusCode).toBe(missing.statusCode);
  });

  it('ne compte que les lots de la copropriété', async () => {
    const view = await getLotTypeRates(TENANT_B, SB);
    expect(view.lotTypesPresent).toEqual([{ lotType: 'OFFICE', count: 1 }]);
  });
});
