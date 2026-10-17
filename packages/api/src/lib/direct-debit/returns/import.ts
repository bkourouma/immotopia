import type { Prisma } from '@prisma/client';
import { t } from '../../../i18n';
import { AppError, BadRequestError, ConflictError, ErrorCode } from '../../../middleware/error-middleware';
import { recordAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { withExclusiveSection } from '../../ai/advisory-lock';
import { formatFrenchDate } from '../business-days';
import { resolveDebtorNames } from '../dto';
import { assertFileDigestAvailable, computeRemittanceFileDigest } from '../file-digest';
import { remittanceReferenceOf } from '../remittance-dto';
import { sameMoney } from '../remittance-selection';
import { RETURN_FILE_MAX_BYTES, type ReturnRecord } from '../return-formats/types';
import { getReturnAdapter } from '../return-formats';
import { rejectLine, settleLine } from './lines';
import { returnFormatSchema } from './schemas';
import {
  errorNameOf,
  isReturnDateInRange,
  publicErrorMessage,
  remittanceScopeWhere,
  sanitizeFileName,
  scopeOf
} from './shared';
import type {
  ReturnApplyDto,
  ReturnImportDto,
  ReturnPreviewDto,
  ReturnRecordDto,
  ReturnScope,
  ReturnSkipReason
} from './types';

/**
 * Import d'un fichier de retour de la banque (spec 042, P3, data-model §8.5) en
 * deux temps : aperçu (lecture seule) puis application du même fichier, relu et
 * rapproché à nouveau. Le fichier n'est jamais stocké : seule son empreinte HMAC
 * l'est. Ni l'aperçu ni la trace d'audit ne portent d'IBAN ni d'adresse e-mail.
 */

export interface UploadedReturnFile {
  buffer: Buffer;
  originalname?: string;
}

/** Même forme que le parseur CSV (`return-formats/generic-csv.ts`) : rang de 3 à 6 chiffres. */
const REFERENCE = /^PRL-(\d{4})-(\d{4,10})-(\d{3,6})$/i;
const MAX_INT = 2_000_000_000;

/** Application d'un fichier : au plus 500 enregistrements actionnables (une transaction chacun). */
export const APPLY_MAX_ACTIONABLE_RECORDS = 500;
/** Rapprochement : au plus 50 remises distinctes par fichier, requêtes par lots de 200 couples. */
export const RECONCILE_MAX_REMITTANCES = 50;
const RECONCILE_BATCH_SIZE = 200;
/** Une application tient le verrou le temps de ses transactions (500 lignes au plus). */
const APPLY_LOCK_OPTIONS = { maxWaitMs: 10_000, timeoutMs: 15 * 60_000 };
/** Applications en cours dans ce processus : la seconde est refusée tout de suite, sans attendre. */
const applyingNow = new Set<string>();

interface ParsedReference {
  year: number;
  sequence: number;
  lineNumber: number;
}

function parseOperationReference(value: string): ParsedReference | null {
  const match = REFERENCE.exec(value.trim());
  if (!match) return null;
  const parsed = { year: Number(match[1]), sequence: Number(match[2]), lineNumber: Number(match[3]) };
  if (parsed.sequence > MAX_INT || parsed.lineNumber > MAX_INT) return null;
  return parsed;
}

// ---------------------------------------------------------------------------
// Rapprochement
// ---------------------------------------------------------------------------

type MatchedLine = {
  id: string;
  lineNumber: number;
  status: 'PENDING' | 'CANCELED' | 'SETTLED' | 'REJECTED';
  amount: Prisma.Decimal | number;
  debtorClientId: string;
  debtor: { id: string; details: unknown; user: { fullName: string | null } | null };
};

type MatchedRemittance = {
  id: string;
  year: number;
  sequence: number;
  status: string;
  collectionDate: Date;
  lines: MatchedLine[];
};

/** Situation de chaque enregistrement par rapport aux lignes de l'agence (tableau du §8.5). */
export function decideRecord(
  record: ReturnRecord,
  remittance: MatchedRemittance | undefined,
  line: MatchedLine | undefined,
  planned: Map<string, 'SETTLED' | 'REJECTED'>,
  now: Date
): { action: 'SETTLE' | 'REJECT' | 'SKIP'; skipReason: ReturnSkipReason | null } {
  const skip = (skipReason: ReturnSkipReason) => ({ action: 'SKIP' as const, skipReason });
  if (!remittance || !line) return skip('UNKNOWN_REFERENCE');
  if (remittance.status !== 'EXPORTED' && remittance.status !== 'SUBMITTED') return skip('REMITTANCE_NOT_SUBMITTED');
  if (line.status === 'CANCELED') return skip('LINE_CANCELED');

  // État de la ligne tel que les enregistrements précédents du fichier le laisseront.
  const earlier = planned.get(line.id);
  const status = earlier ?? line.status;
  if (record.outcome === 'SETTLED') {
    if (status === 'SETTLED') return skip('ALREADY_PROCESSED');
    if (status === 'REJECTED') return skip('CONFLICT');
  } else if (status === 'REJECTED') {
    return skip('ALREADY_PROCESSED');
  }

  if (!isReturnDateInRange(record.date, remittance.collectionDate, now)) return skip('INVALID_DATE');
  if (!sameMoney(record.amount, Number(line.amount))) return skip('AMOUNT_MISMATCH');

  planned.set(line.id, record.outcome);
  return { action: record.outcome === 'SETTLED' ? 'SETTLE' : 'REJECT', skipReason: null };
}

export async function reconcileRecords(
  tenantId: string,
  scope: ReturnScope,
  records: ReturnRecord[],
  now: Date
): Promise<ReturnRecordDto[]> {
  const references = records.map(record => parseOperationReference(record.operationReference));

  const pairs = new Map<string, { year: number; sequence: number }>();
  const lineNumbers = new Set<number>();
  for (const reference of references) {
    if (!reference) continue;
    pairs.set(`${reference.year}-${reference.sequence}`, { year: reference.year, sequence: reference.sequence });
    lineNumbers.add(reference.lineNumber);
  }

  if (pairs.size > RECONCILE_MAX_REMITTANCES) {
    throw new BadRequestError(
      t('Ce fichier concerne trop de remises ({{max}} au maximum) : découpez-le par remise.', {
        max: RECONCILE_MAX_REMITTANCES
      })
    );
  }

  const remittances: MatchedRemittance[] = [];
  const pairList = [...pairs.values()];
  for (let start = 0; start < pairList.length; start += RECONCILE_BATCH_SIZE) {
    const batch = pairList.slice(start, start + RECONCILE_BATCH_SIZE);
    remittances.push(
      ...((await prisma.directDebitRemittance.findMany({
        where: {
          tenantId,
          ...remittanceScopeWhere(scope),
          OR: batch.map(pair => ({ year: pair.year, sequence: pair.sequence }))
        },
        select: {
          id: true,
          year: true,
          sequence: true,
          status: true,
          collectionDate: true,
          lines: {
            where: { tenantId, lineNumber: { in: [...lineNumbers] } },
            select: {
              id: true,
              lineNumber: true,
              status: true,
              amount: true,
              debtorClientId: true,
              debtor: { select: { id: true, details: true, user: { select: { fullName: true } } } }
            }
          }
        }
      })) as MatchedRemittance[])
    );
  }

  const remittanceByKey = new Map(remittances.map(entry => [`${entry.year}-${entry.sequence}`, entry]));
  const names = await resolveDebtorNames(
    prisma,
    tenantId,
    remittances.flatMap(entry => entry.lines.map(line => line.debtor))
  );

  const planned = new Map<string, 'SETTLED' | 'REJECTED'>();
  return records.map((record, index) => {
    const reference = references[index];
    const remittance = reference ? remittanceByKey.get(`${reference.year}-${reference.sequence}`) : undefined;
    const line = reference ? remittance?.lines.find(entry => entry.lineNumber === reference.lineNumber) : undefined;
    const { action, skipReason } = decideRecord(record, remittance, line, planned, now);
    return {
      row: record.row,
      operationReference: record.operationReference,
      outcome: record.outcome,
      date: record.date,
      amount: record.amount,
      rejectionCode: record.rejectionCode,
      rejectionReason: record.rejectionReason,
      action,
      skipReason,
      match:
        remittance && line
          ? {
              remittanceId: remittance.id,
              remittanceReference: remittanceReferenceOf(remittance.year, remittance.sequence),
              lineId: line.id,
              lineStatus: line.status,
              lineAmount: Number(line.amount),
              debtorName: names.get(line.debtorClientId) ?? null
            }
          : null
    };
  });
}

// ---------------------------------------------------------------------------
// Aperçu et application
// ---------------------------------------------------------------------------

function readFile(file: UploadedReturnFile | undefined): UploadedReturnFile & { buffer: Buffer } {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw new BadRequestError(t('Joignez le fichier de retour de la banque.'));
  }
  if (file.buffer.length > RETURN_FILE_MAX_BYTES) {
    throw new AppError(t('Le fichier dépasse la taille maximale de 2 Mo.'), 413, ErrorCode.BAD_REQUEST);
  }
  return file as UploadedReturnFile & { buffer: Buffer };
}

