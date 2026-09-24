/**
 * Tests de `utils/prisma-tenant-guard-extension.ts` (lot D, garde-fou Prisma
 * actif — D2 à D5).
 *
 * `@prisma/client` est remplacé par un mock minimal qui n'expose que
 * `Prisma.dmmf.datamodel.models` : juste assez pour que la dérivation D2 ait
 * un schéma à lire, sans dépendre du vrai schéma (des centaines de modèles).
 *
 * `TENANT_GUARD_MODE` est un singleton lu une fois par `config/env.ts` : pour
 * le faire varier d'un test à l'autre, chaque scénario recharge les modules
 * dans un registre isolé (`jest.isolateModules`) après avoir positionné
 * `process.env.TENANT_GUARD_MODE`. `tenant-context`, `logger` et
 * `error-middleware` sont chargés dans CE MÊME registre isolé, pour que
 * `getTenantContext`/`runWithTenantContext` et la classe `AppError` utilisées
 * par les assertions soient bien les mêmes instances que celles vues par
 * l'extension.
 */

type DmmfField = { name: string };
type DmmfModel = { name: string; fields: DmmfField[] };

const FAKE_SCHEMA: DmmfModel[] = [
  // Modèle cloisonné ordinaire, camelCase.
  { name: 'Property', fields: [{ name: 'id' }, { name: 'tenantId' }, { name: 'name' }] },
  // Modèle cloisonné, snake_case (rattaché par @map côté BD, mais le nom du
  // champ Prisma est bien celui qu'utilisent les `where`).
  { name: 'RentalLease', fields: [{ name: 'id' }, { name: 'tenant_id' }] },
  // Enfant sans champ d'agence — D4 : ne peut pas être contrôlé par un `where`.
  { name: 'PropertyMedia', fields: [{ name: 'id' }, { name: 'propertyId' }] },
  // Champ d'agence facultatif par conception — D2 : jamais contrôlé.
  { name: 'UserRole', fields: [{ name: 'id' }, { name: 'tenantId' }] },
  // Modèle plateforme, aucun champ d'agence.
  { name: 'User', fields: [{ name: 'id' }, { name: 'email' }] }
];

interface Loaded {
  tenantGuardExtension: typeof import('../../src/utils/prisma-tenant-guard-extension').tenantGuardExtension;
  runWithTenantContext: typeof import('../../src/utils/tenant-context').runWithTenantContext;
  AppError: typeof import('../../src/middleware/error-middleware').AppError;
  logger: typeof import('../../src/utils/logger').logger;
}

/** Recharge l'extension (et ses dépendances) dans un registre isolé. */
function load(mode: 'off' | 'warn' | 'enforce', schema: DmmfModel[] = FAKE_SCHEMA): Loaded {
  let result: Loaded | undefined;

  jest.isolateModules(() => {
    process.env.TENANT_GUARD_MODE = mode;

    jest.doMock('@prisma/client', () => ({
      Prisma: { dmmf: { datamodel: { models: schema } } }
    }));

    const tenantContext = require('../../src/utils/tenant-context');
    const errorMiddleware = require('../../src/middleware/error-middleware');
    const loggerModule = require('../../src/utils/logger');
    const extension = require('../../src/utils/prisma-tenant-guard-extension');

    result = {
      tenantGuardExtension: extension.tenantGuardExtension,
      runWithTenantContext: tenantContext.runWithTenantContext,
      AppError: errorMiddleware.AppError,
      logger: loggerModule.logger
    };
  });

  return result!;
}

/** Appelle `$allOperations` directement — pas besoin d'un vrai client Prisma. */
function call(
  loaded: Loaded,
  params: { model?: string; operation: string; args: unknown; query?: jest.Mock }
) {
  const query = params.query ?? jest.fn(async () => ({}));
  const fn = loaded.tenantGuardExtension.query.$allModels.$allOperations as (a: any) => Promise<unknown>;
  return { promise: fn({ model: params.model, operation: params.operation, args: params.args, query }), query };
}

afterEach(() => {
  delete process.env.TENANT_GUARD_MODE;
  jest.restoreAllMocks();
});

