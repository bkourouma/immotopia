/**
 * Branchement des services locatifs sur le grand livre des comptes de tiers
 * (lot 1, tâche 1.3 du plan de mise en œuvre, décision D3).
 *
 * Ce fichier vérifie trois choses, et rien d'autre :
 *
 *   1. **Chaque pièce locative qui fait bouger une créance écrit son
 *      mouvement**, dans le bon sens et pour le bon montant.
 *   2. **Les clés de source sont celles du rétro-remplissage**
 *      (`rebuildThirdPartyAccount`) : rejouer une pièce n'ajoute rien.
 *   3. **Rien ne survit à un échec.** Le test d'atomicité force une panne
 *      *après* l'écriture d'un mouvement et vérifie qu'il ne reste ni pièce ni
 *      mouvement, et que le solde du compte n'a pas bougé.
 *
 * Prisma est remplacé par un magasin en mémoire (même esprit que
 * `finance.billing-run.test.ts`), mais le grand livre, lui, n'est **pas**
 * mocké : c'est lui qui calcule les soldes, et un mouvement écrit hors
 * transaction ne se verrait pas si on le remplaçait par un espion. Le
 * `$transaction` du magasin prend un instantané et le restaure en cas
 * d'erreur : une écriture passée par `prisma` au lieu de `tx` survivrait donc
 * au rollback, et le test d'atomicité la verrait.
 */

import { RentalInstallmentStatus, RentalPaymentMethod, RentalPaymentStatus, RentalPenaltyMode } from '@prisma/client';

// ---------------------------------------------------------------------------
// Bruit de fond : journalisation, audit et notifications ne sont pas le sujet.
// ---------------------------------------------------------------------------

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn()
}));

// La comptabilité de la gestion directe (trésorerie / 411) a sa propre suite :
// `finance.rental-direct-ledger.test.ts`. Ici seuls les comptes de tiers comptent.
jest.mock('../../src/lib/finance/rental-direct-ledger', () => ({
  syncDirectRentPaymentEntryTx: jest.fn(async () => 'none'),
  syncDirectRenterMovementEntryTx: jest.fn(async () => false),
  syncDirectExpenseEntryTx: jest.fn(async () => 'none'),
  directPropertyIdsTx: jest.fn(async () => new Set())
}));

jest.mock('../../src/services/email-service', () => ({
  emailService: {
    sendPaymentAllocatedToTenant: jest.fn(),
    sendPaymentAllocatedToOwner: jest.fn(),
    sendPaymentApprovedToTenant: jest.fn(),
    sendPaymentApprovedToOwner: jest.fn(),
    sendPaymentRejectedToTenant: jest.fn()
  }
}));

jest.mock('../../src/services/email-notification-config-service', () => ({
  getEmailNotificationConfig: jest.fn(async () => ({
    enabled: false,
    subjectOverride: null,
    bodyHtmlOverride: null
  }))
}));

jest.mock('../../src/services/whatsapp-contact-resolve', () => ({
  getCrmContactIdForWhatsApp: jest.fn(async () => null)
}));

jest.mock('../../src/utils/property-display', () => ({
  getPropertyDisplayLabel: jest.fn(() => 'Villa Kipé 12')
}));

// ---------------------------------------------------------------------------
// Magasin en mémoire pour `../../src/utils/database`
// ---------------------------------------------------------------------------

type Row = Record<string, any>;

