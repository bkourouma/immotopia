/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 047, T020 : création d'une déclaration de paiement mobile money
 * (`lib/syndics/declared-payment/declaration-create.ts`, contrats §1.11 et §2.4).
 * Prisma et les modules voisins sont simulés ; la concurrence sur base réelle
 * est dans `declared-payment-create.integration.test.ts`.
 */

type Row = Record<string, any>;

const TENANT = 'tenant-a';
const SYNDIC = 'syndic-1';
const LOT_1 = 'lot-1';
const LOT_2 = 'lot-2';
const NUMBER_ID = 'num-1';
const NOW = new Date('2026-10-17T12:00:00.000Z');

const store = {
  rules: null as Row | null,
  activeNumbers: 1,
  numbers: [] as Row[],
  declarations: [] as Row[],
  pendingByLot: {} as Record<string, number>,
  ownerProfiles: [] as Row[],
  contacts: [] as Row[],
  visibleCalls: [] as string[],
  openCalls: {} as Record<string, string[]>,
  foreignLots: new Set<string>(),
  proofReads: [] as Row[],
  onlineCheckouts: [] as Row[]
};

const mockPrisma: Row = {
  syndicDeclaredPaymentSettings: { findFirst: jest.fn(async () => store.rules) },
  syndicReceivingNumber: {
    count: jest.fn(async () => store.activeNumbers),
    findFirst: jest.fn(
      async ({ where }: Row) =>
        store.numbers.find(
          n => n.id === where.id && n.tenantId === where.tenantId && n.syndicateId === where.syndicateId && n.isActive
        ) ?? null
    )
  },
  syndicPaymentDeclaration: {
    findFirst: jest.fn(async ({ where }: Row) =>
      store.declarations.find(
        d =>
          d.tenantId === where.tenantId &&
          d.receivingPhone === where.receivingPhone &&
          d.transactionReference === where.transactionReference &&
          where.status.in.includes(d.status)
      )
        ? { id: 'existing' }
        : null
    ),
    create: jest.fn(async ({ data }: Row) => {
      store.declarations.push({ ...data });
      return { id: data.id };
    })
  },
  syndicOnlineCheckout: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.onlineCheckouts.filter(
        c =>
          c.lotId === where.lotId &&
          where.chargeCallIds.hasSome.some((id: string) => c.chargeCallIds.includes(id)) &&
          (c.status === 'REVIEW' || c.status === 'PENDING')
      )
    )
  },
  syndicPaymentProofRead: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const found = store.proofReads.find(
        r =>
          r.id === where.id &&
          r.tenantId === where.tenantId &&
          r.syndicateId === where.syndicateId &&
          where.contactId.in.includes(r.contactId) &&
          r.consumedAt === null &&
          r.expiresAt > where.expiresAt.gt &&
          r.tempFileUrl !== null
      );
      return found ? { id: found.id, tempFileUrl: found.tempFileUrl, result: found.result } : null;
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const found = store.proofReads.find(
        r =>
          r.id === where.id &&
          r.tenantId === where.tenantId &&
          (where.consumedAt === undefined || r.consumedAt === where.consumedAt)
      );
      if (!found) return { count: 0 };
      Object.assign(found, data);
      return { count: 1 };
    })
  },
  syndicPaymentDeclarationLine: {
    count: jest.fn(async ({ where }: Row) => store.pendingByLot[where.lotId] ?? 0)
  },
  chargeCall: {
    findMany: jest.fn(async ({ where }: Row) => {
      const ids: string[] = where.AND[0].id.in;
      return ids.filter(id => store.visibleCalls.includes(id)).map(id => ({ id }));
    })
  },
  crmContact: {
    findFirst: jest.fn(async ({ where }: Row) => store.contacts.find(c => c.id === where.id) ?? null)
  },
  lotOwnerProfile: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.ownerProfiles.filter(p => p.contactId === where.contactId && where.lotId.in.includes(p.lotId))
    )
  },
  $executeRaw: jest.fn(async () => 1),
  $transaction: jest.fn(async (fn: (tx: Row) => Promise<unknown>) => fn(mockPrisma))
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

const auditEvents: Row[] = [];
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (entry: Row) => auditEvents.push(entry)
}));

jest.mock('../../src/lib/syndics/charge-allocation', () => ({
  assertSyndicateOfTenant: jest.fn(async (_c: unknown, _t: string, syndicateId: string) => {
    if (syndicateId !== 'syndic-1') {
      const { NotFoundError } = jest.requireActual('../../src/middleware/error-middleware');
      throw new NotFoundError('Copropriété introuvable ou inaccessible.');
    }
  }),
  assertLotOfSyndicate: jest.fn(async (_c: unknown, _t: string, _s: string, lotId: string) => {
    if (store.foreignLots.has(lotId)) {
      const { NotFoundError } = jest.requireActual('../../src/middleware/error-middleware');
      throw new NotFoundError('Lot introuvable.');
    }
  }),
  listOpenCallsForLot: jest.fn(async (_t: string, _s: string, lotId: string) =>
    (store.openCalls[lotId] ?? []).map(id => ({ id }))
  )
}));

