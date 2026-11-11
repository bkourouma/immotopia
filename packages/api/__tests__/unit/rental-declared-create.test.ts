/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contrat 049 §1.3 : `createRentalDeclaration` (règles métier du paiement locatif déclaré).
 */
type Row = Record<string, any>;

const TENANT = 'tenant-a';
const PAID = () => new Date(Date.now() - 3_600_000).toISOString();

const db: { settings: Row | null; numbers: Row[]; declarations: Row[]; installment: Row | null; reads: Row[] } = {
  settings: null,
  numbers: [],
  declarations: [],
  installment: null,
  reads: []
};

const mockPrisma: Row = {
  rentalDeclaredPaymentSettings: { findFirst: jest.fn(async () => db.settings) },
  rentalReceivingNumber: {
    count: jest.fn(
      async ({ where }: Row) => db.numbers.filter(n => n.tenant_id === where.tenant_id && n.is_active).length
    ),
    findFirst: jest.fn(
      async ({ where }: Row) => db.numbers.find(n => n.id === where.id && n.tenant_id === where.tenant_id) ?? null
    )
  },
  rentalLease: { findFirst: jest.fn(async ({ where }: Row) => (where.tenant_id === TENANT ? { id: where.id } : null)) },
  rentalInstallment: { findFirst: jest.fn(async () => db.installment) },
  rentalPaymentProofRead: {
    findFirst: jest.fn(async () => db.reads[0] ?? null),
    updateMany: jest.fn(async () => ({ count: 1 }))
  },
  rentalPaymentDeclaration: {
    findFirst: jest.fn(async ({ where }: Row) => {
      if (where.reference_normalized) {
        return (
          db.declarations.find(
            d => d.reference_normalized === where.reference_normalized && d.receiving_phone === where.receiving_phone
          ) ?? null
        );
      }
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

const proofApi = {
  saveDeclarationProof: jest.fn(async () => ({ fileUrl: '/uploads/portal/payments/tenant-a/x.jpg', sha256: 'h' })),
  promoteTempProofToDeclaration: jest.fn(async () => ({
    fileUrl: '/uploads/portal/payments/tenant-a/y.jpg',
    sha256: 'h'
  })),
  discardTempProof: jest.fn(async () => true),
  removeDeclarationProof: jest.fn(async () => undefined)
};
jest.mock('../../src/lib/rental/declared-payment/proof-files', () => proofApi);

import { createRentalDeclaration } from '../../src/lib/rental/declared-payment/declaration-create';
import { logAuditEvent } from '../../src/services/audit-service';
import { ErrorCode } from '../../src/middleware/error-middleware';

const base = () => ({
  tenantId: TENANT,
  leaseId: 'lease-1',
  declaredByClientId: 'client-1',
  actor: 'TENANT' as const,
  receivingNumberId: 'num-1',
  operator: 'ORANGE',
  reference: 'cp 2611.0901',
  amount: 150000,
  paidAt: PAID()
});

async function expectCode(promise: Promise<unknown>, code: string, status?: number) {
  await expect(promise).rejects.toMatchObject({ code, ...(status ? { statusCode: status } : {}) });
}

beforeEach(() => {
  jest.clearAllMocks();
  db.settings = null; // défauts : activé, capture facultative
  db.numbers = [
    { id: 'num-1', tenant_id: TENANT, phone: '+2250700000001', is_active: true },
    { id: 'num-off', tenant_id: TENANT, phone: '+2250700000002', is_active: false },
    { id: 'num-b', tenant_id: 'tenant-b', phone: '+2250700000003', is_active: true }
  ];
  db.declarations = [];
  db.installment = null;
  db.reads = [];
});

describe('createRentalDeclaration', () => {
  it('crée une déclaration PENDING en MOBILE_MONEY avec référence normalisée et numéro copié', async () => {
    const out = await createRentalDeclaration(base());
    expect(out.duplicateSuspected).toBe(false);
    const row = db.declarations[0];
    expect(row).toMatchObject({
      tenant_id: TENANT,
      status: 'PENDING',
      payment_method: 'MOBILE_MONEY',
      reference: 'CP2611.0901',
      reference_normalized: 'CP2611.0901',
      receiving_phone: '+2250700000001',
      mobile_operator: 'ORANGE',
      ai_prefilled: false
    });
  });

  it('refuse un doublon de référence sur le même numéro : 409', async () => {
    await createRentalDeclaration(base());
    await expectCode(createRentalDeclaration(base()), ErrorCode.RENTAL_DECLARATION_DUPLICATE_REFERENCE, 409);
  });

  it('signale un doublon probable (même montant, même échéance) sans bloquer', async () => {
    await createRentalDeclaration(base());
    const out = await createRentalDeclaration({ ...base(), reference: 'AUTRE-REF-2' });
    expect(out.duplicateSuspected).toBe(true);
  });

  it('refuse un montant au-delà du plafond, nul ou non entier', async () => {
    await expectCode(
      createRentalDeclaration({ ...base(), amount: 5_000_001 }),
      ErrorCode.RENTAL_DECLARATION_AMOUNT_TOO_HIGH,
      400
    );
    await expectCode(createRentalDeclaration({ ...base(), amount: 0 }), ErrorCode.RENTAL_DECLARATION_AMOUNT_INVALID);
    await expectCode(
      createRentalDeclaration({ ...base(), amount: 1000.5 }),
      ErrorCode.RENTAL_DECLARATION_AMOUNT_INVALID
    );
  });

  it('messages de plafond et de date interpolés, sans jeton brut (BUG-2026-11-09-PLB-001)', async () => {
    const tooHigh = await createRentalDeclaration({ ...base(), amount: 5_000_001 }).catch((e: Error) => e);
    expect((tooHigh as Error).message).toContain('5 000 000 FCFA');
    expect((tooHigh as Error).message).not.toMatch(/[{}]/);
    const tooOld = await createRentalDeclaration({
      ...base(),
      paidAt: new Date(Date.now() - 91 * 86_400_000).toISOString()
    }).catch((e: Error) => e);
    expect((tooOld as Error).message).toContain('90 jours');
    expect((tooOld as Error).message).not.toMatch(/[{}]/);
  });

  it('refuse quand la fonction est désactivée, ou sans numéro actif', async () => {
    db.settings = { enabled: false };
    await expectCode(createRentalDeclaration(base()), ErrorCode.RENTAL_DECLARED_PAYMENT_DISABLED, 400);
    db.settings = null;
    db.numbers = db.numbers.map(n => ({ ...n, is_active: false }));
    await expectCode(createRentalDeclaration(base()), ErrorCode.RENTAL_DECLARED_PAYMENT_DISABLED);
  });

  it('exige la capture si proofRequired, y compris côté gestionnaire', async () => {
    db.settings = { enabled: true, proof_required: true };
    await expectCode(createRentalDeclaration(base()), ErrorCode.RENTAL_DECLARATION_PROOF_REQUIRED, 400);
    await expectCode(
      createRentalDeclaration({ ...base(), actor: 'MANAGER', declaredByUserId: 'user-1' }),
      ErrorCode.RENTAL_DECLARATION_PROOF_REQUIRED
    );
    const out = await createRentalDeclaration({
      ...base(),
      proof: { buffer: Buffer.from('x'), mimetype: 'image/jpeg' }
    });
    expect(out.declarationId).toBeTruthy();
    expect(proofApi.saveDeclarationProof).toHaveBeenCalled();
    expect(db.declarations[0].proof_file_url).toContain('/uploads/portal/payments/tenant-a/');
  });

  it("répond 404 pour un numéro d'une autre agence ou désactivé (portail) ; INACTIVE côté gestionnaire", async () => {
    await expectCode(
      createRentalDeclaration({ ...base(), receivingNumberId: 'num-b' }),
      ErrorCode.RENTAL_RECEIVING_NUMBER_NOT_FOUND,
      404
    );
    await expectCode(
      createRentalDeclaration({ ...base(), receivingNumberId: 'num-off' }),
      ErrorCode.RENTAL_RECEIVING_NUMBER_NOT_FOUND,
      404
    );
    await expectCode(
      createRentalDeclaration({ ...base(), receivingNumberId: 'num-off', actor: 'MANAGER' }),
      ErrorCode.RENTAL_RECEIVING_NUMBER_INACTIVE,
      400
    );
  });

  it("borne paidAt, valide la référence, le téléphone et l'échéance", async () => {
    await expectCode(
      createRentalDeclaration({ ...base(), paidAt: new Date(Date.now() + 3_600_000).toISOString() }),
      ErrorCode.RENTAL_DECLARATION_DATE_OUT_OF_RANGE
    );
    await expectCode(
      createRentalDeclaration({ ...base(), paidAt: new Date(Date.now() - 91 * 86_400_000).toISOString() }),
      ErrorCode.RENTAL_DECLARATION_DATE_OUT_OF_RANGE
    );
    await expectCode(
      createRentalDeclaration({ ...base(), reference: 'ab' }),
      ErrorCode.RENTAL_DECLARATION_REFERENCE_INVALID
    );
    await expectCode(createRentalDeclaration({ ...base(), payerPhone: '12345' }), ErrorCode.INVALID_PHONE);
    db.installment = null;
    await expectCode(
      createRentalDeclaration({ ...base(), installmentId: 'inst-1' }),
      ErrorCode.RENTAL_DECLARATION_INSTALLMENT_INVALID,
      404
    );
    db.installment = { status: 'PAID', due_date: new Date('2026-01-01') };
    await expectCode(
      createRentalDeclaration({ ...base(), installmentId: 'inst-1' }),
      ErrorCode.RENTAL_DECLARATION_INSTALLMENT_INVALID
    );
  });

  it('lie une lecture IA : capture promue, champs retouchés signalés, lecture consommée', async () => {
    db.reads = [
      {
        id: 'read-1',
        temp_file_url: '/uploads/portal/payments/tmp/tenant-a/read-1.jpg',
        result: { amount: 100000, reference: 'CP2611.0901' }
      }
    ];
    await createRentalDeclaration({ ...base(), proofReadId: 'read-1' });
    const row = db.declarations[0];
    expect(row).toMatchObject({ ai_prefilled: true, proof_read_id: 'read-1' });
    expect(row.ai_edited_fields).toEqual(['amount']);
    expect(proofApi.promoteTempProofToDeclaration).toHaveBeenCalled();
    expect(mockPrisma.rentalPaymentProofRead.updateMany).toHaveBeenCalled();
  });

  it('refuse une lecture inconnue (409) et fichier + lecture ensemble', async () => {
    await expectCode(
      createRentalDeclaration({ ...base(), proofReadId: 'read-x' }),
      ErrorCode.RENTAL_PROOF_READ_INVALID,
      409
    );
    await expectCode(
      createRentalDeclaration({
        ...base(),
        proofReadId: 'read-x',
        proof: { buffer: Buffer.from('x'), mimetype: 'image/jpeg' }
      }),
      ErrorCode.RENTAL_DECLARATION_PROOF_INVALID
    );
  });

  it('journalise la saisie pour un tiers', async () => {
    await createRentalDeclaration({ ...base(), actor: 'MANAGER', declaredByUserId: 'user-1' });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'RENTAL_PAYMENT_DECLARATION_CREATED_FOR_THIRD_PARTY',
        actorUserId: 'user-1'
      })
    );
    expect(db.declarations[0].declared_by_user_id).toBe('user-1');
  });
});
