/**
 * Lot SYN-A : pagination totale et criteres de recherche serveur des listes de
 * recouvrement (relances, penalites, echeanciers), des appels de charges et des
 * transactions de compte copropriétaire. Prisma est mocké : on vérifie le where
 * envoyé, l'enveloppe `pagination` et les refus (400, 404).
 */
import express from 'express';
import request from 'supertest';

jest.mock('@prisma/client', () => {
  const prisma: any = {
    syndicate: { findFirst: jest.fn() },
    paymentReminder: { findMany: jest.fn(), count: jest.fn() },
    latePaymentPenalty: { findMany: jest.fn(), count: jest.fn() },
    paymentSchedule: { findMany: jest.fn(), count: jest.fn() },
    chargeCall: { findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
    ownerAccount: { findFirst: jest.fn() },
    ownerAccountTransaction: { findMany: jest.fn(), count: jest.fn() },
    syndicateLot: { findFirst: jest.fn() },
    $executeRaw: jest.fn(),
    $transaction: jest.fn()
  };
  return { PrismaClient: jest.fn(() => prisma), __mockPrisma: prisma, Prisma: {} };
});

import {
  listRemindersHandler,
  listPenaltiesHandler,
  listPaymentSchedulesHandler,
  listChargeCallsHandler,
  listLotOwnerAccountTransactionsHandler
} from '../../src/controllers/syndic-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

const { __mockPrisma: prisma } = jest.requireMock('@prisma/client') as { __mockPrisma: any };

const TENANT = 'tenant-a';
const SYNDIC = '11111111-1111-4111-8111-111111111111';
const LOT = '22222222-2222-4222-8222-222222222222';
const BASE = `/t/${TENANT}/syndics/${SYNDIC}`;

const app = express();
app.use(express.json());
app.get('/t/:tenantId/syndics/:syndicId/relances', listRemindersHandler);
app.get('/t/:tenantId/syndics/:syndicId/penalites', listPenaltiesHandler);
app.get('/t/:tenantId/syndics/:syndicId/echeanciers', listPaymentSchedulesHandler);
app.get('/t/:tenantId/syndics/:syndicId/charges', listChargeCallsHandler);
app.get('/t/:tenantId/syndics/:syndicId/lots/:lotId/compte/transactions', listLotOwnerAccountTransactionsHandler);
app.use(errorHandler);

const insensitive = (value: string) => ({ contains: value, mode: 'insensitive' });
const lotOwnerOr = (value: string) => [
  { lot: { lotNumber: insensitive(value) } },
  {
    lot: {
      owner: {
        OR: [
          { firstName: insensitive(value) },
          { lastName: insensitive(value) },
          { legalName: insensitive(value) },
          { email: insensitive(value) },
          { phonePrimary: insensitive(value) }
        ]
      }
    }
  }
];

beforeEach(() => {
  jest.clearAllMocks();
  prisma.syndicate.findFirst.mockImplementation(async ({ where }: any) =>
    where.id === SYNDIC && where.tenantId === TENANT ? { id: SYNDIC, tenantId: TENANT } : null
  );
  for (const model of ['paymentReminder', 'latePaymentPenalty', 'paymentSchedule']) {
    prisma[model].findMany.mockResolvedValue([{ id: 'x' }]);
    prisma[model].count.mockResolvedValue(45);
  }
  prisma.chargeCall.findMany.mockResolvedValue([]);
  prisma.chargeCall.count.mockResolvedValue(0);
  prisma.chargeCall.aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: { _all: 0 } });
  // Le rapprochement du grand livre du compte ne trouve pas de lot a reconcilier : il ne fait rien.
  prisma.syndicateLot.findFirst.mockResolvedValue(null);
  prisma.$transaction.mockImplementation(async (callback: any) => callback(prisma));
  prisma.ownerAccount.findFirst.mockResolvedValue({ id: 'acc-1' });
  prisma.ownerAccountTransaction.findMany.mockResolvedValue([]);
  prisma.ownerAccountTransaction.count.mockResolvedValue(0);
});