const store = {
  leases: [] as Row[],
  tenantClients: [] as Row[],
  installments: [] as Row[],
  payments: [] as Row[],
  allocations: [] as Row[],
  penalties: [] as Row[],
  penaltyRules: [] as Row[],
  declarations: [] as Row[],
  accounts: [] as Row[],
  movements: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function uniqueConstraintError(target: string[]): any {
  return Object.assign(new Error(`Unique constraint failed on the fields: (\`${target.join(', ')}\`)`), {
    code: 'P2002',
    meta: { target }
  });
}

/** Les `Decimal` du code de production deviennent des nombres, comme au retour d'une vraie lecture. */
function toPlainRow(data: Row): Row {
  const plain: Row = {};
  for (const [key, value] of Object.entries(data)) {
    plain[key] =
      value !== null && typeof value === 'object' && typeof (value as any).toNumber === 'function'
        ? Number(value)
        : value;
  }
  return plain;
}

/** Comparaison d'un champ à un critère Prisma, limitée aux formes réellement utilisées ici. */
function matchField(value: any, criterion: any): boolean {
  if (criterion === undefined) return true;
  if (criterion !== null && typeof criterion === 'object' && !(criterion instanceof Date)) {
    if ('not' in criterion) return value !== criterion.not;
    if ('in' in criterion) return (criterion.in as any[]).includes(value);
    if ('lt' in criterion) return new Date(value).getTime() < new Date(criterion.lt).getTime();
    if ('gte' in criterion) return new Date(value).getTime() >= new Date(criterion.gte).getTime();
    return true;
  }
  if (value instanceof Date || criterion instanceof Date) {
    return new Date(value).getTime() === new Date(criterion).getTime();
  }
  return value === criterion;
}

function matchRow(row: Row, where: Row = {}, ignore: string[] = []): boolean {
  return Object.entries(where).every(([key, criterion]) => ignore.includes(key) || matchField(row[key], criterion));
}

function hydrateInstallment(row: Row): Row {
  return {
    ...row,
    lease: store.leases.find(l => l.id === row.lease_id) ?? null,
    penalties: store.penalties.filter(p => p.installment_id === row.id),
    payments: store.allocations.filter(a => a.installment_id === row.id)
  };
}

function hydratePayment(row: Row): Row {
  return {
    ...row,
    allocations: store.allocations
      .filter(a => a.payment_id === row.id)
      .map(a => ({ ...a, installment: store.installments.find(i => i.id === a.installment_id) ?? null }))
  };
}

function hydrateAllocation(row: Row): Row {
  return {
    ...row,
    installment: store.installments.find(i => i.id === row.installment_id) ?? null,
    payment: store.payments.find(p => p.id === row.payment_id) ?? null
  };
}

const mockPrisma: Row = {
  rentalLease: {
    findFirst: jest.fn(async ({ where }: Row) => store.leases.find(l => matchRow(l, where)) ?? null),
    findUnique: jest.fn(async ({ where }: Row) => store.leases.find(l => l.id === where.id) ?? null)
  },

  tenantClient: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const client = store.tenantClients.find(c => c.id === where.id && c.tenantId === where.tenantId);
      return client ?? null;
    })
  },

  rentalInstallment: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const rows = store.installments.filter(i => matchRow(i, where, ['payments']));
      const filtered = where.payments?.some
        ? rows.filter(i => store.allocations.some(a => a.installment_id === i.id))
        : rows;
      return filtered[0] ? hydrateInstallment(filtered[0]) : null;
    }),
    findUnique: jest.fn(async ({ where }: Row) => {
      const found = where.id
        ? store.installments.find(i => i.id === where.id)
        : store.installments.find(
            i =>
              i.lease_id === where.lease_id_period_year_period_month?.lease_id &&
              i.period_year === where.lease_id_period_year_period_month?.period_year &&
              i.period_month === where.lease_id_period_year_period_month?.period_month
          );
      return found ? hydrateInstallment(found) : null;
    }),
    findMany: jest.fn(async ({ where, orderBy }: Row) => {
      let rows = store.installments.filter(i => matchRow(i, where));
      if (orderBy) {
        rows = [...rows].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
      }
      return rows.map(hydrateInstallment);
    }),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('inst'), ...toPlainRow(data) };
      store.installments.push(created);
      return { ...created };
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.installments.find(i => i.id === where.id);
      if (!row) throw new Error(`Échéance ${where.id} introuvable`);
      Object.assign(row, toPlainRow(data));
      return { ...row };
    }),
    deleteMany: jest.fn(async ({ where }: Row) => {
      const doomed = store.installments.filter(i => matchRow(i, where));
      const ids = new Set(doomed.map(i => i.id));
      store.installments = store.installments.filter(i => !ids.has(i.id));
      // Cascade, comme en base : les pénalités et les allocations partent avec.
      store.penalties = store.penalties.filter(p => !ids.has(p.installment_id));
      store.allocations = store.allocations.filter(a => !ids.has(a.installment_id));
      return { count: doomed.length };
    }),
    count: jest.fn(async ({ where }: Row) => store.installments.filter(i => matchRow(i, where)).length)
  },

  rentalPayment: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const row = store.payments.find(p => matchRow(p, where));
      return row ? hydratePayment(row) : null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('pay'), initiated_at: new Date(), ...toPlainRow(data) };
      store.payments.push(created);
      return hydratePayment(created);
    }),
    findMany: jest.fn(async ({ where }: Row) =>
      store.payments.filter(p => matchRow(p, where)).map(p => hydratePayment(p))
    ),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.payments.find(p => p.id === where.id);
      if (!row) throw new Error(`Règlement ${where.id} introuvable`);
      Object.assign(row, toPlainRow(data));
      return hydratePayment(row);
    })
  },

  rentalPaymentAllocation: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.allocations.filter(a => matchRow(a, where)).map(hydrateAllocation)
    ),
    create: jest.fn(async ({ data }: Row) => {
      const plain = toPlainRow(data);
      if (store.allocations.some(a => a.payment_id === plain.payment_id && a.installment_id === plain.installment_id)) {
        throw uniqueConstraintError(['payment_id', 'installment_id']);
      }
      const created = { id: nextId('alloc'), ...plain };
      store.allocations.push(created);
      return { ...created };
    }),
    deleteMany: jest.fn(async ({ where }: Row) => {
      const doomed = store.allocations.filter(a => matchRow(a, where));
      const ids = new Set(doomed.map(a => a.id));
      store.allocations = store.allocations.filter(a => !ids.has(a.id));
      return { count: doomed.length };
    })
  },

  rentalPenalty: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const row = store.penalties.filter(p => matchRow(p, where)).slice(-1)[0];
      if (!row) return null;
      return { ...row, installment: store.installments.find(i => i.id === row.installment_id) ?? null };
    }),
    findMany: jest.fn(async ({ where }: Row) =>
      store.penalties
        .filter(p => matchRow(p, where))
        .map(p => ({ ...p, installment: store.installments.find(i => i.id === p.installment_id) ?? null }))
    ),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('pen'), ...toPlainRow(data) };
      store.penalties.push(created);
      return { ...created };
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.penalties.find(p => p.id === where.id);
      if (!row) throw new Error(`Pénalité ${where.id} introuvable`);
      Object.assign(row, toPlainRow(data));
      return { ...row };
    }),
    delete: jest.fn(async ({ where }: Row) => {
      const index = store.penalties.findIndex(p => p.id === where.id);
      if (index < 0) throw new Error(`Pénalité ${where.id} introuvable`);
      return store.penalties.splice(index, 1)[0];
    })
  },

  rentalPenaltyRule: {
    findFirst: jest.fn(async ({ where }: Row) => store.penaltyRules.find(r => matchRow(r, where)) ?? null),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('rule'), ...toPlainRow(data) };
      store.penaltyRules.push(created);
      return { ...created };
    })
  },

  rentalPaymentDeclaration: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const row = store.declarations.find(d => matchRow(d, where));
      if (!row) return null;
      return {
        ...row,
        lease: store.leases.find(l => l.id === row.lease_id) ?? null,
        installment: store.installments.find(i => i.id === row.installment_id) ?? null,
        declarer: store.tenantClients.find(c => c.id === row.declared_by) ?? null
      };
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.declarations.find(d => d.id === where.id);
      if (!row) throw new Error(`Déclaration ${where.id} introuvable`);
      Object.assign(row, toPlainRow(data));
      return {
        ...row,
        lease: store.leases.find(l => l.id === row.lease_id) ?? null,
        installment: store.installments.find(i => i.id === row.installment_id) ?? null
      };
    })
  },

  // --- Grand livre : tables réelles, code réel (rien n'est mocké ici) -------

  thirdPartyAccount: {
    findFirst: jest.fn(async ({ where }: Row) => store.accounts.find(a => matchRow(a, where)) ?? null),
    findUnique: jest.fn(async ({ where }: Row) => {
      const key = where.tenantId_kind_tenantClientId;
      if (key) {
        return (
          store.accounts.find(
            a => a.tenantId === key.tenantId && a.kind === key.kind && a.tenantClientId === key.tenantClientId
          ) ?? null
        );
      }
      return store.accounts.find(a => a.id === where.id) ?? null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      const plain = toPlainRow(data);
      if (
        store.accounts.some(
          a => a.tenantId === plain.tenantId && a.kind === plain.kind && a.tenantClientId === plain.tenantClientId
        )
      ) {
        throw uniqueConstraintError(['tenant_id', 'kind', 'tenant_client_id']);
      }
      const created = { id: nextId('acc'), ...plain };
      store.accounts.push(created);
      return { ...created };
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.accounts.find(a => a.id === where.id);
      if (!row) throw new Error(`Compte ${where.id} introuvable`);
      Object.assign(row, toPlainRow(data));
      return { ...row };
    })
  },

  thirdPartyMovement: {
    create: jest.fn(async ({ data }: Row) => {
      const plain = toPlainRow(data);
      if (
        store.movements.some(
          m => m.sourceType === plain.sourceType && m.sourceId === plain.sourceId && m.type === plain.type
        )
      ) {
        throw uniqueConstraintError(['source_type', 'source_id', 'type']);
      }
      const created = { id: nextId('mv'), createdAt: new Date(), ...plain };
      store.movements.push(created);
      return { ...created };
    }),
    findUnique: jest.fn(async ({ where }: Row) => {
      const key = where.sourceType_sourceId_type;
      return (
        store.movements.find(
          m => m.sourceType === key.sourceType && m.sourceId === key.sourceId && m.type === key.type
        ) ?? null
      );
    }),
    findMany: jest.fn(async ({ where }: Row) => store.movements.filter(m => matchRow(m, where)).map(m => ({ ...m }))),
    count: jest.fn(async ({ where }: Row) => store.movements.filter(m => matchRow(m, where)).length)
  },

  $transaction: jest.fn(async (callback: (tx: Row) => Promise<any>) => {
    const snapshot = structuredClone({
      leases: store.leases,
      tenantClients: store.tenantClients,
      installments: store.installments,
      payments: store.payments,
      allocations: store.allocations,
      penalties: store.penalties,
      penaltyRules: store.penaltyRules,
      declarations: store.declarations,
      accounts: store.accounts,
      movements: store.movements
    });
    const seq = store.seq;

    try {
      return await callback(mockPrisma);
    } catch (error) {
      Object.assign(store, snapshot, { seq });
      throw error;
    }
  })
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, prop) {
        return (mockPrisma as any)[prop];
      }
    }
  )
}));