jest.mock('../../src/lib/syndics/coowner-portal', () => ({
  ownedChargeCallsWhere: jest.fn(() => ({ marker: 'owned' }))
}));

const mockAssertFeature = jest.fn(async () => undefined);
jest.mock('../../src/lib/syndics/declared-payment/settings', () => ({
  assertSyndicFeatureForDeclared: (...args: unknown[]) => mockAssertFeature(...(args as [])),
  getDeclaredPaymentRules: jest.fn(async () => ({
    enabled: true,
    reviewAlertBusinessDays: 3,
    proofRequired: false,
    payerInstructions: null,
    aiPrefillEnabled: false,
    ...(store.rules ?? {})
  }))
}));

const mockSaveProof = jest.fn();
const mockPromote = jest.fn();
const mockDiscard = jest.fn(async (..._args: unknown[]) => true);
jest.mock('../../src/lib/syndics/declared-payment/proof-files', () => ({
  saveDeclarationProof: (...args: unknown[]) => mockSaveProof(...args),
  promoteTempProofToDeclaration: (...args: unknown[]) => mockPromote(...args),
  discardTempProof: (...args: unknown[]) => mockDiscard(...args)
}));

jest.mock('../../src/lib/files/private-files', () => ({
  privateUploadReadRoots: () => ['/uploads-root'],
  privateUploadPath: (fileUrl: string, folder: string[]) => {
    const prefix = `/uploads/${folder.join('/')}/`;
    return fileUrl.startsWith(prefix) ? fileUrl.slice('/uploads/'.length) : null;
  }
}));

import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { createDeclaration } from '../../src/lib/syndics/declared-payment/declaration-create';
import { AuditActionKey } from '../../src/types/audit-types';

const scope = (over: Row = {}) => ({
  tenantId: TENANT,
  contactIds: ['contact-1'],
  lots: [
    { lotId: LOT_1, syndicateId: SYNDIC, contactId: 'contact-1', ownershipPercentage: 100, ownedSince: new Date(0) },
    { lotId: LOT_2, syndicateId: SYNDIC, contactId: 'contact-1', ownershipPercentage: 100, ownedSince: new Date(0) },
    {
      lotId: 'lot-other-syndic',
      syndicateId: 'syndic-2',
      contactId: 'contact-1',
      ownershipPercentage: 100,
      ownedSince: new Date(0)
    }
  ],
  lotIds: [LOT_1, LOT_2, 'lot-other-syndic'],
  syndicateIds: [SYNDIC, 'syndic-2'],
  ...over
});

const coowner = (over: Row = {}) => ({
  type: 'COOWNER' as const,
  scope: scope() as any,
  contactId: 'contact-1',
  ...over
});

const baseInput = (over: Row = {}): any => ({
  receivingNumberId: NUMBER_ID,
  payerPhone: '07 07 07 07 07',
  amount: 30000,
  paidAt: '2026-10-17T10:00:00+00:00',
  transactionReference: ' mp261017.abc ',
  lines: [
    { lotId: LOT_1, amount: 20000, chargeCallIds: [] },
    { lotId: LOT_2, amount: 10000, chargeCallIds: [] }
  ],
  ...over
});

function run(over: Row = {}) {
  return createDeclaration({
    tenantId: TENANT,
    syndicateId: SYNDIC,
    actor: coowner(),
    input: baseInput(),
    now: NOW,
    ...over
  });
}

async function expectError(promise: Promise<unknown>, statusCode: number, code?: string) {
  await expect(promise).rejects.toMatchObject({ statusCode, ...(code ? { code } : {}) });
}

let unlinkSpy: jest.SpyInstance;

beforeEach(() => {
  store.rules = { enabled: true };
  store.activeNumbers = 1;
  store.numbers = [
    {
      id: NUMBER_ID,
      tenantId: TENANT,
      syndicateId: SYNDIC,
      operator: 'ORANGE',
      phoneNumber: '+2250101010101',
      holderName: 'Syndic Résidence',
      isActive: true
    },
    {
      id: 'num-off',
      tenantId: TENANT,
      syndicateId: SYNDIC,
      operator: 'MTN',
      phoneNumber: '+2250505050505',
      holderName: 'Ancien',
      isActive: false
    },
    {
      id: 'num-foreign',
      tenantId: TENANT,
      syndicateId: 'syndic-2',
      operator: 'WAVE',
      phoneNumber: '+2250707070707',
      holderName: 'Autre',
      isActive: true
    }
  ];
  store.declarations = [];
  store.pendingByLot = {};
  store.ownerProfiles = [];
  store.contacts = [];
  store.visibleCalls = [];
  store.openCalls = {};
  store.foreignLots = new Set();
  store.proofReads = [];
  store.onlineCheckouts = [];
  mockPromote.mockReset();
  mockDiscard.mockReset().mockResolvedValue(true);
  auditEvents.length = 0;
  mockAssertFeature.mockReset().mockResolvedValue(undefined);
  mockSaveProof.mockReset();
  mockPrisma.syndicPaymentDeclaration.create.mockClear();
  mockPrisma.$transaction.mockClear();
  mockPrisma.$executeRaw.mockClear();
  mockPrisma.chargeCall.findMany.mockClear();
  unlinkSpy = jest.spyOn(fsPromises, 'unlink').mockResolvedValue(undefined);
});

