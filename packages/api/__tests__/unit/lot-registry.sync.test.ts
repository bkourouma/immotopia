/**
 * Registre des lots au fil de l'eau (vague 2, lot B) :
 * services/lot-registry-service.ts, `syncLotActivationsTx` et
 * `assertCapacityTx`. Faux client de transaction en memoire, aucune base.
 *
 * Couvre : D1 (logement), D2 (lot de copropriete), D14 (chantier), le
 * dedoublonnage par cle d'unite, l'immeuble decoupe, la bascule au
 * patrimoine (transfert a solde nul), les trois politiques de quota
 * (BLOCK / BILL_OVERAGE / WARN_ONLY) sous SUBSCRIPTION_ENFORCEMENT, et le
 * verrou d'agence contre deux activations simultanees.
 */

type Row = Record<string, any>;

let mockEntitlementsConfig: { quotaPolicy: string; enforcement: string; limits: Record<string, number> };

jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: jest.fn(async (tenantId: string) => {
    const used = {
      LOTS: mockWorld.activations.filter(a => a.tenantId === tenantId && a.deactivatedAt === null).length,
      COPROPRIETES: mockWorld.syndicates.filter(s => s.tenantId === tenantId && ['ACTIVE', 'IN_DISPUTE'].includes(s.status)).length,
      CHANTIERS: mockWorld.sites.filter(s => s.tenantId === tenantId && s.status !== 'CLOSED').length
    } as Record<string, number>;
    const capacities: Row = {};
    for (const key of ['LOTS', 'COPROPRIETES', 'CHANTIERS']) {
      const limit = mockEntitlementsConfig.limits[key] ?? 0;
      capacities[key] = { included: limit, extensions: 0, overrides: 0, limit, used: used[key], remaining: Math.max(0, limit - used[key]), overBy: Math.max(0, used[key] - limit) };
    }
    return { tenantId, quotaPolicy: mockEntitlementsConfig.quotaPolicy, enforcement: mockEntitlementsConfig.enforcement, capacities };
  }),
  invalidateEntitlements: jest.fn()
}));

import { assertCapacityTx, syncLotActivationsTx } from '../../src/services/lot-registry-service';
import { QuotaExceededError } from '../../src/middleware/error-middleware';

const T = 'tenant-1';
const OTHER = 'tenant-2';

let mockWorld: {
  properties: Row[];
  leases: Row[];
  mandates: Row[];
  syndicates: Row[];
  syndicateLots: Row[];
  sites: Row[];
  siteLots: Row[];
  activations: Row[];
};
let seq = 0;
const lockKeys: string[] = [];

// ------------------------------------------------------------------ faux client

const inList = (value: unknown, filter: Row | undefined) => !filter || (filter.in as unknown[]).includes(value);

function propertyManagedBy(p: Row, tenantId: string) {
  if (p.tenantId === tenantId) return true;
  if (p.tenantId !== null) return false;
  return (
    mockWorld.mandates.some(m => m.propertyId === p.id && m.tenantId === tenantId && m.isActive) ||
    mockWorld.leases.some(l => l.property_id === p.id && l.tenant_id === tenantId && l.status === 'ACTIVE')
  );
}

function propertyFindMany({ where, select }: Row) {
  let rows = mockWorld.properties.filter(p => inList(p.id, where.id));
  if (where.containerParentId?.not === null) rows = rows.filter(p => p.containerParentId);
  if (where.OR) {
    const tenantId = where.OR[0].tenantId;
    rows = rows.filter(p => propertyManagedBy(p, tenantId));
  }
  if (select?.containerParentId) return rows.map(p => ({ containerParentId: p.containerParentId }));
  return rows.map(p => {
    const tenantId = where.OR[0].tenantId;
    const siteLot = mockWorld.siteLots.find(l => l.propertyId === p.id);
    const site = siteLot ? mockWorld.sites.find(s => s.id === siteLot.siteId) : null;
    return {
      id: p.id,
      status: p.status,
      transactionModes: p.transactionModes,
      _count: { containerChildren: mockWorld.properties.filter(c => c.containerParentId === p.id).length },
      rentalLeases: mockWorld.leases.filter(l => l.property_id === p.id && l.tenant_id === tenantId && l.status === 'ACTIVE').slice(0, 1),
      siteLot: siteLot ? { id: siteLot.id, site: { status: site!.status, tenantId: site!.tenantId } } : null
    };
  });
}

