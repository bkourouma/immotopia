import { PDFDocument } from 'pdf-lib';
import { BadRequestError } from '../../middleware/error-middleware';
import { replaceControlChars } from './text';

/**
 * Validation de la signature saisie ou dessinée (spec 044, SG-R5).
 * - `TYPED` : le nom tapé, 2 à 120 caractères, sans caractère de contrôle ;
 * - `DRAWN` : PNG en `data:image/png;base64,...`, 200 Ko décodés au plus,
 *   signature PNG vérifiée (jamais l'en-tête déclaré seul).
 */

export const TYPED_MAX_LENGTH = 120;
export const DRAWN_MAX_BYTES = 200 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;

export type ParsedSignature = { mode: 'TYPED'; typed: string } | { mode: 'DRAWN'; png: Buffer };

/** Vérifie que le PNG est réellement lisible (il sera incrusté dans le PDF scellé). */
export async function assertReadablePng(png: Buffer): Promise<void> {
  try {
    await (await PDFDocument.create()).embedPng(png);
  } catch {
    throw new BadRequestError('Signature dessinée invalide.');
  }
}

export function parseSignatureInput(mode: 'TYPED' | 'DRAWN', value: string): ParsedSignature {
  if (mode === 'TYPED') {
    const typed = replaceControlChars(value).replace(/\s+/g, ' ').trim();
    if (typed.length < 2 || typed.length > TYPED_MAX_LENGTH) {
      throw new BadRequestError('Saisissez votre nom pour signer.');
    }
    return { mode, typed };
  }
  const match = DATA_URL.exec(value);
  if (!match) throw new BadRequestError('Signature dessinée invalide.');
  const png = Buffer.from(match[1], 'base64');
  if (png.length === 0 || png.length > DRAWN_MAX_BYTES || !png.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new BadRequestError('Signature dessinée invalide.');
  }
  return { mode, png };
}
