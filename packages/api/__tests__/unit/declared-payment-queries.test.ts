/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 047, T024 : lectures des déclarations de paiement
 * (`lib/syndics/declared-payment/declaration-queries.ts`) : liste et détail
 * gestionnaire, vues du portail copropriétaire, appels visés par une
 * déclaration en attente.
 */

import { createDeclaredFakeDb } from '../helpers/declared-payment-fake-db';

const mockDb = createDeclaredFakeDb();
jest.mock('../../src/utils/database', () => ({ prisma: mockDb }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

import {
  getCoOwnerDeclaration,
  getDeclarationDetail,
  listCoOwnerDeclarations,
  listDeclarations,
  pendingDeclarationsByCall
} from '../../src/lib/syndics/declared-payment/declaration-queries';
import { BadRequestError, NotFoundError } from '../../src/middleware/error-middleware';

type Row = Record<string, any>;

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const SYNDIC = 'syndic-1';
const OTHER_SYNDIC = 'syndic-2';
const LOT_1 = 'lot-1';
const LOT_2 = 'lot-2';
const LOT_3 = 'lot-3';
const CONTACT = 'contact-1';
// Jeudi 15 octobre 2026 : une déclaration du lundi 12 a 3 jours ouvrés (délai par défaut).
const NOW = new Date('2026-10-15T09:00:00.000Z');
const SECRET_HASH = '$2b$10$SECRET-HASH-DO-NOT-LEAK';

function iso(day: string) {
  return new Date(`${day}Z`);
}

function declaration(id: string, over: Row = {}): Row {
  return {
    id,
    tenantId: TENANT,
    syndicateId: SYNDIC,
    receivingNumberId: 'num-1',
    receivingOperator: 'ORANGE',
    receivingPhone: '+2250707070707',
    receivingHolderName: 'Syndic Palmiers',
    declaredByContactId: CONTACT,
    declaredByUserId: null,
    payerPhone: '+2250505050505',
    amount: 50000,
    acceptedAmount: null,
    paidAt: iso('2026-10-14T08:00:00.000'),
    acceptedPaidAt: null,
    transactionReference: `REF-${id}`,
    comment: null,
    proofFileUrl: null,
    aiPrefill: null,
    aiEditedFields: [],
    status: 'PENDING',
    rejectReason: null,
    reviewNote: null,
    reviewedByUserId: null,
    reviewedAt: null,
    canceledAt: null,
    createdAt: iso('2026-10-14T08:00:00.000'),
    lines: [
      {
        id: `${id}-l1`,
        lotId: LOT_1,
        amount: 50000,
        acceptedAmount: null,
        chargeCallIds: ['call-1'],
        chargePaymentId: null,
        createdAt: iso('2026-10-14T08:00:00.000'),
        lot: { id: LOT_1, lotNumber: 'A-101' }
      }
    ],
    ...over
  };
}

function lineOf(id: string, lotId: string, over: Row = {}): Row {
  return {
    id,
    lotId,
    amount: 50000,
    acceptedAmount: null,
    chargeCallIds: [],
    chargePaymentId: null,
    createdAt: iso('2026-10-14T08:00:00.000'),
    lot: { id: lotId, lotNumber: lotId.replace('lot-', 'N°') },
    ...over
  };
}

function scope(over: Row = {}): any {
  return {
    tenantId: TENANT,
    contactIds: [CONTACT],
    lots: [],
    lotIds: [LOT_1, LOT_2],
    syndicateIds: [SYNDIC],
    ...over
  };
}

const ids = (items: Array<{ id: string }>) => items.map(item => item.id);

beforeEach(() => {
  mockDb.reset();
  mockDb.syndicate.rows.push(
    { id: SYNDIC, tenantId: TENANT, name: 'Résidence Les Palmiers' },
    { id: OTHER_SYNDIC, tenantId: OTHER_TENANT, name: 'Autre résidence' }
  );
  mockDb.chargeCall.rows.push(
    {
      id: 'call-1',
      lotId: LOT_1,
      syndicateId: SYNDIC,
      period: '2026-T1',
      amount: 50000,
      status: 'PENDING',
      dueDate: new Date('2026-01-31'),
      createdAt: new Date('2026-01-01')
    },
    {
      id: 'call-2',
      lotId: LOT_1,
      syndicateId: SYNDIC,
      period: '2026-T2',
      amount: 30000,
      status: 'PENDING',
      dueDate: new Date('2026-04-30'),
      createdAt: new Date('2026-04-01')
    }
  );
  mockDb.lotOwnerProfile.rows.push({
    lotId: LOT_1,
    contactId: CONTACT,
    isActive: true,
    ownedSince: new Date('2020-01-01'),
    ownedUntil: null
  });
  mockDb.crmContact.rows.push({
    id: CONTACT,
    tenantId: TENANT,
    firstName: 'Awa',
    lastName: 'Koné',
    legalName: null,
    passwordHash: SECRET_HASH
  });
  mockDb.user.rows.push({
    id: 'user-1',
    fullName: 'Marc Gestionnaire',
    email: 'marc@agence.test',
    passwordHash: SECRET_HASH
  });
});

// ---------------------------------------------------------------------------
// Liste gestionnaire
// ---------------------------------------------------------------------------

describe('listDeclarations : tri, compteurs, pagination', () => {
  function seedPending() {
    mockDb.syndicPaymentDeclaration.rows.push(
      // Plain, créée le mardi.
      declaration('A', {
        createdAt: iso('2026-10-13T08:00:00.000'),
        amount: 11000,
        paidAt: iso('2026-10-10T08:00:00.000')
      }),
      // En retard : créée le lundi 12 (3 jours ouvrés au jeudi 15).
      declaration('B', {
        createdAt: iso('2026-10-12T08:00:00.000'),
        amount: 12000,
        paidAt: iso('2026-10-09T08:00:00.000')
      }),
      // Doublon probable C/D : même numéro, montant, payeur, 2 minutes d'écart, références différentes.
      declaration('C', { createdAt: iso('2026-10-14T09:00:00.000'), amount: 20000, payerPhone: '+2250101010101' }),
      declaration('D', {
        createdAt: iso('2026-10-14T09:30:00.000'),
        amount: 20000,
        payerPhone: '+2250101010101',
        paidAt: iso('2026-10-14T08:02:00.000')
      }),
      // Plain, créée le mardi après A.
      declaration('E', {
        createdAt: iso('2026-10-13T10:00:00.000'),
        amount: 13000,
        paidAt: iso('2026-10-11T08:00:00.000')
      })
    );
  }

  it('statut PENDING par défaut : en retard, puis doublons suspectés, puis ancienneté', async () => {
    seedPending();
    mockDb.syndicPaymentDeclaration.rows.push(declaration('X-approved', { status: 'APPROVED', reviewedAt: NOW }));
    const result = await listDeclarations({ tenantId: TENANT, syndicateId: SYNDIC, now: NOW });
    expect(ids(result.items)).toEqual(['B', 'C', 'D', 'A', 'E']);
    expect(result.counts).toEqual({ pending: 5, overdue: 1, suspectedDuplicate: 2 });
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 5, totalPages: 1 });
    expect(result.items[0].overdue).toBe(true);
    expect(result.items[3].overdue).toBe(false);
  });

  it('un doublon avec une déclaration déjà APPROVED compte dans suspectedDuplicate', async () => {
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('P', { createdAt: iso('2026-10-14T09:00:00.000'), amount: 20000 }),
      declaration('Done', {
        status: 'APPROVED',
        amount: 20000,
        reviewedAt: NOW,
        createdAt: iso('2026-10-14T07:00:00.000')
      })
    );
    const result = await listDeclarations({ tenantId: TENANT, syndicateId: SYNDIC, now: NOW });
    expect(result.counts).toEqual({ pending: 1, overdue: 0, suspectedDuplicate: 1 });
  });

  it('une référence déjà portée par un paiement enregistré rend la déclaration suspecte : drapeau, compteur et tri', async () => {
    seedPending();
    // « A » reprend la référence d’une saisie manuelle antérieure de la copropriété.
    const ref = mockDb.syndicPaymentDeclaration.rows.find((row: any) => row.id === 'A')!.transactionReference;
    mockDb.chargePayment.rows.push(
      { id: 'pay-manual', reference: ref.toLowerCase(), paidAt: NOW, amount: 11000, lot: { syndicateId: SYNDIC } },
      { id: 'pay-foreign', reference: 'AUTRE', paidAt: NOW, amount: 1, lot: { syndicateId: SYNDIC } },
      { id: 'pay-other-syndic', reference: ref, paidAt: NOW, amount: 1, lot: { syndicateId: OTHER_SYNDIC } }
    );
    const result = await listDeclarations({ tenantId: TENANT, syndicateId: SYNDIC, now: NOW });
    // En retard d’abord (B), puis les suspectes (A par la référence, C et D par doublon), puis l’ancienneté.
    expect(ids(result.items)).toEqual(['B', 'A', 'C', 'D', 'E']);
    expect(result.counts).toEqual({ pending: 5, overdue: 1, suspectedDuplicate: 3 });
  });

  it('un paiement enregistré dans une AUTRE copropriété ne rend rien suspect', async () => {
    seedPending();
    const ref = mockDb.syndicPaymentDeclaration.rows.find((row: any) => row.id === 'A')!.transactionReference;
    mockDb.chargePayment.rows.push({
      id: 'pay-other',
      reference: ref,
      paidAt: NOW,
      amount: 1,
      lot: { syndicateId: OTHER_SYNDIC }
    });
    const result = await listDeclarations({ tenantId: TENANT, syndicateId: SYNDIC, now: NOW });
    expect(result.counts.suspectedDuplicate).toBe(2);
  });

  it('les compteurs portent sur toute la copropriété, pas sur la page ni sur les filtres', async () => {
    seedPending();
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('Other-lot', {
        createdAt: iso('2026-10-14T11:00:00.000'),
        amount: 14000,
        lines: [lineOf('ol1', LOT_2)]
      }),
      declaration('Other-syndic', { syndicateId: OTHER_SYNDIC, tenantId: OTHER_TENANT }),
      declaration('Other-tenant-same-syndic', { tenantId: OTHER_TENANT })
    );
    const filtered = await listDeclarations({ tenantId: TENANT, syndicateId: SYNDIC, lotId: LOT_2, now: NOW });
    expect(ids(filtered.items)).toEqual(['Other-lot']);
    expect(filtered.counts).toEqual({ pending: 6, overdue: 1, suspectedDuplicate: 2 });

    const paged = await listDeclarations({ tenantId: TENANT, syndicateId: SYNDIC, limit: 2, page: 2, now: NOW });
    expect(ids(paged.items)).toEqual(['D', 'A']);
    expect(paged.pagination).toEqual({ page: 2, limit: 2, total: 6, totalPages: 3 });
    expect(paged.counts.pending).toBe(6);
  });

  it('plafonne la limite à 100 et prend 20 par défaut', async () => {
    const big = await listDeclarations({ tenantId: TENANT, syndicateId: SYNDIC, limit: 500, now: NOW });
    expect(big.pagination.limit).toBe(100);
    const def = await listDeclarations({ tenantId: TENANT, syndicateId: SYNDIC, now: NOW });
    expect(def.pagination).toEqual({ page: 1, limit: 20, total: 0, totalPages: 1 });
    const low = await listDeclarations({ tenantId: TENANT, syndicateId: SYNDIC, limit: 0, page: -3, now: NOW });
    expect(low.pagination.limit).toBe(20);
    expect(low.pagination.page).toBe(1);
  });
});