function matchOr(row: Row, or: Row[] | undefined) {
  if (!or) return true;
  return or.some(cond => Object.entries(cond).every(([k, f]) => inList(row[k], f as Row)));
}

function syndicateLotFindMany({ where }: Row) {
  return mockWorld.syndicateLots
    .filter(l => {
      const syndicate = mockWorld.syndicates.find(s => s.id === l.syndicateId)!;
      if (where.syndicate?.tenantId && syndicate.tenantId !== where.syndicate.tenantId) return false;
      if (where.syndicate?.status && !inList(syndicate.status, where.syndicate.status)) return false;
      if (where.lotType && !inList(l.lotType, where.lotType)) return false;
      return matchOr(l, where.OR);
    })
    .map(l => ({ id: l.id, propertyId: l.propertyId }));
}

function siteLotFindMany({ where }: Row) {
  return mockWorld.siteLots
    .filter(l => {
      if (where.tenantId && l.tenantId !== where.tenantId) return false;
      const site = mockWorld.sites.find(s => s.id === l.siteId)!;
      if (where.site?.tenantId && site.tenantId !== where.site.tenantId) return false;
      if (where.site?.status && !inList(site.status, where.site.status)) return false;
      return matchOr(l, where.OR);
    })
    .map(l => ({ id: l.id, propertyId: l.propertyId }));
}

const openActivation = (a: Row, where: Row) =>
  a.tenantId === where.tenantId && (where.deactivatedAt !== null || a.deactivatedAt === null) && (!where.unitKey || typeof where.unitKey !== 'string' || a.unitKey === where.unitKey);

/** Verrou consultatif simule : une transaction a la fois par cle. */
let lockTail: Promise<void> = Promise.resolve();

function makeTx() {
  let release: () => void = () => undefined;
  let holds = false;
  const tx: Row = {
    $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      lockKeys.push(String(values[0]));
      expect(strings.join('?')).toContain('pg_advisory_xact_lock');
      const previous = lockTail;
      lockTail = new Promise<void>(resolve => {
        release = resolve;
      });
      holds = true;
      await previous;
      return 1;
    }),
    property: { findMany: jest.fn(async (args: Row) => propertyFindMany(args)) },
    syndicateLot: { findMany: jest.fn(async (args: Row) => syndicateLotFindMany(args)) },
    siteLot: { findMany: jest.fn(async (args: Row) => siteLotFindMany(args)) },
    lotActivation: {
      findMany: jest.fn(async ({ where }: Row) =>
        mockWorld.activations.filter(a => openActivation(a, where) && matchOr(a, where.OR)).map(a => ({ unitKey: a.unitKey }))
      ),
      findFirst: jest.fn(async ({ where }: Row) => mockWorld.activations.find(a => openActivation(a, where)) ?? null),
      create: jest.fn(async ({ data }: Row) => {
        // Pause : laisse une transaction concurrente avancer (sans verrou, elle verrait la meme consommation).
        await new Promise(resolve => setImmediate(resolve));
        const row = { id: `act-${++seq}`, deactivatedAt: null, deactivationReason: null, ...data };
        mockWorld.activations.push(row);
        return { id: row.id };
      }),
      updateMany: jest.fn(async ({ where, data }: Row) => {
        const rows = mockWorld.activations.filter(a => openActivation(a, where));
        for (const a of rows) Object.assign(a, data);
        return { count: rows.length };
      })
    }
  };
  return { tx, end: () => holds && release() };
}

/** Transaction simulee : le verrou tombe a la fin, comme pg_advisory_xact_lock. */
async function inTx<T>(fn: (tx: Row) => Promise<T>): Promise<T> {
  const { tx, end } = makeTx();
  try {
    return await fn(tx);
  } finally {
    end();
  }
}

const sync = (scope: Row, options: Row = {}) => inTx(tx => syncLotActivationsTx(tx as any, T, scope, options));
const open = () => mockWorld.activations.filter(a => a.tenantId === T && a.deactivatedAt === null);
const openKeys = () => open().map(a => a.unitKey).sort();

function addProperty(p: Row) {
  const row = { tenantId: T, status: 'AVAILABLE', transactionModes: ['RENTAL'], containerParentId: null, ...p };
  mockWorld.properties.push(row);
  return row;
}

