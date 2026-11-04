/**
 * Lot SYN-A : recherche serveur des listes de paiement des copropriétés
 * (quittances, paiements déclarés, paiement en ligne, prélèvement). Prisma est
 * mocké : on vérifie le where envoyé, l'enveloppe de pagination, les refus
 * (400) et l'isolation par agence et par copropriété.
 */
import express from 'express';
import request from 'supertest';

jest.mock('@prisma/client', () => {
  const model = () => ({ findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() });
  const prisma: any = {
    syndicate: { findFirst: jest.fn() },
    syndicateLot: { findFirst: jest.fn() },
    syndicChargeReceipt: model(),
    crmContact: model(),
    syndicPaymentDeclaration: model(),
    syndicDeclaredPaymentSettings: model(),
    syndicOnlineCheckout: model(),
    syndicPaymentGatewayConfig: model(),
    directDebitMandate: model(),
    directDebitRemittance: model(),
    $transaction: jest.fn()
  };
  // Les énumérations (importées par les modules du prélèvement) restent celles du client généré.
  const actual = jest.requireActual('@prisma/client');
  return { ...actual, PrismaClient: jest.fn(() => prisma), __mockPrisma: prisma };
});

import { listLotReceiptsHandler, listSyndicateReceiptsHandler } from '../../src/controllers/syndic-receipts-controller';
import { listDeclarationsHandler } from '../../src/controllers/syndic-declared-payment-controller';
import { listCheckoutsHandler } from '../../src/controllers/syndic-online-payment-controller';
import { listMandatesHandler, listRemittancesHandler } from '../../src/controllers/syndic-direct-debit-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

const { __mockPrisma: prisma } = jest.requireMock('@prisma/client') as { __mockPrisma: any };

const TENANT = 'tenant-a';
const SYNDIC = '11111111-1111-4111-8111-111111111111';
const OTHER_SYNDIC = '99999999-9999-4999-8999-999999999999';
const LOT = '22222222-2222-4222-8222-222222222222';
const FOREIGN_LOT = '33333333-3333-4333-8333-333333333333';
const BASE = `/t/${TENANT}/syndics/${SYNDIC}`;

const app = express();
app.use(express.json());
const mount = (path: string, handler: express.RequestHandler) =>
  app.get(`/t/:tenantId/syndics/:syndicId${path}`, handler);
mount('/quittances', listSyndicateReceiptsHandler);
mount('/lots/:lotId/quittances', listLotReceiptsHandler);
mount('/paiements-declares', listDeclarationsHandler);
mount('/paiements-en-ligne', listCheckoutsHandler);
mount('/prelevements/mandats', listMandatesHandler);
mount('/prelevements/remises', listRemittancesHandler);
app.use(errorHandler);

const insensitive = (value: string) => ({ contains: value, mode: 'insensitive' });
const contactOr = (value: string) => [
  { firstName: insensitive(value) },
  { lastName: insensitive(value) },
  { legalName: insensitive(value) },
  { email: insensitive(value) }
];

beforeEach(() => {
  jest.resetAllMocks();
  prisma.syndicate.findFirst.mockImplementation(async ({ where }: any) =>
    where.id === SYNDIC && where.tenantId === TENANT ? { id: SYNDIC, tenantId: TENANT } : null
  );
  prisma.syndicateLot.findFirst.mockImplementation(async ({ where }: any) =>
    where.id === LOT && where.syndicateId === SYNDIC ? { id: LOT } : null
  );
  for (const name of [
    'syndicChargeReceipt',
    'syndicPaymentDeclaration',
    'syndicOnlineCheckout',
    'directDebitMandate',
    'directDebitRemittance'
  ]) {
    prisma[name].findMany.mockResolvedValue([]);
    prisma[name].count.mockResolvedValue(0);
  }
  prisma.crmContact.findMany.mockResolvedValue([]);
  prisma.syndicDeclaredPaymentSettings.findFirst.mockResolvedValue(null);
  prisma.syndicPaymentGatewayConfig.findFirst.mockResolvedValue(null);
});

