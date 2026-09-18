import { Request, Response } from 'express';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { prisma } from '../utils/database';
import { toAmountOrZero } from '../lib/finance/types';
import {
  createConstructionSite,
  createCostCategory,
  getSiteDetail,
  listConstructionSites,
  listCostCategories
} from '../lib/finance/sites';
import { createCashVoucherTx, formatCashVoucherNumber, validateCashVoucherTx } from '../lib/finance/cash';
import { getValidationQueue } from '../lib/finance/validation-queue';
import type {
  CashVoucherRecord,
  ConstructionSiteRecord,
  CostCategoryRecord,
  PendingDocument,
  SiteDetail
} from '../lib/finance/types-lot2';
import {
  createCashVoucherSchema,
  createConstructionSiteSchema,
  createCostCategorySchema,
  listConstructionSitesQuerySchema,
  uuidPathParamSchema,
  validationQueueQuerySchema
} from '../lib/finance/schemas-sites';

/**
 * Contrôleur des huit points d'entrée agence « chantiers » du module
 * financier — lot 2, dernière vague.
 *
 * Modèle : `controllers/finance-controller.ts` (lot 1) et
 * `controllers/property-media-controller.ts`. Chaque handler est enveloppé
 * dans `asyncHandler` et laisse les erreurs typées de
 * `middleware/error-middleware` (déjà levées par le domaine —
 * `lib/finance/sites.ts`, `cash.ts`, `validation-queue.ts`) remonter telles
 * quelles : aucun `try/catch` ici ne devine un statut HTTP depuis un message.
 *
 * Isolation multi-tenant : `tenantId` vient toujours de l'URL (posé par
 * `requireTenantAccess` en amont), jamais du corps ou d'une query fournie par
 * l'appelant — même règle que `finance-controller.ts`.
 *
 * Contrat : `specs/017-finance-fournisseurs-chantiers/contracts/openapi.yaml`.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations financières.');
  }
  return tenantId;
}

/** Identifiant de chemin (chantier, bon de caisse) : rejeté en 400 s'il n'a pas la forme d'un UUID. */
function requireUuidParam(req: Request, name: string): string {
  const parsed = uuidPathParamSchema.safeParse(req.params[name]);
  if (!parsed.success) {
    throw new BadRequestError(`Le paramètre ${name} doit être un identifiant valide.`);
  }
  return parsed.data;
}

function requireActorUserId(req: Request): string {
  const actorUserId = req.user?.userId;
  if (!actorUserId) {
    throw new BadRequestError('Utilisateur authentifié requis pour cette opération.');
  }
  return actorUserId;
}

// ---------------------------------------------------------------------------
// Mise en forme des réponses
// ---------------------------------------------------------------------------

function toConstructionSiteResponse(site: ConstructionSiteRecord) {
  return {
    id: site.id,
    name: site.name,
    zone: site.zone,
    propertyId: site.propertyId,
    managerId: site.managerId,
    status: site.status,
    startDate: site.startDate,
    plannedEndDate: site.plannedEndDate,
    progressPercent: site.progressPercent,
    closedAt: site.closedAt,
    finalCost: site.finalCost,
    actualCost: site.actualCost,
    currency: site.currency
  };
}

function toSiteDetailResponse(detail: SiteDetail) {
  return {
    siteId: detail.site.id,
    actualCost: detail.site.actualCost,
    allocations: detail.allocations.map(allocation => ({
      id: allocation.id,
      sourceType: allocation.sourceType,
      sourceId: allocation.sourceId,
      costCategoryLabel: allocation.costCategoryLabel,
      amount: allocation.amount,
      allocationDate: allocation.allocationDate
    })),
    subtotalsByCategory: detail.byCostCategory.map(category => ({
      costCategoryId: category.costCategoryId,
      label: category.label,
      total: category.amount
    }))
  };
}

function toCostCategoryResponse(category: CostCategoryRecord) {
  return {
    id: category.id,
    label: category.label,
    isActive: category.isActive,
    position: category.position
  };
}

/**
 * `CashVoucherRecord.number` (`./types-lot2.ts`) porte déjà le format affiché
 * `AAAA-NNNN` (`cash.ts`, `formatCashVoucherNumber`). Le contrat
 * (`CashVoucher`) attend en plus les deux composantes séparées
 * `voucherNumber`/`voucherYear`, décrites comme « attribuées seulement à la
 * validation » — en réalité déjà posées à l'émission dans l'implémentation
 * gelée de ce lot (`createCashVoucherTx`), qui numérote dès le brouillon. On
 * les redérive ici du format affiché plutôt que de dupliquer une seconde
 * source de vérité : la forme canonique reste `number`.
 */
