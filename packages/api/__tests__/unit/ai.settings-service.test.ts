/**
 * Réglage ImmoCopilot de la plateforme : configuration effective (base ou
 * environnement), validations d'écriture, cache, audit sans secret, catalogue
 * OpenRouter et bascule de fournisseur à chaud dans `getLlmProvider`.
 */
const mockEnv: Record<string, unknown> = {};
let mockIsProd = false;
jest.mock('../../src/config/env', () => ({
  env: mockEnv,
  fakeProviderAllowed: () => !mockIsProd
}));

const mockPrisma: {
  platformAiSettings: { findUnique: jest.Mock; upsert: jest.Mock };
  $transaction: jest.Mock;
} = {
  platformAiSettings: { findUnique: jest.fn(), upsert: jest.fn() },
  // Le faux client de transaction est le faux Prisma lui-meme (verifie par identite).
  $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockPrisma))
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
const mockLogAudit = jest.fn();
const mockRecordAudit = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: unknown[]) => mockLogAudit(...a),
  recordAuditEvent: (...a: unknown[]) => mockRecordAudit(...a)
}));

import {
  aiSettingsInputSchema,
  getAiSettingsView,
  getEffectiveAiConfig,
  isProviderUsable,
  listOpenRouterModels,
  resetAiSettingsCaches,
  updateAiSettings
} from '../../src/services/ai-settings-service';
import { getLlmProvider, resetLlmProviderCache } from '../../src/lib/ai/providers';
import { ValidationError } from '../../src/middleware/error-middleware';

const SECRET = 'sk-or-SUPER-SECRET-VALUE';
const ANTHROPIC_SECRET = 'sk-ant-SUPER-SECRET-VALUE';

const validOpenRouter = {
  provider: 'openrouter' as const,
  model: 'anthropic/claude-sonnet-4.5',
  effort: 'medium' as const,
  refusalFallback: false
};

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'default',
    provider: 'openrouter',
    model: 'openai/gpt-5',
    effort: 'high',
    refusalFallback: false,
    updatedById: 'user-1',
    updatedAt: new Date('2026-09-29T10:00:00Z'),
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetAiSettingsCaches();
  resetLlmProviderCache();
  mockIsProd = false;
  for (const key of Object.keys(mockEnv)) delete mockEnv[key];
  Object.assign(mockEnv, {
    AI_PROVIDER: 'disabled',
    AI_MODEL: 'claude-opus-5-5',
    AI_EFFORT: 'low',
    AI_REFUSAL_FALLBACK: 'on',
    OPENROUTER_API_KEY: SECRET,
    ANTHROPIC_API_KEY: ANTHROPIC_SECRET,
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1'
  });
  mockPrisma.platformAiSettings.findUnique.mockResolvedValue(null);
  mockPrisma.platformAiSettings.upsert.mockResolvedValue({});
});

