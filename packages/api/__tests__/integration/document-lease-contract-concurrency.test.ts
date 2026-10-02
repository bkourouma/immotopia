/**
 * Contrats de bail : plusieurs générations SIMULTANÉES sur un même bail ne
 * donnent ni P2002 ni doublon (X, X-A2, X-A3…), et les numéros de quittance
 * (compteur) restent uniques. Prouvé sur une base PostgreSQL réelle : des
 * mocks ne prouvent ni un verrou consultatif ni un incrément atomique.
 *
 * Plusieurs « instances d'API » sont simulées par autant de copies isolées des
 * modules (`jest.isolateModules`) : chacune a sa file d'attente locale et son
 * pool de connexions. Seule la base les coordonne. Le modèle DOCX, le rendu et
 * l'écriture disque sont remplacés (ils ne concernent pas la numérotation) ;
 * la génération de numéro, le verrou et l'écriture de la ligne sont les vrais.
 *
 * Base : DÉDIÉE (`DATABASE_URL_TEST`), jamais celle de développement. Absente
 * ou différente de `DATABASE_URL` -> la suite est ignorée (`describe.skip`).
 */
import { randomUUID } from 'crypto';
import { prisma } from '../../src/utils/database';
import { cleanupTenants, createTenantAdminUser, createTestTenant, createPropertyDirect } from '../helpers/fixtures';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

if (!HAS_TEST_DATABASE) {
  // eslint-disable-next-line no-console
  console.log(
    'DATABASE_URL_TEST absente (ou différente de DATABASE_URL) : document-lease-contract-concurrency.test.ts est ignorée.'
  );
}

let templateRow: unknown;
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: () => undefined }));
jest.mock('../../src/services/document-template-service', () => ({
  resolveTemplate: async () => templateRow
}));
jest.mock('../../src/services/document-context-builder', () => ({
  buildDocumentContext: async () => ({ RECU_NUMERO: 'PROVISOIRE' }),
  validateContext: () => ({ missing: [], warnings: [] })
}));
// Le rendu met du temps (il précède le verrou) : les générations se chevauchent vraiment.
jest.mock('../../src/services/docx-renderer', () => ({
  renderDocx: async (_template: unknown, context: Record<string, string>) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    return Buffer.from(JSON.stringify(context));
  },
  calculateHash: () => 'hash',
  saveGeneratedDocument: async (_t: string, _d: string, number: string) => `/tmp/${number}.docx`
}));

interface Instance {
  generate: (docType: string, sourceKey: string, params?: Record<string, string>) => Promise<any>;
  disconnect: () => Promise<void>;
}

let tenantId: string;
let userId: string;

/** Une « instance d'API » : copie isolée des modules, pool de connexions propre. */
function newInstance(): Instance {
  let instance!: Instance;
  jest.isolateModules(() => {
    const service = require('../../src/services/document-generation-service');
    const database = require('../../src/utils/database');
    instance = {
      generate: (docType, sourceKey, params) =>
        service.generateDocument(tenantId, docType, sourceKey, undefined, params, userId),
      disconnect: () => database.prisma.$disconnect()
    };
  });
  return instance;
}

