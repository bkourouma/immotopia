/**
 * BUG-2026-09-30-058, moitié « caisse et journal » : comptabilité de la gestion
 * locative directe.
 *
 * Scénario chiffré du bus : bail à 450 000 + 30 000 de charges, trois échéances
 * de 480 000, pénalité d'août de 9 000, encaissements espèces de 480 000 puis
 * de 300 000, cinq dépenses d'un bien détenu en propre.
 *
 * Attendu : la caisse reçoit 780 000 (moins les dépenses), le journal est
 * équilibré, le 411 vaut le relevé du locataire (669 000 dus), aucune pièce
 * n'est écrite deux fois, une pièce annulée ou modifiée est contre-passée.
 */

type Row = Record<string, any>;

const entries: Row[] = [];
const chart = new Map<string, string>(); // numéro -> id
let seq = 0;

const buildBalancedEntryLines = jest.requireActual('../../src/lib/finance/accounting').buildBalancedEntryLines;

jest.mock('../../src/utils/database', () => ({ prisma: {} }));

jest.mock('../../src/lib/finance/accounting', () => ({
  ensureOperationalJournalTx: jest.fn(async (_tx: any, _t: string, year: number, type: string) => `J-${type}-${year}`),
  postDocumentEntryTx: jest.fn(async (_tx: any, params: Row) => {
    const duplicate = entries.find(e => e.documentType === params.documentType && e.documentId === params.documentId);
    if (duplicate) throw new Error(`La pièce ${params.documentType} porte déjà une écriture`);
    const { lines } = buildBalancedEntryLines(params.lines);
    const entry = {
      id: `E${++seq}`,
      tenantId: params.tenantId,
      documentType: params.documentType,
      documentId: params.documentId,
      entryDate: params.entryDate,
      reference: params.reference,
      voidedByEntryId: null,
      createdAt: seq,
      lines
    };
    entries.push(entry);
    return { entryId: entry.id };
  })
}));

jest.mock('../../src/lib/treasury/accounts', () => ({
  ensureChartAccountTx: jest.fn(async (_tx: any, _t: string, number: string) => {
    if (!chart.has(number)) chart.set(number, `A${number}`);
    return chart.get(number);
  }),
  resolveTreasuryAccountTx: jest.fn(async (_tx: any, _t: string, p: Row) => {
    const bank = p.method === 'BANK_TRANSFER';
    const number = p.treasuryAccountId ? `T-${p.treasuryAccountId}` : bank ? '5211' : '5711';
    if (!chart.has(number)) chart.set(number, `A${number}`);
    return { chartOfAccountId: chart.get(number), journal: bank ? 'BANK' : 'CASH', accountNumber: number };
  })
}));

jest.mock('../../src/lib/finance/ledger', () => ({
  getOrCreateTenantAccountTx: jest.fn(async () => ({ id: 'acc-locataire' }))
}));

import {
  syncDirectExpenseEntryTx,
  syncDirectRentPaymentEntryTx,
  syncDirectRenterMovementEntryTx
} from '../../src/lib/finance/rental-direct-ledger';

const TENANT = 'agence-1';
const day = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d, 12));

// Base en mémoire.
const db = {
  properties: [{ id: 'bien-propre', tenantId: TENANT, ownershipType: 'TENANT' }] as Row[],
  shares: [] as Row[],
  leases: [
    {
      id: 'bail-A',
      tenant_id: TENANT,
      property_id: 'bien-propre',
      owner_client_id: null,
      primary_renter_client_id: 'loc-1'
    }
  ] as Row[],
  payments: [] as Row[],
  expenses: [] as Row[]
};

const tx: any = {
  property: {
    findMany: async ({ where }: any) =>
      db.properties.filter(
        p => p.tenantId === where.tenantId && where.id.in.includes(p.id) && p.ownershipType === where.ownershipType
      )
  },
  propertyOwnershipShare: {
    findMany: async ({ where }: any) => db.shares.filter(s => where.propertyId.in.includes(s.propertyId))
  },
  rentalLease: {
    findFirst: async ({ where }: any) =>
      db.leases.find(l => l.id === where.id && l.tenant_id === where.tenant_id) ?? null,
    findMany: async ({ where }: any) =>
      db.leases.filter(l => where.property_id.in.includes(l.property_id) && l.owner_client_id !== null)
  },
  rentalPayment: {
    findFirst: async ({ where }: any) => {
      const p = db.payments.find(x => x.id === where.id);
      return p ? { ...p, lease: db.leases.find(l => l.id === p.lease_id) } : null;
    }
  },
  propertyExpense: {
    findFirst: async ({ where }: any) =>
      db.expenses.find(e => e.id === where.id && e.tenantId === where.tenantId) ?? null
  },
  journalEntry: {
    findFirst: async ({ where }: any) =>
      entries.find(e => e.documentType === where.documentType && e.documentId === where.documentId) ?? null,
    findMany: async ({ where }: any) =>
      entries.filter(
        e =>
          e.documentType === where.documentType &&
          where.OR.some((c: any) =>
            typeof c.documentId === 'object'
              ? e.documentId.startsWith(c.documentId.startsWith)
              : e.documentId === c.documentId
          )
      ),
    update: async ({ where, data }: any) => {
      Object.assign(
        entries.find(e => e.id === where.id)!,
        data
      );
    }
  }
};

