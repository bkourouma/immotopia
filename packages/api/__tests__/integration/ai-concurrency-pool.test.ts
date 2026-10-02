/**
 * ImmoCopilot — saturation RÉELLE du pool de connexions, et jeton consommé
 * après un échec d'exécution, sur PostgreSQL.
 *
 * Une « instance d'API » à pool minuscule (`connection_limit` et `pool_timeout`
 * dans l'URL) reçoit plus de requêtes concurrentes que son pool ne peut en
 * servir. On vérifie : aucune ne reste bloquée, chacune finit par un succès ou
 * par un refus PROPRE (jamais de détail Prisma dans le message), et le pool est
 * libéré ensuite.
 *
 * Comportement constaté et figé ici (voir docs/architecture/ai-limiteurs.md) :
 * un pool saturé n'est PAS traduit en 429/503 dédié. L'erreur Prisma
 * (P2024/P2028) est convertie par `executeRentalDocument` en
 * `BadRequestError('La génération du document a échoué.')` (400), ou, si elle
 * survient pendant la réclamation du jeton, remonte au gestionnaire global qui
 * la masque en 500 générique. Le jeton reste consommé dès qu'il a été réclamé
 * (fail-closed).
 *
 * Base : DÉDIÉE (`DATABASE_URL_TEST`), absente ou différente de `DATABASE_URL`
 * -> suite ignorée. Lancement : voir ai-concurrency.test.ts.
 */
import { randomUUID } from 'crypto';
import { prisma } from '../../src/utils/database';
import { signProposal } from '../../src/lib/ai/proposal-token';
import type { GenerateRentalDocumentArgs } from '../../src/lib/ai/contracts';
import { cleanupTenants, createTenantAdminUser, createTestTenant, createPropertyDirect } from '../helpers/fixtures';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

if (!HAS_TEST_DATABASE) {
  // eslint-disable-next-line no-console
  console.log('DATABASE_URL_TEST absente (ou différente de DATABASE_URL) : ai-concurrency-pool.test.ts est ignorée.');
}

// Le générateur réel (modèle DOCX, disque) est remplacé par un double qui met du
// temps, puis COMMITE une quittance FINAL par SA PROPRE connexion du pool de
// l'instance, comme le vrai. Les deux variables `mock*` sont lues à l'appel :
// les copies isolées du module les partagent.
let mockGenerationDelayMs = 300;
let mockGenerationFails = false;
jest.mock('../../src/services/permission-service', () => ({ hasPermission: async () => true }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: () => undefined }));
jest.mock('../../src/services/document-generation-service', () => ({
  generateDocument: async (
    tenantId: string,
    _docType: string,
    paymentId: string,
    _t: unknown,
    params: { installmentId: string },
    userId: string
  ) => {
    const { prisma: instancePrisma } = require('../../src/utils/database');
    await new Promise(resolve => setTimeout(resolve, mockGenerationDelayMs));
    if (mockGenerationFails) throw new Error('modèle DOCX corrompu (détail interne)');
    return instancePrisma.rentalDocument.create({
      data: {
        tenant_id: tenantId,
        type: 'RENT_RECEIPT',
        status: 'FINAL',
        payment_id: paymentId,
        installment_id: params.installmentId,
        document_number: `RCU-${Math.random().toString(36).slice(2, 10)}`,
        created_by_user_id: userId
      }
    });
  }
}));

interface Instance {
  executeRentalDocument: (input: { token: string; userId: string; tenantId: string }) => Promise<{
    payload: { alreadyExisted: boolean; document: { id: string } };
  }>;
  /** Client Prisma de cette instance (pool propre). */
  prisma: typeof prisma;
  disconnect: () => Promise<void>;
}

/** Instance isolée dont le pool est réglé par `connection_limit` et `pool_timeout`. */
function newInstance(poolQuery: string): Instance {
  const baseUrl = process.env.DATABASE_URL as string;
  const separator = baseUrl.includes('?') ? '&' : '?';
  process.env.DATABASE_URL = `${baseUrl}${separator}${poolQuery}`;
  let instance!: Instance;
  // `utils/database` réutilise `globalThis.prisma` hors production : sans cette
  // remise à zéro, l'« instance » partagerait le pool du client de ce fichier
  // de test et `connection_limit` n'aurait aucun effet.
  const globals = globalThis as { prisma?: unknown };
  const sharedClient = globals.prisma;
  delete globals.prisma;
  try {
    jest.isolateModules(() => {
      const execute = require('../../src/lib/ai/actions/execute-rental-document');
      const database = require('../../src/utils/database');
      instance = {
        executeRentalDocument: execute.executeRentalDocument,
        prisma: database.prisma,
        disconnect: () => database.prisma.$disconnect()
      };
    });
  } finally {
    process.env.DATABASE_URL = baseUrl;
    globals.prisma = sharedClient;
  }
  return instance;
}

