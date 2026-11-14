import type { LlmProvider, LlmTurnResult } from '../../src/lib/ai/contracts';
import { fallbackConversationTitle, generateConversationTitle } from '../../src/lib/ai/conversation-title';

it('garde la première ligne utile et limite le repli sans couper un caractère Unicode', () => {
  expect(fallbackConversationTitle('\n ## [État du parc](https://example.test) ?')).toBe('État du parc');
  expect(fallbackConversationTitle('🏠'.repeat(80))).toBe('🏠'.repeat(60));
});

it('borne les deux extraits, sans outil, et nettoie un titre arabe', async () => {
  const runTurn = jest.fn<Promise<LlmTurnResult>, Parameters<LlmProvider['runTurn']>>().mockResolvedValue({
    stopReason: 'end_turn',
    assistantContent: [{ type: 'text', text: '« عنوان： متابعة الإيجارات والدفعات؟ »' }],
    toolCalls: []
  });
  const provider = { id: 'openrouter' as const, runTurn };
  await expect(
    generateConversationTitle(provider, 'س'.repeat(1700), 'ص'.repeat(1900), new AbortController().signal)
  ).resolves.toBe('متابعة الإيجارات والدفعات');
  const request = runTurn.mock.calls[0][0];
  expect(request).toMatchObject({
    tools: [],
    maxOutputTokens: 40,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: JSON.stringify({ question: 'س'.repeat(1500), response: 'ص'.repeat(1500) }) }]
      }
    ]
  });
});

it('ignore un appel d’outil et n’appelle pas un fournisseur après l’arrêt', async () => {
  const runTurn = jest.fn<Promise<LlmTurnResult>, Parameters<LlmProvider['runTurn']>>().mockResolvedValue({
    stopReason: 'tool_use',
    assistantContent: [],
    toolCalls: [{ id: 'unexpected', name: 'search_properties', input: {} }]
  });
  const provider = { id: 'openrouter' as const, runTurn };
  await expect(
    generateConversationTitle(provider, 'Question', 'Réponse', new AbortController().signal)
  ).resolves.toBeUndefined();
  await expect(
    generateConversationTitle(provider, 'Question', 'Réponse', AbortSignal.abort())
  ).resolves.toBeUndefined();
  expect(runTurn).toHaveBeenCalledTimes(1);
});

it('quitte la génération si le signal est interrompu alors que le fournisseur ne répond pas', async () => {
  const controller = new AbortController();
  const runTurn = jest
    .fn<Promise<LlmTurnResult>, Parameters<LlmProvider['runTurn']>>()
    .mockImplementation(() => new Promise(() => {}));
  const running = generateConversationTitle({ id: 'openrouter', runTurn }, 'Question', 'Réponse', controller.signal);
  controller.abort();
  await expect(running).resolves.toBeUndefined();
  expect(runTurn.mock.calls[0][2].aborted).toBe(true);
});
