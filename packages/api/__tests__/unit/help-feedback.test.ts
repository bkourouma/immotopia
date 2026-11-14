/**
 * Avis sur les fiches d'aide interne : schémas, résolution vérifiée de l'agence, création,
 * synthèse (comptes, tri, bornes, cloisonnement agence / plateforme) et contrôleur.
 */
const mockPrisma = {
  membership: { findFirst: jest.fn() },
  tenantClient: { findFirst: jest.fn() },
  helpFeedback: { create: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import type { NextFunction, Request, Response } from 'express';
import { createHelpFeedbackSchema, listHelpFeedbackQuerySchema } from '../../src/lib/help/help-feedback-schemas';
import {
  createHelpFeedback,
  listHelpFeedbackSummary,
  resolveFeedbackTenantId
} from '../../src/services/help-feedback-service';
import {
  createHelpFeedbackHandler,
  listPlatformHelpFeedbackHandler,
  listTenantHelpFeedbackHandler
} from '../../src/controllers/help-feedback-controller';
import { AppError } from '../../src/middleware/error-middleware';
import { ZodError } from 'zod';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('createHelpFeedbackSchema', () => {
  const valid = { helpId: 'properties.list', useful: true, locale: 'fr' };

  it('accepte un avis utile seul, ou une question seule', () => {
    expect(createHelpFeedbackSchema.safeParse(valid).success).toBe(true);
    expect(createHelpFeedbackSchema.safeParse({ helpId: 'a.b', question: '  Comment ? ', locale: 'ar' })).toMatchObject(
      {
        success: true,
        data: { question: 'Comment ?' }
      }
    );
    expect(createHelpFeedbackSchema.safeParse({ ...valid, useful: false }).success).toBe(true);
  });

  it.each([
    ['majuscules', 'Properties.list'],
    ['sans point', 'properties'],
    ['plus de 120 caractères', `a.${'b'.repeat(119)}`],
    ['tiret dans le premier segment', 'my-page.list']
  ])('rejette un helpId invalide (%s)', (_label, helpId) => {
    expect(createHelpFeedbackSchema.safeParse({ ...valid, helpId }).success).toBe(false);
  });

  it('accepte un tiret à partir du second segment', () => {
    expect(createHelpFeedbackSchema.safeParse({ ...valid, helpId: 'rental.leases-detail' }).success).toBe(true);
  });

  it('exige un avis ou une question', () => {
    expect(createHelpFeedbackSchema.safeParse({ helpId: 'a.b', locale: 'fr' }).success).toBe(false);
  });

  it('rejette une question vide ou faite d’espaces, sans l’ignorer en silence', () => {
    expect(createHelpFeedbackSchema.safeParse({ ...valid, question: '' }).success).toBe(false);
    expect(createHelpFeedbackSchema.safeParse({ ...valid, question: '   ' }).success).toBe(false);
  });

  it('rejette une question de plus de 1000 caractères, accepte 1000', () => {
    expect(createHelpFeedbackSchema.safeParse({ ...valid, question: 'x'.repeat(1001) }).success).toBe(false);
    expect(createHelpFeedbackSchema.safeParse({ ...valid, question: 'x'.repeat(1000) }).success).toBe(true);
  });

  it('rejette un champ inconnu (tenantId, userId…)', () => {
    expect(createHelpFeedbackSchema.safeParse({ ...valid, tenantId: TENANT_A }).success).toBe(false);
    expect(createHelpFeedbackSchema.safeParse({ ...valid, userId: 'u' }).success).toBe(false);
  });

  it('rejette une langue hors fr/en/ar', () => {
    expect(createHelpFeedbackSchema.safeParse({ ...valid, locale: 'es' }).success).toBe(false);
    expect(createHelpFeedbackSchema.safeParse({ ...valid, locale: undefined }).success).toBe(false);
  });

  it('rejette un chemin de plus de 300 caractères', () => {
    expect(createHelpFeedbackSchema.safeParse({ ...valid, path: '/'.repeat(301) }).success).toBe(false);
    expect(createHelpFeedbackSchema.safeParse({ ...valid, path: '/'.repeat(300) }).success).toBe(true);
  });
});

describe('listHelpFeedbackQuerySchema', () => {
  it('vaut 30 par défaut', () => {
    expect(listHelpFeedbackQuerySchema.parse({})).toEqual({ days: 30 });
  });

  it('convertit une chaîne entière dans les bornes', () => {
    expect(listHelpFeedbackQuerySchema.parse({ days: '7' })).toEqual({ days: 7 });
    expect(listHelpFeedbackQuerySchema.parse({ days: '365' })).toEqual({ days: 365 });
    expect(listHelpFeedbackQuerySchema.parse({ days: '1' })).toEqual({ days: 1 });
  });

  it.each(['0', '366', 'abc', '1.5', '-3'])('rejette days=%s (jamais tronqué)', days => {
    expect(listHelpFeedbackQuerySchema.safeParse({ days }).success).toBe(false);
  });
});

describe('resolveFeedbackTenantId', () => {
  it('retient l’agence du chemin quand l’utilisateur en est membre ACTIF', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue({ id: 'm1' });
    const tenantId = await resolveFeedbackTenantId('u1', { path: `/tenant/${TENANT_A}/properties` });
    expect(tenantId).toBe(TENANT_A);
    expect(mockPrisma.membership.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', tenantId: TENANT_A, status: 'ACTIVE' },
      select: { id: true }
    });
  });

  it('accepte aussi le segment /tenants/<id>', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue({ id: 'm1' });
    expect(await resolveFeedbackTenantId('u1', { path: `/api/tenants/${TENANT_A}/crm?x=1` })).toBe(TENANT_A);
  });

  it('ignore l’agence d’un autre (ni membre ni client) : null, sans erreur', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue(null);
    mockPrisma.tenantClient.findFirst.mockResolvedValue(null);
    expect(await resolveFeedbackTenantId('u1', { path: `/tenant/${TENANT_B}/x` })).toBeNull();
  });

  it('retient l’agence de l’en-tête portail via TenantClient', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue(null);
    mockPrisma.tenantClient.findFirst.mockResolvedValue({ id: 'c1' });
    const tenantId = await resolveFeedbackTenantId('u1', { portalTenantHeader: TENANT_A });
    expect(tenantId).toBe(TENANT_A);
    expect(mockPrisma.tenantClient.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', tenantId: TENANT_A },
      select: { id: true }
    });
  });

  it('passe au candidat suivant quand le premier n’est pas vérifié', async () => {
    mockPrisma.membership.findFirst.mockImplementation(async ({ where }: any) =>
      where.tenantId === TENANT_A ? { id: 'm1' } : null
    );
    mockPrisma.tenantClient.findFirst.mockResolvedValue(null);
    const tenantId = await resolveFeedbackTenantId('u1', {
      path: `/tenant/${TENANT_B}/x`,
      portalTenantHeader: TENANT_A
    });
    expect(tenantId).toBe(TENANT_A);
  });

  it('renvoie null sans aucun candidat, sans interroger la base', async () => {
    expect(await resolveFeedbackTenantId('u1', { path: '/dashboard' })).toBeNull();
    expect(await resolveFeedbackTenantId('u1', {})).toBeNull();
    expect(mockPrisma.membership.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.tenantClient.findFirst).not.toHaveBeenCalled();
  });
});

