import { Request, Response } from 'express';
import { collectNetWorthExport } from '../lib/patrimoine/export/net-worth-data';
import { buildNetWorthPdf } from '../lib/patrimoine/export/net-worth-pdf';
import { netWorthExportQuerySchema } from '../lib/patrimoine/export/net-worth-schema';
import { buildNetWorthWorkbook } from '../lib/patrimoine/export/net-worth-workbook';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';

/**
 * Export de la situation patrimoniale (valeur nette, actifs, dettes,
 * historique) en PDF ou Excel — lot 5. Le fichier est construit en mémoire et
 * renvoyé dans la réponse : jamais écrit sur disque, jamais servi en statique
 * (voir `docs/governance/SECURITY.md`). Le contexte d'agence vient
 * exclusivement de `requireTenantAccess`, jamais d'un paramètre libre.
 */

function resolveTenantId(req: Request): string {
  const tenantId = req.propertyTenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  return tenantId;
}

export const exportNetWorthHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = resolveTenantId(req);
  const { format, asOf } = netWorthExportQuerySchema.parse(req.query ?? {});
  const data = await collectNetWorthExport(tenantId, { asOf });
  const buffer = format === 'pdf' ? await buildNetWorthPdf(tenantId, data) : await buildNetWorthWorkbook(data);

  const contentType =
    format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  // Le nom ne contient que la date de calcul (AAAA-MM-JJ, issue d'un `Date`) : aucune saisie libre.
  const filename = `situation-patrimoniale-${data.asOf.toISOString().slice(0, 10)}.${format}`;
  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(200).send(buffer);
});
