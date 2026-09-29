/**
 * Verrous d'ImmoCopilot : plafond de processus des sections exclusives (le
 * pool de connexions ne doit pas pouvoir être épuisé), sans fuite de file ni
 * deadlock avec le mutex par clé. Prisma est simulé : aucune base requise.
 */
const executeRaw = jest.fn().mockResolvedValue(1);
const transaction = jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({ $executeRaw: executeRaw }));

jest.mock('../../src/utils/database', () => ({ prisma: { $transaction: (cb: any) => transaction(cb) } }));

import {
  MAX_CONCURRENT_EXCLUSIVE_SECTIONS,
  Semaphore,
  exclusiveSectionStats,
  withExclusiveSection
} from '../../src/lib/ai/advisory-lock';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));

describe('withExclusiveSection', () => {
  beforeEach(() => jest.clearAllMocks());

  it('a un plafond par défaut de 2', () => {
    expect(MAX_CONCURRENT_EXCLUSIVE_SECTIONS).toBe(2);
  });

  it('ne dépasse jamais le plafond avec des clés différentes, et les exécute toutes', async () => {
    let current = 0;
    let peak = 0;
    let done = 0;
    const gates: Array<() => void> = [];
    const section = async () => {
      current += 1;
      peak = Math.max(peak, current);
      await new Promise<void>(resolve => gates.push(resolve));
      current -= 1;
      done += 1;
    };
    const all = Array.from({ length: 8 }, (_, i) => withExclusiveSection(`ai-receipt:t:p${i}`, section));
    await tick();
    expect(current).toBe(MAX_CONCURRENT_EXCLUSIVE_SECTIONS);
    expect(exclusiveSectionStats().queued).toBe(8 - MAX_CONCURRENT_EXCLUSIVE_SECTIONS);
    while (done < 8) {
      gates.splice(0).forEach(open => open());
      await tick();
    }
    await Promise.all(all);
    expect(peak).toBe(MAX_CONCURRENT_EXCLUSIVE_SECTIONS);
    expect(transaction).toHaveBeenCalledTimes(8);
  });

  it('utilise un verrou 64 bits (hashtextextended)', async () => {
    await withExclusiveSection('k', async () => undefined);
    const sql = (executeRaw.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(sql).toContain('hashtextextended(');
    expect(sql).not.toMatch(/hashtext\(/);
  });

  it('ne fuit pas : file, jetons et clés sont vides après coup, même sur erreur', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        withExclusiveSection(`k${i % 3}`, async () => {
          if (i % 2) throw new Error('boom');
          return i;
        })
      )
    );
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(3);
    expect(exclusiveSectionStats()).toEqual({ running: 0, queued: 0, lockKeys: 0 });
  });

  it('ne se bloque pas : une même clé saturée ne retient aucun jeton pendant l attente du mutex', async () => {
    const order: string[] = [];
    let releaseA: () => void = () => undefined;
    const a = withExclusiveSection('same', () =>
      new Promise<void>(r => (releaseA = r)).then(() => void order.push('a'))
    );
    const b = withExclusiveSection('same', async () => void order.push('b'));
    const c = withExclusiveSection('other1', async () => void order.push('c'));
    const d = withExclusiveSection('other2', async () => void order.push('d'));
    await tick();
    // b attend le mutex de « same » sans occuper de jeton : c et d passent.
    expect(order).toEqual(expect.arrayContaining(['c', 'd']));
    expect(order).not.toContain('b');
    releaseA();
    await Promise.all([a, b, c, d]);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(exclusiveSectionStats()).toEqual({ running: 0, queued: 0, lockKeys: 0 });
  });
});

describe('Semaphore', () => {
  it('libère le jeton quand la fonction lève', async () => {
    const sem = new Semaphore(1);
    await expect(sem.run(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    expect(sem.running).toBe(0);
    await expect(sem.run(async () => 'ok')).resolves.toBe('ok');
  });
});