async function buildPreview(
  tenantId: string,
  scope: ReturnScope,
  file: UploadedReturnFile | undefined,
  formatInput: string | undefined,
  now: Date
): Promise<{ preview: ReturnPreviewDto; buffer: Buffer }> {
  const upload = readFile(file);
  const format = returnFormatSchema.parse(formatInput?.trim() ? formatInput.trim() : undefined) ?? 'GENERIC_CSV';
  const parsed = getReturnAdapter(format).parse(upload.buffer);
  const records = await reconcileRecords(tenantId, scope, parsed.records, now);
  const summary = {
    settle: records.filter(record => record.action === 'SETTLE').length,
    reject: records.filter(record => record.action === 'REJECT').length,
    skip: records.filter(record => record.action === 'SKIP').length,
    errors: parsed.errors.length
  };
  return {
    preview: {
      format,
      fileName: sanitizeFileName(upload.originalname),
      records,
      errors: parsed.errors,
      summary,
      alreadyImported: await findPreviousImport(tenantId, scope, upload.buffer)
    },
    buffer: upload.buffer
  };
}

/** Dernier import de la même empreinte (même agence, même périmètre) ; null sans clé d'empreinte. */
async function findPreviousImport(
  tenantId: string,
  scope: ReturnScope,
  buffer: Buffer
): Promise<ReturnPreviewDto['alreadyImported']> {
  let fileDigest: string;
  try {
    fileDigest = computeRemittanceFileDigest(buffer);
  } catch {
    // Sans clé d'empreinte l'aperçu reste possible ; l'application, elle, est refusée en amont.
    return null;
  }
  const previous = await prisma.directDebitReturnImport.findFirst({
    where: { tenantId, scope: scopeOf(scope), fileDigest },
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true }
  });
  return previous ? { importId: previous.id, importedAt: previous.createdAt.toISOString() } : null;
}

