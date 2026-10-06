/**
 * Fichiers réels pour les données de démonstration (staging).
 *
 * Les lignes `*Document`, pièces jointes et justificatifs doivent pouvoir être
 * ouverts pendant une démo : sans fichier sur disque, le téléchargement répond
 * 404. Ce module écrit de vrais fichiers sous `<UPLOADS_DIR>` (même convention
 * que les services : chemin absolu en `filePath`, `/uploads/...` en `fileUrl`)
 * et fabrique un PDF lisible, sans dépendance, à partir d'un titre et de lignes
 * de texte. Idempotent : réécrire un fichier identique est sans effet.
 *
 * Le chemin relatif (`segments`) suit le dossier privé du module concerné, par
 * exemple `['properties', bienId, 'documents']` ou `['syndics', syndicId, 'documents']` :
 * lire `middleware/uploads-access-middleware.ts` et le service du module.
 */
import { promises as fs } from 'fs';
import * as path from 'path';
import { env } from '../../../src/config/env';
import { getUploadsRoot } from '../../../src/utils/project-root';

export interface StoredSeedFile {
  /** Chemin absolu sur disque. */
  filePath: string;
  /** `/uploads/<segments>/<fichier>` (le front applique `fileUrl()`). */
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

const CP1252: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  '„': 0x84,
  '…': 0x85,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97
};

/** Chaîne PDF littérale en WinAnsi (accents français conservés). */
function pdfString(text: string): Buffer {
  const bytes: number[] = [];
  for (const ch of text.replace(/[\u202f\u00a0]/g, ' ')) {
    const code = ch.codePointAt(0) ?? 63;
    let b: number;
    if (CP1252[ch] !== undefined) b = CP1252[ch];
    else if (code < 256) b = code;
    else b = 63;
    if (b === 0x28 || b === 0x29 || b === 0x5c) bytes.push(0x5c);
    bytes.push(b);
  }
  return Buffer.from(bytes);
}

/** Coupe une ligne trop longue à `max` caractères, sur les espaces. */
function wrap(line: string, max: number): string[] {
  if (line.length <= max) return [line];
  const out: string[] = [];
  let current = '';
  for (const word of line.split(' ')) {
    if (`${current} ${word}`.trim().length > max) {
      out.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * PDF A4 monopage ou multipage (Helvetica), titre en gras puis lignes de texte.
 * Une ligne commençant par `# ` est un intertitre en gras.
 */
export function buildPdf(title: string, lines: readonly string[]): Buffer {
  const PAGE_LINES = 46;
  const rows: Array<{ text: string; bold: boolean }> = [];
  for (const raw of lines) {
    const bold = raw.startsWith('# ');
    for (const part of wrap(bold ? raw.slice(2) : raw, 92)) rows.push({ text: part, bold });
  }
  const pages: Array<typeof rows> = [];
  for (let i = 0; i < Math.max(rows.length, 1); i += PAGE_LINES) pages.push(rows.slice(i, i + PAGE_LINES));

  const objects: Buffer[] = [];
  const add = (body: string | Buffer): number => {
    objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1'));
    return objects.length;
  };
  add('<< /Type /Catalog /Pages 2 0 R >>'); // 1
  add(''); // 2 (rempli plus bas)
  const fontRegular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); // 3
  const fontBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'); // 4

  const pageIds: number[] = [];
  pages.forEach((pageRows, pageIndex) => {
    const parts: Buffer[] = [];
    let y = 800;
    if (pageIndex === 0) {
      parts.push(
        Buffer.from(`BT /F2 16 Tf 50 ${y} Td (`, 'latin1'),
        pdfString(title),
        Buffer.from(') Tj ET\n', 'latin1')
      );
      y -= 30;
    }
    for (const row of pageRows) {
      parts.push(
        Buffer.from(`BT /${row.bold ? 'F2' : 'F1'} ${row.bold ? 11 : 10} Tf 50 ${y} Td (`, 'latin1'),
        pdfString(row.text),
        Buffer.from(') Tj ET\n', 'latin1')
      );
      y -= row.bold ? 20 : 15;
    }
    parts.push(
      Buffer.from(
        `BT /F1 8 Tf 50 30 Td (Document de démonstration ImmoTopia — page ${pageIndex + 1}/${pages.length}) Tj ET\n`,
        'latin1'
      )
    );
    const content = Buffer.concat(parts);
    const contentId = add(
      Buffer.concat([
        Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1'),
        content,
        Buffer.from('\nendstream', 'latin1')
      ])
    );
    const pageId = add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  });
  objects[1] = Buffer.from(
    `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
    'latin1'
  );

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  const offsets: number[] = [];
  let position = chunks[0].length;
  objects.forEach((body, i) => {
    offsets.push(position);
    const block = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1')]);
    chunks.push(block);
    position += block.length;
  });
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'latin1'));
  return Buffer.concat(chunks);
}

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.txt': 'text/plain',
  '.csv': 'text/csv'
};

/** Écrit un fichier sous la racine des dépôts (`UPLOADS_DIR`) et renvoie ses références. */
export async function writeUpload(
  segments: readonly string[],
  fileName: string,
  content: Buffer
): Promise<StoredSeedFile> {
  const safeName = fileName.replace(/[^A-Za-z0-9._-]+/g, '-');
  const dir = path.join(getUploadsRoot(env.UPLOADS_DIR), ...segments);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, safeName);
  await fs.writeFile(filePath, content);
  return {
    filePath,
    fileUrl: `/uploads/${[...segments, safeName].join('/')}`,
    fileName: safeName,
    fileSize: content.length,
    mimeType: MIME_BY_EXT[path.extname(safeName).toLowerCase()] ?? 'application/octet-stream'
  };
}

/** Raccourci : PDF de démonstration écrit sur disque. */
export async function writeDemoPdf(
  segments: readonly string[],
  fileName: string,
  title: string,
  lines: readonly string[]
): Promise<StoredSeedFile> {
  return writeUpload(segments, fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`, buildPdf(title, lines));
}