describe('D2 — dérivation du schéma (dmmf)', () => {
  it('contrôle un modèle camelCase (tenantId) sans filtre, en mode warn', async () => {
    const loaded = load('warn');
    const warnSpy = jest.spyOn(loaded.logger, 'warn').mockImplementation(() => loaded.logger);

    await loaded.runWithTenantContext({ tenantId: 't1' }, async () => {
      const { promise, query } = call(loaded, { model: 'Property', operation: 'findMany', args: { where: {} } });
      await promise;
      expect(query).toHaveBeenCalledTimes(1);
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/Property\.findMany/);
  });

  it('contrôle un modèle snake_case (tenant_id) sur son propre nom de champ', async () => {
    const loaded = load('warn');
    const warnSpy = jest.spyOn(loaded.logger, 'warn').mockImplementation(() => loaded.logger);

    await loaded.runWithTenantContext({ tenantId: 't1' }, async () => {
      await call(loaded, { model: 'RentalLease', operation: 'findMany', args: { where: {} } }).promise;
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockClear();
    await loaded.runWithTenantContext({ tenantId: 't1' }, async () => {
      await call(loaded, {
        model: 'RentalLease',
        operation: 'findMany',
        args: { where: { tenant_id: 't1' } }
      }).promise;
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("n'ajoute pas un modèle sans champ d'agence à la surveillance (D4)", async () => {
    const loaded = load('warn');
    const warnSpy = jest.spyOn(loaded.logger, 'warn').mockImplementation(() => loaded.logger);

    await loaded.runWithTenantContext({ tenantId: 't1' }, async () => {
      await call(loaded, { model: 'PropertyMedia', operation: 'findMany', args: { where: {} } }).promise;
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('exempte un modèle dont le champ agence est facultatif par conception', async () => {
    const loaded = load('warn');
    const warnSpy = jest.spyOn(loaded.logger, 'warn').mockImplementation(() => loaded.logger);

    await loaded.runWithTenantContext({ tenantId: 't1' }, async () => {
      await call(loaded, { model: 'UserRole', operation: 'findMany', args: { where: {} } }).promise;
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('ne casse rien quand @prisma/client ne fournit pas de dmmf (mock sans Prisma)', async () => {
    let loaded: Loaded | undefined;
    jest.isolateModules(() => {
      process.env.TENANT_GUARD_MODE = 'warn';
      jest.doMock('@prisma/client', () => ({})); // pas de `Prisma` du tout
      const tenantContext = require('../../src/utils/tenant-context');
      const errorMiddleware = require('../../src/middleware/error-middleware');
      const loggerModule = require('../../src/utils/logger');
      const extension = require('../../src/utils/prisma-tenant-guard-extension');
      loaded = {
        tenantGuardExtension: extension.tenantGuardExtension,
        runWithTenantContext: tenantContext.runWithTenantContext,
        AppError: errorMiddleware.AppError,
        logger: loggerModule.logger
      };
    });

    const warnSpy = jest.spyOn(loaded!.logger, 'warn').mockImplementation(() => loaded!.logger);
    await loaded!.runWithTenantContext({ tenantId: 't1' }, async () => {
      const { promise, query } = call(loaded!, { model: 'Property', operation: 'findMany', args: { where: {} } });
      await expect(promise).resolves.toBeDefined();
      expect(query).toHaveBeenCalledTimes(1);
    });
    // Aucun modèle n'est dérivable sans dmmf : rien n'est surveillé, mais rien
    // ne plante non plus.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('ignore les requêtes hors contexte (jobs, seeds) et le super-admin', async () => {
    const loaded = load('warn');
    const warnSpy = jest.spyOn(loaded.logger, 'warn').mockImplementation(() => loaded.logger);

    // Pas de contexte du tout.
    await call(loaded, { model: 'Property', operation: 'findMany', args: { where: {} } }).promise;
    expect(warnSpy).not.toHaveBeenCalled();

    // Contexte super-admin.
    await loaded.runWithTenantContext({ tenantId: 't1', isSuperAdmin: true }, async () => {
      await call(loaded, { model: 'Property', operation: 'findMany', args: { where: {} } }).promise;
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('D3 — couverture étendue (findUnique/update/delete/upsert)', () => {
  it.each(['findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert'])(
    "avertit quand le where de %s ne nomme pas l'agence",
    async operation => {
      const loaded = load('warn');
      const warnSpy = jest.spyOn(loaded.logger, 'warn').mockImplementation(() => loaded.logger);

      await loaded.runWithTenantContext({ tenantId: 't1' }, async () => {
        await call(loaded, { model: 'Property', operation, args: { where: { id: 'p1' } } }).promise;
      });

      expect(warnSpy).toHaveBeenCalledTimes(1);
    }
  );

  it('ne se plaint plus une fois le where corrigé', async () => {
    const loaded = load('warn');
    const warnSpy = jest.spyOn(loaded.logger, 'warn').mockImplementation(() => loaded.logger);

    await loaded.runWithTenantContext({ tenantId: 't1' }, async () => {
      await call(loaded, {
        model: 'Property',
        operation: 'findUnique',
        args: { where: { id: 'p1', tenantId: 't1' } }
      }).promise;
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("détecte une ligne d'une autre agence renvoyée par une lecture (findUnique)", async () => {
    const loaded = load('warn');
    const warnSpy = jest.spyOn(loaded.logger, 'warn').mockImplementation(() => loaded.logger);
    const query = jest.fn(async () => ({ id: 'p1', tenantId: 'AUTRE-AGENCE' }));

    await loaded.runWithTenantContext({ tenantId: 't1' }, async () => {
      // Le `where` est correctement filtré : seule la fuite du RÉSULTAT doit
      // être signalée, pas une absence de filtre.
      await call(loaded, {
        model: 'Property',
        operation: 'findUnique',
        args: { where: { id: 'p1', tenantId: 't1' } },
        query
      }).promise;
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/a renvoyé une ligne d'une autre agence/);
  });

  it("détecte une ligne d'une autre agence dans un tableau (findMany)", async () => {
    const loaded = load('warn');
    const warnSpy = jest.spyOn(loaded.logger, 'warn').mockImplementation(() => loaded.logger);
    const query = jest.fn(async () => [
      { id: 'p1', tenantId: 't1' },
      { id: 'p2', tenantId: 'AUTRE-AGENCE' }
    ]);

    await loaded.runWithTenantContext({ tenantId: 't1' }, async () => {
      await call(loaded, {
        model: 'Property',
        operation: 'findMany',
        args: { where: { tenantId: 't1' } },
        query
      }).promise;
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('ne se plaint pas quand le champ agence est absent du résultat (non sélectionné)', async () => {
    const loaded = load('warn');
    const warnSpy = jest.spyOn(loaded.logger, 'warn').mockImplementation(() => loaded.logger);
    const query = jest.fn(async () => ({ id: 'p1', name: 'x' }));

    await loaded.runWithTenantContext({ tenantId: 't1' }, async () => {
      await call(loaded, {
        model: 'Property',
        operation: 'findUnique',
        args: { where: { id: 'p1', tenantId: 't1' }, select: { id: true, name: true } },
        query
      }).promise;
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('create : avertit quand data porte un tenantId différent du contexte', async () => {
    const loaded = load('warn');
    const warnSpy = jest.spyOn(loaded.logger, 'warn').mockImplementation(() => loaded.logger);

    await loaded.runWithTenantContext({ tenantId: 't1' }, async () => {
      await call(loaded, {
        model: 'Property',
        operation: 'create',
        args: { data: { tenantId: 'AUTRE-AGENCE', name: 'x' } }
      }).promise;
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/écriture Property\.create/);
  });

  it('create : silencieux quand tenantId est simplement absent de data (connect imbriqué)', async () => {
    const loaded = load('warn');
    const warnSpy = jest.spyOn(loaded.logger, 'warn').mockImplementation(() => loaded.logger);

    await loaded.runWithTenantContext({ tenantId: 't1' }, async () => {
      await call(loaded, {
        model: 'Property',
        operation: 'create',
        args: { data: { name: 'x', tenant: { connect: { id: 't1' } } } }
      }).promise;
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('createMany : avertit dès qu’une ligne du tableau porte une autre agence', async () => {
    const loaded = load('warn');
    const warnSpy = jest.spyOn(loaded.logger, 'warn').mockImplementation(() => loaded.logger);

    await loaded.runWithTenantContext({ tenantId: 't1' }, async () => {
      await call(loaded, {
        model: 'Property',
        operation: 'createMany',
        args: { data: [{ tenantId: 't1' }, { tenantId: 'AUTRE-AGENCE' }] }
      }).promise;
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe('D5 — mode enforce', () => {
  it('lève une AppError 500 générique et bloque la requête (where non filtré)', async () => {
    const loaded = load('enforce');
    const errorSpy = jest.spyOn(loaded.logger, 'error').mockImplementation(() => loaded.logger);

    await loaded.runWithTenantContext({ tenantId: 't1' }, async () => {
      const { promise, query } = call(loaded, { model: 'Property', operation: 'findMany', args: { where: {} } });

      await expect(promise).rejects.toBeInstanceOf(loaded.AppError);
      await expect(promise).rejects.toMatchObject({ statusCode: 500 });
      // Le message côté client ne nomme ni le modèle ni le champ.
      await expect(promise).rejects.toMatchObject({ message: 'Erreur interne du serveur.' });
      expect(query).not.toHaveBeenCalled();
    });

    // Le détail (modèle, opération, pile d'appel) part dans le log, pas
    // dans la réponse.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const errorCall = errorSpy.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(errorCall[1]).toMatchObject({ model: 'Property', operation: 'findMany' });
  });

  it("bloque une lecture qui a renvoyé une ligne d'une autre agence", async () => {
    const loaded = load('enforce');
    jest.spyOn(loaded.logger, 'error').mockImplementation(() => loaded.logger);
    const query = jest.fn(async () => ({ id: 'p1', tenantId: 'AUTRE-AGENCE' }));

    await loaded.runWithTenantContext({ tenantId: 't1' }, async () => {
      const { promise } = call(loaded, {
        model: 'Property',
        operation: 'findUnique',
        args: { where: { id: 'p1', tenantId: 't1' } },
        query
      });
      await expect(promise).rejects.toBeInstanceOf(loaded.AppError);
    });

    // La requête a bien été exécutée (on ne peut pas "annuler" la lecture),
    // mais son résultat n'est jamais retourné à l'appelant.
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('mode off', () => {
  it('ne vérifie rien, même sans filtre', async () => {
    const loaded = load('off');
    const warnSpy = jest.spyOn(loaded.logger, 'warn').mockImplementation(() => loaded.logger);
    const errorSpy = jest.spyOn(loaded.logger, 'error').mockImplementation(() => loaded.logger);

    await loaded.runWithTenantContext({ tenantId: 't1' }, async () => {
      const { promise, query } = call(loaded, { model: 'Property', operation: 'findMany', args: { where: {} } });
      await promise;
      expect(query).toHaveBeenCalledTimes(1);
    });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
