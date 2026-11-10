/**
 * Inventaire LECTURE SEULE des médias publics suspects.
 *
 * Avant le correctif SUR-01, l'extension d'un média de bien venait du nom
 * fourni par le client (`originalname`) : un `.html` ou un `.svg` pouvait être
 * déposé sous `uploads/properties/<propertyId>/` et servi dans l'origine de
 * l'application. Ce script liste les fichiers dont l'extension n'est pas dans la
 * liste blanche (ou absente), avec leur taille et le type réel détecté par les
 * octets magiques, sous `uploads/properties/<propertyId>/`,
 * `uploads/properties/agency-logos/<tenantId>/` et `uploads/whatsapp/**`
 * (récursif).
 *
 * Il n'écrit, ne supprime et ne déplace RIEN. Le sous-dossier privé
 * `documents/` est ignoré. Un fichier listé est désormais refusé en 404 par
 * `/uploads` (garde `uploads-access-middleware`).
 *
 * Usage (depuis packages/api) :
 *   npm run ops:list-suspect-uploads
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { env } from '../config/env';
import { getUploadsRoot } from '../utils/project-root';
import { detectUploadKind } from '../utils/file-signature';

/** Même liste blanche que la garde de `/uploads`. */
const PUBLIC_EXTENSION = /\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i;
/** Octets lus pour reconnaître le type réel (suffisant pour toutes les signatures). */
const SNIFF_BYTES = 4096;

export interface SuspectFile {
  /** Chemin relatif à la racine des dépôts, séparateurs `/`. */
  relativePath: string;
  size: number;
  /** Type réel d'après les octets magiques, ou `inconnu`. */
  detectedKind: string;
}

/** Dossier absent (ENOENT) : silencieux. Toute autre erreur est signalée : un dossier illisible ne doit pas donner un rapport vide en silence. */
export async function readDirSafe(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.warn(
        `Dossier illisible, ignoré : ${dir} (${(error as NodeJS.ErrnoException)?.code ?? ''} ${(error as Error)?.message ?? String(error)})`
      );
    }
    return [];
  }
}

async function inspect(root: string, fullPath: string): Promise<SuspectFile> {
  const stat = await fs.stat(fullPath);
  const handle = await fs.open(fullPath, 'r');
  try {
    const buffer = Buffer.alloc(Math.min(SNIFF_BYTES, stat.size));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const kind = detectUploadKind(buffer.subarray(0, bytesRead));
    return {
      relativePath: path.relative(root, fullPath).split(path.sep).join('/'),
      size: stat.size,
      detectedKind: kind ?? 'inconnu'
    };
  } finally {
    await handle.close();
  }
}

/** Fichiers d'un dossier (un seul niveau) dont l'extension est hors liste blanche. */
async function suspectsIn(root: string, dir: string, out: SuspectFile[]): Promise<void> {
  for (const entry of await readDirSafe(dir)) {
    if (!entry.isFile() || PUBLIC_EXTENSION.test(entry.name)) continue;
    out.push(await inspect(root, path.join(dir, entry.name)));
  }
}

/** Fichiers de tout l'arbre d'un dossier (récursif) dont l'extension est hors liste blanche. */
async function suspectsInTree(root: string, dir: string, out: SuspectFile[]): Promise<void> {
  for (const entry of await readDirSafe(dir)) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await suspectsInTree(root, full, out);
    else if (entry.isFile() && !PUBLIC_EXTENSION.test(entry.name)) out.push(await inspect(root, full));
  }
}

/**
 * Parcourt `<root>/properties/<propertyId>/`, `properties/agency-logos/<tenantId>/`
 * et `whatsapp/**` (récursif).
 */
export async function listSuspectFiles(root: string): Promise<SuspectFile[]> {
  const propertiesDir = path.join(root, 'properties');
  const suspects: SuspectFile[] = [];

  for (const entry of await readDirSafe(propertiesDir)) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(propertiesDir, entry.name);
    if (entry.name === 'agency-logos') {
      for (const tenantDir of await readDirSafe(dir)) {
        if (tenantDir.isDirectory()) await suspectsIn(root, path.join(dir, tenantDir.name), suspects);
      }
    } else {
      // `documents/` (privé) est un sous-dossier : seuls les fichiers directs comptent.
      await suspectsIn(root, dir, suspects);
    }
  }

  await suspectsInTree(root, path.join(root, 'whatsapp'), suspects);

  return suspects.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function formatReport(files: SuspectFile[]): string[] {
  const lines = files.map(f => `${f.relativePath}\t${f.size} octets\ttype réel : ${f.detectedKind}`);
  lines.push(`Total : ${files.length} fichier(s) suspect(s)`);
  return lines;
}

async function main(): Promise<void> {
  const root = getUploadsRoot(env.UPLOADS_DIR);
  const files = await listSuspectFiles(root);
  for (const line of formatReport(files)) console.log(line);
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
