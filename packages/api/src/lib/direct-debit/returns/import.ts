import type { Prisma } from '@prisma/client';
import { t } from '../../../i18n';
import { AppError, BadRequestError, ErrorCode } from '../../../middleware/error-middleware';
import { recordAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
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

const REFERENCE = /^PRL-(\d{4})-(\d{4,10})-(\d{3,6})$/i;
const MAX_INT = 2_000_000_000;

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

  const remittances: MatchedRemittance[] =
    pairs.size === 0
      ? []
      : ((await prisma.directDebitRemittance.findMany({
          where: {
            tenantId,
            ...remittanceScopeWhere(scope),
            OR: [...pairs.values()].map(pair => ({ year: pair.year, sequence: pair.sequence }))
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
        })) as MatchedRemittance[]);

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
    preview: { format, fileName: sanitizeFileName(upload.originalname), records, errors: parsed.errors, summary },
    buffer: upload.buffer
  };
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
  const { preview, buffer } = await buildPreview(tenantId, scope, file, format, now);

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
      logger.warn('Prélèvement : ligne du fichier de retour non appliquée', {
        tenantId,
        row: record.row,
        errorName: errorNameOf(error)
      });
      results.push({ row: record.row, lineId, ok: false, error: publicErrorMessage(error) });
    }
  }

  const skipped = preview.summary.skip;
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

  return { ...preview, importId: created.id, results };
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
