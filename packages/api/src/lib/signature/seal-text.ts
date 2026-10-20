import { readFile } from 'fs/promises';
import * as fontkit from '@pdf-lib/fontkit';
import bidiFactory, { type Bidi } from 'bidi-js';
import {
  PDFDocument,
  PDFFont,
  PDFHexString,
  PDFPage,
  RGB,
  beginText,
  endText,
  popGraphicsState,
  pushGraphicsState,
  setFillingColor,
  setFontAndSize,
  setTextMatrix,
  showText
} from 'pdf-lib';
import { logger } from '../../utils/logger';

/**
 * Texte du PDF scellé : latin en police standard, tout le reste (arabe, lettres
 * hors WinAnsi) en police Unicode embarquée.
 *
 * Police : Noto Sans Arabic (Noto Project Authors, licence SIL OFL 1.1), livrée
 * par le paquet npm `@expo-google-fonts/noto-sans-arabic` (dépendance de
 * production de l'API : l'image Docker la contient via `node_modules`, aucun
 * fichier à copier à part). Elle couvre l'arabe ET le latin étendu. Les octets
 * sont lus une fois par processus (mémoire), puis embarqués en sous-ensemble
 * (`subset: true`) : seuls les glyphes utilisés entrent dans le PDF (quelques Kio).
 *
 * Mise en forme : `@pdf-lib/fontkit` applique GSUB (formes initiale, médiane,
 * finale, ligatures lam-alef) et renvoie les glyphes d'un segment droite-à-gauche
 * dans l'ordre visuel. Il ne sait pas mélanger les sens dans une même chaîne :
 * `bidi-js` (algorithme bidirectionnel Unicode) découpe donc le texte en
 * segments de même sens, rangés dans l'ordre visuel, dessinés l'un après l'autre.
 *
 * Positionnement : pdf-lib ne place pas les glyphes sans chasse (points des
 * lettres arabes, hamza, voyelles brèves) que cette police sépare des lettres, et
 * il n'a pas la largeur des formes contextuelles. Les glyphes sont donc posés un
 * par un à la position calculée par fontkit (décalages GPOS compris) ; pdf-lib ne
 * sert qu'à embarquer le sous-ensemble et à numéroter les glyphes (`encodeText`).
 */

/** Chemins résolus par Node, quel que soit l'emplacement réel de `node_modules`. */
const FONT_FILES = {
  regular: '@expo-google-fonts/noto-sans-arabic/400Regular/NotoSansArabic_400Regular.ttf',
  bold: '@expo-google-fonts/noto-sans-arabic/700Bold/NotoSansArabic_700Bold.ttf'
} as const;

export type UnicodeWeight = keyof typeof FONT_FILES;

const fontBytesCache = new Map<UnicodeWeight, Promise<Buffer>>();
const fontKitCache = new Map<UnicodeWeight, fontkit.Font>();

/** Octets de la police, lus une seule fois ; un échec n'est pas mémorisé. */
export function loadUnicodeFontBytes(weight: UnicodeWeight): Promise<Buffer> {
  let bytes = fontBytesCache.get(weight);
  if (!bytes) {
    bytes = readFile(require.resolve(FONT_FILES[weight]));
    fontBytesCache.set(weight, bytes);
    bytes.catch(() => fontBytesCache.delete(weight));
  }
  return bytes;
}

let bidi: Bidi | null = null;

