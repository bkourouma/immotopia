/**
 * ImmoCopilot — atomicité de l'usage unique du jeton et de l'idempotence des
 * quittances, prouvée sur une base PostgreSQL réelle (des mocks ne prouvent pas
 * un verrou consultatif).
 *
 * Plusieurs « instances d'API » sont simulées par autant de copies isolées des
 * modules (`jest.isolateModules`) : chacune a sa propre table mémoire d'usage
 * unique, sa propre file d'attente locale et son propre pool de connexions,
 * comme deux processus. Seule la base les coordonne.
 *
 * Base : DÉDIÉE (`DATABASE_URL_TEST`), jamais celle de développement. Absente
 * ou différente de `DATABASE_URL` -> la suite est ignorée (`describe.skip`).
 * Lancement :
 *   DATABASE_URL_TEST=... TEST_DATABASE_URL=... npx prisma migrate deploy
 *   DATABASE_URL_TEST=... TEST_DATABASE_URL=... DATABASE_URL=... \
 *     npx jest --selectProjects api --runTestsByPath __tests__/integration/ai-concurrency.test.ts
 */
import { randomUUID } from 'crypto';
import { prisma } from '../../src/utils/database';
import { signProposal } from '../../src/lib/ai/proposal-token';
import type { GenerateRentalDocumentArgs, ProposalClaims } from '../../src/lib/ai/contracts';
import { cleanupTenants, createTenantAdminUser, createTestTenant, createPropertyDirect } from '../helpers/fixtures';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

if (!HAS_TEST_DATABASE) {
  // eslint-disable-next-line no-console
  console.log('DATABASE_URL_TEST absente (ou différente de DATABASE_URL) : ai-concurrency.test.ts est ignorée.');
}

