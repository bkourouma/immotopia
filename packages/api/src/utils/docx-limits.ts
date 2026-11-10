import * as zlib from 'zlib';
import { BadRequestError } from '../middleware/error-middleware';
import { t } from '../i18n';

/**
 * Bornes d'une archive DOCX AVANT de la confier à PizZip (audit SUR-03, bombe ZIP).
 *
 * Module volontairement sans dépendance Prisma ni base : il est chargé par la
 * conversion PDF (`lib/pdf-convert`), dont les tests remplacent tout
 * `child_process`.
 *
 * Pourquoi ne pas se fier aux tailles déclarées : PizZip 3.2 relit TOUTES les
 * entrées du répertoire central tant que la signature `PK\x01\x02` revient (le
 * nombre annoncé par la fin de répertoire n'est qu'indicatif), et ne compare la
 * taille décompressée à la taille annoncée qu'APRÈS avoir tout décompressé avec
 * pako, sans plafond. Une taille mensongère n'empêche donc pas l'allocation.
 * Ici, chaque entrée est réellement décompressée (puis jetée) avec un plafond
 * de sortie : aucune allocation ne dépasse la taille annoncée, elle-même bornée.
 */

/** Nombre maximal d'entrées d'une archive DOCX (un vrai modèle en compte quelques dizaines). */
export const DOCX_MAX_ENTRIES = 2000;
/** Taille décompressée maximale cumulée d'une archive DOCX. */
export const DOCX_MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
/** Taille décompressée maximale d'une seule entrée. */
export const DOCX_MAX_ENTRY_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

export interface DocxLimits {
  maxEntries?: number;
  maxUncompressedBytes?: number;
  maxEntryUncompressedBytes?: number;
}

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE_BYTES = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const EOCD_SIZE = 22;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
const MAX_16 = 0xffff;
const MAX_32 = 0xffffffff;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const FLAG_ENCRYPTED = 0x0001;

interface CentralEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

function invalidDocx(): never {
  throw new BadRequestError(t('Le document n’est pas un fichier Word (DOCX) valide.'));
}

function docxTooBig(): never {
  throw new BadRequestError(t('Le document Word est trop volumineux une fois décompressé.'));
}

/**
 * Lit le répertoire central comme PizZip le lira (dernière signature de fin de
 * répertoire, puis entrées tant que `PK\x01\x02` revient) et exige qu'il soit
 * exactement celui qu'annonce la fin de répertoire : même nombre d'entrées,
 * aucun octet résiduel, fin de répertoire collée au répertoire, rien après.
 */
function readCentralDirectory(
  buffer: Buffer,
  maxEntries: number
): { entries: CentralEntry[]; directoryOffset: number } {
  if (buffer.length < EOCD_SIZE || buffer.readUInt32LE(0) !== LOCAL_SIGNATURE) return invalidDocx();

  // PizZip retient la DERNIÈRE occurrence de la signature : on fait de même.
  const eocd = buffer.lastIndexOf(EOCD_SIGNATURE_BYTES);
  if (eocd < 0 || eocd + EOCD_SIZE > buffer.length) return invalidDocx();

  const diskNumber = buffer.readUInt16LE(eocd + 4);
  const directoryDisk = buffer.readUInt16LE(eocd + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocd + 8);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  const commentLength = buffer.readUInt16LE(eocd + 20);

  // ZIP64 (marqueurs 0xFFFF / 0xFFFFFFFF) : trop gros pour un modèle.
  if (
    [diskNumber, directoryDisk, entriesOnDisk, entryCount].includes(MAX_16) ||
    directorySize === MAX_32 ||
    directoryOffset === MAX_32
  ) {
    return docxTooBig();
  }
  if (entryCount > maxEntries) return docxTooBig();
  if (eocd + EOCD_SIZE + commentLength !== buffer.length) return invalidDocx();
  if (diskNumber !== 0 || directoryDisk !== 0 || entriesOnDisk !== entryCount) return invalidDocx();
  // Répertoire dans le tampon et immédiatement suivi de la fin de répertoire.
  if (directoryOffset + directorySize !== eocd) return invalidDocx();

  const entries: CentralEntry[] = [];
  let position = directoryOffset;
  while (position + 4 <= eocd && buffer.readUInt32LE(position) === CENTRAL_SIGNATURE) {
    // Plus d'entrées que n'en annonce la fin de répertoire : refus immédiat.
    if (entries.length >= entryCount) return invalidDocx();
    if (position + CENTRAL_HEADER_SIZE > eocd) return invalidDocx();
    const flags = buffer.readUInt16LE(position + 8);
    const method = buffer.readUInt16LE(position + 10);
    const compressedSize = buffer.readUInt32LE(position + 20);
    const uncompressedSize = buffer.readUInt32LE(position + 24);
    const nameLength = buffer.readUInt16LE(position + 28);
    const extraLength = buffer.readUInt16LE(position + 30);
    const commentLen = buffer.readUInt16LE(position + 32);
    const localHeaderOffset = buffer.readUInt32LE(position + 42);
    const next = position + CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLen;
    if (next > eocd) return invalidDocx();
    if (compressedSize === MAX_32 || uncompressedSize === MAX_32 || localHeaderOffset === MAX_32) {
      return docxTooBig();
    }
    if (flags & FLAG_ENCRYPTED) return invalidDocx();
    const nameStart = position + CENTRAL_HEADER_SIZE;
    entries.push({
      // Les noms utiles (`[Content_Types].xml`, `word/…`) sont en ASCII.
      name: buffer.toString('latin1', nameStart, nameStart + nameLength).replace(/\\/g, '/'),
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset
    });
    position = next;
  }

  if (entries.length !== entryCount || position !== directoryOffset + directorySize) return invalidDocx();
  return { entries, directoryOffset };
}

