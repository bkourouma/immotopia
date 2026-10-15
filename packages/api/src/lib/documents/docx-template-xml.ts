/**
 * Primitives WordprocessingML pour fabriquer les modèles DOCX standard
 * (voir `docx-standard-templates.ts`). Le XML est écrit à la main : aucune
 * dépendance, sortie déterministe. Chaque balise `{{NOM}}` reste dans UN SEUL
 * `<w:t>`, condition pour que docxtemplater la retrouve.
 */

export const COLOR = {
  ink: '222B36',
  navy: '1F3A5F',
  grey: '5B6670',
  border: 'C9D3DF',
  fill: 'EEF2F7',
  white: 'FFFFFF'
} as const;

/** Largeur utile d'une page A4 avec 2 cm de marge, en vingtièmes de point. */
export const CONTENT_WIDTH = 9638;

export const escapeXml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface RunOptions {
  bold?: boolean;
  italic?: boolean;
  /** Taille en demi-points (21 = 10,5 pt). */
  size?: number;
  color?: string;
  caps?: boolean;
}

export interface ParagraphOptions extends RunOptions {
  align?: 'left' | 'center' | 'right' | 'both';
  before?: number;
  after?: number;
  keepNext?: boolean;
  /** Filet sous ou au-dessus du paragraphe. */
  rule?: 'bottom' | 'top';
  ruleColor?: string;
  indent?: number;
  hanging?: number;
  pageBreakBefore?: boolean;
}

function runProps(options: RunOptions): string {
  const parts = [
    options.bold ? '<w:b/><w:bCs/>' : '',
    options.italic ? '<w:i/><w:iCs/>' : '',
    options.caps ? '<w:caps/>' : '',
    options.color ? `<w:color w:val="${options.color}"/>` : '',
    options.size ? `<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>` : ''
  ].join('');
  return parts ? `<w:rPr>${parts}</w:rPr>` : '';
}

export const run = (text: string, options: RunOptions = {}): string =>
  `<w:r>${runProps(options)}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

/** Texte avec `**gras**` : bascule le gras à chaque double astérisque. */
export function richRuns(markup: string, base: RunOptions = {}): string {
  return markup
    .split('**')
    .map((chunk, index) => (chunk ? run(chunk, { ...base, bold: index % 2 === 1 ? true : base.bold }) : ''))
    .join('');
}

function paragraphProps(options: ParagraphOptions): string {
  const border = options.rule
    ? `<w:pBdr><w:${options.rule} w:val="single" w:sz="8" w:space="4" w:color="${options.ruleColor ?? COLOR.navy}"/></w:pBdr>`
    : '';
  const indent =
    options.indent || options.hanging
      ? `<w:ind w:left="${options.indent ?? 0}" w:hanging="${options.hanging ?? 0}"/>`
      : '';
  const parts = [
    options.keepNext ? '<w:keepNext/>' : '',
    options.pageBreakBefore ? '<w:pageBreakBefore/>' : '',
    border,
    `<w:spacing w:before="${options.before ?? 0}" w:after="${options.after ?? 80}" w:line="264" w:lineRule="auto"/>`,
    indent,
    options.align ? `<w:jc w:val="${options.align}"/>` : ''
  ].join('');
  return `<w:pPr>${parts}</w:pPr>`;
}

/** Un paragraphe ; `markup` accepte le `**gras**`. */
export function paragraph(markup: string, options: ParagraphOptions = {}): string {
  const base: RunOptions = {
    bold: options.bold,
    italic: options.italic,
    size: options.size,
    color: options.color,
    caps: options.caps
  };
  return `<w:p>${paragraphProps(options)}${richRuns(markup, base)}</w:p>`;
}

/** Paragraphe vide d'une hauteur donnée (en vingtièmes de point). */
export const spacer = (height = 120): string =>
  `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${height}" w:lineRule="exact"/></w:pPr></w:p>`;

export const pageBreak = (): string => '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

