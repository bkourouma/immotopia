jest.mock('../../src/config/env', () => ({
  env: {
    AI_PROVIDER: 'openrouter',
    OPENROUTER_API_KEY: 'sk-or-test-key',
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    FRONTEND_URL: 'http://localhost:3000',
    AI_MODEL: 'anthropic/claude-sonnet-4.5',
    AI_REQUEST_TIMEOUT_MS: 60000
  },
  isProduction: false
}));

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { env } from '../../src/config/env';
import { LlmProviderError, isAbortError } from '../../src/lib/ai/providers/anthropic-provider';
import { OpenRouterProvider, toOpenAiMessages } from '../../src/lib/ai/providers/openrouter-provider';
import type { LlmMessage, LlmToolSpec } from '../../src/lib/ai/contracts';

const mutableEnv = env as unknown as Record<string, unknown>;

// Configuration effective injectée (le service lirait sinon la base) : reflète l'env simulé.
const getConfig = async () => ({ model: env.AI_MODEL, effort: 'low' as const, refusalFallback: true });

const tools: LlmToolSpec[] = [
  { name: 'search_properties', description: 'Cherche des biens', inputSchema: { type: 'object', properties: {} } }
];
const messages: LlmMessage[] = [{ role: 'user', content: [{ type: 'text', text: 'Bonjour' }] }];
const req = { system: 'SYS', messages, tools, maxOutputTokens: 16000 };

/** Réponse SSE ; chaque élément de `chunks` est envoyé tel quel (permet de couper au milieu d'une ligne). */
function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }
  });
  return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } });
}

const data = (obj: unknown) => 'data: ' + JSON.stringify(obj) + '\n\n';
const choice = (delta: unknown, finish_reason: string | null = null) => data({ choices: [{ delta, finish_reason }] });

function run(
  fetchMock: jest.Mock,
  signal: AbortSignal = new AbortController().signal,
  onDelta: (d: string) => void = () => undefined
) {
  return new OpenRouterProvider({ fetch: fetchMock, getConfig }).runTurn(req, onDelta, signal);
}

