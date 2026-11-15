import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import * as fontkit from '@pdf-lib/fontkit';
import JSZip from 'jszip';
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { runWithAssistantLanguage, runWithLanguage } from '../../src/i18n';
import type { ChartArtifact } from '../../src/lib/ai/artifact-chart-data';
import { buildArtifactPdf } from '../../src/lib/ai/artifact-pdf';
import { chartScene } from '../../src/lib/ai/artifact-chart-scene';
import { buildArtifactCsv } from '../../src/lib/ai/artifact-spreadsheet';

const line: ChartArtifact = {
  id: randomUUID(),
  kind: 'chart',
  chartType: 'line',
  title: 'تفاصيل الإيجار',
  xKey: 'month',
  series: [
    { key: 'xof', label: 'الإيجارات · XOF' },
    { key: 'eur', label: 'الإيجارات · EUR' }
  ],
  data: [
    { month: 'يناير', xof: -12, eur: 5 },
    { month: 'فبراير', xof: null, eur: 0 },
    { month: 'مارس', xof: 0, eur: 8 }
  ],
  provenance: {
    source: 'المدفوعات',
    href: '/rental/payments',
    period: '2025-03',
    calculatedAt: '2025-04-01T00:00:00Z',
    rules: []
  }
};

const pie: ChartArtifact = {
  ...line,
  chartType: 'pie',
  series: [{ key: 'xof', label: 'Parts' }],
  data: [
    { month: 'A', xof: 1 },
    { month: 'B', xof: 3 }
  ]
};

function buildPowerPoint(artifact: ChartArtifact, language: 'ar' | 'fr'): Buffer {
  // Exercise the real dependency in Node. PptxGenJS imports its I/O dependencies dynamically.
  const run = spawnSync(
    process.execPath,
    [
      '-r',
      'ts-node/register/transpile-only',
      '-e',
      `
    const fs = require('node:fs');
    const { buildArtifactPowerPoint } = require('./src/lib/ai/artifact-pptx');
    const { runWithLanguage } = require('./src/i18n');
    const { artifact, language } = JSON.parse(fs.readFileSync(0, 'utf8'));
    runWithLanguage(language, () => buildArtifactPowerPoint(artifact))
      .then(bytes => process.stdout.write(bytes))
      .catch(error => { console.error(error); process.exitCode = 1; });
  `
    ],
    {
      cwd: resolve(__dirname, '../..'),
      input: JSON.stringify({ artifact, language }),
      timeout: 25_000,
      maxBuffer: 10 * 1024 * 1024
    }
  );
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(run.stderr.toString('utf8'));
  return run.stdout;
}

it('rend des courbes vectorielles en PDF et conserve la mise en page arabe', async () => {
  const bytes = await runWithLanguage('ar', () => buildArtifactPdf(line));
  const pdf = await PDFDocument.load(bytes);
  const contents = pdf.getPage(0).node.Contents();
  expect(contents).toBeInstanceOf(PDFArray);
  const segments = (contents as PDFArray).asArray().map(ref => {
    const stream = pdf.context.lookup(ref);
    if (!(stream instanceof PDFRawStream)) throw new Error('Flux PDF absent');
    return Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
  });
  expect(segments.join('\n')).toMatch(/ c\r?\n/); // courbes de Bézier des marqueurs
});

