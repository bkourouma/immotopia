import { detectMandateScanKind } from '../lib/direct-debit/mandate-files';

export type DocumentKind = 'pdf' | 'png' | 'jpg' | 'doc' | 'docx';

/**
 * Type réel d'un justificatif d'après ses octets magiques (jamais d'après le
 * nom ni le type déclaré). PDF, PNG et JPEG réutilisent le lecteur des scans
 * de mandat ; DOC (conteneur OLE) et DOCX (archive ZIP) s'y ajoutent.
 */
export function detectDocumentKind(buffer: Buffer): DocumentKind | null {
  const image = detectMandateScanKind(buffer);
  if (image) return image;
  const ole = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  if (buffer.length >= ole.length && ole.every((b, i) => buffer[i] === b)) return 'doc';
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return 'docx';
  }
  return null;
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
