import {
  CONTENT_WIDTH,
  COLOR,
  bullet,
  cell,
  field,
  pageBreak,
  paragraph,
  richRuns,
  row,
  run,
  spacer,
  table,
  type ParagraphOptions
} from './docx-template-xml';

/**
 * Blocs de contenu des modèles DOCX standard : une description de haut niveau
 * (titre, paragraphes, tableaux, colonnes…) que `renderBlocks` convertit en
 * WordprocessingML. Les textes portent des balises `{{NOM}}` et du `**gras**`.
 */
export type Block =
  | { t: 'title'; text: string; subtitle?: string }
  | { t: 'h2'; text: string }
  | { t: 'p'; text: string; opts?: ParagraphOptions }
  | { t: 'lines'; lines: string[] }
  | { t: 'bullets'; items: string[] }
  | { t: 'refs'; rows: Array<[string, string]> }
  | { t: 'grid'; head: string[]; rows: string[][]; widths: number[]; right?: number[]; boldLast?: boolean }
  | { t: 'cols'; left: Block[]; right: Block[] }
  | { t: 'sign'; left: string[]; right: string[]; keep?: boolean }
  | { t: 'spacer' }
  | { t: 'pageBreak' };

const HALF = Math.floor(CONTENT_WIDTH / 2);

function titleXml(block: Extract<Block, { t: 'title' }>): string {
  const title = paragraph(block.text, {
    bold: true,
    size: 34,
    color: COLOR.navy,
    before: 120,
    after: 40,
    keepNext: true
  });
  const subtitle = block.subtitle
    ? paragraph(block.subtitle, { size: 21, color: COLOR.grey, after: 160 })
    : spacer(120);
  return title + subtitle;
}

const h2Xml = (text: string): string =>
  paragraph(text, {
    bold: true,
    size: 22,
    color: COLOR.navy,
    before: 240,
    after: 100,
    keepNext: true,
    rule: 'bottom',
    ruleColor: COLOR.border
  });

/** Tableau de références : deux couples libellé / valeur par ligne. */
function refsXml(rows: Array<[string, string]>): string {
  const widths = [1750, 3069, 1750, 3069];
  const lines: string[] = [];
  for (let index = 0; index < rows.length; index += 2) {
    const cells = [rows[index], rows[index + 1]].flatMap((entry, side) => [
      cell(paragraph(entry?.[0] ?? '', { bold: true, size: 18, color: COLOR.grey, after: 0 }), {
        width: widths[side * 2],
        fill: COLOR.fill
      }),
      cell(paragraph(entry?.[1] ?? '', { size: 19, after: 0 }), { width: widths[side * 2 + 1] })
    ]);
    lines.push(row(cells));
  }
  return table(lines, widths) + spacer(100);
}

function gridXml(block: Extract<Block, { t: 'grid' }>): string {
  const align = (index: number): ParagraphOptions['align'] => (block.right?.includes(index) ? 'right' : 'left');
  const head = row(
    block.head.map((text, index) =>
      cell(paragraph(text, { bold: true, size: 19, color: COLOR.white, after: 0, align: align(index) }), {
        width: block.widths[index],
        fill: COLOR.navy
      })
    ),
    true
  );
  const lastIndex = block.rows.length - 1;
  const body = block.rows.map((values, rowIndex) => {
    const strong = block.boldLast && rowIndex === lastIndex;
    return row(
      values.map((text, index) =>
        cell(paragraph(text, { size: 19, after: 0, align: align(index), bold: strong }), {
          width: block.widths[index],
          fill: strong ? COLOR.fill : undefined
        })
      )
    );
  });
  return table([head, ...body], block.widths) + spacer(100);
}

function colsXml(block: Extract<Block, { t: 'cols' }>): string {
  const side = (blocks: Block[]) => cell(renderBlocks(blocks) || spacer(60), { width: HALF, borders: 'none' });
  return table([row([side(block.left), side(block.right)])], [HALF, HALF]) + spacer(60);
}

/** Ligne qui porte la signature ou le cachet de l'émetteur (marqueurs remplacés par des images au rendu). */
const isImageLine = (line: string): boolean => /\{\{(?:SIGNATURE|CACHET)_EMETTEUR\}\}/.test(line);

/**
 * Ligne d'images : hauteur d'au moins 900 vingtièmes de point (la place de la
 * signature manuscrite, comme le spacer qu'elle remplace), qui grandit avec
 * l'image ; sans image, le marqueur disparaît et la place reste.
 */
const imageLineXml = (line: string, keepNext: boolean): string =>
  `<w:p><w:pPr>${keepNext ? '<w:keepNext/>' : ''}<w:spacing w:before="0" w:after="40" w:line="900" w:lineRule="atLeast"/></w:pPr>${run(line)}</w:p>`;