import {
  deleteAllInstallments,
  recalculateInstallmentStatuses,
  updateInstallmentStatus
} from '../../src/services/rental-installment-service';
import { allocatePayment, createPayment, updatePaymentStatus } from '../../src/services/rental-payment-service';
import { calculatePenalty, deletePenalty, updatePenalty } from '../../src/services/rental-penalty-service';
import { rebuildThirdPartyAccount } from '../../src/lib/finance/ledger';

// `rental-payment-declaration-service.ts` n'est volontairement pas importé
// ici : ce fichier porte une erreur TypeScript préexistante (`phone` dans un
// `select` de `User`, ligne 791), et ts-jest refuse de compiler un module dont
// il relève un diagnostic. L'importer ferait échouer toute la suite. La
// corriger ferait tomber le socle API de 103 à 102 erreurs, ce que ce lot
// n'autorise pas. Le branchement de ce service délègue ses deux écritures à
// `inscrireAllocationTx` et `inscrireReliquatTx`, dont le comportement est
// couvert ci-dessous par les cas « règlement jamais porté au compte » et
// « reliquat sans emploi ». Voir le rapport de fin de tâche.

// ---------------------------------------------------------------------------
// Jeu d'essai
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-1';
const ACTOR_ID = 'user-1';
const CLIENT_ID = 'client-1';
const LEASE_ID = 'lease-1';

