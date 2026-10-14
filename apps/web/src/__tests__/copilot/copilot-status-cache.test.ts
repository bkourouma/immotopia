import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COPILOT_STATUS_TTL_MS, resetCopilotStatusCache, sharedCopilotStatus } from '../../utils/copilot-status-cache';

beforeEach(() => resetCopilotStatusCache());

describe('sharedCopilotStatus', () => {
  it('partage une requête entre appels simultanés puis la réutilise', async () => {
    const fetcher = vi.fn().mockResolvedValue({ enabled: true });
    const [a, b, c] = await Promise.all([
      sharedCopilotStatus('t1', fetcher),
      sharedCopilotStatus('t1', fetcher),
      sharedCopilotStatus('t1', fetcher)
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
    await sharedCopilotStatus('t1', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('relance la requête une fois le délai écoulé', async () => {
    const fetcher = vi.fn().mockResolvedValue({ enabled: true });
    await sharedCopilotStatus('t1', fetcher);
    await sharedCopilotStatus('t1', fetcher, Date.now() + COPILOT_STATUS_TTL_MS + 1000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("n'utilise jamais l'état d'une autre agence et oublie l'agence quittée", async () => {
    const a = vi.fn().mockResolvedValue('A');
    const b = vi.fn().mockResolvedValue('B');
    expect(await sharedCopilotStatus('t1', a)).toBe('A');
    expect(await sharedCopilotStatus('t2', b)).toBe('B');
    expect(await sharedCopilotStatus('t1', a)).toBe('A');
    expect(a).toHaveBeenCalledTimes(2);
  });

  it("ne garde pas un échec : l'appel suivant réessaie", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');
    await expect(sharedCopilotStatus('t1', fetcher)).rejects.toThrow('boom');
    await expect(sharedCopilotStatus('t1', fetcher)).resolves.toBe('ok');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reset vide le cache', async () => {
    const fetcher = vi.fn().mockResolvedValue(1);
    await sharedCopilotStatus('t1', fetcher);
    resetCopilotStatusCache();
    await sharedCopilotStatus('t1', fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