beforeEach(() => {
  mockWorld = { properties: [], leases: [], mandates: [], syndicates: [], syndicateLots: [], sites: [], siteLots: [], activations: [] };
  mockEntitlementsConfig = { quotaPolicy: 'BILL_OVERAGE', enforcement: 'enforce', limits: { LOTS: 100, COPROPRIETES: 2, CHANTIERS: 2 } };
  lockKeys.length = 0;
  lockTail = Promise.resolve();
});

// ------------------------------------------------------------------ D1 logement

describe('logement (D1)', () => {
  it('compte des qu’il sort du brouillon ET est propose a la location', async () => {
    addProperty({ id: 'p1', status: 'DRAFT' });
    await sync({ propertyIds: ['p1'] });
    expect(openKeys()).toEqual([]);

    mockWorld.properties[0].status = 'AVAILABLE';
    const result = await sync({ propertyIds: ['p1'] });
    expect(result.activated).toEqual(['P:p1']);
    expect(open()[0]).toMatchObject({ kind: 'RENTAL_UNIT', propertyId: 'p1' });
  });

  it('un bien seulement a vendre ne compte pas ; un bail ACTIVE le fait compter', async () => {
    addProperty({ id: 'p1', transactionModes: ['SALE'] });
    await sync({ propertyIds: ['p1'] });
    expect(openKeys()).toEqual([]);
    mockWorld.leases.push({ property_id: 'p1', tenant_id: T, status: 'ACTIVE' });
    await sync({ propertyIds: ['p1'] });
    expect(openKeys()).toEqual(['P:p1']);
  });

  it('vendu ou archive sans bail actif : sort du registre, avec la raison', async () => {
    addProperty({ id: 'p1' });
    await sync({ propertyIds: ['p1'] });
    mockWorld.properties[0].status = 'SOLD';
    const result = await sync({ propertyIds: ['p1'] }, { reason: 'PROPERTY_SOLD' });
    expect(result.deactivated).toEqual(['P:p1']);
    expect(mockWorld.activations[0]).toMatchObject({ deactivationReason: 'PROPERTY_SOLD' });
    expect(mockWorld.activations[0].deactivatedAt).toBeInstanceOf(Date);
  });

  it('fin du bail d’un bien loue mais plus propose : il sort', async () => {
    addProperty({ id: 'p1', status: 'RENTED', transactionModes: ['SALE'] });
    mockWorld.leases.push({ property_id: 'p1', tenant_id: T, status: 'ACTIVE' });
    await sync({ propertyIds: ['p1'] });
    expect(openKeys()).toEqual(['P:p1']);
    mockWorld.leases[0].status = 'ENDED';
    await sync({ propertyIds: ['p1'] }, { reason: 'LEASE_ENDED' });
    expect(openKeys()).toEqual([]);
  });

  it('immeuble decoupe : l’immeuble sort, ses unites comptent (le parent est recalcule avec l’enfant)', async () => {
    addProperty({ id: 'building' });
    await sync({ propertyIds: ['building'] });
    expect(openKeys()).toEqual(['P:building']);

    addProperty({ id: 'apt-1', containerParentId: 'building' });
    await sync({ propertyIds: ['apt-1'] }); // l'appelant ne cite que l'unite creee
    expect(openKeys()).toEqual(['P:apt-1']);
  });

  it('bien CLIENT d’un mandat actif de l’agence : compte ; bien d’une autre agence : jamais', async () => {
    addProperty({ id: 'client', tenantId: null });
    mockWorld.mandates.push({ propertyId: 'client', tenantId: T, isActive: true });
    addProperty({ id: 'foreign', tenantId: OTHER });
    await sync({ propertyIds: ['client', 'foreign'] });
    expect(openKeys()).toEqual(['P:client']);
  });
});

// ------------------------------------------------------------------ D2, D14, dedoublonnage

