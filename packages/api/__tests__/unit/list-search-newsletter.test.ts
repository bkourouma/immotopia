/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Recherche multicritères du module newsletter (lot DIV-C) : `search`,
 * `status` multiple, `listId`, `from`/`to` sur les campagnes ; `search` sur les
 * abonnés (listes manuelles et dérivées) et les modèles. Les paramètres sont
 * validés (400) et restent dans le `where` de l'agence.
 */
import './../helpers/app-shims';
import express from 'express';
import request from 'supertest';

const campaignFindMany = jest.fn();
const campaignCount = jest.fn();
const subscriberFindMany = jest.fn();
const subscriberCount = jest.fn();
const templateFindMany = jest.fn();
const listFindFirst = jest.fn();
const ownerFindMany = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    newsletterCampaign: {
      findMany: (...a: any[]) => campaignFindMany(...a),
      count: (...a: any[]) => campaignCount(...a)
    },
    newsletterCampaignRecipient: { count: jest.fn(async () => 0) },
    newsletterSubscriber: {
      findMany: (...a: any[]) => subscriberFindMany(...a),
      count: (...a: any[]) => subscriberCount(...a)
    },
    newsletterTemplate: { findMany: (...a: any[]) => templateFindMany(...a) },
    newsletterList: { findFirst: (...a: any[]) => listFindFirst(...a) },
    tenantClient: { findMany: (...a: any[]) => ownerFindMany(...a) },
    crmContact: { findMany: jest.fn(async () => []) }
  }
}));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));

import * as controller from '../../src/controllers/newsletter-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.tenantContext = { tenantId: 't1' };
  req.user = { userId: 'u1' };
  next();
});
app.get('/campaigns', controller.listCampaignsHandler);
app.get('/templates', controller.listTemplatesHandler);
app.get('/lists/:listId/subscribers', controller.listSubscribersHandler);
app.use(errorHandler);

beforeEach(() => {
  [
    campaignFindMany,
    campaignCount,
    subscriberFindMany,
    subscriberCount,
    templateFindMany,
    listFindFirst,
    ownerFindMany
  ].forEach(fn => fn.mockReset());
  campaignFindMany.mockResolvedValue([]);
  campaignCount.mockResolvedValue(0);
  subscriberFindMany.mockResolvedValue([]);
  subscriberCount.mockResolvedValue(0);
  templateFindMany.mockResolvedValue([]);
  listFindFirst.mockResolvedValue({ id: 'l1', tenantId: 't1', type: 'MANUAL' });
});

describe('GET /campaigns', () => {
  it("combine recherche, statuts, liste et période dans le where de l'agence", async () => {
    const res = await request(app).get(
      '/campaigns?search=%20soldes%20&status=DRAFT,SENT&listId=l1&from=2026-10-01&to=2026-10-31'
    );
    expect(res.status).toBe(200);
    const where = campaignFindMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
    expect(where.status).toEqual({ in: ['DRAFT', 'SENT'] });
    expect(where.listId).toBe('l1');
    expect(where.OR).toEqual([
      { subject: { contains: 'soldes', mode: 'insensitive' } },
      { list: { name: { contains: 'soldes', mode: 'insensitive' } } }
    ]);
    expect(where.createdAt.gte).toEqual(new Date('2026-10-01T00:00:00.000Z'));
    expect(where.createdAt.lte).toEqual(new Date('2026-10-31T23:59:59.999Z'));
  });

  it('un statut seul reste un statut simple, sans paramètre le where ne filtre que sur l’agence', async () => {
    await request(app).get('/campaigns?status=SENT');
    expect(campaignFindMany.mock.calls[0][0].where.status).toBe('SENT');
    campaignFindMany.mockClear();
    await request(app).get('/campaigns');
    expect(campaignFindMany.mock.calls[0][0].where).toEqual({ tenantId: 't1' });
  });

  it('un listId d’une autre agence reste dans le where de l’agence (aucun résultat, pas d’erreur)', async () => {
    const res = await request(app).get('/campaigns?listId=liste-etrangere');
    expect(res.status).toBe(200);
    expect(campaignFindMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', listId: 'liste-etrangere' });
  });

  it.each([
    'status=INCONNU',
    'status=DRAFT,NOPE',
    'from=hier',
    'to=2026-13-45',
    'from=2026-02-31',
    `search=${'a'.repeat(101)}`
  ])('refuse %s en 400 sans interroger la base', async query => {
    const res = await request(app).get(`/campaigns?${query}`);
    expect(res.status).toBe(400);
    expect(campaignFindMany).not.toHaveBeenCalled();
  });
});

describe('GET /templates', () => {
  it('filtre sur le nom, insensible à la casse, dans l’agence', async () => {
    await request(app).get('/templates?search=Standard');
    expect(templateFindMany.mock.calls[0][0].where).toEqual({
      tenantId: 't1',
      name: { contains: 'Standard', mode: 'insensitive' }
    });
  });

  it('sans recherche, renvoie tous les modèles de l’agence', async () => {
    await request(app).get('/templates');
    expect(templateFindMany.mock.calls[0][0].where).toEqual({ tenantId: 't1' });
  });
});

describe('GET /lists/:listId/subscribers', () => {
  it('cherche dans l’e-mail et le nom, et accepte plusieurs statuts', async () => {
    await request(app).get('/lists/l1/subscribers?search=awa&status=ACTIVE,UNSUBSCRIBED');
    const where = subscriberFindMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
    expect(where.listId).toBe('l1');
    expect(where.status).toEqual({ in: ['ACTIVE', 'UNSUBSCRIBED'] });
    expect(where.OR).toEqual([
      { email: { contains: 'awa', mode: 'insensitive' } },
      { name: { contains: 'awa', mode: 'insensitive' } }
    ]);
  });

  it('filtre une liste dérivée sur l’e-mail et le nom, puis pagine le résultat filtré', async () => {
    listFindFirst.mockResolvedValue({ id: 'l2', tenantId: 't1', type: 'FROM_OWNERS' });
    ownerFindMany.mockResolvedValue([
      { user: { id: 'u1', email: 'awa@ex.com', fullName: 'Awa Traoré' } },
      { user: { id: 'u2', email: 'koffi@ex.com', fullName: 'Koffi Yao' } },
      { user: { id: 'u3', email: 'autre@ex.com', fullName: 'Awa Konan' } }
    ]);
    const res = await request(app).get('/lists/l2/subscribers?search=AWA&limit=1');
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(2);
    expect(res.body.subscribers).toHaveLength(1);
    expect(res.body.subscribers[0].email).toBe('awa@ex.com');
    expect(subscriberFindMany).not.toHaveBeenCalled();
  });

  it('refuse un statut inconnu en 400', async () => {
    const res = await request(app).get('/lists/l1/subscribers?status=ZZZ');
    expect(res.status).toBe(400);
  });
});
