/**
 * Fichiers réels du volet locatif (agence) : documents Word des dossiers de
 * location, photos d'états des lieux et de tickets, PDF de pièces justificatives.
 *
 * Les documents locatifs générés (`RentalDocument`) sont servis par
 * `GET /documents/:id/download` qui les relit sous `<racine>/assets/generated_documents`
 * et les annonce comme .docx : ce sont donc de vrais fichiers .docx (zip OOXML
 * minimal, sans modèle) qui sont écrits à cet endroit, au chemin que
 * `saveGeneratedDocument` utiliserait. Les photos et les PDF suivent
 * `seed-files.ts` (racine `UPLOADS_DIR`).
 */
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import { getProjectRoot } from '../../../src/utils/project-root';
import { renderPropertyImage } from './property-images';
import type { Scene } from './property-images';
import { writeUpload } from './seed-files';
import type { StoredSeedFile } from './seed-files';

function xmlEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Document Word minimal et valide : la première ligne est le titre, une ligne
 * `# ` ouvre un intertitre en gras, une ligne vide fait un saut de paragraphe.
 */
export function buildDocx(title: string, lines: readonly string[]): Buffer {
  const run = (text: string, opts: { bold?: boolean; size?: number } = {}): string =>
    `<w:r><w:rPr>${opts.bold ? '<w:b/>' : ''}<w:sz w:val="${opts.size ?? 22}"/></w:rPr>` +
    `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
  const para = (inner: string, after = 120): string =>
    `<w:p><w:pPr><w:spacing w:after="${after}"/></w:pPr>${inner}</w:p>`;

  const body: string[] = [para(run(title, { bold: true, size: 32 }), 240)];
  for (const raw of lines) {
    if (raw.trim() === '') body.push(para('', 60));
    else if (raw.startsWith('# ')) body.push(para(run(raw.slice(2), { bold: true, size: 24 }), 100));
    else body.push(para(run(raw)));
  }
  body.push(para(run('Document de démonstration ImmoTopia', { size: 16 }), 0));

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    body.join('') +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>' +
    '</w:body></w:document>';

  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>'
  );
  zip.file('word/document.xml', documentXml);
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface StoredRentalDocument {
  filePath: string;
  fileHash: string;
  size: number;
}

/** Écrit un document locatif sous `assets/generated_documents/<agence>/<type>/<AAAA>/<MM>/` (convention de `saveGeneratedDocument`). */
export async function saveRentalDocx(params: {
  tenantId: string;
  typeDir: string;
  issuedAt: Date;
  number: string;
  keyPart: string;
  title: string;
  lines: readonly string[];
}): Promise<StoredRentalDocument> {
  const year = String(params.issuedAt.getUTCFullYear());
  const month = String(params.issuedAt.getUTCMonth() + 1).padStart(2, '0');
  const dir = path.join(
    getProjectRoot(),
    'assets',
    'generated_documents',
    params.tenantId,
    params.typeDir,
    year,
    month
  );
  await fs.mkdir(dir, { recursive: true });
  const fileName = `${params.number}_${params.typeDir}_${params.keyPart.slice(0, 8)}.docx`.replace(
    /[^A-Za-z0-9._-]+/g,
    '-'
  );
  const filePath = path.join(dir, fileName);
  const buffer = buildDocx(params.title, params.lines);
  await fs.writeFile(filePath, buffer);
  return { filePath, fileHash: createHash('sha256').update(buffer).digest('hex'), size: buffer.length };
}

/** Photo de démonstration (PNG dessiné) écrite sous la racine des dépôts. */
export async function writeScenePhoto(
  segments: readonly string[],
  fileName: string,
  propertyType: string,
  seedText: string,
  scene: Scene,
  variant: number
): Promise<StoredSeedFile> {
  return writeUpload(segments, fileName, renderPropertyImage(propertyType, seedText, scene, variant));
}

export type { Scene };
