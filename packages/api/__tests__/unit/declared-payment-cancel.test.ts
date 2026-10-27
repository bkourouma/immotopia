/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 047, T021 : annulation d'une déclaration par son déclarant
 * (`lib/syndics/declared-payment/declaration-cancel.ts`, contrats §2.6).
 */

type Row = Record<string, any>;

const TENANT = 'tenant-a';
const LOT_1 = 'lot-1';
const LOT_2 = 'lot-2';

const store = { declarations: [] as Row[] };

const mockPrisma: Row = {
  syndicPaymentDeclaration: {
    findFirst: jest.fn(
      async ({ where }: Row) => store.declarations.find(r => r.id === where.id && r.tenantId === where.tenantId) ?? null
    ),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const found = store.declarations.filter(
        r => r.id === where.id && r.tenantId === where.tenantId && r.status === where.status
      );
      found.forEach(r => Object.assign(r, data));
      return { count: found.length };
    })
  }
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const auditEvents: Row[] = [];
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (entry: Row) => auditEvents.push(entry)
}));

import { cancelDeclaration } from '../../src/lib/syndics/declared-payment/declaration-cancel';
import { AuditActionKey } from '../../src/types/audit-types';

const scope = (over: Row = {}) => ({
  tenantId: TENANT,
  contactIds: ['contact-1'],
  lots: [],
  lotIds: [LOT_1, LOT_2],
  syndicateIds: ['syndic-1'],
  ...over
});

beforeEach(() => {
  store.declarations = [
    {
      id: 'decl-1',
      tenantId: TENANT,
      syndicateId: 'syndic-1',
      status: 'PENDING',
      amount: 30000,
      declaredByContactId: 'contact-1',
      lines: [
        { lotId: LOT_1, amount: 20000 },
        { lotId: LOT_2, amount: 10000 }
      ]
    }
  ];
  auditEvents.length = 0;
  mockPrisma.syndicPaymentDeclaration.updateMany.mockClear();
});

describe('cancelDeclaration', () => {
  it('annule une déclaration PENDING du déclarant et journalise les montants', async () => {
    await expect(cancelDeclaration({ scope: scope() as any, declarationId: 'decl-1' })).resolves.toEqual({
      declarationId: 'decl-1'
    });
    expect(store.declarations[0].status).toBe('CANCELED');
    expect(store.declarations[0].canceledAt).toBeInstanceOf(Date);
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      actionKey: AuditActionKey.SYNDIC_PAYMENT_DECLARATION_CANCELED,
      entityId: 'decl-1',
      tenantId: TENANT,
      payload: {
        amount: 30000,
        lines: [
          { lotId: LOT_1, amount: 20000 },
          { lotId: LOT_2, amount: 10000 }
        ]
      }
    });
  });

  it.each(['APPROVED', 'REJECTED', 'CANCELED'])(
    'répond 409 DECLARATION_NOT_PENDING si la déclaration est %s',
    async status => {
      store.declarations[0].status = status;
      await expect(cancelDeclaration({ scope: scope() as any, declarationId: 'decl-1' })).rejects.toMatchObject({
        statusCode: 409,
        code: 'DECLARATION_NOT_PENDING'
      });
      expect(store.declarations[0].status).toBe(status);
      expect(auditEvents).toHaveLength(0);
    }
  );

  it('répond 409 quand une validation concurrente passe entre la lecture et le claim', async () => {
    mockPrisma.syndicPaymentDeclaration.findFirst.mockImplementationOnce(async () => {
      const snapshot = { ...store.declarations[0] };
      store.declarations[0].status = 'APPROVED';
      return snapshot;
    });
    await expect(cancelDeclaration({ scope: scope() as any, declarationId: 'decl-1' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'DECLARATION_NOT_PENDING'
    });
  });

  it('répond 404 pour une déclaration faite par un autre contact', async () => {
    store.declarations[0].declaredByContactId = 'contact-2';
    await expect(cancelDeclaration({ scope: scope() as any, declarationId: 'decl-1' })).rejects.toMatchObject({
      statusCode: 404
    });
    expect(mockPrisma.syndicPaymentDeclaration.updateMany).not.toHaveBeenCalled();
  });

  it('répond 404 pour une déclaration saisie par un gestionnaire (sans contact déclarant)', async () => {
    store.declarations[0].declaredByContactId = null;
    await expect(cancelDeclaration({ scope: scope() as any, declarationId: 'decl-1' })).rejects.toMatchObject({
      statusCode: 404
    });
  });

  it('répond 404 si une ligne vise un lot hors du périmètre', async () => {
    await expect(
      cancelDeclaration({ scope: scope({ lotIds: [LOT_1] }) as any, declarationId: 'decl-1' })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(store.declarations[0].status).toBe('PENDING');
  });

  it("répond 404 pour une déclaration inexistante ou d'une autre agence", async () => {
    await expect(cancelDeclaration({ scope: scope() as any, declarationId: 'nope' })).rejects.toMatchObject({
      statusCode: 404
    });
    await expect(
      cancelDeclaration({ scope: scope({ tenantId: 'tenant-b' }) as any, declarationId: 'decl-1' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