describe('GET quittances', () => {
  it('cherche le pourcentage littéral dans le périmètre de la copropriété', async () => {
    const res = await request(app).get(`${BASE}/quittances?search=%25`);
    expect(res.status).toBe(200);
    const where = prisma.syndicChargeReceipt.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: TENANT, syndicateId: SYNDIC });
    const or = where.AND[0].OR;
    expect(or[0].number.contains).toBe('\\%');
    expect(or[1].lot.lotNumber.contains).toBe('\\%');
    expect(or[2].contact.OR[0].firstName.contains).toBe('\\%');
  });

  it('construit le where de recherche (numéro, lot, copropriétaire) et de « rattrapé »', async () => {
    const res = await request(app).get(
      `${BASE}/quittances?search=%20Awa%20&backfilled=true&from=2026-01-01&to=2026-02-01`
    );
    expect(res.status).toBe(200);
    const where = prisma.syndicChargeReceipt.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe(TENANT);
    expect(where.syndicateId).toBe(SYNDIC);
    expect(where.AND).toHaveLength(3);
    expect(where.AND[1]).toEqual({
      OR: [
        { number: insensitive('Awa') },
        { lot: { lotNumber: insensitive('Awa') } },
        { contact: { OR: contactOr('Awa') } }
      ]
    });
    expect(where.AND[2]).toEqual({ snapshot: { path: ['backfilled'], equals: true } });
    expect(res.body.data).toEqual({ items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } });
  });

  it('accepte backfilled=false et ignore les paramètres vides', async () => {
    const res = await request(app).get(`${BASE}/quittances?search=&backfilled=false`);
    expect(res.status).toBe(200);
    expect(prisma.syndicChargeReceipt.findMany.mock.calls[0][0].where.AND).toEqual([
      { snapshot: { path: ['backfilled'], equals: false } }
    ]);
    const bare = await request(app).get(`${BASE}/quittances?search=&backfilled=`);
    expect(bare.status).toBe(200);
    expect(prisma.syndicChargeReceipt.findMany.mock.calls[1][0].where.AND).toBeUndefined();
  });

  it.each(['backfilled=peutetre', `search=${'a'.repeat(101)}`, 'from=2026-02-30', 'from=2026-03-01&to=2026-01-01'])(
    'refuse %s avec un 400',
    async query => {
      const res = await request(app).get(`${BASE}/quittances?${query}`);
      expect(res.status).toBe(400);
      expect(prisma.syndicChargeReceipt.findMany).not.toHaveBeenCalled();
    }
  );

  it("refuse la copropriété d'une autre agence (404)", async () => {
    const res = await request(app).get(`/t/${TENANT}/syndics/${OTHER_SYNDIC}/quittances?search=x`);
    expect(res.status).toBe(404);
    expect(prisma.syndicChargeReceipt.findMany).not.toHaveBeenCalled();
  });

  it("filtre la liste d'un lot par lot ET copropriété ; un lot étranger répond 404", async () => {
    const ok = await request(app).get(`${BASE}/lots/${LOT}/quittances?search=Q-2026`);
    expect(ok.status).toBe(200);
    expect(prisma.syndicChargeReceipt.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: TENANT,
      syndicateId: SYNDIC,
      lotId: LOT
    });
    expect((await request(app).get(`${BASE}/lots/${FOREIGN_LOT}/quittances?search=Q`)).status).toBe(404);
  });

  it('un lotId étranger sur la liste de la copropriété répond 404 (garde existant conservé)', async () => {
    const res = await request(app).get(`${BASE}/quittances?lotId=${FOREIGN_LOT}&search=Q`);
    expect(res.status).toBe(404);
    expect(prisma.syndicChargeReceipt.findMany).not.toHaveBeenCalled();
  });
});