const payment = (id: string, amount: number, date: Date, extra: Row = {}) => {
  const row = {
    id,
    status: 'SUCCESS',
    amount,
    method: 'CASH',
    mm_operator: null,
    treasury_account_id: null,
    succeeded_at: date,
    initiated_at: date,
    lease_id: 'bail-A',
    renter_client_id: 'loc-1',
    ...extra
  };
  db.payments.push(row);
  return row;
};

const expense = (id: string, category: string, amount: number, extra: Row = {}) => {
  const row = {
    id,
    tenantId: TENANT,
    propertyId: 'bien-propre',
    category,
    label: `Dépense ${category}`,
    amount,
    paidAt: day(8, 10),
    isCapitalized: false,
    paymentMethod: 'CASH',
    treasuryAccountId: null,
    agencyIsBuyer: false,
    supplierName: null,
    ...extra
  };
  db.expenses.push(row);
  return row;
};

const movement = (id: string, type: string, sourceType: string, debit: number, credit: number, date: Date) => ({
  id,
  accountId: 'acc-locataire',
  type,
  sourceType,
  leaseId: 'bail-A',
  debit,
  credit,
  movementDate: date,
  label: `${type} ${id}`
});

/** Solde débiteur d'un compte au journal, contre-passations comprises. */
const balanceOf = (number: string) => {
  const id = chart.get(number);
  return entries.reduce(
    (sum, e) =>
      sum + e.lines.filter((l: Row) => l.accountId === id).reduce((s: number, l: Row) => s + l.debit - l.credit, 0),
    0
  );
};

const totals = () => ({
  debit: entries.reduce((s, e) => s + e.lines.reduce((x: number, l: Row) => x + l.debit, 0), 0),
  credit: entries.reduce((s, e) => s + e.lines.reduce((x: number, l: Row) => x + l.credit, 0), 0)
});

beforeEach(() => {
  entries.length = 0;
  chart.clear();
  seq = 0;
  db.payments.length = 0;
  db.expenses.length = 0;
  db.shares.length = 0;
  db.properties = [{ id: 'bien-propre', tenantId: TENANT, ownershipType: 'TENANT' }];
  db.leases = [
    {
      id: 'bail-A',
      tenant_id: TENANT,
      property_id: 'bien-propre',
      owner_client_id: null,
      primary_renter_client_id: 'loc-1'
    }
  ];
});