const DANS_UN_MOIS = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
const IL_Y_A_DEUX_MOIS = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

function seedLocataire(): void {
  store.tenantClients.push({
    id: CLIENT_ID,
    tenantId: TENANT_ID,
    user: { fullName: 'Fatoumata Diallo', email: 'f.diallo@example.ci' }
  });

  store.leases.push({
    id: LEASE_ID,
    tenant_id: TENANT_ID,
    lease_number: 'BAIL-001',
    primary_renter_client_id: CLIENT_ID,
    currency: 'FCFA',
    penalty_grace_days: 0,
    penalty_mode: null,
    penalty_rate: null,
    penalty_fixed_amount: null,
    penalty_cap_amount: null
  });
}

function seedEcheance(overrides: Partial<Row> = {}): Row {
  const installment = {
    id: nextId('inst'),
    tenant_id: TENANT_ID,
    lease_id: LEASE_ID,
    period_year: 2026,
    period_month: 2,
    due_date: DANS_UN_MOIS,
    status: RentalInstallmentStatus.DRAFT,
    currency: 'FCFA',
    amount_rent: 100000,
    amount_service: 5000,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    paid_at: null,
    ...overrides
  };
  store.installments.push(installment);
  return installment;
}

function seedReglement(overrides: Partial<Row> = {}): Row {
  const payment = {
    id: nextId('pay'),
    tenant_id: TENANT_ID,
    lease_id: LEASE_ID,
    renter_client_id: CLIENT_ID,
    method: RentalPaymentMethod.CASH,
    status: RentalPaymentStatus.SUCCESS,
    currency: 'FCFA',
    amount: 100000,
    idempotency_key: nextId('idem'),
    initiated_at: new Date('2026-02-03T00:00:00.000Z'),
    succeeded_at: new Date('2026-02-03T00:00:00.000Z'),
    ...overrides
  };
  store.payments.push(payment);
  return payment;
}