describe('listDeclarations : filtres', () => {
  beforeEach(() => {
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('P1', { receivingNumberId: 'num-1', paidAt: iso('2026-10-10T23:59:59.000'), amount: 11000 }),
      declaration('P2', { receivingNumberId: 'num-2', paidAt: iso('2026-10-11T00:00:00.000'), amount: 12000 }),
      declaration('P3', {
        receivingNumberId: 'num-1',
        paidAt: iso('2026-10-12T12:00:00.000'),
        amount: 13000,
        createdAt: iso('2026-10-12T09:00:00.000'),
        lines: [lineOf('p3l', LOT_2)]
      }),
      declaration('A1', {
        status: 'APPROVED',
        reviewedAt: iso('2026-10-14T10:00:00.000'),
        receivingNumberId: 'num-2',
        amount: 14000,
        paidAt: iso('2026-10-10T08:00:00.000')
      })
    );
  });

  const list = (over: Row = {}) => listDeclarations({ tenantId: TENANT, syndicateId: SYNDIC, now: NOW, ...over });

  it('receivingNumberId', async () => {
    expect(ids((await list({ receivingNumberId: 'num-2' })).items)).toEqual(['P2']);
  });

  it('lotId, sur les lignes', async () => {
    expect(ids((await list({ lotId: LOT_2 })).items)).toEqual(['P3']);
    expect(ids((await list({ lotId: LOT_2, status: 'APPROVED' })).items)).toEqual([]);
  });

  it('from et to : bornes incluses sur paidAt, jours entiers', async () => {
    expect(ids((await list({ from: '2026-10-11', to: '2026-10-12' })).items).sort()).toEqual(['P2', 'P3']);
    expect(ids((await list({ to: '2026-10-10' })).items)).toEqual(['P1']);
    expect(ids((await list({ from: '2026-10-12', to: '2026-10-12' })).items)).toEqual(['P3']);
    expect(ids((await list({ from: '2026-10-10', to: '2026-10-10', status: 'APPROVED' })).items)).toEqual(['A1']);
  });

  it('overdue=true ne garde que les PENDING en retard', async () => {
    const result = await list({ overdue: true });
    expect(ids(result.items)).toEqual(['P3']);
    expect(result.items[0].alerts.some(alert => alert.kind === 'OVERDUE')).toBe(true);
    expect(result.counts.overdue).toBe(1);
  });

  it('overdue=true avec un statut non PENDING ne renvoie rien', async () => {
    const result = await list({ overdue: true, status: 'APPROVED' });
    expect(result.items).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it('une date mal formée est refusée (400)', async () => {
    await expect(list({ from: '12/10/2026' })).rejects.toBeInstanceOf(BadRequestError);
    await expect(list({ to: '2026-13-45' })).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe('listDeclarations : autres statuts et ALL', () => {
  beforeEach(() => {
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('P1', { createdAt: iso('2026-10-14T08:00:00.000'), amount: 11000 }),
      declaration('P2', { createdAt: iso('2026-10-14T09:00:00.000'), amount: 12000 }),
      declaration('OLD', { status: 'APPROVED', reviewedAt: iso('2026-10-10T10:00:00.000'), amount: 13000 }),
      declaration('NEW', { status: 'APPROVED', reviewedAt: iso('2026-10-14T10:00:00.000'), amount: 14000 }),
      declaration('REJ', {
        status: 'REJECTED',
        rejectReason: 'NOT_FOUND',
        reviewNote: 'Aucun paiement trouvé.',
        reviewedAt: iso('2026-10-12T10:00:00.000'),
        reviewedByUserId: 'user-1',
        amount: 15000
      }),
      declaration('CAN', { status: 'CANCELED', canceledAt: iso('2026-10-13T10:00:00.000'), amount: 16000 })
    );
  });

  it('un statut terminé : reviewedAt décroissant, les annulées (sans reviewedAt) à la suite', async () => {
    const approved = await listDeclarations({ tenantId: TENANT, syndicateId: SYNDIC, status: 'APPROVED', now: NOW });
    expect(ids(approved.items)).toEqual(['NEW', 'OLD']);
    expect(approved.counts.pending).toBe(2);
    const rejected = await listDeclarations({ tenantId: TENANT, syndicateId: SYNDIC, status: 'REJECTED', now: NOW });
    expect(rejected.items[0]).toMatchObject({
      id: 'REJ',
      status: 'REJECTED',
      rejectReason: 'NOT_FOUND',
      reviewNote: 'Aucun paiement trouvé.',
      reviewedByName: 'Marc Gestionnaire',
      alerts: [],
      overdue: false
    });
  });

  it('ALL : les PENDING d’abord, puis les autres par reviewedAt décroissant', async () => {
    const all = await listDeclarations({ tenantId: TENANT, syndicateId: SYNDIC, status: 'ALL', now: NOW });
    expect(ids(all.items)).toEqual(['P1', 'P2', 'NEW', 'REJ', 'OLD', 'CAN']);
    expect(all.pagination.total).toBe(6);
  });

  it('ALL paginé : une page peut enjamber la frontière PENDING / autres', async () => {
    const page1 = await listDeclarations({ tenantId: TENANT, syndicateId: SYNDIC, status: 'ALL', limit: 3, now: NOW });
    const page2 = await listDeclarations({
      tenantId: TENANT,
      syndicateId: SYNDIC,
      status: 'ALL',
      limit: 3,
      page: 2,
      now: NOW
    });
    expect(ids(page1.items)).toEqual(['P1', 'P2', 'NEW']);
    expect(ids(page2.items)).toEqual(['REJ', 'OLD', 'CAN']);
    expect(page2.pagination).toEqual({ page: 2, limit: 3, total: 6, totalPages: 2 });
    const page3 = await listDeclarations({
      tenantId: TENANT,
      syndicateId: SYNDIC,
      status: 'ALL',
      limit: 4,
      page: 2,
      now: NOW
    });
    expect(ids(page3.items)).toEqual(['OLD', 'CAN']);
  });
});

describe('listDeclarations : isolation', () => {
  it('404 pour une copropriété d’une autre agence ou inexistante', async () => {
    await expect(listDeclarations({ tenantId: TENANT, syndicateId: OTHER_SYNDIC, now: NOW })).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(listDeclarations({ tenantId: TENANT, syndicateId: 'nope', now: NOW })).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('ne renvoie jamais une déclaration d’une autre agence, même sur le même identifiant de copropriété', async () => {
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('mine'),
      declaration('theirs', { tenantId: OTHER_TENANT }),
      declaration('theirs-approved', { tenantId: OTHER_TENANT, status: 'APPROVED', reviewedAt: NOW })
    );
    const pending = await listDeclarations({ tenantId: TENANT, syndicateId: SYNDIC, status: 'ALL', now: NOW });
    expect(ids(pending.items)).toEqual(['mine']);
    expect(pending.counts.pending).toBe(1);
  });
});

describe('forme des lignes gestionnaire', () => {
  it('declaredBy : copropriétaire par son nom, gestionnaire par le nom de l’utilisateur', async () => {
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('by-coowner', { createdAt: iso('2026-10-14T08:00:00.000'), amount: 11000 }),
      declaration('by-manager', {
        createdAt: iso('2026-10-14T09:00:00.000'),
        amount: 12000,
        declaredByContactId: null,
        declaredByUserId: 'user-1'
      }),
      declaration('by-unknown-manager', {
        createdAt: iso('2026-10-14T10:00:00.000'),
        amount: 13000,
        declaredByContactId: null,
        declaredByUserId: 'user-missing'
      })
    );
    const result = await listDeclarations({ tenantId: TENANT, syndicateId: SYNDIC, now: NOW });
    const byId = new Map(result.items.map(item => [item.id, item]));
    expect(byId.get('by-coowner')!.declaredBy).toEqual({ type: 'COOWNER', contactId: CONTACT, name: 'Awa Koné' });
    expect(byId.get('by-manager')!.declaredBy).toEqual({
      type: 'MANAGER',
      userId: 'user-1',
      name: 'Marc Gestionnaire'
    });
    expect(byId.get('by-unknown-manager')!.declaredBy).toMatchObject({ type: 'MANAGER', userId: 'user-missing' });
  });

  it('aucune sortie ne contient de passwordHash, d’e-mail ni de chemin de capture', async () => {
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('P', {
        declaredByContactId: null,
        declaredByUserId: 'user-1',
        proofFileUrl: 'uploads/syndics/payment-proofs/tenant-a/syndic-1/secret.png',
        aiPrefill: { recipientPhone: '0101010101' },
        reviewedByUserId: 'user-1'
      }),
      declaration('Q', { status: 'APPROVED', reviewedAt: NOW, reviewedByUserId: 'user-1', amount: 12345 })
    );
    const all = await listDeclarations({ tenantId: TENANT, syndicateId: SYNDIC, status: 'ALL', now: NOW });
    const json = JSON.stringify(all);
    expect(json).not.toContain('passwordHash');
    expect(json).not.toContain(SECRET_HASH);
    expect(json).not.toContain('marc@agence.test');
    expect(json).not.toContain('payment-proofs');
    expect(json).not.toContain('"aiPrefill"');
    const pending = all.items.find(item => item.id === 'P')!;
    expect(pending.hasProof).toBe(true);
    expect(pending.aiPrefilled).toBe(true);
    // Le contrôle couvre aussi les requêtes : aucun `include`, jamais d'objet complet.
    for (const call of [...mockDb.user.findMany.mock.calls, ...mockDb.crmContact.findMany.mock.calls]) {
      expect(call[0].include).toBeUndefined();
      expect(call[0].select).toBeDefined();
    }
    for (const call of mockDb.syndicPaymentDeclaration.findMany.mock.calls) {
      expect(call[0].include).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Détail gestionnaire
// ---------------------------------------------------------------------------

describe('getDeclarationDetail', () => {
  it('renvoie les alertes complètes et le reste dû ACTUEL de chaque appel visé', async () => {
    mockDb.chargePaymentAllocation.rows.push({ chargeCallId: 'call-1', amount: 20000 });
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('D1', {
        createdAt: iso('2026-10-12T08:00:00.000'),
        aiEditedFields: ['amount'],
        aiPrefill: { recipientPhone: '0101010101' },
        proofFileUrl: 'uploads/x.png'
      })
    );
    const detail = await getDeclarationDetail(TENANT, SYNDIC, 'D1', NOW);
    expect(detail.lines[0].chargeCalls).toEqual([{ id: 'call-1', period: '2026-T1', remainingDue: 30000 }]);
    expect(detail.lines[0].lot).toEqual({ id: LOT_1, lotNumber: 'A-101' });
    expect(detail.alerts.map(alert => alert.kind)).toEqual([
      'EXCESS',
      'AI_FIELDS_EDITED',
      'RECIPIENT_MISMATCH',
      'OVERDUE'
    ]);
    expect(detail).toMatchObject({
      id: 'D1',
      status: 'PENDING',
      overdue: true,
      hasProof: true,
      aiPrefilled: true,
      aiEditedFields: ['amount'],
      amount: 50000,
      acceptedAmount: null,
      receivingNumber: {
        id: 'num-1',
        operator: 'ORANGE',
        phoneNumber: '+2250707070707',
        holderName: 'Syndic Palmiers'
      },
      paidAt: '2026-10-14T08:00:00.000Z',
      createdAt: '2026-10-12T08:00:00.000Z',
      reviewedByName: null
    });
    expect(JSON.stringify(detail)).not.toContain('uploads/x.png');
  });

  it('sans appel précisé, montre les appels ouverts que la validation toucherait', async () => {
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('D2', { lines: [lineOf('l', LOT_1, { amount: 60000 })], amount: 60000 })
    );
    const detail = await getDeclarationDetail(TENANT, SYNDIC, 'D2', NOW);
    expect(detail.lines[0].chargeCalls.map(call => call.id)).toEqual(['call-1', 'call-2']);
  });

  it('déclaration validée : documents émis, montant retenu, relecteur ; pas d’alerte de décision', async () => {
    mockDb.chargePayment.rows.push({
      id: 'pay-1',
      createdAt: iso('2026-10-14T10:00:00.000'),
      allocations: [{ chargeCallId: 'call-1' }]
    });
    mockDb.syndicChargeReceipt.rows.push(
      {
        id: 'doc-r',
        tenantId: TENANT,
        kind: 'RECEIPT',
        number: 'R-2026-000001',
        chargePaymentId: 'pay-1',
        chargeCallId: null,
        issuedAt: iso('2026-10-14T10:00:01.000')
      },
      {
        id: 'doc-q',
        tenantId: TENANT,
        kind: 'QUITTANCE',
        number: 'Q-2026-000001',
        chargePaymentId: null,
        chargeCallId: 'call-1',
        issuedAt: iso('2026-10-14T10:00:01.000')
      },
      // Quittance du même appel émise longtemps après : un autre paiement l'a soldé.
      {
        id: 'doc-late',
        tenantId: TENANT,
        kind: 'QUITTANCE',
        number: 'Q-2026-000009',
        chargePaymentId: null,
        chargeCallId: 'call-1',
        issuedAt: iso('2026-11-20T10:00:00.000')
      },
      // Quittance d'un appel que ce paiement n'a pas touché.
      {
        id: 'doc-other-call',
        tenantId: TENANT,
        kind: 'QUITTANCE',
        number: 'Q-2026-000002',
        chargePaymentId: null,
        chargeCallId: 'call-2',
        issuedAt: iso('2026-10-14T10:00:01.000')
      },
      // Document d'une autre agence portant le même paiement.
      {
        id: 'doc-foreign',
        tenantId: OTHER_TENANT,
        kind: 'RECEIPT',
        number: 'R-2026-000777',
        chargePaymentId: 'pay-1',
        chargeCallId: null,
        issuedAt: iso('2026-10-14T10:00:01.000')
      }
    );
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('D3', {
        status: 'APPROVED',
        acceptedAmount: 45000,
        acceptedPaidAt: iso('2026-10-13T08:00:00.000'),
        reviewedAt: iso('2026-10-14T10:00:02.000'),
        reviewedByUserId: 'user-1',
        reviewNote: 'Frais opérateur déduits.',
        lines: [lineOf('l3', LOT_1, { chargeCallIds: ['call-1'], chargePaymentId: 'pay-1', acceptedAmount: 45000 })]
      })
    );
    const detail = await getDeclarationDetail(TENANT, SYNDIC, 'D3', NOW);
    expect(detail.alerts).toEqual([]);
    expect(detail.acceptedAmount).toBe(45000);
    expect(detail.acceptedPaidAt).toBe('2026-10-13T08:00:00.000Z');
    expect(detail.reviewedByName).toBe('Marc Gestionnaire');
    expect(detail.lines[0]).toMatchObject({ chargePaymentId: 'pay-1', acceptedAmount: 45000 });
    expect(detail.lines[0].documents).toEqual([
      { id: 'doc-r', kind: 'RECEIPT', number: 'R-2026-000001' },
      { id: 'doc-q', kind: 'QUITTANCE', number: 'Q-2026-000001' }
    ]);
  });

  it('aucun document pour une ligne sans encaissement', async () => {
    mockDb.syndicPaymentDeclaration.rows.push(declaration('D4'));
    const detail = await getDeclarationDetail(TENANT, SYNDIC, 'D4', NOW);
    expect(detail.lines[0].documents).toEqual([]);
    expect(detail.lines[0].chargePaymentId).toBeNull();
  });

  it('404 pour une déclaration inexistante, d’une autre agence ou d’une autre copropriété', async () => {
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('mine'),
      declaration('foreign-tenant', { tenantId: OTHER_TENANT }),
      declaration('other-syndic', { syndicateId: OTHER_SYNDIC })
    );
    await expect(getDeclarationDetail(TENANT, SYNDIC, 'nope', NOW)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getDeclarationDetail(TENANT, SYNDIC, 'foreign-tenant', NOW)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getDeclarationDetail(TENANT, SYNDIC, 'other-syndic', NOW)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getDeclarationDetail(OTHER_TENANT, SYNDIC, 'mine', NOW)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('ne contient aucun passwordHash', async () => {
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('D5', {
        declaredByContactId: null,
        declaredByUserId: 'user-1',
        reviewedByUserId: 'user-1',
        status: 'APPROVED',
        reviewedAt: NOW
      })
    );
    const detail = await getDeclarationDetail(TENANT, SYNDIC, 'D5', NOW);
    expect(detail.declaredBy).toEqual({ type: 'MANAGER', userId: 'user-1', name: 'Marc Gestionnaire' });
    const json = JSON.stringify(detail);
    expect(json).not.toContain('passwordHash');
    expect(json).not.toContain(SECRET_HASH);
  });
});

// ---------------------------------------------------------------------------
// Portail copropriétaire
// ---------------------------------------------------------------------------

describe('portail copropriétaire', () => {
  beforeEach(() => {
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('mine', { createdAt: iso('2026-10-14T08:00:00.000'), comment: 'note interne du déclarant' }),
      declaration('two-lots', {
        createdAt: iso('2026-10-14T09:00:00.000'),
        amount: 70000,
        lines: [
          lineOf('tl1', LOT_1, { amount: 50000, chargeCallIds: ['call-1'] }),
          lineOf('tl2', LOT_2, { amount: 20000 })
        ]
      }),
      // Une ligne sur un lot hors périmètre : toute la déclaration est invisible.
      declaration('leaky', {
        createdAt: iso('2026-10-14T10:00:00.000'),
        amount: 70000,
        lines: [lineOf('lk1', LOT_1, { amount: 50000 }), lineOf('lk2', LOT_3, { amount: 20000 })]
      }),
      declaration('only-foreign-lot', { lines: [lineOf('fl', LOT_3)] }),
      declaration('foreign-tenant', { tenantId: OTHER_TENANT }),
      declaration('foreign-syndic', { syndicateId: OTHER_SYNDIC }),
      declaration('by-manager', {
        createdAt: iso('2026-10-13T08:00:00.000'),
        declaredByContactId: null,
        declaredByUserId: 'user-1'
      }),
      declaration('by-other-owner', { createdAt: iso('2026-10-13T09:00:00.000'), declaredByContactId: 'contact-2' }),
      declaration('rejected', {
        createdAt: iso('2026-10-12T08:00:00.000'),
        status: 'REJECTED',
        rejectReason: 'AMOUNT_MISMATCH',
        reviewNote: 'Le montant reçu est de 40 000 FCFA.',
        reviewedAt: iso('2026-10-13T08:00:00.000'),
        reviewedByUserId: 'user-1'
      })
    );
  });

  it('liste : seulement les déclarations dont TOUTES les lignes sont dans le périmètre, les plus récentes d’abord', async () => {
    const result = await listCoOwnerDeclarations(scope(), {});
    expect(ids(result.items)).toEqual(['two-lots', 'mine', 'by-other-owner', 'by-manager', 'rejected']);
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 5, totalPages: 1 });
    expect(ids(result.items)).not.toContain('leaky');
    expect(ids(result.items)).not.toContain('only-foreign-lot');
    expect(ids(result.items)).not.toContain('foreign-tenant');
    expect(ids(result.items)).not.toContain('foreign-syndic');
  });

  it('détail : 404 uniforme pour une déclaration hors périmètre', async () => {
    for (const hidden of ['leaky', 'only-foreign-lot', 'foreign-tenant', 'foreign-syndic', 'nope']) {
      await expect(getCoOwnerDeclaration(scope(), hidden)).rejects.toBeInstanceOf(NotFoundError);
    }
    await expect(getCoOwnerDeclaration(scope(), 'leaky')).rejects.toThrow('Déclaration introuvable.');
    const ok = await getCoOwnerDeclaration(scope(), 'two-lots');
    expect(ok.lines.map(line => line.lot.id)).toEqual([LOT_1, LOT_2]);
  });

  it('un périmètre sans lot ne voit rien', async () => {
    const empty = scope({ lotIds: [], syndicateIds: [], contactIds: [] });
    expect((await listCoOwnerDeclarations(empty, {})).items).toEqual([]);
    await expect(getCoOwnerDeclaration(empty, 'mine')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('un périmètre réduit à un lot exclut la déclaration qui en couvre deux', async () => {
    const narrow = scope({ lotIds: [LOT_1] });
    const result = await listCoOwnerDeclarations(narrow, {});
    expect(ids(result.items)).not.toContain('two-lots');
    await expect(getCoOwnerDeclaration(narrow, 'two-lots')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('canCancel : PENDING et déclarée par un contact du compte seulement', async () => {
    const result = await listCoOwnerDeclarations(scope(), {});
    const cancel = Object.fromEntries(result.items.map(item => [item.id, item.canCancel]));
    expect(cancel).toEqual({
      'two-lots': true,
      mine: true,
      'by-other-owner': false,
      'by-manager': false,
      rejected: false
    });
  });

  it('filtre par statut et plafonne la limite à 50', async () => {
    const rejected = await listCoOwnerDeclarations(scope(), { status: 'REJECTED' });
    expect(ids(rejected.items)).toEqual(['rejected']);
    expect(rejected.items[0]).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'AMOUNT_MISMATCH',
      reviewNote: 'Le montant reçu est de 40 000 FCFA.',
      canCancel: false
    });
    const big = await listCoOwnerDeclarations(scope(), { limit: 999 });
    expect(big.pagination.limit).toBe(50);
    const paged = await listCoOwnerDeclarations(scope(), { limit: 2, page: 2 });
    expect(ids(paged.items)).toEqual(['by-other-owner', 'by-manager']);
    expect(paged.pagination).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
  });

  it('forme du contrat : le numéro de réception est complet, la copropriété nommée, aucune alerte ni donnée interne', async () => {
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('secret', {
        createdAt: iso('2026-10-14T11:00:00.000'),
        proofFileUrl: 'uploads/syndics/payment-proofs/tenant-a/syndic-1/secret.png',
        aiPrefill: { recipientPhone: '0101010101' },
        aiEditedFields: ['amount'],
        reviewedByUserId: 'user-1',
        comment: 'COMMENTAIRE-INTERNE'
      })
    );
    const declared = await getCoOwnerDeclaration(scope(), 'secret');
    expect(declared).toEqual({
      id: 'secret',
      status: 'PENDING',
      syndicate: { id: SYNDIC, name: 'Résidence Les Palmiers' },
      receivingNumber: { operator: 'ORANGE', phoneNumber: '+2250707070707', holderName: 'Syndic Palmiers' },
      payerPhone: '+2250505050505',
      amount: 50000,
      acceptedAmount: null,
      paidAt: '2026-10-14T08:00:00.000Z',
      transactionReference: 'REF-secret',
      lines: [
        { lot: { id: LOT_1, lotNumber: 'A-101' }, amount: 50000, acceptedAmount: null, chargeCallIds: ['call-1'] }
      ],
      documents: [],
      rejectReason: null,
      reviewNote: null,
      canCancel: true,
      createdAt: '2026-10-14T11:00:00.000Z',
      reviewedAt: null
    });
    const json = JSON.stringify(await listCoOwnerDeclarations(scope(), {}));
    expect(json).not.toContain('alerts');
    expect(json).not.toContain('payment-proofs');
    expect(json).not.toContain('COMMENTAIRE-INTERNE');
    expect(json).not.toContain('passwordHash');
    expect(json).not.toContain('reviewedByUserId');
    expect(json).not.toContain('marc@agence.test');
  });

  it('déclaration validée : documents réunis sur toutes les lignes, sans doublon', async () => {
    mockDb.chargePayment.rows.push(
      { id: 'pay-1', createdAt: iso('2026-10-14T10:00:00.000'), allocations: [{ chargeCallId: 'call-1' }] },
      { id: 'pay-2', createdAt: iso('2026-10-14T10:00:00.000'), allocations: [{ chargeCallId: 'call-1' }] }
    );
    mockDb.syndicChargeReceipt.rows.push(
      {
        id: 'doc-r1',
        tenantId: TENANT,
        kind: 'RECEIPT',
        number: 'R-1',
        chargePaymentId: 'pay-1',
        chargeCallId: null,
        issuedAt: iso('2026-10-14T10:00:01.000')
      },
      {
        id: 'doc-r2',
        tenantId: TENANT,
        kind: 'RECEIPT',
        number: 'R-2',
        chargePaymentId: 'pay-2',
        chargeCallId: null,
        issuedAt: iso('2026-10-14T10:00:01.000')
      },
      {
        id: 'doc-q',
        tenantId: TENANT,
        kind: 'QUITTANCE',
        number: 'Q-1',
        chargePaymentId: null,
        chargeCallId: 'call-1',
        issuedAt: iso('2026-10-14T10:00:01.000')
      }
    );
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('approved', {
        status: 'APPROVED',
        reviewedAt: iso('2026-10-14T10:00:02.000'),
        acceptedAmount: 70000,
        amount: 70000,
        lines: [
          lineOf('al1', LOT_1, { chargePaymentId: 'pay-1', chargeCallIds: ['call-1'] }),
          lineOf('al2', LOT_2, { chargePaymentId: 'pay-2' })
        ]
      })
    );
    const declared = await getCoOwnerDeclaration(scope(), 'approved');
    expect(declared.documents.map(document => document.id).sort()).toEqual(['doc-q', 'doc-r1', 'doc-r2']);
    expect(declared.canCancel).toBe(false);
    expect(declared.acceptedAmount).toBe(70000);
  });
});

// ---------------------------------------------------------------------------
// Appels visés par une déclaration en attente
// ---------------------------------------------------------------------------

describe('pendingDeclarationsByCall', () => {
  it('appels explicites : chacun renvoie la déclaration qui le vise', async () => {
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('D1', {
        lines: [lineOf('l1', LOT_1, { chargeCallIds: ['call-1', 'call-2'] })],
        createdAt: iso('2026-10-14T08:00:00.000')
      })
    );
    const map = await pendingDeclarationsByCall(TENANT, [LOT_1]);
    expect(Array.from(map.keys()).sort()).toEqual(['call-1', 'call-2']);
    expect(map.get('call-1')).toEqual({ declarationId: 'D1', createdAt: iso('2026-10-14T08:00:00.000') });
  });

  it('appels non précisés : les plus anciens appels ouverts que le montant touche', async () => {
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('small', { lines: [lineOf('l1', LOT_1, { amount: 20000 })] })
    );
    const small = await pendingDeclarationsByCall(TENANT, [LOT_1]);
    expect(Array.from(small.keys())).toEqual(['call-1']);

    mockDb.syndicPaymentDeclaration.rows = [];
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('large', { lines: [lineOf('l2', LOT_1, { amount: 60000 })] })
    );
    const large = await pendingDeclarationsByCall(TENANT, [LOT_1]);
    expect(Array.from(large.keys())).toEqual(['call-1', 'call-2']);
  });

  it('suit le reste dû actuel : un appel soldé n’est plus visé', async () => {
    mockDb.chargePaymentAllocation.rows.push({ chargeCallId: 'call-1', amount: 50000 });
    mockDb.syndicPaymentDeclaration.rows.push(declaration('D', { lines: [lineOf('l1', LOT_1, { amount: 20000 })] }));
    const map = await pendingDeclarationsByCall(TENANT, [LOT_1]);
    expect(Array.from(map.keys())).toEqual(['call-2']);
  });

  it('plusieurs déclarations sur le même appel : la plus ancienne gagne', async () => {
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('recent', {
        createdAt: iso('2026-10-14T12:00:00.000'),
        lines: [lineOf('l1', LOT_1, { chargeCallIds: ['call-1'] })]
      }),
      declaration('oldest', {
        createdAt: iso('2026-10-13T08:00:00.000'),
        lines: [lineOf('l2', LOT_1, { amount: 10000 })]
      })
    );
    const map = await pendingDeclarationsByCall(TENANT, [LOT_1]);
    expect(map.get('call-1')?.declarationId).toBe('oldest');
  });

  it('ignore les déclarations non PENDING, les autres lots, les autres agences et les lignes hors lots demandés', async () => {
    mockDb.syndicPaymentDeclaration.rows.push(
      declaration('approved', { status: 'APPROVED', lines: [lineOf('l1', LOT_1, { chargeCallIds: ['call-1'] })] }),
      declaration('rejected', { status: 'REJECTED', lines: [lineOf('l2', LOT_1, { chargeCallIds: ['call-1'] })] }),
      declaration('canceled', { status: 'CANCELED', lines: [lineOf('l3', LOT_1, { chargeCallIds: ['call-1'] })] }),
      declaration('foreign', { tenantId: OTHER_TENANT, lines: [lineOf('l4', LOT_1, { chargeCallIds: ['call-1'] })] }),
      declaration('other-lot', { lines: [lineOf('l5', LOT_2, { chargeCallIds: ['call-2'] })] })
    );
    expect((await pendingDeclarationsByCall(TENANT, [LOT_1])).size).toBe(0);
    const second = await pendingDeclarationsByCall(TENANT, [LOT_2]);
    expect(Array.from(second.keys())).toEqual(['call-2']);
  });

  it('sans lot, aucune requête et une carte vide', async () => {
    const map = await pendingDeclarationsByCall(TENANT, []);
    expect(map.size).toBe(0);
    expect(mockDb.syndicPaymentDeclaration.findMany).not.toHaveBeenCalled();
  });
});