describe('gestion locative directe : trésorerie et journal', () => {
  it('un encaissement espèces crédite la caisse et le 411 : débit trésorerie / crédit 411 du locataire', async () => {
    payment('pay-1', 480000, day(7, 6));
    await syncDirectRentPaymentEntryTx(tx, TENANT, 'pay-1');

    expect(entries).toHaveLength(1);
    expect(entries[0].reference).toBe('ENC-PAY-1');
    expect(balanceOf('5711')).toBe(480000);
    expect(balanceOf('411')).toBe(-480000);
    const client = entries[0].lines.find((l: Row) => l.accountId === chart.get('411'));
    expect(client.thirdPartyAccountId).toBe('acc-locataire');
  });

  it('un virement va au journal de banque, pas à la caisse', async () => {
    payment('pay-b', 100000, day(7, 6), { method: 'BANK_TRANSFER' });
    await syncDirectRentPaymentEntryTx(tx, TENANT, 'pay-b');
    expect(balanceOf('5211')).toBe(100000);
    expect(balanceOf('5711')).toBe(0);
  });

  it('rejouer un encaissement ne réécrit rien (une écriture par règlement)', async () => {
    payment('pay-1', 480000, day(7, 6));
    await syncDirectRentPaymentEntryTx(tx, TENANT, 'pay-1');
    await syncDirectRentPaymentEntryTx(tx, TENANT, 'pay-1');
    expect(entries).toHaveLength(1);
    expect(balanceOf('5711')).toBe(480000);
  });

  it('un règlement non encaissé (PENDING) ne touche pas la trésorerie', async () => {
    payment('pay-p', 200000, day(7, 6), { status: 'PENDING' });
    await syncDirectRentPaymentEntryTx(tx, TENANT, 'pay-p');
    expect(entries).toHaveLength(0);
  });

  it('un règlement annulé est contre-passé : la caisse revient à zéro', async () => {
    const p = payment('pay-1', 480000, day(7, 6));
    await syncDirectRentPaymentEntryTx(tx, TENANT, 'pay-1');
    p.status = 'CANCELED';
    await syncDirectRentPaymentEntryTx(tx, TENANT, 'pay-1');
    expect(entries).toHaveLength(2);
    expect(balanceOf('5711')).toBe(0);
    expect(entries[0].voidedByEntryId).toBe(entries[1].id);
    // Le rejouer n'écrit rien de plus.
    await syncDirectRentPaymentEntryTx(tx, TENANT, 'pay-1');
    expect(entries).toHaveLength(2);
  });

  it("un bail avec propriétaire mandant n'est pas concerné (c'est le compte du propriétaire qui écrit)", async () => {
    db.leases[0].owner_client_id = 'proprio-1';
    payment('pay-1', 480000, day(7, 6));
    await syncDirectRentPaymentEntryTx(tx, TENANT, 'pay-1');
    expect(entries).toHaveLength(0);
  });

  it("un bien en indivision ou d'un client n'est pas en gestion directe", async () => {
    db.shares.push({ propertyId: 'bien-propre' });
    payment('pay-1', 480000, day(7, 6));
    await syncDirectRentPaymentEntryTx(tx, TENANT, 'pay-1');
    expect(entries).toHaveLength(0);

    db.shares.length = 0;
    db.properties[0].ownershipType = 'CLIENT';
    await syncDirectRentPaymentEntryTx(tx, TENANT, 'pay-1');
    expect(entries).toHaveLength(0);
  });

  it('une dépense de bien détenu en propre est une charge : débit charge / crédit caisse', async () => {
    expense('dep-1', 'PROPERTY_TAX', 150000);
    await syncDirectExpenseEntryTx(tx, TENANT, 'dep-1');
    expect(balanceOf('6411')).toBe(150000);
    expect(balanceOf('5711')).toBe(-150000);
    // Jamais le compte des mandants.
    expect(chart.has('4731')).toBe(false);
  });

  it("une dépense commandée par l'agence s'inscrit au 401, pas à la trésorerie", async () => {
    expense('dep-f', 'ROUTINE_MAINTENANCE', 80000, { agencyIsBuyer: true, supplierName: 'Plomberie Kone' });
    await syncDirectExpenseEntryTx(tx, TENANT, 'dep-f');
    expect(balanceOf('624')).toBe(80000);
    expect(balanceOf('401')).toBe(-80000);
    expect(chart.has('5711')).toBe(false);
  });

  it("une rénovation capitalisée va à l'actif (231), pas en charge", async () => {
    expense('dep-r', 'RENOVATION', 500000, { isCapitalized: true });
    await syncDirectExpenseEntryTx(tx, TENANT, 'dep-r');
    expect(balanceOf('231')).toBe(500000);
  });

  it('une dépense modifiée est contre-passée puis réécrite ; supprimée, elle est contre-passée', async () => {
    const e = expense('dep-1', 'UTILITIES', 40000);
    await syncDirectExpenseEntryTx(tx, TENANT, 'dep-1');
    await syncDirectExpenseEntryTx(tx, TENANT, 'dep-1'); // inchangée : rien
    expect(entries).toHaveLength(1);

    e.amount = 45000;
    await syncDirectExpenseEntryTx(tx, TENANT, 'dep-1');
    expect(balanceOf('6051')).toBe(45000);
    expect(balanceOf('5711')).toBe(-45000);
    expect(entries.map(x => x.documentId)).toEqual(['dep-1', 'DIRECT_EXPENSE:dep-1', 'dep-1:r1']);

    db.expenses.length = 0;
    await syncDirectExpenseEntryTx(tx, TENANT, 'dep-1');
    expect(balanceOf('6051')).toBe(0);
    expect(balanceOf('5711')).toBe(0);
  });

  it('la dépense d’un bien mandaté (CLIENT) ne passe pas par cette comptabilité', async () => {
    db.properties[0].ownershipType = 'CLIENT';
    expense('dep-1', 'INSURANCE', 60000);
    await syncDirectExpenseEntryTx(tx, TENANT, 'dep-1');
    expect(entries).toHaveLength(0);
  });
});

