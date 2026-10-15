import PizZip from 'pizzip';
import { BadRequestError } from '../../middleware/error-middleware';

/**
 * Neutralise un DOCX AVANT de le confier à LibreOffice (audit sécurité) : le
 * contrat est rendu à partir d'un modèle et de données saisies par des
 * utilisateurs ; un document piégé ne doit ni lire un fichier local, ni appeler
 * une URL, ni exécuter de macro pendant la conversion.
 *
 * Retiré :
 * - toute relation externe (`TargetMode="External"`) des fichiers `.rels`
 *   (images ou modèles distants, liens, `attachedTemplate`) ;
 * - les champs `INCLUDEPICTURE`, `INCLUDETEXT`, `LINK`, `DDE`, `DDEAUTO`,
 *   `IMPORT`, `AUTOTEXT` (`w:instrText` et `w:fldSimple`) ;
 * - toute adresse `file:` restante ;
 * - macros et ActiveX (`vbaProject`, `activeX`).
 * Un fichier qui n'est pas une archive DOCX valide est refusé (400).
 */

const DANGEROUS_FIELD = /\b(INCLUDEPICTURE|INCLUDETEXT|LINK|DDEAUTO|DDE|IMPORT|AUTOTEXT)\b/i;
const EXTERNAL_RELATIONSHIP =
  /<Relationship\b[^>]*\bTargetMode\s*=\s*["']External["'][^>]*\/?>(?:\s*<\/Relationship>)?/gi;
const FILE_URL = /file:/gi;
const REMOVED_PARTS = /(^|\/)(vbaProject[^/]*|activeX\/.*|vbaData\.xml)$/i;

function sanitizeRels(xml: string): string {
  return xml.replace(EXTERNAL_RELATIONSHIP, '');
}

function sanitizeWordXml(xml: string): string {
  let out = xml.replace(/(<w:instrText\b[^>]*>)([\s\S]*?)(<\/w:instrText>)/gi, (match, open, body, close) =>
    DANGEROUS_FIELD.test(body) ? `${open} ${close}` : match
  );
  out = out.replace(/(<w:fldSimple\b[^>]*\bw:instr\s*=\s*)(["'])([\s\S]*?)\2/gi, (match, head, quote, value) =>
    DANGEROUS_FIELD.test(value) ? `${head}${quote} ${quote}` : match
  );
  // Champs complexes dont l'instruction est coupée en plusieurs w:t : on ne garde aucun file:.
  return out.replace(FILE_URL, 'blocked:');
}

export function sanitizeDocx(docx: Buffer): Buffer {
  let zip: PizZip;
  try {
    zip = new PizZip(docx);
  } catch {
    throw new BadRequestError('Le document à convertir n’est pas un fichier Word valide.');
  }
  if (!zip.file('[Content_Types].xml') || !zip.file('word/document.xml')) {
    throw new BadRequestError('Le document à convertir n’est pas un fichier Word valide.');
  }
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    if (REMOVED_PARTS.test(name)) {
      zip.remove(name);
      continue;
    }
    if (name.endsWith('.rels')) {
      zip.file(name, sanitizeRels(entry.asText()));
    } else if (/^word\/.*\.xml$/i.test(name) || name === '[Content_Types].xml') {
      zip.file(name, sanitizeWordXml(entry.asText()));
    }
  }
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