afterEach(() => unlinkSpy.mockRestore());

describe('createDeclaration : cas nominal', () => {
  it('crée une déclaration PENDING avec lignes, instantané du numéro, valeurs normalisées et audit', async () => {
    const result = await run();
    expect(result.declarationId).toEqual(expect.any(String));

    expect(store.declarations).toHaveLength(1);
    const row = store.declarations[0];
    expect(row).toMatchObject({
      id: result.declarationId,
      tenantId: TENANT,
      syndicateId: SYNDIC,
      status: 'PENDING',
      receivingNumberId: NUMBER_ID,
      receivingOperator: 'ORANGE',
      receivingPhone: '+2250101010101',
      receivingHolderName: 'Syndic Résidence',
      declaredByContactId: 'contact-1',
      declaredByUserId: null,
      payerPhone: '+2250707070707',
      amount: 30000,
      transactionReference: 'MP261017.ABC',
      comment: null,
      proofFileUrl: null,
      proofSha256: null,
      aiEditedFields: []
    });
    expect(row.paidAt).toEqual(new Date('2026-10-17T10:00:00+00:00'));
    expect(row).not.toHaveProperty('aiPrefill');
    expect(row.lines.create).toEqual([
      { tenantId: TENANT, lotId: LOT_1, amount: 20000, chargeCallIds: [] },
      { tenantId: TENANT, lotId: LOT_2, amount: 10000, chargeCallIds: [] }
    ]);
    expect(mockAssertFeature).toHaveBeenCalledWith(TENANT, NOW);

    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]).toMatchObject({
      actionKey: AuditActionKey.SYNDIC_PAYMENT_DECLARATION_CREATED,
      entityId: result.declarationId,
      tenantId: TENANT,
      actorType: 'PORTAL',
      payload: { status: 'PENDING', amount: 30000, lineCount: 2, hasProof: false }
    });
    const audited = JSON.stringify(auditEvents[0].payload);
    expect(audited).not.toContain('+225');
    expect(audited).not.toContain('MP261017');
  });

  it('conserve les appels visés et ignore les doublons de la liste', async () => {
    store.visibleCalls = ['call-1', 'call-2'];
    store.openCalls[LOT_1] = ['call-1', 'call-2'];
    await run({
      input: baseInput({
        amount: 20000,
        lines: [{ lotId: LOT_1, amount: 20000, chargeCallIds: ['call-1', 'call-2', 'call-1'] }]
      })
    });
    expect(store.declarations[0].lines.create[0].chargeCallIds).toEqual(['call-1', 'call-2']);
  });

  it('un commentaire est rogné, vide devient null', async () => {
    await run({ input: baseInput({ comment: '  Virement du loyer  ' }) });
    expect(store.declarations[0].comment).toBe('Virement du loyer');
  });
});

describe('createDeclaration : règles de montant', () => {
  it('somme des lignes différente du montant : DECLARATION_AMOUNT_MISMATCH', async () => {
    await expectError(
      run({
        input: baseInput({
          lines: [
            { lotId: LOT_1, amount: 20000, chargeCallIds: [] },
            { lotId: LOT_2, amount: 9999, chargeCallIds: [] }
          ]
        })
      }),
      400,
      'DECLARATION_AMOUNT_MISMATCH'
    );
    expect(store.declarations).toHaveLength(0);
  });

  it('montant au-dessus du plafond : DECLARATION_AMOUNT_TOO_HIGH ; le plafond lui-même passe', async () => {
    await expectError(
      run({ input: baseInput({ amount: 5_000_001, lines: [{ lotId: LOT_1, amount: 5_000_001, chargeCallIds: [] }] }) }),
      400,
      'DECLARATION_AMOUNT_TOO_HIGH'
    );
    await expect(
      run({
        input: baseInput({
          amount: 5_000_000,
          transactionReference: 'PLAFOND1',
          lines: [{ lotId: LOT_1, amount: 5_000_000, chargeCallIds: [] }]
        })
      })
    ).resolves.toBeDefined();
  });

  it.each([0, -5, 100.5, Number.NaN])('montant %p : VALIDATION_ERROR', async amount => {
    await expectError(
      run({ input: baseInput({ amount, lines: [{ lotId: LOT_1, amount: 30000, chargeCallIds: [] }] }) }),
      400,
      'VALIDATION_ERROR'
    );
  });

  it('part de ligne nulle ou décimale : VALIDATION_ERROR', async () => {
    await expectError(
      run({
        input: baseInput({
          lines: [
            { lotId: LOT_1, amount: 30000, chargeCallIds: [] },
            { lotId: LOT_2, amount: 0, chargeCallIds: [] }
          ]
        })
      }),
      400,
      'VALIDATION_ERROR'
    );
  });

  it('lots dupliqués et plus de 10 lignes : VALIDATION_ERROR', async () => {
    await expectError(
      run({
        input: baseInput({
          lines: [
            { lotId: LOT_1, amount: 20000, chargeCallIds: [] },
            { lotId: LOT_1, amount: 10000, chargeCallIds: [] }
          ]
        })
      }),
      400,
      'VALIDATION_ERROR'
    );
    const eleven = Array.from({ length: 11 }, (_, i) => ({ lotId: `lot-${i}`, amount: 10, chargeCallIds: [] }));
    await expectError(run({ input: baseInput({ amount: 110, lines: eleven }) }), 400, 'VALIDATION_ERROR');
    await expectError(run({ input: baseInput({ amount: 10, lines: [] }) }), 400, 'VALIDATION_ERROR');
  });
});

