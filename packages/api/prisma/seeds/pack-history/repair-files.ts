/**
 * Réparation des fichiers des agences de test déjà semées (staging).
 *
 * Le seed des agences de test a longtemps écrit les documents locatifs
 * (`RentalDocument`) et les modèles de l'agence (`DocumentTemplate`) sous
 * `<racine>/assets/...`, soit `/repo/assets/...` dans le conteneur `migrate`
 * jetable, et non sur le volume des fichiers (`UPLOADS_DIR`). Les lignes en
 * base pointent donc vers des fichiers qui n'existent plus et hors des dossiers
 * que l'API accepte de lire (`getDocumentFile` : « Fichier du document invalide »).
 *
 * Ce module réécrit ces fichiers sur le volume et met le chemin à jour :
 *
 * - `RentalDocument` : fichier .docx reconstitué avec le même générateur que le
 *   seed (`buildDocx`), à partir de la ligne (type, numéro, date, bail,
 *   description) ; même découpage de sous-dossiers que l'API
 *   (`<agence>/<type>/<AAAA>/<MM>/`). L'empreinte `file_hash` suit le nouveau fichier.
 * - `DocumentTemplate` : copie du modèle livré (`original_filename` sous
 *   `assets/modeles_documents`) vers `<volume>/modeles_documents/tenants/<agence>/`.
 *
 * « Sain » veut dire : le chemin stocké est sous le volume d'écriture ET le
 * fichier existe. Un chemin hors du volume est réparé même si un fichier s'y
 * trouve, car l'API (autre conteneur) ne le verrait pas.
 *
 * Idempotent : une ligne saine n'est pas touchée, un second passage répare 0 ligne.
 * Aucun contenu de fichier ni chemin n'est journalisé : seulement des compteurs
 * et, pour les échecs, le code d'erreur (EACCES, ENOENT…).
 */
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { DocumentTemplateStatus } from '@prisma/client';
import {
  getGeneratedDocumentDir,
  getGeneratedDocumentsDir,
  getShippedTemplatesDir,
  getTemplatesWriteDir,
  isInsideDir
} from '../../../src/utils/assets-paths';
import type { ExtendedPrismaClient } from '../../../src/utils/database';
import { buildDocx } from './agence-locatif-files';

/** Le client de l'application (`utils/database`, avec l'extension de garde tenant) ou un double de test. */
export type RepairDb = Pick<ExtendedPrismaClient, 'rentalDocument' | 'documentTemplate'>;

export interface RepairCounts {
  /** Lignes examinées. */
  checked: number;
  /** Fichier réécrit et chemin mis à jour. */
  repaired: number;
  /** Chemin sur le volume et fichier présent : rien à faire. */
  healthy: number;
  /** Réparation impossible (voir `failureCodes`). */
  failed: number;
  /** Code d'erreur → nombre de lignes (jamais de chemin ni de contenu). */
  failureCodes: Record<string, number>;
}

export interface TenantRepairReport {
  rentalDocuments: RepairCounts;
  templates: RepairCounts;
  /** Vrai si une agence qui gère des baux n'a aucun modèle propre (le seed normal les crée). */
  withoutTemplates: boolean;
}

const GENERATED_DIR_NAME = 'generated_documents';

const TYPE_LABEL: Record<string, string> = {
  LEASE_CONTRACT: 'Contrat de bail',
  LEASE_ADDENDUM: 'Avenant au bail',
  RENT_RECEIPT: 'Reçu de loyer',
  RENT_QUITTANCE: 'Quittance de loyer',
  DEPOSIT_RECEIPT: 'Reçu de dépôt de garantie',
  STATEMENT: 'Relevé de compte'
};

export interface RentalDocumentRow {
  id: string;
  tenant_id: string;
  type: string;
  document_number: string | null;
  file_path: string | null;
  title: string | null;
  description: string | null;
  issued_at: Date | null;
  created_at: Date;
  lease: { lease_number: string | null } | null;
}

export interface TemplateRow {
  id: string;
  tenant_id: string | null;
  original_filename: string;
  stored_filename: string;
  storage_path: string;
  file_size: number;
}

function emptyCounts(): RepairCounts {
  return { checked: 0, repaired: 0, healthy: 0, failed: 0, failureCodes: {} };
}

/** Code d'erreur court (ENOENT, EACCES, P2002…), jamais le message : il peut citer un chemin. */
function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const { code, name } = error as { code?: unknown; name?: unknown };
    for (const candidate of [code, name]) {
      if (typeof candidate === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(candidate)) return candidate;
    }
  }
  return 'ERREUR';
}

function recordFailure(counts: RepairCounts, error: unknown): void {
  const code = errorCode(error);
  counts.failed += 1;
  counts.failureCodes[code] = (counts.failureCodes[code] ?? 0) + 1;
}

/** Vrai si `filePath` est un fichier présent ET sous `baseDir` (le volume que l'API relit). */
export async function isFileUnder(filePath: string | null, baseDir: string): Promise<boolean> {
  if (!filePath || !isInsideDir(filePath, baseDir)) return false;
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '-');
}

/**
 * Nouveau chemin d'un document : on garde la fin de l'ancien chemin
 * (`<agence>/<type>/<AAAA>/<MM>/<fichier>`, après `generated_documents`) pour que
 * l'arborescence reste celle de l'API ; sinon on reconstruit le nom à partir de la ligne.
 */
