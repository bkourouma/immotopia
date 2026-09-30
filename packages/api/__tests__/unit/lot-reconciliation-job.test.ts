/**
 * Tache quotidienne de reconciliation du registre des lots : chaque agence est
 * reconciliee dans son propre contexte, une agence en echec n'arrete pas les
 * autres, une seconde passe ne change rien (idempotence) et deux passes ne se
 * chevauchent pas.
 */

const reconcile = jest.fn();
const findMany = jest.fn();
const contexts: Array<string | undefined> = [];

jest.mock('../../src/utils/database', () => ({ prisma: { tenant: { findMany: (...a: any[]) => findMany(...a) } } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/utils/tenant-context', () => ({
  runWithTenantContext: (ctx: { tenantId: string }, fn: () => unknown) => {
    contexts.push(ctx.tenantId);
    return fn();
  }
}));
jest.mock('../../src/services/lot-registry-service', () => ({
  reconcileLotActivations: (...a: any[]) => reconcile(...a)
}));

import { runLotReconciliation } from '../../src/jobs/lot-reconciliation-job';

const empty = { added: [], removed: [], reclassified: 0 };

beforeEach(() => {
  jest.clearAllMocks();
  contexts.length = 0;
  findMany.mockResolvedValue([{ id: 'A' }, { id: 'B' }]);
});

describe('runLotReconciliation', () => {
  it('reconcilie chaque agence active dans son contexte et cumule le rapport', async () => {
    reconcile.mockImplementation(async (id: string) =>
      id === 'A' ? { added: [{ unitKey: 'P:1' }], removed: [], reclassified: 0 } : { ...empty, removed: [{}, {}] }
    );
    const report = await runLotReconciliation();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'ACTIVE', isActive: true } }));
    expect(contexts).toEqual(['A', 'B']);
    expect(reconcile.mock.calls.map(c => c[0])).toEqual(['A', 'B']);
    expect(report).toMatchObject({ tenants: 2, added: 1, removed: 2, failed: 0, skipped: false });
  });

  it('idempotent : une seconde passe sans derive ne change rien', async () => {
    reconcile.mockResolvedValue(empty);
    const report = await runLotReconciliation();
    expect(report).toMatchObject({ added: 0, removed: 0, reclassified: 0 });
  });

  it('une agence en echec est comptee et les suivantes sont traitees', async () => {
    reconcile.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(empty);
    const report = await runLotReconciliation();
    expect(report.failed).toBe(1);
    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it('verrou : une passe lancee pendant une autre est ignoree', async () => {
    findMany.mockResolvedValue([{ id: 'A' }]);
    let release!: () => void;
    reconcile.mockImplementationOnce(() => new Promise(resolve => (release = () => resolve(empty))));
    const first = runLotReconciliation();
    await new Promise(r => setImmediate(r));
    const second = await runLotReconciliation();
    expect(second.skipped).toBe(true);
    release();
    await first;
    // Le verrou est libere : une nouvelle passe s'execute.
    reconcile.mockResolvedValue(empty);
    expect((await runLotReconciliation()).skipped).toBe(false);
  });
});
