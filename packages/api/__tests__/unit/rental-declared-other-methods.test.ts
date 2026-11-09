/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contrat 049 §1.3, extension « autres modes » : le locataire (ou le gestionnaire pour un
 * tiers) déclare aussi un paiement en espèces, chèque, virement, carte ou autre.
 * Couvre la création, la disponibilité (`allowedMethods`) et l'e-mail immédiat à l'agence.
 */
type Row = Record<string, any>;

const TENANT = 'tenant-a';
const PAID = () => new Date(Date.now() - 3_600_000).toISOString();

const db: { settings: Row | null; numbers: Row[]; declarations: Row[] } = {
  settings: null,
  numbers: [],
  declarations: []
};

const mockPrisma: Row = {
  rentalDeclaredPaymentSettings: { findFirst: jest.fn(async () => db.settings) },
  rentalReceivingNumber: {
    count: jest.fn(
      async ({ where }: Row) => db.numbers.filter(n => n.tenant_id === where.tenant_id && n.is_active).length
    ),
    findFirst: jest.fn(
      async ({ where }: Row) => db.numbers.find(n => n.id === where.id && n.tenant_id === where.tenant_id) ?? null
    ),
    findMany: jest.fn(async ({ where }: Row) => db.numbers.filter(n => n.tenant_id === where.tenant_id && n.is_active))
  },
  rentalLease: {
    findFirst: jest.fn(async ({ where }: Row) =>
      where.tenant_id === TENANT ? { id: where.id, lease_number: 'B-042' } : null
    )
  },
  rentalInstallment: { findFirst: jest.fn(async () => null) },
  rentalPaymentProofRead: { findFirst: jest.fn(async () => null), updateMany: jest.fn(async () => ({ count: 1 })) },
  rentalPaymentDeclaration: {
    findFirst: jest.fn(async ({ where }: Row) => {
      if (where.payment_method && where.reference_normalized) {
        return (
          db.declarations.find(
            d =>
              d.lease_id === where.lease_id &&
              d.payment_method === where.payment_method &&
              d.reference_normalized === where.reference_normalized &&
              d.amount === where.amount
          ) ?? null
        );
      }
      if (where.reference_normalized) return null;
      return db.declarations.find(d => d.amount === where.amount && d.installment_id === where.installment_id) ?? null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      db.declarations.push(data);
      return { id: data.id };
    })
  },
  $transaction: jest.fn(async (fn: any) => fn(mockPrisma))
};
jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/lib/rental/declared-payment/proof-files', () => ({
  saveDeclarationProof: jest.fn(),
  promoteTempProofToDeclaration: jest.fn(),
  discardTempProof: jest.fn(),
  removeDeclarationProof: jest.fn()
}));
const notifyAgency = jest.fn();
jest.mock('../../src/lib/rental/declared-payment/agency-notification', () => ({
  notifyAgencyOfDeclaration: (...a: any[]) => notifyAgency(...a)
}));
jest.mock('../../src/lib/payment-proof/vision', () => ({ isPaymentProofVisionConfigured: () => false }));

import { createRentalDeclaration } from '../../src/lib/rental/declared-payment/declaration-create';
import { getAvailability } from '../../src/lib/rental/declared-payment/portal';
import { ErrorCode } from '../../src/middleware/error-middleware';

const cash = (extra: Row = {}) => ({
  tenantId: TENANT,
  leaseId: 'lease-1',
  declaredByClientId: 'client-1',
  actor: 'TENANT' as const,
  paymentMethod: 'CASH',
  amount: 150000,
  paidAt: PAID(),
  ...extra
});

async function expectCode(promise: Promise<unknown>, code: string, status?: number) {
  await expect(promise).rejects.toMatchObject({ code, ...(status ? { statusCode: status } : {}) });
}

beforeEach(() => {
  jest.clearAllMocks();
  notifyAgency.mockResolvedValue(undefined);
  db.settings = null;
  db.numbers = [
    { id: 'num-1', tenant_id: TENANT, phone: '+2250700000001', is_active: true, operator: 'ORANGE', label: null }
  ];
  db.declarations = [];
});