export async function previewReturnFileAt(
  tenantId: string,
  scope: ReturnScope,
  file: UploadedReturnFile | undefined,
  format: string | undefined,
  now: Date
): Promise<ReturnPreviewDto> {
  return (await buildPreview(tenantId, scope, file, format, now)).preview;
}

export async function applyReturnFileAt(
  tenantId: string,
  scope: ReturnScope,
  file: UploadedReturnFile | undefined,
  format: string | undefined,
  actorUserId: string | null,
  now: Date
): Promise<ReturnApplyDto> {
  // Sans clé d'empreinte, rien n'est écrit : la vérification précède tout constat.
  assertFileDigestAvailable();

  // Une seule application à la fois par agence et par périmètre : deux clics, ou deux onglets, ne rejouent pas
  // le même fichier en parallèle. La seconde, dans ce processus, est refusée sans attendre.
  const lockKey = `direct-debit-return:${tenantId}:${scopeOf(scope)}${
    scope.scope === 'SYNDIC_LOT' ? `:${scope.syndicateId}` : ''
  }`;
  if (applyingNow.has(lockKey)) throw applicationInProgress();
  applyingNow.add(lockKey);

  let started = false;
  try {
    return await withExclusiveSection(
      lockKey,
      () => {
        started = true;
        return applyLocked(tenantId, scope, file, format, actorUserId, now);
      },
      APPLY_LOCK_OPTIONS
    );
  } catch (error) {
    // Autre instance : le verrou n'a pas pu être obtenu à temps (la transaction gardienne n'a pas démarré).
    if (!started && (error as { code?: unknown } | null)?.code === 'P2028') throw applicationInProgress();
    throw error;
  } finally {
    applyingNow.delete(lockKey);
  }
}

const applicationInProgress = () =>
  new ConflictError(t("Un fichier de retour est déjà en cours d'application : patientez puis rechargez la page."));