describe('copropriete (D2), chantier (D14) et dedoublonnage', () => {
  beforeEach(() => {
    mockWorld.syndicates.push({ id: 's1', tenantId: T, status: 'ACTIVE' });
  });

  it('lot principal compte ; parking non ; lot sans bien : cle SL:', async () => {
    mockWorld.syndicateLots.push(
      { id: 'l1', syndicateId: 's1', propertyId: null, lotType: 'APARTMENT' },
      { id: 'l2', syndicateId: 's1', propertyId: null, lotType: 'PARKING' }
    );
    await sync({ syndicateLotIds: ['l1', 'l2'] });
    expect(openKeys()).toEqual(['SL:l1']);
    expect(open()[0].kind).toBe('COPRO_LOT');
  });

  it('un logement deja compte qui devient lot de copropriete n’est PAS compte deux fois', async () => {
    addProperty({ id: 'p1' });
    await sync({ propertyIds: ['p1'] });
    mockWorld.syndicateLots.push({ id: 'l1', syndicateId: 's1', propertyId: 'p1', lotType: 'APARTMENT' });
    const result = await sync({ syndicateLotIds: ['l1'] });
    expect(result.activated).toEqual([]);
    expect(openKeys()).toEqual(['P:p1']);
    expect(open()[0].kind).toBe('RENTAL_UNIT'); // priorite logement > copropriete
  });

  it('copropriete en liquidation : ses lots sortent, sauf ceux qui restent des logements', async () => {
    addProperty({ id: 'p1' });
    addProperty({ id: 'p2', transactionModes: ['SALE'] });
    mockWorld.syndicateLots.push(
      { id: 'l1', syndicateId: 's1', propertyId: 'p1', lotType: 'APARTMENT' },
      { id: 'l2', syndicateId: 's1', propertyId: 'p2', lotType: 'OFFICE' }
    );
    await sync({ syndicateIds: ['s1'] });
    expect(openKeys()).toEqual(['P:p1', 'P:p2']);

    mockWorld.syndicates[0].status = 'IN_LIQUIDATION';
    await sync({ syndicateIds: ['s1'] }, { reason: 'SYNDICATE_IN_LIQUIDATION' });
    expect(openKeys()).toEqual(['P:p1']);
  });

  it('chantier : lot compte tant que le chantier est ouvert ; la cloture le sort', async () => {
    mockWorld.sites.push({ id: 'site', tenantId: T, status: 'IN_PROGRESS' });
    mockWorld.siteLots.push({ id: 'sl1', siteId: 'site', tenantId: T, propertyId: null });
    await sync({ siteLotIds: ['sl1'] });
    expect(openKeys()).toEqual(['PL:sl1']);

    mockWorld.sites[0].status = 'CLOSED';
    await sync({ siteIds: ['site'] }, { reason: 'SITE_CLOSED' });
    expect(openKeys()).toEqual([]);
  });

  it('bascule au patrimoine chantier ouvert = transfert PL: -> P:, solde nul, meme en BLOCK a la limite', async () => {
    mockEntitlementsConfig = { quotaPolicy: 'BLOCK', enforcement: 'enforce', limits: { LOTS: 1 } };
    mockWorld.sites.push({ id: 'site', tenantId: T, status: 'SUSPENDED' });
    mockWorld.siteLots.push({ id: 'sl1', siteId: 'site', tenantId: T, propertyId: null });
    await sync({ siteLotIds: ['sl1'] });

    addProperty({ id: 'villa', transactionModes: ['SALE'] });
    mockWorld.siteLots[0].propertyId = 'villa';
    const result = await sync({ siteLotIds: ['sl1'], propertyIds: ['villa'] }, { reason: 'TRANSFERRED_TO_PROPERTY' });
    expect(result).toMatchObject({ activated: ['P:villa'], deactivated: ['PL:sl1'] });
    expect(openKeys()).toEqual(['P:villa']);
    expect(open()[0]).toMatchObject({ kind: 'PROGRAM_LOT', siteLotId: 'sl1' });
  });

  it('idempotent : rejouer ne cree rien', async () => {
    addProperty({ id: 'p1' });
    await sync({ propertyIds: ['p1'] });
    const again = await sync({ propertyIds: ['p1'] });
    expect(again).toMatchObject({ activated: [], deactivated: [], quota: null });
    expect(mockWorld.activations).toHaveLength(1);
  });
});

// ------------------------------------------------------------------ politiques (D4)

