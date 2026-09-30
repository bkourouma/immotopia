/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BUG-2026-09-30-081 : créer une campagne sans liste renvoyait l'erreur Prisma
 * brute (chemin disque, code source). BUG-2026-09-30-085 : les destinataires
 * d'une campagne sans `page`/`limit` répondaient 500 (`skip: NaN`).
 *
 * Chaque corps du module newsletter est validé par zod (400 VALIDATION_ERROR
 * avec `errors[]`), les identifiants (liste, modèle) sont vérifiés contre
 * l'agence, et aucune réponse ne porte de chemin ni d'invocation Prisma.
 */
import './../helpers/app-shims';
import express from 'express';
import request from 'supertest';

type Row = Record<string, any>;
const db = {
  lists: [] as Row[],
  templates: [] as Row[],
  campaigns: [] as Row[],
  recipients: [] as Row[]
};
const RAW_PRISMA_ERROR =
  'Invalid `prisma.newsletterCampaign.create()` invocation in D:/APP/Immobillier/packages/api/src/services/x.ts:240:36';

const byWhere = (rows: Row[], where: Row = {}) =>
  rows.filter(r => Object.entries(where).every(([k, v]) => typeof v === 'object' || r[k] === v));

const findMany = jest.fn();
jest.mock('../../src/utils/database', () => ({
  prisma: {
    newsletterList: {
      findFirst: jest.fn(async ({ where }: any) => byWhere(db.lists, where)[0] ?? null),
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => db.lists),
      create: jest.fn(async ({ data }: any) => ({ id: 'l-new', ...data }))
    },
    newsletterTemplate: {
      findFirst: jest.fn(async ({ where }: any) => byWhere(db.templates, where)[0] ?? null),
      findUnique: jest.fn(async () => null),
      create: jest.fn(async ({ data }: any) => ({ id: 't-new', ...data }))
    },
    newsletterCampaign: {
      findFirst: jest.fn(async ({ where }: any) => byWhere(db.campaigns, where)[0] ?? null),
      // Simule le refus Prisma brut si la liste manque : ne doit jamais sortir.
      create: jest.fn(async ({ data }: any) => {
        if (!data.listId) throw new Error(RAW_PRISMA_ERROR);
        const row = { id: 'c-new', ...data };
        db.campaigns.push(row);
        return row;
      })
    },
    newsletterCampaignRecipient: {
      findMany: (...a: any[]) => findMany(...a),
      count: jest.fn(async () => 0)
    },
    newsletterSubscriber: { findFirst: jest.fn(async () => null), findUnique: jest.fn(async () => null) }
  }
}));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));

import * as controller from '../../src/controllers/newsletter-controller';
import { errorHandler } from '../../src/middleware/error-middleware';

const TENANT = 'tenant-1';
const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.tenantContext = { tenantId: TENANT };
  req.user = { userId: 'user-1' };
  next();
});
app.post('/lists', controller.createListHandler);
app.post('/lists/:listId/subscribers', controller.addSubscriberHandler);
app.post('/lists/:listId/subscribers/from-contacts', controller.addSubscribersFromContactsHandler);
app.post('/campaigns', controller.createCampaignHandler);
app.patch('/campaigns/:campaignId', controller.updateCampaignHandler);
app.post('/campaigns/:campaignId/schedule', controller.scheduleCampaignHandler);
app.get('/campaigns/:campaignId/recipients', controller.listRecipientsHandler);
app.post('/templates', controller.createTemplateHandler);
app.use(errorHandler);

const expectClean = (body: unknown) => {
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/prisma/i);
  expect(text).not.toMatch(/[A-Za-z]:[\\/]/);
  expect(text).not.toMatch(/\.ts:\d+/);
};

