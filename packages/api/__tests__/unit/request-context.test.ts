import { getRequestContext, runWithRequestContext, setAuditActor } from '../../src/utils/request-context';
import { requestContextMiddleware } from '../../src/middleware/request-context-middleware';
import { registerShutdownHook, runShutdownHooks } from '../../src/utils/shutdown-hooks';

jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));

describe('setAuditActor', () => {
  it('fusionne les compléments successifs (authentification, puis agence)', () => {
    runWithRequestContext({ ip: null, userAgent: null }, () => {
      setAuditActor({ userId: 'u1', type: 'USER', label: 'a@b.c' });
      setAuditActor({ tenantId: 't1' });
      expect(getRequestContext()?.actor).toEqual({ userId: 'u1', type: 'USER', label: 'a@b.c', tenantId: 't1' });
    });
  });

  it('ne fait rien hors requête', () => {
    expect(() => setAuditActor({ userId: 'u1' })).not.toThrow();
    expect(getRequestContext()).toBeUndefined();
  });

  it('isole deux requêtes concurrentes', async () => {
    const seen: string[] = [];
    await Promise.all(
      ['u1', 'u2'].map(
        id =>
          new Promise<void>(resolve =>
            runWithRequestContext({ ip: null, userAgent: null }, async () => {
              setAuditActor({ userId: id });
              await new Promise(r => setTimeout(r, id === 'u1' ? 10 : 0));
              seen.push(`${id}:${getRequestContext()?.actor?.userId}`);
              resolve();
            })
          )
      )
    );
    expect(seen.sort()).toEqual(['u1:u1', 'u2:u2']);
  });
});

describe('requestContextMiddleware', () => {
  function run(headers: Record<string, string>) {
    const req: any = { ip: '1.1.1.1', get: (name: string) => headers[name], socket: {} };
    const res: any = { setHeader: jest.fn() };
    let requestId: string | undefined;
    requestContextMiddleware(req, res, () => {
      requestId = getRequestContext()?.requestId;
    });
    return { requestId, res };
  }

  it('génère un identifiant et le renvoie dans X-Request-Id', () => {
    const { requestId, res } = run({});
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', requestId);
  });

  it('reprend un identifiant entrant sûr', () => {
    expect(run({ 'X-Request-Id': 'trace-123.abc_DEF' }).requestId).toBe('trace-123.abc_DEF');
  });

  it.each(['a'.repeat(65), 'x y', 'a\nb', '<script>'])('écarte un identifiant entrant douteux (%j)', bad => {
    const { requestId } = run({ 'X-Request-Id': bad });
    expect(requestId).not.toBe(bad);
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('crochets d’arrêt', () => {
  it('s’exécutent dans l’ordre et un échec n’arrête pas les suivants', async () => {
    const order: string[] = [];
    registerShutdownHook('rc-a', () => order.push('a'));
    registerShutdownHook('rc-boom', () => {
      throw new Error('boom');
    });
    registerShutdownHook('rc-b', async () => order.push('b'));
    registerShutdownHook('rc-a', () => order.push('doublon'));

    await runShutdownHooks();
    expect(order).toEqual(['a', 'b']);
  });
});
