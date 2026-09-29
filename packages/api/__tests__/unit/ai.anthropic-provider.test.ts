const mockStream = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  const Anthropic = jest.fn().mockImplementation(() => ({ beta: { messages: { stream: mockStream } } }));
  return { __esModule: true, default: Anthropic };
});

jest.mock('../../src/config/env', () => ({
  env: {
    AI_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'sk-test-key',
    AI_MODEL: 'claude-opus-5-5',
    AI_EFFORT: 'low',
    AI_REQUEST_TIMEOUT_MS: 60000,
    AI_REFUSAL_FALLBACK: 'on'
  },
  isProduction: false
}));

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../src/config/env';
import { AnthropicProvider, LlmProviderError, isAbortError } from '../../src/lib/ai/providers/anthropic-provider';
import type { LlmMessage, LlmToolSpec } from '../../src/lib/ai/contracts';

const mutableEnv = env as unknown as Record<string, unknown>;

// Configuration effective injectée (le service lirait sinon la base) : reflète l'env simulé.
const getConfig = async () => ({
  model: env.AI_MODEL,
  effort: env.AI_EFFORT,
  refusalFallback: env.AI_REFUSAL_FALLBACK !== 'off'
});

const tools: LlmToolSpec[] = [
  { name: 'search_properties', description: 'Cherche des biens', inputSchema: { type: 'object', properties: {} } }
];
const messages: LlmMessage[] = [{ role: 'user', content: [{ type: 'text', text: 'Bonjour' }] }];
const req = { system: 'SYS', messages, tools, maxOutputTokens: 16000 };

function fakeStream(options: { deltas?: string[]; message?: unknown; error?: unknown; hang?: boolean }) {
  return {
    on: jest.fn((event: string, cb: (delta: string) => void) => {
      if (event === 'text') for (const delta of options.deltas ?? []) cb(delta);
    }),
    finalMessage: jest.fn(() => {
      if (options.hang) return new Promise(() => undefined);
      if (options.error) return Promise.reject(options.error);
      return Promise.resolve(options.message);
    })
  };
}