/**
 * Taille réelle d'une entrée, mesurée sans jamais dépasser `declared` octets
 * alloués : stockée = longueur des données, deflate = décompression plafonnée
 * (la sortie est jetée). Toute autre méthode est refusée.
 */
function measureEntry(data: Buffer, method: number, declared: number): number {
  if (method === METHOD_STORED) return data.length;
  if (method !== METHOD_DEFLATE) return invalidDocx();
  if (data.length === 0 && declared === 0) return 0;
  let inflated: Buffer;
  try {
    inflated = zlib.inflateRawSync(data, { maxOutputLength: Math.max(1, declared) });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ERR_BUFFER_TOO_LARGE') return docxTooBig();
    return invalidDocx();
  }
  return inflated.length;
}

function inspectDocx(buffer: Buffer, limits: DocxLimits): string[] {
  const maxEntries = limits.maxEntries ?? DOCX_MAX_ENTRIES;
  const maxTotal = limits.maxUncompressedBytes ?? DOCX_MAX_UNCOMPRESSED_BYTES;
  const maxEntry = limits.maxEntryUncompressedBytes ?? DOCX_MAX_ENTRY_UNCOMPRESSED_BYTES;

  const { entries, directoryOffset } = readCentralDirectory(buffer, maxEntries);

  // Données dans l'ordre du fichier : sans chevauchement, la décompression
  // totale ne lit jamais plus d'octets que le tampon n'en contient.
  const ordered = [...entries].sort((a, b) => a.localHeaderOffset - b.localHeaderOffset);
  let previousEnd = 0;
  let budget = maxTotal;
  for (const entry of ordered) {
    const offset = entry.localHeaderOffset;
    if (offset < previousEnd || offset + LOCAL_HEADER_SIZE > directoryOffset) return invalidDocx();
    if (buffer.readUInt32LE(offset) !== LOCAL_SIGNATURE) return invalidDocx();
    // Comme PizZip : longueurs du nom et de l'extra LOCALES, taille compressée
    // du répertoire central (fiable même avec un descripteur de données, bit 3).
    const dataStart = offset + LOCAL_HEADER_SIZE + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28);
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > directoryOffset) return invalidDocx();
    previousEnd = dataEnd;

    if (entry.uncompressedSize > maxEntry || entry.uncompressedSize > budget) return docxTooBig();
    const actual = measureEntry(buffer.subarray(dataStart, dataEnd), entry.method, entry.uncompressedSize);
    // Taille déclarée ≠ taille réelle : PizZip échouerait, mais après coup.
    if (actual !== entry.uncompressedSize) return invalidDocx();
    budget -= actual;
  }
  return entries.map(entry => entry.name);
}

/**
 * Contrôle une archive DOCX AVANT de la confier à PizZip : structure ZIP
 * stricte (voir `readCentralDirectory`), au plus `DOCX_MAX_ENTRIES` entrées,
 * méthodes « stockée » ou « deflate » seulement, et décompression réelle
 * plafonnée à `DOCX_MAX_ENTRY_UNCOMPRESSED_BYTES` par entrée et
 * `DOCX_MAX_UNCOMPRESSED_BYTES` au total. Lève une 400 sinon ; le ZIP64 est
 * refusé (trop gros pour un modèle).
 */
export function assertDocxWithinLimits(buffer: Buffer, limits: DocxLimits = {}): void {
  inspectDocx(buffer, limits);
}

/**
 * Contrôle complet d'un modèle DOCX importé : bornes ci-dessus, puis présence
 * de `[Content_Types].xml` et de `word/document.xml` dans le répertoire central
 * (un ZIP quelconque n'est pas un document Word).
 */
export function assertDocxUpload(buffer: Buffer): void {
  const names = new Set(inspectDocx(buffer, {}));
  if (!names.has('[Content_Types].xml') || !names.has('word/document.xml')) return invalidDocx();
}