export function repairedDocumentPath(row: RentalDocumentRow): string {
  const generatedDir = getGeneratedDocumentsDir();
  const segments = (row.file_path ?? '').split(/[\\/]+/).filter(Boolean);
  const at = segments.lastIndexOf(GENERATED_DIR_NAME);
  const relative = at >= 0 ? segments.slice(at + 1) : [];
  if (relative.length >= 2 && relative[0] === row.tenant_id && relative.every(s => s !== '.' && s !== '..')) {
    const kept = path.join(generatedDir, ...relative);
    if (isInsideDir(kept, generatedDir)) return kept;
  }
  const when = row.issued_at ?? row.created_at;
  const fileName = `${safeFileName(row.document_number ?? row.id)}_${safeFileName(row.type)}_${row.id.slice(0, 8)}.docx`;
  return path.join(getGeneratedDocumentDir(row.tenant_id, row.type, when.getFullYear(), when.getMonth() + 1), fileName);
}

function formatDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

/** Contenu du .docx reconstitué : titre et lignes tirés de la ligne, jamais d'un fichier perdu. */
export function repairedDocumentContent(row: RentalDocumentRow): { title: string; lines: string[] } {
  const label = TYPE_LABEL[row.type] ?? 'Document';
  const lines = [`${label} n° ${row.document_number ?? row.id}`];
  if (row.issued_at) lines.push(`Date d'émission : ${formatDate(row.issued_at)}`);
  if (row.lease?.lease_number) lines.push(`Bail : ${row.lease.lease_number}`);
  if (row.description) lines.push('', row.description);
  lines.push('', 'Fichier reconstitué après la mise en place du volume des fichiers (données de recette).');
  return { title: row.title ?? label, lines };
}

async function repairRentalDocuments(db: RepairDb, tenantId: string): Promise<RepairCounts> {
  const counts = emptyCounts();
  const generatedDir = getGeneratedDocumentsDir();
  const rows = (await db.rentalDocument.findMany({
    where: { tenant_id: tenantId, file_path: { not: null } },
    select: {
      id: true,
      tenant_id: true,
      type: true,
      document_number: true,
      file_path: true,
      title: true,
      description: true,
      issued_at: true,
      created_at: true,
      lease: { select: { lease_number: true } }
    },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }]
  })) as RentalDocumentRow[];

  for (const row of rows) {
    counts.checked += 1;
    // eslint-disable-next-line no-await-in-loop -- séquentiel voulu : disque et base ménagés, comptes fidèles.
    if (await isFileUnder(row.file_path, generatedDir)) {
      counts.healthy += 1;
      continue;
    }
    try {
      const target = repairedDocumentPath(row);
      const { title, lines } = repairedDocumentContent(row);
      const buffer = buildDocx(title, lines);
      // eslint-disable-next-line no-await-in-loop -- idem.
      await fs.mkdir(path.dirname(target), { recursive: true });
      // eslint-disable-next-line no-await-in-loop -- idem.
      await fs.writeFile(target, buffer);
      // eslint-disable-next-line no-await-in-loop -- idem.
      await db.rentalDocument.updateMany({
        where: { id: row.id, tenant_id: row.tenant_id },
        data: { file_path: target, file_hash: createHash('sha256').update(buffer).digest('hex') }
      });
      counts.repaired += 1;
    } catch (error) {
      recordFailure(counts, error);
    }
  }
  return counts;
}

async function repairTemplates(db: RepairDb, tenantId: string): Promise<{ counts: RepairCounts; none: boolean }> {
  const counts = emptyCounts();
  const writeDir = getTemplatesWriteDir();
  const shippedDir = getShippedTemplatesDir();
  const rows = (await db.documentTemplate.findMany({
    where: { tenant_id: tenantId, status: { not: DocumentTemplateStatus.DELETED } },
    select: {
      id: true,
      tenant_id: true,
      original_filename: true,
      stored_filename: true,
      storage_path: true,
      file_size: true
    },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }]
  })) as TemplateRow[];

  for (const row of rows) {
    counts.checked += 1;
    // eslint-disable-next-line no-await-in-loop -- séquentiel voulu : disque et base ménagés, comptes fidèles.
    if (await isFileUnder(row.storage_path, writeDir)) {
      counts.healthy += 1;
      continue;
    }
    try {
      // basename : le nom vient de la base, il ne doit jamais sortir du dossier des modèles livrés.
      // eslint-disable-next-line no-await-in-loop -- idem.
      const buffer = await fs.readFile(path.join(shippedDir, path.basename(row.original_filename)));
      const target = path.join(writeDir, 'tenants', tenantId, path.basename(row.stored_filename));
      // eslint-disable-next-line no-await-in-loop -- idem.
      await fs.mkdir(path.dirname(target), { recursive: true });
      // eslint-disable-next-line no-await-in-loop -- idem.
      await fs.writeFile(target, buffer);
      // eslint-disable-next-line no-await-in-loop -- idem.
      await db.documentTemplate.updateMany({
        where: { id: row.id, tenant_id: tenantId },
        data: { storage_path: target, file_size: buffer.length }
      });
      counts.repaired += 1;
    } catch (error) {
      recordFailure(counts, error);
    }
  }
  return { counts, none: rows.length === 0 };
}

/** Répare les fichiers des documents locatifs et des modèles d'UNE agence de test. */
export async function repairTenantFiles(db: RepairDb, tenantId: string): Promise<TenantRepairReport> {
  const rentalDocuments = await repairRentalDocuments(db, tenantId);
  const templates = await repairTemplates(db, tenantId);
  return {
    rentalDocuments,
    templates: templates.counts,
    withoutTemplates: templates.none && rentalDocuments.checked > 0
  };
}