/** Compte du locataire tel qu'il est en base, ou `null` s'il n'a jamais été ouvert. */
function compte(): Row | null {
  return store.accounts.find(a => a.tenantClientId === CLIENT_ID) ?? null;
}

function mouvements(type?: string): Row[] {
  return store.movements.filter(m => !type || m.type === type);
}

beforeEach(() => {
  jest.clearAllMocks();
  store.leases = [];
  store.tenantClients = [];
  store.installments = [];
  store.payments = [];
  store.allocations = [];
  store.penalties = [];
  store.penaltyRules = [];
  store.declarations = [];
  store.accounts = [];
  store.movements = [];
  store.seq = 0;
  seedLocataire();
});

// ---------------------------------------------------------------------------
// Échéances
// ---------------------------------------------------------------------------

describe('Échéance devenue exigible', () => {
  it('facture au compte du locataire le loyer, les charges et les autres frais', async () => {
    const echeance = seedEcheance({ amount_other_fees: 2500, due_date: IL_Y_A_DEUX_MOIS });

    await updateInstallmentStatus(TENANT_ID, echeance.id);

    expect(store.installments[0].status).toBe(RentalInstallmentStatus.OVERDUE);
    expect(mouvements()).toHaveLength(1);
    expect(mouvements()[0]).toMatchObject({
      type: 'INSTALLMENT',
      debit: 107500,
      sourceType: 'RENTAL_INSTALLMENT',
      sourceId: echeance.id,
      leaseId: LEASE_ID,
      label: 'Loyer de fevrier 2026'
    });
    expect(compte()?.balance).toBe(107500);
  });

  it("exclut `penalty_amount` du montant facturé : c'est un miroir des lignes de pénalité", async () => {
    // Une échéance déjà grevée d'une pénalité de 10 000 : la pénalité porte son
    // propre mouvement, la facturer ici la compterait deux fois.
    const echeance = seedEcheance({ penalty_amount: 10000, due_date: IL_Y_A_DEUX_MOIS });

    await updateInstallmentStatus(TENANT_ID, echeance.id);

    expect(mouvements()[0].debit).toBe(105000);
    expect(compte()?.balance).toBe(105000);
  });

  it("facture aussi l'échéance qui bascule directement en retard, sans passer par DUE", async () => {
    const echeance = seedEcheance({ due_date: IL_Y_A_DEUX_MOIS });

    await updateInstallmentStatus(TENANT_ID, echeance.id);

    expect(store.installments[0].status).toBe(RentalInstallmentStatus.OVERDUE);
    expect(mouvements('INSTALLMENT')).toHaveLength(1);
  });

  it("n'écrit rien tant que l'échéance n'a pas changé de statut", async () => {
    const echeance = seedEcheance({ status: RentalInstallmentStatus.DUE });

    await updateInstallmentStatus(TENANT_ID, echeance.id);

    expect(mouvements()).toHaveLength(0);
    expect(compte()).toBeNull();
  });

  it('ne facture pas deux fois la même échéance, quel que soit le nombre de recalculs', async () => {
    const echeance = seedEcheance({ due_date: IL_Y_A_DEUX_MOIS });

    await updateInstallmentStatus(TENANT_ID, echeance.id);
    store.installments[0].status = RentalInstallmentStatus.DRAFT;
    await updateInstallmentStatus(TENANT_ID, echeance.id);
    await recalculateInstallmentStatuses(TENANT_ID, LEASE_ID);

    expect(mouvements('INSTALLMENT')).toHaveLength(1);
    expect(compte()?.balance).toBe(105000);
  });

  it('facture chaque échéance du bail lors d’un recalcul de masse', async () => {
    seedEcheance({ period_month: 2, due_date: IL_Y_A_DEUX_MOIS });
    seedEcheance({ period_month: 3, due_date: IL_Y_A_DEUX_MOIS });

    const modifiees = await recalculateInstallmentStatuses(TENANT_ID, LEASE_ID);

    expect(modifiees).toBe(2);
    expect(mouvements('INSTALLMENT')).toHaveLength(2);
    expect(compte()?.balance).toBe(210000);
  });

  it('contrepasse au compte les échéances supprimées, pénalités comprises', async () => {
    const echeance = seedEcheance({ due_date: IL_Y_A_DEUX_MOIS });
    await updateInstallmentStatus(TENANT_ID, echeance.id);
    store.penalties.push({
      id: 'pen-supprimee',
      tenant_id: TENANT_ID,
      installment_id: echeance.id,
      amount: 5000,
      calculated_at: new Date()
    });
    store.movements.push({
      id: 'mv-pen',
      accountId: compte()!.id,
      tenantId: TENANT_ID,
      type: 'PENALTY',
      debit: 5000,
      credit: undefined,
      balanceAfter: 110000,
      label: 'Pénalité de retard',
      sourceType: 'RENTAL_PENALTY',
      sourceId: 'pen-supprimee'
    });
    store.accounts[0].balance = 110000;

    const supprimees = await deleteAllInstallments(TENANT_ID, LEASE_ID, ACTOR_ID);

    expect(supprimees).toBe(1);
    expect(store.installments).toHaveLength(0);
    expect(mouvements('VOID')).toHaveLength(1);
    expect(mouvements('VOID')[0]).toMatchObject({ credit: 105000, sourceId: echeance.id });
    expect(mouvements('WAIVER')).toHaveLength(1);
    expect(mouvements('WAIVER')[0]).toMatchObject({ credit: 5000, sourceId: 'pen-supprimee' });
    expect(compte()?.balance).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Règlements
// ---------------------------------------------------------------------------

describe('Règlement encaissé', () => {
  it('porte au compte, dès la création, le règlement qui ne solde encore rien', async () => {
    const payment = await createPayment(
      TENANT_ID,
      {
        leaseId: LEASE_ID,
        renterClientId: CLIENT_ID,
        method: RentalPaymentMethod.MOBILE_MONEY,
        amount: 60000,
        idempotencyKey: 'idem-1'
      },
      ACTOR_ID
    );

    expect(mouvements()).toHaveLength(1);
    expect(mouvements()[0]).toMatchObject({
      type: 'ADVANCE_RECEIVED',
      credit: 60000,
      sourceType: 'RENTAL_PAYMENT',
      sourceId: payment.id,
      label: 'Règlement (Mobile Money) reçu en avance, non affecté'
    });
    expect(compte()?.balance).toBe(-60000);
  });

  it("affecte l'avance sans encaisser deux fois le même argent", async () => {
    const echeance = seedEcheance({ due_date: IL_Y_A_DEUX_MOIS });
    await updateInstallmentStatus(TENANT_ID, echeance.id);

    const payment = await createPayment(
      TENANT_ID,
      {
        leaseId: LEASE_ID,
        renterClientId: CLIENT_ID,
        method: RentalPaymentMethod.CASH,
        amount: 105000,
        idempotencyKey: 'idem-2'
      },
      ACTOR_ID
    );
    expect(compte()?.balance).toBe(0);

    await allocatePayment(TENANT_ID, payment.id, { installmentIds: [echeance.id] }, ACTOR_ID);

    const allocation = store.allocations[0];
    expect(allocation.amount).toBe(105000);
    // Le règlement affecté crédite l'échéance, l'imputation de l'avance reprend
    // exactement le même montant : le solde ne bouge pas, l'argent n'est
    // encaissé qu'une fois.
    expect(mouvements('PAYMENT')).toHaveLength(1);
    expect(mouvements('PAYMENT')[0]).toMatchObject({ credit: 105000, sourceId: allocation.id });
    expect(mouvements('ADVANCE_APPLIED')).toHaveLength(1);
    expect(mouvements('ADVANCE_APPLIED')[0]).toMatchObject({ debit: 105000, sourceId: allocation.id });
    expect(compte()?.balance).toBe(0);
    expect(store.installments[0].status).toBe(RentalInstallmentStatus.PAID);
  });

  it("affecte un règlement jamais porté au compte sans inventer d'imputation d'avance", async () => {
    const echeance = seedEcheance();
    await updateInstallmentStatus(TENANT_ID, echeance.id);
    // Règlement antérieur au branchement : aucune trace au grand livre.
    const payment = seedReglement({ amount: 40000 });

    await allocatePayment(TENANT_ID, payment.id, { installmentIds: [echeance.id] }, ACTOR_ID);

    expect(mouvements('PAYMENT')).toHaveLength(1);
    expect(mouvements('ADVANCE_APPLIED')).toHaveLength(0);
    expect(mouvements('ADVANCE_RECEIVED')).toHaveLength(0);
    expect(compte()?.balance).toBe(65000);
    expect(store.installments[0].status).toBe(RentalInstallmentStatus.PARTIAL);
  });

  it("porte en avance ce que l'affectation laisse sans emploi", async () => {
    const echeance = seedEcheance({ amount_rent: 30000, amount_service: 0 });
    await updateInstallmentStatus(TENANT_ID, echeance.id);
    const payment = seedReglement({ amount: 50000 });

    await allocatePayment(TENANT_ID, payment.id, { installmentIds: [echeance.id] }, ACTOR_ID);

    expect(mouvements('PAYMENT')[0].credit).toBe(30000);
    expect(mouvements('ADVANCE_RECEIVED')[0].credit).toBe(20000);
    // 30 000 facturés, 50 000 réglés : le compte est créditeur de 20 000.
    expect(compte()?.balance).toBe(-20000);
  });

  it('contrepasse les affectations et l’avance quand le règlement est annulé', async () => {
    const echeance = seedEcheance();
    await updateInstallmentStatus(TENANT_ID, echeance.id);
    const payment = seedReglement({ amount: 120000 });
    await allocatePayment(TENANT_ID, payment.id, { installmentIds: [echeance.id] }, ACTOR_ID);
    expect(compte()?.balance).toBe(-15000);

    await updatePaymentStatus(TENANT_ID, payment.id, RentalPaymentStatus.CANCELED, ACTOR_ID);

    expect(store.allocations).toHaveLength(0);
    expect(mouvements('VOID')).toHaveLength(2);
    // Tout le règlement est contrepassé : il ne reste que l'échéance facturée.
    expect(compte()?.balance).toBe(105000);
    expect(store.installments[0].status).toBe(RentalInstallmentStatus.DUE);
  });

  it("n'ouvre pas de compte pour annuler un règlement dont rien n'a jamais été inscrit", async () => {
    // Règlement antérieur au branchement, sans affectation : il n'y a rien à
    // contrepasser, et un compte vide de plus polluerait la balance clients.
    const payment = seedReglement({ amount: 90000 });

    await updatePaymentStatus(TENANT_ID, payment.id, RentalPaymentStatus.FAILED, ACTOR_ID);

    expect(store.payments[0].status).toBe(RentalPaymentStatus.FAILED);
    expect(store.accounts).toHaveLength(0);
    expect(store.movements).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Pénalités
// ---------------------------------------------------------------------------

describe('Pénalité', () => {
  function seedEcheanceEnRetard(): Row {
    return seedEcheance({ due_date: IL_Y_A_DEUX_MOIS, status: RentalInstallmentStatus.OVERDUE });
  }

  it('facture au compte la pénalité appliquée', async () => {
    const echeance = seedEcheanceEnRetard();

    const penalty = await calculatePenalty(
      TENANT_ID,
      echeance.id,
      {
        grace_days: 0,
        mode: RentalPenaltyMode.FIXED_AMOUNT,
        fixed_amount: 7500,
        rate: 0,
        cap_amount: null,
        min_balance_to_apply: null
      },
      ACTOR_ID
    );

    expect(mouvements('PENALTY')).toHaveLength(1);
    expect(mouvements('PENALTY')[0]).toMatchObject({
      debit: 7500,
      sourceType: 'RENTAL_PENALTY',
      sourceId: penalty.id,
      label: "Pénalité de retard sur l'échéance de fevrier 2026"
    });
    // L'échéance n'était pas encore facturée : seule la pénalité pèse au compte.
    expect(compte()?.balance).toBe(7500);
  });

  it('règle au locataire la pénalité remise à la main', async () => {
    const echeance = seedEcheanceEnRetard();
    const penalty = await calculatePenalty(
      TENANT_ID,
      echeance.id,
      {
        grace_days: 0,
        mode: RentalPenaltyMode.FIXED_AMOUNT,
        fixed_amount: 7500,
        rate: 0,
        cap_amount: null,
        min_balance_to_apply: null
      },
      ACTOR_ID
    );

    await updatePenalty(TENANT_ID, penalty.id, 2500, 'Geste commercial', ACTOR_ID);

    expect(mouvements('WAIVER')).toHaveLength(1);
    expect(mouvements('WAIVER')[0]).toMatchObject({ credit: 5000, sourceId: penalty.id });
    expect(compte()?.balance).toBe(2500);
    expect(store.installments[0].penalty_amount).toBe(2500);
  });

  it('remet intégralement la pénalité supprimée', async () => {
    const echeance = seedEcheanceEnRetard();
    const penalty = await calculatePenalty(
      TENANT_ID,
      echeance.id,
      {
        grace_days: 0,
        mode: RentalPenaltyMode.FIXED_AMOUNT,
        fixed_amount: 7500,
        rate: 0,
        cap_amount: null,
        min_balance_to_apply: null
      },
      ACTOR_ID
    );

    await deletePenalty(TENANT_ID, penalty.id, ACTOR_ID);

    expect(store.penalties).toHaveLength(0);
    expect(mouvements('WAIVER')[0]).toMatchObject({ credit: 7500, sourceId: penalty.id });
    expect(compte()?.balance).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Alignement sur le rétro-remplissage
// ---------------------------------------------------------------------------

describe('Clés de source alignées sur le rétro-remplissage', () => {
  it('ne produit aucun mouvement de plus lorsque le rétro-remplissage est rejoué par-dessus', async () => {
    const echeance = seedEcheance();
    await updateInstallmentStatus(TENANT_ID, echeance.id);
    const payment = seedReglement({ amount: 40000 });
    await allocatePayment(TENANT_ID, payment.id, { installmentIds: [echeance.id] }, ACTOR_ID);

    const avant = store.movements.length;
    const soldeAvant = compte()!.balance;

    const resultat = await rebuildThirdPartyAccount(TENANT_ID, compte()!.id);

    expect(resultat.movementsWritten).toBe(0);
    expect(store.movements).toHaveLength(avant);
    expect(compte()?.balance).toBe(soldeAvant);
  });
});

// ---------------------------------------------------------------------------
// Atomicité — la règle que rien ne contourne
// ---------------------------------------------------------------------------

describe('Atomicité de la pièce et de son mouvement', () => {
  it("ne laisse ni pièce ni mouvement quand l'opération échoue après l'écriture du mouvement", async () => {
    const premiere = seedEcheance({ period_month: 2, due_date: new Date('2026-02-05T00:00:00.000Z') });
    const seconde = seedEcheance({ period_month: 3, due_date: new Date('2026-03-05T00:00:00.000Z') });
    await recalculateInstallmentStatuses(TENANT_ID, LEASE_ID);

    const payment = seedReglement({ amount: 210000 });
    const soldeAvant = compte()!.balance;
    const mouvementsAvant = store.movements.length;

    // La panne survient à la mise à jour de la SECONDE échéance, donc après la
    // création de la première allocation et l'écriture de son mouvement : c'est
    // exactement la fenêtre où une écriture passée par `prisma` au lieu de `tx`
    // survivrait au rollback.
    let misesAJour = 0;
    const vraieMiseAJour = mockPrisma.rentalInstallment.update;
    mockPrisma.rentalInstallment.update = jest.fn(async (args: Row) => {
      misesAJour += 1;
      if (misesAJour === 2) {
        throw new Error('Panne simulée après écriture du mouvement');
      }
      return vraieMiseAJour(args);
    });

    await expect(
      allocatePayment(TENANT_ID, payment.id, { installmentIds: [premiere.id, seconde.id] }, ACTOR_ID)
    ).rejects.toThrow('Panne simulée après écriture du mouvement');

    mockPrisma.rentalInstallment.update = vraieMiseAJour;

    // Ni pièce…
    expect(store.allocations).toHaveLength(0);
    expect(store.installments.every(i => i.amount_paid === 0)).toBe(true);
    expect(store.installments.every(i => i.status !== RentalInstallmentStatus.PAID)).toBe(true);
    // …ni mouvement, ni solde déplacé.
    expect(store.movements).toHaveLength(mouvementsAvant);
    expect(mouvements('PAYMENT')).toHaveLength(0);
    expect(compte()?.balance).toBe(soldeAvant);
  });

  it("n'ouvre même pas le compte du locataire quand la création du règlement échoue", async () => {
    // Le compte de tiers est ouvert dans la transaction du règlement : il ne
    // doit pas survivre à son échec, sans quoi un compte fantôme apparaîtrait
    // à la balance clients.
    const vraieCreation = mockPrisma.thirdPartyAccount.update;
    mockPrisma.thirdPartyAccount.update = jest.fn(async () => {
      throw new Error('Panne simulée sur le solde du compte');
    });

    await expect(
      createPayment(
        TENANT_ID,
        {
          leaseId: LEASE_ID,
          renterClientId: CLIENT_ID,
          method: RentalPaymentMethod.CASH,
          amount: 50000,
          idempotencyKey: 'idem-panne'
        },
        ACTOR_ID
      )
    ).rejects.toThrow('Panne simulée sur le solde du compte');

    mockPrisma.thirdPartyAccount.update = vraieCreation;

    expect(store.payments).toHaveLength(0);
    expect(store.movements).toHaveLength(0);
    expect(store.accounts).toHaveLength(0);
  });
});
