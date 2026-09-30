/**
 * Dépôt de garantie en gestion directe : comptabilisé en dette envers le
 * locataire (165), jamais en créance 411 ni en avance.
 *
 * Scénario chiffré : 500 000 encaissés, 100 000 retenus, 400 000 remboursés.
 * Attendu : 165 revient à 0 ; trésorerie nette +100 000 (500 000 entrés,
 * 400 000 sortis, la retenue reste en caisse) ; 758 crédité de 100 000 ;
 * 411 inchangé (aucune ligne).
 */

type Row = Record<string, any>;

const entries: Row[] = [];
const chart = new Map<string, string>();
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
    const number = p.treasuryAccountId ? `T-${p.treasuryAccountId}` : '5711';
    if (!chart.has(number)) chart.set(number, `A${number}`);
    return { chartOfAccountId: chart.get(number), journal: 'CASH', accountNumber: number };
  })
}));

jest.mock('../../src/lib/finance/ledger', () => ({
  getOrCreateTenantAccountTx: jest.fn(async () => ({ id: 'acc-locataire' }))
}));

import {
  syncDirectDepositMovementEntryTx,
  syncDirectRentPaymentEntryTx
} from '../../src/lib/finance/rental-direct-ledger';

const TENANT = 'agence-1';
const day = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d, 12));

const db = {
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
  movements: [] as Row[]
};

const tx: any = {
  property: {
    findMany: async () => [{ id: 'bien-propre' }]
  },
  propertyOwnershipShare: { findMany: async () => [] },
  rentalLease: {
    findFirst: async ({ where }: any) =>
      db.leases.find(l => l.id === where.id && l.tenant_id === where.tenant_id) ?? null,
    findMany: async () => []
  },
  rentalPayment: {
    findFirst: async ({ where }: any) => {
      const p = db.payments.find(x => x.id === where.id);
      if (!p) return null;
      return {
        ...p,
        lease: db.leases.find(l => l.id === p.lease_id),
        depositMovements: db.movements.filter(m => m.payment_id === p.id && m.type === 'COLLECT').slice(0, 1)
      };
    }
  },
  rentalDepositMovement: {
    findFirst: async ({ where }: any) => {
      const m = db.movements.find(x => x.id === where.id);
      return m ? { ...m, deposit: { lease_id: 'bail-A' } } : null;
    }
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

const balanceOf = (number: string) => {
  const id = chart.get(number);
  return entries.reduce(
    (sum, e) =>
      sum + e.lines.filter((l: Row) => l.accountId === id).reduce((s: number, l: Row) => s + l.debit - l.credit, 0),
    0
  );
};

beforeEach(() => {
  entries.length = 0;
  chart.clear();
  seq = 0;
  db.payments.length = 0;
  db.movements.length = 0;
});

const depositPayment = (id: string, amount: number) => {
  db.payments.push({
    id,
    status: 'SUCCESS',
    amount,
    method: 'CASH',
    mm_operator: null,
    treasury_account_id: null,
    succeeded_at: day(7, 6),
    initiated_at: day(7, 6),
    lease_id: 'bail-A',
    renter_client_id: 'loc-1'
  });
};

describe('dépôt de garantie en gestion directe', () => {
  it('500 000 encaissé, 100 000 retenu, 400 000 remboursé : 165 à 0, trésorerie +100 000, 411 inchangé', async () => {
    depositPayment('pay-dep', 500000);
    // Le règlement précède le mouvement COLLECT : d'abord comptabilisé comme un loyer (411).
    await syncDirectRentPaymentEntryTx(tx, TENANT, 'pay-dep');
    expect(balanceOf('411')).toBe(-500000);

    // COLLECT enregistré : le règlement est reclassé trésorerie / 165.
    db.movements.push({
      id: 'mv-collect',
      type: 'COLLECT',
      amount: 500000,
      payment_id: 'pay-dep',
      created_at: day(7, 6)
    });
    await syncDirectRentPaymentEntryTx(tx, TENANT, 'pay-dep');
    expect(balanceOf('411')).toBe(0);
    expect(balanceOf('165')).toBe(-500000);
    expect(balanceOf('5711')).toBe(500000);
    const creditLine = entries
      .filter(e => !e.voidedByEntryId && e.documentType === 'RENTAL_RECEIPT')
      .flatMap(e => e.lines)
      .find((l: Row) => l.accountId === chart.get('165'));
    // Aucun tiers 411 : le dépôt n'est pas une avance du locataire.
    expect(creditLine.thirdPartyAccountId ?? null).toBeNull();

    db.movements.push({ id: 'mv-forfeit', type: 'FORFEIT', amount: 100000, created_at: day(12, 1) });
    db.movements.push({
      id: 'mv-refund',
      type: 'REFUND',
      amount: 400000,
      treasury_account_id: null,
      created_at: day(12, 2)
    });
    await syncDirectDepositMovementEntryTx(tx, TENANT, 'mv-forfeit');
    await syncDirectDepositMovementEntryTx(tx, TENANT, 'mv-refund');

    expect(balanceOf('165')).toBe(0);
    expect(balanceOf('5711')).toBe(100000); // 500 000 − 400 000 ; la retenue reste en caisse
    expect(balanceOf('758')).toBe(-100000); // produit de la retenue
    expect(balanceOf('411')).toBe(0);
  });

  it('rejouer un remboursement ou une retenue ne réécrit rien (idempotence par mouvement)', async () => {
    db.movements.push({ id: 'mv-refund', type: 'REFUND', amount: 400000, created_at: day(12, 2) });
    await syncDirectDepositMovementEntryTx(tx, TENANT, 'mv-refund');
    await syncDirectDepositMovementEntryTx(tx, TENANT, 'mv-refund');
    expect(entries).toHaveLength(1);
    expect(balanceOf('165')).toBe(400000);
    expect(balanceOf('5711')).toBe(-400000);
  });

  it("les autres mouvements (HOLD, RELEASE, ADJUSTMENT, COLLECT) n'écrivent aucune pièce de sortie", async () => {
    for (const type of ['HOLD', 'RELEASE', 'ADJUSTMENT', 'COLLECT']) {
      db.movements.push({ id: `mv-${type}`, type, amount: 1000, created_at: day(12, 2) });
      await syncDirectDepositMovementEntryTx(tx, TENANT, `mv-${type}`);
    }
    expect(entries).toHaveLength(0);
  });

  it("un bail avec propriétaire mandant n'est pas concerné", async () => {
    db.leases[0].owner_client_id = 'proprio-1';
    db.movements.push({ id: 'mv-refund', type: 'REFUND', amount: 400000, created_at: day(12, 2) });
    await syncDirectDepositMovementEntryTx(tx, TENANT, 'mv-refund');
    expect(entries).toHaveLength(0);
    db.leases[0].owner_client_id = null;
  });
});
