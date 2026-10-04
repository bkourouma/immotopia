/**
 * Tests du carnet des preneurs (`lib/finance/stock-preneurs.ts`) — lot 040,
 * B2 (B2-R1, B2-R2, B2-R4, B2-R5, B2-R6).
 *
 * Banc en mémoire : la doublure de Prisma évalue les `where` construits par le
 * service (égalité, `not`, `contains`, `OR`) sur trois tables — preneurs,
 * employés, tâcherons — de deux agences. La garde d'appartenance
 * (`assertBelongsToTenant`) tourne pour de vrai sur cette doublure.
 *
 * Les critères B2 (1 à 4) qui portent sur la SORTIE (preneur d'une autre
 * agence, `requireTaker`, preneur inactif) appartiennent au territoire API-1 ;
 * ici : création, doublon, désactivation, téléphone effaçable et masqué,
 * renommage sans effet sur l'histoire.
 */

type Row = Record<string, any>;

const store = { takers: [] as Row[], employees: [] as Row[], contractors: [] as Row[], seq: 0 };

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Row[]).some(sub => matches(row, sub));
    const value = row[key];
    if (condition === null || typeof condition !== 'object' || condition instanceof Date) {
      return value === condition;
    }
    if ('not' in condition) return value !== condition.not;
    if ('contains' in condition) {
      return (
        typeof value === 'string' &&
        (condition.mode === 'insensitive'
          ? value.toLowerCase().includes(String(condition.contains).toLowerCase())
          : value.includes(condition.contains))
      );
    }
    throw new Error(`Condition non simulée : ${JSON.stringify(condition)}`);
  });
}

function withLinks(row: Row): Row {
  return {
    ...row,
    employee: store.employees.find(e => e.id === row.employeeId) ?? null,
    contractor: store.contractors.find(c => c.id === row.contractorId) ?? null
  };
}

const mockPrisma: Row = {
  stockTaker: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.takers
        .filter(row => matches(row, where))
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
        .map(withLinks)
    ),
    findFirst: jest.fn(async ({ where }: Row) => {
      const row = store.takers.find(candidate => matches(candidate, where));
      return row ? withLinks(row) : null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      store.seq += 1;
      const row = { id: `preneur-${store.seq}`, isActive: true, createdAt: new Date('2026-03-01'), ...data };
      store.takers.push(row);
      return withLinks(row);
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.takers.find(candidate => candidate.id === where.id && candidate.tenantId === where.tenantId)!;
      Object.assign(row, data);
      return withLinks(row);
    })
  },
  employee: {
    findFirst: jest.fn(async ({ where }: Row) => store.employees.find(row => matches(row, where)) ?? null)
  },
  contractor: {
    findFirst: jest.fn(async ({ where }: Row) => store.contractors.find(row => matches(row, where)) ?? null)
  }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

import {
  createStockTakerTx,
  formatTakerLabel,
  listStockTakers,
  normalizeTakerName,
  updateStockTakerTx
} from '../../src/lib/finance/stock-preneurs';
import { NotFoundError } from '../../src/middleware/error-middleware';

const TENANT = 'tenant-1';
const OTHER = 'tenant-2';
const MANAGER = { canManageTakers: true };
const VIEWER = { canManageTakers: false };

function create(input: Row, tenantId = TENANT) {
  return createStockTakerTx(mockPrisma as any, tenantId, { createdByUserId: 'user-1', ...input } as any, MANAGER);
}

beforeEach(() => {
  jest.clearAllMocks();
  store.takers = [];
  store.seq = 0;
  store.employees = [
    { id: 'employe-a', tenantId: TENANT, fullName: 'Moussa Traoré' },
    { id: 'employe-b', tenantId: OTHER, fullName: 'Employé ailleurs' }
  ];
  store.contractors = [
    { id: 'tacheron-a', tenantId: TENANT, fullName: 'Entreprise Bâtir' },
    { id: 'tacheron-b', tenantId: OTHER, fullName: 'Tâcheron ailleurs' }
  ];
});

describe('libellés et normalisation', () => {
  it('le libellé est « Nom — Équipe », ou le nom seul', () => {
    expect(formatTakerLabel('Koné Ibrahim', 'Équipe maçonnerie')).toBe('Koné Ibrahim — Équipe maçonnerie');
    expect(formatTakerLabel('Koné Ibrahim', null)).toBe('Koné Ibrahim');
  });

  it('le nom normalisé ignore casse, accents et espaces répétés', () => {
    expect(normalizeTakerName('  KONÉ   Ibrahîm ')).toBe('kone ibrahim');
  });
});