/** Contrôles de sens et caractères de formatage, sans rendu : supprimés plutôt que remplacés par `?`. */
const FORMAT_CHARS = /[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/;

/** Vrai si la police standard sait écrire tout le texte (WinAnsi). */
export function isEncodable(font: PDFFont, text: string): boolean {
  for (const ch of text) {
    try {
      font.widthOfTextAtSize(ch, 1);
    } catch {
      return false;
    }
  }
  return true;
}

/** Remplace les caractères que la police ne sait pas écrire. */
export function safeText(font: PDFFont, text: string): string {
  let out = '';
  for (const ch of text.replace(/[\r\n\t]+/g, ' ')) {
    try {
      font.widthOfTextAtSize(ch, 1);
      out += ch;
    } catch {
      out += '?';
    }
  }
  return out;
}

/** Police Unicode : copie PDF (sous-ensemble) et copie fontkit (mise en forme), de même graisse. */
export type UnicodeFace = { pdf: PDFFont; kit: fontkit.Font };

/** `face` vide : police standard. */
type Run = { face: UnicodeFace | null; text: string };

/**
 * Une famille de caractères : police standard (latin WinAnsi, sans changement)
 * et, quand le document en a besoin, police Unicode pour les textes que la
 * police standard ne peut pas écrire.
 */
export class TextFace {
  private runsCache = new Map<string, Run[]>();

  constructor(
    private readonly standard: PDFFont,
    private readonly unicode: UnicodeFace | null
  ) {}

  /** Texte sur une ligne, sans caractère que ni l'une ni l'autre police ne sait écrire. */
  clean(text: string): string {
    const flat = text.replace(/[\r\n\t]+/g, ' ');
    if (!this.unicode || isEncodable(this.standard, flat)) return safeText(this.standard, flat);
    let out = '';
    for (const ch of flat) {
      if (FORMAT_CHARS.test(ch)) continue;
      const code = ch.codePointAt(0) as number;
      out += code <= 0xffff && this.unicode.kit.hasGlyphForCodePoint(code) ? ch : '?';
    }
    return out;
  }

  /** Segments à dessiner de gauche à droite (ordre visuel). */
  private runs(text: string): Run[] {
    const cached = this.runsCache.get(text);
    if (cached) return cached;
    let runs: Run[];
    if (!this.unicode || isEncodable(this.standard, text)) {
      runs = text ? [{ face: null, text }] : [];
    } else {
      runs = visualRuns(text).map(chunk => ({ face: this.unicode, text: chunk }));
    }
    this.runsCache.set(text, runs);
    return runs;
  }

  private runWidth(run: Run, size: number): number {
    if (!run.face) return this.standard.widthOfTextAtSize(run.text, size);
    const scale = size / run.face.kit.unitsPerEm;
    return run.face.kit.layout(run.text).positions.reduce((sum, position) => sum + position.xAdvance * scale, 0);
  }

  width(text: string, size: number): number {
    return this.runs(this.clean(text)).reduce((sum, run) => sum + this.runWidth(run, size), 0);
  }

  draw(page: PDFPage, text: string, options: { x: number; y: number; size: number; color: RGB }): void {
    let x = options.x;
    for (const run of this.runs(this.clean(text))) {
      if (run.face) drawShaped(page, run.face, run.text, { ...options, x });
      else page.drawText(run.text, { x, y: options.y, size: options.size, font: this.standard, color: options.color });
      x += this.runWidth(run, options.size);
    }
  }
}

/** Écrit un segment glyphe par glyphe, chacun à sa position (chasse et décalages GPOS de fontkit). */
function drawShaped(
  page: PDFPage,
  face: UnicodeFace,
  text: string,
  options: { x: number; y: number; size: number; color: RGB }
): void {
  const layout = face.kit.layout(text);
  // `encodeText` inscrit les glyphes dans le sous-ensemble et rend leurs numéros, dans l'ordre de `layout`.
  const ids = face.pdf.encodeText(text).asBytes();
  if (ids.length !== layout.glyphs.length * 2) throw new Error('Signature : glyphes du PDF scellé incohérents');
  const key = page.node.newFontDictionary(face.pdf.name, face.pdf.ref);
  const scale = options.size / face.kit.unitsPerEm;
  const operators = [
    pushGraphicsState(),
    setFillingColor(options.color),
    beginText(),
    setFontAndSize(key, options.size)
  ];
  let pen = options.x;
  layout.positions.forEach((position, index) => {
    const id = ids.subarray(index * 2, index * 2 + 2);
    operators.push(
      setTextMatrix(1, 0, 0, 1, pen + position.xOffset * scale, options.y + position.yOffset * scale),
      showText(PDFHexString.of(Buffer.from(id).toString('hex')))
    );
    pen += position.xAdvance * scale;
  });
  operators.push(endText(), popGraphicsState());
  page.pushOperators(...operators);
}

/**
 * Découpe un texte en segments de même niveau bidirectionnel, dans l'ordre
 * visuel. Chaque segment est rendu dans son ordre logique (fontkit inverse
 * lui-même les glyphes d'un segment arabe) et les parenthèses sont miroitées.
 */
export function visualRuns(text: string): string[] {
  bidi ??= bidiFactory();
  // Mise en page toujours gauche-à-droite (étiquettes françaises ou anglaises, texte aligné à gauche).
  const result = bidi.getEmbeddingLevels(text, 'ltr');
  const levels = result.levels;
  const mirrored = bidi.getMirroredCharactersMap(text, levels);
  const visual = bidi.getReorderedIndices(text, result);
  const chunks: string[] = [];
  let group: number[] = [];
  const flush = (): void => {
    if (group.length === 0) return;
    const level = levels[group[0]];
    const logical = level % 2 === 1 ? [...group].reverse() : group;
    chunks.push(logical.map(index => mirrored.get(index) ?? text[index]).join(''));
    group = [];
  };
  for (const index of visual) {
    if (group.length > 0 && levels[group[0]] !== levels[index]) flush();
    group.push(index);
  }
  flush();
  return chunks;
}

/** Copie fontkit d'une graisse, analysée une fois par processus. */
function loadKit(weight: UnicodeWeight, bytes: Buffer): fontkit.Font {
  let kit = fontKitCache.get(weight);
  if (!kit) {
    kit = fontkit.create(new Uint8Array(bytes));
    fontKitCache.set(weight, kit);
  }
  return kit;
}

/** Embarque les deux graisses Unicode ; en cas d'échec, le scellement continue avec des `?`. */
export async function embedUnicodeFonts(doc: PDFDocument): Promise<{ regular: UnicodeFace; bold: UnicodeFace } | null> {
  try {
    doc.registerFontkit(fontkit);
    const embed = async (weight: UnicodeWeight): Promise<UnicodeFace> => {
      const bytes = await loadUnicodeFontBytes(weight);
      return { pdf: await doc.embedFont(bytes, { subset: true }), kit: loadKit(weight, bytes) };
    };
    return { regular: await embed('regular'), bold: await embed('bold') };
  } catch (error) {
    logger.error('Signature : police Unicode du PDF scellé indisponible, repli sur les polices standard', {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}
