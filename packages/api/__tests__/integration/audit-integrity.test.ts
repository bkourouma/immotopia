/**
 * Journal d'audit, phase 5 — scellement, vérification d'intégrité, purge.
 * Base RÉELLE (déclencheurs et fonction SQL compris) : `npm run test:isolation`.
 *
 * Les lignes de test sont datées de 2018 et portent des identifiants d'agence
 * aléatoires (`audit_logs` n'a aucune clé étrangère vers `tenants`), donc ces
 * tests ne touchent à aucune donnée des autres suites et ne se gênent pas d'un
 * passage à l'autre. Les cas d'altération désactivent un déclencheur — ce que
 * seul un compte propriétaire de la table peut faire, c'est précisément la
 * menace que le scellement doit DÉTECTER — puis le rétablissent.
 */

import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../src/utils/database';
import {
  getAuditChainHead,
  sealPendingPartitions,
  verifyAuditIntegrity
} from '../../src/services/audit-integrity-service';
import { currentRetentionCutoffs, purgeExpiredAuditRows } from '../../src/services/audit-retention-service';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const HAS_TEST_DATABASE = Boolean(DATABASE_URL_TEST) && process.env.DATABASE_URL === DATABASE_URL_TEST;
const maybeDescribe = HAS_TEST_DATABASE ? describe : describe.skip;

if (!HAS_TEST_DATABASE) {
  // eslint-disable-next-line no-console
  console.warn('DATABASE_URL_TEST absente (ou exécution hors `npm run test:isolation`) : suite intégrité ignorée.');
}

type Visibility = 'TENANT' | 'PLATFORM_ONLY';

const at = (day: string, time = '10:00:00') => new Date(`${day}T${time}.000Z`);

async function insertRows(
  tenantId: string | null,
  day: string,
  count: number,
  visibility: Visibility = 'TENANT'
): Promise<string[]> {
  const ids: string[] = [];
  const data: Prisma.AuditLogCreateManyInput[] = [];
  for (let i = 0; i < count; i++) {
    const id = randomUUID();
    ids.push(id);
    data.push({
      id,
      tenantId,
      actionKey: 'TEST_EVENT',
      entityType: 'Test',
      entityId: `e-${i}`,
      payload: { i },
      createdAt: at(day, `10:00:0${i}`),
      scope: tenantId ? 'TENANT' : 'PLATFORM',
      visibility
    });
  }
  await prisma.auditLog.createMany({ data });
  return ids;
}

