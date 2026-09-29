import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/api-client', () => ({
  default: { get: vi.fn(), post: vi.fn() }
}));
vi.mock('../../utils/event-stream', () => ({
  postEventStream: vi.fn()
}));

import apiClient from '../../utils/api-client';
import { postEventStream } from '../../utils/event-stream';
import copilotService from '../../services/copilot-service';

const mockedGet = vi.mocked(apiClient.get);
const mockedPost = vi.mocked(apiClient.post);
const mockedStream = vi.mocked(postEventStream);

beforeEach(() => vi.clearAllMocks());

describe('getStatus', () => {
  it("renvoie l'état du serveur", async () => {
    mockedGet.mockResolvedValue({
      data: {
        success: true,
        data: {
          enabled: true,
          provider: 'fake',
          tools: ['search_properties'],
          limits: { maxMessages: 20, maxMessageChars: 4000 }
        }
      }
    });
    const s = await copilotService.getStatus('t1');
    expect(mockedGet).toHaveBeenCalledWith('/tenants/t1/ai/status');
    expect(s.enabled).toBe(true);
    expect(s.tools).toEqual(['search_properties']);
  });

  it.each([
    ['erreur réseau', () => mockedGet.mockRejectedValue(new Error('boom'))],
    ['403', () => mockedGet.mockRejectedValue({ response: { status: 403 } })],
    ['corps inattendu', () => mockedGet.mockResolvedValue({ data: 'oops' })]
  ])('%s -> enabled:false', async (_n, arrange) => {
    arrange();
    expect((await copilotService.getStatus('t1')).enabled).toBe(false);
  });
});

describe('streamChat', () => {
  it('type les événements, ignore inconnus et JSON illisible', async () => {
    mockedStream.mockImplementation(async (_p, _b, opts) => {
      opts.onEvent({ event: 'text_delta', data: '{"text":"a"}' });
      opts.onEvent({ event: 'inconnu', data: '{}' });
      opts.onEvent({ event: 'text_delta', data: 'pas du json' });
      opts.onEvent({ event: 'done', data: '{"reason":"end_turn"}' });
    });
    const events: unknown[] = [];
    const req = { messages: [{ role: 'user' as const, content: 'x' }] };
    await copilotService.streamChat('t1', req, { onEvent: e => events.push(e) });
    expect(mockedStream.mock.calls[0][0]).toBe('/tenants/t1/ai/chat');
    expect(mockedStream.mock.calls[0][1]).toBe(req);
    expect(events).toEqual([
      { type: 'text_delta', text: 'a' },
      { type: 'done', reason: 'end_turn' }
    ]);
  });
});

describe('executeProposal', () => {
  it('poste le jeton et déballe la réponse', async () => {
    const payload = { proposalId: 'p1', alreadyExisted: false, document: { id: 'd1' } };
    mockedPost.mockResolvedValue({ data: { success: true, data: payload } });
    await expect(copilotService.executeProposal('t1', 'tok')).resolves.toEqual(payload);
    expect(mockedPost).toHaveBeenCalledWith('/tenants/t1/ai/actions/execute', { proposalToken: 'tok' });
  });
});