describe('createDeclaration : bornes de date', () => {
  const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
  const MIN = 60_000;
  const DAY = 86_400_000;

  it('+10 minutes accepté, +11 minutes refusé', async () => {
    await expect(run({ input: baseInput({ paidAt: at(10 * MIN) }) })).resolves.toBeDefined();
    await expectError(
      run({ input: baseInput({ paidAt: at(11 * MIN), transactionReference: 'FUTURE11' }) }),
      400,
      'DECLARATION_DATE_OUT_OF_RANGE'
    );
  });

  it('-90 jours accepté, -91 jours refusé', async () => {
    await expect(
      run({ input: baseInput({ paidAt: at(-90 * DAY), transactionReference: 'OLD90DAY' }) })
    ).resolves.toBeDefined();
    await expectError(
      run({ input: baseInput({ paidAt: at(-91 * DAY), transactionReference: 'OLD91DAY' }) }),
      400,
      'DECLARATION_DATE_OUT_OF_RANGE'
    );
  });

  it('date illisible : VALIDATION_ERROR', async () => {
    await expectError(run({ input: baseInput({ paidAt: 'pas une date' }) }), 400, 'VALIDATION_ERROR');
  });
});

describe('createDeclaration : téléphone et référence', () => {
  it('téléphone payeur invalide : INVALID_PHONE', async () => {
    await expectError(run({ input: baseInput({ payerPhone: '12345' }) }), 400, 'INVALID_PHONE');
  });

  it('référence invalide : INVALID_TRANSACTION_REFERENCE', async () => {
    await expectError(run({ input: baseInput({ transactionReference: 'a b' }) }), 400, 'INVALID_TRANSACTION_REFERENCE');
    await expectError(
      run({ input: baseInput({ transactionReference: 'é@#$%' }) }),
      400,
      'INVALID_TRANSACTION_REFERENCE'
    );
  });
});

describe('createDeclaration : copropriété, réglages et numéro de réception', () => {
  it('copropriété d’une autre agence : 404', async () => {
    await expectError(run({ syndicateId: 'syndic-x' }), 404);
  });

  it('droit SYNDIC refusé au portail : 403 propagé, rien écrit', async () => {
    const { AppError } = jest.requireActual('../../src/middleware/error-middleware');
    mockAssertFeature.mockRejectedValue(new AppError('refus', 403, 'SYNDIC_FEATURE_DENIED'));
    await expectError(run(), 403, 'SYNDIC_FEATURE_DENIED');
    expect(store.declarations).toHaveLength(0);
  });

  it('le gestionnaire n’est pas soumis au droit SYNDIC du portail', async () => {
    await run({ actor: { type: 'MANAGER', userId: 'user-1' } });
    expect(mockAssertFeature).not.toHaveBeenCalled();
  });

  it('copropriété désactivée : DECLARED_PAYMENT_UNAVAILABLE', async () => {
    store.rules = { enabled: false };
    await expectError(run(), 400, 'DECLARED_PAYMENT_UNAVAILABLE');
  });

  it('aucun numéro actif : DECLARED_PAYMENT_UNAVAILABLE', async () => {
    store.activeNumbers = 0;
    await expectError(run(), 400, 'DECLARED_PAYMENT_UNAVAILABLE');
  });

  it('numéro inactif : RECEIVING_NUMBER_INACTIVE', async () => {
    await expectError(run({ input: baseInput({ receivingNumberId: 'num-off' }) }), 400, 'RECEIVING_NUMBER_INACTIVE');
  });

  it('numéro d’une autre copropriété ou inconnu : RECEIVING_NUMBER_INACTIVE', async () => {
    await expectError(
      run({ input: baseInput({ receivingNumberId: 'num-foreign' }) }),
      400,
      'RECEIVING_NUMBER_INACTIVE'
    );
    await expectError(run({ input: baseInput({ receivingNumberId: 'num-ghost' }) }), 400, 'RECEIVING_NUMBER_INACTIVE');
  });
});

