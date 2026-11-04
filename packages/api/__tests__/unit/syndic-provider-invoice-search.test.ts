/**
 * Lot SYN-B : `GET …/factures-prestataires` (search, statuts multiples, jours
 * réels). Prisma est mocké : where envoyé, refus (400), isolation agence et
 * copropriété.
 */
import express from 'express';
import request from 'supertest';

jest.mock('@prisma/client', () => {
  const prisma: any = {
    syndicate: { findFirst: jest.fn() },
    syndicProviderInvoice: { findMany: jest.fn(), count: jest.fn() }
  };
  const actual = jest.requireActual('@prisma/client');
  return { ...actual, PrismaClient: jest.fn(() => prisma), __mockPrisma: prisma };
});

import { listProviderInvoicesHandler } from '../../src/controllers/syndic-provider-invoice-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

const { __mockPrisma: prisma } = jest.requireMock('@prisma/client') as { __mockPrisma: any };

const TENANT = 'tenant-a';
const SYNDIC = '11111111-1111-4111-8111-111111111111';
const OTHER_SYNDIC = '99999999-9999-4999-8999-999999999999';
const PROVIDER = '22222222-2222-4222-8222-222222222222';
const BASE = `/t/${TENANT}/syndics/${SYNDIC}/factures-prestataires`;

const app = express();
app.get('/t/:tenantId/syndics/:syndicId/factures-prestataires', listProviderInvoicesHandler);
app.use(errorHandler);

const insensitive = (value: string) => ({ contains: value, mode: 'insensitive' });
const whereOfCall = (index = 0) => prisma.syndicProviderInvoice.findMany.mock.calls[index][0].where;

beforeEach(() => {
  jest.resetAllMocks();
  prisma.syndicate.findFirst.mockImplementation(async ({ where }: any) =>
    where.id === SYNDIC && where.tenantId === TENANT ? { id: SYNDIC, name: 'Palmiers' } : null
  );
  prisma.syndicProviderInvoice.findMany.mockResolvedValue([]);
  prisma.syndicProviderInvoice.count.mockResolvedValue(0);
});

describe('GET factures-prestataires', () => {
  it('sans paramètre : seulement agence et copropriété', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(200);
    expect(whereOfCall()).toEqual({ tenantId: TENANT, syndicateId: SYNDIC });
    expect(res.body.data).toEqual({ items: [], total: 0, page: 1, limit: 20 });
  });

  it('search : OR sur numéro, libellé et nom du prestataire, ET agence et copropriété', async () => {
    const res = await request(app).get(`${BASE}?search=%20FAC-12%20`);
    expect(res.status).toBe(200);
    const where = whereOfCall();
    expect(where.tenantId).toBe(TENANT);
    expect(where.syndicateId).toBe(SYNDIC);
    expect(where.OR).toEqual([
      { number: insensitive('FAC-12') },
      { label: insensitive('FAC-12') },
      { provider: { name: insensitive('FAC-12') } }
    ]);
    expect(prisma.syndicProviderInvoice.count.mock.calls[0][0].where).toEqual(where);
  });

  it('status accepte une valeur seule ou une liste séparée par des virgules', async () => {
    await request(app).get(`${BASE}?status=PAID`);
    expect(whereOfCall(0).status).toEqual({ in: ['PAID'] });
    await request(app).get(`${BASE}?status=RECORDED,PARTIALLY_PAID`);
    expect(whereOfCall(1).status).toEqual({ in: ['RECORDED', 'PARTIALLY_PAID'] });
  });

  it('from/to : jours réels, to inclusif jusqu’à 23:59:59.999', async () => {
    const res = await request(app).get(`${BASE}?from=2026-01-01&to=2026-01-31`);
    expect(res.status).toBe(200);
    expect(whereOfCall().invoiceDate).toEqual({
      gte: new Date('2026-01-01T00:00:00.000Z'),
      lte: new Date('2026-01-31T23:59:59.999Z')
    });
  });

  it('les filtres d’identifiants restent dans le where de l’agence et de la copropriété', async () => {
    await request(app).get(`${BASE}?providerId=${PROVIDER}&search=x`);
    expect(whereOfCall()).toMatchObject({ tenantId: TENANT, syndicateId: SYNDIC, providerId: PROVIDER });
  });

  it.each([
    'status=PAYE',
    'status=PAID,NOPE',
    'from=2026-02-31',
    'to=2026-13-45',
    'from=2026-03-01&to=2026-01-01',
    `search=${'a'.repeat(201)}`,
    'providerId=pas-un-uuid'
  ])('refuse %s avec 400 sans lire la base', async query => {
    const res = await request(app).get(`${BASE}?${query}`);
    expect(res.status).toBe(400);
    expect(prisma.syndicProviderInvoice.findMany).not.toHaveBeenCalled();
  });

  it('copropriété d’une autre agence ou inexistante : 404', async () => {
    const res = await request(app).get(`/t/${TENANT}/syndics/${OTHER_SYNDIC}/factures-prestataires?search=x`);
    expect(res.status).toBe(404);
    expect(prisma.syndicProviderInvoice.findMany).not.toHaveBeenCalled();
  });
});
