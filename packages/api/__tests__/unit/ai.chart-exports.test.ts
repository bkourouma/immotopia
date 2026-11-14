import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { runWithLanguage } from '../../src/i18n';
import type { ChartArtifact } from '../../src/lib/ai/artifact-chart-data';
import { buildArtifactPdf } from '../../src/lib/ai/artifact-pdf';

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