maybeDescribe('Documents de bail — concurrence sur base réelle', () => {
  jest.setTimeout(120_000);

  const tenantIds: string[] = [];
  const leaseNumber = `BAIL-T-${randomUUID().slice(0, 6)}`;
  let leaseId: string;
  let instances: Instance[];

  beforeAll(async () => {
    const tenant = await createTestTenant('Agence-Baux');
    tenantId = tenant.id;
    tenantIds.push(tenantId);
    userId = (await createTenantAdminUser(tenant, 'baux')).id;
    const propertyId = await createPropertyDirect(tenantId, 'Bien Baux');
    const client = await prisma.tenantClient.create({ data: { userId, tenantId, clientType: 'RENTER' } });
    const lease = await prisma.rentalLease.create({
      data: {
        tenant_id: tenantId,
        property_id: propertyId,
        primary_renter_client_id: client.id,
        lease_number: leaseNumber,
        status: 'ACTIVE',
        start_date: new Date('2026-01-01'),
        rent_amount: 100000,
        created_by_user_id: userId
      }
    });
    leaseId = lease.id;
    templateRow = await prisma.documentTemplate.create({
      data: {
        tenant_id: tenantId,
        doc_type: 'LEASE_HABITATION',
        name: 'Modèle de test',
        status: 'ACTIVE',
        original_filename: 'x.docx',
        stored_filename: 'x.docx',
        storage_path: '/tmp/x.docx',
        file_size: 1,
        mime_type: 'application/octet-stream',
        file_hash_sha256: 'h',
        created_by_user_id: userId
      }
    });
    instances = Array.from({ length: 3 }, newInstance);
  });

  afterAll(async () => {
    await Promise.all((instances ?? []).map(instance => instance.disconnect()));
    await prisma.rentalDocument.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await prisma.rentalPayment.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await prisma.documentCounter.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await prisma.rentalLease.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await prisma.documentTemplate.deleteMany({ where: { tenant_id: { in: tenantIds } } });
    await cleanupTenants(tenantIds);
    await prisma.$disconnect();
  });

  it('8 contrats simultanés sur un bail, sur 3 instances : aucun P2002, numéros X puis X-A2… X-A8 tous distincts', async () => {
    const calls = 8;
    const results = await Promise.allSettled(
      Array.from({ length: calls }, (_, i) =>
        instances[i % instances.length].generate(i % 2 === 0 ? 'LEASE_HABITATION' : 'LEASE_COMMERCIAL', leaseId)
      )
    );

    const failures = results.filter(r => r.status === 'rejected');
    expect(failures).toEqual([]);

    const rows = await prisma.rentalDocument.findMany({
      where: { tenant_id: tenantId, lease_id: leaseId },
      select: { document_number: true }
    });
    const numbers = rows.map(r => r.document_number).sort();
    const expected = [leaseNumber, ...Array.from({ length: calls - 1 }, (_, i) => `${leaseNumber}-A${i + 2}`)].sort();
    expect(numbers).toEqual(expected);
  });

  it('un contrat de plus après coup : le suffixe suivant, puis « Régénérer » ne change pas les numéros', async () => {
    const doc = await instances[0].generate('LEASE_HABITATION', leaseId);
    expect(doc.document_number).toBe(`${leaseNumber}-A9`);

    let regenerate!: (id: string) => Promise<any>;
    jest.isolateModules(() => {
      const service = require('../../src/services/document-generation-service');
      regenerate = (id: string) => service.regenerateDocument(tenantId, id, undefined, userId);
    });
    const before = await prisma.rentalDocument.findMany({
      where: { tenant_id: tenantId, lease_id: leaseId },
      select: { id: true, document_number: true }
    });
    const first = before.find(r => r.document_number === leaseNumber)!;
    const second = before.find(r => r.document_number === `${leaseNumber}-A2`)!;
    expect((await regenerate(first.id)).document_number).toBe(leaseNumber);
    expect((await regenerate(second.id)).document_number).toBe(`${leaseNumber}-A2`);
  });

  it("compteur de l'agence : 12 quittances simultanées, numéros RCU-… tous distincts, sans P2002", async () => {
    const receiptTemplate = await prisma.documentTemplate.create({
      data: {
        tenant_id: tenantId,
        doc_type: 'RENT_RECEIPT',
        name: 'Modèle quittance',
        status: 'ACTIVE',
        original_filename: 'r.docx',
        stored_filename: 'r.docx',
        storage_path: '/tmp/r.docx',
        file_size: 1,
        mime_type: 'application/octet-stream',
        file_hash_sha256: 'h',
        created_by_user_id: userId
      }
    });
    templateRow = receiptTemplate;

    const payments = await Promise.all(
      Array.from({ length: 12 }, () =>
        prisma.rentalPayment.create({
          data: {
            tenant_id: tenantId,
            lease_id: leaseId,
            method: 'CASH',
            status: 'SUCCESS',
            amount: 100000,
            idempotency_key: randomUUID(),
            succeeded_at: new Date('2026-03-05')
          }
        })
      )
    );

    const results = await Promise.allSettled(
      payments.map((payment, i) => instances[i % instances.length].generate('RENT_RECEIPT', payment.id))
    );
    expect(results.filter(r => r.status === 'rejected')).toEqual([]);

    const rows = await prisma.rentalDocument.findMany({
      where: { tenant_id: tenantId, type: 'RENT_RECEIPT' },
      select: { document_number: true }
    });
    const numbers = rows.map(r => r.document_number);
    expect(numbers).toHaveLength(12);
    expect(new Set(numbers).size).toBe(12);
    for (const number of numbers) expect(number).toMatch(/^RCU-\d{6}-\d{4}$/);
  });
});
