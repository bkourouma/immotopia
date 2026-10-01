import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { prisma, PrismaTransactionClient } from '../utils/database';
import { logger } from '../utils/logger';
import { GENESIS_HASH, merkleRoot, rowHash, SEAL_ALGORITHM, sealChainHash } from '../lib/audit/integrity';

/**
 * Scellement et vérification d'intégrité du journal d'audit (ADR-006, phase 5).
 *
 * Chaque jour UTC révolu (après `AUDIT_SEAL_GRACE_DAYS` jours de grâce), les
 * lignes de chaque partition — une agence (ou la plateforme) et UNE visibilité —
 * sont résumées par une racine de Merkle, enregistrée dans `audit_seals` et
 * CHAÎNÉE au scellé précédent. La base interdit déjà de modifier ou supprimer
 * une ligne ou un scellé (déclencheurs) ; les scellés servent à DÉTECTER ce que
 * ces déclencheurs n'empêchent pas : un compte administrateur de la base qui les
 * désactive, ou une restauration partielle.
 *
 * Limite assumée, à ne pas taire : les scellés vivent dans la même base. Quelqu'un
 * qui peut tout réécrire PEUT recalculer toute la chaîne. La garantie complète
 * demande d'ancrer ailleurs la tête de chaîne (`getAuditChainHead`, journalisée à
 * chaque passage du job) : voir docs/workflows/RUNBOOK.md.
 */

/** Verrou consultatif : une seule écriture de la chaîne à la fois, toutes instances confondues. */
const CHAIN_LOCK_KEY = 7300000001;
const PAGE_SIZE = 5000;
const PLATFORM_KEY = 'PLATFORM';

export type SealVisibility = 'TENANT' | 'PLATFORM_ONLY';

export interface PartitionRef {
  /** `AAAA-MM-JJ`, jour UTC. */
  sealDate: string;
  /** Identifiant de l'agence, ou `PLATFORM` pour les lignes sans agence. */
  tenantKey: string;
  visibility: SealVisibility;
}

type Reader = Pick<PrismaTransactionClient, 'auditLog'>;

const dayStart = (sealDate: string): Date => new Date(`${sealDate}T00:00:00.000Z`);
const nextDay = (sealDate: string): Date => new Date(dayStart(sealDate).getTime() + 24 * 60 * 60 * 1000);
const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Nombre de lignes et racine de Merkle d'une partition, lues par pages (mémoire bornée). */
export async function computePartitionRoot(
  db: Reader,
  partition: PartitionRef
): Promise<{ rowCount: number; rootHash: string }> {
  const base = {
    createdAt: { gte: dayStart(partition.sealDate), lt: nextDay(partition.sealDate) },
    tenantId: partition.tenantKey === PLATFORM_KEY ? null : partition.tenantKey,
    visibility: partition.visibility
  } satisfies Prisma.AuditLogWhereInput;

  const leaves: string[] = [];
  let cursor: { createdAt: Date; id: string } | undefined;

  for (;;) {
    const rows = await db.auditLog.findMany({
      where: cursor
        ? {
            ...base,
            OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }]
          }
        : base,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: PAGE_SIZE
    });
    for (const row of rows) leaves.push(rowHash(row));
    if (rows.length < PAGE_SIZE) break;
    const last = rows[rows.length - 1];
    cursor = { createdAt: last.createdAt, id: last.id };
  }

  return { rowCount: leaves.length, rootHash: merkleRoot(leaves) };
}

/** Partitions (jour, agence, visibilité) antérieures à `before` et pas encore scellées. */
async function pendingPartitions(before: Date, max: number): Promise<PartitionRef[]> {
  const rows = await prisma.$queryRaw<Array<{ day: Date; tenant_key: string; visibility: SealVisibility }>>`
    SELECT l."created_at"::date AS day,
           COALESCE(l."tenant_id", 'PLATFORM') AS tenant_key,
           l."visibility"::text AS visibility
    FROM "audit_logs" l
    WHERE l."created_at" < ${before}
      AND NOT EXISTS (
        SELECT 1 FROM "audit_seals" s
        WHERE s."seal_date" = l."created_at"::date
          AND s."tenant_key" = COALESCE(l."tenant_id", 'PLATFORM')
          AND s."visibility" = l."visibility"
      )
    GROUP BY 1, 2, 3
    ORDER BY 1, 2, 3
    LIMIT ${max}
  `;
  return rows.map(row => ({ sealDate: isoDay(row.day), tenantKey: row.tenant_key, visibility: row.visibility }));
}