describe('createHelpFeedback', () => {
  it('crée avec une agence, ne sélectionne que l’id et normalise les champs absents en null', async () => {
    mockPrisma.helpFeedback.create.mockResolvedValue({ id: 'f1' });
    const result = await createHelpFeedback('u1', { helpId: 'a.b', useful: false, locale: 'en' }, TENANT_A);
    expect(result).toEqual({ id: 'f1' });
    expect(mockPrisma.helpFeedback.create).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_A,
        userId: 'u1',
        helpId: 'a.b',
        useful: false,
        question: null,
        path: null,
        locale: 'en'
      },
      select: { id: true }
    });
  });

  it('crée sans agence (particulier, super-admin) : tenantId null', async () => {
    mockPrisma.helpFeedback.create.mockResolvedValue({ id: 'f2' });
    await createHelpFeedback('u1', { helpId: 'a.b', question: 'Comment ?', path: '/x', locale: 'ar' }, null);
    const data = mockPrisma.helpFeedback.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: null, useful: null, question: 'Comment ?', path: '/x' });
  });
});

describe('listHelpFeedbackSummary', () => {
  const at = (iso: string) => new Date(iso);

  function mockData(questionRows: unknown[] = []) {
    mockPrisma.helpFeedback.groupBy.mockImplementation(async (args: any) => {
      if (args.by.length === 2) {
        return [
          { helpId: 'a.calme', useful: true, _count: { _all: 5 }, _max: { createdAt: at('2026-11-10T10:00:00Z') } },
          { helpId: 'a.chaud', useful: true, _count: { _all: 1 }, _max: { createdAt: at('2026-11-12T10:00:00Z') } },
          { helpId: 'a.chaud', useful: false, _count: { _all: 4 }, _max: { createdAt: at('2026-11-13T10:00:00Z') } },
          { helpId: 'a.chaud', useful: null, _count: { _all: 2 }, _max: { createdAt: at('2026-11-11T10:00:00Z') } },
          { helpId: 'b.questions', useful: null, _count: { _all: 6 }, _max: { createdAt: at('2026-11-09T10:00:00Z') } }
        ];
      }
      return [
        { helpId: 'a.chaud', _count: { _all: 2 } },
        { helpId: 'b.questions', _count: { _all: 6 } }
      ];
    });
    mockPrisma.helpFeedback.findMany.mockResolvedValue(questionRows);
  }

  it('agrège utile / pas utile / questions, trie par (pas utile + questions) décroissant, dernier avis ISO', async () => {
    mockData();
    const { items } = await listHelpFeedbackSummary({ days: 30 });
    expect(items.map(i => i.helpId)).toEqual(['a.chaud', 'b.questions', 'a.calme']);
    expect(items[0]).toMatchObject({
      helpId: 'a.chaud',
      useful: 1,
      notUseful: 4,
      questionsCount: 2,
      lastAt: '2026-11-13T10:00:00.000Z'
    });
    expect(items[2]).toMatchObject({ useful: 5, notUseful: 0, questionsCount: 0, questions: [] });
  });

  it('ne garde que les 20 questions les plus récentes par fiche, avec le nom d’agence côté plateforme', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      helpId: 'b.questions',
      question: `Q${i}`,
      createdAt: at(`2026-11-09T10:${String(59 - i).padStart(2, '0')}:00Z`),
      locale: 'fr',
      tenant: i === 0 ? { name: 'Agence Alpha' } : null
    }));
    mockData(rows);
    const { items } = await listHelpFeedbackSummary({ days: 30 });
    const item = items.find(i => i.helpId === 'b.questions')!;
    expect(item.questions).toHaveLength(20);
    expect(item.questions[0]).toEqual({
      text: 'Q0',
      createdAt: '2026-11-09T10:59:00.000Z',
      locale: 'fr',
      tenantName: 'Agence Alpha'
    });
    expect(item.questions[1].tenantName).toBeNull();
    expect(item.questionsCount).toBe(6);
    // Plateforme : aucun filtre d'agence, le nom de l'agence est lu.
    expect(mockPrisma.helpFeedback.findMany.mock.calls[0][0].where).not.toHaveProperty('tenantId');
    expect(mockPrisma.helpFeedback.findMany.mock.calls[0][0].select.tenant).toEqual({ select: { name: true } });
  });

  it('côté agence : filtre STRICT sur tenantId partout, nom d’agence jamais lu ni renvoyé', async () => {
    mockData([
      {
        helpId: 'b.questions',
        question: 'Pourquoi ?',
        createdAt: at('2026-11-09T10:00:00Z'),
        locale: 'en',
        tenant: { name: 'Fuite' }
      }
    ]);
    const { items } = await listHelpFeedbackSummary({ days: 7, tenantId: TENANT_A });
    for (const call of mockPrisma.helpFeedback.groupBy.mock.calls) expect(call[0].where.tenantId).toBe(TENANT_A);
    const find = mockPrisma.helpFeedback.findMany.mock.calls[0][0];
    expect(find.where.tenantId).toBe(TENANT_A);
    expect(find.select).not.toHaveProperty('tenant');
    expect(items.find(i => i.helpId === 'b.questions')!.questions[0].tenantName).toBeNull();
  });

  it('borne la fenêtre à `days` jours et ne renvoie ni userId, ni email, ni passwordHash', async () => {
    mockData([
      { helpId: 'b.questions', question: 'Q', createdAt: at('2026-11-09T10:00:00Z'), locale: 'fr', tenant: null }
    ]);
    const before = Date.now();
    const result = await listHelpFeedbackSummary({ days: 7 });
    const since: Date = mockPrisma.helpFeedback.groupBy.mock.calls[0][0].where.createdAt.gte;
    expect(before - since.getTime()).toBeGreaterThanOrEqual(7 * 24 * 3600 * 1000 - 5);
    expect(before - since.getTime()).toBeLessThan(7 * 24 * 3600 * 1000 + 60_000);
    const json = JSON.stringify(result);
    expect(json).not.toMatch(/userId|email|passwordHash/);
    expect(mockPrisma.helpFeedback.findMany.mock.calls[0][0].select).not.toHaveProperty('user');
  });
});