describe('createStockTakerTx (B2-R1, B2-R2, B2-R5)', () => {
  it('crée un preneur, élague les champs et normalise le téléphone', async () => {
    const { taker, snapshot } = await create({
      fullName: '  Koné   Ibrahim ',
      teamOrCompany: ' Équipe maçonnerie ',
      phone: '07.00-00 (00)'
    });

    expect(taker).toMatchObject({
      fullName: 'Koné Ibrahim',
      teamOrCompany: 'Équipe maçonnerie',
      label: 'Koné Ibrahim — Équipe maçonnerie',
      phone: '07 00 00 00',
      isActive: true
    });
    expect(store.takers[0].normalizedName).toBe('kone ibrahim');
    expect(store.takers[0].createdByUserId).toBe('user-1');
    expect(snapshot.phone).toBe('07 00 00 00');
  });

  it('B2-5 : un preneur actif de même nom (sans casse ni accents) et même équipe → 409 STOCK_TAKER_DUPLICATE avec existingTakerId', async () => {
    const first = await create({ fullName: 'Koné Ibrahim', teamOrCompany: 'Équipe maçonnerie' });

    await expect(create({ fullName: 'KONE ibrahim', teamOrCompany: 'equipe MAÇONNERIE' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'STOCK_TAKER_DUPLICATE',
      data: { existingTakerId: first.taker.id }
    });
  });

  it('même nom dans une autre équipe, ou homonyme désactivé : pas un doublon', async () => {
    await create({ fullName: 'Koné Ibrahim', teamOrCompany: 'Équipe maçonnerie' });
    await expect(create({ fullName: 'Koné Ibrahim', teamOrCompany: 'Équipe ferraillage' })).resolves.toBeDefined();

    store.takers.forEach(row => (row.isActive = false));
    await expect(create({ fullName: 'Koné Ibrahim', teamOrCompany: 'Équipe maçonnerie' })).resolves.toBeDefined();
  });

  it('un homonyme d’une autre agence n’est pas un doublon', async () => {
    await create({ fullName: 'Koné Ibrahim' }, OTHER);
    await expect(create({ fullName: 'Koné Ibrahim' })).resolves.toBeDefined();
  });

  it('B2-R2 : un employé ou un tâcheron d’une autre agence → NotFoundError, comme un inexistant', async () => {
    await expect(create({ fullName: 'Koné Ibrahim', employeeId: 'employe-b' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(create({ fullName: 'Koné Ibrahim', contractorId: 'tacheron-b' })).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(create({ fullName: 'Koné Ibrahim', employeeId: 'inexistant' })).rejects.toBeInstanceOf(NotFoundError);
    expect(store.takers).toHaveLength(0);
  });

  it('lie à un employé de l’agence et rend son nom seulement', async () => {
    const { taker } = await create({ fullName: 'Moussa Traoré', employeeId: 'employe-a' });
    expect(taker).toMatchObject({ employeeId: 'employe-a', contractorId: null, linkedPersonLabel: 'Moussa Traoré' });
  });

  it('refuse un lien vers un employé ET un tâcheron (400)', async () => {
    await expect(
      create({ fullName: 'Koné Ibrahim', employeeId: 'employe-a', contractorId: 'tacheron-a' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('updateStockTakerTx (B2-R4)', () => {
  it('efface le téléphone et désactive, avec les changements pour l’audit', async () => {
    const { taker } = await create({ fullName: 'Koné Ibrahim', phone: '0700000000' });

    const cleared = await updateStockTakerTx(mockPrisma as any, TENANT, taker.id, { phone: null }, MANAGER);
    expect(cleared.taker.phone).toBeNull();
    expect(cleared.changes).toEqual({ phone: { before: '0700000000', after: null } });

    const disabled = await updateStockTakerTx(mockPrisma as any, TENANT, taker.id, { isActive: false }, MANAGER);
    expect(disabled.taker.isActive).toBe(false);
    expect(store.takers).toHaveLength(1);
  });

  it('B2-3 : renommer change le libellé actuel, pas l’instantané d’une sortie passée', async () => {
    const { taker } = await create({ fullName: 'Koné Ibrahim', teamOrCompany: 'Équipe maçonnerie' });
    // L'instantané posé par la sortie (B2-R3) vit sur le mouvement : le carnet n'y touche jamais.
    const pastIssue = { requestedBy: taker.label };

    const renamed = await updateStockTakerTx(
      mockPrisma as any,
      TENANT,
      taker.id,
      { fullName: 'Koné Ibrahim Junior' },
      MANAGER
    );
    expect(renamed.taker.label).toBe('Koné Ibrahim Junior — Équipe maçonnerie');
    expect(store.takers[0].normalizedName).toBe('kone ibrahim junior');
    expect(pastIssue.requestedBy).toBe('Koné Ibrahim — Équipe maçonnerie');
  });

  it('un preneur d’une autre agence se corrige en 404', async () => {
    const { taker } = await create({ fullName: 'Koné Ibrahim' }, OTHER);
    await expect(
      updateStockTakerTx(mockPrisma as any, TENANT, taker.id, { isActive: false }, MANAGER)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('réactiver un preneur alors qu’un homonyme actif existe → 409 STOCK_TAKER_DUPLICATE', async () => {
    const ancien = await create({ fullName: 'Koné Ibrahim' });
    await updateStockTakerTx(mockPrisma as any, TENANT, ancien.taker.id, { isActive: false }, MANAGER);
    const nouveau = await create({ fullName: 'Koné Ibrahim' });

    await expect(
      updateStockTakerTx(mockPrisma as any, TENANT, ancien.taker.id, { isActive: true }, MANAGER)
    ).rejects.toMatchObject({ code: 'STOCK_TAKER_DUPLICATE', data: { existingTakerId: nouveau.taker.id } });
  });

  it('lier à un tâcheron détache l’employé : jamais les deux', async () => {
    const { taker } = await create({ fullName: 'Moussa Traoré', employeeId: 'employe-a' });
    const relinked = await updateStockTakerTx(
      mockPrisma as any,
      TENANT,
      taker.id,
      { contractorId: 'tacheron-a' },
      MANAGER
    );
    expect(relinked.taker).toMatchObject({ employeeId: null, contractorId: 'tacheron-a' });

    await expect(
      updateStockTakerTx(mockPrisma as any, TENANT, taker.id, { contractorId: 'tacheron-b' }, MANAGER)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('une correction sans effet ne réécrit rien', async () => {
    const { taker } = await create({ fullName: 'Koné Ibrahim' });
    const result = await updateStockTakerTx(mockPrisma as any, TENANT, taker.id, { isActive: true }, MANAGER);
    expect(result.changes).toEqual({});
    expect(mockPrisma.stockTaker.update).not.toHaveBeenCalled();
  });
});

describe('listStockTakers (B2-R6)', () => {
  it('actifs par défaut, triés par nom ; téléphone rendu au gestionnaire du carnet seulement', async () => {
    await create({ fullName: 'Zoumana Keita', phone: '0102030405' });
    const { taker } = await create({ fullName: 'Awa Diallo', phone: '0607080910' });
    await updateStockTakerTx(mockPrisma as any, TENANT, taker.id, { isActive: false }, MANAGER);
    await create({ fullName: 'Bakary Sow' }, OTHER);

    const actifs = await listStockTakers(TENANT, MANAGER, undefined, mockPrisma as any);
    expect(actifs.map(row => row.fullName)).toEqual(['Zoumana Keita']);
    expect(actifs[0].phone).toBe('0102030405');

    const tous = await listStockTakers(TENANT, VIEWER, { onlyActive: false }, mockPrisma as any);
    expect(tous.map(row => row.fullName)).toEqual(['Awa Diallo', 'Zoumana Keita']);
    expect(tous.every(row => row.phone === null)).toBe(true);
  });

  it('cherche sur le nom sans accents et sur l’équipe', async () => {
    await create({ fullName: 'Koné Ibrahim', teamOrCompany: 'Équipe maçonnerie' });
    await create({ fullName: 'Awa Diallo', teamOrCompany: 'Ferraillage' });

    expect((await listStockTakers(TENANT, VIEWER, { search: 'kone' }, mockPrisma as any)).map(r => r.fullName)).toEqual(
      ['Koné Ibrahim']
    );
    expect((await listStockTakers(TENANT, VIEWER, { search: 'ferr' }, mockPrisma as any)).map(r => r.fullName)).toEqual(
      ['Awa Diallo']
    );
  });
});