/**
 * Scelle UNE partition, sous verrou, dans une transaction : lire la tête de
 * chaîne, calculer, écrire. `false` si un autre passage l'a scellée entre-temps.
 */
async function sealPartition(partition: PartitionRef): Promise<boolean> {
  return prisma.$transaction(
    async tx => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`);

      const existing = await tx.auditSeal.findUnique({
        where: {
          sealDate_tenantKey_visibility: {
            sealDate: dayStart(partition.sealDate),
            tenantKey: partition.tenantKey,
            visibility: partition.visibility
          }
        },
        select: { id: true }
      });
      if (existing) return false;

      const head = await tx.auditSeal.findFirst({ orderBy: { seq: 'desc' }, select: { chainHash: true } });
      const prevHash = head?.chainHash ?? GENESIS_HASH;
      const { rowCount, rootHash } = await computePartitionRoot(tx, partition);
      if (rowCount === 0) return false;

      const chainHash = sealChainHash(prevHash, { ...partition, rowCount, rootHash, algorithm: SEAL_ALGORITHM });
      await tx.auditSeal.create({
        data: {
          sealDate: dayStart(partition.sealDate),
          tenantKey: partition.tenantKey,
          visibility: partition.visibility,
          rowCount,
          rootHash,
          prevHash,
          chainHash,
          algorithm: SEAL_ALGORITHM
        }
      });
      return true;
    },
    { timeout: 120_000 }
  );
}

export interface SealRunResult {
  sealed: number;
  skipped: number;
  failed: number;
  /** Il reste des partitions à sceller (le plafond par passage a été atteint). */
  moreToSeal: boolean;
}

/**
 * Scelle les partitions révolues non encore scellées. Les journées plus
 * récentes que `graceDays` attendent : une ligne remise en file par une panne
 * de base garde la date de sa journée d'origine.
 */
export async function sealPendingPartitions(
  options: { now?: Date; graceDays?: number; maxPartitions?: number } = {}
): Promise<SealRunResult> {
  const now = options.now ?? new Date();
  const graceDays = options.graceDays ?? env.AUDIT_SEAL_GRACE_DAYS;
  const maxPartitions = options.maxPartitions ?? 2000;
  const before = new Date(startOfUtcDay(now).getTime() - graceDays * 24 * 60 * 60 * 1000);

  const pending = await pendingPartitions(before, maxPartitions + 1);
  const batch = pending.slice(0, maxPartitions);

  const result: SealRunResult = { sealed: 0, skipped: 0, failed: 0, moreToSeal: pending.length > maxPartitions };
  for (const partition of batch) {
    try {
      if (await sealPartition(partition)) result.sealed += 1;
      else result.skipped += 1;
    } catch (error) {
      result.failed += 1;
      logger.error('Scellement du journal d’audit : partition en échec', {
        ...partition,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return result;
}

export interface ChainHead {
  seq: number;
  sealDate: string;
  chainHash: string;
}

/** Dernier scellé de la chaîne : la valeur à ancrer hors de la base. */
export async function getAuditChainHead(): Promise<ChainHead | null> {
  const head = await prisma.auditSeal.findFirst({
    orderBy: { seq: 'desc' },
    select: { seq: true, sealDate: true, chainHash: true }
  });
  return head ? { seq: head.seq, sealDate: isoDay(head.sealDate), chainHash: head.chainHash } : null;
}

export type PartitionStatus =
  /** Les lignes d'aujourd'hui hachent exactement à ce qui a été scellé. */
  | 'OK'
  /** Plus aucune ligne, et la partition a dépassé sa durée de conservation : attendu. */
  | 'EXPIRED'
  /** Plus de lignes qu'au scellement : des lignes sont arrivées après (remise en file tardive). */
  | 'LATE_ROWS'
  /** Moins de lignes qu'au scellement, hors conservation : des lignes ont disparu. */
  | 'ROWS_MISSING'
  /** Même nombre de lignes, autre racine : au moins une ligne a été modifiée. */
  | 'ALTERED';

export interface PartitionFinding extends PartitionRef {
  status: PartitionStatus;
  sealedRows: number;
  foundRows: number;
}

export interface IntegrityReport {
  /** Vrai quand la chaîne est intacte ET qu'aucune partition n'est altérée ou amputée. */
  ok: boolean;
  chain: { ok: boolean; sealsChecked: number; brokenAtSeq?: number; head: ChainHead | null };
  partitions: {
    checked: number;
    ok: number;
    expired: number;
    /** À regarder, pas forcément une altération. */
    lateRows: PartitionFinding[];
    /** Altération ou disparition de lignes. */
    tampered: PartitionFinding[];
    /** Le plafond de partitions vérifiées a été atteint : restreindre la période. */
    truncated: boolean;
  };
}

export interface RetentionCutoffs {
  tenant: Date;
  platform: Date;
}

/** Vérifie la chaîne en entier : chaque scellé doit repartir du hash du précédent. */
async function verifyChain(): Promise<IntegrityReport['chain']> {
  let previous = GENESIS_HASH;
  let afterSeq = 0;
  let checked = 0;

  for (;;) {
    const seals = await prisma.auditSeal.findMany({
      where: { seq: { gt: afterSeq } },
      orderBy: { seq: 'asc' },
      take: 2000
    });
    for (const seal of seals) {
      const expected = sealChainHash(previous, {
        sealDate: isoDay(seal.sealDate),
        tenantKey: seal.tenantKey,
        visibility: seal.visibility,
        rowCount: seal.rowCount,
        rootHash: seal.rootHash,
        algorithm: seal.algorithm
      });
      if (seal.prevHash !== previous || seal.chainHash !== expected) {
        return { ok: false, sealsChecked: checked, brokenAtSeq: seal.seq, head: await getAuditChainHead() };
      }
      previous = seal.chainHash;
      checked += 1;
      afterSeq = seal.seq;
    }
    if (seals.length < 2000) break;
  }
  return { ok: true, sealsChecked: checked, head: await getAuditChainHead() };
}

/**
 * Recalcule la racine de chaque partition scellée de la période et la compare à
 * ce qui a été scellé. `cutoffs` dit quelles partitions ont légitimement été
 * purgées par la rétention (une partition vide et expirée est normale).
 */
export async function verifyAuditIntegrity(options: {
  from?: Date;
  to?: Date;
  cutoffs?: RetentionCutoffs;
  maxPartitions?: number;
}): Promise<IntegrityReport> {
  const maxPartitions = options.maxPartitions ?? 500;
  const chain = await verifyChain();

  const seals = await prisma.auditSeal.findMany({
    where: {
      ...(options.from || options.to
        ? {
            sealDate: {
              ...(options.from ? { gte: startOfUtcDay(options.from) } : {}),
              ...(options.to ? { lte: startOfUtcDay(options.to) } : {})
            }
          }
        : {})
    },
    orderBy: { seq: 'desc' },
    take: maxPartitions + 1
  });
  const batch = seals.slice(0, maxPartitions);

  const partitions: IntegrityReport['partitions'] = {
    checked: 0,
    ok: 0,
    expired: 0,
    lateRows: [],
    tampered: [],
    truncated: seals.length > maxPartitions
  };

  for (const seal of batch) {
    const ref: PartitionRef = {
      sealDate: isoDay(seal.sealDate),
      tenantKey: seal.tenantKey,
      visibility: seal.visibility
    };
    const { rowCount, rootHash } = await computePartitionRoot(prisma, ref);
    partitions.checked += 1;

    const cutoff = seal.visibility === 'TENANT' ? options.cutoffs?.tenant : options.cutoffs?.platform;
    const expired = rowCount === 0 && cutoff !== undefined && dayStart(ref.sealDate) < cutoff;
    const finding = (status: PartitionStatus): PartitionFinding => ({
      ...ref,
      status,
      sealedRows: seal.rowCount,
      foundRows: rowCount
    });

    if (expired) partitions.expired += 1;
    else if (rowCount === seal.rowCount && rootHash === seal.rootHash) partitions.ok += 1;
    else if (rowCount > seal.rowCount) partitions.lateRows.push(finding('LATE_ROWS'));
    else if (rowCount < seal.rowCount) partitions.tampered.push(finding('ROWS_MISSING'));
    else partitions.tampered.push(finding('ALTERED'));
  }

  return { ok: chain.ok && partitions.tampered.length === 0, chain, partitions };
}
