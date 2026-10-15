import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { AppError } from '../../middleware/error-middleware';
import { logger } from '../../utils/logger';
import { sanitizeDocx } from './sanitize-docx';

/**
 * Conversion DOCX -> PDF par LibreOffice en ligne de commande.
 *
 * - `execFile` avec tableau d'arguments : aucune interpolation dans un shell.
 * - Dossier temporaire unique par appel, supprimé dans tous les cas.
 * - Profil LibreOffice isolé (`-env:UserInstallation`) : pas de verrou partagé
 *   entre conversions concurrentes, pas d'écriture dans le HOME de `node`.
 * - Délai maximal de 60 s.
 * - Environnement du processus réduit à PATH, HOME (le dossier de travail) et LANG :
 *   aucun secret du serveur (JWT, base, clés) n'est hérité par soffice.
 * - DOCX neutralisé avant conversion (relations externes, champs INCLUDE*,
 *   adresses file:, macros : voir sanitize-docx.ts).
 * - Au plus 2 conversions simultanées par processus, 503 au-delà.
 *
 * Activée par `DOCX_PDF_CONVERTER=libreoffice` (image Docker de l'API) ;
 * désactivée par défaut, y compris en développement.
 */

export const DOCX_PDF_CONVERSION_TIMEOUT_MS = 60_000;

const SERVICE_UNAVAILABLE = 503;

/** Conversions simultanées par processus : LibreOffice pèse ~300 Mo chacune. */
export const MAX_CONCURRENT_CONVERSIONS = 2;
let activeConversions = 0;

export function activeConversionCount(): number {
  return activeConversions;
}

/** Environnement minimal de soffice : jamais process.env tel quel. */
export function sofficeEnvironment(workDir: string): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '', HOME: workDir, LANG: 'C.UTF-8' };
  // Windows : soffice.exe a besoin de ces deux variables pour démarrer.
  if (process.platform === 'win32') {
    base.SystemRoot = process.env.SystemRoot ?? '';
    base.TEMP = workDir;
    base.TMP = workDir;
  }
  return base;
}

export function isDocxPdfConversionAvailable(): boolean {
  return (env as { DOCX_PDF_CONVERTER?: string }).DOCX_PDF_CONVERTER === 'libreoffice';
}

function sofficeBinary(): string {
  return process.platform === 'win32' ? 'soffice.exe' : 'soffice';
}

function runSoffice(args: string[], workDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      sofficeBinary(),
      args,
      {
        timeout: DOCX_PDF_CONVERSION_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        env: sofficeEnvironment(workDir)
      },
      error => (error ? reject(error) : resolve())
    );
  });
}

export async function convertDocxToPdf(docx: Buffer): Promise<Buffer> {
  if (!isDocxPdfConversionAvailable()) {
    throw new AppError(
      "La conversion des documents Word en PDF n'est pas activée sur ce serveur.",
      SERVICE_UNAVAILABLE,
      'SERVICE_UNAVAILABLE'
    );
  }
  if (!Buffer.isBuffer(docx) || docx.length === 0) {
    throw new AppError('Le document à convertir est vide.', 400, 'BAD_REQUEST');
  }

  // Neutralisation AVANT toute écriture disque ou occupation d'un emplacement.
  const safeDocx = sanitizeDocx(docx);

  if (activeConversions >= MAX_CONCURRENT_CONVERSIONS) {
    throw new AppError(
      'Le service de conversion est occupé : réessayez dans un instant.',
      SERVICE_UNAVAILABLE,
      'SERVICE_UNAVAILABLE'
    );
  }
  activeConversions += 1;

  const workDir = path.join(os.tmpdir(), `docx2pdf-${randomUUID()}`);
  const inputPath = path.join(workDir, 'document.docx');
  const outputPath = path.join(workDir, 'document.pdf');
  const profileDir = path.join(workDir, 'profile');

  try {
    await fs.mkdir(workDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(inputPath, safeDocx);
    const profileUrl = `file:///${profileDir.replace(/\\/g, '/').replace(/^\/+/, '')}`;
    try {
      await runSoffice(
        [
          `-env:UserInstallation=${profileUrl}`,
          '--headless',
          '--norestore',
          '--convert-to',
          'pdf',
          '--outdir',
          workDir,
          inputPath
        ],
        workDir
      );
    } catch (error) {
      logger.error('Conversion DOCX vers PDF en échec', {
        message: error instanceof Error ? error.message : String(error)
      });
      throw new AppError(
        'La conversion du document en PDF a échoué. Réessayez dans un instant.',
        SERVICE_UNAVAILABLE,
        'SERVICE_UNAVAILABLE'
      );
    }

    let pdf: Buffer;
    try {
      pdf = await fs.readFile(outputPath);
    } catch {
      throw new AppError("La conversion du document en PDF n'a produit aucun fichier.", 500, 'INTERNAL');
    }
    if (pdf.length === 0) {
      throw new AppError("La conversion du document en PDF n'a produit aucun fichier.", 500, 'INTERNAL');
    }
    return pdf;
  } finally {
    activeConversions -= 1;
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
