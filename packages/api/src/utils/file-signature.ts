import { detectMandateScanKind } from '../lib/direct-debit/mandate-files';
import { BadRequestError } from '../middleware/error-middleware';
import { t } from '../i18n';

export type DocumentKind = 'pdf' | 'png' | 'jpg' | 'doc' | 'docx';

/**
 * Type réel d'un justificatif d'après ses octets magiques (jamais d'après le
 * nom ni le type déclaré). PDF, PNG et JPEG réutilisent le lecteur des scans
 * de mandat ; DOC (conteneur OLE) et DOCX (archive ZIP) s'y ajoutent.
 */
export function detectDocumentKind(buffer: Buffer): DocumentKind | null {
  const strict = detectStrictDocumentKind(buffer);
  if (strict) return strict;
  // PDF avec bourrage : seulement si aucune signature stricte (WebP, vidéo, TIFF, DWG) ne correspond.
  return detectUploadKind(buffer) === 'pdf' ? 'pdf' : null;
}

/** En-tête PDF valide : `%PDF-` suivi d'une version `\d.\d` (1.7, 2.0…). */
const PDF_HEADER = /%PDF-\d\.\d/;

/**
 * PDF dont l'en-tête n'est pas à l'offset 0 : les lecteurs tolèrent du bourrage
 * (BOM, sauts de ligne) dans les 1024 premiers octets. Les octets qui précèdent
 * ne doivent pas contenir `<` : un HTML qui cite `%PDF-1.4` n'est pas un PDF.
 * À tenter EN DERNIER, après toutes les signatures strictes (WebP, MP4, TIFF…
 * peuvent porter `%PDF-` dans leurs métadonnées).
 */
function hasPaddedPdfHeader(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 1024 + 8).toString('latin1');
  const match = PDF_HEADER.exec(head);
  if (!match || match.index > 1024) return false;
  return !head.slice(0, match.index).includes('<');
}

/** Types de justificatif reconnus sans tolérance de bourrage PDF. */
function detectStrictDocumentKind(buffer: Buffer): DocumentKind | null {
  const image = detectMandateScanKind(buffer);
  if (image === 'pdf') return /^%PDF-\d\.\d/.test(buffer.subarray(0, 8).toString('latin1')) ? 'pdf' : null;
  if (image) return image;
  const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  // DOC : en-tête OLE ET flux « WordDocument » (UTF-16LE) : un autre fichier OLE
  // (Excel, PowerPoint…) n'est pas un document Word.
  if (
    buffer.length >= ole.length &&
    ole.every((b, i) => buffer[i] === b) &&
    buffer.includes(Buffer.from('WordDocument', 'utf16le'))
  ) {
    return 'doc';
  }
  // DOCX : archive ZIP ET `[Content_Types].xml` ET une entrée `word/` : un ZIP
  // quelconque n'est pas un document Word. Les noms d'entrée sont en clair dans
  // l'archive (en-têtes locaux et répertoire central).
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04 &&
    buffer.includes(Buffer.from('[Content_Types].xml', 'latin1')) &&
    buffer.includes(Buffer.from('word/', 'latin1'))
  ) {
    return 'docx';
  }
  return null;
}

/** Extension (avec le point) d'un type détecté par signature. */
export function extensionForKind(kind: UploadKind): string {
  return kind === 'jpg' ? '.jpg' : `.${kind}`;
}

export type ImageKind = 'png' | 'jpg' | 'webp';

/** Image JPEG, PNG ou WebP (`RIFF....WEBP`) d'après ses octets magiques, sinon `null`. */
export function detectImageKind(buffer: Buffer): ImageKind | null {
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  const kind = detectMandateScanKind(buffer);
  return kind === 'png' || kind === 'jpg' ? kind : null;
}

const DECLARED_KIND: Record<string, DocumentKind> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png'
};

/** Vrai si les octets du fichier correspondent au type déclaré. */
export function contentMatchesDeclaredType(buffer: Buffer, mimetype: string): boolean {
  const attendu = DECLARED_KIND[mimetype];
  return Boolean(attendu) && detectDocumentKind(buffer) === attendu;
}

// ---------------------------------------------------------------------------
// Vidéos, TIFF, DWG : types réels des médias et plans déposés
// ---------------------------------------------------------------------------

export type VideoKind = 'mp4' | 'mov' | 'webm';

/** Marques `ftyp` d'images (HEIC, HEIF, AVIF) : jamais des vidéos acceptées. */
const IMAGE_FTYP_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevm', 'hevs', 'avif', 'avis', 'mif1', 'msf1']);
/** Premiers atomes d'un MOV QuickTime ancien (sans `ftyp`). */
const QUICKTIME_ATOMS = new Set(['moov', 'wide', 'mdat', 'free', 'skip']);

