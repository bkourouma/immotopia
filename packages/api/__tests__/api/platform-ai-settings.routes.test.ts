/**
 * Routes `/api/platform/ai-settings` : réservées au super-admin plateforme,
 * validation stricte du corps, aucune clé dans les réponses.
 */
import express from 'express';
import request from 'supertest';

const mockEnv: Record<string, unknown> = {
  AI_PROVIDER: 'disabled',
  AI_MODEL: 'claude-opus-5-5',
  AI_EFFORT: 'low',
  AI_REFUSAL_FALLBACK: 'on',
  AI_REQUEST_TIMEOUT_MS: 60000,
  OPENROUTER_API_KEY: 'sk-or-SUPER-SECRET-VALUE',
  ANTHROPIC_API_KEY: 'sk-ant-SUPER-SECRET-VALUE',
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1'
};
jest.mock('../../src/config/env', () => ({ env: mockEnv, isProduction: false, fakeProviderAllowed: () => true }));

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, res: any, next: any) => {
    if (req.header('x-anon')) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }
    req.user = { userId: req.header('x-user') || 'user-1', email: 'u@example.com' };
    next();
  }
}));

// La permission PLATFORM_* est accordée : c'est `requireSuperAdmin` (rôle relu en base) qui départage.
jest.mock('../../src/services/permission-service', () => ({
  hasPermission: async () => true,
  getUserPermissions: jest.fn(),
  hasAnyPermission: jest.fn(),
  hasAllPermissions: jest.fn()
}));

const mockPrisma: any = {
  user: { findUnique: jest.fn() },
  assistantResponseFeedback: { findMany: jest.fn() },
  platformAiSettings: { findUnique: jest.fn(), upsert: jest.fn() },
  $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma))
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
const mockRecordAudit = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn(),
  recordAuditEvent: (...a: unknown[]) => mockRecordAudit(...a)
}));

import { errorHandler } from '../../src/middleware/error-middleware';
import platformAiSettingsRoutes from '../../src/routes/platform-ai-settings-routes';
import { resetAiSettingsCaches } from '../../src/services/ai-settings-service';

const app = express();
app.use(express.json());
app.use('/api/platform/ai-settings', platformAiSettingsRoutes);
app.use(errorHandler);

const body = { provider: 'openrouter', model: 'openai/gpt-5', effort: 'high', refusalFallback: false };

function asRole(globalRole: string, isActive = true) {
  mockPrisma.user.findUnique.mockResolvedValue({ globalRole, isActive });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetAiSettingsCaches();
  mockPrisma.platformAiSettings.findUnique.mockResolvedValue(null);
  mockPrisma.platformAiSettings.upsert.mockResolvedValue({});
});

describe("contrôle d'accès", () => {
  it.each([
    ['get', '/api/platform/ai-settings'],
    ['put', '/api/platform/ai-settings'],
    ['get', '/api/platform/ai-settings/models'],
    ['post', '/api/platform/ai-settings/connection-test'],
    ['get', '/api/platform/ai-settings/feedback'],
    ['get', '/api/platform/ai-settings/usage'],
    ['get', '/api/platform/ai-settings/usage/export']
  ])('%s %s : 403 pour un non super-admin ou un compte inactif, 401 sans session', async (method, path) => {
    const call = (extra?: Record<string, string>) => {
      let req = (request(app) as any)[method](path);
      for (const [k, v] of Object.entries(extra ?? {})) req = req.set(k, v);
      return method === 'put' ? req.send(body) : req.send();
    };

    asRole('USER');
    expect((await call()).status).toBe(403);
    expect(mockPrisma.platformAiSettings.upsert).not.toHaveBeenCalled();

    asRole('SUPER_ADMIN', false);
    expect((await call()).status).toBe(403);

    expect((await call({ 'x-anon': '1' })).status).toBe(401);
  });
});

