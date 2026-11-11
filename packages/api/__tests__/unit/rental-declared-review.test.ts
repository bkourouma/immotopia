/**
 * Contrat 049 §1.6 : validation (montant retenu, note de correction, compte du
 * numéro par défaut, déjà traité) et rejet (motifs, OTHER sans note, ancien corps).
 */
const declFindFirst = jest.fn();
const declUpdateMany = jest.fn();
const declUpdate = jest.fn();
const declFindFirstOrThrow = jest.fn();
const paymentCreate = jest.fn();
const treasuryFindFirst = jest.fn();
const logAuditEvent = jest.fn();
const assertTreasury = jest.fn();

const tx: any = {
  rentalPaymentDeclaration: {
    updateMany: (...a: any[]) => declUpdateMany(...a),
    update: (...a: any[]) => declUpdate(...a)
  },
  rentalPayment: { create: (...a: any[]) => paymentCreate(...a) },
  treasuryAccount: { findFirst: (...a: any[]) => treasuryFindFirst(...a) }
};

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentalPaymentDeclaration: {
      findFirst: (...a: any[]) => declFindFirst(...a),
      updateMany: (...a: any[]) => declUpdateMany(...a),
      findFirstOrThrow: (...a: any[]) => declFindFirstOrThrow(...a)
    },
    rentalLease: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: (fn: any) => fn(tx)
  }
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: (...a: any[]) => logAuditEvent(...a) }));
jest.mock('../../src/services/rental-installment-service', () => ({
  compteLocataireTx: jest.fn().mockResolvedValue('acc-1'),
  inscrireEcheanceFactureeTx: jest.fn(),
  libellePeriodeEcheance: jest.fn()
}));
jest.mock('../../src/services/rental-payment-service', () => ({
  inscrireAllocationTx: jest.fn(),
  inscrireReliquatTx: jest.fn(),
  libelleMoyen: jest.fn().mockReturnValue('Mobile Money')
}));
jest.mock('../../src/lib/treasury/accounts', () => ({
  assertTreasuryAccountUsableTx: (...a: any[]) => assertTreasury(...a)
}));
jest.mock('../../src/lib/finance/rental-direct-ledger', () => ({ syncDirectRentPaymentEntryTx: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));
jest.mock('../../src/lib/rental/declared-payment/declaration-dto', () => ({ loadDeclarationDtos: jest.fn() }));

import {
  approvePaymentDeclaration,
  rejectPaymentDeclaration
} from '../../src/services/rental-payment-declaration-service';

const declaration = {
  id: 'decl-1',
  tenant_id: 'tenant-A',
  lease_id: 'lease-1',
  declared_by: 'client-1',
  payment_method: 'MOBILE_MONEY',
  amount: 100000,
  mobile_operator: 'ORANGE',
  reference: 'MP123456',
  payment_date: new Date('2026-10-01'),
  installment_id: null,
  status: 'PENDING',
  lease: {},
  installment: null,
  declarer: {},
  receivingNumber: { treasury_account_number: '5522' }
};

beforeEach(() => {
  jest.clearAllMocks();
  declFindFirst.mockResolvedValue(declaration);
  declUpdateMany.mockResolvedValue({ count: 1 });
  paymentCreate.mockResolvedValue({ id: 'pay-1' });
  declUpdate.mockResolvedValue({ id: 'decl-1', status: 'APPROVED' });
  declFindFirstOrThrow.mockResolvedValue({ id: 'decl-1', status: 'REJECTED', lease: { lease_number: 'B-1' } });
  treasuryFindFirst.mockResolvedValue({ id: 'ta-5522' });
});

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e: any) {
    return { code: e.code, status: e.statusCode };
  }
  return null;
};