describe('AnthropicProvider', () => {
  beforeEach(() => {
    mockStream.mockReset();
    (Anthropic as unknown as jest.Mock).mockClear();
    mutableEnv.AI_REFUSAL_FALLBACK = 'on';
    mutableEnv.AI_REQUEST_TIMEOUT_MS = 60000;
  });

  it('envoie la forme exacte de la requête', async () => {
    mockStream.mockReturnValue(
      fakeStream({
        deltas: ['Bon', 'jour'],
        message: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Bonjour' }] }
      })
    );
    const deltas: string[] = [];
    const result = await new AnthropicProvider({ getConfig }).runTurn(
      req,
      d => deltas.push(d),
      new AbortController().signal
    );

    expect(Anthropic).toHaveBeenCalledWith({ apiKey: 'sk-test-key' });
    const [params, options] = mockStream.mock.calls[0];
    expect(params).toEqual({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      system: 'SYS',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Bonjour' }] }],
      tools: [
        {
          name: 'search_properties',
          description: 'Cherche des biens',
          input_schema: { type: 'object', properties: {} },
          eager_input_streaming: true
        }
      ],
      tool_choice: { type: 'auto' },
      output_config: { effort: 'low' },
      fallbacks: 'default',
      betas: ['server-side-fallback-2026-07-01']
    });
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('thinking');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(deltas).toEqual(['Bon', 'jour']);
    expect(result).toEqual({
      stopReason: 'end_turn',
      assistantContent: [{ type: 'text', text: 'Bonjour' }],
      toolCalls: []
    });
  });

  it('coupe le repli serveur avec AI_REFUSAL_FALLBACK=off', async () => {
    mutableEnv.AI_REFUSAL_FALLBACK = 'off';
    mockStream.mockReturnValue(fakeStream({ message: { stop_reason: 'end_turn', content: [] } }));
    await new AnthropicProvider({ getConfig }).runTurn(req, () => undefined, new AbortController().signal);
    const [params] = mockStream.mock.calls[0];
    expect(params).not.toHaveProperty('fallbacks');
    expect(params).not.toHaveProperty('betas');
  });

  it('traduit les blocs : tool_use, thinking opaque, tool_result renvoyés', async () => {
    const thinking = { type: 'thinking', thinking: '…', signature: 'sig' };
    mockStream.mockReturnValue(
      fakeStream({
        message: {
          stop_reason: 'tool_use',
          content: [thinking, { type: 'tool_use', id: 'tu_1', name: 'search_properties', input: { query: 'Cocody' } }]
        }
      })
    );
    const result = await new AnthropicProvider({ getConfig }).runTurn(
      {
        ...req,
        messages: [
          ...messages,
          {
            role: 'assistant',
            content: [
              { type: 'opaque', raw: thinking },
              { type: 'tool_use', id: 'tu_0', name: 'search_leases', input: { a: 1 } }
            ]
          },
          { role: 'user', content: [{ type: 'tool_result', toolUseId: 'tu_0', content: '{}', isError: true }] }
        ]
      },
      () => undefined,
      new AbortController().signal
    );

    expect(result.stopReason).toBe('tool_use');
    expect(result.assistantContent[0]).toEqual({ type: 'opaque', raw: thinking });
    expect(result.toolCalls).toEqual([{ id: 'tu_1', name: 'search_properties', input: { query: 'Cocody' } }]);
    const sent = mockStream.mock.calls[0][0].messages;
    expect(sent[1].content).toEqual([
      thinking,
      { type: 'tool_use', id: 'tu_0', name: 'search_leases', input: { a: 1 } }
    ]);
    expect(sent[2].content).toEqual([{ type: 'tool_result', tool_use_id: 'tu_0', content: '{}', is_error: true }]);
  });

  it.each([
    ['refusal', 'refusal'],
    ['max_tokens', 'max_tokens'],
    ['pause_turn', 'other']
  ])('remonte stop_reason %s en %s', async (stop, expected) => {
    mockStream.mockReturnValue(fakeStream({ message: { stop_reason: stop, content: [] } }));
    const result = await new AnthropicProvider({ getConfig }).runTurn(
      req,
      () => undefined,
      new AbortController().signal
    );
    expect(result.stopReason).toBe(expected);
  });

  it("lève une erreur d'abandon quand le signal est coupé", async () => {
    mockStream.mockReturnValue(fakeStream({ hang: true }));
    const controller = new AbortController();
    const promise = new AnthropicProvider({ getConfig }).runTurn(req, () => undefined, controller.signal);
    controller.abort();
    const error = await promise.catch(e => e);
    expect(isAbortError(error)).toBe(true);
    expect(error).not.toBeInstanceOf(LlmProviderError);
  });

  it("n'appelle pas le SDK si le signal est déjà coupé", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      new AnthropicProvider({ getConfig }).runTurn(req, () => undefined, controller.signal)
    ).rejects.toMatchObject({
      name: 'AbortError'
    });
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('lève PROVIDER_UNAVAILABLE retryable au dépassement du délai', async () => {
    jest.useFakeTimers();
    try {
      mutableEnv.AI_REQUEST_TIMEOUT_MS = 5000;
      mockStream.mockReturnValue(fakeStream({ hang: true }));
      const promise = new AnthropicProvider({ getConfig }).runTurn(req, () => undefined, new AbortController().signal);
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

  it('traduit une erreur du SDK en PROVIDER_UNAVAILABLE sans exposer son message', async () => {
    mockStream.mockReturnValue(
      fakeStream({ error: Object.assign(new Error('secret upstream detail'), { status: 401 }) })
    );
    const error = await new AnthropicProvider({ getConfig })
      .runTurn(req, () => undefined, new AbortController().signal)
      .catch(e => e);
    expect(error).toBeInstanceOf(LlmProviderError);
    expect(error.code).toBe('PROVIDER_UNAVAILABLE');
    expect(error.retryable).toBe(false);
    expect(error.upstreamStatus).toBe(401);
    expect(error.message).not.toContain('secret');
  });

  it('marque les erreurs 429 et 5xx comme réessayables', async () => {
    mockStream.mockReturnValue(fakeStream({ error: Object.assign(new Error('x'), { status: 529 }) }));
    const error = await new AnthropicProvider({ getConfig })
      .runTurn(req, () => undefined, new AbortController().signal)
      .catch(e => e);
    expect(error.retryable).toBe(true);
  });
});
