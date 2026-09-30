/**
 * BUG-2026-09-30-029 : le mandat de gestion tient le registre des lots dans
 * SA transaction (creation, resiliation), et un quota plein en enforce +
 * Bloquer annule le mandat sans ecriture partielle. Base simulee : un
 * `$transaction` qui restaure l'etat si le callback leve.
 */

import { QuotaExceededError } from '../../src/middleware/error-middleware';

type Row = Record<string, any>;

let mandates: Row[];
let activations: string[];
let syncImpl: (tx: any, tenantId: string, scope: Row, options?: Row) => Promise<unknown>;
const syncCalls: Array<{ tx: any; tenantId: string; scope: Row; options?: Row }> = [];

const property = { id: 'p1', ownershipType: 'CLIENT', tenantId: null, ownerUserId: 'owner-1', mandates: [] as Row[] };

function makeTx() {
  return {
    propertyMandate: {
      create: jest.fn(async ({ data }: Row) => {
        const row = { id: `m${mandates.length + 1}`, ...data };
        mandates.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: Row) => {
        const row = mandates.find(m => m.id === where.id)!;
        Object.assign(row, data);
        return row;
      })
    }
  };
}

jest.mock('../../src/utils/database', () => ({
  prisma: {
    property: { findFirst: jest.fn(async () => property) },
    // Bien sans agence : captable car son propriétaire est déjà client de l'agence.
    tenantClient: { findFirst: jest.fn(async () => ({ id: 'client-1' })) },
    rentalLease: { findFirst: jest.fn(async () => null) },
    propertyMandate: {
      findFirst: jest.fn(async ({ where }: Row) => {
        const m = mandates.find(x => x.id === where.id && x.tenantId === where.tenantId);
        return m ? { ...m, property } : null;
      })
    },
    $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => {
      const snapshot = { mandates: mandates.map(m => ({ ...m })), activations: [...activations] };
      try {
        return await fn(makeTx());
      } catch (error) {
        mandates = snapshot.mandates;
        activations = snapshot.activations;
        throw error;
      }
    })
  }
}));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/own-assets-barrier-service', () => ({
  assertThirdPartyAllowedForTenant: jest.fn(async () => undefined)
}));
jest.mock('../../src/services/lot-registry-service', () => ({
  syncLotActivationsTx: jest.fn((tx: any, tenantId: string, scope: Row, options?: Row) => {
    syncCalls.push({ tx, tenantId, scope, options });
    return syncImpl(tx, tenantId, scope, options);
  })
}));

import { createMandate, revokeMandate } from '../../src/services/property-mandate-service';

const T = 'tenant-1';

beforeEach(() => {
  mandates = [];
  activations = [];
  syncCalls.length = 0;
  syncImpl = async (_tx, _tenantId, scope) => {
    for (const id of scope.propertyIds) if (!activations.includes(`P:${id}`)) activations.push(`P:${id}`);
  };
});

describe('mandat de gestion et registre des lots', () => {
  it('la creation ouvre le lot dans la meme transaction (used +1 tout de suite)', async () => {
    const mandate = await createMandate(T, { propertyId: 'p1', startDate: new Date('2026-08-01') } as any, 'u1');
    expect(mandate.isActive).toBe(true);
    expect(activations).toEqual(['P:p1']);
    expect(syncCalls).toHaveLength(1);
    expect(syncCalls[0].tenantId).toBe(T);
    expect(syncCalls[0].scope).toEqual({ propertyIds: ['p1'] });
    // Le client de transaction (pas le client global) porte la synchro.
    expect(syncCalls[0].tx.propertyMandate).toBeDefined();
  });

  it('la resiliation ferme le lot (used -1)', async () => {
    await createMandate(T, { propertyId: 'p1', startDate: new Date('2026-08-01') } as any, 'u1');
    syncImpl = async (_tx, _t, scope) => {
      activations = activations.filter(k => !scope.propertyIds.map((id: string) => `P:${id}`).includes(k));
    };
    await revokeMandate('m1', T, 'u1');
    expect(mandates[0].isActive).toBe(false);
    expect(activations).toEqual([]);
    expect(syncCalls[1].options).toMatchObject({ reason: 'MANDATE_REVOKED' });
  });

  it('quota plein (enforce + Bloquer) : 409 type et aucun mandat ecrit', async () => {
    syncImpl = async () => {
      throw new QuotaExceededError({ capacityKey: 'LOTS', limit: 3, used: 3, requested: 1 });
    };
    const failure = await createMandate(T, { propertyId: 'p1', startDate: new Date() } as any, 'u1').catch(e => e);
    expect(failure).toBeInstanceOf(QuotaExceededError);
    expect(failure.statusCode).toBe(409);
    expect(mandates).toEqual([]);
    expect(activations).toEqual([]);
  });

  it('un mandat d’une autre agence est introuvable a la resiliation (aucune synchro)', async () => {
    await createMandate(T, { propertyId: 'p1', startDate: new Date() } as any, 'u1');
    syncCalls.length = 0;
    await expect(revokeMandate('m1', 'tenant-2', 'u2')).rejects.toThrow();
    expect(syncCalls).toHaveLength(0);
    expect(mandates[0].isActive).toBe(true);
  });
});
