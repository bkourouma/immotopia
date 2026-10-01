/**
 * Tests unitaires de la restitution financière — lot 1, volet clients.
 *
 * Prisma est remplacé par un magasin en mémoire (même parti pris que
 * `syndics.owner-accounts.ledger.test.ts`) : aucune base n'est requise, et
 * chaque test ne dépend que des lignes qu'il pose lui-même.
 */

jest.mock('@prisma/client', () => {
  type Row = Record<string, any>;

  const store = {
    accounts: [] as Row[],
    movements: [] as Row[],
    leases: [] as Row[],
    installments: [] as Row[]
  };

  const inFilter = (filter: any, value: unknown) => !filter?.in || filter.in.includes(value);

  const matchesMovementDate = (movementDate: Date, filter?: Row) => {
    if (!filter) return true;
    const value = new Date(movementDate).getTime();
    if (filter.gte && value < new Date(filter.gte).getTime()) return false;
    if (filter.lte && value > new Date(filter.lte).getTime()) return false;
    if (filter.lt && !(value < new Date(filter.lt).getTime())) return false;
    return true;
  };

  const matchesMovement = (m: Row, where: Row) => {
    if (where.tenantId !== undefined && m.tenantId !== where.tenantId) return false;
    if (where.accountId !== undefined) {
      if (typeof where.accountId === 'object' && where.accountId !== null) {
        if (!inFilter(where.accountId, m.accountId)) return false;
      } else if (m.accountId !== where.accountId) {
        return false;
      }
    }
    if (where.type !== undefined && m.type !== where.type) return false;
    if (where.leaseId && !inFilter(where.leaseId, m.leaseId)) return false;
    if (where.movementDate && !matchesMovementDate(m.movementDate, where.movementDate)) return false;
    return true;
  };

  const buildComparator = (orderBy?: Row[]) => (a: Row, b: Row) => {
    for (const clause of orderBy ?? []) {
      const [field, direction] = Object.entries(clause)[0] as [string, string];
      const left = new Date(a[field]).getTime();
      const right = new Date(b[field]).getTime();
      if (left !== right) {
        return direction === 'desc' ? right - left : left - right;
      }
    }
    return 0;
  };

  const client: Row = {
    thirdPartyAccount: {
      findMany: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        return store.accounts.filter(a => {
          if (where.tenantId !== undefined && a.tenantId !== where.tenantId) return false;
          if (where.kind !== undefined && a.kind !== where.kind) return false;
          if (where.id && !inFilter(where.id, a.id)) return false;
          return true;
        });
      }),
      findFirst: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        const found = store.accounts.find(a => a.id === where.id && a.tenantId === where.tenantId);
        return found ?? null;
      })
    },
    thirdPartyMovement: {
      groupBy: jest.fn(async (args: Row) => {
        const rows = store.movements.filter(m => matchesMovement(m, args.where ?? {}));
        const sums = new Map<string, { debitSum: number; hasDebit: boolean; creditSum: number; hasCredit: boolean }>();
        for (const m of rows) {
          const entry = sums.get(m.accountId) ?? { debitSum: 0, hasDebit: false, creditSum: 0, hasCredit: false };
          if (m.debit !== null && m.debit !== undefined) {
            entry.debitSum += Number(m.debit);
            entry.hasDebit = true;
          }
          if (m.credit !== null && m.credit !== undefined) {
            entry.creditSum += Number(m.credit);
            entry.hasCredit = true;
          }
          sums.set(m.accountId, entry);
        }
        return Array.from(sums.entries()).map(([accountId, e]) => ({
          accountId,
          _sum: { debit: e.hasDebit ? e.debitSum : null, credit: e.hasCredit ? e.creditSum : null }
        }));
      }),
      findMany: jest.fn(async (args: Row) => {
        const rows = store.movements
          .filter(m => matchesMovement(m, args.where ?? {}))
          .sort(buildComparator(args.orderBy));
        const skip = args.skip ?? 0;
        const take = args.take ?? rows.length;
        return rows.slice(skip, skip + take);
      }),
      findFirst: jest.fn(async (args: Row) => {
        const rows = store.movements
          .filter(m => matchesMovement(m, args.where ?? {}))
          .sort(buildComparator(args.orderBy));
        return rows[0] ?? null;
      }),
      aggregate: jest.fn(async (args: Row) => {
        const rows = store.movements.filter(m => matchesMovement(m, args.where ?? {}));
        const total = (key: string) => rows.reduce((sum, m) => sum + Number(m[key] ?? 0), 0);
        return { _sum: { debit: rows.length ? total('debit') : null, credit: rows.length ? total('credit') : null } };
      }),
      count: jest.fn(async (args: Row) => store.movements.filter(m => matchesMovement(m, args.where ?? {})).length)
    },
    rentalLease: {
      findMany: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        return store.leases
          .filter(l => {
            if (where.tenant_id !== undefined && l.tenant_id !== where.tenant_id) return false;
            if (where.property_id !== undefined && l.property_id !== where.property_id) return false;
            if (where.primary_renter_client_id && !inFilter(where.primary_renter_client_id, l.primary_renter_client_id))
              return false;
            return true;
          })
          .map(l => ({ id: l.id, primary_renter_client_id: l.primary_renter_client_id, property: l.property ?? null }));
      })
    },
    rentalInstallment: {
      findMany: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        return store.installments
          .filter(i => {
            if (where.tenant_id !== undefined && i.tenant_id !== where.tenant_id) return false;
            if (where.status && !inFilter(where.status, i.status)) return false;
            if (where.lease_id && !inFilter(where.lease_id, i.lease_id)) return false;
            return true;
          })
          .map(i => {
            const lease = store.leases.find(l => l.id === i.lease_id);
            return {
              due_date: i.due_date,
              amount_rent: i.amount_rent ?? 0,
              amount_service: i.amount_service ?? 0,
              amount_other_fees: i.amount_other_fees ?? 0,
              penalty_amount: i.penalty_amount ?? 0,
              amount_paid: i.amount_paid ?? 0,
              lease: { primary_renter_client_id: lease?.primary_renter_client_id }
            };
          });
      })
    }
  };

  return {
    PrismaClient: jest.fn(() => client),
    __mockPrisma: client,
    __store: store
  };
});