it('incorpore les contours chinois et garde le texte logique hindi dans un export mixte', async () => {
  const title = '租金收入概览';
  const label = 'किराये की आय (XOF)';
  const bytes = await runWithAssistantLanguage('zh', () =>
    buildArtifactPdf({
      ...line,
      title,
      xLabel: '月份',
      series: [{ key: 'xof', label }],
      data: [{ month: '一月', xof: 350_000 }]
    })
  );
  expect(bytes.length).toBeLessThan(250_000);
  const pdf = await PDFDocument.load(bytes);
  const fontStreams = pdf.context.enumerateIndirectObjects().flatMap(([, object]) => {
    if (!(object instanceof PDFDict)) return [];
    const name = object.get(PDFName.of('FontName'))?.toString() ?? '';
    const stream = pdf.context.lookup(object.get(PDFName.of('FontFile2')));
    return stream instanceof PDFRawStream ? [{ name, stream }] : [];
  });
  const font = fontStreams.find(item => item.name.includes('NotoSansSC-Bold'));
  expect(font).toBeDefined();
  const embedded = fontkit.create(decodePDFRawStream(font!.stream).decode());
  for (const character of title) {
    const code = character.codePointAt(0)!;
    expect(embedded.hasGlyphForCodePoint(code)).toBe(true);
    expect(embedded.glyphForCodePoint(code).path.toSVG()).not.toBe('');
  }
  expect(fontStreams.some(item => item.name.includes('NotoSansDevanagari'))).toBe(true);

  const contents = pdf.getPage(0).node.Contents() as PDFArray;
  const drawing = contents
    .asArray()
    .map(ref => {
      const stream = pdf.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) throw new Error('Flux PDF absent');
      return Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
    })
    .join('\n');
  expect(drawing).toContain('/ActualText ' + PDFHexString.fromText(label).toString());
}, 20_000);

it('exporte un graphique modifiable avec données, lacunes et axe arabe', async () => {
  const bytes = buildPowerPoint(line, 'ar');
  const archive = await JSZip.loadAsync(bytes);
  const chart = await archive.file('ppt/charts/chart1.xml')?.async('string');
  expect(chart).toContain('<c:lineChart>');
  expect(chart).toContain('<c:orientation val="maxMin"/>');
  expect(chart).toContain('<c:dispBlanksAs val="gap"/>');
  expect(chart).toMatch(
    /<c:pt idx="0"><c:v>-12<\/c:v><\/c:pt><c:pt idx="1"><c:v><\/c:v><\/c:pt><c:pt idx="2"><c:v>0<\/c:v><\/c:pt>/
  );
  expect(chart).toContain('فبراير');
  const embedded = archive.file(/^ppt\/embeddings\/.*\.xlsx$/);
  expect(embedded).toHaveLength(1);
  const workbook = await JSZip.loadAsync(await embedded[0].async('nodebuffer'));
  const cells = await workbook.file('xl/worksheets/sheet1.xml')?.async('string');
  expect(cells).toMatch(/<c r="B3"><v><\/v><\/c>/);
  expect(cells).toMatch(/<c r="B4"><v>0<\/v><\/c>/);
});

it('exporte un secteur natif et représente les valeurs négatives en barres', async () => {
  const charts = [pie, { ...pie, data: [...pie.data, { month: 'C', xof: -2 }] }];
  const [native, fallback] = await Promise.all(
    charts.map(async artifact => {
      const archive = await JSZip.loadAsync(buildPowerPoint(artifact, 'fr'));
      return archive.file('ppt/charts/chart1.xml')?.async('string');
    })
  );
  expect(native).toContain('<c:pieChart>');
  expect(fallback).toContain('<c:barChart>');
  await expect(buildArtifactPdf(pie)).resolves.toBeInstanceOf(Buffer);
});

it('exporte les nouvelles formes dans les composants natifs PowerPoint et les flux vectoriels PDF', async () => {
  const samples = [
    { artifact: { ...line, chartType: 'horizontal_bar' as const }, xml: ['<c:barDir val="bar"/>'] },
    { artifact: { ...line, chartType: 'stacked_bar' as const }, xml: ['<c:grouping val="stacked"/>'] },
    { artifact: { ...pie, chartType: 'area' as const }, xml: ['<c:areaChart>'] },
    { artifact: { ...pie, chartType: 'stacked_area' as const }, xml: ['<c:areaChart>', '<c:grouping val="stacked"/>'] },
    { artifact: { ...pie, chartType: 'donut' as const }, xml: ['<c:doughnutChart>', '<c:holeSize val="60"/>'] }
  ];
  for (const { artifact, xml } of samples) {
    const archive = await JSZip.loadAsync(buildPowerPoint(artifact, 'fr'));
    const contents = await archive.file('ppt/charts/chart1.xml')?.async('string');
    for (const part of xml) expect(contents).toContain(part);
    const pdf = await PDFDocument.load(await buildArtifactPdf(artifact));
    expect(pdf.getPageCount()).toBeGreaterThan(0);
  }
}, 90_000);