/** Puce typographique avec retrait suspendu (sans partie numbering.xml). */
export const bullet = (markup: string): string =>
  `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="454"/></w:tabs><w:spacing w:before="0" w:after="40" w:line="264" w:lineRule="auto"/>` +
  `<w:ind w:left="454" w:hanging="284"/></w:pPr>${run('•', { color: COLOR.navy, bold: true })}<w:r><w:tab/></w:r>${richRuns(markup)}</w:p>`;

// ------------------------------------------------------------------- tableaux

export interface CellOptions {
  width: number;
  fill?: string;
  span?: number;
  vAlign?: 'top' | 'center' | 'bottom';
  /** Bordures de la cellule ; `none` pour une mise en page. */
  borders?: 'grid' | 'none';
}

const cellBorders = (kind: 'grid' | 'none'): string => {
  const edge = (name: string) =>
    kind === 'none'
      ? `<w:${name} w:val="nil"/>`
      : `<w:${name} w:val="single" w:sz="4" w:space="0" w:color="${COLOR.border}"/>`;
  return `<w:tcBorders>${['top', 'left', 'bottom', 'right'].map(edge).join('')}</w:tcBorders>`;
};

/** Une cellule ; `content` est du XML de paragraphes (au moins un). */
export function cell(content: string, options: CellOptions): string {
  const props = [
    `<w:tcW w:w="${options.width}" w:type="dxa"/>`,
    options.span ? `<w:gridSpan w:val="${options.span}"/>` : '',
    cellBorders(options.borders ?? 'grid'),
    options.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${options.fill}"/>` : '',
    '<w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar>',
    options.vAlign ? `<w:vAlign w:val="${options.vAlign}"/>` : ''
  ].join('');
  return `<w:tc><w:tcPr>${props}</w:tcPr>${content}</w:tc>`;
}

export const row = (cells: string[], header = false): string =>
  `<w:tr><w:trPr><w:cantSplit/>${header ? '<w:tblHeader/>' : ''}</w:trPr>${cells.join('')}</w:tr>`;

export function table(rows: string[], widths: number[]): string {
  const grid = widths.map(width => `<w:gridCol w:w="${width}"/>`).join('');
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    `<w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
    `<w:tblGrid>${grid}</w:tblGrid>${rows.join('')}</w:tbl>`
  );
}

// ------------------------------------------------------------------ gabarits

const NAMESPACES =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export const documentXml = (body: string, sectionProps: string): string =>
  `${XML_DECLARATION}<w:document ${NAMESPACES}><w:body>${body}${sectionProps}</w:body></w:document>`;

export const headerXml = (content: string): string => `${XML_DECLARATION}<w:hdr ${NAMESPACES}>${content}</w:hdr>`;

export const footerXml = (content: string): string => `${XML_DECLARATION}<w:ftr ${NAMESPACES}>${content}</w:ftr>`;

/** Champ Word (PAGE, NUMPAGES) avec une valeur de repli lisible. */
export const field = (instruction: string, options: RunOptions = {}): string =>
  `<w:fldSimple w:instr=" ${instruction} ">${run('1', options)}</w:fldSimple>`;

export const stylesXml = (): string =>
  `${XML_DECLARATION}<w:styles ${NAMESPACES}>` +
  `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>` +
  `<w:color w:val="${COLOR.ink}"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="fr-FR" w:eastAsia="fr-FR" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>` +
  `<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
  `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/>` +
  `<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/>` +
  `<w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
  `<w:pPr><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="${COLOR.navy}"/><w:sz w:val="40"/></w:rPr></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
  `<w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="${COLOR.navy}"/><w:sz w:val="23"/></w:rPr></w:style>` +
  `</w:styles>`;

export const settingsXml = (): string =>
  `${XML_DECLARATION}<w:settings ${NAMESPACES}><w:zoom w:percent="100"/><w:defaultTabStop w:val="454"/>` +
  `<w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" ` +
  `w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
