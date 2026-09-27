import archiver from 'archiver';
import { createWriteStream, promises as fs, type WriteStream } from 'fs';
import { once } from 'events';
import * as path from 'path';
import { buildTenantWhere, classifyModels, schemaModels, type DmmfModel, type ExportModelPlan } from './model-registry';
import { exportableFields } from './sensitive-fields';
import { CSV_BOM, csvLine } from './csv';
import {
  FileReferenceCollector,
  OWNER_MODELS,
  parseFileReference,
  portableReference,
  type FileRoots,
  type OwnedIds
} from './file-references';
import { buildSummaryWorkbook, type SummaryModelLine } from './summary-workbook';

/**
 * Construction de l'archive ZIP d'une agence (lot S7).
 *
 * Memoire bornee : chaque modele est lu par lots (curseur sur l'identifiant,
 * `take` = `batchSize`) et ecrit au fil de l'eau dans un CSV de travail sur
 * disque ; l'archive est ensuite assemblee en flux (`archiver`), les fichiers
 * joints lus directement depuis le disque. Rien n'est jamais charge en entier.
 */

/** Delegues Prisma, reduits a ce que l'export utilise. */
export type ExportDataSource = Record<
  string,
  { findMany(args: Record<string, unknown>): Promise<Record<string, unknown>[]> }
>;

export interface BuildArchiveInput {
  db: ExportDataSource;
  tenant: { id: string; name: string; slug: string };
  exportId: string;
  schemaVersion: string | null;
  roots: FileRoots;
  archivePath: string;
  stagingDir: string;
  models?: DmmfModel[];
  batchSize?: number;
  now?: Date;
  /** Espace libre (octets) du volume de l'archive ; `fs.statfs` par defaut. */
  freeSpaceBytes?: (dir: string) => Promise<number>;
  /** Plafonds du collecteur de fichiers (tests). */
  fileLimits?: { maxFiles: number; maxTotalBytes: number };
}

/** L'archive ne tiendrait pas sur le disque : l'export echoue avant d'ecrire le ZIP. */
export class InsufficientDiskSpaceError extends Error {
  constructor(
    readonly requiredBytes: number,
    readonly availableBytes: number
  ) {
    super(`Espace disque insuffisant : ${requiredBytes} octets requis, ${availableBytes} disponibles.`);
    this.name = 'InsufficientDiskSpaceError';
  }
}

/**
 * Champs qui stockent un chemin ABSOLU du serveur : le CSV n'en garde que la
 * forme relative (ou rien), jamais le chemin disque.
 */
const SERVER_PATH_FIELDS: Readonly<Record<string, readonly string[]>> = {
  RentalDocument: ['file_path'],
  DocumentTemplate: ['storage_path'],
  LeaseInspectionPhoto: ['filePath']
};

const ABSOLUTE_PATH = /^([a-z]:[\\/]|[\\/])/i;

export interface BuildArchiveResult {
  sizeBytes: number;
  modelCount: number;
  rowCount: number;
  fileCount: number;
  missingFileCount: number;
  refusedFileCount: number;
  unclassified: string[];
}

const DEFAULT_BATCH_SIZE = 500;

async function write(stream: WriteStream, chunk: string): Promise<void> {
  if (!stream.write(chunk)) await once(stream, 'drain');
}

async function closeStream(stream: WriteStream): Promise<void> {
  stream.end();
  await once(stream, 'finish');
}

function describeAttachment(plan: ExportModelPlan): string {
  if (plan.kind === 'TENANT') return 'L’agence elle-même';
  if (plan.kind === 'USER') return 'Comptes membres ou clients de l’agence';
  if (plan.kind === 'DIRECT') return `Direct (${plan.path[0]})`;
  return `Par relation : ${plan.path.join(' → ')}`;
}

/**
 * Valeur ecrite dans le CSV. Un chemin absolu du serveur qui designe un
 * fichier interne devient son nom dans l'archive (`fichiers/...`) ou sa forme
 * relative (`uploads/...`) ; dans un champ de chemin serveur connu, un chemin
 * absolu non reconnu est vide plutot qu'expose.
 */