import { getAccountStatement, getClientsAgingBalance, getClientsBalance } from '../../src/lib/finance/reports';

const { __store: store } = jest.requireMock('@prisma/client') as { __store: any };

const TENANT_ID = 'tenant-1';
const OTHER_TENANT_ID = 'tenant-2';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function resetStore() {
  store.accounts.length = 0;
  store.movements.length = 0;
  store.leases.length = 0;
  store.installments.length = 0;
}

function seedAccount(
  row: Partial<Record<string, any>> & { id: string; tenantClientId: string; label: string; balance: number }
) {
  store.accounts.push({
    tenantId: TENANT_ID,
    kind: 'TENANT',
    currency: 'XOF',
    isActive: true,
    ...row
  });
}

function seedMovement(row: Record<string, any>) {
  store.movements.push({
    tenantId: TENANT_ID,
    debit: null,
    credit: null,
    leaseId: null,
    createdAt: row.movementDate,
    sourceType: 'RENTAL_INSTALLMENT',
    sourceId: `src-${store.movements.length + 1}`,
    ...row
  });
}

function seedLease(row: Record<string, any>) {
  store.leases.push({ tenant_id: TENANT_ID, ...row });
}

function seedInstallment(row: Record<string, any>) {
  store.installments.push({
    tenant_id: TENANT_ID,
    status: 'DUE',
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    ...row
  });
}