describe('GET relances', () => {
  it('construit le where (statut/canal multiples, niveau, période, lot, recherche) et pagine', async () => {
    const res = await request(app).get(
      `${BASE}/relances?status=SENT,FAILED&channel=SMS,EMAIL&level=2&from=2026-01-01&to=2026-02-01&lotId=${LOT}&search=%20Awa%20&page=2&limit=10`
    );
    expect(res.status).toBe(200);
    const where = prisma.paymentReminder.findMany.mock.calls[0][0].where;
    expect(where.chargeCall).toEqual({ syndicateId: SYNDIC, syndicate: { tenantId: TENANT } });
    expect(where.lotId).toBe(LOT);
    expect(where.status).toEqual({ in: ['SENT', 'FAILED'] });
    expect(where.channel).toEqual({ in: ['SMS', 'EMAIL'] });
    expect(where.reminderLevel).toBe(2);
    expect(where.sentAt.gte).toEqual(new Date('2026-01-01'));
    expect(where.sentAt.lte).toEqual(new Date('2026-02-01T23:59:59.999Z'));
    expect(where.OR).toEqual([...lotOwnerOr('Awa'), { chargeCall: { period: insensitive('Awa') } }]);
    expect(prisma.paymentReminder.findMany.mock.calls[0][0]).toMatchObject({ skip: 10, take: 10 });
    expect(prisma.paymentReminder.count).toHaveBeenCalledWith({ where });
    expect(res.body.data).toEqual([{ id: 'x' }]);
    expect(res.body.pagination).toEqual({ page: 2, limit: 10, total: 45, totalPages: 5 });
  });

  it.each([
    'status=BOGUS',
    'channel=FAX',
    'level=0',
    'level=abc',
    'lotId=nope',
    'from=pasunedate',
    'limit=101',
    'page=0'
  ])('refuse %s avec un 400', async query => {
    const res = await request(app).get(`${BASE}/relances?${query}`);
    expect(res.status).toBe(400);
    expect(prisma.paymentReminder.findMany).not.toHaveBeenCalled();
  });

  it('refuse une recherche de plus de 100 caractères et une période inversée', async () => {
    expect((await request(app).get(`${BASE}/relances?search=${'a'.repeat(101)}`)).status).toBe(400);
    expect((await request(app).get(`${BASE}/relances?from=2026-03-01&to=2026-01-01`)).status).toBe(400);
  });

  it('renvoie totalPages = 1 quand la liste est vide et ignore une recherche vide', async () => {
    prisma.paymentReminder.count.mockResolvedValue(0);
    prisma.paymentReminder.findMany.mockResolvedValue([]);
    const res = await request(app).get(`${BASE}/relances?search=`);
    expect(res.status).toBe(200);
    expect(prisma.paymentReminder.findMany.mock.calls[0][0].where.OR).toBeUndefined();
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 1 });
  });

  it("copropriété d'une autre agence : refus 403 (isolation), aucune requête sur les relances", async () => {
    const res = await request(app).get(`/t/tenant-b/syndics/${SYNDIC}/relances`);
    expect(res.status).toBe(403);
    expect(prisma.paymentReminder.findMany).not.toHaveBeenCalled();
  });
});

describe('GET penalites', () => {
  it('filtre annulée / lot / recherche et pagine', async () => {
    const res = await request(app).get(`${BASE}/penalites?waived=false&lotId=${LOT}&search=A-01`);
    expect(res.status).toBe(200);
    const where = prisma.latePaymentPenalty.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      chargeCall: { syndicateId: SYNDIC, syndicate: { tenantId: TENANT } },
      lotId: LOT,
      waived: false,
      OR: lotOwnerOr('A-01')
    });
    expect(prisma.latePaymentPenalty.count).toHaveBeenCalledWith({ where });
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 45, totalPages: 3 });
  });

  it('waived=true est accepté, une autre valeur donne un 400', async () => {
    expect((await request(app).get(`${BASE}/penalites?waived=true`)).status).toBe(200);
    expect(prisma.latePaymentPenalty.findMany.mock.calls[0][0].where.waived).toBe(true);
    expect((await request(app).get(`${BASE}/penalites?waived=peut-etre`)).status).toBe(400);
    expect((await request(app).get(`${BASE}/penalites?lotId=xyz`)).status).toBe(400);
  });

  it("copropriété d'une autre agence : 403", async () => {
    expect((await request(app).get(`/t/tenant-b/syndics/${SYNDIC}/penalites`)).status).toBe(403);
  });
});

describe('GET echeanciers', () => {
  it('statut multiple → in, recherche sur lot, copropriétaire et période', async () => {
    const res = await request(app).get(`${BASE}/echeanciers?status=ACTIVE,DEFAULTED&search=T1&lotId=${LOT}`);
    expect(res.status).toBe(200);
    const where = prisma.paymentSchedule.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['ACTIVE', 'DEFAULTED'] });
    expect(where.lotId).toBe(LOT);
    expect(where.chargeCall).toEqual({ syndicateId: SYNDIC, syndicate: { tenantId: TENANT } });
    expect(where.OR).toEqual([...lotOwnerOr('T1'), { chargeCall: { period: insensitive('T1') } }]);
    expect(res.body.pagination.total).toBe(45);
  });

  it('refuse un statut inconnu et une autre agence', async () => {
    expect((await request(app).get(`${BASE}/echeanciers?status=DONE`)).status).toBe(400);
    expect((await request(app).get(`/t/tenant-b/syndics/${SYNDIC}/echeanciers`)).status).toBe(403);
  });
});

