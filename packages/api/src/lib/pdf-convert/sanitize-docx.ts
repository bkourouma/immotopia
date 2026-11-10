import PizZip from 'pizzip';
import { BadRequestError } from '../../middleware/error-middleware';
import { DOCX_MAX_RENDERED_XML_ENTRY_UNCOMPRESSED_BYTES, assertDocxWithinLimits } from '../../utils/docx-limits';

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

/*
 * Toutes les expressions ci-dessous sont linéaires (contre-audit de la PR
 * #205) : aucune classe `[^>]*` qui pourrait traverser un `<` suivant, aucun
 * `[\s\S]*?` qui repartirait de chaque balise ouvrante jusqu'à la fin du
 * texte. Sur 5 Mo de balises ouvrantes non fermées, l'ancienne forme prenait
 * des minutes ; celle-ci quelques dizaines de millisecondes.
 */
const DANGEROUS_FIELD = /\b(INCLUDEPICTURE|INCLUDETEXT|LINK|DDEAUTO|DDE|IMPORT|AUTOTEXT)\b/i;
/** Une balise `<Relationship …>` entière (ouvrante ou auto-fermante), et sa fermeture éventuelle. */
const RELATIONSHIP_TAG = /<Relationship\b[^<>]*>(?:\s*<\/Relationship>)?/gi;
const EXTERNAL_TARGET_MODE = /\bTargetMode\s*=\s*["']External["']/i;
/**
 * Jeton de champ complexe : un `w:fldChar` (début, séparation, fin) ou un
 * `w:instrText` complet. Le corps s'arrête à la fermeture ou au prochain
 * `<w:instrText` : un corps jamais fermé n'est parcouru qu'une fois. Il peut
 * contenir commentaire, CDATA ou instruction de traitement, que le lecteur XML
 * de LibreOffice ignore ou déroule (voir `instructionText`).
 */
const FIELD_TOKEN =
  /<\/w:p>|<w:fldChar\b[^<>]*>|(<w:instrText\b[^<>]*>)([^<]*(?:<(?!\/w:instrText>|w:instrText\b)[^<]*)*)(<\/w:instrText>)/gi;
const FLD_CHAR_TYPE = /\bw:fldCharType\s*=\s*["'](begin|separate|end)["']/i;
/** Une valeur d'attribut XML ne peut pas contenir `<` : la classe s'arrête au plus tard à la balise suivante. */
const FLD_SIMPLE = /(<w:fldSimple\b[^<>]*?\bw:instr\s*=\s*)(?:"([^"<]*)"|'([^'<]*)')/gi;
const FILE_URL = /file:/gi;
const REMOVED_PARTS = /(^|\/)(vbaProject[^/]*|activeX\/.*|vbaData\.xml)$/i;
const RELS_PART = /\.rels$/i;
const WORD_XML_PART = /^word\/.*\.xml$/i;

function sanitizeRels(xml: string): string {
  // Entités décodées : `TargetMode="&#69;xternal"` est External pour un lecteur XML.
  return xml.replace(RELATIONSHIP_TAG, tag => (EXTERNAL_TARGET_MODE.test(decodeXmlEntities(tag)) ? '' : tag));
}

const XML_NAMED_ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** Décode les entités XML (`&#73;NCLUDETEXT` est un INCLUDETEXT pour LibreOffice). */
function decodeXmlEntities(text: string): string {
  return text.replace(/&#x([0-9a-f]{1,6});|&#(\d{1,7});|&(lt|gt|amp|quot|apos);/gi, (entity, hex, dec, named) => {
    if (named) return XML_NAMED_ENTITIES[named.toLowerCase()] ?? entity;
    const code = hex ? parseInt(hex, 16) : Number(dec);
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}

/** Retire les commentaires XML (boucle `indexOf` : linéaire, même sans `-->`). */
function stripXmlComments(text: string): string {
  let out = '';
  let position = 0;
  for (;;) {
    const open = text.indexOf('<!--', position);
    if (open < 0) return out + text.slice(position);
    out += text.slice(position, open);
    const close = text.indexOf('-->', open + 4);
    if (close < 0) return out;
    position = close + 3;
  }
}

/** Texte d'instruction tel que le lit un lecteur XML : CDATA déroulé, autres balises retirées, entités décodées. */
function instructionText(body: string): string {
  return decodeXmlEntities(body.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^<>]*>/g, ''));
}