function toCashVoucherResponse(voucher: CashVoucherRecord) {
  const match = /^(\d{4})-(\d+)$/.exec(voucher.number);
  return {
    id: voucher.id,
    number: voucher.number,
    voucherNumber: match ? Number(match[2]) : null,
    voucherYear: match ? Number(match[1]) : null,
    siteId: voucher.siteId,
    costCategoryId: voucher.costCategoryId,
    beneficiaryName: voucher.beneficiary,
    amount: voucher.amount,
    currency: voucher.currency,
    voucherDate: voucher.voucherDate,
    reason: voucher.reason,
    status: voucher.status,
    createdByUserId: voucher.createdByUserId,
    validatedByUserId: voucher.validatedByUserId,
    validatedAt: voucher.validatedAt
  };
}

function toValidationQueueItemResponse(item: PendingDocument) {
  return {
    documentType: item.documentType,
    documentId: item.documentId,
    label: item.label,
    amount: item.amount,
    currency: item.currency,
    createdAt: item.createdAt,
    createdByUserId: item.createdByUserId,
    createdByLabel: item.createdByLabel
  };
}

// ---------------------------------------------------------------------------
// A. Chantiers — liste
// ---------------------------------------------------------------------------

export const listConstructionSitesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = listConstructionSitesQuerySchema.parse(req.query ?? {});

  const result = await listConstructionSites(tenantId, { status: query.status });

  res.status(200).json({ success: true, data: result.sites.map(toConstructionSiteResponse), total: result.total });
});

// ---------------------------------------------------------------------------
// B. Chantiers — création
// ---------------------------------------------------------------------------

export const createConstructionSiteHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const body = createConstructionSiteSchema.parse(req.body ?? {});

  const site = await createConstructionSite(tenantId, {
    name: body.name,
    zone: body.zone,
    propertyId: body.propertyId ?? null,
    managerId: body.managerId ?? null,
    startDate: body.startDate,
    plannedEndDate: body.plannedEndDate ?? null
  });

  res.status(201).json({ success: true, data: toConstructionSiteResponse(site) });
});

// ---------------------------------------------------------------------------
// C. Chantiers — détail (en-tête)
// ---------------------------------------------------------------------------

/**
 * Le contrat gelé (`types-lot2.ts`) n'expose aucune lecture d'un seul chantier
 * qui n'agrège pas aussi ses imputations : `GetSiteDetail` est le seul accès
 * disponible. On la réutilise ici plutôt que de dupliquer en direct via
 * `prisma` le calcul du coût réel que `sites.ts` porte déjà (`getSiteActualCost`,
 * non exportée) — la duplication d'un calcul comptable est exactement ce que
 * l'en-tête de `cash.ts` signale avoir dû corriger pour le plan de comptes.
 */
export const getConstructionSiteHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');

  const detail = await getSiteDetail(tenantId, siteId);

  res.status(200).json({ success: true, data: toConstructionSiteResponse(detail.site) });
});

// ---------------------------------------------------------------------------
// D. Chantiers — détail des imputations
// ---------------------------------------------------------------------------

export const getConstructionSiteDetailHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');

  const detail = await getSiteDetail(tenantId, siteId);

  res.status(200).json({ success: true, data: toSiteDetailResponse(detail) });
});

// ---------------------------------------------------------------------------
// E. Postes de dépense — liste
// ---------------------------------------------------------------------------

export const listCostCategoriesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);

  const categories = await listCostCategories(tenantId);

  res.status(200).json({ success: true, data: categories.map(toCostCategoryResponse) });
});

// ---------------------------------------------------------------------------
// F. Postes de dépense — création
// ---------------------------------------------------------------------------

export const createCostCategoryHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const body = createCostCategorySchema.parse(req.body ?? {});

  const category = await createCostCategory(tenantId, { label: body.label });

  res.status(201).json({ success: true, data: toCostCategoryResponse(category) });
});

// ---------------------------------------------------------------------------
// G. Pièces de caisse — émission
// ---------------------------------------------------------------------------

export const createCashVoucherHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const siteId = requireUuidParam(req, 'siteId');
  const body = createCashVoucherSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const voucher = await prisma.$transaction(tx =>
    createCashVoucherTx(tx, tenantId, {
      siteId,
      costCategoryId: body.costCategoryId,
      beneficiary: body.beneficiaryName,
      amount: body.amount,
      voucherDate: body.voucherDate,
      reason: body.reason,
      createdByUserId: actorUserId
    })
  );

  res.status(201).json({ success: true, data: toCashVoucherResponse(voucher) });
});

// ---------------------------------------------------------------------------
// H. Pièces de caisse — validation
// ---------------------------------------------------------------------------

/**
 * Aucun `try/catch` ici : `validateCashVoucherTx` (`lib/finance/cash.ts`)
 * lève déjà `ConflictError` (409) sur une pièce déjà validée — « ce qui est
 * validé ne bouge plus » (principe P-6) — et `NotFoundError` (404) sur une
 * pièce absente. `asyncHandler` les transmet telles quelles au middleware
 * central, qui les traduit dans leur statut propre, jamais un 400 générique.
 */