describe('GET paiements-declares', () => {
  it('recherche déclarant / référence / téléphone / lot, bornée à la copropriété', async () => {
    prisma.crmContact.findMany.mockResolvedValue([{ id: 'c1' }]);
    const res = await request(app).get(`${BASE}/paiements-declares?status=APPROVED&search=%20Awa%20`);
    expect(res.status).toBe(200);
    expect(prisma.crmContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, OR: contactOr('Awa') } })
    );
    const where = prisma.syndicPaymentDeclaration.count.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: TENANT, syndicateId: SYNDIC, status: { in: ['APPROVED'] } });
    expect(where.AND).toEqual([
      {
        OR: [
          { transactionReference: insensitive('Awa') },
          { payerPhone: insensitive('Awa') },
          { lines: { some: { lot: { lotNumber: insensitive('Awa') } } } },
          { declaredByContactId: { in: ['c1'] } }
        ]
      }
    ]);
  });

  it('restreint aussi les déclarations en attente à la recherche', async () => {
    await request(app).get(`${BASE}/paiements-declares?status=PENDING&search=MP2601`);
    const probe = prisma.syndicPaymentDeclaration.findMany.mock.calls.find(
      ([arg]: any) => arg.select && arg.select.id === true && Object.keys(arg.select).length === 1
    );
    expect(probe).toBeDefined();
    expect(probe[0].where).toMatchObject({ tenantId: TENANT, syndicateId: SYNDIC, status: 'PENDING' });
    expect(probe[0].where.OR).toBeDefined();
  });

  it('ignore une recherche vide : aucun critère ajouté', async () => {
    await request(app).get(`${BASE}/paiements-declares?status=APPROVED&search=`);
    expect(prisma.crmContact.findMany).not.toHaveBeenCalled();
    expect(prisma.syndicPaymentDeclaration.count.mock.calls[0][0].where.AND).toBeUndefined();
  });

  it.each([`search=${'a'.repeat(101)}`, 'status=BOGUS', 'from=pasunedate'])('refuse %s avec un 400', async query => {
    const res = await request(app).get(`${BASE}/paiements-declares?${query}`);
    expect(res.status).toBe(400);
  });

  it("refuse la copropriété d'une autre agence (404)", async () => {
    const res = await request(app).get(`/t/${TENANT}/syndics/${OTHER_SYNDIC}/paiements-declares?search=x`);
    expect(res.status).toBe(404);
    expect(prisma.syndicPaymentDeclaration.findMany).not.toHaveBeenCalled();
  });

  it('garde un lot étranger dans le where (aucun résultat)', async () => {
    await request(app).get(`${BASE}/paiements-declares?status=APPROVED&lotId=${FOREIGN_LOT}&search=x`);
    expect(prisma.syndicPaymentDeclaration.count.mock.calls[0][0].where).toMatchObject({
      syndicateId: SYNDIC,
      lines: { some: { lotId: FOREIGN_LOT } }
    });
  });
});

describe('GET paiements-en-ligne', () => {
  it('recherche code / lot / payeur et borne la création', async () => {
    prisma.crmContact.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    const res = await request(app).get(`${BASE}/paiements-en-ligne?search=PAY-1&from=2026-01-01&to=2026-01-31`);
    expect(res.status).toBe(200);
    const where = prisma.syndicOnlineCheckout.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: TENANT, syndicateId: SYNDIC });
    expect(where.AND).toEqual([
      {
        OR: [
          { codePaiement: insensitive('PAY-1') },
          { lot: { lotNumber: insensitive('PAY-1') } },
          { contactId: { in: ['c1', 'c2'] } }
        ]
      }
    ]);
    expect(where.createdAt).toEqual({
      gte: new Date('2026-01-01T00:00:00.000Z'),
      lt: new Date('2026-02-01T00:00:00.000Z')
    });
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 1 });
  });

  it('sans contact trouvé, la recherche porte sur le code et le lot seulement', async () => {
    await request(app).get(`${BASE}/paiements-en-ligne?search=zz`);
    expect(prisma.syndicOnlineCheckout.findMany.mock.calls[0][0].where.AND[0].OR).toHaveLength(2);
  });

  it.each([`search=${'a'.repeat(101)}`, 'from=2026-02-30', 'to=abc', 'status=BOGUS', 'limit=101'])(
    'refuse %s avec un 400',
    async query => {
      const res = await request(app).get(`${BASE}/paiements-en-ligne?${query}`);
      expect(res.status).toBe(400);
      expect(prisma.syndicOnlineCheckout.findMany).not.toHaveBeenCalled();
    }
  );

  it("refuse la copropriété d'une autre agence (404) et garde un lot étranger dans le where", async () => {
    const other = await request(app).get(`/t/${TENANT}/syndics/${OTHER_SYNDIC}/paiements-en-ligne?search=x`);
    expect(other.status).toBe(404);
    await request(app).get(`${BASE}/paiements-en-ligne?lotId=${FOREIGN_LOT}&search=x`);
    expect(prisma.syndicOnlineCheckout.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: TENANT,
      syndicateId: SYNDIC,
      lotId: FOREIGN_LOT
    });
  });
});

