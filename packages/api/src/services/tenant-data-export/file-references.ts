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
 *    texte libre (`description`, `notes`) n'est jamais suivi.
 * 2. La valeur est un chemin interne : `/uploads/...`, `uploads/...`,
 *    `assets/generated_documents/...`, `assets/modeles_documents/...`, ou un
 *    chemin absolu du serveur qui contient l'un de ces dossiers (ecrit tel
 *    quel par les services de documents et d'etats des lieux). Toute valeur
 *    qui commence par un schema (`http:`, `file:`, `javascript:`…) est
 *    ignoree — une lettre de lecteur Windows (`D:\`) n'en est pas un.
 * 3. Le DOSSIER prouve l'appartenance a l'agence (`UPLOAD_FOLDER_RULES`) :
 *    soit il porte l'identifiant de l'agence (`maintenance/<tenantId>/...`),
 *    soit l'identifiant d'un objet de l'agence (`properties/<propertyId>/...`,
 *    ensembles d'identifiants precharges). Tout autre dossier est refuse.
 *    Un chemin saisi a la main qui designerait le fichier d'une autre agence
 *    est donc refuse, meme s'il est lu sur une ligne de cette agence.
 * 4. Le chemin reel (`realpath`, liens symboliques compris) reste sous sa
 *    racine et hors de la racine des exports ; pas de `..` ni d'octet nul.
 * 5. Plafonds : `MAX_FILES` fichiers et `MAX_TOTAL_BYTES` octets cumules ; au
 *    dela, les fichiers sont refuses (et comptes).
 *
 * Une reference valide dont le fichier est absent est comptee comme
 * manquante ; une reference refusee est comptee a part.
 */

export interface FileRoots {
  /** Racines des fichiers deposes (`getUploadsRoot`, puis `<racine>/uploads`). */
  uploads: string[];
  /** `<racine>/assets/generated_documents`. */
  generated: string;
  /** `<racine>/assets/modeles_documents` (modeles DOCX importes par l'agence). */
  templates: string;
  /** Racine des archives d'export : jamais embarquee. */
  exports: string;
}

/** Modeles dont les identifiants apparaissent dans un chemin de depot. */
export type OwnerModel = 'Property' | 'Syndicate' | 'RentalPenalty';
export const OWNER_MODELS: readonly OwnerModel[] = ['Property', 'Syndicate', 'RentalPenalty'];
export type OwnedIds = Record<OwnerModel, Set<string>>;

export interface CollectedFile {
  /** Chemin dans l'archive, toujours sous `fichiers/`. */
  archiveName: string;
  absolutePath: string;
  sizeBytes: number;
}

export type ReferenceKind = 'uploads' | 'generated' | 'templates';

export interface ParsedReference {
  kind: ReferenceKind;
  /** Chemin relatif a la racine du type, separateurs `/`. */
  relative: string;
  /** Vrai si la valeur stockee etait un chemin absolu du serveur. */
  absolute: boolean;
}

/**
 * Dossiers de `uploads/` reellement ecrits par le code, et ce qui y prouve
 * l'agence. Recenses depuis les services d'upload :
 * maintenance-attachment-service, tenant-portal-service (preuves de
 * paiement), lease-inspections/service, whatsapp-group-broadcast-service,
 * tenant-service (logos), platform-payment-service (justificatifs de
 * reglement d'abonnement), property-media/document-service,
 * syndics/document-files, rental-penalty-service.
 * L'ordre compte : `properties/agency-logos` avant `properties`.
 */
export const UPLOAD_FOLDER_RULES: ReadonlyArray<{ prefix: string[]; owner: 'tenant' | OwnerModel }> = [
  { prefix: ['maintenance'], owner: 'tenant' },
  { prefix: ['portal', 'payments'], owner: 'tenant' },
  { prefix: ['lease-inspections'], owner: 'tenant' },
  { prefix: ['whatsapp', 'group-broadcast'], owner: 'tenant' },
  { prefix: ['properties', 'agency-logos'], owner: 'tenant' },
  { prefix: ['platform', 'invoice-payments'], owner: 'tenant' },
  { prefix: ['properties'], owner: 'Property' },
  { prefix: ['syndics'], owner: 'Syndicate' },
  { prefix: ['rental', 'penalties'], owner: 'RentalPenalty' }
];

/**
 * Justificatifs de reglement d'abonnement : stockes RELATIFS a la racine des
 * depots, sans `uploads/` devant (`platform/invoice-payments/<tenantId>/...`).
 */
const BARE_UPLOAD_PREFIXES = ['platform/invoice-payments/'];

export const MAX_FILES = 200_000;
export const MAX_TOTAL_BYTES = 20 * 1024 ** 3;

const FILE_FIELD_PATTERN =
  /(url|path|file|photo|image|logo|avatar|attachment|document|proof|media|scan|picture|signature)/i;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const DRIVE_PATTERN = /^[a-z]:\//i;
const MAX_REFERENCE_LENGTH = 1024;
const MAX_JSON_DEPTH = 6;
const MAX_LISTED = 1000;

const MARKERS: ReadonlyArray<{ marker: string; kind: ReferenceKind }> = [
  { marker: 'assets/generated_documents/', kind: 'generated' },
  { marker: 'assets/modeles_documents/', kind: 'templates' },
  { marker: 'uploads/', kind: 'uploads' }
];

export function isFileFieldName(name: string): boolean {
  return FILE_FIELD_PATTERN.test(name);
}

/** Reconnait une reference de fichier interne, ou `null`. */
export function parseFileReference(raw: string): ParsedReference | null {
  const value = raw.trim();
  if (value.length < 3 || value.length > MAX_REFERENCE_LENGTH || /[\r\n]/.test(value)) return null;
  const normalized = value.replace(/\\/g, '/');
  const drive = DRIVE_PATTERN.test(normalized);
  if (!drive && SCHEME_PATTERN.test(value)) return null;

  if (drive || normalized.startsWith('/')) {
    const body = normalized.startsWith('/uploads/') ? normalized.slice(1) : normalized;
    for (const { marker, kind } of MARKERS) {
      if (body.startsWith(marker)) return { kind, relative: body.slice(marker.length), absolute: false };
      const index = body.indexOf(`/${marker}`);
      if (index >= 0) return { kind, relative: body.slice(index + marker.length + 1), absolute: true };
    }
    return null;
  }
  for (const { marker, kind } of MARKERS) {
    if (normalized.startsWith(marker)) return { kind, relative: normalized.slice(marker.length), absolute: false };
  }
  if (BARE_UPLOAD_PREFIXES.some(prefix => normalized.startsWith(prefix))) {
    return { kind: 'uploads', relative: normalized, absolute: false };
  }
  return null;
}

/** Forme relative, sans chemin serveur, d'une reference (pour le CSV). */
export function portableReference(reference: ParsedReference): string {
  const prefix = { uploads: 'uploads', generated: 'assets/generated_documents', templates: 'assets/modeles_documents' };
  return `${prefix[reference.kind]}/${reference.relative}`;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function hasUnsafeSegment(relative: string): boolean {
  return (
    relative.includes('\0') ||
    relative.split('/').some(segment => segment === '..' || segment === '.' || segment === '')
  );
}

/** `exports`, `EXPORTS`, `exports.` ou `exports ` : Windows les confond. */
function isExportsSegment(segment: string): boolean {
  return segment.replace(/[. ]+$/, '').toLowerCase() === 'exports';
}

async function realpathOrNull(target: string): Promise<string | null> {
  try {
    return await fs.realpath(target);
  } catch {
    return null;
  }
}

function dedupeKey(real: string): string {
  return process.platform === 'win32' ? real.toLowerCase() : real;
}

export class FileReferenceCollector {
  readonly files = new Map<string, CollectedFile>();
  /** References valides dont le fichier est absent (liste bornee, compte exact). */
  readonly missing: string[] = [];
  missingCount = 0;
  /** References refusees : dossier non prouve, autre agence, evasion, plafond. */
  readonly refused: string[] = [];
  refusedCount = 0;
  totalBytes = 0;
  private readonly seen = new Set<string>();
  /** realpath (normalise) → nom dans l'archive : un fichier n'y entre qu'une fois. */
  private readonly realSeen = new Map<string, string>();
  private realRoots: Map<string, string> | null = null;

  constructor(
    private readonly tenantId: string,
    private readonly roots: FileRoots,
    private readonly ownedIds: OwnedIds = { Property: new Set(), Syndicate: new Set(), RentalPenalty: new Set() },
    private readonly limits: { maxFiles: number; maxTotalBytes: number } = {
      maxFiles: MAX_FILES,
      maxTotalBytes: MAX_TOTAL_BYTES
    }
  ) {}

  /** Parcourt la valeur d'un champ (texte, liste, JSON) d'une ligne de l'agence. */
  async inspectField(fieldName: string, value: unknown): Promise<void> {
    if (!isFileFieldName(fieldName)) return;
    await this.inspectValue(value, 0);
  }

  /** Chemin sous `fichiers/` si la valeur designe un fichier embarque. */
  archiveNameOf(value: string): string | null {
    const reference = parseFileReference(value);
    return reference ? (this.byReference.get(`${reference.kind}:${reference.relative}`) ?? null) : null;
  }

  private readonly byReference = new Map<string, string>();

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
    else if (typeof resolved === 'string') this.byReference.set(key, resolved.slice('duplicate:'.length));
    else if (!resolved) {
      this.missingCount += 1;
      if (this.missing.length < MAX_LISTED) this.missing.push(key);
    } else if (
      this.files.size >= this.limits.maxFiles ||
      this.totalBytes + resolved.sizeBytes > this.limits.maxTotalBytes
    ) {
      this.noteRefused(`${key} (plafond)`);
    } else {
      this.files.set(resolved.archiveName, resolved);
      this.realSeen.set(dedupeKey(resolved.absolutePath), resolved.archiveName);
      this.byReference.set(key, resolved.archiveName);
      this.totalBytes += resolved.sizeBytes;
    }
  }

  /** Regle de dossier : l'agence doit etre prouvee par le chemin. */
  allowedForTenant(reference: ParsedReference): boolean {
    const segments = reference.relative.split('/');
    if (segments.some(isExportsSegment)) return false;
    if (reference.kind === 'generated') return segments.length > 1 && segments[0] === this.tenantId;
    if (reference.kind === 'templates') {
      return segments.length > 2 && segments[0] === 'tenants' && segments[1] === this.tenantId;
    }
    const rule = UPLOAD_FOLDER_RULES.find(r => r.prefix.every((part, i) => segments[i] === part));
    if (!rule) return false;
    const owner = segments[rule.prefix.length];
    if (!owner || segments.length <= rule.prefix.length + 1) return false;
    return rule.owner === 'tenant' ? owner === this.tenantId : this.ownedIds[rule.owner].has(owner);
  }

  private async realRootOf(root: string): Promise<string> {
    if (!this.realRoots) this.realRoots = new Map();
    const cached = this.realRoots.get(root);
    if (cached) return cached;
    const real = (await realpathOrNull(root)) ?? path.resolve(root);
    this.realRoots.set(root, real);
    return real;
  }

  private async resolve(reference: ParsedReference): Promise<CollectedFile | 'refused' | `duplicate:${string}` | null> {
    const roots =
      reference.kind === 'generated'
        ? [this.roots.generated]
        : reference.kind === 'templates'
          ? [this.roots.templates]
          : this.roots.uploads;
    const exportsReal = await this.realRootOf(this.roots.exports);
    for (const root of roots) {
      const candidate = path.resolve(root, ...reference.relative.split('/'));
      if (!isInside(path.resolve(root), candidate)) return 'refused';
      const real = await realpathOrNull(candidate);
      if (!real) continue;
      const realRoot = await this.realRootOf(root);
      if (!isInside(realRoot, real) || isInside(exportsReal, real)) return 'refused';
      const stat = await fs.stat(real);
      if (!stat.isFile()) continue;
      const dedupe = dedupeKey(real);
      const known = this.realSeen.get(dedupe);
      if (known) return `duplicate:${known}`;
      const relative = path.relative(realRoot, real).split(path.sep).join('/');
      const prefix = { uploads: 'uploads', generated: 'generated_documents', templates: 'modeles_documents' }[
        reference.kind
      ];
      const normalized = process.platform === 'win32' ? relative.toLowerCase() : relative;
      const archiveName = `fichiers/${prefix}/${normalized}`;
      return { archiveName, absolutePath: real, sizeBytes: stat.size };
    }
    return null;
  }

  private noteRefused(key: string): void {
    this.refusedCount += 1;
    if (this.refused.length < MAX_LISTED) this.refused.push(key);
  }
}