export const validateCashVoucherHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const voucherId = requireUuidParam(req, 'voucherId');
  const actorUserId = requireActorUserId(req);

  const voucher = await prisma.$transaction(tx => validateCashVoucherTx(tx, tenantId, voucherId, actorUserId));

  res.status(200).json({ success: true, data: toCashVoucherResponse(voucher) });
});

// ---------------------------------------------------------------------------
// I. Pièces de caisse — impression PDF
// ---------------------------------------------------------------------------

/**
 * Formate un montant avec un séparateur de milliers, sans passer par
 * `toLocaleString('fr-FR', …)` : ce dernier insère une espace fine insécable
 * (U+202F) entre les groupes de chiffres, qu'aucune police standard WinAnsi
 * de `pdf-lib` ne sait encoder — `PDFPage.drawText` lève alors une erreur à
 * l'impression de tout montant à quatre chiffres ou plus.
 */
function money(value: number, currency: string): string {
  const [integerPart, decimalPart] = value.toFixed(2).split('.');
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped},${decimalPart} ${currency}`;
}

function formatDate(date?: Date | null): string {
  return date ? new Date(date).toLocaleDateString('fr-FR') : '-';
}

/**
 * PDF d'une pièce de caisse, sur le modèle de `lib/finance/statement-pdf.ts`
 * (relevé du lot 1) : même bibliothèque (`pdf-lib`), même format A4, même
 * vocabulaire (« bénéficiaire », « motif »), jamais « débit »/« crédit ».
 *
 * Bâtie ici plutôt que dans un fichier de `lib/finance/`, hors du territoire
 * confié à cet agent pour cette vague : voir le rapport de fin de tâche.
 *
 * Le numéro de la pièce y figure en tête, en gras : c'est par lui qu'on la
 * retrouve, brouillon comme validée.
 */
async function buildCashVoucherPdf(payload: {
  number: string;
  beneficiary: string;
  amount: number;
  currency: string;
  reason: string;
  voucherDate: Date;
  siteName: string;
  costCategoryLabel: string;
  status: string;
  validatedAt: Date | null;
}): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const { height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const left = 40;
  let y = height - 50;

  page.drawText('Bon de caisse', { x: left, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 26;
  page.drawText(`Pièce n° ${payload.number}`, { x: left, y, size: 13, font: bold });
  y -= 30;

  const line = (label: string, value: string) => {
    page.drawText(label, { x: left, y, size: 10, font: bold });
    page.drawText(value, { x: left + 170, y, size: 10, font });
    y -= 18;
  };

  line('Chantier :', payload.siteName);
  line('Poste de dépense :', payload.costCategoryLabel);
  line('Bénéficiaire :', payload.beneficiary);
  line('Motif :', payload.reason);
  line('Date :', formatDate(payload.voucherDate));
  line('Montant :', money(payload.amount, payload.currency));
  line('Statut :', payload.status === 'VALIDATED' ? 'Validée' : 'Brouillon');
  if (payload.validatedAt) {
    line('Validée le :', formatDate(payload.validatedAt));
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

export const printCashVoucherHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const voucherId = requireUuidParam(req, 'voucherId');

  const voucher = await prisma.cashVoucher.findFirst({
    where: { id: voucherId, tenantId },
    include: { site: { select: { name: true } }, costCategory: { select: { label: true } } }
  });
  if (!voucher) {
    throw new NotFoundError('Pièce de caisse introuvable.');
  }

  const number = formatCashVoucherNumber(voucher.voucherYear, voucher.voucherNumber);

  const pdfBuffer = await buildCashVoucherPdf({
    number,
    beneficiary: voucher.beneficiaryName,
    amount: toAmountOrZero(voucher.amount),
    currency: voucher.currency,
    reason: voucher.reason,
    voucherDate: voucher.voucherDate,
    siteName: voucher.site?.name ?? 'Chantier',
    costCategoryLabel: voucher.costCategory?.label ?? 'Poste inconnu',
    status: voucher.validatedAt ? 'VALIDATED' : 'DRAFT',
    validatedAt: voucher.validatedAt ?? null
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="bon-de-caisse-${number}.pdf"`);
  res.status(200).send(pdfBuffer);
});

// ---------------------------------------------------------------------------
// J. File de validation
// ---------------------------------------------------------------------------

/**
 * Le contrat documente aussi un filtre `documentType`, absent de
 * `GetValidationQueue` (`types-lot2.ts`) qui n'accepte que
 * `createdByUserId` : la file regroupe trois natures de pièces lues dans
 * trois tables différentes, et distinguer par nature en amont, à la lecture,
 * appartient au domaine, pas à ce contrôleur — mais le filtrer par nature
 * après coup, ici, ne demande de dupliquer aucune règle métier.
 */
export const getValidationQueueHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = validationQueueQuerySchema.parse(req.query ?? {});

  const items = await getValidationQueue(tenantId, { createdByUserId: query.createdByUserId });
  const filtered = query.documentType ? items.filter(item => item.documentType === query.documentType) : items;

  res.status(200).json({ success: true, data: filtered.map(toValidationQueueItemResponse) });
});