describe('GET prelevements/mandats', () => {
  it('transmet la recherche au where, borné au syndicat et au périmètre', async () => {
    const res = await request(app).get(`${BASE}/prelevements/mandats?search=%20Awa%20&lotId=${LOT}`);
    expect(res.status).toBe(200);
    const where = prisma.directDebitMandate.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: TENANT, scope: 'SYNDIC_LOT', syndicateId: SYNDIC, lotId: LOT });
    expect(where.OR[0]).toEqual({ holderName: insensitive('Awa') });
  });

  it('traite une recherche vide comme absente et refuse 101 caractères', async () => {
    expect((await request(app).get(`${BASE}/prelevements/mandats?search=`)).status).toBe(200);
    expect(prisma.directDebitMandate.findMany.mock.calls[0][0].where.OR).toBeUndefined();
    expect((await request(app).get(`${BASE}/prelevements/mandats?search=${'a'.repeat(101)}`)).status).toBe(400);
  });
});

describe('GET prelevements/remises', () => {
  it('recherche par référence et borne la date de prélèvement', async () => {
    const res = await request(app).get(
      `${BASE}/prelevements/remises?search=PRL-2026-0012&from=2026-01-01&to=2026-03-31&status=DRAFT`
    );
    expect(res.status).toBe(200);
    const where = prisma.directDebitRemittance.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ tenantId: TENANT, scope: 'SYNDIC_LOT', syndicateId: SYNDIC, status: 'DRAFT' });
    expect(where.OR).toEqual([{ year: 2026, sequence: 12 }]);
    expect(where.collectionDate).toEqual({ gte: new Date('2026-01-01'), lte: new Date('2026-03-31') });
    expect(res.body.data).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it("accepte l'année seule ; un texte sans référence ne ramène rien", async () => {
    await request(app).get(`${BASE}/prelevements/remises?search=2026`);
    expect(prisma.directDebitRemittance.findMany.mock.calls[0][0].where.OR).toEqual([{ year: 2026 }]);
    await request(app).get(`${BASE}/prelevements/remises?search=abc`);
    expect(prisma.directDebitRemittance.findMany.mock.calls[1][0].where.OR).toEqual([{ id: { in: [] } }]);
  });

  it.each([
    `search=${'a'.repeat(101)}`,
    'search=PRL-2026&from=2026-02-30',
    'search=PRL-2026&from=2026-03-01&to=2026-01-01',
    'from=2026-03-01&to=2026-01-01',
    'status=BOGUS',
    'pageSize=101'
  ])('refuse %s avec un 400', async query => {
    const res = await request(app).get(`${BASE}/prelevements/remises?${query}`);
    expect(res.status).toBe(400);
    expect(prisma.directDebitRemittance.findMany).not.toHaveBeenCalled();
  });

  it('filtre toujours par la copropriété demandée et par l’agence', async () => {
    await request(app).get(`/t/${TENANT}/syndics/${OTHER_SYNDIC}/prelevements/remises?search=2026`);
    expect(prisma.directDebitRemittance.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: TENANT,
      scope: 'SYNDIC_LOT',
      syndicateId: OTHER_SYNDIC
    });
  });
});
