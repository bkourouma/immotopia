import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Fichiers joints a l'export complet (lot S7).
 *
 * Un fichier n'entre dans l'archive que si TOUTES ces conditions tiennent :
 *
 * 1. Sa reference vient d'une ligne de CETTE agence (le collecteur n'est
 *    alimente que par les lignes deja filtrees par agence), et d'un champ dont
 *    le nom designe un fichier (`url`, `path`, `file`, `photo`, `logo`…) : un
 *    texte libre (`description`, `notes`) ne peut pas faire embarquer un
 *    fichier en y recopiant un chemin.
 * 2. La valeur ENTIERE est un chemin `uploads/...` ou
 *    `assets/generated_documents/...` (avec ou sans `/` ou racine absolue
 *    devant) ; les liens `http(s)` sont ignores.
 * 3. Le chemin resolu, liens symboliques compris (`realpath`), reste sous une
 *    racine autorisee : pas de `..`, pas d'octet nul, pas d'evasion.
 * 4. Sous `generated_documents`, le premier segment doit etre l'identifiant
 *    de l'agence (arborescence `<tenantId>/<type>/<annee>/<mois>`).
 * 5. Rien sous `uploads/exports/` : une archive n'en embarque jamais une autre.
 *
 * Une reference valide dont le fichier est absent est comptee comme
 * manquante ; une reference refusee (evasion, autre agence) est comptee a part.
 */

export interface FileRoots {
  /** Racines des fichiers deposes (`getUploadsRoot`, puis `<racine>/uploads`). */
  uploads: string[];
  /** `<racine>/assets/generated_documents`. */
  generated: string;
}

export interface CollectedFile {
  /** Chemin dans l'archive, toujours sous `fichiers/`. */
  archiveName: string;
  absolutePath: string;
  sizeBytes: number;
}

const FILE_FIELD_PATTERN =
  /(url|path|file|photo|image|logo|avatar|attachment|document|proof|media|scan|picture|signature)/i;
const MAX_REFERENCE_LENGTH = 1024;
const MAX_JSON_DEPTH = 6;
const MAX_LISTED = 1000;

export function isFileFieldName(name: string): boolean {
  return FILE_FIELD_PATTERN.test(name);
}

interface ParsedReference {
  kind: 'uploads' | 'generated';
  relative: string;
}

/** Reconnait une reference de fichier, ou `null` si la valeur n'en est pas une. */
export function parseFileReference(raw: string): ParsedReference | null {
  const value = raw.trim();
  if (value.length < 3 || value.length > MAX_REFERENCE_LENGTH) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /[\r\n]/.test(value)) return null;
  const normalized = value.replace(/\\/g, '/');
  const generated = normalized.match(/(?:^|\/)assets\/generated_documents\/(.+)$/);
  if (generated) return { kind: 'generated', relative: generated[1] };
  const uploads = normalized.match(/(?:^|\/)uploads\/(.+)$/);
  if (uploads) return { kind: 'uploads', relative: uploads[1] };
  return null;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function hasUnsafeSegment(relative: string): boolean {
  return relative.includes('\0') || relative.split('/').some(segment => segment === '..' || segment === '.');
}

async function realpathOrNull(target: string): Promise<string | null> {
  try {
    return await fs.realpath(target);
  } catch {
    return null;
  }
}

export class FileReferenceCollector {
  readonly files = new Map<string, CollectedFile>();
  /** References valides dont le fichier est absent (liste bornee, compte exact). */
  readonly missing: string[] = [];
  missingCount = 0;
  /** References refusees : evasion de racine, autre agence, archive d'export. */
  readonly refused: string[] = [];
  refusedCount = 0;
  private readonly seen = new Set<string>();

  constructor(
    private readonly tenantId: string,
    private readonly roots: FileRoots
  ) {}

  /** Parcourt la valeur d'un champ (texte, liste, JSON) d'une ligne de l'agence. */
  async inspectField(fieldName: string, value: unknown): Promise<void> {
    if (!isFileFieldName(fieldName)) return;
    await this.inspectValue(value, 0);
  }

  private async inspectValue(value: unknown, depth: number): Promise<void> {
    if (typeof value === 'string') {
      await this.inspectString(value);
      return;
    }
    if (depth >= MAX_JSON_DEPTH || value === null || typeof value !== 'object' || value instanceof Date) return;
    const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
    for (const child of children) await this.inspectValue(child, depth + 1);
  }

  private async inspectString(raw: string): Promise<void> {
    const reference = parseFileReference(raw);
    if (!reference) return;
    const key = `${reference.kind}:${reference.relative}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);

    if (hasUnsafeSegment(reference.relative) || !this.allowedForTenant(reference)) {
      this.noteRefused(key);
      return;
    }
    const resolved = await this.resolve(reference);
    if (resolved === 'refused') this.noteRefused(key);
    else if (!resolved) {
      this.missingCount += 1;
      if (this.missing.length < MAX_LISTED) this.missing.push(key);
    } else this.files.set(resolved.archiveName, resolved);
  }

  private allowedForTenant(reference: ParsedReference): boolean {
    const first = reference.relative.split('/')[0];
    if (reference.kind === 'generated') return first === this.tenantId;
    return first !== 'exports';
  }

  private async resolve(reference: ParsedReference): Promise<CollectedFile | 'refused' | null> {
    const roots = reference.kind === 'generated' ? [this.roots.generated] : this.roots.uploads;
    for (const root of roots) {
      const candidate = path.resolve(root, ...reference.relative.split('/'));
      if (!isInside(path.resolve(root), candidate)) return 'refused';
      const real = await realpathOrNull(candidate);
      if (!real) continue;
      const realRoot = (await realpathOrNull(root)) ?? path.resolve(root);
      if (!isInside(realRoot, real)) return 'refused';
      const stat = await fs.stat(real);
      if (!stat.isFile()) continue;
      const prefix = reference.kind === 'generated' ? 'generated_documents' : 'uploads';
      return { archiveName: `fichiers/${prefix}/${reference.relative}`, absolutePath: real, sizeBytes: stat.size };
    }
    return null;
  }

  private noteRefused(key: string): void {
    this.refusedCount += 1;
    if (this.refused.length < MAX_LISTED) this.refused.push(key);
  }
}