function signXml(block: Extract<Block, { t: 'sign' }>): string {
  const keepNext = block.keep === true;
  const side = (lines: string[]) => {
    const hasImages = lines.some(isImageLine);
    return cell(
      paragraph(lines[0], { bold: true, color: COLOR.navy, after: 40, keepNext }) +
        lines
          .slice(1)
          .map(line =>
            isImageLine(line)
              ? imageLineXml(line, keepNext)
              : paragraph(line, { size: 19, color: COLOR.grey, after: 40, keepNext })
          )
          .join('') +
        // Le spacer réserve la place de la signature manuscrite, sauf si la ligne d'images la réserve déjà.
        spacer(hasImages ? 60 : 900),
      { width: HALF, borders: 'none' }
    );
  };
  // `keep` : le bloc reste avec le paragraphe qui le précède (jamais seul sur une page).
  const gap = keepNext
    ? '<w:p><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="0" w:line="160" w:lineRule="exact"/></w:pPr></w:p>'
    : spacer(160);
  return gap + table([row([side(block.left), side(block.right)])], [HALF, HALF]);
}

export function renderBlock(block: Block): string {
  switch (block.t) {
    case 'title':
      return titleXml(block);
    case 'h2':
      return h2Xml(block.text);
    case 'p':
      return paragraph(block.text, block.opts);
    case 'lines':
      return block.lines.map(line => paragraph(line, { after: 30 })).join('') + spacer(60);
    case 'bullets':
      return block.items.map(bullet).join('') + spacer(60);
    case 'refs':
      return refsXml(block.rows);
    case 'grid':
      return gridXml(block);
    case 'cols':
      return colsXml(block);
    case 'sign':
      return signXml(block);
    case 'spacer':
      return spacer(120);
    case 'pageBreak':
      return pageBreak();
  }
}

/**
 * Corps ou contenu de cellule. Word exige un paragraphe après un tableau final
 * (avant `sectPr`, ou à la fin d'une cellule) : on l'ajoute au besoin.
 */
export function renderBlocks(blocks: Block[]): string {
  const xml = blocks.map(renderBlock).join('');
  return xml.endsWith('</w:tbl>') ? xml + spacer(20) : xml;
}

// ------------------------------------------------------------ en-tête et pied

const HEADER_WIDTHS = [2300, 5038, 2300];

/** Bandeau : logo de l'émetteur, identité au centre, logo (et nom) de la copropriété. */
export function headerContent(): string {
  const small = { size: 16, color: COLOR.grey, after: 0, align: 'center' } as const;
  const left = cell(paragraph('{{LOGO_EMETTEUR}}', { after: 0 }), {
    width: HEADER_WIDTHS[0],
    borders: 'none',
    vAlign: 'center'
  });
  const center = cell(
    paragraph('{{EMETTEUR_NOM}}', { bold: true, size: 26, color: COLOR.navy, after: 20, align: 'center' }) +
      paragraph('{{EMETTEUR_ADRESSE}}', small) +
      paragraph('{{EMETTEUR_CONTACT}}', small) +
      paragraph('{{EMETTEUR_MENTIONS_LEGALES}}', small),
    { width: HEADER_WIDTHS[1], borders: 'none', vAlign: 'center' }
  );
  const right = cell(
    paragraph('{{LOGO_COPROPRIETE}}', { after: 0, align: 'right' }) +
      paragraph('{{COPROPRIETE_NOM}}', { bold: true, size: 16, color: COLOR.navy, after: 0, align: 'right' }),
    { width: HEADER_WIDTHS[2], borders: 'none', vAlign: 'center' }
  );
  const rule = `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="${COLOR.navy}"/></w:pBdr><w:spacing w:before="60" w:after="0" w:line="40" w:lineRule="exact"/></w:pPr></w:p>`;
  return table([row([left, center, right])], HEADER_WIDTHS) + rule;
}

/** Pied : identité légale de l'émetteur, puis « Page X / Y ». */
export function footerContent(): string {
  const style = { size: 16, color: COLOR.grey };
  return (
    `<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="${COLOR.border}"/></w:pBdr>` +
    `<w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>` +
    richRuns('{{EMETTEUR_PIED_DE_PAGE}}', style) +
    // Libellé « Page » fixe : le modèle est un fichier statique, il ne peut pas
    // appeler t() à l'exécution (le numéro, lui, vient d'un champ PAGE).
    run('  ·  Page ', style) +
    field('PAGE', style) +
    run(' / ', style) +
    field('NUMPAGES', style) +
    `</w:p>`
  );
}