describe('getEffectiveAiConfig', () => {
  it("sans ligne en base : valeurs d'environnement, source environment", async () => {
    mockEnv.AI_PROVIDER = 'anthropic';
    mockEnv.AI_EFFORT = 'high';
    mockEnv.AI_REFUSAL_FALLBACK = 'off';
    const config = await getEffectiveAiConfig();
    expect(config).toMatchObject({
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      effort: 'high',
      refusalFallback: false,
      source: 'environment',
      updatedAt: null
    });
  });

  it("la ligne en base est prioritaire sur l'environnement", async () => {
    mockEnv.AI_PROVIDER = 'disabled';
    mockPrisma.platformAiSettings.findUnique.mockResolvedValue(dbRow());
    const config = await getEffectiveAiConfig();
    expect(config).toMatchObject({
      provider: 'openrouter',
      model: 'openai/gpt-5',
      effort: 'high',
      refusalFallback: false,
      source: 'database'
    });
  });

  it("retombe sur l'environnement quand la lecture échoue ou que la ligne est invalide", async () => {
    mockPrisma.platformAiSettings.findUnique.mockRejectedValueOnce(new Error('relation does not exist'));
    expect((await getEffectiveAiConfig()).source).toBe('environment');

    resetAiSettingsCaches();
    mockPrisma.platformAiSettings.findUnique.mockResolvedValueOnce(dbRow({ provider: 'inconnu' }));
    expect((await getEffectiveAiConfig()).source).toBe('environment');
  });

  it('met la configuration en cache 30 s, puis la relit', async () => {
    const realNow = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(realNow);
    try {
      await getEffectiveAiConfig();
      await getEffectiveAiConfig();
      expect(mockPrisma.platformAiSettings.findUnique).toHaveBeenCalledTimes(1);
      nowSpy.mockReturnValue(realNow + 31_000);
      await getEffectiveAiConfig();
      expect(mockPrisma.platformAiSettings.findUnique).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });
});

describe('updateAiSettings', () => {
  it('écrit la ligne, invalide le cache et journalise sans secret', async () => {
    expect((await getEffectiveAiConfig()).source).toBe('environment');
    mockPrisma.platformAiSettings.findUnique.mockResolvedValue(
      dbRow({ model: validOpenRouter.model, effort: 'medium', updatedBy: { fullName: 'Awa Diallo', email: 'a@x.ci' } })
    );

    const view = await updateAiSettings(validOpenRouter, 'user-1');

    expect(mockPrisma.platformAiSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'default' },
        create: expect.objectContaining({ id: 'default', ...validOpenRouter, updatedById: 'user-1' }),
        update: expect.objectContaining({ ...validOpenRouter, updatedById: 'user-1' })
      })
    );
    // Cache invalidé : la lecture suivante voit la base.
    expect(view.source).toBe('database');
    expect(view.updatedByName).toBe('Awa Diallo');
    // Action critique : evenement ecrit dans la transaction, jamais via la file asynchrone.
    expect(mockLogAudit).not.toHaveBeenCalled();
    expect(mockRecordAudit).toHaveBeenCalledTimes(1);
    expect(mockRecordAudit.mock.calls[0][0]).toBe(mockPrisma);
    const entry = mockRecordAudit.mock.calls[0][1];
    expect(entry).toMatchObject({ actorUserId: 'user-1', actionKey: 'AI_SETTINGS_UPDATED', entityId: 'default' });
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain(ANTHROPIC_SECRET);
  });

  it('openrouter exige la clé en environnement', async () => {
    delete mockEnv.OPENROUTER_API_KEY;
    await expect(updateAiSettings(validOpenRouter, 'u')).rejects.toBeInstanceOf(ValidationError);
    expect(mockPrisma.platformAiSettings.upsert).not.toHaveBeenCalled();
  });

  it('openrouter exige un identifiant de modèle contenant « / »', async () => {
    await expect(updateAiSettings({ ...validOpenRouter, model: 'claude-opus-5-5' }, 'u')).rejects.toMatchObject({
      errors: [expect.objectContaining({ field: 'model' })]
    });
  });

  it('anthropic exige ANTHROPIC_API_KEY', async () => {
    delete mockEnv.ANTHROPIC_API_KEY;
    await expect(
      updateAiSettings({ provider: 'anthropic', model: 'claude-opus-5-5', effort: 'low', refusalFallback: true }, 'u')
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuse fake en production, permet disabled sans clé', async () => {
    mockIsProd = true;
    await expect(
      updateAiSettings({ provider: 'fake', model: 'fake', effort: 'low', refusalFallback: true }, 'u')
    ).rejects.toBeInstanceOf(ValidationError);

    delete mockEnv.OPENROUTER_API_KEY;
    delete mockEnv.ANTHROPIC_API_KEY;
    await expect(
      updateAiSettings({ provider: 'disabled', model: 'x', effort: 'low', refusalFallback: true }, 'u')
    ).resolves.toBeDefined();
  });

  it('le schéma est strict (champ inconnu, effort ou fournisseur invalides)', () => {
    expect(aiSettingsInputSchema.safeParse({ ...validOpenRouter, apiKey: 'x' }).success).toBe(false);
    expect(aiSettingsInputSchema.safeParse({ ...validOpenRouter, effort: 'max' }).success).toBe(false);
    expect(aiSettingsInputSchema.safeParse({ ...validOpenRouter, provider: 'other' }).success).toBe(false);
    expect(aiSettingsInputSchema.safeParse({ ...validOpenRouter, model: '  ' }).success).toBe(false);
  });
});