describe('approbation avec montant retenu', () => {
  it('sans correction : montant déclaré, corrected false, compte du numéro par défaut', async () => {
    const r = await approvePaymentDeclaration('tenant-A', 'decl-1', 'user-1');
    expect(r.corrected).toBe(false);
    expect(treasuryFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-A', accountNumber: '5522', isActive: true } })
    );
    expect(paymentCreate.mock.calls[0][0].data).toMatchObject({ amount: 100000, treasury_account_id: 'ta-5522' });
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('le compte du corps prime sur celui du numéro', async () => {
    await approvePaymentDeclaration('tenant-A', 'decl-1', 'user-1', undefined, 'ta-body');
    expect(treasuryFindFirst).not.toHaveBeenCalled();
    expect(paymentCreate.mock.calls[0][0].data.treasury_account_id).toBe('ta-body');
  });

  it('correction avec note : paiement du montant retenu, audit APPROVED_WITH_CORRECTION', async () => {
    const r = await approvePaymentDeclaration('tenant-A', 'decl-1', 'user-1', 'Montant reçu vérifié au relevé', null, {
      acceptedAmount: 80000
    });
    expect(r.corrected).toBe(true);
    expect(Number(paymentCreate.mock.calls[0][0].data.amount)).toBe(80000);
    expect(declUpdateMany.mock.calls[0][0].data).toMatchObject({ correction_note: 'Montant reçu vérifié au relevé' });
    expect(Number(declUpdateMany.mock.calls[0][0].data.accepted_amount)).toBe(80000);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'RENTAL_PAYMENT_DECLARATION_APPROVED_WITH_CORRECTION',
        entityId: 'decl-1'
      })
    );
  });

  it('correction sans note (ou trop courte) : 400 CORRECTION_NOTE_REQUIRED, rien créé', async () => {
    expect(
      await codeOf(approvePaymentDeclaration('tenant-A', 'decl-1', 'u', undefined, null, { acceptedAmount: 5 }))
    ).toEqual({
      code: 'RENTAL_DECLARATION_CORRECTION_NOTE_REQUIRED',
      status: 400
    });
    expect(
      await codeOf(approvePaymentDeclaration('tenant-A', 'decl-1', 'u', 'court', null, { acceptedAmount: 5 }))
    ).toMatchObject({
      code: 'RENTAL_DECLARATION_CORRECTION_NOTE_REQUIRED'
    });
    expect(paymentCreate).not.toHaveBeenCalled();
  });

  it('montant retenu <= 0 ou > 5 000 000 : 400 ACCEPTED_AMOUNT_INVALID', async () => {
    for (const bad of [0, -10, 5_000_001]) {
      expect(
        await codeOf(
          approvePaymentDeclaration('tenant-A', 'decl-1', 'u', 'une note suffisante', null, { acceptedAmount: bad })
        )
      ).toEqual({ code: 'RENTAL_DECLARATION_ACCEPTED_AMOUNT_INVALID', status: 400 });
    }
  });

  it('montant retenu égal au déclaré : pas de correction ni de note exigée', async () => {
    const r = await approvePaymentDeclaration('tenant-A', 'decl-1', 'u', undefined, null, { acceptedAmount: 100000 });
    expect(r.corrected).toBe(false);
  });

  it('déjà traitée : 409 ALREADY_REVIEWED ; inexistante : 404', async () => {
    declFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'decl-1' });
    expect(await codeOf(approvePaymentDeclaration('tenant-A', 'decl-1', 'u'))).toEqual({
      code: 'RENTAL_DECLARATION_ALREADY_REVIEWED',
      status: 409
    });
    declFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    expect(await codeOf(approvePaymentDeclaration('tenant-A', 'decl-1', 'u'))).toMatchObject({ status: 404 });
  });

  it('perte de la course atomique : 409 ALREADY_REVIEWED', async () => {
    declUpdateMany.mockResolvedValueOnce({ count: 0 });
    expect(await codeOf(approvePaymentDeclaration('tenant-A', 'decl-1', 'u'))).toMatchObject({
      code: 'RENTAL_DECLARATION_ALREADY_REVIEWED'
    });
  });
});

describe('rejet par motif', () => {
  it('motif NOT_FOUND sans note : accepté, motif stocké, audit REJECTED', async () => {
    await rejectPaymentDeclaration('tenant-A', 'decl-1', 'user-1', undefined, 'NOT_FOUND');
    expect(declUpdateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'decl-1', tenant_id: 'tenant-A', status: 'PENDING' },
      data: { status: 'REJECTED', reject_reason: 'NOT_FOUND', reviewed_by: 'user-1' }
    });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'RENTAL_PAYMENT_DECLARATION_REJECTED' })
    );
  });

  it('OTHER sans note : 400 REJECT_NOTE_REQUIRED', async () => {
    expect(await codeOf(rejectPaymentDeclaration('tenant-A', 'decl-1', 'u', '  ', 'OTHER'))).toEqual({
      code: 'RENTAL_DECLARATION_REJECT_NOTE_REQUIRED',
      status: 400
    });
    expect(declUpdateMany).not.toHaveBeenCalled();
  });

  it('ancien corps (note seule, motif par défaut) : lu comme OTHER avec la note', async () => {
    await rejectPaymentDeclaration('tenant-A', 'decl-1', 'u', 'Paiement non reçu sur le compte');
    expect(declUpdateMany.mock.calls[0][0].data).toMatchObject({
      reject_reason: 'OTHER',
      review_notes: 'Paiement non reçu sur le compte'
    });
  });

  it('note de 1 caractère avec motif explicite : 400 VALIDATION_ERROR', async () => {
    expect(await codeOf(rejectPaymentDeclaration('tenant-A', 'decl-1', 'u', 'x', 'WRONG_NUMBER'))).toEqual({
      code: 'VALIDATION_ERROR',
      status: 400
    });
    expect(declUpdateMany).not.toHaveBeenCalled();
  });

  it('note de 10 caractères avec motif explicite : acceptée', async () => {
    await rejectPaymentDeclaration('tenant-A', 'decl-1', 'u', '1234567890', 'WRONG_NUMBER');
    expect(declUpdateMany).toHaveBeenCalled();
  });

  it('ancien corps reviewNotes seul (sans motif) : courte note acceptée', async () => {
    await rejectPaymentDeclaration('tenant-A', 'decl-1', 'u', 'x');
    expect(declUpdateMany.mock.calls[0][0].data).toMatchObject({ reject_reason: 'OTHER', review_notes: 'x' });
  });

  it('déjà traitée : 409 ALREADY_REVIEWED', async () => {
    declFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'decl-1' });
    expect(await codeOf(rejectPaymentDeclaration('tenant-A', 'decl-1', 'u', undefined, 'WRONG_NUMBER'))).toMatchObject({
      code: 'RENTAL_DECLARATION_ALREADY_REVIEWED'
    });
  });
});
