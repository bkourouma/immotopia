/**
 * Prélèvements (locatif) : filtres des listes mandats, remises et imports de retour
 * (construction du `where`, validation des paramètres : 400 si invalide).
 */
const mandateFindMany = jest.fn();
const mandateCount = jest.fn();
const remittanceFindMany = jest.fn();
const remittanceCount = jest.fn();
const importFindMany = jest.fn();
const importCount = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    directDebitMandate: {
      findMany: (...a: unknown[]) => mandateFindMany(...a),
      count: (...a: unknown[]) => mandateCount(...a)
    },
    directDebitRemittance: {
      findMany: (...a: unknown[]) => remittanceFindMany(...a),
      count: (...a: unknown[]) => remittanceCount(...a)
    },
    directDebitReturnImport: {
      findMany: (...a: unknown[]) => importFindMany(...a),
      count: (...a: unknown[]) => importCount(...a)
    },
    user: { findMany: jest.fn().mockResolvedValue([]) }
  }
}));
jest.mock('../../src/lib/direct-debit/dto', () => ({
  ...jest.requireActual('../../src/lib/direct-debit/dto'),
  resolveDebtorNames: jest.fn().mockResolvedValue(new Map())
}));

import { listMandates } from '../../src/lib/direct-debit/mandates';
import { listRemittances } from '../../src/lib/direct-debit/remittances';
import { listReturnImportsFor } from '../../src/lib/direct-debit/returns/import';
import { listMandatesQuerySchema } from '../../src/lib/direct-debit/schemas';
import { listRemittancesQuerySchema } from '../../src/lib/direct-debit/remittance-schemas';
import { listReturnImportsQuerySchema } from '../../src/lib/direct-debit/returns/schemas';

const PAGE = { page: 1, pageSize: 20 };

beforeEach(() => {
  for (const fn of [mandateFindMany, remittanceFindMany, importFindMany]) fn.mockReset().mockResolvedValue([]);
  for (const fn of [mandateCount, remittanceCount, importCount]) fn.mockReset().mockResolvedValue(0);
});

describe('listMandates : where', () => {
  const whereOf = () => mandateFindMany.mock.calls[0][0].where;

  it('sans filtre : agence et périmètre locatif seulement', async () => {
    await listMandates('T1', PAGE);
    expect(whereOf()).toEqual({ tenantId: 'T1', scope: 'RENTAL_LEASE' });
  });

  it('période de signature : bornes incluses', async () => {
    await listMandates('T1', { ...PAGE, signedFrom: '2026-01-01', signedTo: '2026-01-31' });
    expect(whereOf().signedAt).toEqual({
      gte: new Date('2026-01-01T00:00:00.000Z'),
      lte: new Date('2026-01-31T23:59:59.999Z')
    });
  });

  it('créancier et statut restent dans le where de l agence', async () => {
    await listMandates('T1', { ...PAGE, creditorId: 'C9', status: 'ACTIVE' });
    expect(whereOf()).toMatchObject({ tenantId: 'T1', creditorId: 'C9', status: 'ACTIVE' });
  });
});

describe('listRemittances : where', () => {
  const whereOf = () => remittanceFindMany.mock.calls[0][0].where;

  it('sans filtre : agence et périmètre locatif', async () => {
    await listRemittances('T1', PAGE);
    expect(whereOf()).toEqual({ tenantId: 'T1', scope: 'RENTAL_LEASE' });
  });

  it('période de prélèvement : bornes incluses', async () => {
    await listRemittances('T1', { ...PAGE, collectionFrom: '2026-02-01', collectionTo: '2026-02-28' });
    expect(whereOf().collectionDate).toEqual({
      gte: new Date('2026-02-01T00:00:00.000Z'),
      lte: new Date('2026-02-28T23:59:59.999Z')
    });
  });

  it('recherche : créancier insensible à la casse', async () => {
    await listRemittances('T1', { ...PAGE, search: 'sotra' });
    expect(whereOf().OR[0]).toEqual({ creditor: { is: { label: { contains: 'sotra', mode: 'insensitive' } } } });
    expect(whereOf().tenantId).toBe('T1');
  });

  it('recherche : une référence PRL-AAAA-NNNN cible année et séquence', async () => {
    await listRemittances('T1', { ...PAGE, search: 'prl-2026-0007' });
    expect(whereOf().OR).toContainEqual({ year: 2026, sequence: 7 });
  });
});

describe('listReturnImportsFor : where', () => {
  const whereOf = () => importFindMany.mock.calls[0][0].where;

  it('sans filtre : agence seulement (plus le périmètre)', async () => {
    await listReturnImportsFor('T1', { scope: 'RENTAL_LEASE' } as never, PAGE);
    expect(whereOf().tenantId).toBe('T1');
    expect(whereOf().fileName).toBeUndefined();
    expect(whereOf().createdAt).toBeUndefined();
  });

  it('nom de fichier et période d import', async () => {
    await listReturnImportsFor('T1', { scope: 'RENTAL_LEASE' } as never, {
      ...PAGE,
      search: 'retour',
      from: '2026-03-01',
      to: '2026-03-31'
    });
    expect(whereOf().fileName).toEqual({ contains: 'retour', mode: 'insensitive' });
    expect(whereOf().createdAt).toEqual({
      gte: new Date('2026-03-01T00:00:00.000Z'),
      lte: new Date('2026-03-31T23:59:59.999Z')
    });
    expect(whereOf().tenantId).toBe('T1');
  });
});

describe('schémas de requête : valeurs invalides = erreur de validation (400)', () => {
  it('mandats', () => {
    expect(listMandatesQuerySchema.parse({ search: '  ', signedFrom: '' })).toMatchObject({
      search: undefined,
      signedFrom: undefined
    });
    expect(() => listMandatesQuerySchema.parse({ signedFrom: '2026-02-31' })).toThrow();
    expect(() => listMandatesQuerySchema.parse({ status: 'BOGUS' })).toThrow();
    expect(() => listMandatesQuerySchema.parse({ creditorId: 'pas-un-uuid' })).toThrow();
  });

  it('remises', () => {
    expect(listRemittancesQuerySchema.parse({ collectionFrom: '2026-02-01' }).collectionFrom).toBe('2026-02-01');
    expect(() => listRemittancesQuerySchema.parse({ collectionTo: '2026-13-45' })).toThrow();
    expect(() => listRemittancesQuerySchema.parse({ collectionFrom: 'hier' })).toThrow();
    expect(() => listRemittancesQuerySchema.parse({ status: 'BOGUS' })).toThrow();
  });

  it('imports de retour', () => {
    expect(listReturnImportsQuerySchema.parse({ search: 'a', from: '2026-03-01' })).toMatchObject({
      search: 'a',
      from: '2026-03-01'
    });
    expect(() => listReturnImportsQuerySchema.parse({ from: '2026-02-30' })).toThrow();
  });
});