describe('getAiSettingsView : aucun secret', () => {
  it('ne renvoie que des booléens de présence, jamais une clé', async () => {
    const view = await getAiSettingsView();
    expect(view.keys).toEqual({ openrouter: true, anthropic: true });
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain(ANTHROPIC_SECRET);
    expect(serialized).not.toContain('sk-');
  });

  it('marque indisponible un fournisseur sans clé et fake en production, avec une raison', async () => {
    delete mockEnv.OPENROUTER_API_KEY;
    mockIsProd = true;
    const view = await getAiSettingsView();
    const byId = Object.fromEntries(view.providers.map(p => [p.id, p]));
    expect(byId.disabled.available).toBe(true);
    expect(byId.openrouter).toMatchObject({ available: false, reason: expect.any(String) });
    expect(byId.fake).toMatchObject({ available: false, reason: expect.any(String) });
    expect(byId.anthropic.available).toBe(true);
    expect(view.keys.openrouter).toBe(false);
  });
});

describe('listOpenRouterModels', () => {
  const okResponse = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;

  it('réduit la réponse à { id, name, contextLength }, sans clé, et la met en cache 10 min', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      okResponse({
        data: [
          { id: 'openai/gpt-5', name: 'GPT-5', context_length: 400000, pricing: { prompt: '1' }, secret: 'x' },
          { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5' },
          { name: 'sans id' }
        ]
      })
    );
    const result = await listOpenRouterModels(fetchMock);
    expect(result.unavailable).toBe(false);
    expect(result.models).toEqual([
      { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', contextLength: null },
      { id: 'openai/gpt-5', name: 'GPT-5', contextLength: 400000 }
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/models');
    expect(JSON.stringify(init)).not.toContain(SECRET);
    expect(init.headers).toBeUndefined();

    await listOpenRouterModels(fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("en cas d'échec : liste vide et unavailable, sans lever ni mettre en cache", async () => {
    const failing = jest.fn().mockRejectedValue(new Error('réseau'));
    await expect(listOpenRouterModels(failing)).resolves.toEqual({ models: [], unavailable: true });

    const http500 = jest.fn().mockResolvedValue({ ok: false, status: 500 } as unknown as Response);
    await expect(listOpenRouterModels(http500)).resolves.toEqual({ models: [], unavailable: true });
    expect(http500).toHaveBeenCalledTimes(1);
  });
});

describe('getLlmProvider : configuration effective à chaud', () => {
  it('bascule de fournisseur sans redémarrage, null quand désactivé ou inutilisable', async () => {
    // Environnement : disabled.
    expect(await getLlmProvider()).toBeNull();

    // Un admin choisit openrouter : le cache de configuration est invalidé.
    mockPrisma.platformAiSettings.findUnique.mockResolvedValue(dbRow());
    resetAiSettingsCaches();
    const openrouter = await getLlmProvider();
    expect(openrouter?.id).toBe('openrouter');
    expect(await getLlmProvider()).toBe(openrouter); // même instance tant que rien ne change

    // Bascule vers anthropic.
    mockPrisma.platformAiSettings.findUnique.mockResolvedValue(
      dbRow({ provider: 'anthropic', model: 'claude-opus-5-5' })
    );
    resetAiSettingsCaches();
    expect((await getLlmProvider())?.id).toBe('anthropic');

    // Changement de modèle seul : nouvelle instance.
    mockPrisma.platformAiSettings.findUnique.mockResolvedValue(
      dbRow({ provider: 'openrouter', model: 'openai/gpt-5-mini' })
    );
    resetAiSettingsCaches();
    const next = await getLlmProvider();
    expect(next?.id).toBe('openrouter');
    expect(next).not.toBe(openrouter);

    // Clé retirée : pas de plantage, assistant désactivé.
    delete mockEnv.OPENROUTER_API_KEY;
    expect(await getLlmProvider()).toBeNull();

    // Retour à disabled.
    mockPrisma.platformAiSettings.findUnique.mockResolvedValue(dbRow({ provider: 'disabled' }));
    resetAiSettingsCaches();
    expect(await getLlmProvider()).toBeNull();
  });

  it("refuse fake en production à l'exécution, même si la base le désigne", async () => {
    mockPrisma.platformAiSettings.findUnique.mockResolvedValue(dbRow({ provider: 'fake', model: 'fake' }));
    expect((await getLlmProvider())?.id).toBe('fake');
    mockIsProd = true;
    expect(await getLlmProvider()).toBeNull();
    expect(isProviderUsable({ provider: 'fake', model: 'fake' })).toBe(false);
  });
});