describe('createDeclaration : périmètre (portail)', () => {
  it('lot d’une autre copropriété du copropriétaire : 404', async () => {
    await expectError(
      run({
        input: baseInput({ amount: 100, lines: [{ lotId: 'lot-other-syndic', amount: 100, chargeCallIds: [] }] })
      }),
      404
    );
  });

  it('lot hors périmètre : 404', async () => {
    await expectError(
      run({ input: baseInput({ amount: 100, lines: [{ lotId: 'lot-inconnu', amount: 100, chargeCallIds: [] }] }) }),
      404
    );
    expect(store.declarations).toHaveLength(0);
  });

  it('périmètre d’une autre agence ou contact étranger au périmètre : 404', async () => {
    await expectError(run({ actor: coowner({ scope: scope({ tenantId: 'tenant-b' }) }) }), 404);
    await expectError(run({ actor: coowner({ contactId: 'contact-9' }) }), 404);
  });

  it('appel d’un autre lot (ou invisible) : 404', async () => {
    store.visibleCalls = [];
    store.openCalls[LOT_1] = ['call-1'];
    await expectError(
      run({
        input: baseInput({ amount: 100, lines: [{ lotId: LOT_1, amount: 100, chargeCallIds: ['call-autre-lot'] }] })
      }),
      404
    );
  });

  it('appel visible mais soldé (non ouvert) : 404', async () => {
    store.visibleCalls = ['call-1'];
    store.openCalls[LOT_1] = [];
    await expectError(
      run({ input: baseInput({ amount: 100, lines: [{ lotId: LOT_1, amount: 100, chargeCallIds: ['call-1'] }] }) }),
      404
    );
  });

  describe('paiement en ligne sur le même appel (cas limite 9)', () => {
    it('course : un paiement en ligne apparu après la lecture rapide est vu dans la transaction, après le verrou', async () => {
      store.visibleCalls = ['call-1'];
      store.openCalls[LOT_1] = ['call-1'];
      store.onlineCheckouts = [{ lotId: LOT_1, chargeCallIds: ['call-1'], status: 'PENDING' }];
      // Lecture rapide : rien ; relecture sous verrou : le paiement en ligne.
      mockPrisma.syndicOnlineCheckout.findMany.mockResolvedValueOnce([]);
      await expectError(
        run({ input: baseInput({ amount: 100, lines: [{ lotId: LOT_1, amount: 100, chargeCallIds: ['call-1'] }] }) }),
        409,
        'CHARGE_CALL_ONLINE_PAYMENT_PENDING'
      );
      expect(mockPrisma.$executeRaw).toHaveBeenCalled();
      expect(store.declarations).toHaveLength(0);
    });

    const lineOn = (ids: string[]) =>
      baseInput({ amount: 100, lines: [{ lotId: LOT_1, amount: 100, chargeCallIds: ids }] });

    beforeEach(() => {
      store.visibleCalls = ['call-1', 'call-2'];
      store.openCalls[LOT_1] = ['call-1', 'call-2'];
    });

    it.each(['PENDING', 'REVIEW'])(
      'paiement en ligne %s : 409 CHARGE_CALL_ONLINE_PAYMENT_PENDING, rien n’est créé',
      async status => {
        store.onlineCheckouts = [{ lotId: LOT_1, chargeCallIds: ['call-2'], status }];
        await expect(run({ input: lineOn(['call-1', 'call-2']) })).rejects.toMatchObject({
          statusCode: 409,
          code: 'CHARGE_CALL_ONLINE_PAYMENT_PENDING',
          data: { chargeCallIds: ['call-2'] }
        });
        expect(store.declarations).toHaveLength(0);
      }
    );

    it('paiement en ligne sur un autre appel ou un autre lot : la déclaration passe', async () => {
      store.onlineCheckouts = [
        { lotId: LOT_1, chargeCallIds: ['call-2'], status: 'PENDING' },
        { lotId: LOT_2, chargeCallIds: ['call-1'], status: 'REVIEW' }
      ];
      await expect(run({ input: lineOn(['call-1']) })).resolves.toMatchObject({ declarationId: expect.any(String) });
    });
  });

  it('appel ouvert mais antérieur à l’acquisition (non visible) : 404', async () => {
    store.visibleCalls = [];
    store.openCalls[LOT_1] = ['call-1'];
    await expectError(
      run({ input: baseInput({ amount: 100, lines: [{ lotId: LOT_1, amount: 100, chargeCallIds: ['call-1'] }] }) }),
      404
    );
  });

  it('plus de 24 appels par ligne : VALIDATION_ERROR', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `c${i}`);
    await expectError(
      run({ input: baseInput({ amount: 100, lines: [{ lotId: LOT_1, amount: 100, chargeCallIds: ids }] }) }),
      400,
      'VALIDATION_ERROR'
    );
  });
});