beforeEach(() => {
  db.lists = [
    { id: 'l1', tenantId: TENANT, name: 'Investisseurs', type: 'MANUAL' },
    { id: 'l-other', tenantId: 'tenant-2', name: 'Autre', type: 'MANUAL' }
  ];
  db.templates = [{ id: 't-other', tenantId: 'tenant-2', name: 'Modèle', html: '<p/>' }];
  db.campaigns = [{ id: 'c1', tenantId: TENANT, listId: 'l1', status: 'DRAFT', subject: 's', bodyHtml: '<p/>' }];
  findMany.mockReset().mockResolvedValue([]);
});

describe('Newsletter — validation des corps (400 VALIDATION_ERROR)', () => {
  it('campagne sans liste : refus court, sans Prisma ni chemin', async () => {
    const res = await request(app).post('/campaigns').send({ name: 'Test', subject: 'Sujet', bodyHtml: '<p>x</p>' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors).toEqual([expect.objectContaining({ field: 'listId' })]);
    expectClean(res.body);
  });

  it.each([
    ['liste sans nom', '/lists', { type: 'MANUAL' }],
    ['liste de type inconnu', '/lists', { name: 'A', type: 'BIDON' }],
    ['modèle sans contenu', '/templates', { name: 'A' }],
    ['abonné sans e-mail valide', '/lists/l1/subscribers', { email: 'pas-un-email' }],
    ['ajout depuis contacts vide', '/lists/l1/subscribers/from-contacts', { contactIds: [] }],
    ['corps absent', '/campaigns', undefined]
  ])('%s : 400 VALIDATION_ERROR propre', async (_label, url, payload) => {
    const req = request(app).post(url);
    const res = await (payload === undefined ? req : req.send(payload));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.errors)).toBe(true);
    expectClean(res.body);
  });

  it('planification avec date invalide : 400', async () => {
    const res = await request(app).post('/campaigns/c1/schedule').send({ scheduledAt: 'demain' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('une erreur Prisma brute levée par un service ne sort jamais', async () => {
    const res = await request(app).post('/campaigns').send({ listId: 'l1', subject: 'S', bodyHtml: '<p>x</p>' });
    // Création valide : 201 ; le refus brut n'est atteignable que sans listId (bloqué avant).
    expect(res.status).toBe(201);
    expectClean(res.body);
  });
});

describe('Newsletter — appartenance à l’agence (404 identique)', () => {
  it('liste d’une autre agence = liste inexistante', async () => {
    const other = await request(app).post('/campaigns').send({ listId: 'l-other', subject: 'S', bodyHtml: '<p>x</p>' });
    const missing = await request(app)
      .post('/campaigns')
      .send({ listId: 'inconnue', subject: 'S', bodyHtml: '<p>x</p>' });

    expect(other.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(other.body).toEqual(missing.body);
  });

  it('modèle d’une autre agence = modèle inexistant (création et mise à jour)', async () => {
    const created = await request(app)
      .post('/campaigns')
      .send({ listId: 'l1', templateId: 't-other', subject: 'S', bodyHtml: '<p>x</p>' });
    const unknown = await request(app)
      .post('/campaigns')
      .send({ listId: 'l1', templateId: 'inconnu', subject: 'S', bodyHtml: '<p>x</p>' });
    const updated = await request(app).patch('/campaigns/c1').send({ templateId: 't-other' });

    expect(created.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(created.body).toEqual(unknown.body);
    expect(updated.status).toBe(404);
  });
});

describe('Newsletter — pagination des destinataires (BUG-085)', () => {
  it('sans page ni limit : 200 avec défauts 1 / 20', async () => {
    const res = await request(app).get('/campaigns/c1/recipients');

    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 20 }));
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20 });
  });

  it('limit au-delà du plafond (1000) : 400 traduit, jamais tronqué en silence, sans Prisma', async () => {
    findMany.mockClear();
    const res = await request(app).get('/campaigns/c1/recipients?limit=5000');
    expect(res.status).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
  });

  it.each(['page=abc', 'limit=x', 'page=-1', 'limit=0'])('%s : 400 traduit, sans Prisma', async query => {
    const res = await request(app).get(`/campaigns/c1/recipients?${query}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toBeTruthy();
    expect(findMany).not.toHaveBeenCalled();
    expectClean(res.body);
  });
});