it('garde les coordonnées numériques et les axes natifs du nuage et du combiné', async () => {
  const scatter: ChartArtifact = {
    ...pie,
    chartType: 'scatter',
    xKey: 'x',
    xLabel: 'Surface',
    data: [
      { x: 0, xof: 2 },
      { x: 0, xof: 4 },
      { x: 3.4, xof: 8 }
    ]
  };
  const combo: ChartArtifact = {
    ...line,
    chartType: 'combo',
    series: [
      { key: 'xof', label: 'Montant', form: 'bar', axis: 'primary' },
      { key: 'eur', label: 'Taux', form: 'line', axis: 'secondary' }
    ]
  };
  const [scatterXml, comboXml] = await Promise.all(
    [scatter, combo].map(async artifact => {
      const archive = await JSZip.loadAsync(buildPowerPoint(artifact, 'fr'));
      await expect(buildArtifactPdf(artifact)).resolves.toBeInstanceOf(Buffer);
      return archive.file('ppt/charts/chart1.xml')?.async('string');
    })
  );
  expect(scatterXml).toContain('<c:scatterChart>');
  expect(scatterXml).toMatch(
    /<c:xVal>[\s\S]*?<c:pt idx="0"><c:v>0<\/c:v><\/c:pt><c:pt idx="1"><c:v>0<\/c:v><\/c:pt><c:pt idx="2"><c:v>3.4<\/c:v>/
  );
  expect(comboXml).toContain('<c:lineChart>');
  expect(comboXml).toContain('<c:barChart>');
  expect(comboXml?.match(/<c:valAx>/g)).toHaveLength(2);
}, 45_000);

it('exporte le même dessin et les deux dimensions de la carte de chaleur', async () => {
  const artifact: ChartArtifact = {
    ...pie,
    chartType: 'heatmap',
    groupKey: 'zone',
    groupLabel: 'Zone',
    data: [
      { month: 'Octobre', zone: 'A', xof: 0 },
      { month: 'Novembre', zone: 'A', xof: null }
    ],
    scene: chartScene('heatmap', [
      { category: 'Octobre', group: 'A', value: 0 },
      { category: 'Novembre', group: 'A', value: null }
    ])
  };
  expect(buildArtifactCsv(artifact).toString('utf8')).toContain('"Octobre";"A";0');
  expect(buildArtifactCsv(artifact).toString('utf8')).toContain('"Novembre";"A";""');
  const archive = await JSZip.loadAsync(buildPowerPoint(artifact, 'ar'));
  const slide = await archive.file('ppt/slides/slide2.xml')?.async('string');
  expect(slide).toContain('<a:prstGeom prst="rect">');
  expect(slide).toContain('E7EDF4');
  const pdf = await PDFDocument.load(await runWithLanguage('ar', () => buildArtifactPdf(artifact)));
  expect(pdf.getPageCount()).toBeGreaterThan(0);
});

it('joint l’avertissement du classement à l’export du jeu classé', async () => {
  const notice = 'Les valeurs additives restantes sont regroupées dans « Autres ».';
  const artifact: ChartArtifact = {
    ...pie,
    chartType: 'horizontal_bar',
    notices: [notice],
    data: [
      { month: 'Sélection', xof: 20 },
      { month: 'Autres', xof: 9 }
    ]
  };
  const csv = buildArtifactCsv(artifact).toString('utf8');
  expect(csv).toContain('"Autres";9');
  expect(csv).toContain(notice);
  const archive = await JSZip.loadAsync(buildPowerPoint(artifact, 'fr'));
  const slides = await Promise.all(archive.file(/^ppt\/slides\/slide\d+\.xml$/).map(entry => entry.async('string')));
  expect(slides.join('')).toContain(notice);
});
