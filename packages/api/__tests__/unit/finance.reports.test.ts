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
    installments: [] as Row[],
    allocations: [] as Row[]
  };

  const inFilter = (filter: any, value: unknown) => !filter?.in || filter.in.includes(value);

  const matchesMovementDate = (movementDate: Date, filter?: Row) => {
    if (!filter) return true;
    // Une date nue est une égalité (`{ movementDate: first.movementDate }`).
    if (filter instanceof Date) return new Date(movementDate).getTime() === filter.getTime();
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
    if (where.type !== undefined) {
      if (typeof where.type === 'object' && where.type !== null) {
        if (where.type.not !== undefined && m.type === where.type.not) return false;
        if (!inFilter(where.type, m.type)) return false;
      } else if (m.type !== where.type) {
        return false;
      }
    }
    if (where.leaseId && !inFilter(where.leaseId, m.leaseId)) return false;
    if (where.sourceType !== undefined) {
      if (typeof where.sourceType === 'object' && where.sourceType !== null) {
        if (where.sourceType.not !== undefined && m.sourceType === where.sourceType.not) return false;
      } else if (m.sourceType !== where.sourceType) {
        return false;
      }
    }
    if (where.sourceId && typeof where.sourceId === 'object' && !inFilter(where.sourceId, m.sourceId)) return false;
    if (where.movementDate && !matchesMovementDate(m.movementDate, where.movementDate)) return false;
    if (where.createdAt !== undefined) {
      if (where.createdAt instanceof Date) {
        if (new Date(m.createdAt).getTime() !== where.createdAt.getTime()) return false;
      } else if (where.createdAt.lt && !(new Date(m.createdAt).getTime() < new Date(where.createdAt.lt).getTime())) {
        return false;
      }
    }
    if (where.id !== undefined) {
      if (typeof where.id === 'object' && where.id !== null) {
        if (where.id.lt !== undefined && !(m.id < where.id.lt)) return false;
      } else if (m.id !== where.id) {
        return false;
      }
    }
    // `OR` : au moins une alternative doit convenir (chaque alternative est un filtre complet).
    if (where.OR && !where.OR.some((clause: Row) => matchesMovement(m, clause))) return false;
    return true;
  };

  const buildComparator = (orderBy?: Row[]) => (a: Row, b: Row) => {
    for (const clause of orderBy ?? []) {
      const [field, direction] = Object.entries(clause)[0] as [string, string];
      if (field === 'id') {
        if (a.id === b.id) continue;
        return (a.id < b.id ? -1 : 1) * (direction === 'desc' ? -1 : 1);
      }
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
        const byType = (args.by ?? []).includes('type');
        const sums = new Map<
          string,
          {
            accountId: string;
            type?: string;
            debitSum: number;
            hasDebit: boolean;
            creditSum: number;
            hasCredit: boolean;
          }
        >();
        for (const m of rows) {
          const key = byType ? `${m.accountId}|${m.type}` : m.accountId;
          const entry = sums.get(key) ?? {
            accountId: m.accountId,
            type: byType ? m.type : undefined,
            debitSum: 0,
            hasDebit: false,
            creditSum: 0,
            hasCredit: false
          };
          if (m.debit !== null && m.debit !== undefined) {
            entry.debitSum += Number(m.debit);
            entry.hasDebit = true;
          }
          if (m.credit !== null && m.credit !== undefined) {
            entry.creditSum += Number(m.credit);
            entry.hasCredit = true;
          }
          sums.set(key, entry);
        }
        return Array.from(sums.values()).map(e => ({
          accountId: e.accountId,
          ...(byType ? { type: e.type } : {}),
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
    rentalPaymentAllocation: {
      // Deux lectures : par identifiant (`where.id.in`, affectations encore existantes) et
      // les affectations à une échéance postérieure à `installment.due_date.gt`.
      findMany: jest.fn(async (args: Row) => {
        const where = args.where ?? {};
        const gt = where.installment?.due_date?.gt as Date | undefined;
        return store.allocations
          .filter(a => {
            if (where.tenant_id !== undefined && a.tenant_id !== where.tenant_id) return false;
            if (where.id?.in && !where.id.in.includes(a.id)) return false;
            if (gt && !(new Date(a.installment.due_date).getTime() > gt.getTime())) return false;
            return true;
          })
          .map(a => ({ id: a.id, amount: a.amount, payment: a.payment, installment: a.installment }));
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
              id: i.id,
              status: i.status,
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
import { clientsBalanceQuerySchema, resolveRange } from '../../src/lib/finance/schemas';

const { __store: store } = jest.requireMock('@prisma/client') as { __store: any };

const TENANT_ID = 'tenant-1';
const OTHER_TENANT_ID = 'tenant-2';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function resetStore() {
  store.accounts.length = 0;
  store.movements.length = 0;
  store.leases.length = 0;
  store.installments.length = 0;
  store.allocations.length = 0;
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

      seedAccount({ id: 'acc-a', tenantClientId: 'client-a', label: 'Awa Diop', balance: 90000 });
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

    it('renvoie une ligne par locataire, avec le solde de cloture (releve) et un total de controle', async () => {
      const result = await getClientsBalance(TENANT_ID);

      const lineA = result.lines.find(l => l.accountId === 'acc-a')!;
      const lineB = result.lines.find(l => l.accountId === 'acc-b')!;

      expect(lineA.totalBilled).toBe(150000);
      expect(lineA.totalSettled).toBe(60000);
      expect(lineA.balance).toBe(90000); // Σ facturé − Σ réglé à date (plus le solde stocké)
      // Le nom du bien, pas sa reference technique.
      expect(lineA.propertyLabels).toEqual(['Villa Almadies']);

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
      // Solde à la fin de la période (28/02) : m1 + m3 − m2 = 90 000.
      expect(line.balance).toBe(90000);
    });

    it('filtre par bien : seuls les locataires ayant un bail sur ce bien apparaissent', async () => {
      const result = await getClientsBalance(TENANT_ID, { propertyId: 'prop-b' });

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].accountId).toBe('acc-b');
      expect(result.lines[0].propertyLabels).toEqual(['Appartement Plateau']);
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

    // BUG-2026-10-01-003 : borne de fin « jour seul » inclusive, solde à la fin de période.
    describe('periode : borne de fin inclusive et solde a la fin de la periode', () => {
      const at = (iso: string) => new Date(iso);
      /** Comme le contrôleur : requête brute → schéma → resolveRange → lecteur. */
      const balanceFor = async (query: Record<string, string>) => {
        const range = resolveRange(clientsBalanceQuerySchema.parse(query));
        return getClientsBalance(TENANT_ID, { range: range.from || range.to ? range : undefined });
      };

      beforeEach(() => {
        store.movements.length = 0;
        store.accounts.length = 0;
        seedAccount({ id: 'acc-k', tenantClientId: 'client-k', label: 'Kouadio', balance: 0 });
        seedMovement({
          id: 'aout',
          accountId: 'acc-k',
          movementDate: at('2026-08-05T00:00:00.000Z'),
          type: 'INSTALLMENT',
          debit: 480000
        });
        seedMovement({
          id: 'fac-30',
          accountId: 'acc-k',
          movementDate: at('2026-09-30T12:00:00.000Z'),
          type: 'INSTALLMENT',
          debit: 960000
        });
        seedMovement({
          id: 'reg-30',
          accountId: 'acc-k',
          movementDate: at('2026-09-30T12:00:00.000Z'),
          type: 'PAYMENT',
          credit: 780000
        });
        // Postérieur à la fin de période (septembre) : hors facturé, réglé ET solde.
        seedMovement({
          id: 'oct',
          accountId: 'acc-k',
          movementDate: at('2026-10-01T00:00:00.000Z'),
          type: 'INSTALLMENT',
          debit: 50000
        });
      });

      it('to jour seul : un mouvement a 12:00 le jour de `to` est compte', async () => {
        const [line] = (await balanceFor({ from: '2026-09-01', to: '2026-09-30' })).lines;

        expect(line.totalBilled).toBe(960000);
        expect(line.totalSettled).toBe(780000);
      });

      it('from = to (meme jour) renvoie le jour entier', async () => {
        const result = await balanceFor({ from: '2026-09-30', to: '2026-09-30' });

        expect(result.lines).toHaveLength(1);
        expect(result.lines[0].totalBilled).toBe(960000);
        expect(result.lines[0].totalSettled).toBe(780000);
      });

      it('to avec heure explicite : non modifie (le mouvement de 12:00 est exclu a 06:00)', async () => {
        const result = await balanceFor({ from: '2026-09-30T00:00:00.000Z', to: '2026-09-30T06:00:00.000Z' });

        expect(result.lines).toHaveLength(0);
      });

      it('le solde d une periode est le solde a sa fin ; un mouvement posterieur en est exclu', async () => {
        const [aout] = (await balanceFor({ from: '2026-08-01', to: '2026-08-31' })).lines;
        expect(aout.totalBilled).toBe(480000);
        expect(aout.totalSettled).toBe(0);
        expect(aout.balance).toBe(480000); // fin août, pas le solde à date

        const [sept] = (await balanceFor({ from: '2026-09-01', to: '2026-09-30' })).lines;
        // 480 000 + 960 000 − 780 000 ; les 50 000 d'octobre n'y sont pas.
        expect(sept.balance).toBe(660000);
      });

      it('sans periode : solde a date, mouvement d octobre compris', async () => {
        const [line] = (await getClientsBalance(TENANT_ID, { asOf: at('2026-10-02T00:00:00.000Z') })).lines;

        expect(line.balance).toBe(710000);
      });

      it('un compte qui n’a que des contre-passations (VOID) dans la période reste dans la balance', async () => {
        // Septembre ne contient, pour ce compte, que l'annulation d'un loyer facturé en août.
        seedAccount({ id: 'acc-void', tenantClientId: 'client-void', label: 'Void seul', balance: 0 });
        seedMovement({
          id: 'void-1',
          accountId: 'acc-void',
          movementDate: at('2026-08-05T00:00:00.000Z'),
          type: 'INSTALLMENT',
          debit: 100000
        });
        seedMovement({
          id: 'void-2',
          accountId: 'acc-void',
          movementDate: at('2026-09-10T00:00:00.000Z'),
          type: 'VOID',
          credit: 100000
        });

        const { lines } = await balanceFor({ from: '2026-09-01', to: '2026-09-30' });
        const ligne = lines.find(l => l.accountId === 'acc-void');

        expect(ligne).toBeDefined();
        // L'annulation reprend la facturation : facturé −100 000, réglé 0, solde à fin septembre 0.
        expect(ligne!.totalBilled).toBe(-100000);
        expect(ligne!.totalSettled).toBe(0);
        expect(ligne!.balance).toBe(0);
      });
    });
  });

  describe('getClientsAgingBalance', () => {
    const ASOF = new Date('2026-06-15T00:00:00.000Z');

    it('BUG-2026-11-04-036 : compte un brouillon facturé au jour dû, mais pas un vrai brouillon', async () => {
      seedLease({ id: 'lease-prisca', property_id: 'prop-a', primary_renter_client_id: 'client-prisca' });
      seedAccount({ id: 'acc-prisca', tenantClientId: 'client-prisca', label: 'Prisca', balance: 185000 });
      seedInstallment({
        id: 'draft-billed',
        lease_id: 'lease-prisca',
        status: 'DRAFT',
        due_date: ASOF,
        amount_rent: 185000
      });
      seedInstallment({
        id: 'draft-unbilled',
        lease_id: 'lease-prisca',
        status: 'DRAFT',
        due_date: ASOF,
        amount_rent: 90000
      });
      seedInstallment({
        id: 'draft-future',
        lease_id: 'lease-prisca',
        status: 'DRAFT',
        due_date: new Date('2026-07-15T00:00:00Z'),
        amount_rent: 50000
      });
      seedInstallment({
        id: 'cancelled',
        lease_id: 'lease-prisca',
        status: 'CANCELED',
        due_date: ASOF,
        amount_rent: 120000
      });
      seedMovement({
        id: 'm-draft',
        accountId: 'acc-prisca',
        movementDate: ASOF,
        type: 'INSTALLMENT',
        debit: 185000,
        sourceId: 'draft-billed',
        leaseId: 'lease-prisca'
      });

      const before = await getClientsAgingBalance(TENANT_ID, { asOf: new Date('2026-06-14T00:00:00Z') });
      expect(before.lines.find(l => l.accountId === 'acc-prisca')?.agedTotal ?? 0).toBe(0);

      const due = await getClientsAgingBalance(TENANT_ID, { asOf: ASOF });
      const line = due.lines.find(l => l.accountId === 'acc-prisca')!;
      expect(line.days0To30).toBe(185000);
      expect(line.notYetDue).toBe(0);
      expect(line.ledgerBalance).toBe(185000);
      expect(line.gap).toBe(0);

      const after = await getClientsAgingBalance(TENANT_ID, { asOf: new Date('2026-06-16T00:00:00Z') });
      expect(after.lines.find(l => l.accountId === 'acc-prisca')?.gap).toBe(0);

      const nextDay = new Date('2026-06-16T00:00:00Z');
      seedInstallment({ id: 'next-day-due', lease_id: 'lease-prisca', due_date: nextDay, amount_rent: 1000 });
      seedMovement({
        id: 'next-day-movement',
        accountId: 'acc-prisca',
        movementDate: nextDay,
        type: 'INSTALLMENT',
        debit: 1000,
        sourceId: 'next-day-due',
        leaseId: 'lease-prisca'
      });
      const fromNextDay = await getClientsAgingBalance(TENANT_ID, { asOf: nextDay, range: { from: nextDay } });
      const lineFromNextDay = fromNextDay.lines.find(l => l.accountId === 'acc-prisca')!;
      expect(lineFromNextDay.ledgerBalance).toBe(186000);
      expect(lineFromNextDay.agedTotal).toBe(186000);
      expect(lineFromNextDay.gap).toBe(0);
    });

    it('borne le brouillon facturé à la fin du filtre de période', async () => {
      seedLease({ id: 'lease-cutoff', property_id: 'prop-a', primary_renter_client_id: 'client-cutoff' });
      seedAccount({ id: 'acc-cutoff', tenantClientId: 'client-cutoff', label: 'Compte', balance: 186000 });
      seedInstallment({
        id: 'old-due',
        lease_id: 'lease-cutoff',
        due_date: new Date('2026-06-01T00:00:00Z'),
        amount_rent: 1000
      });
      seedMovement({
        id: 'old-movement',
        accountId: 'acc-cutoff',
        movementDate: new Date('2026-06-01T00:00:00Z'),
        type: 'INSTALLMENT',
        debit: 1000,
        sourceId: 'old-due',
        leaseId: 'lease-cutoff'
      });
      seedInstallment({
        id: 'draft-later',
        lease_id: 'lease-cutoff',
        status: 'DRAFT',
        due_date: ASOF,
        amount_rent: 185000
      });
      seedMovement({
        id: 'later-movement',
        accountId: 'acc-cutoff',
        movementDate: ASOF,
        type: 'INSTALLMENT',
        debit: 185000,
        sourceId: 'draft-later',
        leaseId: 'lease-cutoff'
      });

      const result = await getClientsAgingBalance(TENANT_ID, {
        asOf: ASOF,
        range: { to: new Date('2026-06-14T00:00:00Z') }
      });
      const line = result.lines.find(l => l.accountId === 'acc-cutoff')!;
      expect(line.agedTotal).toBe(1000);
      expect(line.ledgerBalance).toBe(1000);
      expect(line.gap).toBe(0);
    });

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
      // Total = somme des tranches (une seule source : les echeances), meme si le solde comptable (40000) differe (36000 d echeances).
      const bucketsSum = line.notYetDue + line.days0To30 + line.days30To60 + line.days60To90 + line.daysOver90;
      expect(bucketsSum).toBe(36000);
      expect(result.totalBalance).toBe(bucketsSum);
      expect(result.lines.reduce((sum, l) => sum + l.agedTotal, 0)).toBe(result.totalBalance);
      // Le solde comptable reste disponible a part, avec l ecart.
      expect(line.ledgerBalance).toBe(40000);
      expect(result.ledgerTotalBalance).toBe(40000);
      // L'écart compare des grandeurs comparables : le grand livre ne compte
      // un loyer qu'à son échéance, donc on retire les 1000 « à échoir ».
      expect(line.gap).toBe(5000);
      expect(result.gap).toBe(5000);
    });

    it('BUG-2026-11-04-021 : un loyer émis non échu (à échoir) ne crée aucun écart avec la comptabilité', async () => {
      seedLease({
        id: 'lease-c',
        property_id: 'prop-c',
        primary_renter_client_id: 'client-c',
        property: { title: 'Bien C', internalReference: 'REF-C' }
      });
      seedAccount({ id: 'acc-c', tenantClientId: 'client-c', label: 'Locataire C', balance: 640000 });
      seedMovement({
        id: 'm-c',
        accountId: 'acc-c',
        movementDate: new Date('2026-01-05T00:00:00.000Z'),
        type: 'INSTALLMENT',
        debit: 640000,
        balanceAfter: 640000,
        label: 'Loyers échus',
        leaseId: 'lease-c'
      });
      const day = 24 * 60 * 60 * 1000;
      for (const [i, d] of [100, 70, 40, 10].entries()) {
        seedInstallment({
          id: `c-${i}`,
          lease_id: 'lease-c',
          due_date: new Date(ASOF.getTime() - d * day),
          amount_rent: 160000
        });
      }
      seedInstallment({
        id: 'c-futur',
        lease_id: 'lease-c',
        due_date: new Date(ASOF.getTime() + 5 * day),
        amount_rent: 160000
      });

      const result = await getClientsAgingBalance(TENANT_ID, { asOf: ASOF });
      const line = result.lines.find(l => l.accountId === 'acc-c')!;
      expect(line.agedTotal).toBe(800000);
      expect(line.notYetDue).toBe(160000);
      expect(line.ledgerBalance).toBe(640000);
      expect(line.gap).toBe(0);
    });

    it('un vrai écart reste signalé malgré les loyers à échoir', async () => {
      seedLease({
        id: 'lease-d',
        property_id: 'prop-d',
        primary_renter_client_id: 'client-d',
        property: { title: 'Bien D', internalReference: 'REF-D' }
      });
      // Le grand livre porte 10 000 de plus que les échéances échues.
      seedAccount({ id: 'acc-d', tenantClientId: 'client-d', label: 'Locataire D', balance: 170000 });
      seedMovement({
        id: 'm-d',
        accountId: 'acc-d',
        movementDate: new Date('2026-01-05T00:00:00.000Z'),
        type: 'INSTALLMENT',
        debit: 170000,
        balanceAfter: 170000,
        label: 'Loyers',
        leaseId: 'lease-d'
      });
      seedInstallment({
        id: 'd-1',
        lease_id: 'lease-d',
        due_date: new Date(ASOF.getTime() - 10 * MS_PER_DAY),
        amount_rent: 160000
      });
      seedInstallment({
        id: 'd-2',
        lease_id: 'lease-d',
        due_date: new Date(ASOF.getTime() + 5 * MS_PER_DAY),
        amount_rent: 160000
      });
      const result = await getClientsAgingBalance(TENANT_ID, { asOf: ASOF });
      expect(result.lines.find(l => l.accountId === 'acc-d')!.gap).toBe(10000);
    });

    describe('BUG-2026-11-04-036 : trop-perçus et pénalités ajustées', () => {
      function seedLocataire(suffix: string, balance: number) {
        seedLease({
          id: `lease-${suffix}`,
          property_id: `prop-${suffix}`,
          primary_renter_client_id: `client-${suffix}`,
          property: { title: `Bien ${suffix}`, internalReference: `REF-${suffix}` }
        });
        seedAccount({ id: `acc-${suffix}`, tenantClientId: `client-${suffix}`, label: `Locataire ${suffix}`, balance });
      }

      it('une avance non affectée est présentée à part et ne crée aucun écart', async () => {
        seedLocataire('e', 0);
        const jan = new Date('2026-01-05T00:00:00.000Z');
        // Loyer payé en entier, plus 200 000 d'avance reçue : le compte est créditeur.
        seedMovement({
          id: 'e1',
          accountId: 'acc-e',
          movementDate: jan,
          type: 'INSTALLMENT',
          debit: 100000,
          leaseId: 'lease-e'
        });
        seedMovement({
          id: 'e2',
          accountId: 'acc-e',
          movementDate: jan,
          type: 'ADVANCE_RECEIVED',
          credit: 300000,
          leaseId: 'lease-e'
        });
        seedMovement({
          id: 'e3',
          accountId: 'acc-e',
          movementDate: jan,
          type: 'PAYMENT',
          credit: 100000,
          leaseId: 'lease-e'
        });
        seedMovement({
          id: 'e4',
          accountId: 'acc-e',
          movementDate: jan,
          type: 'ADVANCE_APPLIED',
          debit: 100000,
          leaseId: 'lease-e'
        });
        seedInstallment({
          id: 'e-1',
          lease_id: 'lease-e',
          due_date: jan,
          amount_rent: 100000,
          amount_paid: 100000,
          status: 'PAID'
        });

        const result = await getClientsAgingBalance(TENANT_ID, { asOf: ASOF });
        const line = result.lines.find(l => l.accountId === 'acc-e')!;
        expect(line.ledgerBalance).toBe(-200000);
        expect(line.agedTotal).toBe(0);
        expect(line.unallocatedAdvance).toBe(200000);
        expect(line.gap).toBe(0);
        expect(result.unallocatedAdvance).toBe(200000);
      });

      it('un écart réel reste signalé même en présence d’une avance', async () => {
        seedLocataire('f', 0);
        const jan = new Date('2026-01-05T00:00:00.000Z');
        seedMovement({
          id: 'f1',
          accountId: 'acc-f',
          movementDate: jan,
          type: 'ADVANCE_RECEIVED',
          credit: 50000,
          leaseId: 'lease-f'
        });
        // 7 000 de débit sans échéance impayée correspondante.
        seedMovement({
          id: 'f2',
          accountId: 'acc-f',
          movementDate: jan,
          type: 'ADJUSTMENT',
          debit: 7000,
          leaseId: 'lease-f'
        });

        const result = await getClientsAgingBalance(TENANT_ID, { asOf: ASOF });
        const line = result.lines.find(l => l.accountId === 'acc-f')!;
        expect(line.unallocatedAdvance).toBe(50000);
        // Grand livre −43 000 + avance 50 000 − tranches 0 : il reste les 7 000.
        expect(line.gap).toBe(7000);
      });

      it('une pénalité remise dans la journée (mouvement postérieur à minuit) ne crée aucun écart', async () => {
        seedLocataire('g', 0);
        const jan = new Date('2026-01-05T00:00:00.000Z');
        const apresMinuit = new Date(ASOF.getTime() + 10 * 60 * 60 * 1000);
        // Loyer 100 000 en retard, pénalité 5 000 portée à 1 800 aujourd'hui.
        seedMovement({
          id: 'g1',
          accountId: 'acc-g',
          movementDate: jan,
          type: 'INSTALLMENT',
          debit: 100000,
          leaseId: 'lease-g'
        });
        seedMovement({
          id: 'g2',
          accountId: 'acc-g',
          movementDate: jan,
          type: 'PENALTY',
          debit: 5000,
          sourceType: 'RENTAL_PENALTY',
          sourceId: 'pen-1',
          leaseId: 'lease-g'
        });
        seedMovement({
          id: 'g3',
          accountId: 'acc-g',
          movementDate: apresMinuit,
          type: 'WAIVER',
          credit: 3200,
          sourceType: 'RENTAL_PENALTY',
          sourceId: 'pen-1',
          leaseId: 'lease-g'
        });
        seedInstallment({
          id: 'g-1',
          lease_id: 'lease-g',
          due_date: jan,
          amount_rent: 100000,
          penalty_amount: 1800,
          status: 'OVERDUE'
        });

        const result = await getClientsAgingBalance(TENANT_ID, { asOf: ASOF });
        const line = result.lines.find(l => l.accountId === 'acc-g')!;
        expect(line.ledgerBalance).toBe(101800);
        expect(line.agedTotal).toBe(101800);
        expect(line.gap).toBe(0);
      });

      it('une pénalité relevée (clé <id>:<n>) est comptée des deux côtés', async () => {
        seedLocataire('h', 0);
        const jan = new Date('2026-01-05T00:00:00.000Z');
        seedMovement({
          id: 'h1',
          accountId: 'acc-h',
          movementDate: jan,
          type: 'INSTALLMENT',
          debit: 100000,
          leaseId: 'lease-h'
        });
        seedMovement({
          id: 'h2',
          accountId: 'acc-h',
          movementDate: jan,
          type: 'PENALTY',
          debit: 2000,
          sourceType: 'RENTAL_PENALTY',
          sourceId: 'pen-2',
          leaseId: 'lease-h'
        });
        seedMovement({
          id: 'h3',
          accountId: 'acc-h',
          movementDate: new Date(ASOF.getTime() + 3600000),
          type: 'PENALTY',
          debit: 3200,
          sourceType: 'RENTAL_PENALTY',
          sourceId: 'pen-2:2',
          leaseId: 'lease-h'
        });
        seedInstallment({
          id: 'h-1',
          lease_id: 'lease-h',
          due_date: jan,
          amount_rent: 100000,
          penalty_amount: 5200,
          status: 'OVERDUE'
        });

        const result = await getClientsAgingBalance(TENANT_ID, { asOf: ASOF });
        expect(result.lines.find(l => l.accountId === 'acc-h')!.gap).toBe(0);
      });

      it('un loyer futur daté du lendemain reste hors du grand livre', async () => {
        seedLocataire('i', 0);
        seedMovement({
          id: 'i1',
          accountId: 'acc-i',
          movementDate: new Date(ASOF.getTime() + MS_PER_DAY),
          type: 'INSTALLMENT',
          debit: 90000,
          leaseId: 'lease-i'
        });
        seedInstallment({
          id: 'i-1',
          lease_id: 'lease-i',
          due_date: new Date(ASOF.getTime() + MS_PER_DAY),
          amount_rent: 90000
        });
        seedMovement({
          id: 'i2',
          accountId: 'acc-i',
          movementDate: new Date('2026-01-05T00:00:00.000Z'),
          type: 'PAYMENT',
          credit: 1,
          leaseId: 'lease-i'
        });

        const result = await getClientsAgingBalance(TENANT_ID, { asOf: ASOF });
        const line = result.lines.find(l => l.accountId === 'acc-i')!;
        expect(line.notYetDue).toBe(90000);
        expect(line.ledgerBalance).toBe(-1);
      });

      describe('ajustements de pénalité : comptés de la même façon des deux côtés de l’écart', () => {
        // Loyer échu de 160 000 ; la pénalité (clé `<id>`, compléments `<id>:<n>`) est ajustée dans la journée.
        const jan = new Date('2026-01-05T00:00:00.000Z');
        const aujourdhui = new Date(ASOF.getTime() + 10 * 60 * 60 * 1000); // 10:00, après minuit

        function seedLoyerEtPenalite(suffix: string, penaltyAmount: number, mouvements: Record<string, any>[]) {
          seedLocataire(suffix, 0);
          seedMovement({
            id: `${suffix}-loyer`,
            accountId: `acc-${suffix}`,
            movementDate: jan,
            type: 'INSTALLMENT',
            debit: 160000,
            leaseId: `lease-${suffix}`
          });
          mouvements.forEach((m, index) =>
            seedMovement({
              id: `${suffix}-pen-${index}`,
              accountId: `acc-${suffix}`,
              movementDate: aujourdhui,
              sourceType: 'RENTAL_PENALTY',
              leaseId: `lease-${suffix}`,
              ...m
            })
          );
          seedInstallment({
            id: `${suffix}-i`,
            lease_id: `lease-${suffix}`,
            due_date: jan,
            amount_rent: 160000,
            penalty_amount: penaltyAmount
          });
        }

        const ecart = async (suffix: string) =>
          (await getClientsAgingBalance(TENANT_ID, { asOf: ASOF })).lines.find(l => l.accountId === `acc-${suffix}`)!;

        it('hausse : le complément `<id>:1` est compté comme le miroir de l’échéance', async () => {
          seedLoyerEtPenalite('h1', 4000, [
            { type: 'PENALTY', debit: 3200, sourceId: 'pen-h1' },
            { type: 'PENALTY', debit: 800, sourceId: 'pen-h1:1' }
          ]);
          const line = await ecart('h1');
          expect(line.ledgerBalance).toBe(164000);
          expect(line.agedTotal).toBe(164000);
          expect(line.gap).toBe(0);
        });

        it('baisse : la remise partielle (WAIVER) est comptée comme le miroir de l’échéance', async () => {
          seedLoyerEtPenalite('h2', 2000, [
            { type: 'PENALTY', debit: 3200, sourceId: 'pen-h2' },
            { type: 'WAIVER', credit: 1200, sourceId: 'pen-h2' }
          ]);
          const line = await ecart('h2');
          expect(line.ledgerBalance).toBe(162000);
          expect(line.gap).toBe(0);
        });

        it('remise à 0 : le débit est entièrement repris', async () => {
          seedLoyerEtPenalite('h3', 0, [
            { type: 'PENALTY', debit: 3200, sourceId: 'pen-h3' },
            { type: 'WAIVER', credit: 3200, sourceId: 'pen-h3' }
          ]);
          const line = await ecart('h3');
          expect(line.ledgerBalance).toBe(160000);
          expect(line.gap).toBe(0);
        });

        it('suppression après une baisse : seconde remise `<id>:2`, miroir à 0', async () => {
          seedLoyerEtPenalite('h4', 0, [
            { type: 'PENALTY', debit: 3200, sourceId: 'pen-h4' },
            { type: 'WAIVER', credit: 200, sourceId: 'pen-h4' },
            { type: 'WAIVER', credit: 3000, sourceId: 'pen-h4:2' }
          ]);
          const line = await ecart('h4');
          expect(line.ledgerBalance).toBe(160000);
          expect(line.gap).toBe(0);
        });

        it('un reliquat de pénalité supprimée sans remise complète (ancienne anomalie) reste signalé', async () => {
          // Pénalité 3 200 remise de 200, puis supprimée SANS seconde remise : le grand livre garde 3 000
          // que plus aucune échéance ne porte. C'est une vraie incohérence, elle doit rester visible.
          seedLoyerEtPenalite('h5', 0, [
            { type: 'PENALTY', debit: 3200, sourceId: 'pen-h5' },
            { type: 'WAIVER', credit: 200, sourceId: 'pen-h5' }
          ]);
          const line = await ecart('h5');
          expect(line.ledgerBalance).toBe(163000);
          expect(line.gap).toBe(3000);
        });
      });

      describe('contre-passations d’avance et règlements d’échéances à échoir', () => {
        const jan = new Date('2026-01-05T00:00:00.000Z');

        /** Un loyer échu impayé de 100 000 : il garde une ligne au compte et ancre l'écart à 0. */
        function seedLoyerEchu(suffix: string) {
          seedMovement({
            id: `${suffix}-loyer`,
            accountId: `acc-${suffix}`,
            movementDate: jan,
            type: 'INSTALLMENT',
            debit: 100000,
            leaseId: `lease-${suffix}`
          });
          seedInstallment({
            id: `${suffix}-i`,
            lease_id: `lease-${suffix}`,
            due_date: jan,
            amount_rent: 100000
          });
        }

        it('un règlement annulé (avance contre-passée) ne laisse ni avance ni écart', async () => {
          seedLocataire('v', 0);
          seedLoyerEchu('v');
          seedMovement({
            id: 'v1',
            accountId: 'acc-v',
            movementDate: jan,
            type: 'ADVANCE_RECEIVED',
            credit: 50000,
            sourceType: 'RENTAL_PAYMENT',
            sourceId: 'pay-v'
          });
          // `annulerPieceTx` : la pièce « avance » est reprise par un débit VOID de même pièce.
          seedMovement({
            id: 'v2',
            accountId: 'acc-v',
            movementDate: new Date('2026-02-01T00:00:00.000Z'),
            type: 'VOID',
            debit: 50000,
            sourceType: 'RENTAL_PAYMENT',
            sourceId: 'pay-v'
          });

          const result = await getClientsAgingBalance(TENANT_ID, { asOf: ASOF });
          const line = result.lines.find(l => l.accountId === 'acc-v')!;
          expect(line.ledgerBalance).toBe(100000);
          expect(line.unallocatedAdvance).toBe(0);
          expect(line.gap).toBe(0);
          // Le total reste la somme des lignes (la ligne « a » de ce bloc porte déjà son propre écart de 5 000).
          expect(result.gap).toBe(5000);
        });

        it('un dépôt de garantie collecté depuis une avance (retirerAvanceDuDepotTx) ne crée aucun écart', async () => {
          seedLocataire('w', 0);
          seedLoyerEchu('w');
          seedMovement({
            id: 'w1',
            accountId: 'acc-w',
            movementDate: jan,
            type: 'ADVANCE_RECEIVED',
            credit: 300000,
            sourceType: 'RENTAL_PAYMENT',
            sourceId: 'pay-w'
          });
          seedMovement({
            id: 'w2',
            accountId: 'acc-w',
            movementDate: jan,
            type: 'VOID',
            debit: 300000,
            label: 'Dépôt de garantie encaissé : retiré des avances du locataire',
            sourceType: 'RENTAL_PAYMENT',
            sourceId: 'pay-w'
          });

          const line = (await getClientsAgingBalance(TENANT_ID, { asOf: ASOF })).lines.find(
            l => l.accountId === 'acc-w'
          )!;
          expect(line.unallocatedAdvance).toBe(0);
          expect(line.gap).toBe(0);
        });

        it('la contre-passation d’une affectation (autre pièce) n’est pas une avance', async () => {
          seedLocataire('x', 0);
          seedLoyerEchu('x');
          // Règlement affecté puis annulé : le PAYMENT et son VOID portent la pièce d'affectation.
          seedMovement({
            id: 'x1',
            accountId: 'acc-x',
            movementDate: jan,
            type: 'PAYMENT',
            credit: 40000,
            sourceType: 'RENTAL_PAYMENT_ALLOCATION',
            sourceId: 'alloc-x'
          });
          seedMovement({
            id: 'x2',
            accountId: 'acc-x',
            movementDate: jan,
            type: 'VOID',
            debit: 40000,
            sourceType: 'RENTAL_PAYMENT_ALLOCATION',
            sourceId: 'alloc-x'
          });

          const line = (await getClientsAgingBalance(TENANT_ID, { asOf: ASOF })).lines.find(
            l => l.accountId === 'acc-x'
          )!;
          expect(line.unallocatedAdvance).toBe(0);
          expect(line.gap).toBe(0);
        });

        const ALLOC_Y = '00000000-0000-4000-8000-0000000000c1';
        const ALLOC_Z = '00000000-0000-4000-8000-0000000000c2';
        const ALLOC_U = '00000000-0000-4000-8000-0000000000c3';
        const ALLOC_N = '00000000-0000-4000-8000-0000000000c4';

        function seedAffectationFuture(suffix: string, amount: number, allocationId: string) {
          const dueDate = new Date(ASOF.getTime() + 20 * MS_PER_DAY);
          seedInstallment({
            id: `${suffix}-futur`,
            lease_id: `lease-${suffix}`,
            due_date: dueDate,
            amount_rent: 100000,
            amount_paid: amount,
            status: 'PARTIAL'
          });
          store.allocations.push({
            id: allocationId,
            tenant_id: TENANT_ID,
            amount,
            payment: { succeeded_at: jan, initiated_at: jan, renter_client_id: `client-${suffix}` },
            installment: {
              due_date: dueDate,
              lease_id: `lease-${suffix}`,
              lease: { primary_renter_client_id: `client-${suffix}` }
            }
          });
        }

        it('un règlement affecté à une échéance à échoir ne crée pas d’écart négatif', async () => {
          seedLocataire('y', 0);
          seedLoyerEchu('y');
          seedMovement({
            id: 'y1',
            accountId: 'acc-y',
            movementDate: jan,
            type: 'PAYMENT',
            credit: 60000,
            sourceType: 'RENTAL_PAYMENT_ALLOCATION',
            sourceId: ALLOC_Y
          });
          seedAffectationFuture('y', 60000, ALLOC_Y);

          const result = await getClientsAgingBalance(TENANT_ID, { asOf: ASOF });
          const line = result.lines.find(l => l.accountId === 'acc-y')!;
          // Grand livre : 100 000 de loyer échu − 60 000 réglés ; tranches hors « à échoir » : 100 000.
          expect(line.ledgerBalance).toBe(40000);
          expect(line.notYetDue).toBe(40000);
          expect(line.gap).toBe(0);
          expect(result.gap).toBe(5000);
        });

        it('idem quand le règlement avait d’abord été porté en avance (reprise ADVANCE_APPLIED)', async () => {
          seedLocataire('z', 0);
          seedLoyerEchu('z');
          seedMovement({
            id: 'z1',
            accountId: 'acc-z',
            movementDate: jan,
            type: 'ADVANCE_RECEIVED',
            credit: 100000,
            sourceType: 'RENTAL_PAYMENT',
            sourceId: 'pay-z'
          });
          seedMovement({
            id: 'z2',
            accountId: 'acc-z',
            movementDate: jan,
            type: 'PAYMENT',
            credit: 60000,
            sourceType: 'RENTAL_PAYMENT_ALLOCATION',
            sourceId: ALLOC_Z
          });
          seedMovement({
            id: 'z3',
            accountId: 'acc-z',
            movementDate: jan,
            type: 'ADVANCE_APPLIED',
            debit: 60000,
            sourceType: 'RENTAL_PAYMENT_ALLOCATION',
            sourceId: ALLOC_Z
          });
          seedAffectationFuture('z', 60000, ALLOC_Z);

          const line = (await getClientsAgingBalance(TENANT_ID, { asOf: ASOF })).lines.find(
            l => l.accountId === 'acc-z'
          )!;
          expect(line.unallocatedAdvance).toBe(40000);
          expect(line.gap).toBe(0);
        });

        const ALLOC_MORTE = '00000000-0000-4000-8000-0000000000aa';
        const ALLOC_VIVANTE = '00000000-0000-4000-8000-0000000000bb';

        it('règlement annulé après affectation : l’imputation de l’affectation supprimée n’est pas comptée', async () => {
          seedLocataire('p', 0);
          seedLoyerEchu('p');
          // Reçu 100 000 en avance, 40 000 affectés, puis annulé : l'affectation est supprimée, la pièce
          // « avance » contre-passée en entier, le couple PAYMENT / ADVANCE_APPLIED reste (net nul).
          seedMovement({
            id: 'p1',
            accountId: 'acc-p',
            movementDate: jan,
            type: 'ADVANCE_RECEIVED',
            credit: 100000,
            sourceType: 'RENTAL_PAYMENT',
            sourceId: 'pay-p'
          });
          seedMovement({
            id: 'p2',
            accountId: 'acc-p',
            movementDate: jan,
            type: 'PAYMENT',
            credit: 40000,
            sourceType: 'RENTAL_PAYMENT_ALLOCATION',
            sourceId: ALLOC_MORTE
          });
          seedMovement({
            id: 'p3',
            accountId: 'acc-p',
            movementDate: jan,
            type: 'ADVANCE_APPLIED',
            debit: 40000,
            sourceType: 'RENTAL_PAYMENT_ALLOCATION',
            sourceId: ALLOC_MORTE
          });
          seedMovement({
            id: 'p4',
            accountId: 'acc-p',
            movementDate: jan,
            type: 'VOID',
            debit: 100000,
            sourceType: 'RENTAL_PAYMENT',
            sourceId: 'pay-p'
          });

          const line = (await getClientsAgingBalance(TENANT_ID, { asOf: ASOF })).lines.find(
            l => l.accountId === 'acc-p'
          )!;
          expect(line.ledgerBalance).toBe(100000);
          expect(line.unallocatedAdvance).toBe(0);
          expect(line.gap).toBe(0);
        });

        it('règlement annulé puis réactivé : l’avance ré-inscrite (`:r1`) reste une avance', async () => {
          seedLocataire('q', 0);
          seedLoyerEchu('q');
          // Même historique que ci-dessus, puis réactivation : 100 000 ré-inscrits en avance, rien d'affecté.
          seedMovement({
            id: 'q1',
            accountId: 'acc-q',
            movementDate: jan,
            type: 'ADVANCE_RECEIVED',
            credit: 100000,
            sourceType: 'RENTAL_PAYMENT',
            sourceId: 'pay-q'
          });
          seedMovement({
            id: 'q2',
            accountId: 'acc-q',
            movementDate: jan,
            type: 'PAYMENT',
            credit: 100000,
            sourceType: 'RENTAL_PAYMENT_ALLOCATION',
            sourceId: ALLOC_MORTE
          });
          seedMovement({
            id: 'q3',
            accountId: 'acc-q',
            movementDate: jan,
            type: 'ADVANCE_APPLIED',
            debit: 100000,
            sourceType: 'RENTAL_PAYMENT_ALLOCATION',
            sourceId: ALLOC_MORTE
          });
          seedMovement({
            id: 'q4',
            accountId: 'acc-q',
            movementDate: jan,
            type: 'VOID',
            debit: 100000,
            sourceType: 'RENTAL_PAYMENT',
            sourceId: 'pay-q'
          });
          seedMovement({
            id: 'q5',
            accountId: 'acc-q',
            movementDate: jan,
            type: 'ADVANCE_RECEIVED',
            credit: 100000,
            sourceType: 'RENTAL_PAYMENT',
            sourceId: 'pay-q:r1'
          });

          const line = (await getClientsAgingBalance(TENANT_ID, { asOf: ASOF })).lines.find(
            l => l.accountId === 'acc-q'
          )!;
          expect(line.ledgerBalance).toBe(0);
          expect(line.unallocatedAdvance).toBe(100000);
          expect(line.gap).toBe(0);
        });

        it('une imputation dont l’affectation existe encore reste déduite de l’avance', async () => {
          seedLocataire('r', 0);
          seedLoyerEchu('r');
          seedMovement({
            id: 'r1',
            accountId: 'acc-r',
            movementDate: jan,
            type: 'ADVANCE_RECEIVED',
            credit: 150000,
            sourceType: 'RENTAL_PAYMENT',
            sourceId: 'pay-r'
          });
          seedMovement({
            id: 'r2',
            accountId: 'acc-r',
            movementDate: jan,
            type: 'PAYMENT',
            credit: 100000,
            sourceType: 'RENTAL_PAYMENT_ALLOCATION',
            sourceId: ALLOC_VIVANTE
          });
          seedMovement({
            id: 'r3',
            accountId: 'acc-r',
            movementDate: jan,
            type: 'ADVANCE_APPLIED',
            debit: 100000,
            sourceType: 'RENTAL_PAYMENT_ALLOCATION',
            sourceId: ALLOC_VIVANTE
          });
          store.allocations.push({
            id: ALLOC_VIVANTE,
            tenant_id: TENANT_ID,
            amount: 100000,
            payment: { succeeded_at: jan, initiated_at: jan, renter_client_id: 'client-r' },
            installment: { due_date: jan, lease_id: 'lease-r', lease: { primary_renter_client_id: 'client-r' } }
          });
          // Le loyer échu est entièrement soldé par l'affectation.
          store.installments.find((i: any) => i.id === 'r-i')!.status = 'PAID';

          const line = (await getClientsAgingBalance(TENANT_ID, { asOf: ASOF })).lines.find(
            l => l.accountId === 'acc-r'
          )!;
          expect(line.unallocatedAdvance).toBe(50000);
          expect(line.gap).toBe(0);
        });

        it('un règlement postérieur à la date de référence n’est pas remis dans l’écart', async () => {
          seedLocataire('u', 0);
          seedLoyerEchu('u');
          seedAffectationFuture('u', 60000, ALLOC_U);
          // Règlement daté après `asOf` : son crédit n'est pas au grand livre à cette date.
          seedMovement({
            id: 'u1',
            accountId: 'acc-u',
            movementDate: new Date(ASOF.getTime() + MS_PER_DAY),
            type: 'PAYMENT',
            credit: 60000,
            sourceType: 'RENTAL_PAYMENT_ALLOCATION',
            sourceId: ALLOC_U
          });

          const line = (await getClientsAgingBalance(TENANT_ID, { asOf: ASOF })).lines.find(
            l => l.accountId === 'acc-u'
          )!;
          expect(line.ledgerBalance).toBe(100000);
          expect(line.gap).toBe(0);
        });

        it('une affectation à une échéance à échoir sans crédit au compte n’est pas remise dans l’écart', async () => {
          seedLocataire('n', 0);
          seedLoyerEchu('n');
          // L'affectation existe, mais aucun mouvement `PAYMENT` ne l'a portée au compte : le grand livre
          // ne contient rien à compenser. Remettre son montant créerait un écart positif fantôme.
          seedAffectationFuture('n', 60000, ALLOC_N);

          const line = (await getClientsAgingBalance(TENANT_ID, { asOf: ASOF })).lines.find(
            l => l.accountId === 'acc-n'
          )!;
          expect(line.ledgerBalance).toBe(100000);
          expect(line.gap).toBe(0);
        });
      });
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

    describe('ordre total (date, écriture, identifiant)', () => {
      const SAME = new Date('2026-03-01T00:00:00.000Z');

      beforeEach(() => {
        seedAccount({ id: 'acc-t', tenantClientId: 'client-t', label: 'Ex æquo', balance: 0 });
        // Trois mouvements de même date ET de même écriture : seul l'identifiant les départage.
        // Insérés dans le désordre pour que l'ordre de la table ne triche pas.
        seedMovement({ id: 'm-c', accountId: 'acc-t', movementDate: SAME, type: 'INSTALLMENT', debit: 50 });
        seedMovement({ id: 'm-a', accountId: 'acc-t', movementDate: SAME, type: 'INSTALLMENT', debit: 100 });
        seedMovement({ id: 'm-b', accountId: 'acc-t', movementDate: SAME, type: 'PAYMENT', credit: 30 });
      });

      it('trie en dernier critère par identifiant, dans le relevé comme dans la page suivante', async () => {
        const { __mockPrisma } = jest.requireMock('@prisma/client') as { __mockPrisma: any };
        __mockPrisma.thirdPartyMovement.findMany.mockClear();

        const page1 = await getAccountStatement(TENANT_ID, 'acc-t', { skip: 0, take: 2 });
        const page2 = await getAccountStatement(TENANT_ID, 'acc-t', { skip: 2, take: 2 });

        expect(page1.movements.map(m => m.id)).toEqual(['m-a', 'm-b']);
        expect(page2.movements.map(m => m.id)).toEqual(['m-c']);
        for (const [args] of __mockPrisma.thirdPartyMovement.findMany.mock.calls) {
          expect(args.orderBy[args.orderBy.length - 1]).toEqual({ id: 'asc' });
        }
      });

      it('le solde de la page 2 repart du cumul des lignes qui la précèdent (agrégat, sans relire skip lignes)', async () => {
        const { __mockPrisma } = jest.requireMock('@prisma/client') as { __mockPrisma: any };
        const entier = await getAccountStatement(TENANT_ID, 'acc-t');
        __mockPrisma.thirdPartyMovement.findMany.mockClear();

        const page2 = await getAccountStatement(TENANT_ID, 'acc-t', { skip: 2, take: 2 });

        // 100 − 30 + 50 : même cumul que le relevé entier.
        expect(page2.movements.map(m => m.balanceAfter)).toEqual([120]);
        expect(page2.movements[0].balanceAfter).toBe(entier.movements[2].balanceAfter);
        // Une seule lecture de lignes (la page) : le solde d'ouverture de page est un agrégat.
        expect(__mockPrisma.thirdPartyMovement.findMany).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('getAccountStatement — relevé à la date du jour (BUG-2026-09-28-026)', () => {
    const AS_OF = new Date('2026-09-28T12:00:00.000Z');

    beforeEach(() => {
      seedAccount({ id: 'acc-d', tenantClientId: 'client-d', label: 'Aminata Traore', balance: 320000 });

      // Ordre d'insertion : l'échéance d'octobre (future) est écrite AVANT le
      // règlement, comme lors d'un « Recalculer les statuts » qui crée toutes
      // les échéances d'un coup. Les balanceAfter stockés suivent l'insertion.
      seedMovement({
        id: 'd1',
        accountId: 'acc-d',
        movementDate: new Date('2026-09-05T00:00:00.000Z'),
        createdAt: new Date('2026-09-01T10:00:00.000Z'),
        type: 'INSTALLMENT',
        debit: 160000,
        balanceAfter: 160000,
        label: 'Loyer de septembre 2026'
      });
      seedMovement({
        id: 'd2',
        accountId: 'acc-d',
        movementDate: new Date('2026-10-05T00:00:00.000Z'),
        createdAt: new Date('2026-09-02T10:00:00.000Z'),
        type: 'INSTALLMENT',
        debit: 160000,
        balanceAfter: 320000,
        label: "Loyer d'octobre 2026"
      });
      seedMovement({
        id: 'd3',
        accountId: 'acc-d',
        movementDate: new Date('2026-09-28T09:00:00.000Z'),
        createdAt: new Date('2026-09-28T09:00:00.000Z'),
        type: 'PAYMENT',
        credit: 150000,
        balanceAfter: 170000,
        label: 'Reglement'
      });
    });

    it("n'affiche que les mouvements échus et solde chronologiquement", async () => {
      const statement = await getAccountStatement(TENANT_ID, 'acc-d', { asOf: AS_OF });

      expect(statement.movements.map(m => m.id)).toEqual(['d1', 'd3']);
      expect(statement.movements.map(m => m.balanceAfter)).toEqual([160000, 10000]);
      expect(statement.openingBalance).toBe(0);
      expect(statement.closingBalance).toBe(10000);
      expect(statement.total).toBe(2);
    });

    it("l'ouverture d'une période est la somme chronologique des mouvements antérieurs", async () => {
      const statement = await getAccountStatement(TENANT_ID, 'acc-d', {
        asOf: AS_OF,
        range: { from: new Date('2026-09-20T00:00:00.000Z') }
      });

      expect(statement.movements.map(m => m.id)).toEqual(['d3']);
      expect(statement.openingBalance).toBe(160000);
      expect(statement.movements[0].balanceAfter).toBe(10000);
      expect(statement.closingBalance).toBe(10000);
    });

    it('la pagination garde les soldes cumulés', async () => {
      const statement = await getAccountStatement(TENANT_ID, 'acc-d', { asOf: AS_OF, skip: 1, take: 1 });

      expect(statement.movements.map(m => m.id)).toEqual(['d3']);
      expect(statement.movements[0].balanceAfter).toBe(10000);
      expect(statement.total).toBe(2);
      expect(statement.closingBalance).toBe(10000);
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

  // BUG-2026-09-29-005 : la balance et le relevé d'un même locataire doivent
  // dire la même chose (échu à ce jour).
  describe('règle commune balance / relevé (exigibilité)', () => {
    const ASOF = new Date('2026-09-29T12:00:00.000Z');

    it("par défaut (sans asOf), le relevé d'un locataire ne compte que l'échu, comme la balance", async () => {
      seedAccount({ id: 'acc-z', tenantClientId: 'client-z', label: 'Aminata Traoré', balance: 200000 });
      seedMovement({
        id: 'z1',
        accountId: 'acc-z',
        movementDate: new Date('2020-01-05T00:00:00.000Z'),
        type: 'INSTALLMENT',
        debit: 100000,
        label: 'Loyer échu'
      });
      seedMovement({
        id: 'z2',
        accountId: 'acc-z',
        movementDate: new Date('2999-01-05T00:00:00.000Z'),
        type: 'INSTALLMENT',
        debit: 100000,
        label: 'Loyer futur'
      });

      const statement = await getAccountStatement(TENANT_ID, 'acc-z');
      const balance = await getClientsBalance(TENANT_ID);
      const line = balance.lines.find(l => l.accountId === 'acc-z')!;

      expect(statement.movements.map(m => m.id)).toEqual(['z1']);
      expect(statement.closingBalance).toBe(100000);
      expect(line.balance).toBe(100000);
      expect(line.totalBilled).toBe(100000);
    });

    it("les imputations d'avance ne sont pas comptées comme des factures", async () => {
      seedAccount({ id: 'acc-v', tenantClientId: 'client-v', label: 'Aminata', balance: 0 });
      const d = (day: number) => new Date(`2026-08-${String(day).padStart(2, '0')}T00:00:00.000Z`);
      const move = (row: Record<string, any>) =>
        seedMovement({ accountId: 'acc-v', sourceType: 'RENTAL_PAYMENT', ...row });
      move({ id: 'v1', movementDate: d(1), type: 'INSTALLMENT', debit: 300000, sourceId: 'i1', label: 'Loyer' });
      move({ id: 'v2', movementDate: d(2), type: 'ADVANCE_RECEIVED', credit: 300000, sourceId: 'p1', label: 'Avance' });
      move({ id: 'v3', movementDate: d(3), type: 'ADVANCE_APPLIED', debit: 300000, sourceId: 'a1', label: 'Imputée' });
      move({ id: 'v4', movementDate: d(3), type: 'PAYMENT', credit: 300000, sourceId: 'a1', label: 'Règlement' });

      const balance = await getClientsBalance(TENANT_ID, { asOf: ASOF });
      const line = balance.lines.find(l => l.accountId === 'acc-v')!;

      expect(line.totalBilled).toBe(300000);
      expect(line.totalSettled).toBe(300000);
      expect(line.balance).toBe(0);
      expect(line.totalBilled - line.totalSettled).toBe(line.balance);
    });
  });
});
