import { Request, Response } from 'express';
import { exportQuerySchema } from '../lib/patrimoine/schemas';
import { collectAgencyPatrimoineExport, collectPropertyPatrimoineExport } from '../lib/patrimoine/export/data';
import { buildPatrimoinePdf } from '../lib/patrimoine/export/pdf';
import { buildPatrimoineWorkbook } from '../lib/patrimoine/export/workbook';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';

/**
 * Export du patrimoine — agence entière ou un seul bien — en PDF ou Excel
 * (lot P3). Le fichier ne touche jamais le disque : construit en mémoire
 * (`buildPatrimoinePdf`/`buildPatrimoineWorkbook`) et renvoyé directement dans
 * la réponse, jamais servi en statique (voir `docs/governance/SECURITY.md`).
 */

function resolveTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError('TenantId manquant');
  return tenantId;
}

/** Réduit une référence interne aux seuls caractères sûrs pour un nom de fichier. */
function fileSuffix(internalReference: string): string {
  const cleaned = internalReference.replace(/[^A-Za-z0-9-]/g, '');
  return cleaned || 'bien';
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sendExportFile(res: Response, format: 'pdf' | 'xlsx', suffix: string, generatedAt: Date, buffer: Buffer) {
  const contentType =
    format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const filename = `patrimoine-${suffix}-${isoDate(generatedAt)}.${format}`;
  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(200).send(buffer);
}

export const exportAgencyPatrimoineHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const { format } = exportQuerySchema.parse(req.query);
  const data = await collectAgencyPatrimoineExport(tenantId);
  const buffer = format === 'pdf' ? await buildPatrimoinePdf(tenantId, data) : await buildPatrimoineWorkbook(data);
  sendExportFile(res, format, 'agence', data.generatedAt, buffer);
});

export const exportPropertyPatrimoineHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const propertyId = req.params.propertyId;
  if (!propertyId) throw new BadRequestError('PropertyId manquant');
  const { format } = exportQuerySchema.parse(req.query);
  const data = await collectPropertyPatrimoineExport(tenantId, propertyId);
  const buffer = format === 'pdf' ? await buildPatrimoinePdf(tenantId, data) : await buildPatrimoineWorkbook(data);
  const suffix = fileSuffix(data.properties[0]?.internalReference ?? '');
  sendExportFile(res, format, suffix, data.generatedAt, buffer);
});