describe('createDeclaration : gestionnaire', () => {
  const manager = (declaredForContactId?: string | null) => ({
    type: 'MANAGER' as const,
    userId: 'user-1',
    declaredForContactId
  });

  it('sans copropriétaire désigné : declaredByUserId renseigné, pas de contact, audit sans type portail', async () => {
    await run({ actor: manager() });
    expect(store.declarations[0]).toMatchObject({ declaredByUserId: 'user-1', declaredByContactId: null });
    expect(auditEvents[0].actorUserId).toBe('user-1');
    expect(auditEvents[0].actorType).toBeUndefined();
  });

  it('avec declaredForContactId propriétaire des lots : contact enregistré', async () => {
    store.contacts = [{ id: 'contact-7' }];
    store.ownerProfiles = [
      { contactId: 'contact-7', lotId: LOT_1, ownedSince: new Date(0), ownedUntil: null },
      { contactId: 'contact-7', lotId: LOT_2, ownedSince: new Date(0), ownedUntil: null }
    ];
    await run({ actor: manager('contact-7') });
    expect(store.declarations[0]).toMatchObject({ declaredByUserId: 'user-1', declaredByContactId: 'contact-7' });
  });

  it('contact non copropriétaire de tous les lots : 404', async () => {
    store.contacts = [{ id: 'contact-7' }];
    store.ownerProfiles = [{ contactId: 'contact-7', lotId: LOT_1, ownedSince: new Date(0), ownedUntil: null }];
    await expectError(run({ actor: manager('contact-7') }), 404);
  });

  it('contact dont la détention est terminée : 404 ; contact d’une autre agence : 404', async () => {
    store.contacts = [{ id: 'contact-7' }];
    store.ownerProfiles = [
      { contactId: 'contact-7', lotId: LOT_1, ownedSince: new Date(0), ownedUntil: new Date('2026-01-01') },
      { contactId: 'contact-7', lotId: LOT_2, ownedSince: new Date(0), ownedUntil: null }
    ];
    await expectError(run({ actor: manager('contact-7') }), 404);
    await expectError(run({ actor: manager('contact-fantome') }), 404);
  });

  it('lot d’une autre copropriété : 404', async () => {
    store.foreignLots.add(LOT_2);
    await expectError(run({ actor: manager() }), 404);
  });

  it('appel ouvert du lot : accepté sans contrôle de visibilité portail', async () => {
    store.openCalls[LOT_1] = ['call-1'];
    await run({
      actor: manager(),
      input: baseInput({ amount: 100, lines: [{ lotId: LOT_1, amount: 100, chargeCallIds: ['call-1'] }] })
    });
    expect(mockPrisma.chargeCall.findMany).not.toHaveBeenCalled();
    await expectError(
      run({
        actor: manager(),
        input: baseInput({
          amount: 100,
          transactionReference: 'AUTRE001',
          lines: [{ lotId: LOT_1, amount: 100, chargeCallIds: ['call-xx'] }]
        })
      }),
      404
    );
  });
});

describe('createDeclaration : limite et doublon', () => {
  it('10 déclarations PENDING déjà sur un lot : DECLARATION_PENDING_LIMIT ; 9 passent', async () => {
    store.pendingByLot[LOT_2] = 9;
    await expect(run()).resolves.toBeDefined();
    store.pendingByLot[LOT_2] = 10;
    await expectError(
      run({ input: baseInput({ transactionReference: 'LIMITE10' }) }),
      409,
      'DECLARATION_PENDING_LIMIT'
    );
  });

  it('référence déjà PENDING ou APPROVED sur ce numéro, même autre copropriété : 409', async () => {
    store.declarations.push({
      tenantId: TENANT,
      receivingPhone: '+2250101010101',
      transactionReference: 'MP261017.ABC',
      status: 'APPROVED'
    });
    const before = store.declarations.length;
    await expectError(run(), 409, 'DECLARATION_REFERENCE_USED');
    expect(store.declarations).toHaveLength(before);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('référence d’une déclaration annulée ou rejetée : de nouveau libre', async () => {
    store.declarations.push({
      tenantId: TENANT,
      receivingPhone: '+2250101010101',
      transactionReference: 'MP261017.ABC',
      status: 'CANCELED'
    });
    await expect(run()).resolves.toBeDefined();
  });

  it('P2002 de l’index partiel (course) : 409 DECLARATION_REFERENCE_USED', async () => {
    mockPrisma.syndicPaymentDeclaration.create.mockRejectedValueOnce(
      Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: 'syndic_payment_declarations_ref_active_uq' }
      })
    );
    await expectError(run(), 409, 'DECLARATION_REFERENCE_USED');
    expect(auditEvents).toHaveLength(0);
  });

  it('P2002 sur les colonnes de la référence : 409 ; sur une autre cible : erreur d’origine', async () => {
    mockPrisma.syndicPaymentDeclaration.create.mockRejectedValueOnce(
      Object.assign(new Error('x'), {
        code: 'P2002',
        meta: { target: ['tenant_id', 'receiving_phone', 'transaction_reference'] }
      })
    );
    await expectError(run(), 409, 'DECLARATION_REFERENCE_USED');

    const other = Object.assign(new Error('autre unicité'), { code: 'P2002', meta: { target: ['proof_read_id'] } });
    mockPrisma.syndicPaymentDeclaration.create.mockRejectedValueOnce(other);
    await expect(run({ input: baseInput({ transactionReference: 'AUTRE002' }) })).rejects.toBe(other);
  });
});