describe('super-admin', () => {
  beforeEach(() => asRole('SUPER_ADMIN'));

  it('liste les avis filtrés avec des extraits bornés et sans identité du compte', async () => {
    const updatedAt = new Date('2026-11-14T10:00:00Z');
    mockPrisma.assistantResponseFeedback.findMany.mockResolvedValue(
      Array.from({ length: 26 }, () => ({
        helpful: false,
        comment: 'À préciser',
        excerpt: 'a'.repeat(350),
        updatedAt,
        turn: { conversation: { tenant: { name: 'Agence A' } } }
      }))
    );
    const response = await request(app).get('/api/platform/ai-settings/feedback?rating=unhelpful&offset=25');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(mockPrisma.assistantResponseFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { helpful: false },
        skip: 25,
        take: 26
      })
    );
    expect(response.body.data.items).toHaveLength(25);
    expect(response.body.data.hasNext).toBe(true);
    expect(response.body.data.items[0]).toEqual({
      id: 25,
      helpful: false,
      agency: 'Agence A',
      comment: 'À préciser',
      excerpt: 'a'.repeat(300),
      updatedAt: updatedAt.toISOString()
    });
  });

  it('GET : réglage, disponibilité et présence des clés, sans aucun secret', async () => {
    const res = await request(app).get('/api/platform/ai-settings');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      provider: 'disabled',
      source: 'environment',
      keys: { openrouter: true, anthropic: true },
      updatedByName: null
    });
    expect(res.body.data.providers).toHaveLength(4);
    expect(res.text).not.toContain('SUPER-SECRET');
    expect(res.text).not.toContain('sk-');
  });

  it('PUT : enregistre et répond avec la même forme, sans secret', async () => {
    mockPrisma.platformAiSettings.findUnique.mockResolvedValue({
      id: 'default',
      ...body,
      updatedById: 'user-1',
      updatedAt: new Date('2026-09-29T10:00:00Z'),
      updatedBy: { fullName: 'Awa Diallo', email: 'a@x.ci' }
    });
    const res = await request(app).put('/api/platform/ai-settings').send(body);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ...body, source: 'database', updatedByName: 'Awa Diallo' });
    expect(mockPrisma.platformAiSettings.upsert).toHaveBeenCalledTimes(1);
    expect(mockRecordAudit).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({ actionKey: 'AI_SETTINGS_UPDATED' })
    );
    expect(res.text).not.toContain('SUPER-SECRET');
  });

  it('PUT : corps strict (champ inconnu, 400) et règles métier (clé absente, 422)', async () => {
    const unknown = await request(app)
      .put('/api/platform/ai-settings')
      .send({ ...body, apiKey: 'sk-x' });
    expect(unknown.status).toBe(400);
    const invalidFastModel = await request(app)
      .put('/api/platform/ai-settings')
      .send({ ...body, modelsByMode: { fast: 'modele-sans-fournisseur' } });
    expect(invalidFastModel.status).toBe(422);

    const saved = mockEnv.OPENROUTER_API_KEY;
    delete mockEnv.OPENROUTER_API_KEY;
    try {
      const noKey = await request(app).put('/api/platform/ai-settings').send(body);
      expect(noKey.status).toBe(422);
      expect(mockPrisma.platformAiSettings.upsert).not.toHaveBeenCalled();
    } finally {
      mockEnv.OPENROUTER_API_KEY = saved;
    }
  });

  it('teste la connexion du mode demandé avec le modèle enregistré et sans outils', async () => {
    mockPrisma.platformAiSettings.findUnique.mockResolvedValue({
      id: 'default',
      ...body,
      modelsByMode: { deep: 'provider/deep', fast: 'provider/fast' },
      updatedAt: new Date()
    });
    const responseBody =
      'data: {"model":"provider/fast","choices":[{"delta":{"content":"Texte fournisseur"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => new Response(responseBody));
    try {
      const response = await request(app).post('/api/platform/ai-settings/connection-test').send({ mode: 'fast' });
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ model: 'provider/fast', provider: 'openrouter', simulated: false });
      expect(response.text).not.toContain('Texte fournisseur');
      expect(response.text).not.toContain('SUPER-SECRET');
      const outbound = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
      expect(outbound).toMatchObject({ model: 'provider/fast', max_tokens: 32 });
      expect(outbound).not.toHaveProperty('tools');
      expect(
        (await request(app).post('/api/platform/ai-settings/connection-test').send({ mode: 'unknown' })).status
      ).toBe(400);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('GET /models : ne lève jamais, unavailable quand le catalogue est injoignable', async () => {
    const spy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('réseau'));
    try {
      const res = await request(app).get('/api/platform/ai-settings/models');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ models: [], unavailable: true });
    } finally {
      spy.mockRestore();
    }
  });
});