describe('scénario du bus : 480 000 + 300 000 encaissés, 5 dépenses', () => {
  it('caisse +780 000 (moins les dépenses), journal équilibré, 411 = relevé du locataire (669 000 dus)', async () => {
    // Compte du locataire : trois échéances de 480 000 débitées, pénalité d'août 9 000.
    const ledger = [
      movement('m-jul', 'INSTALLMENT', 'RENTAL_INSTALLMENT', 480000, 0, day(7, 5)),
      movement('m-aug', 'INSTALLMENT', 'RENTAL_INSTALLMENT', 480000, 0, day(8, 5)),
      movement('m-sep', 'INSTALLMENT', 'RENTAL_INSTALLMENT', 480000, 0, day(9, 5)),
      movement('m-pen', 'PENALTY', 'RENTAL_PENALTY', 9000, 0, day(10, 1))
    ];
    for (const m of ledger) await syncDirectRenterMovementEntryTx(tx, TENANT, m);
    // Les mouvements de règlement du compte (PAYMENT, ADVANCE_*) ne sont jamais projetés :
    // la trésorerie vient du règlement lui-même, une seule fois.
    for (const m of [
      movement('m-adv', 'ADVANCE_RECEIVED', 'RENTAL_PAYMENT', 0, 480000, day(7, 6)),
      movement('m-pay', 'PAYMENT', 'RENTAL_PAYMENT_ALLOCATION', 0, 480000, day(7, 6)),
      movement('m-app', 'ADVANCE_APPLIED', 'RENTAL_PAYMENT_ALLOCATION', 480000, 0, day(7, 6))
    ]) {
      expect(await syncDirectRenterMovementEntryTx(tx, TENANT, m)).toBe(false);
    }

    payment('pay-jul', 480000, day(7, 6));
    payment('pay-aug', 300000, day(8, 20));
    await syncDirectRentPaymentEntryTx(tx, TENANT, 'pay-jul');
    await syncDirectRentPaymentEntryTx(tx, TENANT, 'pay-aug');

    const spent = [
      ['d1', 'PROPERTY_TAX', 150000],
      ['d2', 'ROUTINE_MAINTENANCE', 30000],
      ['d3', 'UTILITIES', 20000],
      ['d4', 'RENOVATION', 100000],
      ['d5', 'INSURANCE', 40000]
    ] as const;
    for (const [id, category, amount] of spent) {
      expense(id, category, amount);
      await syncDirectExpenseEntryTx(tx, TENANT, id);
    }
    const expensesTotal = 150000 + 30000 + 20000 + 100000 + 40000;

    // Caisse : +780 000 d'encaissements, −340 000 de dépenses.
    expect(balanceOf('5711')).toBe(780000 - expensesTotal);
    // Journal équilibré.
    const { debit, credit } = totals();
    expect(debit).toBe(credit);
    // 411 = relevé du locataire : facturé 1 449 000, réglé 780 000, dû 669 000.
    const billed = ledger.reduce((s, m) => s + m.debit, 0);
    expect(billed).toBe(1449000);
    expect(balanceOf('411')).toBe(669000);
    expect(balanceOf('7083')).toBe(-1440000);
    expect(balanceOf('7088')).toBe(-9000);

    // Rejouer tout (rattrapage relancé) n'écrit rien de plus.
    const count = entries.length;
    for (const m of ledger) await syncDirectRenterMovementEntryTx(tx, TENANT, m);
    await syncDirectRentPaymentEntryTx(tx, TENANT, 'pay-jul');
    await syncDirectRentPaymentEntryTx(tx, TENANT, 'pay-aug');
    for (const [id] of spent) await syncDirectExpenseEntryTx(tx, TENANT, id);
    expect(entries).toHaveLength(count);
  });

  it("une remise de pénalité (crédit) est constatée à l'inverse : débit 7088 / crédit 411", async () => {
    await syncDirectRenterMovementEntryTx(
      tx,
      TENANT,
      movement('m-pen', 'PENALTY', 'RENTAL_PENALTY', 9000, 0, day(10, 1))
    );
    await syncDirectRenterMovementEntryTx(
      tx,
      TENANT,
      movement('m-waiver', 'WAIVER', 'RENTAL_PENALTY', 0, 9000, day(10, 2))
    );
    expect(balanceOf('411')).toBe(0);
    expect(balanceOf('7088')).toBe(0);
  });
});