describe('createRentalDeclaration : autres modes', () => {
  it('espèces sans numéro ni référence : déclaration PENDING avec mode CASH', async () => {
    const out = await createRentalDeclaration(cash());
    expect(out.duplicateSuspected).toBe(false);
    expect(db.declarations[0]).toMatchObject({
      status: 'PENDING',
      payment_method: 'CASH',
      mobile_operator: null,
      receiving_number_id: null,
      receiving_phone: null,
      reference: null,
      reference_normalized: null
    });
  });

  it('fonctionne même sans AUCUN numéro de réception actif', async () => {
    db.numbers = [];
    await createRentalDeclaration(cash({ paymentMethod: 'BANK_TRANSFER' }));
    expect(db.declarations[0].payment_method).toBe('BANK_TRANSFER');
  });

  it('le mobile money (défaut) reste refusé sans numéro actif', async () => {
    db.numbers = [];
    await expectCode(
      createRentalDeclaration(
        cash({ paymentMethod: undefined, receivingNumberId: 'num-1', operator: 'ORANGE', reference: 'MP123456' })
      ),
      ErrorCode.RENTAL_DECLARED_PAYMENT_DISABLED,
      400
    );
  });

  it('mobile money par défaut : référence toujours obligatoire', async () => {
    await expectCode(
      createRentalDeclaration(cash({ paymentMethod: undefined, receivingNumberId: 'num-1', operator: 'ORANGE' })),
      ErrorCode.RENTAL_DECLARATION_REFERENCE_INVALID,
      400
    );
  });

  it('réglage coupé : refus aussi pour les autres modes', async () => {
    db.settings = { enabled: false };
    await expectCode(createRentalDeclaration(cash()), ErrorCode.RENTAL_DECLARED_PAYMENT_DISABLED, 400);
  });

  it('refuse un receivingNumberId ou un opérateur avec un mode non mobile : 400', async () => {
    await expectCode(createRentalDeclaration(cash({ receivingNumberId: 'num-1' })), ErrorCode.VALIDATION_ERROR, 400);
    await expectCode(createRentalDeclaration(cash({ operator: 'ORANGE' })), ErrorCode.VALIDATION_ERROR, 400);
    expect(db.declarations).toHaveLength(0);
  });

  it('refuse un mode inconnu ou non déclarable (DIRECT_DEBIT) : 400', async () => {
    await expectCode(createRentalDeclaration(cash({ paymentMethod: 'DIRECT_DEBIT' })), ErrorCode.VALIDATION_ERROR, 400);
    await expectCode(createRentalDeclaration(cash({ paymentMethod: 'BITCOIN' })), ErrorCode.VALIDATION_ERROR, 400);
  });

  it('plafond de montant et bornes de date inchangés', async () => {
    await expectCode(
      createRentalDeclaration(cash({ amount: 5_000_001 })),
      ErrorCode.RENTAL_DECLARATION_AMOUNT_TOO_HIGH,
      400
    );
    await expectCode(
      createRentalDeclaration(cash({ paidAt: new Date(Date.now() + 86_400_000).toISOString() })),
      ErrorCode.RENTAL_DECLARATION_DATE_OUT_OF_RANGE,
      400
    );
  });

  it('référence facultative : normalisée si fournie, invalide refusée', async () => {
    await createRentalDeclaration(cash({ paymentMethod: 'CHECK', reference: 'chq 0001234' }));
    expect(db.declarations[0]).toMatchObject({ payment_method: 'CHECK', reference: 'CHQ0001234' });
    await expectCode(
      createRentalDeclaration(cash({ paymentMethod: 'CHECK', reference: '!!' })),
      ErrorCode.RENTAL_DECLARATION_REFERENCE_INVALID,
      400
    );
  });

  it('doublon bloquant sur référence + montant + bail + mode, pas sur un autre mode', async () => {
    await createRentalDeclaration(cash({ paymentMethod: 'CHECK', reference: 'CHQ0001234' }));
    await expectCode(
      createRentalDeclaration(cash({ paymentMethod: 'CHECK', reference: 'CHQ0001234' })),
      ErrorCode.RENTAL_DECLARATION_DUPLICATE_REFERENCE,
      409
    );
    await expect(
      createRentalDeclaration(cash({ paymentMethod: 'BANK_TRANSFER', reference: 'CHQ0001234' }))
    ).resolves.toMatchObject({ declarationId: expect.any(String) });
  });

  it('le gestionnaire peut aussi déclarer en espèces pour un tiers', async () => {
    await createRentalDeclaration(cash({ actor: 'MANAGER', declaredByUserId: 'user-9' }));
    expect(db.declarations[0]).toMatchObject({ payment_method: 'CASH', declared_by_user_id: 'user-9' });
  });
});

describe('e-mail immédiat à l agence', () => {
  it('est envoyé après la création, avec le mode et sans référence inventée', async () => {
    const out = await createRentalDeclaration(cash());
    expect(notifyAgency).toHaveBeenCalledTimes(1);
    expect(notifyAgency.mock.calls[0][0]).toMatchObject({
      tenantId: TENANT,
      leaseId: 'lease-1',
      declarationId: out.declarationId,
      tenantClientId: 'client-1',
      leaseNumber: 'B-042',
      details: { amount: 150000, paymentMethod: 'CASH', reference: null, mobileOperator: null }
    });
  });

  it("une erreur d'envoi n'empêche jamais la création", async () => {
    notifyAgency.mockRejectedValue(new Error('SMTP down'));
    await expect(createRentalDeclaration(cash())).resolves.toMatchObject({ declarationId: expect.any(String) });
    expect(db.declarations).toHaveLength(1);
  });

  it('rien n est envoyé quand la création est refusée', async () => {
    await expect(createRentalDeclaration(cash({ amount: 0 }))).rejects.toBeDefined();
    expect(notifyAgency).not.toHaveBeenCalled();
  });
});

describe('getAvailability : allowedMethods', () => {
  it('avec un numéro actif : tous les modes', async () => {
    const out = await getAvailability(TENANT, 'client-1');
    expect(out.available).toBe(true);
    expect(out.allowedMethods).toEqual(['MOBILE_MONEY', 'CASH', 'CHECK', 'BANK_TRANSFER', 'CARD', 'OTHER']);
    expect(out.receivingNumbers).toHaveLength(1);
  });

  it('sans numéro actif : tous les modes sauf le mobile money, la déclaration reste disponible', async () => {
    db.numbers = [];
    const out = await getAvailability(TENANT, 'client-1');
    expect(out.enabled).toBe(true);
    expect(out.available).toBe(true);
    expect(out.allowedMethods).toEqual(['CASH', 'CHECK', 'BANK_TRANSFER', 'CARD', 'OTHER']);
    expect(out.receivingNumbers).toEqual([]);
    expect(out.aiPrefillAvailable).toBe(false);
  });

  it('réglage coupé : aucun mode', async () => {
    db.settings = { enabled: false };
    const out = await getAvailability(TENANT, 'client-1');
    expect(out).toMatchObject({ enabled: false, available: false, allowedMethods: [], receivingNumbers: [] });
  });
});