/** Attend `promise` au plus `ms` ; renvoie 'HANG' au-delà. Le minuteur est libéré (Jest doit pouvoir sortir). */
async function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T | 'HANG'> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<'HANG'>(resolve => {
        timer = setTimeout(() => resolve('HANG'), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface Purchase {
  paymentId: string;
  installmentId: string;
}

/** Verdict d'un appel : succès, refus propre, ou fuite de détail interne. */
function classify(result: PromiseSettledResult<unknown>): 'ok' | 'clean-refusal' | 'leak' {
  if (result.status === 'fulfilled') return 'ok';
  const reason = result.reason as { name?: string; statusCode?: number; message?: string; code?: string };
  // Refus propre : erreur d'application typée au message générique, ou erreur
  // Prisma de pool (P2024/P2028) que le gestionnaire global masque en 500.
  if (typeof reason?.statusCode === 'number') {
    return /prisma|invocation|P20\d\d|SELECT/i.test(reason.message ?? '') ? 'leak' : 'clean-refusal';
  }
  return /^PrismaClient/.test(reason?.name ?? '') && ['P2024', 'P2028'].includes(reason?.code ?? '')
    ? 'clean-refusal'
    : 'leak';
}

maybeDescribe('ImmoCopilot — saturation du pool sur base réelle', () => {
  jest.setTimeout(180_000);

  const PAYMENTS = 10;
  let tenantId: string;
  let userId: string;
  let leaseId: string;
  let purchases: Purchase[];
  let cursor = 0;
  const tenantIds: string[] = [];

  /** Un paiement encore sans quittance, jamais réutilisé d'un test à l'autre. */
  const nextPurchase = (): Purchase => {
    const purchase = purchases[cursor++];
    if (!purchase) throw new Error('fixtures épuisées');
    return purchase;
  };
  const token = (purchase: Purchase) =>
    signProposal({
      userId,
      tenantId,
      args: { docType: 'RENT_RECEIPT', leaseId, ...purchase } as GenerateRentalDocumentArgs
    }).token;

  beforeAll(async () => {
    const tenant = await createTestTenant('Agence-Pool');
    tenantId = tenant.id;
    tenantIds.push(tenantId);
    userId = (await createTenantAdminUser(tenant, 'pool')).id;
    const propertyId = await createPropertyDirect(tenantId, 'Bien Pool');
    const client = await prisma.tenantClient.create({ data: { userId, tenantId, clientType: 'RENTER' } });
    const lease = await prisma.rentalLease.create({
      data: {
        tenant_id: tenantId,
        property_id: propertyId,
        primary_renter_client_id: client.id,
        lease_number: `L-${randomUUID().slice(0, 6)}`,
        status: 'ACTIVE',
        start_date: new Date('2025-01-01'),
        rent_amount: 100000,
        created_by_user_id: userId
      }
    });
    leaseId = lease.id;
    purchases = [];
    for (let i = 0; i < 2 * PAYMENTS; i++) {
      const installment = await prisma.rentalInstallment.create({
        data: {
          tenant_id: tenantId,
          lease_id: leaseId,
          period_year: 2025 + Math.floor(i / 12),
          period_month: (i % 12) + 1,
          due_date: new Date('2026-03-05'),
          status: 'PAID',
          amount_rent: 100000
        }
      });
      const payment = await prisma.rentalPayment.create({
        data: {
          tenant_id: tenantId,
          lease_id: leaseId,
          method: 'CASH',
          status: 'SUCCESS',
          amount: 100000,
          idempotency_key: randomUUID(),
          succeeded_at: new Date('2026-03-05')
        }
      });
      await prisma.rentalPaymentAllocation.create({
        data: { tenant_id: tenantId, payment_id: payment.id, installment_id: installment.id, amount: 100000 }
      });
      purchases.push({ paymentId: payment.id, installmentId: installment.id });
    }
  });

  afterAll(async () => {
    await prisma.rentalDocument.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await prisma.rentalPaymentAllocation.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await prisma.rentalPayment.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await prisma.rentalInstallment.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await prisma.rentalLease.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await cleanupTenants(tenantIds);
    await prisma.$disconnect();
  });

  afterEach(() => {
    mockGenerationDelayMs = 300;
    mockGenerationFails = false;
  });

  it('pool bloqué de l’extérieur : chaque requête est refusée vite, aucune ne reste suspendue, le pool est libéré ensuite', async () => {
    const instance = newInstance('connection_limit=2&pool_timeout=2');
    try {
      // Deux transactions longues occupent les 2 seules connexions de l'instance.
      const hogs = [0, 1].map(() =>
        instance.prisma.$transaction(async tx => tx.$queryRaw`SELECT pg_sleep(6)::text`, {
          timeout: 20_000,
          maxWait: 5_000
        })
      );
      await new Promise(resolve => setTimeout(resolve, 500));

      const startedAt = Date.now();
      const batch = Array.from({ length: 6 }, nextPurchase);
      const results = await withDeadline(
        Promise.allSettled(batch.map(p => instance.executeRentalDocument({ token: token(p), userId, tenantId }))),
        30_000
      );
      const elapsed = Date.now() - startedAt;

      expect(results).not.toBe('HANG');
      const verdicts = (results as PromiseSettledResult<unknown>[]).map(classify);
      expect(verdicts).not.toContain('leak');
      // Le pool est verrouillé : aucune ne réussit, toutes échouent après pool_timeout (2 s), pas après les 6 s de blocage.
      expect(verdicts.every(v => v === 'clean-refusal')).toBe(true);
      expect(elapsed).toBeLessThan(6_000);

      // Pool libéré : une fois les transactions longues finies, une requête normale aboutit.
      await Promise.all(hogs);
      const ok = await instance.executeRentalDocument({ token: token(nextPurchase()), userId, tenantId });
      expect(ok.payload.alreadyExisted).toBe(false);
    } finally {
      await instance.disconnect();
    }
  });

  it('saturation naturelle : plus de quittances distinctes en parallèle que le pool ne peut en servir', async () => {
    mockGenerationDelayMs = 700;
    // Pool sous-dimensionné à dessein : 2 connexions seulement, que les 2 transactions
    // « gardiennes » des sections exclusives suffisent à occuper. Les connexions de
    // travail (redeem, generateDocument) attendent alors `pool_timeout`.
    const instance = newInstance('connection_limit=2&pool_timeout=2');
    try {
      const startedAt = Date.now();
      const batch = Array.from({ length: PAYMENTS }, nextPurchase);
      const results = await withDeadline(
        Promise.allSettled(batch.map(p => instance.executeRentalDocument({ token: token(p), userId, tenantId }))),
        60_000
      );
      const elapsed = Date.now() - startedAt;

      expect(results).not.toBe('HANG');
      const settled = results as PromiseSettledResult<unknown>[];
      expect(settled).toHaveLength(PAYMENTS);
      const verdicts = settled.map(classify);
      expect(verdicts).not.toContain('leak');
      expect(elapsed).toBeLessThan(55_000);
      // La saturation est réelle (sinon ce test ne prouverait rien) : au moins un refus propre.
      expect(verdicts).toContain('clean-refusal');
      // eslint-disable-next-line no-console
      console.log(
        'saturation naturelle, refus :',
        JSON.stringify(
          settled
            .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
            .map(r => ({
              name: r.reason?.name,
              code: r.reason?.code,
              status: r.reason?.statusCode,
              message: String(r.reason?.message).slice(0, 80)
            }))
        )
      );

      // Pool libéré : plus aucune connexion « idle in transaction » ne traîne.
      const stuck = await prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT count(*)::bigint AS n FROM pg_stat_activity
        WHERE datname = current_database() AND state = 'idle in transaction'`;
      expect(Number(stuck[0].n)).toBe(0);

      // Et l'instance sert de nouveau une requête normale.
      mockGenerationDelayMs = 50;
      const ok = await instance.executeRentalDocument({ token: token(nextPurchase()), userId, tenantId });
      expect(ok.payload.document.id).toBeTruthy();
      // eslint-disable-next-line no-console
      console.log(
        `saturation naturelle : ${verdicts.filter(v => v === 'ok').length}/${PAYMENTS} réussies, ${elapsed} ms`
      );
    } finally {
      await instance.disconnect();
    }
  });

  describe('jeton consommé après un échec d’exécution (fail-closed, choix voulu)', () => {
    it('une génération qui échoue consomme le jeton : le même jeton rejoué est refusé (409), sans détail interne', async () => {
      const instance = newInstance('connection_limit=5');
      try {
        const purchase = nextPurchase();
        const replayable = token(purchase);
        mockGenerationFails = true;
        const first = await instance.executeRentalDocument({ token: replayable, userId, tenantId }).catch(e => e);
        expect(first).toMatchObject({ statusCode: 400, message: 'La génération du document a échoué.' });
        expect(String(first.message)).not.toContain('DOCX');

        // Le générateur est revenu : le MÊME jeton ne rouvre rien.
        mockGenerationFails = false;
        await expect(instance.executeRentalDocument({ token: replayable, userId, tenantId })).rejects.toMatchObject({
          code: 'PROPOSAL_ALREADY_USED',
          statusCode: 409
        });
        expect(
          await prisma.rentalDocument.count({ where: { tenant_id: tenantId, payment_id: purchase.paymentId } })
        ).toBe(0);

        // Nouvelle proposition pour le même paiement : elle aboutit.
        const retried = await instance.executeRentalDocument({ token: token(purchase), userId, tenantId });
        expect(retried.payload.alreadyExisted).toBe(false);
      } finally {
        await instance.disconnect();
      }
    });
  });
});