async function applyLocked(
  tenantId: string,
  scope: ReturnScope,
  file: UploadedReturnFile | undefined,
  format: string | undefined,
  actorUserId: string | null,
  now: Date
): Promise<ReturnApplyDto> {
  // Rapprochement DANS le verrou : une application qui nous précède est déjà visible (lignes traitées).
  const { preview, buffer } = await buildPreview(tenantId, scope, file, format, now);

  // Fichier déjà appliqué : tous ses enregistrements ne sont plus que des doublons, rien à constater.
  if (
    preview.alreadyImported &&
    preview.records.length > 0 &&
    preview.records.every(record => record.skipReason === 'ALREADY_PROCESSED')
  ) {
    throw new ConflictError(
      t('Ce fichier a déjà été appliqué le {{date}}.', {
        date: formatFrenchDate(new Date(preview.alreadyImported.importedAt))
      })
    );
  }

  const actionable = preview.records.filter(record => record.action !== 'SKIP').length;
  if (actionable > APPLY_MAX_ACTIONABLE_RECORDS) {
    throw new BadRequestError(
      t(
        'Ce fichier compte {{count}} enregistrements à appliquer ({{max}} au maximum par import) : découpez-le en plusieurs fichiers.',
        { count: actionable, max: APPLY_MAX_ACTIONABLE_RECORDS }
      )
    );
  }

  const created = await prisma.directDebitReturnImport.create({
    data: {
      tenantId,
      scope: scopeOf(scope),
      format: preview.format,
      fileName: preview.fileName,
      fileDigest: computeRemittanceFileDigest(buffer),
      recordCount: preview.records.length,
      importedByUserId: actorUserId
    },
    select: { id: true }
  });

  const results: ReturnApplyDto['results'] = [];
  let settled = 0;
  let rejected = 0;
  let failed = 0;
  const skipped = preview.summary.skip;

  // Les compteurs sont écrits quoi qu'il arrive (même si la boucle s'arrête) : l'import ne reste pas à zéro.
  const finalize = async () => {
    const errorCount = preview.errors.length + failed;
    await prisma.$transaction(async tx => {
      await tx.directDebitReturnImport.updateMany({
        where: { id: created.id, tenantId },
        data: { settledCount: settled, rejectedCount: rejected, skippedCount: skipped, errorCount }
      });
      await recordAuditEvent(tx, {
        actorUserId,
        tenantId,
        actionKey: AuditActionKey.DIRECT_DEBIT_RETURN_IMPORTED,
        entityType: 'DirectDebitReturnImport',
        entityId: created.id,
        // Compteurs seulement : ni nom de fichier, ni contenu.
        payload: {
          format: preview.format,
          recordCount: preview.records.length,
          settled,
          rejected,
          skipped,
          errors: errorCount
        }
      });
    });
  };

  let interrupted = false;
  let interruption: unknown;
  try {
    for (const record of preview.records) {
      if (record.action === 'SKIP' || !record.match) continue;
      const { remittanceId, lineId } = record.match;
      const origin = { source: 'IMPORT' as const, importId: created.id, actorUserId };
      try {
        if (record.action === 'SETTLE') {
          await settleLine(tenantId, scope, remittanceId, lineId, record.date, origin, now);
          settled += 1;
        } else {
          await rejectLine(
            tenantId,
            scope,
            remittanceId,
            lineId,
            record.date,
            { code: record.rejectionCode, reason: record.rejectionReason },
            origin,
            now
          );
          rejected += 1;
        }
        results.push({ row: record.row, lineId, ok: true, error: null });
      } catch (error) {
        failed += 1;
        // Identifiants techniques seulement : jamais de nom, d'IBAN ni d'adresse.
        logger.warn('Prélèvement : ligne du fichier de retour non appliquée', {
          tenantId,
          importId: created.id,
          lineId,
          row: record.row,
          errorName: errorNameOf(error)
        });
        results.push({ row: record.row, lineId, ok: false, error: publicErrorMessage(error) });
      }
    }
  } catch (error) {
    interrupted = true;
    interruption = error;
  }
  try {
    await finalize();
  } catch (error) {
    // Si la boucle s'est déjà arrêtée sur une erreur, c'est celle-là qui doit remonter.
    if (!interrupted) throw error;
    logger.warn('Prélèvement : compteurs de l’import non enregistrés', {
      tenantId,
      importId: created.id,
      errorName: errorNameOf(error)
    });
  }
  if (interrupted) throw interruption;

  return { ...preview, importId: created.id, results, appliedSummary: { settled, rejected, failed } };
}

export async function listReturnImportsFor(
  tenantId: string,
  scope: ReturnScope,
  query: { page: number; pageSize: number }
): Promise<{ items: ReturnImportDto[]; total: number; page: number; pageSize: number }> {
  const where: Prisma.DirectDebitReturnImportWhereInput = { tenantId, scope: scopeOf(scope) };
  const [total, rows] = await Promise.all([
    prisma.directDebitReturnImport.count({ where }),
    prisma.directDebitReturnImport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        format: true,
        fileName: true,
        recordCount: true,
        settledCount: true,
        rejectedCount: true,
        skippedCount: true,
        errorCount: true,
        importedByUserId: true,
        createdAt: true
      }
    })
  ]);

  const userIds = [...new Set(rows.map(row => row.importedByUserId).filter((id): id is string => Boolean(id)))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
    : [];
  const userById = new Map(users.map(user => [user.id, user]));

  return {
    items: rows.map(row => ({
      id: row.id,
      format: row.format,
      fileName: row.fileName,
      recordCount: row.recordCount,
      settledCount: row.settledCount,
      rejectedCount: row.rejectedCount,
      skippedCount: row.skippedCount,
      errorCount: row.errorCount,
      importedBy: row.importedByUserId
        ? { id: row.importedByUserId, fullName: userById.get(row.importedByUserId)?.fullName ?? null }
        : null,
      createdAt: row.createdAt.toISOString()
    })),
    total,
    page: query.page,
    pageSize: query.pageSize
  };
}
