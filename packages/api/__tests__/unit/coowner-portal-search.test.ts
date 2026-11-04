/**
 * Lot SYN-B : recherche libre des listes du portail copropriétaire
 * (`GET /portal/copropriete/quittances` et `/paiements-declares`). Prisma est
 * mocké : la recherche s'ajoute en ET au périmètre du copropriétaire connecté
 * (jamais un identifiant reçu), valeur invalide : 400.
 */
import express from 'express';
import request from 'supertest';

jest.mock('@prisma/client', () => {
  const model = () => ({ findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() });
  const prisma: any = {
    syndicateLot: model(),
    syndicate: model(),
    syndicChargeReceipt: model(),
    syndicPaymentDeclaration: model()
  };
  const actual = jest.requireActual('@prisma/client');
  return { ...actual, PrismaClient: jest.fn(() => prisma), __mockPrisma: prisma };
});

import { listCoOwnerReceiptsHandler } from '../../src/controllers/coowner-portal-finance-controller';
import { listCoOwnerDeclarationsHandler } from '../../src/controllers/coowner-declared-payment-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

const { __mockPrisma: prisma } = jest.requireMock('@prisma/client') as { __mockPrisma: any };

const TENANT = 'tenant-a';
const SYNDIC = 'syndic-1';
const LOT = 'lot-1';
const CONTACT = 'contact-1';

const scope = {
  tenantId: TENANT,
  contactIds: [CONTACT],
  lots: [{ lotId: LOT, syndicateId: SYNDIC, contactId: CONTACT, visibleSince: null }],
  lotIds: [LOT],
  syndicateIds: [SYNDIC]
};

const app = express();
app.use((req: any, _res, next) => {
  req.coOwnerPortal = { scope };
  next();
});
app.get('/portal/copropriete/quittances', listCoOwnerReceiptsHandler);
app.get('/portal/copropriete/paiements-declares', listCoOwnerDeclarationsHandler);
app.use(errorHandler);

const insensitive = (value: string) => ({ contains: value, mode: 'insensitive' });

beforeEach(() => {
  jest.resetAllMocks();
  prisma.syndicateLot.findMany.mockResolvedValue([{ id: LOT, syndicateId: SYNDIC, lotNumber: 'A12' }]);
  prisma.syndicate.findMany.mockResolvedValue([{ id: SYNDIC, name: 'Les Palmiers' }]);
  prisma.syndicChargeReceipt.findMany.mockResolvedValue([]);
  prisma.syndicChargeReceipt.count.mockResolvedValue(0);
  prisma.syndicPaymentDeclaration.findMany.mockResolvedValue([]);
  prisma.syndicPaymentDeclaration.count.mockResolvedValue(0);
});

describe('GET portal/copropriete/quittances', () => {
  it('search : OR (numéro, période, lot) ajouté en ET au périmètre du copropriétaire', async () => {
    const res = await request(app).get('/portal/copropriete/quittances?search=%20Q-2026%20');
    expect(res.status).toBe(200);
    const where = prisma.syndicChargeReceipt.findMany.mock.calls[0][0].where;
    // Périmètre intact : agence, copropriétés, lots et OR de visibilité du copropriétaire.
    expect(where.tenantId).toBe(TENANT);
    expect(where.syndicateId).toEqual({ in: [SYNDIC] });
    expect(where.lotId).toEqual({ in: [LOT] });
    expect(where.OR).toEqual([{ contactId: { in: [CONTACT] } }, { contactId: null, lotId: LOT }]);
    // La recherche vit dans AND, jamais dans le OR de périmètre.
    expect(where.AND).toEqual([
      {
        OR: [
          { number: insensitive('Q-2026') },
          { periodLabel: insensitive('Q-2026') },
          { lot: { lotNumber: insensitive('Q-2026') } }
        ]
      }
    ]);
    expect(prisma.syndicChargeReceipt.count.mock.calls[0][0].where).toEqual(where);
  });

  it('sans search : aucun AND (requête identique à avant)', async () => {
    const res = await request(app).get('/portal/copropriete/quittances?search=');
    expect(res.status).toBe(200);
    expect(prisma.syndicChargeReceipt.findMany.mock.calls[0][0].where.AND).toBeUndefined();
  });

  it('search se combine avec la période dans le même AND', async () => {
    await request(app).get('/portal/copropriete/quittances?search=A12&from=2026-01-01&to=2026-03-31');
    const and = prisma.syndicChargeReceipt.findMany.mock.calls[0][0].where.AND;
    expect(and).toHaveLength(2);
  });

  it.each([`search=${'a'.repeat(201)}`, 'search=a&from=2026-02-30'])('refuse %s avec 400', async query => {
    const res = await request(app).get(`/portal/copropriete/quittances?${query}`);
    expect(res.status).toBe(400);
    expect(prisma.syndicChargeReceipt.findMany).not.toHaveBeenCalled();
  });
});

describe('GET portal/copropriete/paiements-declares', () => {
  it('search : référence de transaction ou numéro de lot, en ET au périmètre', async () => {
    const res = await request(app).get('/portal/copropriete/paiements-declares?search=%20MP26%20&status=PENDING');
    expect(res.status).toBe(200);
    const where = prisma.syndicPaymentDeclaration.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe(TENANT);
    expect(where.syndicateId).toEqual({ in: [SYNDIC] });
    expect(where.lines.some).toEqual({ lotId: { in: [LOT] } });
    expect(where.lines.every).toBeDefined();
    expect(where.status).toBe('PENDING');
    expect(where.AND).toEqual([
      {
        OR: [
          { transactionReference: insensitive('MP26') },
          { lines: { some: { lot: { lotNumber: insensitive('MP26') } } } }
        ]
      }
    ]);
    expect(prisma.syndicPaymentDeclaration.count.mock.calls[0][0].where).toEqual(where);
  });

  it('sans search : aucun AND (requête identique à avant)', async () => {
    const res = await request(app).get('/portal/copropriete/paiements-declares');
    expect(res.status).toBe(200);
    expect(prisma.syndicPaymentDeclaration.findMany.mock.calls[0][0].where.AND).toBeUndefined();
  });

  it.each([`search=${'a'.repeat(201)}`, 'status=NOPE', 'limit=51'])('refuse %s avec 400', async query => {
    const res = await request(app).get(`/portal/copropriete/paiements-declares?${query}`);
    expect(res.status).toBe(400);
    expect(prisma.syndicPaymentDeclaration.findMany).not.toHaveBeenCalled();
  });
});
