/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Garde Prisma : la VALEUR du `tenantId` d'une clause `where` est comparée à
 * celle du contexte (audit du 19/10, lot 4 point 4). Une clause qui cite une
 * autre agence est une violation, pas un filtre valide.
 *
 * Même montage que `tenant-guard.test.ts` : `@prisma/client` réduit au dmmf,
 * modules rechargés dans un registre isolé pour faire varier le mode.
 */

type DmmfModel = { name: string; fields: Array<{ name: string }> };

const FAKE_SCHEMA: DmmfModel[] = [{ name: 'Property', fields: [{ name: 'id' }, { name: 'tenantId' }] }];

function load(mode: 'warn' | 'enforce') {
  let result: any;
  jest.isolateModules(() => {
    process.env.TENANT_GUARD_MODE = mode;
    jest.doMock('@prisma/client', () => ({ Prisma: { dmmf: { datamodel: { models: FAKE_SCHEMA } } } }));
    const tenantContext = require('../../src/utils/tenant-context');
    const errorMiddleware = require('../../src/middleware/error-middleware');
    const loggerModule = require('../../src/utils/logger');
    const extension = require('../../src/utils/prisma-tenant-guard-extension');
    result = {
      fn: extension.tenantGuardExtension.query.$allModels.$allOperations,
      runWithTenantContext: tenantContext.runWithTenantContext,
      AppError: errorMiddleware.AppError,
      logger: loggerModule.logger
    };
  });
  return result;
}

async function run(loaded: any, where: unknown, operation = 'findMany') {
  const query = jest.fn(async () => []);
  const outcome = loaded.runWithTenantContext({ tenantId: 't1' }, () =>
    loaded.fn({ model: 'Property', operation, args: { where }, query })
  );
  return { outcome, query };
}

afterEach(() => {
  delete process.env.TENANT_GUARD_MODE;
  jest.restoreAllMocks();
});

describe('garde Prisma : valeur du tenantId dans le where', () => {
  it.each([
    ['chaîne', { tenantId: 't2' }],
    ['equals', { tenantId: { equals: 't2' } }],
    ['in avec une autre agence', { tenantId: { in: ['t1', 't2'] } }],
    ['AND', { AND: [{ status: 'x' }, { tenantId: 't2' }] }],
    ['OR contenant une autre agence', { OR: [{ tenantId: 't1' }, { tenantId: 't2' }] }],
    ["tenantId voisin d'un AND correct", { tenantId: 't1', AND: [{ tenantId: 't2' }] }]
  ])("warn : %s d'une autre agence est signalé, la requête continue", async (_label, where) => {
    const loaded = load('warn');
    const warn = jest.spyOn(loaded.logger, 'warn').mockImplementation(() => loaded.logger);
    const { outcome, query } = await run(loaded, where);
    await expect(outcome).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('autre agence'), expect.anything());
  });

  it('enforce : un where sur une autre agence lève une 500 générique et ne part pas en base', async () => {
    const loaded = load('enforce');
    jest.spyOn(loaded.logger, 'error').mockImplementation(() => loaded.logger);
    const { outcome, query } = await run(loaded, { tenantId: 't2' });
    await expect(outcome).rejects.toBeInstanceOf(loaded.AppError);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ['chaîne', { tenantId: 't1' }],
    ['equals', { tenantId: { equals: 't1' } }],
    ['in avec la seule agence', { tenantId: { in: ['t1'] } }],
    ['AND', { AND: [{ status: 'x' }, { tenantId: 't1' }] }],
    [
      'OR toutes branches',
      {
        OR: [
          { tenantId: 't1', a: 1 },
          { tenantId: 't1', b: 2 }
        ]
      }
    ],
    ['NOT sur une autre agence (exclusion)', { tenantId: 't1', NOT: { tenantId: 't2' } }],
    ['opérateur non évalué (not)', { tenantId: { not: null } }]
  ])("enforce : %s sur l'agence active passe", async (_label, where) => {
    const loaded = load('enforce');
    const { outcome, query } = await run(loaded, where);
    await expect(outcome).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('un where sans tenantId reste signalé (comportement inchangé)', async () => {
    const loaded = load('warn');
    const warn = jest.spyOn(loaded.logger, 'warn').mockImplementation(() => loaded.logger);
    const { outcome } = await run(loaded, { id: 'p1' });
    await outcome;
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('sans filtre'), expect.anything());
  });

  it('un OR dont une branche ignore le tenant reste signalé', async () => {
    const loaded = load('warn');
    const warn = jest.spyOn(loaded.logger, 'warn').mockImplementation(() => loaded.logger);
    const { outcome } = await run(loaded, { OR: [{ tenantId: 't1' }, { id: 'p1' }] });
    await outcome;
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('sans filtre'), expect.anything());
  });
});
