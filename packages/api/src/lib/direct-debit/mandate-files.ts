import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { getUploadsRoot } from '../../utils/project-root';
import { BadRequestError } from '../../middleware/error-middleware';
import { t } from '../../i18n';
import { privateUploadPath, readPrivateUpload, type PrivateFile } from '../files/private-files';

/**
 * Scan de l'autorisation signée d'un mandat (spec 042, PB3-R2).
 *
 * Même régime que les pièces des factures de prestataires
 * (`syndics/provider-invoice-files.ts`) : fichier privé sous
 * `uploads/rental/direct-debit/<agence>/<mandat>/` — préfixe que
 * `uploadsAccessGuard` refuse toujours en statique — qui ne sort que par la
 * route authentifiée `GET …/mandates/:mandateId/signed-scan`, après contrôle
 * de l'agence. La valeur stockée en base est un identifiant de stockage,
 * jamais renvoyé au client.
 *
 * Le type est lu dans les octets du fichier (PDF, PNG, JPEG), jamais dans le
 * nom ni dans le type déclaré au dépôt ; le nom stocké est régénéré.
 */

export const MANDATE_SCAN_MAX_BYTES = 10 * 1024 * 1024;

export type MandateScanKind = 'pdf' | 'png' | 'jpg';

/** Type réel d'après les octets magiques, ou `null` si non accepté. */
export function detectMandateScanKind(buffer: Buffer): MandateScanKind | null {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length >= png.length && png.every((byte, index) => buffer[index] === byte)) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  return null;
}

/** Contrôle taille et type ; lève une 400 sinon. */
export function assertMandateScan(buffer: Buffer | undefined): MandateScanKind {
  if (!buffer || buffer.length === 0) {
    throw new BadRequestError(t('Aucun fichier fourni'));
  }
  if (buffer.length > MANDATE_SCAN_MAX_BYTES) {
    throw new BadRequestError(t('Fichier trop volumineux : 10 Mo au maximum.'));
  }
  const kind = detectMandateScanKind(buffer);
  if (!kind) {
    throw new BadRequestError(t('Type de fichier non accepté. Formats autorisés : PDF, PNG, JPEG.'));
  }
  return kind;
}

function folderSegments(tenantId: string, mandateId: string): string[] {
  return ['rental', 'direct-debit', tenantId, mandateId];
}

/** Écrit le fichier sous la racine de référence et renvoie son identifiant de stockage. */
export async function storeMandateScan(
  tenantId: string,
  mandateId: string,
  buffer: Buffer,
  kind: MandateScanKind
): Promise<string> {
  const segments = folderSegments(tenantId, mandateId);
  const directory = path.join(getUploadsRoot(env.UPLOADS_DIR), ...segments);
  await fs.mkdir(directory, { recursive: true });
  const fileName = `${randomUUID()}.${kind}`;
  await fs.writeFile(path.join(directory, fileName), buffer);
  return `/uploads/${segments.join('/')}/${fileName}`;
}

/** Supprime un fichier stocké (au mieux : un fichier déjà absent n'est pas une erreur). */
export async function removeMandateScan(tenantId: string, mandateId: string, filePath: string | null): Promise<void> {
  const relative = privateUploadPath(filePath, folderSegments(tenantId, mandateId));
  if (!relative) return;
  const root = path.resolve(getUploadsRoot(env.UPLOADS_DIR));
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(root + path.sep)) return;
  await fs.unlink(absolute).catch(() => undefined);
}

/** Lit le scan d'un mandat DÉJÀ AUTORISÉ. 404 si absent. */
export function readMandateScan(mandate: {
  tenantId: string;
  id: string;
  signedScanUrl: string | null;
  reference: string;
}): Promise<PrivateFile> {
  return readPrivateUpload(
    privateUploadPath(mandate.signedScanUrl, folderSegments(mandate.tenantId, mandate.id)),
    `mandat-${mandate.reference}-signe`,
    t('Scan signé introuvable.')
  );
}
