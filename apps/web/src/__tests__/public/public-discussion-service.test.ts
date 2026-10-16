import { describe, it, expect, vi, beforeEach } from 'vitest';

const post = vi.hoisted(() => vi.fn());

vi.mock('../../utils/api-client', () => ({ default: { post } }));

import { fetchPublicDiscussion, sendPublicDiscussionMessage } from '../../services/public-meeting-live-service';

const TOKEN = 'tok-abcdefghijklmnopqrstuvwxyz0123456789';
const MESSAGE = {
  id: 'd1',
  authorKind: 'COOWNER',
  authorIdentity: 'p-c1',
  authorName: 'Awa Traoré',
  body: 'Bonjour',
  hidden: false,
  createdAt: '2026-10-20T10:00:00.000Z'
};

beforeEach(() => {
  post.mockReset();
});

describe('service public de la discussion', () => {
  it('lit l’historique : jeton dans le corps, sans session ni redirection', async () => {
    const data = { open: true, muted: false, canWrite: true, maxLength: 500, messages: [MESSAGE] };
    post.mockResolvedValue({ status: 200, data: { success: true, data } });
    const result = await fetchPublicDiscussion(TOKEN);
    expect(result).toEqual({ status: 'ok', data });
    const [url, body, config] = post.mock.calls[0];
    expect(url).toBe('/public/assemblees/discussion');
    expect(body).toEqual({ token: TOKEN });
    expect(url).not.toContain(TOKEN);
    expect(config.withCredentials).toBe(false);
    expect(config.validateStatus()).toBe(true);
  });

  it('envoie le texte avec le jeton dans le corps', async () => {
    post.mockResolvedValue({ status: 200, data: { success: true, data: MESSAGE } });
    const result = await sendPublicDiscussionMessage(TOKEN, 'Bonjour');
    expect(result).toEqual({ status: 'ok', data: MESSAGE });
    expect(post.mock.calls[0][0]).toBe('/public/assemblees/discussion/envoyer');
    expect(post.mock.calls[0][1]).toEqual({ token: TOKEN, body: 'Bonjour' });
  });

  it.each([
    [
      409,
      { message: 'La discussion est fermée par le gestionnaire' },
      { status: 'conflict', message: 'La discussion est fermée par le gestionnaire' }
    ],
    [409, {}, { status: 'conflict' }],
    [429, {}, { status: 'rate_limited' }],
    [400, { message: 'Texte trop long' }, { status: 'rejected', message: 'Texte trop long' }],
    [400, {}, { status: 'rejected' }],
    [404, {}, { status: 'invalid' }],
    [503, {}, { status: 'unavailable' }]
  ])('statut HTTP %i : %j', async (status, data, expected) => {
    post.mockResolvedValue({ status, data });
    expect(await sendPublicDiscussionMessage(TOKEN, 'x')).toEqual(expected);
  });

  it('une panne réseau vaut « unavailable »', async () => {
    post.mockRejectedValue(new Error('réseau'));
    expect(await fetchPublicDiscussion(TOKEN)).toEqual({ status: 'unavailable' });
  });
});
