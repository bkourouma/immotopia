/**
 * FRI-16 : les seeds et scripts de démonstration refusent de tourner en production.
 * Tests statiques sur la source (ces scripts créent un PrismaClient et s'exécutent à
 * l'import : on ne peut pas les importer sans base) + exécution réelle du script .cjs.
 */
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { assertNotProduction, isLocalDatabaseUrl } from '../../prisma/seeds/assert-not-production';

const API_ROOT = path.resolve(__dirname, '../..');
const SEEDS = [
  'seed-demo-affaires',
  'seed-demo-documents',
  'seed-demo-locative',
  'seed-demo-maintenance',
  'seed-demo-syndic',
  'seed-demo-visites',
  'syndic-demo-seed',
  'fix-amadou-kone',
  'assign-tenant-admin',
  'assign-rbac-roles',
  'create-super-admin'
];

describe('gardes de production des seeds de démonstration', () => {
  it.each(SEEDS)('%s appelle assertNotProduction avant toute utilisation de prisma', name => {
    const source = readFileSync(path.join(API_ROOT, 'prisma/seeds', `${name}.ts`), 'utf8');
    expect(source).toMatch(/import\s*\{\s*assertNotProduction\s*\}\s*from\s*'\.\/assert-not-production'/);
    const callIndex = source.search(/^\s*assertNotProduction\(\s*'[^']+'\s*\)/m);
    expect(callIndex).toBeGreaterThan(-1);
    // Première utilisation réelle de la base : un appel prisma.xxx (hors déclaration du client).
    const firstUse = source.search(/\bprisma\.\w+/);
    expect(firstUse).toBeGreaterThan(-1);
    expect(callIndex).toBeLessThan(firstUse);
  });
});

describe('create-super-admin : plus de mot de passe par défaut', () => {
  const source = readFileSync(path.join(API_ROOT, 'prisma/seeds/create-super-admin.ts'), 'utf8');

  it('ne contient plus de mot de passe codé en dur et exige SUPER_ADMIN_PASSWORD', () => {
    expect(source).not.toMatch(/Admin@123456/);
    expect(source).not.toMatch(/SUPER_ADMIN_PASSWORD\s*\|\|/);
    expect(source).toMatch(/SUPER_ADMIN_PASSWORD est obligatoire/);
    expect(source).toMatch(/validateBootstrapPassword/);
  });

  it('lève une erreur claire quand la variable est absente (exécution avec Prisma mocké)', async () => {
    const saved = { ...process.env };
    delete process.env.SUPER_ADMIN_PASSWORD;
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    const upsert = jest.fn();
    const errors: unknown[][] = [];
    const errSpy = jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
      errors.push(a);
    });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    jest.resetModules();
    jest.doMock('@prisma/client', () => ({
      GlobalRole: { SUPER_ADMIN: 'SUPER_ADMIN' },
      PrismaClient: jest.fn(() => ({ user: { upsert }, role: {}, userRole: {}, $disconnect: jest.fn() }))
    }));
    try {
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../../prisma/seeds/create-super-admin');
      });
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(upsert).not.toHaveBeenCalled();
      const message = errors.map(a => a.map(String).join(' ')).join('\n');
      expect(message).toContain('SUPER_ADMIN_PASSWORD est obligatoire');
    } finally {
      errSpy.mockRestore();
      logSpy.mockRestore();
      exitSpy.mockRestore();
      jest.dontMock('@prisma/client');
      process.env = saved;
    }
  });
});