/**
 * Vidéo MP4 / QuickTime (boîte ISO `ftyp` aux octets 4-8, marque aux octets
 * 8-12 : `qt  ` pour QuickTime) ou WebM (en-tête EBML `1A 45 DF A3` dont le
 * DocType est `webm` ; un conteneur Matroska n'est pas accepté).
 */
export function detectVideoKind(buffer: Buffer): VideoKind | null {
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('latin1');
    // HEIC/HEIF/AVIF partagent la boîte `ftyp` mais sont des images : refusées.
    if (IMAGE_FTYP_BRANDS.has(brand)) return null;
    return brand === 'qt  ' ? 'mov' : 'mp4';
  }
  // MOV ancien sans `ftyp` : premier atome QuickTime (taille > 0 puis type).
  if (
    buffer.length >= 8 &&
    buffer.readUInt32BE(0) > 0 &&
    QUICKTIME_ATOMS.has(buffer.subarray(4, 8).toString('latin1'))
  ) {
    return 'mov';
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3 &&
    buffer.subarray(0, 64).includes(Buffer.from('webm', 'latin1'))
  ) {
    return 'webm';
  }
  return null;
}

/** Type de fichier déposé reconnu par signature (document, image, vidéo, scan TIFF, plan DWG). */
export type UploadKind = DocumentKind | ImageKind | VideoKind | 'tiff' | 'dwg';

/** Types déclarés (`Content-Type` du dépôt) acceptés pour chaque type réel. */
const UPLOAD_KIND_MIME_TYPES: Record<UploadKind, readonly string[]> = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  jpg: ['image/jpeg', 'image/jpg'],
  png: ['image/png'],
  webp: ['image/webp'],
  mp4: ['video/mp4'],
  mov: ['video/quicktime'],
  webm: ['video/webm'],
  tiff: ['image/tiff'],
  dwg: ['application/dwg']
};

/** Type réel d'un fichier déposé d'après ses octets magiques, jamais d'après son nom ni son type déclaré. */
export function detectUploadKind(buffer: Buffer): UploadKind | null {
  // Signatures strictes d'abord ; le PDF avec bourrage vient en dernier.
  const document = detectStrictDocumentKind(buffer);
  if (document) return document;
  const image = detectImageKind(buffer);
  if (image) return image;
  const video = detectVideoKind(buffer);
  if (video) return video;
  if (buffer.length >= 4) {
    const tiffLittle = buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00;
    const tiffBig = buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a;
    if (tiffLittle || tiffBig) return 'tiff';
  }
  // DWG : « AC10xx » (versions 2.x à 2018).
  if (buffer.length >= 6 && buffer.subarray(0, 4).toString('latin1') === 'AC10') return 'dwg';
  return hasPaddedPdfHeader(buffer) ? 'pdf' : null;
}

export interface VerifiedUpload {
  /** Type réel, détecté dans les octets. */
  kind: UploadKind;
  /** Extension (avec le point) dérivée du type réel : à utiliser pour le nom stocké. */
  extension: string;
}

export interface AssertUploadOptions {
  /** Types réels acceptés ; absent = tout type reconnu. */
  allowedKinds?: readonly UploadKind[];
  /** Message de refus (français, traduit ici) ; défaut générique. */
  message?: string;
}

const DEFAULT_MISMATCH_MESSAGE = 'Le contenu du fichier ne correspond pas à son type déclaré.';

/**
 * Refuse (400) un fichier déposé dont le contenu ne correspond pas à son type
 * déclaré, ou dont le type réel n'est pas dans la liste autorisée : un HTML,
 * un script ou un SVG déclaré `image/png` n'entre plus. Rend le type réel et
 * l'extension à stocker (jamais celle de `originalname`, fournie par le client).
 */
export function assertUploadMatchesDeclaredType(
  file: Pick<Express.Multer.File, 'buffer' | 'mimetype'>,
  options: AssertUploadOptions = {}
): VerifiedUpload {
  const reject = (): never => {
    throw new BadRequestError(t(options.message ?? DEFAULT_MISMATCH_MESSAGE));
  };
  if (!file.buffer || file.buffer.length === 0) return reject();
  const kind = detectUploadKind(file.buffer);
  if (!kind) return reject();
  if (options.allowedKinds && !options.allowedKinds.includes(kind)) return reject();
  const declared = (file.mimetype ?? '').toLowerCase();
  const accepted =
    kind === 'mp4' || kind === 'mov'
      ? [...UPLOAD_KIND_MIME_TYPES.mp4, ...UPLOAD_KIND_MIME_TYPES.mov] // les téléphones échangent .mov et .mp4
      : UPLOAD_KIND_MIME_TYPES[kind];
  if (!accepted.includes(declared)) return reject();
  return { kind, extension: extensionForKind(kind) };
}
