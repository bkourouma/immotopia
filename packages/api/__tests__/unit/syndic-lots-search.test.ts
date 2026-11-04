/**
 * Lot SYN-B : `GET /syndics/:syndicId/lots?search=&limit=`. Prisma est mocké :
 * on vérifie la lecture envoyée (recherche en OR, agence et copropriété
 * conservées), les refus (400) et que l'appel SANS paramètre reste celui
 * d'avant (liste complète, aucun `where`/`take`/`orderBy` sur les lots).
 */
import express from 'express';
import request from 'supertest';

jest.mock('@prisma/client', () => {
  const prisma: any = { syndicate: { findFirst: jest.fn() } };
  const actual = jest.requireActual('@prisma/client');
  return { ...actual, PrismaClient: jest.fn(() => prisma), __mockPrisma: prisma };
});

import { listSyndicLotsHandler } from '../../src/controllers/syndic-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

const { __mockPrisma: prisma } = jest.requireMock('@prisma/client') as { __mockPrisma: any };

const TENANT = 'tenant-a';
const SYNDIC = '11111111-1111-4111-8111-111111111111';
const BASE = `/t/${TENANT}/syndics/${SYNDIC}/lots`;

const app = express();
app.get('/t/:tenantId/syndics/:syndicId/lots', listSyndicLotsHandler);
app.use(errorHandler);

const insensitive = (value: string) => ({ contains: value, mode: 'insensitive' });

beforeEach(() => {
  jest.resetAllMocks();
  prisma.syndicate.findFirst.mockImplementation(async ({ where }: any) =>
    where.id === SYNDIC && where.tenantId === TENANT ? { id: SYNDIC, lots: [{ id: 'lot-1', lotNumber: 'A1' }] } : null
  );
});

describe('GET lots', () => {
  it('sans paramètre : lecture identique à avant (aucun where, take ni orderBy sur les lots)', async () => {
    const res = await request(app).get(BASE);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    const call = prisma.syndicate.findFirst.mock.calls[0][0];
    expect(call.where).toEqual({ id: SYNDIC, tenantId: TENANT, status: { not: 'IN_LIQUIDATION' } });
    expect(call.include.lots.where).toBeUndefined();
    expect(call.include.lots.take).toBeUndefined();
    expect(call.include.lots.orderBy).toBeUndefined();
  });

  it('search vide ou en espaces vaut aucun paramètre', async () => {
    const res = await request(app).get(`${BASE}?search=%20%20&limit=`);
    expect(res.status).toBe(200);
    const lots = prisma.syndicate.findFirst.mock.calls[0][0].include.lots;
    expect(lots.where).toBeUndefined();
    expect(lots.take).toBeUndefined();
  });

  it('search : OR sur le lot, le bien lié et les propriétaires actuels, copropriété et agence conservées', async () => {
    const res = await request(app).get(`${BASE}?search=%20Awa%20&limit=20`);
    expect(res.status).toBe(200);
    const call = prisma.syndicate.findFirst.mock.calls[0][0];
    expect(call.where.tenantId).toBe(TENANT);
    expect(call.where.id).toBe(SYNDIC);
    const lots = call.include.lots;
    expect(lots.take).toBe(20);
    expect(lots.orderBy).toEqual([{ lotNumber: 'asc' }, { id: 'asc' }]);
    const or = lots.where.OR;
    expect(or).toHaveLength(4);
    expect(or[0]).toEqual({ lotNumber: insensitive('Awa') });
    expect(or[1]).toEqual({ property: { title: insensitive('Awa') } });
    expect(or[2]).toEqual({ property: { address: insensitive('Awa') } });
    const owners = or[3].ownerProfiles.some;
    expect(owners.isActive).toBe(true);
    expect(owners.contact.OR).toEqual([
      { firstName: insensitive('Awa') },
      { lastName: insensitive('Awa') },
      { legalName: insensitive('Awa') },
      { email: insensitive('Awa') }
    ]);
  });

  it('limit sans search : plafonne et trie de façon stable', async () => {
    await request(app).get(`${BASE}?limit=5`);
    const lots = prisma.syndicate.findFirst.mock.calls[0][0].include.lots;
    expect(lots.take).toBe(5);
    expect(lots.where).toBeUndefined();
  });

  it('traite les jokers SQL comme des caractères du numéro de lot et du propriétaire', async () => {
    const res = await request(app).get(`${BASE}?search=${encodeURIComponent('A_%\\B')}`);
    expect(res.status).toBe(200);
    const or = prisma.syndicate.findFirst.mock.calls[0][0].include.lots.where.OR;
    expect(or[0]).toEqual({ lotNumber: insensitive('A\\_\\%\\\\B') });
    expect(or[3].ownerProfiles.some.contact.OR[0]).toEqual({ firstName: insensitive('A\\_\\%\\\\B') });
  });

  it.each(['limit=51', 'limit=0', 'limit=abc', 'limit=1.5', `search=${'a'.repeat(201)}`])(
    'refuse %s avec 400 sans lire la base',
    async query => {
      const res = await request(app).get(`${BASE}?${query}`);
      expect(res.status).toBe(400);
      expect(prisma.syndicate.findFirst).not.toHaveBeenCalled();
    }
  );

  it("copropriété d'une autre agence : même 404 qu'une copropriété inexistante", async () => {
    const other = await request(app).get(`/t/tenant-b/syndics/${SYNDIC}/lots?search=x`);
    const missing = await request(app).get(`/t/${TENANT}/syndics/99999999-9999-4999-8999-999999999999/lots`);
    expect(other.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(other.body).toEqual(missing.body);
  });
});
