/**
 * `listProperties` (property-service.ts, ~l.601) : chaque branche du `OR`
 * d'isolation par agence doit nommer explicitement `tenantId`, sinon
 * l'extension Prisma (`utils/prisma-tenant-guard-extension.ts`,
 * `mentionsTenant`) journalise un faux positif — elle ne peut pas voir
 * qu'une branche est bornee a l'agence via une relation imbriquee
 * (`mandates.some(...)`).
 *
 * Ce test rejoue localement la meme regle que `mentionsTenant` (chaque
 * branche d'un `OR` doit nommer le champ, y compris recursivement a travers
 * un `AND`/`OR`/`NOT` imbrique) pour verifier que le `where` construit par
 * `listProperties` la satisfait — sans dupliquer l'extension elle-meme, qui
 * n'exporte pas cette fonction.
 */

const findManyMock = jest.fn().mockResolvedValue([]);
const countMock = jest.fn().mockResolvedValue(0);

jest.mock('../../src/utils/database', () => ({
  prisma: {
    property: {
      findMany: (...args: any[]) => findManyMock(...args),
      count: (...args: any[]) => countMock(...args)
    }
  }
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn()
}));

// `property-template-service.ts` porte des erreurs TypeScript anciennes,
// hors du perimetre de ce correctif (AGENTS.md, AUDIT_CODE.md) : le simuler
// evite que ts-jest les fasse remonter en essayant de compiler ce fichier au
// seul motif que `property-service.ts` l'importe (modele :
// `property-service.update.test.ts`).
jest.mock('../../src/services/property-template-service', () => ({
  validatePropertyData: jest.fn().mockResolvedValue({ valid: true, errors: [] }),
  getTemplateByType: jest.fn(),
  getAllTemplates: jest.fn()
}));

import { listProperties } from '../../src/services/property-service';

/** Reimplementation minimale de `mentionsTenant` (prisma-tenant-guard-extension.ts). */
function mentionsTenant(where: unknown, field: string, depth = 0): boolean {
  if (!where || typeof where !== 'object' || depth > 5) return false;
  const clause = where as Record<string, unknown>;
  if (clause[field] !== undefined) return true;
  for (const key of ['AND', 'OR', 'NOT'] as const) {
    const branch = clause[key];
    if (Array.isArray(branch)) {
      const check = key === 'OR' ? branch.every.bind(branch) : branch.some.bind(branch);
      if (branch.length > 0 && check((b: unknown) => mentionsTenant(b, field, depth + 1))) return true;
    } else if (branch && mentionsTenant(branch, field, depth + 1)) {
      return true;
    }
  }
  return false;
}

const TENANT_ID = 'a0000000-0000-0000-0000-00000000000a';

describe('listProperties — isolation tenant du OR (garde Prisma)', () => {
  beforeEach(() => {
    findManyMock.mockClear();
    countMock.mockClear();
  });

  it('le where construit nomme tenantId dans CHAQUE branche du OR (satisfait mentionsTenant)', async () => {
    await listProperties(TENANT_ID, null, {});

    const where = findManyMock.mock.calls[0][0].where;
    expect(Array.isArray(where.OR)).toBe(true);
    expect(where.OR.length).toBeGreaterThan(0);
    expect(mentionsTenant(where, 'tenantId')).toBe(true);
  });

  it('la branche PUBLIC exige tenantId: null (bien independant, jamais rattache a une agence)', async () => {
    await listProperties(TENANT_ID, null, {});

    const where = findManyMock.mock.calls[0][0].where;
    const publicBranch = where.OR.find((branch: any) => branch.ownershipType === 'PUBLIC');
    expect(publicBranch).toBeDefined();
    expect(publicBranch.tenantId).toBeNull();
  });

  it('la branche CLIENT reste bornee au mandat ACTIF de cette agence', async () => {
    await listProperties(TENANT_ID, null, {});

    const where = findManyMock.mock.calls[0][0].where;
    const clientBranch = where.OR.find((branch: any) => branch.ownershipType === 'CLIENT');
    expect(clientBranch).toBeDefined();
    expect(clientBranch.mandates).toEqual({ some: { tenantId: TENANT_ID, isActive: true } });
    // tenantId (mandat) ou null (proprietaire seul) : jamais l'agence d'un tiers.
    expect(mentionsTenant(clientBranch, 'tenantId')).toBe(true);
  });
});