describe('OpenRouterProvider', () => {
  beforeEach(() => {
    mutableEnv.OPENROUTER_API_KEY = 'sk-or-test-key';
    mutableEnv.AI_REQUEST_TIMEOUT_MS = 60000;
  });

  it('envoie la requête OpenAI-compatible avec les en-têtes OpenRouter', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        sseResponse([choice({ content: 'Bon' }), choice({ content: 'jour' }), choice({}, 'stop'), 'data: [DONE]\n\n'])
      );
    const deltas: string[] = [];
    const result = await run(fetchMock, undefined, d => deltas.push(d));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer sk-or-test-key',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'ImmoTopia'
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({
      model: 'anthropic/claude-sonnet-4.5',
      max_tokens: 16000,
      stream: true,
      messages: [
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'Bonjour' }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'search_properties',
            description: 'Cherche des biens',
            parameters: { type: 'object', properties: {} }
          }
        }
      ],
      tool_choice: 'auto'
    });
    expect(deltas).toEqual(['Bon', 'jour']);
    expect(result).toEqual({
      stopReason: 'end_turn',
      assistantContent: [{ type: 'text', text: 'Bonjour' }],
      toolCalls: []
    });
  });

  it('traduit assistant/tool_use et tool_result, ignore les blocs opaques', () => {
    const out = toOpenAiMessages('SYS', [
      ...messages,
      {
        role: 'assistant',
        content: [
          { type: 'opaque', raw: { type: 'thinking' } },
          { type: 'text', text: 'Je cherche' },
          { type: 'tool_use', id: 'tu_0', name: 'search_leases', input: { a: 1 } }
        ]
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', toolUseId: 'tu_0', content: '{"ok":true}', isError: true },
          { type: 'text', text: 'Merci' }
        ]
      }
    ]);
    expect(out).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'Bonjour' },
      {
        role: 'assistant',
        content: 'Je cherche',
        tool_calls: [{ id: 'tu_0', type: 'function', function: { name: 'search_leases', arguments: '{"a":1}' } }]
      },
      { role: 'tool', tool_call_id: 'tu_0', content: '{"ok":true}' },
      { role: 'user', content: 'Merci' }
    ]);
  });

  it('met content à null pour un tour assistant sans texte', () => {
    const out = toOpenAiMessages('S', [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'x', name: 'search_leases', input: undefined }] }
    ]);
    expect(out[1]).toEqual({
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'x', type: 'function', function: { name: 'search_leases', arguments: '{}' } }]
    });
  });

  it("assemble les appels d'outils fragmentés, lignes coupées et commentaires SSE compris", async () => {
    const stream = [
      ': OPENROUTER PROCESSING\n\n',
      choice({ content: 'Un instant' }),
      choice({ tool_calls: [{ index: 0, id: 'call_a', function: { name: 'search_properties', arguments: '' } }] }),
      choice({ tool_calls: [{ index: 0, function: { arguments: '{"query":' } }] }),
      // ligne « data: » coupée en deux morceaux réseau, fin de ligne CRLF
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":" \\"Coco',
      'dy\\"}"}}]},"finish_reason":null}]}\r\n\r\n',
      choice({ tool_calls: [{ index: 1, id: 'call_b', function: { name: 'search_leases', arguments: '{}' } }] }),
      choice({}, 'tool_calls'),
      'data: [DONE]\n\n'
    ];
    const result = await run(jest.fn().mockResolvedValue(sseResponse(stream)));

    expect(result.stopReason).toBe('tool_use');
    expect(result.toolCalls).toEqual([
      { id: 'call_a', name: 'search_properties', input: { query: 'Cocody' } },
      { id: 'call_b', name: 'search_leases', input: {} }
    ]);
    expect(result.assistantContent).toEqual([
      { type: 'text', text: 'Un instant' },
      { type: 'tool_use', id: 'call_a', name: 'search_properties', input: { query: 'Cocody' } },
      { type: 'tool_use', id: 'call_b', name: 'search_leases', input: {} }
    ]);
  });

  it("donne une entrée vide à un JSON d'arguments invalide, sans planter", async () => {
    const result = await run(
      jest.fn().mockResolvedValue(
        sseResponse([
          choice({
            tool_calls: [{ index: 0, id: 'c1', function: { name: 'search_properties', arguments: '{"a":' } }]
          }),
          choice({}, 'stop')
        ])
      )
    );
    expect(result.toolCalls).toEqual([{ id: 'c1', name: 'search_properties', input: {} }]);
    // `stop` avec appels d'outils : le tour est quand même traité comme un appel d'outil.
    expect(result.stopReason).toBe('tool_use');
  });

  it.each([
    ['stop', 'end_turn'],
    ['tool_calls', 'tool_use'],
    ['length', 'max_tokens'],
    ['content_filter', 'refusal'],
    ['error', 'other']
  ])('remonte finish_reason %s en %s', async (finish, expected) => {
    const result = await run(jest.fn().mockResolvedValue(sseResponse([choice({ content: 'x' }, finish)])));
    expect(result.stopReason).toBe(expected);
  });

  it("lève une erreur d'abandon quand le signal est coupé", async () => {
    const fetchMock = jest.fn(() => new Promise<Response>(() => undefined));
    const controller = new AbortController();
    const promise = run(fetchMock as unknown as jest.Mock, controller.signal);
    controller.abort();
    const error = await promise.catch(e => e);
    expect(isAbortError(error)).toBe(true);
    expect(error).not.toBeInstanceOf(LlmProviderError);
  });

  it("n'appelle pas le réseau si le signal est déjà coupé", async () => {
    const fetchMock = jest.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(run(fetchMock, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lève PROVIDER_UNAVAILABLE retryable au dépassement du délai', async () => {
    jest.useFakeTimers();
    try {
      mutableEnv.AI_REQUEST_TIMEOUT_MS = 5000;
      const fetchMock = jest.fn(() => new Promise<Response>(() => undefined));
      const promise = run(fetchMock as unknown as jest.Mock);
      const assertion = expect(promise).rejects.toMatchObject({
        code: 'PROVIDER_UNAVAILABLE',
        copilotCode: 'PROVIDER_UNAVAILABLE',
        statusCode: 503,
        retryable: true
      });
      await jest.advanceTimersByTimeAsync(5001);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });

  it('marque 429 et 5xx réessayables sans exposer le message amont', async () => {
    for (const status of [429, 502]) {
      const response = new Response('{"error":{"message":"secret upstream detail"}}', { status });
      const error = await run(jest.fn().mockResolvedValue(response)).catch(e => e);
      expect(error).toBeInstanceOf(LlmProviderError);
      expect(error.retryable).toBe(true);
      expect(error.upstreamStatus).toBe(status);
      expect(error.message).not.toContain('secret');
    }
  });

  it('ne réessaie pas une erreur 401', async () => {
    const error = await run(jest.fn().mockResolvedValue(new Response('{}', { status: 401 }))).catch(e => e);
    expect(error.retryable).toBe(false);
    expect(error.upstreamStatus).toBe(401);
  });

  it('traduit une erreur survenue en cours de flux', async () => {
    const response = sseResponse([choice({ content: 'x' }), data({ error: { code: 429, message: 'secret' } })]);
    const error = await run(jest.fn().mockResolvedValue(response)).catch(e => e);
    expect(error).toBeInstanceOf(LlmProviderError);
    expect(error.retryable).toBe(true);
    expect(error.message).not.toContain('secret');
  });

  it('traite une panne réseau comme réessayable', async () => {
    const error = await run(jest.fn().mockRejectedValue(new TypeError('fetch failed'))).catch(e => e);
    expect(error).toBeInstanceOf(LlmProviderError);
    expect(error.retryable).toBe(true);
    expect(error.upstreamStatus).toBeUndefined();
  });

  it('refuse de démarrer un tour sans clé et ne contacte pas OpenRouter', async () => {
    delete mutableEnv.OPENROUTER_API_KEY;
    const fetchMock = jest.fn();
    const error = await run(fetchMock).catch(e => e);
    expect(error).toBeInstanceOf(LlmProviderError);
    expect(error.retryable).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('config/env : AI_PROVIDER=openrouter', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  function load(overrides: Record<string, string | undefined>) {
    jest.resetModules();
    jest.unmock('../../src/config/env');
    // `dotenv/config` relirait le .env local et remplirait la clé supprimée ci-dessous.
    jest.doMock('dotenv/config', () => ({}));
    process.env = { ...saved, NODE_ENV: 'test', AI_PROVIDER: 'openrouter' } as NodeJS.ProcessEnv;
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('EXIT');
    }) as never);
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      let loaded: { env: { OPENROUTER_BASE_URL: string } } | undefined;
      let failure: unknown;
      jest.isolateModules(() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          loaded = require('../../src/config/env');
        } catch (e) {
          failure = e;
        }
      });
      return { loaded, failure, output: errors.mock.calls.flat().join('\n') };
    } finally {
      exit.mockRestore();
      errors.mockRestore();
    }
  }

  it('refuse de démarrer sans OPENROUTER_API_KEY', () => {
    const { failure, output } = load({ OPENROUTER_API_KEY: undefined, AI_MODEL: 'anthropic/claude-sonnet-4.5' });
    expect((failure as Error)?.message).toBe('EXIT');
    expect(output).toContain('OPENROUTER_API_KEY');
  });

  it("refuse un AI_MODEL qui n'est pas un identifiant OpenRouter", () => {
    const { failure, output } = load({ OPENROUTER_API_KEY: 'sk-or-x', AI_MODEL: undefined });
    expect((failure as Error)?.message).toBe('EXIT');
    expect(output).toContain('AI_MODEL');
  });

  it('démarre avec clé et modèle OpenRouter, URL de base par défaut', () => {
    const { loaded, failure } = load({ OPENROUTER_API_KEY: 'sk-or-x', AI_MODEL: 'anthropic/claude-sonnet-4.5' });
    expect(failure).toBeUndefined();
    expect(loaded?.env.OPENROUTER_BASE_URL).toBe('https://openrouter.ai/api/v1');
  });
});