/** Exécute `fn` avec le déclencheur d'immuabilité de `table` désactivé, puis le rétablit quoi qu'il arrive. */
async function withTriggerOff<T>(table: 'audit_logs' | 'audit_seals', fn: () => Promise<T>): Promise<T> {
  const trigger = table === 'audit_logs' ? 'audit_logs_immutable' : 'audit_seals_immutable';
  await prisma.$executeRawUnsafe(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
  try {
    return await fn();
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`);
  }
}

const findingsFor = (list: Array<{ tenantKey: string }>, tenantKey: string) =>
  list.filter(finding => finding.tenantKey === tenantKey);

maybeDescribe('audit integrity (base réelle)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('scellement', () => {
    it('scelle chaque partition (jour × agence × visibilité) et chaîne les scellés', async () => {
      const tenant = randomUUID();
      await insertRows(tenant, '2018-02-01', 3, 'TENANT');
      await insertRows(tenant, '2018-02-01', 2, 'PLATFORM_ONLY');
      await insertRows(tenant, '2018-02-02', 1, 'TENANT');

      const result = await sealPendingPartitions();
      expect(result.failed).toBe(0);
      expect(result.sealed).toBeGreaterThanOrEqual(3);

      const seals = await prisma.auditSeal.findMany({ where: { tenantKey: tenant }, orderBy: { seq: 'asc' } });
      expect(seals.map(s => [s.sealDate.toISOString().slice(0, 10), s.visibility, s.rowCount])).toEqual(
        expect.arrayContaining([
          ['2018-02-01', 'TENANT', 3],
          ['2018-02-01', 'PLATFORM_ONLY', 2],
          ['2018-02-02', 'TENANT', 1]
        ])
      );
      expect(seals).toHaveLength(3);
      for (const seal of seals) expect(seal.rootHash).toMatch(/^[0-9a-f]{64}$/);

      const head = await getAuditChainHead();
      expect(head?.seq).toBeGreaterThanOrEqual(Math.max(...seals.map(s => s.seq)));
    });

    it('est idempotent : un second passage ne rescelle rien', async () => {
      const tenant = randomUUID();
      await insertRows(tenant, '2018-02-03', 2);
      await sealPendingPartitions();
      const before = await prisma.auditSeal.count({ where: { tenantKey: tenant } });
      await sealPendingPartitions();
      expect(await prisma.auditSeal.count({ where: { tenantKey: tenant } })).toBe(before);
      expect(before).toBe(1);
    });

    it('ne scelle pas la journée en cours ni celles du délai de grâce', async () => {
      const tenant = randomUUID();
      await prisma.auditLog.create({
        data: { tenantId: tenant, actionKey: 'TEST_EVENT', entityType: 'Test', entityId: 'now', visibility: 'TENANT' }
      });
      await sealPendingPartitions();
      expect(await prisma.auditSeal.count({ where: { tenantKey: tenant } })).toBe(0);
    });

    it('scelle sous la clé PLATFORM les lignes sans agence', async () => {
      await insertRows(null, '2018-02-04', 2, 'PLATFORM_ONLY');
      await sealPendingPartitions();
      const seal = await prisma.auditSeal.findUnique({
        where: {
          sealDate_tenantKey_visibility: {
            sealDate: at('2018-02-04', '00:00:00'),
            tenantKey: 'PLATFORM',
            visibility: 'PLATFORM_ONLY'
          }
        }
      });
      expect(seal?.rowCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('immuabilité (déclencheurs)', () => {
    it('refuse de modifier ou supprimer une ligne du journal', async () => {
      const tenant = randomUUID();
      const [id] = await insertRows(tenant, '2018-03-01', 1);
      await expect(prisma.auditLog.update({ where: { id }, data: { entityId: 'x' } })).rejects.toThrow();
      await expect(prisma.auditLog.delete({ where: { id } })).rejects.toThrow();
    });

    it('refuse de modifier ou supprimer un scellé', async () => {
      const tenant = randomUUID();
      await insertRows(tenant, '2018-03-02', 1);
      await sealPendingPartitions();
      const seal = await prisma.auditSeal.findFirstOrThrow({ where: { tenantKey: tenant } });
      await expect(prisma.auditSeal.update({ where: { id: seal.id }, data: { rowCount: 99 } })).rejects.toThrow();
      await expect(prisma.auditSeal.delete({ where: { id: seal.id } })).rejects.toThrow();
    });
  });

  describe('vérification', () => {
    const range = { from: at('2018-04-01', '00:00:00'), to: at('2018-04-30', '00:00:00') };
    const verify = () => verifyAuditIntegrity({ ...range, cutoffs: currentRetentionCutoffs() });

    it('annonce OK quand rien n’a bougé', async () => {
      const tenant = randomUUID();
      await insertRows(tenant, '2018-04-01', 4);
      await sealPendingPartitions();
      const report = await verify();
      expect(report.chain.ok).toBe(true);
      expect(findingsFor(report.partitions.tampered, tenant)).toEqual([]);
      expect(report.partitions.checked).toBeGreaterThanOrEqual(1);
    });

    it('détecte une ligne MODIFIÉE (même effectif, autre racine)', async () => {
      const tenant = randomUUID();
      const ids = await insertRows(tenant, '2018-04-02', 3);
      await sealPendingPartitions();
      await withTriggerOff('audit_logs', () =>
        prisma.auditLog.update({ where: { id: ids[1] }, data: { entityId: 'falsifié' } })
      );
      const report = await verify();
      expect(report.ok).toBe(false);
      expect(findingsFor(report.partitions.tampered, tenant)).toEqual([
        expect.objectContaining({ status: 'ALTERED', sealedRows: 3, foundRows: 3 })
      ]);
    });

    it('détecte une ligne SUPPRIMÉE hors conservation', async () => {
      const tenant = randomUUID();
      const ids = await insertRows(tenant, '2018-04-03', 3);
      await sealPendingPartitions();
      await withTriggerOff('audit_logs', () => prisma.auditLog.delete({ where: { id: ids[0] } }));
      const report = await verifyAuditIntegrity({ ...range, cutoffs: undefined });
      expect(findingsFor(report.partitions.tampered, tenant)).toEqual([
        expect.objectContaining({ status: 'ROWS_MISSING', sealedRows: 3, foundRows: 2 })
      ]);
    });

    it('signale les lignes arrivées APRÈS le scellement sans y voir une altération', async () => {
      const tenant = randomUUID();
      await insertRows(tenant, '2018-04-04', 2);
      await sealPendingPartitions();
      await prisma.auditLog.create({
        data: {
          tenantId: tenant,
          actionKey: 'TEST_EVENT',
          entityType: 'Test',
          entityId: 'tardive',
          visibility: 'TENANT',
          createdAt: at('2018-04-04', '23:00:00')
        }
      });
      const report = await verify();
      expect(findingsFor(report.partitions.tampered, tenant)).toEqual([]);
      expect(findingsFor(report.partitions.lateRows, tenant)).toEqual([
        expect.objectContaining({ status: 'LATE_ROWS', sealedRows: 2, foundRows: 3 })
      ]);
    });

    it('détecte une chaîne rompue (scellé réécrit)', async () => {
      const tenant = randomUUID();
      await insertRows(tenant, '2018-04-05', 1);
      await sealPendingPartitions();
      const seal = await prisma.auditSeal.findFirstOrThrow({ where: { tenantKey: tenant } });

      await withTriggerOff('audit_seals', async () => {
        await prisma.auditSeal.update({ where: { id: seal.id }, data: { rowCount: 42 } });
        try {
          const report = await verify();
          expect(report.ok).toBe(false);
          expect(report.chain.ok).toBe(false);
          expect(report.chain.brokenAtSeq).toBe(seal.seq);
        } finally {
          await prisma.auditSeal.update({ where: { id: seal.id }, data: { rowCount: seal.rowCount } });
        }
      });

      expect((await verify()).chain.ok).toBe(true);
    });
  });

  describe('purge de rétention', () => {
    it('refuse une date limite de moins de 180 jours et un lot hors bornes', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await expect(
        prisma.$queryRaw`SELECT audit_logs_purge(${yesterday}::timestamp, 'TENANT'::"AuditVisibility", 100)`
      ).rejects.toThrow();
      const old = at('2018-01-01', '00:00:00');
      await expect(
        prisma.$queryRaw`SELECT audit_logs_purge(${old}::timestamp, 'TENANT'::"AuditVisibility", 0)`
      ).rejects.toThrow();
    });

    it('ne supprime que les partitions scellées, garde les scellés et trace AUDIT_PURGED', async () => {
      const sealedTenant = randomUUID();
      const unsealedTenant = randomUUID();
      await insertRows(sealedTenant, '2018-05-01', 3);
      await sealPendingPartitions();
      // Écrite après le passage : pas de scellé, donc intouchable.
      const [unsealedId] = await insertRows(unsealedTenant, '2018-05-02', 1);

      const purgedBefore = await prisma.auditLog.count({ where: { actionKey: 'AUDIT_PURGED' } });
      const result = await purgeExpiredAuditRows();
      expect(result.deleted.TENANT).toBeGreaterThanOrEqual(3);

      expect(await prisma.auditLog.count({ where: { tenantId: sealedTenant } })).toBe(0);
      expect(await prisma.auditLog.findUnique({ where: { id: unsealedId } })).not.toBeNull();
      expect(await prisma.auditSeal.count({ where: { tenantKey: sealedTenant } })).toBe(1);

      const events = await prisma.auditLog.findMany({
        where: { actionKey: 'AUDIT_PURGED' },
        orderBy: { createdAt: 'desc' }
      });
      expect(events.length).toBeGreaterThan(purgedBefore);
      expect(events[0]).toEqual(expect.objectContaining({ tenantId: null, visibility: 'PLATFORM_ONLY' }));
      expect(events[0].payload).toEqual(
        expect.objectContaining({ visibility: expect.any(String), deleted: expect.any(Number) })
      );
    });

    it('la partition purgée apparaît EXPIRED (attendu), pas comme une disparition', async () => {
      const tenant = randomUUID();
      await insertRows(tenant, '2018-05-03', 2);
      await sealPendingPartitions();
      await purgeExpiredAuditRows();

      const report = await verifyAuditIntegrity({
        from: at('2018-05-03', '00:00:00'),
        to: at('2018-05-03', '00:00:00'),
        cutoffs: currentRetentionCutoffs()
      });
      expect(findingsFor(report.partitions.tampered, tenant)).toEqual([]);
      expect(report.partitions.expired).toBeGreaterThanOrEqual(1);
      expect(report.chain.ok).toBe(true);
    });
  });
});
