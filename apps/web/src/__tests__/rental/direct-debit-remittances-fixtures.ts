/** Jeux de données des tests des remises de prélèvements (spec 042, P2). */

export const TENANT_ID = 'agence-1';
export const REMITTANCE_ID = 'r-1';

export function makeLine(overrides: Record<string, unknown> = {}) {
  return {
    id: 'l-1',
    lineNumber: 1,
    reference: 'PRL-2026-0001-001',
    status: 'PENDING',
    mandate: {
      id: 'm-1',
      reference: 'MDT-2026-0001',
      ibanMasked: 'CI•• •••• •••• •••• •••• 5678',
      holderName: 'Awa Traoré',
      maxAmount: null,
      status: 'ACTIVE'
    },
    debtor: { id: 'client-1', displayName: 'Awa Traoré', kind: 'CLIENT' },
    lease: { id: 'bail-1', leaseNumber: 'BAIL-001' },
    installment: { id: 'i-1', periodYear: 2026, periodMonth: 11, dueDate: '2026-11-01' },
    lot: null,
    chargeCalls: [],
    amount: 150000,
    remainingDueAtSelection: 150000,
    capped: false,
    prenotificationStatus: 'PENDING',
    prenotifiedAt: null,
    prenotificationRecipient: { masked: 'a•••@ex•••.ci', source: 'ACCOUNT' },
    canceledAt: null,
    cancellationReason: null,
    settledAt: null,
    rejectedAt: null,
    rejectionCode: null,
    rejectionReason: null,
    rejectFeeAmount: null,
    returnSource: null,
    paymentId: null,
    ...overrides
  };
}

export function makeRemittance(overrides: Record<string, unknown> = {}) {
  const lines = (overrides.lines as unknown[]) ?? [
    makeLine(),
    makeLine({
      id: 'l-2',
      lineNumber: 2,
      reference: 'PRL-2026-0001-002',
      mandate: {
        id: 'm-2',
        reference: 'MDT-2026-0002',
        ibanMasked: 'CI•• •••• •••• •••• •••• 1234',
        holderName: 'Moussa Diallo',
        maxAmount: 100000,
        status: 'ACTIVE'
      },
      debtor: { id: 'client-2', displayName: 'Moussa Diallo', kind: 'CLIENT' },
      lease: { id: 'bail-2', leaseNumber: 'BAIL-002' },
      amount: 100000,
      remainingDueAtSelection: 180000,
      capped: true
    })
  ];
  return {
    id: REMITTANCE_ID,
    reference: 'PRL-2026-0001',
    scope: 'RENTAL_LEASE',
    syndicate: null,
    status: 'DRAFT',
    creditor: { id: 'c-1', label: 'Compte loyers', creditorIdentifier: 'CI123456' },
    collectionDate: '2026-11-05',
    periodYear: 2026,
    periodMonth: 11,
    prenotificationDeadline: '2026-10-29',
    fileFormat: 'GENERIC_CSV',
    lineCount: 2,
    totalAmount: 250000,
    validatedAt: null,
    firstExportedAt: null,
    lastExportedAt: null,
    exportCount: 0,
    submittedAt: null,
    canceledAt: null,
    cancellationReason: null,
    returnSummary: { pending: 0, settled: 0, rejected: 0, settledAmount: 0, rejectedAmount: 0 },
    returnState: 'NOT_APPLICABLE',
    createdAt: '2026-10-16T09:00:00.000Z',
    updatedAt: '2026-10-16T09:00:00.000Z',
    notes: null,
    prenotificationSummary: {
      pending: 2,
      sent: 0,
      noEmail: 0,
      disabled: 0,
      failed: 0,
      recipients: { account: 2, contact: 0, none: 0 }
    },
    ...overrides,
    lines
  };
}

export const creditor = {
  id: 'c-1',
  label: 'Compte loyers',
  scope: 'RENTAL_LEASE',
  treasuryAccountId: 'ta-1',
  treasuryAccountLabel: 'Banque principale',
  syndicate: null,
  bankName: 'Banque X',
  bankAccountRef: null,
  creditorIdentifier: 'CI123456',
  fileFormat: 'GENERIC_CSV',
  collectionDay: 5,
  prenotificationBusinessDays: 5,
  rejectFeeAmount: 0,
  maxConsecutiveRejects: 2,
  isActive: true,
  openMandateCount: 2,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z'
};

export const inactiveCreditor = { ...creditor, id: 'c-2', label: 'Ancien compte', isActive: false };

export const emptyPrenotifications = { pending: 0, sent: 0, noEmail: 0, disabled: 0, failed: 0 };
