/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 047, T022 : alertes d'une déclaration de paiement
 * (`lib/syndics/declared-payment/declaration-alerts.ts`, contrats §0.1, R17).
 * Un test par alerte : le cas qui la déclenche et celui qui ne la déclenche pas.
 */

import { createDeclaredFakeDb } from '../helpers/declared-payment-fake-db';

const mockDb = createDeclaredFakeDb();
jest.mock('../../src/utils/database', () => ({ prisma: mockDb }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

import {
  computeDeclarationAlerts,
  computeDeclarationAlertsBatch,
  readRecipientPhone,
  type DeclarationForAlerts
} from '../../src/lib/syndics/declared-payment/declaration-alerts';
import type { DeclarationAlert } from '../../src/lib/syndics/declared-payment/types';

type Row = Record<string, any>;

const TENANT = 'tenant-a';
const SYNDIC = 'syndic-1';
const OTHER_SYNDIC = 'syndic-2';
const LOT_1 = 'lot-1';
const LOT_2 = 'lot-2';
const CONTACT = 'contact-1';
const RECEIVING = '+2250707070707';
const PAID_AT = new Date('2026-10-14T10:00:00.000Z');
// Lundi 12 octobre 2026.
const CREATED_AT = new Date('2026-10-12T09:00:00.000Z');
const NOW = new Date('2026-10-13T09:00:00.000Z');

const kinds = (alerts: DeclarationAlert[]) => alerts.map(alert => alert.kind);
const only = <K extends DeclarationAlert['kind']>(alerts: DeclarationAlert[], kind: K) =>
  alerts.filter((alert): alert is Extract<DeclarationAlert, { kind: K }> => alert.kind === kind);

function line(over: Row = {}): DeclarationForAlerts['lines'][number] {
  return { id: 'line-1', lotId: LOT_1, amount: 50000, chargeCallIds: ['call-1'], chargePaymentId: null, ...over };
}

function declaration(over: Row = {}): DeclarationForAlerts {
  return {
    id: 'decl-1',
    tenantId: TENANT,
    syndicateId: SYNDIC,
    receivingNumberId: 'num-1',
    receivingPhone: RECEIVING,
    payerPhone: '+2250505050505',
    amount: 50000,
    paidAt: PAID_AT,
    createdAt: CREATED_AT,
    transactionReference: 'MP261014.1234',
    status: 'PENDING',
    declaredByContactId: CONTACT,
    aiPrefill: null,
    aiEditedFields: [],
    lines: [line()],
    ...over
  } as DeclarationForAlerts;
}

/** Une déclaration stockée, telle que la voit `loadDuplicateCandidates`. */
function stored(d: DeclarationForAlerts, over: Row = {}): Row {
  return { ...d, ...over };
}

function seedCalls() {
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
}

function seedOwner(over: Row = {}) {
  mockDb.lotOwnerProfile.rows.push({
    lotId: LOT_1,
    contactId: CONTACT,
    isActive: true,
    ownedSince: new Date('2020-01-01'),
    ownedUntil: null,
    ...over
  });
}

beforeEach(() => {
  mockDb.reset();
  seedCalls();
  seedOwner();
});

describe('REFERENCE_ON_EXISTING_PAYMENT', () => {
  const payment = (over: Row = {}) => ({
    id: 'pay-1',
    reference: 'MP261014.1234',
    paidAt: new Date('2026-10-10T08:00:00.000Z'),
    amount: 25000,
    lot: { syndicateId: SYNDIC },
    ...over
  });

  it('signale une référence déjà portée par un paiement de la copropriété, même saisie avec des espaces', async () => {
    mockDb.chargePayment.rows.push(
      payment({ reference: 'mp261014.1234' }),
      payment({ id: 'pay-2', reference: 'MP 261014.1234' })
    );
    const alerts = await computeDeclarationAlerts(mockDb as any, declaration(), NOW);
    const found = only(alerts, 'REFERENCE_ON_EXISTING_PAYMENT');
    expect(found.map(a => a.chargePaymentId).sort()).toEqual(['pay-1']);
    expect(found[0]).toEqual({
      kind: 'REFERENCE_ON_EXISTING_PAYMENT',
      chargePaymentId: 'pay-1',
      paidAt: '2026-10-10T08:00:00.000Z',
      amount: 25000
    });
  });

  it('ignore une autre référence et un paiement d’une autre copropriété', async () => {
    mockDb.chargePayment.rows.push(
      payment({ id: 'pay-other-ref', reference: 'MP999999' }),
      payment({ id: 'pay-other-syndic', lot: { syndicateId: OTHER_SYNDIC } }),
      payment({ id: 'pay-no-ref', reference: null })
    );
    const alerts = await computeDeclarationAlerts(mockDb as any, declaration(), NOW);
    expect(kinds(alerts)).not.toContain('REFERENCE_ON_EXISTING_PAYMENT');
  });
});

describe('PROBABLE_DUPLICATE', () => {
  const base = () => declaration();
  const other = (over: Row = {}) =>
    stored(base(), {
      id: 'decl-2',
      transactionReference: 'MP261014.9999',
      createdAt: new Date('2026-10-12T10:00:00.000Z'),
      paidAt: new Date('2026-10-14T10:05:00.000Z'),
      ...over
    });

  it('signale une autre déclaration PENDING identique à 10 minutes près avec une autre référence', async () => {
    mockDb.syndicPaymentDeclaration.rows.push(other());
    const alerts = await computeDeclarationAlerts(mockDb as any, base(), NOW);
    expect(only(alerts, 'PROBABLE_DUPLICATE')).toEqual([
      { kind: 'PROBABLE_DUPLICATE', declarationId: 'decl-2', createdAt: '2026-10-12T10:00:00.000Z' }
    ]);
  });

  it('compte aussi une déclaration APPROVED, et la borne de 10 minutes est incluse', async () => {
    mockDb.syndicPaymentDeclaration.rows.push(
      other({ status: 'APPROVED', paidAt: new Date('2026-10-14T10:10:00.000Z') })
    );
    const alerts = await computeDeclarationAlerts(mockDb as any, base(), NOW);
    expect(only(alerts, 'PROBABLE_DUPLICATE')).toHaveLength(1);
  });

  it.each([
    ['plus de 10 minutes d’écart', { paidAt: new Date('2026-10-14T10:11:00.000Z') }],
    ['un autre montant', { amount: 50001 }],
    ['un autre numéro payeur', { payerPhone: '+2250101010101' }],
    ['un autre numéro de réception', { receivingNumberId: 'num-2' }],
    ['la même référence (refusée à la création, pas un doublon probable)', { transactionReference: 'MP261014.1234' }],
    ['une déclaration annulée', { status: 'CANCELED' }],
    ['une déclaration rejetée', { status: 'REJECTED' }],
    ['une autre agence', { tenantId: 'tenant-b' }],
    ['une autre copropriété', { syndicateId: OTHER_SYNDIC }]
  ])('ne signale pas %s', async (_label, over) => {
    mockDb.syndicPaymentDeclaration.rows.push(other(over));
    const alerts = await computeDeclarationAlerts(mockDb as any, base(), NOW);
    expect(kinds(alerts)).not.toContain('PROBABLE_DUPLICATE');
  });

  it('ne se signale pas elle-même', async () => {
    mockDb.syndicPaymentDeclaration.rows.push(stored(base()));
    const alerts = await computeDeclarationAlerts(mockDb as any, base(), NOW);
    expect(kinds(alerts)).not.toContain('PROBABLE_DUPLICATE');
  });
});

describe('EXCESS et PARTIAL', () => {
  it('EXCESS : montant supérieur au reste dû des appels visés, l’excédent devient une avance', async () => {
    const alerts = await computeDeclarationAlerts(
      mockDb as any,
      declaration({ amount: 100000, lines: [line({ amount: 100000 })] }),
      NOW
    );
    expect(only(alerts, 'EXCESS')).toEqual([{ kind: 'EXCESS', lotId: LOT_1, excess: 50000 }]);
    expect(kinds(alerts)).not.toContain('PARTIAL');
  });

  it('PARTIAL : montant inférieur au reste dû, avec le solde restant', async () => {
    const alerts = await computeDeclarationAlerts(
      mockDb as any,
      declaration({ amount: 20000, lines: [line({ amount: 20000 })] }),
      NOW
    );
    expect(only(alerts, 'PARTIAL')).toEqual([{ kind: 'PARTIAL', lotId: LOT_1, remaining: 30000 }]);
    expect(kinds(alerts)).not.toContain('EXCESS');
  });

  it('ni l’un ni l’autre quand le montant égale le reste dû', async () => {
    const alerts = await computeDeclarationAlerts(mockDb as any, declaration(), NOW);
    expect(kinds(alerts)).not.toContain('EXCESS');
    expect(kinds(alerts)).not.toContain('PARTIAL');
  });

  it('le reste dû tient compte des affectations déjà faites', async () => {
    mockDb.chargePaymentAllocation.rows.push({ chargeCallId: 'call-1', amount: 20000 });
    const exact = await computeDeclarationAlerts(
      mockDb as any,
      declaration({ amount: 30000, lines: [line({ amount: 30000 })] }),
      NOW
    );
    expect(kinds(exact)).not.toContain('EXCESS');
    expect(kinds(exact)).not.toContain('PARTIAL');

    const full = await computeDeclarationAlerts(mockDb as any, declaration(), NOW);
    expect(only(full, 'EXCESS')).toEqual([{ kind: 'EXCESS', lotId: LOT_1, excess: 20000 }]);
  });

  it('un appel soldé entre-temps compte pour zéro : tout devient avance', async () => {
    mockDb.chargePaymentAllocation.rows.push({ chargeCallId: 'call-1', amount: 50000 });
    const alerts = await computeDeclarationAlerts(mockDb as any, declaration(), NOW);
    expect(only(alerts, 'EXCESS')).toEqual([{ kind: 'EXCESS', lotId: LOT_1, excess: 50000 }]);
  });

  it('calcule en centimes exacts, sans écart de flottant', async () => {
    mockDb.chargeCall.rows[0].amount = 1000.1;
    mockDb.chargePaymentAllocation.rows.push({ chargeCallId: 'call-1', amount: 333.37 });
    // 1000.10 - 333.37 = 666.73 en centimes ; en flottants 666.7299999999999.
    const exact = await computeDeclarationAlerts(
      mockDb as any,
      declaration({ amount: 666.73, lines: [line({ amount: 666.73 })] }),
      NOW
    );
    expect(kinds(exact)).not.toContain('EXCESS');
    expect(kinds(exact)).not.toContain('PARTIAL');

    const partial = await computeDeclarationAlerts(
      mockDb as any,
      declaration({ amount: 666.7, lines: [line({ amount: 666.7 })] }),
      NOW
    );
    expect(only(partial, 'PARTIAL')).toEqual([{ kind: 'PARTIAL', lotId: LOT_1, remaining: 0.03 }]);
  });

  describe('sans appel précisé', () => {
    const empty = (amount: number) => declaration({ amount, lines: [line({ amount, chargeCallIds: [] })] });

    it('vise les appels ouverts les plus anciens jusqu’à couvrir le montant (partiel sur le dernier)', async () => {
      // 60 000 : appel 1 (50 000) puis appel 2 (30 000) partiellement ; les deux sont visés, reste 20 000.
      const alerts = await computeDeclarationAlerts(mockDb as any, empty(60000), NOW);
      expect(only(alerts, 'PARTIAL')).toEqual([{ kind: 'PARTIAL', lotId: LOT_1, remaining: 20000 }]);
    });

    it('un montant qui tient dans le plus ancien appel ne vise que lui', async () => {
      const alerts = await computeDeclarationAlerts(mockDb as any, empty(20000), NOW);
      expect(only(alerts, 'PARTIAL')).toEqual([{ kind: 'PARTIAL', lotId: LOT_1, remaining: 30000 }]);
    });

    it('un montant qui dépasse tous les appels ouverts : excédent', async () => {
      const alerts = await computeDeclarationAlerts(mockDb as any, empty(100000), NOW);
      expect(only(alerts, 'EXCESS')).toEqual([{ kind: 'EXCESS', lotId: LOT_1, excess: 20000 }]);
    });

    it('un montant égal au cumul : aucune alerte', async () => {
      const alerts = await computeDeclarationAlerts(mockDb as any, empty(80000), NOW);
      expect(kinds(alerts)).not.toContain('EXCESS');
      expect(kinds(alerts)).not.toContain('PARTIAL');
    });

    it('un lot sans appel ouvert : tout est excédent (avance)', async () => {
      mockDb.chargeCall.rows = mockDb.chargeCall.rows.filter(row => row.lotId !== LOT_1);
      const alerts = await computeDeclarationAlerts(mockDb as any, empty(40000), NOW);
      expect(only(alerts, 'EXCESS')).toEqual([{ kind: 'EXCESS', lotId: LOT_1, excess: 40000 }]);
    });

    it('ignore les appels déjà au statut PAID', async () => {
      mockDb.chargeCall.rows[0].status = 'PAID';
      const alerts = await computeDeclarationAlerts(mockDb as any, empty(30000), NOW);
      // Seul l'appel 2 (30 000) reste ouvert : le montant le couvre exactement.
      expect(kinds(alerts)).not.toContain('EXCESS');
      expect(kinds(alerts)).not.toContain('PARTIAL');
    });
  });

  it('un appel explicite d’un autre lot est ignoré comme inexistant', async () => {
    mockDb.chargeCall.rows.push({
      id: 'call-x',
      lotId: LOT_2,
      syndicateId: SYNDIC,
      period: '2026-T1',
      amount: 90000,
      status: 'PENDING',
      dueDate: new Date('2026-01-31'),
      createdAt: new Date('2026-01-01')
    });
    const alerts = await computeDeclarationAlerts(
      mockDb as any,
      declaration({ lines: [line({ chargeCallIds: ['call-x'] })] }),
      NOW
    );
    expect(only(alerts, 'EXCESS')).toEqual([{ kind: 'EXCESS', lotId: LOT_1, excess: 50000 }]);
  });

  it('une alerte par ligne, dans l’ordre des lignes', async () => {
    mockDb.chargeCall.rows.push({
      id: 'call-3',
      lotId: LOT_2,
      syndicateId: SYNDIC,
      period: '2026-T1',
      amount: 10000,
      status: 'PENDING',
      dueDate: new Date('2026-01-31'),
      createdAt: new Date('2026-01-01')
    });
    seedOwner({ lotId: LOT_2 });
    const alerts = await computeDeclarationAlerts(
      mockDb as any,
      declaration({
        amount: 75000,
        lines: [
          line({ id: 'l1', amount: 65000 }),
          line({ id: 'l2', lotId: LOT_2, amount: 10000, chargeCallIds: ['call-3'] })
        ]
      }),
      NOW
    );
    expect(only(alerts, 'EXCESS')).toEqual([{ kind: 'EXCESS', lotId: LOT_1, excess: 15000 }]);
  });

  it('charge les appels et les affectations en requêtes groupées, sans aller-retour par appel', async () => {
    mockDb.chargeCall.rows.push({
      id: 'call-3',
      lotId: LOT_2,
      syndicateId: SYNDIC,
      period: '2026-T1',
      amount: 10000,
      status: 'PENDING',
      dueDate: new Date('2026-01-31'),
      createdAt: new Date('2026-01-01')
    });
    seedOwner({ lotId: LOT_2 });
    await computeDeclarationAlertsBatch(
      mockDb as any,
      [
        declaration({ id: 'd1' }),
        declaration({
          id: 'd2',
          transactionReference: 'MP000002',
          lines: [line({ id: 'l2', lotId: LOT_2, chargeCallIds: ['call-3'] })]
        })
      ],
      NOW
    );
    expect(mockDb.chargeCall.findMany).toHaveBeenCalledTimes(1);
    expect(mockDb.chargePaymentAllocation.findMany).toHaveBeenCalledTimes(1);
    expect(mockDb.chargePayment.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('DECLARANT_NOT_CURRENT_OWNER', () => {
  it('rien quand le déclarant est copropriétaire actuel du lot', async () => {
    const alerts = await computeDeclarationAlerts(mockDb as any, declaration(), NOW);
    expect(kinds(alerts)).not.toContain('DECLARANT_NOT_CURRENT_OWNER');
  });

  it.each([
    ['sa détention est terminée', { ownedUntil: new Date('2026-09-30') }],
    ['sa détention n’a pas commencé', { ownedSince: new Date('2027-01-01') }],
    ['son profil est inactif', { isActive: false }],
    ['le profil est celui d’un autre contact', { contactId: 'contact-2' }],
    ['le profil est celui d’un autre lot', { lotId: LOT_2 }]
  ])('signale le lot quand %s', async (_label, over) => {
    mockDb.lotOwnerProfile.rows = [];
    seedOwner(over);
    const alerts = await computeDeclarationAlerts(mockDb as any, declaration(), NOW);
    expect(only(alerts, 'DECLARANT_NOT_CURRENT_OWNER')).toEqual([
      { kind: 'DECLARANT_NOT_CURRENT_OWNER', lotId: LOT_1 }
    ]);
  });

  it('une détention qui se termine aujourd’hui ou plus tard reste valide', async () => {
    mockDb.lotOwnerProfile.rows = [];
    seedOwner({ ownedUntil: NOW });
    const alerts = await computeDeclarationAlerts(mockDb as any, declaration(), NOW);
    expect(kinds(alerts)).not.toContain('DECLARANT_NOT_CURRENT_OWNER');
  });

  it('une déclaration saisie par le gestionnaire (sans contact) n’est pas contrôlée', async () => {
    mockDb.lotOwnerProfile.rows = [];
    const alerts = await computeDeclarationAlerts(mockDb as any, declaration({ declaredByContactId: null }), NOW);
    expect(kinds(alerts)).not.toContain('DECLARANT_NOT_CURRENT_OWNER');
  });
});

describe('AI_FIELDS_EDITED', () => {
  it('signale les champs lus par l’IA puis retouchés, limités aux champs connus', async () => {
    const alerts = await computeDeclarationAlerts(
      mockDb as any,
      declaration({ aiEditedFields: ['payerPhone', 'amount', 'inconnu'] }),
      NOW
    );
    expect(only(alerts, 'AI_FIELDS_EDITED')).toEqual([{ kind: 'AI_FIELDS_EDITED', fields: ['amount', 'payerPhone'] }]);
  });

  it('rien sans champ retouché', async () => {
    const alerts = await computeDeclarationAlerts(mockDb as any, declaration({ aiEditedFields: [] }), NOW);
    expect(kinds(alerts)).not.toContain('AI_FIELDS_EDITED');
  });
});

describe('RECIPIENT_MISMATCH', () => {
  it('signale un numéro destinataire lu différent du numéro choisi (forme normalisée)', async () => {
    const alerts = await computeDeclarationAlerts(
      mockDb as any,
      declaration({ aiPrefill: { recipientPhone: '07 99 99 99 99' } }),
      NOW
    );
    expect(only(alerts, 'RECIPIENT_MISMATCH')).toEqual([
      { kind: 'RECIPIENT_MISMATCH', recipientPhone: '+2250799999999' }
    ]);
  });

  it('rien quand le numéro lu est le même sous une autre forme', async () => {
    const alerts = await computeDeclarationAlerts(
      mockDb as any,
      declaration({ aiPrefill: { recipientPhone: '+225 07 07 07 07 07' } }),
      NOW
    );
    expect(kinds(alerts)).not.toContain('RECIPIENT_MISMATCH');
  });

  it('lit le numéro dans un conteneur imbriqué ou une valeur enveloppée', async () => {
    const nested = await computeDeclarationAlerts(
      mockDb as any,
      declaration({ aiPrefill: { reading: { recipientPhone: '0101010101' } } }),
      NOW
    );
    expect(only(nested, 'RECIPIENT_MISMATCH')).toHaveLength(1);
    const wrapped = await computeDeclarationAlerts(
      mockDb as any,
      declaration({ aiPrefill: { result: { recipientPhone: { value: '0101010101' } } } }),
      NOW
    );
    expect(only(wrapped, 'RECIPIENT_MISMATCH')).toHaveLength(1);
  });

  it('un numéro lu inexploitable est signalé tel quel, tronqué', async () => {
    const alerts = await computeDeclarationAlerts(
      mockDb as any,
      declaration({ aiPrefill: { recipientPhone: 'Marie K.' } }),
      NOW
    );
    expect(only(alerts, 'RECIPIENT_MISMATCH')).toEqual([{ kind: 'RECIPIENT_MISMATCH', recipientPhone: 'Marie K.' }]);
  });

  it.each([
    ['null', null],
    ['une chaîne', 'texte'],
    ['un nombre', 42],
    ['un tableau', [1, 2]],
    ['un objet vide', {}],
    ['recipientPhone numérique', { recipientPhone: 701010101 }],
    ['recipientPhone nul', { recipientPhone: null }],
    ['recipientPhone vide', { recipientPhone: '   ' }],
    ['un conteneur de mauvais type', { reading: 'x', result: [1] }]
  ])('lecture défensive : aucun crash ni alerte pour %s', async (_label, aiPrefill) => {
    expect(readRecipientPhone(aiPrefill)).toBeNull();
    const alerts = await computeDeclarationAlerts(mockDb as any, declaration({ aiPrefill }), NOW);
    expect(kinds(alerts)).not.toContain('RECIPIENT_MISMATCH');
  });
});

describe('FISCAL_YEAR_CLOSED', () => {
  const budget = (over: Row = {}) => ({ syndicateId: SYNDIC, fiscalYear: 2026, status: 'CLOSED', ...over });

  it('signale une date de paiement dans un exercice clos de la copropriété', async () => {
    mockDb.syndicateBudget.rows.push(budget());
    const alerts = await computeDeclarationAlerts(mockDb as any, declaration(), NOW);
    expect(only(alerts, 'FISCAL_YEAR_CLOSED')).toEqual([{ kind: 'FISCAL_YEAR_CLOSED' }]);
  });

  it.each([
    ['exercice encore ouvert', { status: 'APPROVED' }],
    ['exercice d’une autre année', { fiscalYear: 2025 }],
    ['exercice d’une autre copropriété', { syndicateId: OTHER_SYNDIC }]
  ])('rien : %s', async (_label, over) => {
    mockDb.syndicateBudget.rows.push(budget(over));
    const alerts = await computeDeclarationAlerts(mockDb as any, declaration(), NOW);
    expect(kinds(alerts)).not.toContain('FISCAL_YEAR_CLOSED');
  });

  it('se fonde sur l’année de la date de paiement, pas sur celle de la déclaration', async () => {
    mockDb.syndicateBudget.rows.push(budget({ fiscalYear: 2025 }));
    const alerts = await computeDeclarationAlerts(
      mockDb as any,
      declaration({ paidAt: new Date('2025-12-31T22:00:00.000Z') }),
      NOW
    );
    expect(only(alerts, 'FISCAL_YEAR_CLOSED')).toHaveLength(1);
  });
});

describe('OVERDUE', () => {
  const settings = (days: number) =>
    mockDb.syndicDeclaredPaymentSettings.rows.push({
      tenantId: TENANT,
      syndicateId: SYNDIC,
      reviewAlertBusinessDays: days
    });

  it('signale une déclaration PENDING depuis N jours ouvrés, avec le nombre écoulé', async () => {
    // Créée le lundi 12, lue le jeudi 15 : 3 jours ouvrés (défaut D12).
    const alerts = await computeDeclarationAlerts(mockDb as any, declaration(), new Date('2026-10-15T09:00:00.000Z'));
    expect(only(alerts, 'OVERDUE')).toEqual([{ kind: 'OVERDUE', businessDays: 3 }]);
  });

  it('rien avant le délai', async () => {
    const alerts = await computeDeclarationAlerts(mockDb as any, declaration(), new Date('2026-10-14T09:00:00.000Z'));
    expect(kinds(alerts)).not.toContain('OVERDUE');
  });

  it('respecte le délai réglé par la copropriété', async () => {
    settings(1);
    const alerts = await computeDeclarationAlerts(mockDb as any, declaration(), NOW);
    expect(only(alerts, 'OVERDUE')).toEqual([{ kind: 'OVERDUE', businessDays: 1 }]);
  });

  it('un week-end ne compte pas', async () => {
    settings(2);
    // Créée le vendredi 9, lue le dimanche 11 : zéro jour ouvré après le vendredi.
    const alerts = await computeDeclarationAlerts(
      mockDb as any,
      declaration({ createdAt: new Date('2026-10-09T09:00:00.000Z') }),
      new Date('2026-10-11T09:00:00.000Z')
    );
    expect(kinds(alerts)).not.toContain('OVERDUE');
  });
});

describe('statuts autres que PENDING', () => {
  it('ne calcule aucune alerte de décision', async () => {
    mockDb.chargePayment.rows.push({
      id: 'pay-1',
      reference: 'MP261014.1234',
      paidAt: PAID_AT,
      amount: 1,
      lot: { syndicateId: SYNDIC }
    });
    mockDb.syndicateBudget.rows.push({ syndicateId: SYNDIC, fiscalYear: 2026, status: 'CLOSED' });
    mockDb.lotOwnerProfile.rows = [];
    for (const status of ['APPROVED', 'REJECTED', 'CANCELED'] as const) {
      const alerts = await computeDeclarationAlerts(
        mockDb as any,
        declaration({ status, amount: 99999, lines: [line({ amount: 99999 })] }),
        new Date('2026-12-01T09:00:00.000Z')
      );
      expect(alerts).toEqual([]);
    }
  });

  it('garde les alertes qui décrivent la lecture de l’IA', async () => {
    const alerts = await computeDeclarationAlerts(
      mockDb as any,
      declaration({
        status: 'APPROVED',
        aiEditedFields: ['amount'],
        aiPrefill: { recipientPhone: '0101010101' }
      }),
      NOW
    );
    expect(kinds(alerts)).toEqual(['AI_FIELDS_EDITED', 'RECIPIENT_MISMATCH']);
  });
});

describe('lecture seule', () => {
  it('n’appelle que des lectures et renvoie une entrée par déclaration du lot', async () => {
    const result = await computeDeclarationAlertsBatch(
      mockDb as any,
      [declaration({ id: 'd1' }), declaration({ id: 'd2', status: 'APPROVED', transactionReference: 'MP000002' })],
      NOW
    );
    expect(Array.from(result.keys()).sort()).toEqual(['d1', 'd2']);
    for (const name of Object.keys(mockDb).filter(key => key !== 'reset')) {
      const model = (mockDb as any)[name];
      expect(Object.keys(model).filter(key => /^(create|update|delete|upsert)/.test(key))).toEqual([]);
    }
  });
});
