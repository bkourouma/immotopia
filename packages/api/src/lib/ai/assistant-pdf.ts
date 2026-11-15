import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { t } from '../../i18n';
import { AppError, BadRequestError } from '../../middleware/error-middleware';

const MAX_PDF_PAGES = 30;
const MAX_PDF_WORKERS = 2;
const PDF_TIMEOUT_MS = 8_000;
let activeWorkers = 0;

// Code fixe sans interpolation du contenu PDF. La session d’extraction est isolée
// du serveur et prend fin au plus tard à l’expiration de son délai.
const workerCode = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  const { getDocument } = await import(workerData.moduleUrl);
  const task = getDocument({
    data: workerData.data, disableFontFace: true, useSystemFonts: false,
    useWasm: false, stopAtErrors: true, verbosity: 0
  });
  try {
    const pdf = await task.promise;
    let excerpt = '';
    const limit = Math.min(pdf.numPages, workerData.maxPages);
    for (let index = 1; index <= limit && excerpt.length < workerData.maxChars; index++) {
      const page = await pdf.getPage(index);
      const reader = page.streamTextContent().getReader();
      try {
        while (excerpt.length < workerData.maxChars) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const item of value.items) {
            if (typeof item.str !== 'string') continue;
            excerpt += item.str.slice(0, workerData.maxChars - excerpt.length);
            excerpt += item.hasEOL ? '\n' : ' ';
            if (excerpt.length >= workerData.maxChars) break;
          }
        }
      } finally {
        await reader.cancel();
        page.cleanup();
      }
      excerpt += '\n';
    }
    return excerpt.slice(0, workerData.maxChars).trim();
  } finally {
    await task.destroy();
  }
})().then(excerpt => parentPort.postMessage(excerpt), () => parentPort.postMessage(null));
`;

export async function readAssistantPdf(buffer: Buffer, maxChars: number): Promise<string> {
  const invalid = () => new BadRequestError(t('Ce PDF est illisible ou protégé.'));
  if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw invalid();
  if (activeWorkers >= MAX_PDF_WORKERS) {
    throw new AppError(t('La lecture des PDF est occupée. Réessayez dans un instant.'), 503);
  }
  activeWorkers++;
  let worker: Worker | undefined;
  try {
    const active = new Worker(workerCode, {
      eval: true,
      workerData: {
        data: new Uint8Array(buffer),
        moduleUrl: pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href,
        maxPages: MAX_PDF_PAGES,
        maxChars
      },
      resourceLimits: { maxOldGenerationSizeMb: 80, maxYoungGenerationSizeMb: 16 }
    });
    worker = active;
    const excerpt = await new Promise<string | null>((resolve, reject) => {
      const timeout = setTimeout(() => reject(invalid()), PDF_TIMEOUT_MS);
      const finish = (text: string | null) => {
        clearTimeout(timeout);
        resolve(text);
      };
      active.once('message', finish);
      active.once('error', () => finish(null));
      active.once('exit', () => finish(null));
    });
    if (excerpt === null) throw invalid();
    if (!excerpt) throw new BadRequestError(t('Aucun texte lisible dans les 30 premières pages de ce PDF.'));
    return excerpt;
  } finally {
    try {
      await worker?.terminate();
    } finally {
      activeWorkers--;
    }
  }
}
