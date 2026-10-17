/**
 * `RemittanceLineDto.rejectionImpact` (spec 042, P3) : ce qu'un rejet constaté maintenant coûterait au débiteur,
 * pour la confirmation de l'écran.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { toRemittanceDto } from '../../src/lib/direct-debit/remittance-dto';

type Row = Record<string, any>;

function lineRow(over: Row = {}, mandate: Row = {}): Row {
  return {
    id: 'line-1',
    lineNumber: 1,
    status: 'PENDING',
    amount: 100000,
    remainingDueAtSelection: 100000,
    capped: false,
    canceledAt: null,
    cancellationReason: null,
    prenotificationStatus: 'SENT',
    prenotifiedAt: null,
    prenotificationRecipientMasked: null,
    prenotificationRecipientSource: null,
    settledAt: null,
    rejectedAt: null,
    rejectionCode: null,
    rejectionReason: null,
    rejectFeeAmount: null,
    returnSource: null,
    rentalPaymentId: null,
    mandate: {
      id: 'mandate-1',
      year: 2026,
      sequence: 1,
      status: 'ACTIVE',
      ibanLast4: '0589',
      holderName: 'Awa Traoré',
      maxAmount: null,
      consecutiveRejects: 0,
      ...mandate
    },
    debtor: { id: 'client-1', details: null, user: { fullName: 'Awa Traoré' } },
    lease: { id: 'lease-1', lease_number: 'B-001' },
    installment: { id: 'inst-1', period_year: 2026, period_month: 10, due_date: new Date('2026-10-05T00:00:00Z') },
    ...over
  };
}

function remittanceRow(over: Row = {}, lines: Row[] = [lineRow()], creditor: Row = {}): Row {
  return {
    id: 'rem-1',
    year: 2026,
    sequence: 1,
    status: 'SUBMITTED',
    scope: 'RENTAL_LEASE',
    collectionDate: new Date('2026-10-26T00:00:00Z'),
    periodYear: 2026,
    periodMonth: 10,
    prenotificationDeadline: new Date('2026-10-20T00:00:00Z'),
    lineCount: lines.length,
    totalAmount: 100000,
    fileFormat: 'GENERIC_CSV',
    creditorLabelSnapshot: 'Agence',
    creditorIdentifierSnapshot: null,
    validatedAt: null,
    firstExportedAt: null,
    lastExportedAt: null,
    exportCount: 0,
    submittedAt: null,
    canceledAt: null,
    cancellationReason: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    notes: null,
    creditor: {
      id: 'creditor-1',
      label: 'Agence',
      creditorIdentifier: null,
      fileFormat: 'GENERIC_CSV',
      rejectFeeAmount: 5000,
      maxConsecutiveRejects: 3,
      ...creditor
    },
    lines,
    ...over
  };
}

const impactsOf = (row: Row) => toRemittanceDto(row as any, new Map()).lines.map(line => line.rejectionImpact);

describe('rejectionImpact d’une ligne de remise', () => {
  it('ligne PENDING ou SETTLED d’une remise déposée : frais refacturés, pas de suspension sous le seuil', () => {
    const row = remittanceRow({}, [lineRow(), lineRow({ id: 'line-2', lineNumber: 2, status: 'SETTLED' })]);
    expect(impactsOf(row)).toEqual([
      { fee: 5000, willSuspend: false },
      { fee: 5000, willSuspend: false }
    ]);
    expect(impactsOf({ ...row, status: 'EXPORTED' })[0]).toEqual({ fee: 5000, willSuspend: false });
  });

  it('null pour une ligne REJECTED ou CANCELED, et pour une remise non déposée', () => {
    const lines = [lineRow({ status: 'REJECTED' }), lineRow({ id: 'line-2', lineNumber: 2, status: 'CANCELED' })];
    expect(impactsOf(remittanceRow({}, lines))).toEqual([null, null]);
    for (const status of ['DRAFT', 'VALIDATED', 'CANCELED']) {
      expect(impactsOf(remittanceRow({ status }))).toEqual([null]);
    }
  });

  it('frais nuls chez le créancier : fee = 0', () => {
    expect(impactsOf(remittanceRow({}, [lineRow()], { rejectFeeAmount: 0 }))[0]).toEqual({
      fee: 0,
      willSuspend: false
    });
  });

  it('un encaisseur qui ne refacture pas (hors loyers) : fee = 0', () => {
    expect(impactsOf(remittanceRow({ scope: 'SYNDIC_LOT' }))[0]).toEqual({ fee: 0, willSuspend: false });
  });

  it('suspension quand ce rejet atteint le seuil sur un mandat ACTIVE', () => {
    // Seuil 3 : 2 rejets déjà, le prochain est le troisième.
    const atThreshold = remittanceRow({}, [lineRow({}, { consecutiveRejects: 2 })]);
    expect(impactsOf(atThreshold)[0]).toEqual({ fee: 5000, willSuspend: true });
    const below = remittanceRow({}, [lineRow({}, { consecutiveRejects: 1 })]);
    expect(impactsOf(below)[0]?.willSuspend).toBe(false);
    const above = remittanceRow({}, [lineRow({}, { consecutiveRejects: 7 })]);
    expect(impactsOf(above)[0]?.willSuspend).toBe(true);
  });

  it('pas de suspension annoncée pour un mandat déjà suspendu ou révoqué, ni sans seuil', () => {
    for (const status of ['SUSPENDED', 'REVOKED']) {
      expect(impactsOf(remittanceRow({}, [lineRow({}, { status, consecutiveRejects: 5 })]))[0]?.willSuspend).toBe(
        false
      );
    }
    const noThreshold = remittanceRow({}, [lineRow({}, { consecutiveRejects: 5 })], { maxConsecutiveRejects: 0 });
    expect(impactsOf(noThreshold)[0]?.willSuspend).toBe(false);
  });
});