describe('politiques de quota (D4) et SUBSCRIPTION_ENFORCEMENT', () => {
  beforeEach(() => {
    addProperty({ id: 'p1' });
    addProperty({ id: 'p2' });
  });

  it('BLOCK (enforce) : 409 QUOTA_EXCEEDED { capacityKey, limit, used, requested }, rien n’est ecrit', async () => {
    mockEntitlementsConfig = { quotaPolicy: 'BLOCK', enforcement: 'enforce', limits: { LOTS: 1 } };
    await sync({ propertyIds: ['p1'] });
    const failure = await sync({ propertyIds: ['p2'] }).catch(e => e);
    expect(failure).toBeInstanceOf(QuotaExceededError);
    expect(failure).toMatchObject({
      statusCode: 409,
      code: 'QUOTA_EXCEEDED',
      data: { capacityKey: 'LOTS', limit: 1, used: 1, requested: 1 }
    });
    expect(openKeys()).toEqual(['P:p1']);
  });

  it('BILL_OVERAGE (defaut) : l’activation passe, decision BILL (depassement facture)', async () => {
    mockEntitlementsConfig = { quotaPolicy: 'BILL_OVERAGE', enforcement: 'enforce', limits: { LOTS: 1 } };
    await sync({ propertyIds: ['p1'] });
    const result = await sync({ propertyIds: ['p2'] });
    expect(result.quota).toMatchObject({ decision: 'BILL', overBy: 1 });
    expect(openKeys()).toEqual(['P:p1', 'P:p2']);
  });

  it('WARN_ONLY : passe, decision WARN (alerte levee par la tache)', async () => {
    mockEntitlementsConfig = { quotaPolicy: 'WARN_ONLY', enforcement: 'enforce', limits: { LOTS: 1 } };
    await sync({ propertyIds: ['p1'] });
    const result = await sync({ propertyIds: ['p2'] });
    expect(result.quota).toMatchObject({ decision: 'WARN' });
    expect(openKeys()).toHaveLength(2);
  });

  it('BLOCK en mode warn : passe (journalise) ; en mode off : passe, et le registre est QUAND MEME tenu', async () => {
    mockEntitlementsConfig = { quotaPolicy: 'BLOCK', enforcement: 'warn', limits: { LOTS: 0 } };
    expect((await sync({ propertyIds: ['p1'] })).quota).toMatchObject({ decision: 'WARN' });
    mockEntitlementsConfig = { quotaPolicy: 'BLOCK', enforcement: 'off', limits: { LOTS: 0 } };
    expect((await sync({ propertyIds: ['p2'] })).quota).toMatchObject({ decision: 'ALLOW' });
    expect(openKeys()).toEqual(['P:p1', 'P:p2']);
  });

  it('assertCapacityTx : copropriete au-dela de la capacite refusee en BLOCK, sous le verrou d’agence', async () => {
    mockEntitlementsConfig = { quotaPolicy: 'BLOCK', enforcement: 'enforce', limits: { COPROPRIETES: 1 } };
    mockWorld.syndicates.push({ id: 's1', tenantId: T, status: 'ACTIVE' });
    await expect(inTx(tx => assertCapacityTx(tx as any, T, 'COPROPRIETES'))).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
      data: { capacityKey: 'COPROPRIETES', limit: 1, used: 1, requested: 1 }
    });
    expect(lockKeys).toEqual([`lot-registry:${T}`]);
  });
});

// ------------------------------------------------------------------ verrou

describe('verrou d’agence contre les activations simultanees', () => {
  it('prend pg_advisory_xact_lock sur une cle propre a l’agence', async () => {
    addProperty({ id: 'p1' });
    await sync({ propertyIds: ['p1'] });
    expect(lockKeys).toEqual([`lot-registry:${T}`]);
  });

  it('deux activations simultanees au dernier lot libre (BLOCK) : une passe, l’autre est refusee', async () => {
    mockEntitlementsConfig = { quotaPolicy: 'BLOCK', enforcement: 'enforce', limits: { LOTS: 1 } };
    addProperty({ id: 'p1' });
    addProperty({ id: 'p2' });
    const results = await Promise.allSettled([sync({ propertyIds: ['p1'] }), sync({ propertyIds: ['p2'] })]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect(open()).toHaveLength(1);
  });

  it('temoin : SANS le verrou, les deux passent et depassent la limite', async () => {
    mockEntitlementsConfig = { quotaPolicy: 'BLOCK', enforcement: 'enforce', limits: { LOTS: 1 } };
    addProperty({ id: 'p1' });
    addProperty({ id: 'p2' });
    await Promise.allSettled([
      sync({ propertyIds: ['p1'] }, { alreadyLocked: true }),
      sync({ propertyIds: ['p2'] }, { alreadyLocked: true })
    ]);
    expect(open()).toHaveLength(2);
  });
});