describe('GET charges', () => {
  it('statut multiple (OU), recherche, lot : même where pour la liste et la synthèse', async () => {
    prisma.chargeCall.aggregate.mockResolvedValue({ _sum: { amount: 1000 }, _count: { _all: 41 } });
    const res = await request(app).get(
      `${BASE}/charges?status=PAID,OVERDUE&search=Ravalement&lotId=${LOT}&period=2026-01&page=3&limit=20`
    );
    expect(res.status).toBe(200);
    const listWhere = prisma.chargeCall.findMany.mock.calls[0][0].where;
    const summaryWhere = prisma.chargeCall.aggregate.mock.calls[0][0].where;
    // « en retard » compare l'échéance à `new Date()`, évalué une fois par requête :
    // les deux instants peuvent différer d'une milliseconde. On compare la structure
    // en ramenant chaque date à la seconde.
    const atSecond = (value: unknown): unknown =>
      JSON.parse(JSON.stringify(value), (_key, v) =>
        typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? v.slice(0, 19) : v
      );
    expect(atSecond(listWhere)).toEqual(atSecond(summaryWhere));
    expect(listWhere).toMatchObject({
      syndicateId: SYNDIC,
      syndicate: { tenantId: TENANT },
      lotId: LOT,
      period: '2026-01'
    });
    const and = listWhere.AND as any[];
    expect(and[0].OR).toHaveLength(2);
    expect(and[0].OR[0]).toEqual({ status: 'PAID' });
    expect(and[1].OR).toEqual([
      { period: insensitive('Ravalement') },
      { batch: { label: insensitive('Ravalement') } },
      ...lotOwnerOr('Ravalement')
    ]);
    expect(res.body.pagination).toEqual({ page: 3, limit: 20, total: 41, totalPages: 3 });
    expect(res.body.summary.totalCount).toBe(41);
  });

  it('une valeur de statut unique reste acceptée', async () => {
    const res = await request(app).get(`${BASE}/charges?status=PAID`);
    expect(res.status).toBe(200);
    expect(prisma.chargeCall.findMany.mock.calls[0][0].where.AND).toEqual([{ status: 'PAID' }]);
  });

  it('refuse un statut, un lotId ou une pagination invalides, et une autre agence', async () => {
    expect((await request(app).get(`${BASE}/charges?status=LATE`)).status).toBe(400);
    expect((await request(app).get(`${BASE}/charges?lotId=1`)).status).toBe(400);
    expect((await request(app).get(`${BASE}/charges?limit=500`)).status).toBe(400);
    expect((await request(app).get(`/t/tenant-b/syndics/${SYNDIC}/charges`)).status).toBe(403);
  });
});

describe('GET compte/transactions', () => {
  it('type multiple, recherche sur le libellé, période ; total identique pour la liste et le compteur', async () => {
    prisma.ownerAccountTransaction.count.mockResolvedValue(33);
    const res = await request(app).get(
      `${BASE}/lots/${LOT}/compte/transactions?type=PAYMENT,PENALTY&search=loyer&from=2026-01-01&to=2026-03-01&limit=10`
    );
    expect(res.status).toBe(200);
    const where = prisma.ownerAccountTransaction.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      accountId: 'acc-1',
      type: { in: ['PAYMENT', 'PENALTY'] },
      label: insensitive('loyer')
    });
    expect(where.transactionDate.gte).toEqual(new Date('2026-01-01'));
    expect(prisma.ownerAccountTransaction.count).toHaveBeenCalledWith({ where });
    expect(res.body.summary.totalCount).toBe(33);
    expect(res.body.pagination).toEqual({ page: 1, limit: 10, total: 33, totalPages: 4 });
    // Le compte est cherché dans la copropriété de l'agence.
    expect(prisma.ownerAccount.findFirst.mock.calls[0][0].where).toMatchObject({
      lotId: LOT,
      syndicateId: SYNDIC,
      syndicate: { tenantId: TENANT }
    });
  });

  it('refuse un type inconnu et une période inversée ; lot sans compte (autre agence) → 404', async () => {
    expect((await request(app).get(`${BASE}/lots/${LOT}/compte/transactions?type=CASH`)).status).toBe(400);
    expect(
      (await request(app).get(`${BASE}/lots/${LOT}/compte/transactions?from=2026-03-01&to=2026-01-01`)).status
    ).toBe(400);
    prisma.ownerAccount.findFirst.mockResolvedValue(null);
    expect((await request(app).get(`${BASE}/lots/${LOT}/compte/transactions`)).status).toBe(404);
  });
});
