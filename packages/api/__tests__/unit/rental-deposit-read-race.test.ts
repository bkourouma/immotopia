/**
 * BUG-2026-11-03-020 : `GET /rental/leases/:leaseId/deposit` répondait 409
 * « Cette ressource existe déjà. » sur un bail fraîchement créé.
 *
 * Le dépôt de garantie naît à la première lecture (aucune autre route ne le crée
 * à la création du bail). La lecture faisait « chercher puis créer » : deux
 * lectures simultanées (double montage de l'onglet sous React.StrictMode, deux
 * onglets, un rafraîchissement) trouvaient toutes deux le dépôt absent, et la
 * seconde création butait sur l'unicité `lease_id` (Prisma P2002), que le
 * middleware d'erreurs traduit en 409. Un GET ne doit jamais répondre 409 : en
 * cas de course, on relit le dépôt que l'autre lecture vient de créer.
 */
import { Prisma } from '@prisma/client';

type Row = Record<string, any>;

const LEASE_ID = '22222222-2222-4222-8222-222222222222';
const TENANT_ID = 'tenant-a';

const store = { deposit: null as Row | null, creations: 0, seq: 0 };
const tick = () => new Promise(resolve => setImmediate(resolve));

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`lease_id`)', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['lease_id'] }
  });
}

function withRelations(row: Row): Row {
  return { ...row, lease: { id: LEASE_ID, lease_number: 'BAIL-2026-0070' }, movements: [] };
}

const mockPrisma: Row = {
  rentalLease: {
    findFirst: jest.fn(async ({ where }: Row) =>
      where.id === LEASE_ID && where.tenant_id === TENANT_ID
        ? { id: LEASE_ID, tenant_id: TENANT_ID, currency: 'FCFA', security_deposit_amount: leaseDepositAmount }
        : null
    )
  },
  rentalSecurityDeposit: {
    findUnique: jest.fn(async () => {
      await tick(); // fenêtre d'entrelacement : les deux lectures voient « absent »
      return store.deposit ? withRelations(store.deposit) : null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      await tick();
      if (createFailure) throw createFailure;
      // Contrainte unique sur lease_id : la seconde insertion échoue.
      if (store.deposit && store.deposit.lease_id === data.lease_id) throw uniqueViolation();
      store.creations += 1;
      const created: Row = {
        id: `dep-${++store.seq}`,
        collected_amount: 0,
        held_amount: 0,
        refunded_amount: 0,
        forfeited_amount: 0,
        ...data
      };
      store.deposit = created;
      return withRelations(created);
    })
  }
};

let leaseDepositAmount: number = 300000;
let createFailure: Error | null = null;

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => (mockPrisma as any)[prop] })
}));
const mockLogAuditEvent = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...a: any[]) => mockLogAuditEvent(...a),
  recordAuditEvent: jest.fn()
}));
jest.mock('../../src/lib/finance/rental-direct-ledger', () => ({
  syncDirectDepositMovementEntryTx: jest.fn(async () => 'none'),
  syncDirectRentPaymentEntryTx: jest.fn(async () => 'none')
}));
jest.mock('../../src/services/rental-installment-service', () => ({
  annulerPieceTx: jest.fn(async () => null),
  compteLocataireTx: jest.fn(async () => 'acc-locataire'),
  compteLocataireDuBailTx: jest.fn(async () => ({ accountId: 'acc-locataire' }))
}));

import { getDepositHandler } from '../../src/controllers/rental-deposit-controller';

async function lire() {
  const req: any = {
    params: { leaseId: LEASE_ID },
    body: {},
    query: {},
    headers: {},
    tenantContext: { tenantId: TENANT_ID },
    user: { userId: 'u1' }
  };
  const res: any = { statusCode: 200, body: undefined };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: any) => ((res.body = b), res);
  const next = jest.fn();
  await (getDepositHandler as any)(req, res, next);
  return { res, error: next.mock.calls[0]?.[0] };
}

beforeEach(() => {
  jest.clearAllMocks();
  store.deposit = null;
  store.creations = 0;
  store.seq = 0;
  leaseDepositAmount = 300000;
  createFailure = null;
});

describe('GET dépôt de garantie : lecture idempotente (BUG-2026-11-03-020)', () => {
  it('deux lectures simultanées sur un bail neuf répondent toutes deux 200, sans 409', async () => {
    const [premiere, seconde] = await Promise.all([lire(), lire()]);

    expect(premiere.error).toBeUndefined();
    expect(seconde.error).toBeUndefined();
    expect(premiere.res.statusCode).toBe(200);
    expect(seconde.res.statusCode).toBe(200);
    expect(premiere.res.body.success).toBe(true);
    expect(seconde.res.body.success).toBe(true);
  });

  it('les deux lectures renvoient le même dépôt (une seule ligne créée, solde 0)', async () => {
    const [premiere, seconde] = await Promise.all([lire(), lire()]);

    expect(store.creations).toBe(1);
    expect(premiere.res.body.data.id).toBe(seconde.res.body.data.id);
    expect(premiere.res.body.data.target_amount).toBe(300000);
    expect(premiere.res.body.data.current_balance).toBe(0);
    expect(seconde.res.body.data.current_balance).toBe(0);
  });

  it("n'écrit qu'un seul événement d'audit de création (celui qui a réellement créé)", async () => {
    await Promise.all([lire(), lire(), lire()]);

    expect(store.creations).toBe(1);
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'RENTAL_DEPOSIT_CREATED', entityId: 'dep-1' })
    );
  });

  it('une lecture après coup relit le dépôt existant sans rien recréer', async () => {
    await lire();
    mockPrisma.rentalSecurityDeposit.create.mockClear();

    const { res, error } = await lire();

    expect(error).toBeUndefined();
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.rentalSecurityDeposit.create).not.toHaveBeenCalled();
  });

  it("si la contrainte d'unicité saute mais que le dépôt reste introuvable, l'erreur remonte telle quelle", async () => {
    createFailure = uniqueViolation();

    const { error } = await lire();

    expect(error).toBe(createFailure);
  });

  it("une autre erreur d'écriture n'est pas avalée", async () => {
    createFailure = new Error('connexion perdue');

    const { error } = await lire();

    expect(error).toBe(createFailure);
  });

  it('un bail sans dépôt de garantie ne crée rien et reste un 404 de lecture', async () => {
    leaseDepositAmount = 0;

    const { error } = await lire();

    expect(mockPrisma.rentalSecurityDeposit.create).not.toHaveBeenCalled();
    expect(error?.statusCode).toBe(404);
  });
});