describe('createDeclaration : capture', () => {
  const proof = { buffer: Buffer.from('fake'), originalname: 'preuve.png', mimetype: 'image/png' };
  const stored = (declarationId: string) => ({
    fileUrl: `/uploads/syndics/payment-proofs/${TENANT}/${SYNDIC}/${declarationId}.png`,
    sha256: 'abc123',
    kind: 'png',
    mimeType: 'image/png',
    sizeBytes: 4
  });

  it('capture exigée et absente : DECLARATION_PROOF_REQUIRED', async () => {
    store.rules = { enabled: true, proofRequired: true };
    await expectError(run(), 400, 'DECLARATION_PROOF_REQUIRED');
    expect(mockSaveProof).not.toHaveBeenCalled();
  });

  it('capture fournie : enregistrée sous l’identifiant de la déclaration, empreinte et chemin stockés', async () => {
    store.rules = { enabled: true, proofRequired: true };
    mockSaveProof.mockImplementation(async ({ declarationId }: Row) => stored(declarationId));
    const { declarationId } = await run({ proof });
    expect(mockSaveProof).toHaveBeenCalledWith({
      tenantId: TENANT,
      syndicateId: SYNDIC,
      declarationId,
      file: proof
    });
    expect(store.declarations[0]).toMatchObject({
      proofFileUrl: stored(declarationId).fileUrl,
      proofSha256: 'abc123'
    });
    expect(auditEvents[0].payload).toMatchObject({ hasProof: true });
    expect(JSON.stringify(auditEvents[0])).not.toContain('abc123');
    expect(unlinkSpy).not.toHaveBeenCalled();
  });

  it('capture invalide : l’erreur de saveDeclarationProof remonte, rien n’est créé', async () => {
    const { AppError } = jest.requireActual('../../src/middleware/error-middleware');
    mockSaveProof.mockRejectedValue(new AppError('type', 400, 'DECLARATION_PROOF_INVALID'));
    await expectError(run({ proof }), 400, 'DECLARATION_PROOF_INVALID');
    expect(store.declarations).toHaveLength(0);
  });

  it('échec de la création : le fichier déjà écrit est supprimé', async () => {
    let declarationId = '';
    mockSaveProof.mockImplementation(async (p: Row) => {
      declarationId = p.declarationId;
      return stored(p.declarationId);
    });
    mockPrisma.syndicPaymentDeclaration.create.mockRejectedValueOnce(new Error('base indisponible'));
    await expect(run({ proof })).rejects.toThrow('base indisponible');
    expect(unlinkSpy).toHaveBeenCalledTimes(1);
    expect(unlinkSpy).toHaveBeenCalledWith(
      path.resolve('/uploads-root', `syndics/payment-proofs/${TENANT}/${SYNDIC}/${declarationId}.png`)
    );
  });

  it('P2002 après écriture du fichier : fichier supprimé et 409', async () => {
    mockSaveProof.mockImplementation(async (p: Row) => stored(p.declarationId));
    mockPrisma.syndicPaymentDeclaration.create.mockRejectedValueOnce(
      Object.assign(new Error('x'), { code: 'P2002', meta: { target: 'syndic_payment_declarations_ref_active_uq' } })
    );
    await expectError(run({ proof }), 409, 'DECLARATION_REFERENCE_USED');
    expect(unlinkSpy).toHaveBeenCalledTimes(1);
  });

  describe('lecture IA (proofReadId, T064)', () => {
    const READ_ID = 'a0a0a0a0-0000-4000-8000-000000000000';
    const tempUrl = `/uploads/syndics/payment-proofs/tmp/${TENANT}/${READ_ID}.png`;
    const aiRead = (over: Row = {}): Row => ({
      id: READ_ID,
      tenantId: TENANT,
      syndicateId: SYNDIC,
      contactId: 'contact-1',
      consumedAt: null,
      expiresAt: new Date(NOW.getTime() + 3_600_000),
      tempFileUrl: tempUrl,
      result: {
        quality: 'OK',
        operator: 'ORANGE',
        amount: 30000,
        paidAt: '2026-10-17T10:00:00.000Z',
        transactionReference: 'MP261017.ABC',
        payerPhone: '+2250707070707',
        recipientPhone: '+2250909090909',
        recipientName: 'Syndic',
        confidence: { amount: 0.9 }
      },
      ...over
    });
    const promoted = (declarationId: string) => ({
      fileUrl: `/uploads/syndics/payment-proofs/${TENANT}/${SYNDIC}/${declarationId}.png`,
      sha256: 'promoted-sha',
      kind: 'png',
      mimeType: 'image/png',
      sizeBytes: 4
    });
    const withRead = (over: Row = {}) => run({ input: baseInput({ proofReadId: READ_ID }), ...over });

    beforeEach(() => {
      mockPromote.mockImplementation(async ({ declarationId }: Row) => promoted(declarationId));
    });

    it('promeut la capture, lie la lecture, mémorise aiPrefill et consomme la lecture', async () => {
      store.proofReads = [aiRead()];
      const { declarationId } = await withRead();
      expect(mockPromote).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT, syndicateId: SYNDIC, tempFileUrl: tempUrl, keepSource: true })
      );
      expect(store.declarations[0]).toMatchObject({
        id: declarationId,
        proofReadId: READ_ID,
        proofFileUrl: promoted(declarationId).fileUrl,
        proofSha256: 'promoted-sha',
        aiEditedFields: []
      });
      expect(store.declarations[0].aiPrefill).toMatchObject({ readId: READ_ID, recipientPhone: '+2250909090909' });
      expect(store.proofReads[0].consumedAt).toEqual(NOW);
      expect(store.proofReads[0].tempFileUrl).toBeNull();
      expect(mockDiscard).toHaveBeenCalledWith(TENANT, tempUrl);
      expect(auditEvents[0].payload).toMatchObject({ aiPrefilled: true, aiEditedFields: [] });
    });

    it('suppression du temporaire en échec : le chemin reste en base pour la purge', async () => {
      store.proofReads = [aiRead()];
      mockDiscard.mockResolvedValue(false);
      await withRead();
      expect(store.proofReads[0].consumedAt).toEqual(NOW);
      expect(store.proofReads[0].tempFileUrl).toBe(tempUrl);
    });

    it('satisfait la capture exigée', async () => {
      store.rules = { enabled: true, proofRequired: true };
      store.proofReads = [aiRead()];
      await expect(withRead()).resolves.toMatchObject({ declarationId: expect.any(String) });
    });

    it('enregistre les champs proposés puis retouchés', async () => {
      store.proofReads = [aiRead()];
      await run({
        input: baseInput({
          proofReadId: READ_ID,
          payerPhone: '05 05 05 05 05',
          transactionReference: 'MP261017.XYZ',
          lines: [
            { lotId: LOT_1, amount: 20000, chargeCallIds: [] },
            { lotId: LOT_2, amount: 5000, chargeCallIds: [] }
          ],
          amount: 25000
        })
      });
      expect(store.declarations[0].aiEditedFields).toEqual(['amount', 'transactionReference', 'payerPhone']);
    });

    it.each([
      ['inconnue', () => []],
      ['d’un autre contact', () => [aiRead({ contactId: 'contact-9' })]],
      ['d’une autre agence', () => [aiRead({ tenantId: 'tenant-b' })]],
      ['d’une autre copropriété', () => [aiRead({ syndicateId: 'syndic-2' })]],
      ['déjà utilisée', () => [aiRead({ consumedAt: new Date(NOW.getTime() - 1000) })]],
      ['expirée', () => [aiRead({ expiresAt: new Date(NOW.getTime() - 1000) })]],
      ['sans capture temporaire', () => [aiRead({ tempFileUrl: null })]]
    ])('lecture %s : PROOF_READ_INVALID (409), rien n’est créé', async (_name, make) => {
      store.proofReads = make();
      await expectError(withRead(), 409, 'PROOF_READ_INVALID');
      expect(store.declarations).toHaveLength(0);
      expect(mockPromote).not.toHaveBeenCalled();
    });

    it('capture temporaire disparue : PROOF_READ_INVALID', async () => {
      const { NotFoundError } = jest.requireActual('../../src/middleware/error-middleware');
      store.proofReads = [aiRead()];
      mockPromote.mockRejectedValue(new NotFoundError('Capture introuvable.'));
      await expectError(withRead(), 409, 'PROOF_READ_INVALID');
    });

    it('échec de la transaction : capture définitive supprimée, lecture non consommée, temporaire gardé', async () => {
      store.proofReads = [aiRead()];
      mockPrisma.syndicPaymentDeclaration.create.mockRejectedValueOnce(new Error('boom'));
      await expect(withRead()).rejects.toThrow('boom');
      expect(unlinkSpy).toHaveBeenCalled();
      expect(mockDiscard).not.toHaveBeenCalled();
    });

    it('lecture consommée entre-temps (course) : PROOF_READ_INVALID', async () => {
      store.proofReads = [aiRead()];
      mockPrisma.syndicPaymentProofRead.updateMany.mockResolvedValueOnce({ count: 0 });
      await expectError(withRead(), 409, 'PROOF_READ_INVALID');
      expect(store.declarations).toHaveLength(0);
    });

    it('réservé au portail : un gestionnaire ne peut pas passer de lecture', async () => {
      store.proofReads = [aiRead()];
      await expectError(withRead({ actor: { type: 'MANAGER', userId: 'user-1' } }), 400, 'VALIDATION_ERROR');
    });
  });

  it('fichier et proofReadId ensemble : 400 VALIDATION_ERROR', async () => {
    await expectError(
      run({ proof, input: baseInput({ proofReadId: 'a0a0a0a0-0000-4000-8000-000000000000' }) }),
      400,
      'VALIDATION_ERROR'
    );
    expect(mockSaveProof).not.toHaveBeenCalled();
  });
});

describe('createDeclaration : rien n’est crédité (R14)', () => {
  it('n’écrit que la déclaration et ses lignes, dans une seule transaction', async () => {
    await run();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.syndicPaymentDeclaration.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2); // un verrou par lot
  });
});