// Permissions et audit : sans objet ici. Le vrai générateur (modèle DOCX, disque)
// est remplacé par un double qui, comme lui, met du temps puis COMMITE une
// quittance FINAL liée au paiement, via sa propre connexion.
jest.mock('../../src/services/permission-service', () => ({ hasPermission: async () => true }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: () => undefined }));
jest.mock('../../src/services/document-generation-service', () => ({
  generateDocument: async (
    tenantId: string,
    _docType: string,
    paymentId: string,
    _t: unknown,
    params: any,
    userId: string
  ) => {
    const { prisma: instancePrisma } = require('../../src/utils/database');
    await new Promise(resolve => setTimeout(resolve, 150));
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
  redeemProposal: (claims: ProposalClaims) => Promise<void>;
  executeRentalDocument: (input: { token: string; userId: string; tenantId: string }) => Promise<{
    payload: { alreadyExisted: boolean; document: { id: string } };
  }>;
  disconnect: () => Promise<void>;
}

/** Une « instance d'API » : copie isolée des modules, pool de connexions propre. */
function newInstance(): Instance {
  let instance!: Instance;
  // `utils/database` réutilise `globalThis.prisma` hors production : sans cette
  // remise à zéro, toutes les « instances » partageraient le pool du client de
  // ce fichier de test au lieu d'avoir chacune le leur.
  const globals = globalThis as { prisma?: unknown };
  const sharedClient = globals.prisma;
  delete globals.prisma;
  try {
    jest.isolateModules(() => {
      const token = require('../../src/lib/ai/proposal-token');
      const execute = require('../../src/lib/ai/actions/execute-rental-document');
      const database = require('../../src/utils/database');
      instance = {
        redeemProposal: token.redeemProposal,
        executeRentalDocument: execute.executeRentalDocument,
        disconnect: () => database.prisma.$disconnect()
      };
    });
  } finally {
    globals.prisma = sharedClient;
  }
  return instance;
}

const INSTANCES = 6;

maybeDescribe('ImmoCopilot — concurrence sur base réelle', () => {
  jest.setTimeout(120_000);

  let tenantId: string;
  let userId: string;
  let leaseId: string;
  let installmentId: string;
  let paymentId: string;
  let instances: Instance[];
  const tenantIds: string[] = [];

  beforeAll(async () => {
    const tenant = await createTestTenant('Agence-IA');
    tenantId = tenant.id;
    tenantIds.push(tenantId);
    userId = (await createTenantAdminUser(tenant, 'ia')).id;
    const propertyId = await createPropertyDirect(tenantId, 'Bien IA');
    const client = await prisma.tenantClient.create({ data: { userId, tenantId, clientType: 'RENTER' } });
    const lease = await prisma.rentalLease.create({
      data: {
        tenant_id: tenantId,
        property_id: propertyId,
        primary_renter_client_id: client.id,
        lease_number: `L-${randomUUID().slice(0, 6)}`,
        status: 'ACTIVE',
        start_date: new Date('2026-01-01'),
        rent_amount: 100000,
        created_by_user_id: userId
      }
    });
    leaseId = lease.id;
    const installment = await prisma.rentalInstallment.create({
      data: {
        tenant_id: tenantId,
        lease_id: leaseId,
        period_year: 2026,
        period_month: 3,
        due_date: new Date('2026-03-05'),
        status: 'PAID',
        amount_rent: 100000
      }
    });
    installmentId = installment.id;
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
    paymentId = payment.id;
    await prisma.rentalPaymentAllocation.create({
      data: { tenant_id: tenantId, payment_id: paymentId, installment_id: installmentId, amount: 100000 }
    });
    instances = Array.from({ length: INSTANCES }, newInstance);
  });

  afterAll(async () => {
    await Promise.all((instances ?? []).map(instance => instance.disconnect()));
    // Les lignes de location ne sont pas supprimées en cascade avec l'agence.
    await prisma.rentalDocument.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await prisma.rentalPaymentAllocation.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await prisma.rentalPayment.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await prisma.rentalInstallment.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await prisma.rentalLease.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await cleanupTenants(tenantIds);
    await prisma.$disconnect();
  });

  const receipt = (): GenerateRentalDocumentArgs => ({
    docType: 'RENT_RECEIPT',
    leaseId,
    paymentId,
    installmentId
  });

  it('redeemProposal : N instances, un même jeton -> un seul succès, les autres PROPOSAL_ALREADY_USED', async () => {
    const { claims } = signProposal({ userId, tenantId, args: receipt() });

    const results = await Promise.allSettled(instances.map(instance => instance.redeemProposal(claims)));

    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(INSTANCES - 1);
    for (const failure of rejected) {
      expect(failure.reason).toMatchObject({ code: 'PROPOSAL_ALREADY_USED', statusCode: 409 });
    }
    const rows = await prisma.auditLog.count({
      where: { tenantId, actionKey: 'AI_PROPOSAL_REDEEMED', entityId: claims.jti }
    });
    expect(rows).toBe(1);
  });

  it('redeemProposal : un redémarrage (table mémoire vide) ne rouvre pas un jeton déjà réclamé', async () => {
    const { claims } = signProposal({ userId, tenantId, args: receipt() });
    await newInstance().redeemProposal(claims);
    const restarted = newInstance();
    await expect(restarted.redeemProposal(claims)).rejects.toMatchObject({ code: 'PROPOSAL_ALREADY_USED' });
    await restarted.disconnect();
  });

  it('executeRentalDocument : N jetons distincts, même paiement, en parallèle -> un seul document', async () => {
    const tokens = instances.map(() => signProposal({ userId, tenantId, args: receipt() }).token);

    const results = await Promise.allSettled(
      instances.map((instance, index) => instance.executeRentalDocument({ token: tokens[index], userId, tenantId }))
    );

    const failures = results.filter(r => r.status === 'rejected');
    expect(failures).toEqual([]);
    const outcomes = results.map(
      r => (r as PromiseFulfilledResult<Awaited<ReturnType<Instance['executeRentalDocument']>>>).value.payload
    );
    expect(outcomes.filter(o => !o.alreadyExisted)).toHaveLength(1);
    expect(outcomes.filter(o => o.alreadyExisted)).toHaveLength(INSTANCES - 1);

    const documents = await prisma.rentalDocument.count({
      where: { tenant_id: tenantId, type: 'RENT_RECEIPT', status: 'FINAL', payment_id: paymentId }
    });
    expect(documents).toBe(1);
    expect(new Set(outcomes.map(o => o.document.id)).size).toBe(1);
  });
});