function cellValue(model: string, field: string, value: unknown, collector: FileReferenceCollector): unknown {
  if (typeof value !== 'string' || !ABSOLUTE_PATH.test(value.trim()) || value.trim().startsWith('/uploads/')) {
    return value;
  }
  const reference = parseFileReference(value);
  if (reference?.absolute) return collector.archiveNameOf(value) ?? portableReference(reference);
  return SERVER_PATH_FIELDS[model]?.includes(field) ? '' : value;
}

/** Identifiants des biens, coproprietes et penalites de l'agence (dossiers de depot). */
async function loadOwnedIds(input: BuildArchiveInput, plans: ExportModelPlan[]): Promise<OwnedIds> {
  const owned: OwnedIds = { Property: new Set(), Syndicate: new Set(), RentalPenalty: new Set() };
  for (const model of OWNER_MODELS) {
    const plan = plans.find(p => p.model === model);
    const delegate = plan && input.db[plan.delegate];
    if (!plan || !delegate) continue;
    const where = buildTenantWhere(plan, input.tenant.id);
    let cursor: unknown;
    for (;;) {
      const page = await delegate.findMany({
        where: cursor === undefined ? where : { AND: [where, { [plan.idField]: { gt: cursor } }] },
        select: { [plan.idField]: true },
        orderBy: { [plan.idField]: 'asc' },
        take: 5000
      });
      for (const row of page) owned[model].add(String(row[plan.idField]));
      if (page.length < 5000) break;
      cursor = page[page.length - 1][plan.idField];
    }
  }
  return owned;
}

async function statfsFreeBytes(dir: string): Promise<number> {
  const stats = await fs.statfs(dir);
  return Number(stats.bavail) * Number(stats.bsize);
}

/** Echoue proprement s'il manque au moins deux fois la taille des fichiers a joindre. */
async function assertDiskSpace(input: BuildArchiveInput, fileBytes: number): Promise<void> {
  const dir = path.dirname(input.archivePath);
  const available = await (input.freeSpaceBytes ?? statfsFreeBytes)(dir);
  const required = 2 * fileBytes;
  if (available < required) throw new InsufficientDiskSpaceError(required, available);
}

/** Ecrit `data/<Modele>.csv` et renvoie le nombre de lignes. */
async function exportModel(
  input: BuildArchiveInput,
  plan: ExportModelPlan,
  model: DmmfModel,
  collector: FileReferenceCollector,
  csvPath: string
): Promise<number> {
  const fields = exportableFields(model);
  if (!fields.includes(plan.idField)) fields.unshift(plan.idField);
  const select = Object.fromEntries(fields.map(name => [name, true]));
  const where = buildTenantWhere(plan, input.tenant.id);
  const delegate = input.db[plan.delegate];
  if (!delegate) throw new Error(`Délégué Prisma introuvable pour ${plan.model}.`);

  const stream = createWriteStream(csvPath, { encoding: 'utf8' });
  let count = 0;
  try {
    await write(stream, CSV_BOM + csvLine(fields));
    let cursor: unknown;
    for (;;) {
      const page = await delegate.findMany({
        where: cursor === undefined ? where : { AND: [where, { [plan.idField]: { gt: cursor } }] },
        select,
        orderBy: { [plan.idField]: 'asc' },
        take: input.batchSize ?? DEFAULT_BATCH_SIZE
      });
      if (page.length === 0) break;
      let chunk = '';
      for (const row of page) {
        for (const name of fields) await collector.inspectField(name, row[name]);
        chunk += csvLine(fields.map(name => cellValue(plan.model, name, row[name], collector)));
      }
      await write(stream, chunk);
      count += page.length;
      cursor = page[page.length - 1][plan.idField];
      if (page.length < (input.batchSize ?? DEFAULT_BATCH_SIZE)) break;
    }
  } finally {
    await closeStream(stream);
  }
  return count;
}

