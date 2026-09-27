import archiver from 'archiver';
import { createWriteStream, promises as fs, type WriteStream } from 'fs';
import { once } from 'events';
import * as path from 'path';
import { buildTenantWhere, classifyModels, schemaModels, type DmmfModel, type ExportModelPlan } from './model-registry';
import { exportableFields } from './sensitive-fields';
import { CSV_BOM, csvLine } from './csv';
import { FileReferenceCollector, type FileRoots } from './file-references';
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
}

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
        chunk += csvLine(fields.map(name => row[name]));
        for (const name of fields) await collector.inspectField(name, row[name]);
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
  const collector = new FileReferenceCollector(input.tenant.id, input.roots);
  const dataDir = path.join(input.stagingDir, 'data');
  const partial = `${input.archivePath}.part`;

  await fs.mkdir(dataDir, { recursive: true });
  try {
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

    await fs.mkdir(path.dirname(input.archivePath), { recursive: true });
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