describe('Restitution financiere - balance, balance agee, releve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
  });

  describe('getClientsBalance', () => {
    beforeEach(() => {
      seedLease({
        id: 'lease-a',
        property_id: 'prop-a',
        primary_renter_client_id: 'client-a',
        property: { title: 'Villa Almadies', internalReference: 'REF-A' }
      });
      seedLease({
        id: 'lease-b',
        property_id: 'prop-b',
        primary_renter_client_id: 'client-b',
        property: { title: 'Appartement Plateau', internalReference: 'REF-B' }
      });

      seedAccount({ id: 'acc-a', tenantClientId: 'client-a', label: 'Awa Diop', balance: 40000 });
      seedAccount({ id: 'acc-b', tenantClientId: 'client-b', label: 'Moussa Ba', balance: -20000 });

      seedMovement({
        id: 'm1',
        accountId: 'acc-a',
        movementDate: new Date('2026-01-05T00:00:00.000Z'),
        type: 'INSTALLMENT',
        debit: 100000,
        balanceAfter: 100000,
        label: 'Loyer de janvier',
        leaseId: 'lease-a'
      });
      seedMovement({
        id: 'm2',
        accountId: 'acc-a',
        movementDate: new Date('2026-01-20T00:00:00.000Z'),
        type: 'PAYMENT',
        credit: 60000,
        balanceAfter: 40000,
        label: 'Paiement recu',
        leaseId: 'lease-a'
      });
      seedMovement({
        id: 'm3',
        accountId: 'acc-a',
        movementDate: new Date('2026-02-05T00:00:00.000Z'),
        type: 'INSTALLMENT',
        debit: 50000,
        balanceAfter: 90000,
        label: 'Loyer de fevrier',
        leaseId: 'lease-a'
      });

      seedMovement({
        id: 'm4',
        accountId: 'acc-b',
        movementDate: new Date('2026-01-10T00:00:00.000Z'),
        type: 'INSTALLMENT',
        debit: 30000,
        balanceAfter: 30000,
        label: 'Loyer de janvier',
        leaseId: 'lease-b'
      });
      seedMovement({
        id: 'm5',
        accountId: 'acc-b',
        movementDate: new Date('2026-01-15T00:00:00.000Z'),
        type: 'PAYMENT',
        credit: 50000,
        balanceAfter: -20000,
        label: 'Paiement recu',
        leaseId: 'lease-b'
      });
    });

    it('renvoie une ligne par locataire, avec le solde courant du compte et un total de controle', async () => {
      const result = await getClientsBalance(TENANT_ID);

      const lineA = result.lines.find(l => l.accountId === 'acc-a')!;
      const lineB = result.lines.find(l => l.accountId === 'acc-b')!;

      expect(lineA.totalBilled).toBe(150000);
      expect(lineA.totalSettled).toBe(60000);
      expect(lineA.balance).toBe(90000); // Σ facturé − Σ réglé à date (plus le solde stocké)
      expect(lineA.propertyLabels).toEqual(['REF-A']);

      expect(lineB.totalBilled).toBe(30000);
      expect(lineB.totalSettled).toBe(50000);
      expect(lineB.balance).toBe(-20000);

      // Total de controle : somme des SOLDES (pas des montants factures/regles).
      expect(result.totalBalance).toBe(lineA.balance + lineB.balance);
      expect(result.totalBalance).toBe(70000);
    });

    it('filtre par periode : seuls les mouvements de la fenetre entrent dans les totaux factures/regles', async () => {
      const result = await getClientsBalance(TENANT_ID, {
        range: { from: new Date('2026-02-01T00:00:00.000Z'), to: new Date('2026-02-28T00:00:00.000Z') }
      });

      // Seul le compte A a bouge en fevrier (m3) ; B n a rien dans la fenetre.
      expect(result.lines).toHaveLength(1);
      const [line] = result.lines;
      expect(line.accountId).toBe('acc-a');
      expect(line.totalBilled).toBe(50000);
      expect(line.totalSettled).toBe(0);
      // Le solde reste le solde À DATE du compte, pas recalcule sur la periode.
      expect(line.balance).toBe(90000);
    });

    it('filtre par bien : seuls les locataires ayant un bail sur ce bien apparaissent', async () => {
      const result = await getClientsBalance(TENANT_ID, { propertyId: 'prop-b' });

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].accountId).toBe('acc-b');
      expect(result.lines[0].propertyLabels).toEqual(['REF-B']);
    });

    it('renvoie une balance vide quand rien ne correspond au filtre', async () => {
      const result = await getClientsBalance(TENANT_ID, { propertyId: 'prop-inconnu' });

      expect(result).toEqual({ lines: [], totalBalance: 0, currency: 'XOF' });
    });

    it('isole les tenants : un compte d un autre tenant n apparait jamais', async () => {
      const result = await getClientsBalance(OTHER_TENANT_ID);
      expect(result.lines).toHaveLength(0);
    });

    // BUG-2026-09-30-058 : un reglement affecte s'ecrit ADVANCE_RECEIVED (credit
    // total) + PAYMENT (credit affecte) + ADVANCE_APPLIED (debit affecte). La
    // reprise d'avance ne facture rien et annule un credit deja compte.
    describe('reprise d avance (ADVANCE_APPLIED)', () => {
      const day = (d: number) => new Date(Date.UTC(2026, 5, d));

      const seedReglementAffecte = (prefix: string, accountId: string, date: Date, recu: number, affecte: number) => {
        seedMovement({ id: `${prefix}-adv`, accountId, movementDate: date, type: 'ADVANCE_RECEIVED', credit: recu });
        seedMovement({ id: `${prefix}-pay`, accountId, movementDate: date, type: 'PAYMENT', credit: affecte });
        seedMovement({ id: `${prefix}-app`, accountId, movementDate: date, type: 'ADVANCE_APPLIED', debit: affecte });
      };

      beforeEach(() => {
        store.movements.length = 0;
        store.accounts.length = 0;
        seedAccount({ id: 'acc-x', tenantClientId: 'client-x', label: 'Locataire X', balance: 0 });
      });

      it('cas du bug : 3 echeances de 480 000 + penalite 9 000, reglements 480 000 et 300 000', async () => {
        for (const [i, amount] of [480000, 480000, 480000, 9000].entries()) {
          seedMovement({
            id: `due-${i}`,
            accountId: 'acc-x',
            movementDate: day(1 + i),
            type: 'INSTALLMENT',
            debit: amount
          });
        }
        seedReglementAffecte('r1', 'acc-x', day(10), 480000, 480000);
        seedReglementAffecte('r2', 'acc-x', day(11), 300000, 300000);

        const [line] = (await getClientsBalance(TENANT_ID)).lines;

        expect(line.totalBilled).toBe(1449000);
        expect(line.totalSettled).toBe(780000);
        expect(line.balance).toBe(669000);
      });

      it('avance partiellement imputee : 780 000 recus, 480 000 appliques a une echeance de 480 000', async () => {
        seedMovement({ id: 'due', accountId: 'acc-x', movementDate: day(1), type: 'INSTALLMENT', debit: 480000 });
        seedReglementAffecte('r1', 'acc-x', day(10), 780000, 480000);

        const [line] = (await getClientsBalance(TENANT_ID)).lines;

        expect(line.totalBilled).toBe(480000);
        expect(line.totalSettled).toBe(780000);
        expect(line.balance).toBe(-300000); // avance restante de 300 000
      });

      it('sans ADVANCE_APPLIED, les totaux sont ceux de la somme brute (inchange)', async () => {
        seedMovement({ id: 'due', accountId: 'acc-x', movementDate: day(1), type: 'INSTALLMENT', debit: 100000 });
        seedMovement({ id: 'pay', accountId: 'acc-x', movementDate: day(5), type: 'PAYMENT', credit: 40000 });

        const [line] = (await getClientsBalance(TENANT_ID)).lines;

        expect(line.totalBilled).toBe(100000);
        expect(line.totalSettled).toBe(40000);
        expect(line.balance).toBe(60000);
      });

      it('facture − regle = solde, avec ou sans reprise d avance', async () => {
        seedMovement({ id: 'due1', accountId: 'acc-x', movementDate: day(1), type: 'INSTALLMENT', debit: 250000 });
        seedMovement({ id: 'due2', accountId: 'acc-x', movementDate: day(2), type: 'INSTALLMENT', debit: 250000 });
        seedReglementAffecte('r1', 'acc-x', day(10), 400000, 250000);
        seedMovement({ id: 'pay', accountId: 'acc-x', movementDate: day(12), type: 'PAYMENT', credit: 50000 });

        const [line] = (await getClientsBalance(TENANT_ID)).lines;

        expect(line.totalBilled - line.totalSettled).toBe(line.balance);
      });

      it('respecte le filtre de periode : seuls les mouvements de la fenetre comptent (facture 0, regle 100 000)', async () => {
        seedMovement({ id: 'due', accountId: 'acc-x', movementDate: day(1), type: 'INSTALLMENT', debit: 100000 });
        seedReglementAffecte('r1', 'acc-x', day(20), 100000, 100000);

        const [line] = (await getClientsBalance(TENANT_ID, { range: { from: day(15), to: day(25) } })).lines;

        expect(line.totalBilled).toBe(0);
        expect(line.totalSettled).toBe(100000);
      });
    });
  });

  describe('getClientsAgingBalance', () => {
    const ASOF = new Date('2026-06-15T00:00:00.000Z');

    beforeEach(() => {
      seedLease({
        id: 'lease-a',
        property_id: 'prop-a',
        primary_renter_client_id: 'client-a',
        property: { title: 'Villa Almadies', internalReference: 'REF-A' }
      });
      seedAccount({ id: 'acc-a', tenantClientId: 'client-a', label: 'Awa Diop', balance: 40000 });
      seedMovement({
        id: 'm1',
        accountId: 'acc-a',
        movementDate: new Date('2026-01-05T00:00:00.000Z'),
        type: 'INSTALLMENT',
        debit: 40000,
        balanceAfter: 40000,
        label: 'Loyer de janvier',
        leaseId: 'lease-a'
      });

      const dueAt = (daysOverdue: number) => new Date(ASOF.getTime() - daysOverdue * MS_PER_DAY);

      seedInstallment({ id: 'i-future', lease_id: 'lease-a', due_date: dueAt(-5), amount_rent: 1000 });
      seedInstallment({ id: 'i-0', lease_id: 'lease-a', due_date: dueAt(0), amount_rent: 2000 });
      seedInstallment({ id: 'i-29', lease_id: 'lease-a', due_date: dueAt(29), amount_rent: 3000 });
      seedInstallment({ id: 'i-30', lease_id: 'lease-a', due_date: dueAt(30), amount_rent: 4000 });
      seedInstallment({ id: 'i-59', lease_id: 'lease-a', due_date: dueAt(59), amount_rent: 5000 });
      seedInstallment({ id: 'i-60', lease_id: 'lease-a', due_date: dueAt(60), amount_rent: 6000 });
      seedInstallment({ id: 'i-89', lease_id: 'lease-a', due_date: dueAt(89), amount_rent: 7000 });
      seedInstallment({ id: 'i-90', lease_id: 'lease-a', due_date: dueAt(90), amount_rent: 8000 });
    });

    it('ventile chaque echeance impayee dans sa tranche, bornes exactes comprises', async () => {
      const result = await getClientsAgingBalance(TENANT_ID, { asOf: ASOF });

      const line = result.lines.find(l => l.accountId === 'acc-a')!;

      expect(line.notYetDue).toBe(1000);
      // 0 et 29 jours de retard : tranche 0-30.
      expect(line.days0To30).toBe(2000 + 3000);
      // 30 et 59 jours de retard : la borne basse tombe dans la tranche superieure.
      expect(line.days30To60).toBe(4000 + 5000);
      expect(line.days60To90).toBe(6000 + 7000);
      expect(line.daysOver90).toBe(8000);

      // Les champs herites de la balance simple restent presents.
      expect(line.balance).toBe(40000);
      expect(line.totalBilled).toBe(40000);
      expect(result.totalBalance).toBe(line.balance);
    });

    it('ne compte que les echeances non soldees, et ignore les autres locataires', async () => {
      seedLease({
        id: 'lease-b',
        property_id: 'prop-b',
        primary_renter_client_id: 'client-b',
        property: { title: 'Bureau Sacre-Coeur', internalReference: 'REF-B' }
      });
      seedAccount({ id: 'acc-b', tenantClientId: 'client-b', label: 'Moussa Ba', balance: 0 });
      seedMovement({
        id: 'm2',
        accountId: 'acc-b',
        movementDate: new Date('2026-01-05T00:00:00.000Z'),
        type: 'INSTALLMENT',
        debit: 5000,
        balanceAfter: 5000,
        label: 'Loyer de janvier',
        leaseId: 'lease-b'
      });
      // Echeance soldee : ne doit alimenter aucune tranche.
      seedInstallment({
        id: 'i-paid',
        lease_id: 'lease-b',
        due_date: new Date(ASOF.getTime() - 40 * MS_PER_DAY),
        amount_rent: 5000,
        amount_paid: 5000,
        status: 'PAID'
      });

      const result = await getClientsAgingBalance(TENANT_ID, { asOf: ASOF });

      const lineB = result.lines.find(l => l.accountId === 'acc-b')!;
      expect(lineB.notYetDue).toBe(0);
      expect(lineB.days0To30).toBe(0);
      expect(lineB.days30To60).toBe(0);
      expect(lineB.days60To90).toBe(0);
      expect(lineB.daysOver90).toBe(0);
    });
  });

  describe('getAccountStatement', () => {
    beforeEach(() => {
      seedAccount({ id: 'acc-c', tenantClientId: 'client-c', label: 'Fatou Sy', balance: 20000 });

      seedMovement({
        id: 's1',
        accountId: 'acc-c',
        movementDate: new Date('2025-01-10T00:00:00.000Z'),
        type: 'INSTALLMENT',
        debit: 10000,
        balanceAfter: 10000,
        label: 'Loyer de janvier 2025'
      });
      seedMovement({
        id: 's2',
        accountId: 'acc-c',
        movementDate: new Date('2025-02-10T00:00:00.000Z'),
        type: 'PAYMENT',
        credit: 4000,
        balanceAfter: 6000,
        label: 'Paiement recu'
      });
      seedMovement({
        id: 's3',
        accountId: 'acc-c',
        movementDate: new Date('2025-03-10T00:00:00.000Z'),
        type: 'INSTALLMENT',
        debit: 6000,
        balanceAfter: 12000,
        label: 'Loyer de mars 2025'
      });
      seedMovement({
        id: 's4',
        accountId: 'acc-c',
        movementDate: new Date('2026-01-10T00:00:00.000Z'),
        type: 'INSTALLMENT',
        debit: 8000,
        balanceAfter: 20000,
        label: 'Loyer de janvier 2026'
      });
    });

    it('leve une erreur 404 quand le compte est introuvable pour ce tenant', async () => {
      await expect(getAccountStatement(TENANT_ID, 'acc-inconnu')).rejects.toMatchObject({ status: 404 });
    });

    it('sans filtre, renvoie tout l historique, ouverture a zero et cloture au solde courant', async () => {
      const statement = await getAccountStatement(TENANT_ID, 'acc-c');

      expect(statement.movements.map(m => m.id)).toEqual(['s1', 's2', 's3', 's4']);
      expect(statement.openingBalance).toBe(0);
      expect(statement.closingBalance).toBe(20000);
      expect(statement.total).toBe(4);
    });

    it('borne le releve par dates : ouverture calculee depuis le dernier mouvement anterieur a la borne', async () => {
      const statement = await getAccountStatement(TENANT_ID, 'acc-c', {
        range: { from: new Date('2025-02-01T00:00:00.000Z'), to: new Date('2025-02-28T00:00:00.000Z') }
      });

      expect(statement.movements.map(m => m.id)).toEqual(['s2']);
      // s1.balanceAfter = 10000, mouvement le plus recent avant le 1er fevrier.
      expect(statement.openingBalance).toBe(10000);
      expect(statement.closingBalance).toBe(6000);
      expect(statement.total).toBe(1);
    });

    it('ouverture a zero quand aucun mouvement ne precede la borne basse', async () => {
      const statement = await getAccountStatement(TENANT_ID, 'acc-c', {
        range: { from: new Date('2024-01-01T00:00:00.000Z'), to: new Date('2024-12-31T00:00:00.000Z') }
      });

      expect(statement.movements).toHaveLength(0);
      expect(statement.openingBalance).toBe(0);
      expect(statement.closingBalance).toBe(0);
    });

    it('ne reproduit pas le defaut du releve de copropriete : periode vide mais compte mouvemente APRES ne replie pas sur le solde actuel', async () => {
      // Fenetre 2025-06 a 2025-12 : aucun mouvement dedans (s3 est en mars 2025,
      // s4 en janvier 2026). Le solde courant du compte est 20000 (apres s4),
      // mais ni l ouverture ni la cloture ne doivent l afficher : elles valent
      // toutes deux le solde au 10 mars 2025 (12000), seul mouvement anterieur
      // ou compris dans la fenetre.
      const statement = await getAccountStatement(TENANT_ID, 'acc-c', {
        range: { from: new Date('2025-06-01T00:00:00.000Z'), to: new Date('2025-12-31T00:00:00.000Z') }
      });

      expect(statement.movements).toHaveLength(0);
      expect(statement.openingBalance).toBe(12000);
      expect(statement.closingBalance).toBe(12000);
      expect(statement.closingBalance).not.toBe(20000);
    });

    it('applique la pagination (skip/take) sur la liste triee chronologiquement', async () => {
      const statement = await getAccountStatement(TENANT_ID, 'acc-c', { skip: 1, take: 1 });

      expect(statement.movements.map(m => m.id)).toEqual(['s2']);
      expect(statement.total).toBe(4);
    });
  });

  describe('Vocabulaire (principe P-1) : ni "debit" ni "credit" dans les reponses', () => {
    beforeEach(() => {
      seedLease({
        id: 'lease-a',
        property_id: 'prop-a',
        primary_renter_client_id: 'client-a',
        property: { title: 'Villa Almadies', internalReference: 'REF-A' }
      });
      seedAccount({ id: 'acc-a', tenantClientId: 'client-a', label: 'Awa Diop', balance: 40000 });
      seedMovement({
        id: 'm1',
        accountId: 'acc-a',
        movementDate: new Date('2026-01-05T00:00:00.000Z'),
        type: 'INSTALLMENT',
        debit: 40000,
        balanceAfter: 40000,
        label: 'Loyer de janvier',
        leaseId: 'lease-a'
      });
      seedInstallment({
        id: 'i-1',
        lease_id: 'lease-a',
        due_date: new Date('2026-01-05T00:00:00.000Z'),
        amount_rent: 40000
      });
    });

    function collectStrings(value: unknown, acc: string[] = []): string[] {
      if (typeof value === 'string') {
        acc.push(value);
      } else if (Array.isArray(value)) {
        value.forEach(v => collectStrings(v, acc));
      } else if (value && typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach(v => collectStrings(v, acc));
      }
      return acc;
    }

    function normalize(s: string): string {
      return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    }

    it('n expose "debit"/"credit" dans aucune chaine renvoyee, casse et accents indifferents', async () => {
      const balance = await getClientsBalance(TENANT_ID);
      const aging = await getClientsAgingBalance(TENANT_ID, { asOf: new Date('2026-06-15T00:00:00.000Z') });
      const statement = await getAccountStatement(TENANT_ID, 'acc-a');

      const allStrings = [...collectStrings(balance), ...collectStrings(aging), ...collectStrings(statement)];
      expect(allStrings.length).toBeGreaterThan(0);

      for (const raw of allStrings) {
        const normalized = normalize(raw);
        expect(normalized).not.toContain('debit');
        expect(normalized).not.toContain('credit');
      }
    });
  });
});