describe('controleur', () => {
  function run(handler: (req: Request, res: Response, next: NextFunction) => unknown, req: Partial<Request>) {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() } as unknown as Response;
    const next = jest.fn();
    const full = { headers: {}, query: {}, body: {}, ...req } as Request;
    return Promise.resolve(handler(full, res, next)).then(() => ({ res, next }));
  }

  it('POST : 201 { id } exactement, agence verifiee cote serveur', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue({ id: 'm1' });
    mockPrisma.helpFeedback.create.mockResolvedValue({ id: 'f1' });
    const { res, next } = await run(createHelpFeedbackHandler, {
      user: { userId: 'u1' } as any,
      body: { helpId: 'a.b', useful: true, locale: 'fr', path: `/tenant/${TENANT_A}/x` }
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 'f1' });
    expect(mockPrisma.helpFeedback.create.mock.calls[0][0].data.tenantId).toBe(TENANT_A);
  });

  it('POST : l en-tete portail est lu, et une agence non verifiee donne un avis hors agence', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue(null);
    mockPrisma.tenantClient.findFirst.mockResolvedValue(null);
    mockPrisma.helpFeedback.create.mockResolvedValue({ id: 'f1' });
    const { res } = await run(createHelpFeedbackHandler, {
      user: { userId: 'u1' } as any,
      headers: { 'x-portal-tenant-id': TENANT_B },
      body: { helpId: 'a.b', useful: true, locale: 'fr' }
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockPrisma.tenantClient.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u1', tenantId: TENANT_B },
      select: { id: true }
    });
    expect(mockPrisma.helpFeedback.create.mock.calls[0][0].data.tenantId).toBeNull();
  });

  it('POST : 401 sans utilisateur', async () => {
    const { next, res } = await run(createHelpFeedbackHandler, { body: { helpId: 'a.b', useful: true, locale: 'fr' } });
    expect(res.status).not.toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
    expect(mockPrisma.helpFeedback.create).not.toHaveBeenCalled();
  });

  it('POST : corps invalide -> ZodError remonte a errorHandler (400), rien d ecrit', async () => {
    const { next } = await run(createHelpFeedbackHandler, {
      user: { userId: 'u1' } as any,
      body: { helpId: 'Mauvais', locale: 'fr' }
    });
    expect(next.mock.calls[0][0]).toBeInstanceOf(ZodError);
    expect(mockPrisma.helpFeedback.create).not.toHaveBeenCalled();
  });

  it('GET agence : tenantId du contexte, jamais de la query ; reponse { items } nue', async () => {
    mockPrisma.helpFeedback.groupBy.mockResolvedValue([]);
    mockPrisma.helpFeedback.findMany.mockResolvedValue([]);
    const { res } = await run(listTenantHelpFeedbackHandler, {
      tenantContext: { tenantId: TENANT_A } as any,
      query: { days: '7', tenantId: TENANT_B } as any
    });
    expect(res.json).toHaveBeenCalledWith({ items: [] });
    for (const call of mockPrisma.helpFeedback.groupBy.mock.calls) {
      expect(call[0].where.tenantId).toBe(TENANT_A);
    }
  });

  it('GET agence : 400 sans contexte d agence', async () => {
    const { next } = await run(listTenantHelpFeedbackHandler, { query: {} });
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(mockPrisma.helpFeedback.groupBy).not.toHaveBeenCalled();
  });

  it('GET : days hors bornes -> ZodError (400)', async () => {
    const { next } = await run(listPlatformHelpFeedbackHandler, { query: { days: '999' } as any });
    expect(next.mock.calls[0][0]).toBeInstanceOf(ZodError);
  });

  it('GET plateforme : lit tous les avis, sans filtre d agence', async () => {
    mockPrisma.helpFeedback.groupBy.mockResolvedValue([]);
    mockPrisma.helpFeedback.findMany.mockResolvedValue([]);
    const { res } = await run(listPlatformHelpFeedbackHandler, { query: {} });
    expect(res.json).toHaveBeenCalledWith({ items: [] });
    expect(mockPrisma.helpFeedback.groupBy.mock.calls[0][0].where).not.toHaveProperty('tenantId');
  });
});
