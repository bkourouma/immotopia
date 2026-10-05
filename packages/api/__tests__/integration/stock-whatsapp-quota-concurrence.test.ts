/**
 * Quota de l'inventaire par WhatsApp : deux photos SIMULTANÉES à 499 sur un
 * plafond de 500 n'en laissent passer qu'une (lot 041, spec W11 critère 3,
 * W11-R3). Prouvé sur une base PostgreSQL réelle : un mock ne prouve pas
 * qu'une mise à jour conditionnelle `used = used + 1 WHERE used < limit` tient
 * sous la concurrence.
 *
 * Plusieurs « instances d'API » sont simulées par des copies isolées des
 * modules (`jest.isolateModules`), chacune avec son pool de connexions : seule
 * la base les coordonne.
 *
 * Base : DÉDIÉE (`DATABASE_URL_TEST`), jamais celle de développement. Absente
 * ou différente de `DATABASE_URL` -> la suite est ignorée (`describe.skip`).
 */
import { prisma } from '../../src/utils/database';
import { cleanupTenants, createTestTenant } from '../helpers/fixtures';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

if (!HAS_TEST_DATABASE) {
  // eslint-disable-next-line no-console
  console.log(
    'DATABASE_URL_TEST absente (ou différente de DATABASE_URL) : stock-whatsapp-quota-concurrence.test.ts est ignorée.'
  );
}

jest.mock('../../src/services/audit-service', () => ({
  AuditActionKey: jest.requireActual('../../src/types/audit-types').AuditActionKey,
  logAuditEvent: () => undefined,
  recordAuditEvent: async () => undefined
}));

interface Instance {
  reserve: (tenantId: string, limit: number) => Promise<{ ok: boolean; month: string }>;
  release: (tenantId: string, month: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

/** Une « instance d'API » : copie isolée des modules, pool de connexions propre. */
function newInstance(): Instance {
  let instance!: Instance;
  jest.isolateModules(() => {
    const quota = require('../../src/lib/stock-whatsapp/quota');
    const database = require('../../src/utils/database');
    instance = {
      reserve: (tenantId, limit) => quota.reserveWhatsappPhoto(tenantId, limit),
      release: (tenantId, month) => quota.releaseWhatsappPhoto(tenantId, month),
      disconnect: () => database.prisma.$disconnect()
    };
  });
  return instance;
}

maybeDescribe('Inventaire WhatsApp — quota sous concurrence, base réelle', () => {
  jest.setTimeout(120_000);

  const tenantIds: string[] = [];
  let tenantId: string;
  let instances: Instance[];
  const month = new Date().toISOString().slice(0, 7);

  beforeAll(async () => {
    const tenant = await createTestTenant('Agence-Quota-WA');
    tenantId = tenant.id;
    tenantIds.push(tenantId);
    instances = Array.from({ length: 3 }, newInstance);
  });

  afterEach(async () => {
    await prisma.stockWhatsappUsage.deleteMany({ where: { tenantId: { in: tenantIds } } });
  });

  afterAll(async () => {
    await Promise.all((instances ?? []).map(instance => instance.disconnect()));
    await prisma.stockWhatsappUsage.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await cleanupTenants(tenantIds);
    await prisma.$disconnect();
  });

  async function used(): Promise<number> {
    const row = await prisma.stockWhatsappUsage.findUnique({ where: { tenantId_month: { tenantId, month } } });
    return row?.used ?? 0;
  }

  it('W11-3 : deux photos simultanées à 499 sur 500 → une seule passe, compteur à 500', async () => {
    await prisma.stockWhatsappUsage.create({ data: { tenantId, month, used: 499 } });
    const results = await Promise.all([instances[0].reserve(tenantId, 500), instances[1].reserve(tenantId, 500)]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(await used()).toBe(500);
  });

  it('30 réservations simultanées sur 3 instances, plafond 10, ligne absente au départ → exactement 10', async () => {
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, index) => instances[index % instances.length].reserve(tenantId, 10))
    );
    expect(results.filter(result => result.ok)).toHaveLength(10);
    expect(await used()).toBe(10);
  });

  it('restitutions simultanées : jamais sous zéro (CHECK used >= 0 jamais atteint)', async () => {
    await prisma.stockWhatsappUsage.create({ data: { tenantId, month, used: 2 } });
    await Promise.all(
      Array.from({ length: 6 }, (_, index) => instances[index % instances.length].release(tenantId, month))
    );
    expect(await used()).toBe(0);
  });
});