/**
 * Instruction dangereuse, lue de deux façons : commentaires retirés (lecture
 * d'un parseur XML), et simples marqueurs retirés en gardant leur contenu. Au
 * pire un faux positif, donc un champ neutralisé de trop.
 */
const isDangerous = (instruction: string): boolean =>
  DANGEROUS_FIELD.test(instructionText(stripXmlComments(instruction))) ||
  DANGEROUS_FIELD.test(instructionText(instruction.replace(/<!--|-->/g, '')));

/**
 * Regroupe les `w:instrText` par champ : Word et LibreOffice concatènent
 * toutes les instructions d'un champ complexe (du `begin` à son `end`, champs
 * imbriqués compris), donc `INCLUDE` puis `PICTURE "http://…"` dans deux
 * `w:instrText` forment un INCLUDEPICTURE. Les `w:instrText` hors champ qui se
 * suivent forment un groupe. Un groupe s'arrête aussi à la fin du paragraphe
 * (`</w:p>`) : limite connue, une instruction coupée ENTRE deux paragraphes
 * n'est pas recomposée. Rend, pour chaque `w:instrText` dans l'ordre, s'il
 * doit être neutralisé.
 */
function dangerousInstructions(xml: string): boolean[] {
  const groupOf: number[] = [];
  const groupBodies: string[][] = [];
  let depth = 0;
  let current = -1;
  for (const [token, open, body] of xml.matchAll(FIELD_TOKEN)) {
    if (token.startsWith('</')) {
      // Fin de paragraphe : nouveau groupe (un champ resté ouvert ne doit pas
      // emporter les champs ordinaires des paragraphes suivants).
      current = -1;
      continue;
    }
    if (!open) {
      const type = FLD_CHAR_TYPE.exec(token)?.[1]?.toLowerCase();
      if (type === 'begin') {
        if (depth === 0) current = -1;
        depth += 1;
      } else if (type === 'end' && depth > 0) {
        depth -= 1;
        if (depth === 0) current = -1;
      } else if (depth === 0) {
        current = -1;
      }
      continue;
    }
    if (current < 0) {
      current = groupBodies.length;
      groupBodies.push([]);
    }
    groupBodies[current].push(body);
    groupOf.push(current);
  }
  const dangerousGroup = groupBodies.map(bodies => bodies.some(isDangerous) || isDangerous(bodies.join('')));
  return groupOf.map(group => dangerousGroup[group]);
}

function sanitizeWordXml(xml: string): string {
  const dangerous = dangerousInstructions(xml);
  let index = 0;
  let out = xml.replace(FIELD_TOKEN, (match, open, _body, close) => {
    if (!open) return match;
    return dangerous[index++] ? `${open} ${close}` : match;
  });
  out = out.replace(FLD_SIMPLE, (match, head, doubleQuoted, singleQuoted) => {
    const value = doubleQuoted ?? singleQuoted;
    const quote = doubleQuoted === undefined ? "'" : '"';
    return isDangerous(value) ? `${head}${quote} ${quote}` : match;
  });
  // Champs complexes dont l'instruction est coupée en plusieurs w:t : on ne garde aucun file:.
  return out.replace(FILE_URL, 'blocked:');
}

export interface SanitizeDocxOptions {
  /**
   * Plafond décompressé d'une partie `.xml` / `.rels`. Par défaut
   * `DOCX_MAX_RENDERED_XML_ENTRY_UNCOMPRESSED_BYTES` (20 Mo) : le document à
   * convertir est RENDU par l'application (un relevé de milliers de lignes
   * dépasse les 5 Mo d'un modèle importé) et les expressions ci-dessus sont
   * linéaires.
   */
  maxXmlEntryUncompressedBytes?: number;
}

export function sanitizeDocx(docx: Buffer, options: SanitizeDocxOptions = {}): Buffer {
  assertDocxWithinLimits(docx, {
    maxXmlEntryUncompressedBytes: options.maxXmlEntryUncompressedBytes ?? DOCX_MAX_RENDERED_XML_ENTRY_UNCOMPRESSED_BYTES
  });
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
    // Casse ignorée : `DOCUMENT.XML.RELS` reste une partie de relations.
    if (RELS_PART.test(name)) {
      zip.file(name, sanitizeRels(entry.asText()));
    } else if (WORD_XML_PART.test(name) || name === '[Content_Types].xml') {
      zip.file(name, sanitizeWordXml(entry.asText()));
    }
  }
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
