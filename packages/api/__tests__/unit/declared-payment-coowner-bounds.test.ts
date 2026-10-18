/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Portail copropriétaire : borne de visibilité des déclarations de paiement
 * (`CoOwnerLotScope.visibleSince`). Un lot qui a changé de propriétaire ne
 * montre au nouveau que les déclarations créées à la borne ou après ; les
 * déclarations de l'ancien propriétaire restent à la gestion.
 */

import { createDeclaredFakeDb } from '../helpers/declared-payment-fake-db';

const mockDb = createDeclaredFakeDb();
jest.mock('../../src/utils/database', () => ({ prisma: mockDb }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

import {
  getCoOwnerDeclaration,
  listCoOwnerDeclarations,
  lotBounds,
  pendingDeclarationsByCall
} from '../../src/lib/syndics/declared-payment/declaration-queries';
import { cancelDeclaration } from '../../src/lib/syndics/declared-payment/declaration-cancel';
import { NotFoundError } from '../../src/middleware/error-middleware';

type Row = Record<string, any>;

const TENANT = 'tenant-a';
const SYNDIC = 'syndic-1';
const LOT_1 = 'lot-1';
const LOT_2 = 'lot-2';
const LOT_3 = 'lot-3';
const CONTACT = 'contact-1';
const BOUND = new Date('2026-06-01T00:00:00.000Z');
const BEFORE = new Date('2026-05-31T23:59:59.999Z');
const AFTER = new Date('2026-06-01T00:00:01.000Z');

function line(id: string, lotId: string): Row {
  return {
    id,
    lotId,
    amount: 50000,
    acceptedAmount: null,
    chargeCallIds: [],
    chargePaymentId: null,
    createdAt: BEFORE,
    lot: { id: lotId, lotNumber: lotId.replace('lot-', 'N°') }
  };
}

function declaration(id: string, createdAt: Date, lotIds: string[], over: Row = {}): Row {
  return {
    id,
    tenantId: TENANT,
    syndicateId: SYNDIC,
    receivingOperator: 'ORANGE',
    receivingPhone: '+2250707070707',
    receivingHolderName: 'Syndic Palmiers',
    declaredByContactId: CONTACT,
    payerPhone: '+2250505050505',
    amount: 50000 * lotIds.length,
    acceptedAmount: null,
    paidAt: createdAt,
    transactionReference: `REF-${id}`,
    rejectReason: null,
    reviewNote: null,
    reviewedAt: null,
    status: 'PENDING',
    createdAt,
    lines: lotIds.map(lotId => line(`${id}-${lotId}`, lotId)),
    ...over
  };
}

function lotScope(lotId: string, visibleSince: Date | null): Row {
  return { lotId, syndicateId: SYNDIC, contactId: CONTACT, ownershipPercentage: 100, ownedSince: BOUND, visibleSince };
}

function scope(over: Row = {}): any {
  return {
    tenantId: TENANT,
    contactIds: [CONTACT],
    lots: [lotScope(LOT_1, null), lotScope(LOT_2, BOUND)],
    lotIds: [LOT_1, LOT_2],
    syndicateIds: [SYNDIC],
    ...over
  };
}

const ids = (items: Array<{ id: string }>) => items.map(item => item.id);

beforeEach(() => {
  mockDb.reset();
  mockDb.syndicate.rows.push({ id: SYNDIC, tenantId: TENANT, name: 'Résidence Les Palmiers' });
  mockDb.syndicPaymentDeclaration.rows.push(
    declaration('free-old', new Date('2020-01-01T00:00:00.000Z'), [LOT_1]),
    declaration('free-new', AFTER, [LOT_1]),
    declaration('bounded-before', BEFORE, [LOT_2]),
    declaration('bounded-at', BOUND, [LOT_2]),
    declaration('bounded-after', AFTER, [LOT_2]),
    // Multi-lots : le lot borné a été déclaré avant sa borne, le lot libre ne sauve rien.
    declaration('multi-before', BEFORE, [LOT_1, LOT_2]),
    declaration('multi-after', AFTER, [LOT_1, LOT_2]),
    declaration('foreign-lot', AFTER, [LOT_3]),
    declaration('foreign-tenant', AFTER, [LOT_1], { tenantId: 'tenant-b' }),
    declaration('no-line', AFTER, [])
  );
});

describe('portail : borne de visibilité des déclarations', () => {
  it('liste : une déclaration antérieure à la borne d’un lot borné disparaît, le total suit', async () => {
    const result = await listCoOwnerDeclarations(scope(), {});
    expect(ids(result.items).sort()).toEqual(['bounded-after', 'bounded-at', 'free-new', 'free-old', 'multi-after']);
    expect(result.pagination.total).toBe(5);
  });

  it('liste : la pagination compte seulement les déclarations visibles', async () => {
    const page2 = await listCoOwnerDeclarations(scope(), { limit: 2, page: 2 });
    expect(page2.pagination).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
    expect(page2.items).toHaveLength(2);
  });

  it('liste : sans borne (visibleSince nul), les déclarations anciennes et récentes sont visibles', async () => {
    const open = scope({ lots: [lotScope(LOT_1, null), lotScope(LOT_2, null)] });
    const result = await listCoOwnerDeclarations(open, {});
    expect(ids(result.items).sort()).toEqual([
      'bounded-after',
      'bounded-at',
      'bounded-before',
      'free-new',
      'free-old',
      'multi-after',
      'multi-before'
    ]);
    expect(result.pagination.total).toBe(7);
  });

  it('détail : visible sans borne, à la borne exacte et après', async () => {
    for (const id of ['free-old', 'free-new', 'bounded-at', 'bounded-after', 'multi-after']) {
      expect((await getCoOwnerDeclaration(scope(), id)).id).toBe(id);
    }
  });

  it('détail : 404 uniforme, identique à une déclaration inexistante, avant la borne', async () => {
    const missing = await getCoOwnerDeclaration(scope(), 'nope').catch(error => error);
    for (const id of ['bounded-before', 'multi-before']) {
      const error = await getCoOwnerDeclaration(scope(), id).catch(caught => caught);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe('Déclaration introuvable.');
      expect(error.message).toBe(missing.message);
      expect(error.statusCode).toBe(missing.statusCode);
    }
  });

  it('isolation : autre agence, lot hors périmètre et déclaration sans ligne restent invisibles', async () => {
    const list = ids((await listCoOwnerDeclarations(scope(), {})).items);
    for (const id of ['foreign-lot', 'foreign-tenant', 'no-line']) {
      expect(list).not.toContain(id);
      await expect(getCoOwnerDeclaration(scope(), id)).rejects.toBeInstanceOf(NotFoundError);
    }
  });

  it('le where SQL porte la borne par lot (pas seulement le filtre en mémoire)', async () => {
    await listCoOwnerDeclarations(scope(), {});
    const where = mockDb.syndicPaymentDeclaration.count.mock.calls[0][0].where;
    expect(where.lines.every.OR).toEqual([
      { lotId: { in: [LOT_1] } },
      { lotId: LOT_2, declaration: { createdAt: { gte: BOUND } } }
    ]);
  });

  it('deuxième garde en mémoire : une déclaration antérieure renvoyée par une base fautive est écartée', async () => {
    // Filtre SQL neutralisé : la base renvoie tout, seul le filtre en mémoire protège.
    mockDb.syndicPaymentDeclaration.findMany.mockImplementationOnce(async () =>
      mockDb.syndicPaymentDeclaration.rows
        .filter(
          (row: Row) => row.tenantId === TENANT && ['bounded-before', 'multi-before', 'free-new'].includes(row.id)
        )
        .map((row: Row) => ({ ...row }))
    );
    const result = await listCoOwnerDeclarations(scope(), {});
    expect(ids(result.items)).toEqual(['free-new']);
  });

  it('annulation : refusée (404 uniforme) avant la borne, permise sans borne et à partir de la borne', async () => {
    for (const id of ['bounded-before', 'multi-before']) {
      const error = await cancelDeclaration({ scope: scope(), declarationId: id }).catch(caught => caught);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(mockDb.syndicPaymentDeclaration.rows.find((row: Row) => row.id === id)?.status).toBe('PENDING');
    }
    // La base en mémoire n'offre pas updateMany : on pose le claim atomique à la main.
    mockDb.syndicPaymentDeclaration.updateMany = jest.fn(async ({ where, data }: any) => {
      const row = mockDb.syndicPaymentDeclaration.rows.find((r: Row) => r.id === where.id && r.status === where.status);
      if (row) Object.assign(row, data);
      return { count: row ? 1 : 0 };
    });
    for (const id of ['free-old', 'bounded-at']) {
      await expect(cancelDeclaration({ scope: scope(), declarationId: id })).resolves.toEqual({ declarationId: id });
      expect(mockDb.syndicPaymentDeclaration.rows.find((row: Row) => row.id === id)?.status).toBe('CANCELED');
    }
  });

  it('multi-lots : un lot borné antérieur à sa borne et un lot libre rendent la déclaration invisible partout', async () => {
    const result = await listCoOwnerDeclarations(scope(), {});
    expect(ids(result.items)).not.toContain('multi-before');
    expect(ids(result.items)).toContain('multi-after');
    await expect(getCoOwnerDeclaration(scope(), 'multi-before')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('déclarations en attente par appel : celle de l’ancien propriétaire est ignorée avec la borne, vue sans borne', async () => {
    const rows = mockDb.syndicPaymentDeclaration.rows as Row[];
    for (const row of rows) for (const l of row.lines) l.chargeCallIds = ['call-' + row.id];

    const bounded = await pendingDeclarationsByCall(TENANT, [LOT_1, LOT_2], undefined, lotBounds(scope()));
    expect(bounded.has('call-bounded-before')).toBe(false);
    expect(bounded.has('call-multi-before')).toBe(false);
    expect(bounded.has('call-bounded-at')).toBe(true);
    expect(bounded.has('call-multi-after')).toBe(true);
    expect(bounded.has('call-free-old')).toBe(true);

    const unbounded = await pendingDeclarationsByCall(TENANT, [LOT_1, LOT_2]);
    expect(unbounded.has('call-bounded-before')).toBe(true);
    expect(unbounded.has('call-multi-before')).toBe(true);
  });
});
