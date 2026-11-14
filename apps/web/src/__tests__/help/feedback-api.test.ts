import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import apiClient from '../../utils/api-client';
import { sendHelpFeedback } from '../../help/feedback-api';

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { post: vi.fn() }
}));

const post = (apiClient as unknown as { post: Mock }).post;

describe('sendHelpFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    post.mockResolvedValue({ data: { id: 'fb1' } });
  });

  it("poste sur /help/feedback et renvoie l'id", async () => {
    const res = await sendHelpFeedback({ helpId: 'locatif.a', useful: true, locale: 'fr' });
    expect(post).toHaveBeenCalledWith('/help/feedback', { helpId: 'locatif.a', useful: true, locale: 'fr' });
    expect(res).toEqual({ id: 'fb1' });
  });

  it('accepte une reponse enveloppee', async () => {
    post.mockResolvedValue({ data: { success: true, data: { id: 'fb2' } } });
    expect((await sendHelpFeedback({ helpId: 'locatif.a', locale: 'en' })).id).toBe('fb2');
  });

  it('rogne et tronque la question a 1000 caracteres', async () => {
    await sendHelpFeedback({ helpId: 'locatif.a', question: `  ${'q'.repeat(1500)}  `, locale: 'fr' });
    expect(post.mock.calls[0][1].question).toBe('q'.repeat(1000));
  });

  it("laisse remonter l'erreur", async () => {
    post.mockRejectedValue(new Error('500'));
    await expect(sendHelpFeedback({ helpId: 'locatif.a', locale: 'fr' })).rejects.toThrow('500');
  });
});