describe('scripts/fix-demo-login-account.cjs', () => {
  const script = path.join(API_ROOT, 'scripts/fix-demo-login-account.cjs');

  const run = (env: Record<string, string | undefined>) =>
    spawnSync(process.execPath, [script], {
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env } as NodeJS.ProcessEnv,
      encoding: 'utf8',
      timeout: 20000
    });

  it('refuse en production (code non nul) avant toute connexion', () => {
    const r = run({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('Refus');
    expect(r.stderr).toContain('NODE_ENV=production');
  });

  it('refuse quand DATABASE_URL ne pointe pas sur la machine locale', () => {
    const r = run({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://u:p@db.exemple.com:5432/db' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('Refus');
  });

  it('refuse quand DATABASE_URL est absente', () => {
    const r = run({ NODE_ENV: 'development' });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('Refus');
  });

  it('la garde précède le require de @prisma/client et plus aucun mot de passe super-admin en dur', () => {
    const source = readFileSync(script, 'utf8');
    expect(source.indexOf('process.exit(1)')).toBeLessThan(source.indexOf("require('@prisma/client')"));
    expect(source).not.toMatch(/Admin@123456/);
    expect(source).toMatch(/process\.env\.SUPER_ADMIN_PASSWORD/);
  });
});

describe('assertNotProduction : hôte de DATABASE_URL (contre-audit PAY F5)', () => {
  let saved: NodeJS.ProcessEnv;
  let exitSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    saved = { ...process.env };
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    process.env = saved;
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  const runWith = (env: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    assertNotProduction('seed-test');
    return stderrSpy.mock.calls.map(c => String(c[0])).join('');
  };

  it.each([
    'postgresql://immotopia:S3cretPass@db.exemple.com:5432/immotopia?schema=public',
    'postgresql://immotopia:S3cretPass@immotopia-saas-postgres:5432/immotopia',
    'postgresql://immotopia:S3cretPass@10.0.0.12:5432/immotopia',
    'pas une url'
  ])('hôte distant refusé même hors production : %s', url => {
    const output = runWith({ NODE_ENV: 'development', DATABASE_URL: url });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(output).toContain('Refus');
    expect(output).toContain('DATABASE_URL');
    // Jamais l'identifiant ni le mot de passe de connexion dans le message.
    expect(output).not.toContain('S3cretPass');
    expect(output).not.toContain('immotopia:');
  });

  it.each([
    'postgresql://user:password@localhost:5432/immotopia?schema=public',
    'postgresql://user:password@127.0.0.1:5433/immotopia',
    'postgresql://user:password@[::1]:5432/immotopia',
    'postgresql://user:password@LOCALHOST:5432/immotopia',
    'postgresql://user:password@host.docker.internal:5432/immotopia',
    'postgresql:///immotopia?host=/var/run/postgresql'
  ])('hôte local accepté : %s', url => {
    runWith({ NODE_ENV: 'development', DATABASE_URL: url });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('DATABASE_URL absente : comportement inchangé (pas de refus hors production)', () => {
    runWith({ NODE_ENV: 'development', DATABASE_URL: undefined });
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('production : toujours refusée, même avec une base locale', () => {
    const output = runWith({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(output).toContain('jamais tourner en production');
  });

  it('aucune variable de contournement : ALLOW_REMOTE_DEMO_SEED=1 ne change rien', () => {
    runWith({
      NODE_ENV: 'development',
      ALLOW_REMOTE_DEMO_SEED: '1',
      DATABASE_URL: 'postgresql://u:p@db.exemple.com/db'
    });
    expect(exitSpy).toHaveBeenCalledWith(1);
    const source = readFileSync(path.join(API_ROOT, 'prisma/seeds/assert-not-production.ts'), 'utf8');
    expect(source).not.toMatch(/process\.env\.ALLOW_/);
  });

  it('isLocalDatabaseUrl : un sous-domaine de localhost piégé ne passe pas', () => {
    expect(isLocalDatabaseUrl('postgresql://u:p@localhost.evil.example:5432/db')).toBe(false);
    expect(isLocalDatabaseUrl('postgresql://u:p@127.0.0.1.nip.io:5432/db')).toBe(false);
    // Socket Unix : local seulement si le chemin est absolu.
    expect(isLocalDatabaseUrl('postgresql:///db?host=db.exemple.com')).toBe(false);
  });
});