async function zipArchive(
  target: string,
  entries: { data: Array<{ name: string; path: string }>; buffers: Array<{ name: string; content: Buffer | string }> },
  collector: FileReferenceCollector
): Promise<void> {
  const output = createWriteStream(target);
  const archive = archiver('zip', { zlib: { level: 6 } });
  const closed = once(output, 'close');
  const failed = new Promise<never>((_resolve, reject) => {
    archive.on('error', reject);
    output.on('error', reject);
  });
  archive.pipe(output);
  for (const entry of entries.buffers) archive.append(entry.content, { name: entry.name });
  for (const entry of entries.data) archive.file(entry.path, { name: entry.name });
  for (const file of collector.files.values()) archive.file(file.absolutePath, { name: file.archiveName });
  await Promise.race([archive.finalize().then(() => closed), failed]);
}

export async function buildTenantArchive(input: BuildArchiveInput): Promise<BuildArchiveResult> {
  const now = input.now ?? new Date();
  const models = input.models ?? schemaModels();
  const byName = new Map(models.map(m => [m.name, m]));
  const { plans, excluded, unclassified } = classifyModels(models);
  const dataDir = path.join(input.stagingDir, 'data');
  const partial = `${input.archivePath}.part`;

  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(path.dirname(input.archivePath), { recursive: true });
  try {
    const owned = await loadOwnedIds(input, plans);
    const collector = new FileReferenceCollector(input.tenant.id, input.roots, owned, input.fileLimits);
    const lines: SummaryModelLine[] = [];
    const data: Array<{ name: string; path: string }> = [];
    for (const plan of plans) {
      const csvFile = `data/${plan.model}.csv`;
      const csvPath = path.join(dataDir, `${plan.model}.csv`);
      const rowCount = await exportModel(input, plan, byName.get(plan.model) as DmmfModel, collector, csvPath);
      lines.push({ model: plan.model, csvFile, rowCount, attachment: describeAttachment(plan) });
      data.push({ name: csvFile, path: csvPath });
    }

    const rowCount = lines.reduce((sum, line) => sum + line.rowCount, 0);
    const manifest = {
      format: 'immotopia-export-agence',
      formatVersion: 1,
      generatedAt: now.toISOString(),
      exportId: input.exportId,
      tenant: input.tenant,
      schemaVersion: input.schemaVersion,
      totals: {
        models: lines.length,
        rows: rowCount,
        files: collector.files.size,
        fileBytes: collector.totalBytes,
        missingFiles: collector.missingCount,
        refusedFiles: collector.refusedCount
      },
      models: lines.map(({ model, csvFile, rowCount: rows, attachment }) => ({ model, csvFile, rows, attachment })),
      excludedModels: excluded,
      unclassifiedModels: unclassified,
      missingFiles: collector.missing,
      refusedFiles: collector.refused
    };
    const workbook = await buildSummaryWorkbook({
      tenantName: input.tenant.name,
      generatedAt: now,
      schemaVersion: input.schemaVersion,
      models: lines,
      fileCount: collector.files.size,
      missingFileCount: collector.missingCount
    });

    // Taille des fichiers connue apres le passage sur les donnees, avant
    // l'assemblage du ZIP (la phase lourde) : on echoue ici s'il ne tiendrait pas.
    await assertDiskSpace(input, collector.totalBytes);
    await zipArchive(
      partial,
      {
        data,
        buffers: [
          { name: 'manifest.json', content: JSON.stringify(manifest, null, 2) },
          { name: 'recapitulatif.xlsx', content: workbook }
        ]
      },
      collector
    );
    await fs.rename(partial, input.archivePath);
    const stat = await fs.stat(input.archivePath);

    return {
      sizeBytes: stat.size,
      modelCount: lines.length,
      rowCount,
      fileCount: collector.files.size,
      missingFileCount: collector.missingCount,
      refusedFileCount: collector.refusedCount,
      unclassified
    };
  } finally {
    await fs.rm(input.stagingDir, { recursive: true, force: true });
    await fs.rm(partial, { force: true });
  }
}
