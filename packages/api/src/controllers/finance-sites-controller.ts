import { Request, Response } from 'express';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { prisma } from '../utils/database';
import { toAmountOrZero } from '../lib/finance/types';
import {
  createConstructionSite,
  createCostCategory,
  setCostCategoryAccount,
  getSiteDetail,
  listConstructionSites,
  listCostCategories
} from '../lib/finance/sites';
import { createCashVoucherTx, formatCashVoucherNumber, validateCashVoucherTx } from '../lib/finance/cash';
import { voidDocumentTx } from '../lib/finance/accounting';
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
  setCostCategoryAccountSchema,
  listConstructionSitesQuerySchema,
  uuidPathParamSchema,
  voidCashVoucherSchema,
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
    // Le libellé du bien ET celui du responsable, pas seulement leurs
    // identifiants. Les deux écrans des chantiers lisent `propertyLabel` et
    // `managerLabel` depuis toujours ; rien ne les émettait, donc ils
    // arrivaient `undefined` et le repli s'appliquait partout : « Sans bien
    // (terrain loué) » sur un chantier qui avait un bien, « — » sur un
    // chantier qui avait un responsable. Champs **additifs** au contrat gelé,
    // ajoutés au schéma `ConstructionSite` le 20 septembre 2026 ;
    // `propertyId` et `managerId` restent à leur place, sous leur nom.
    propertyLabel: site.propertyLabel,
    managerLabel: site.managerLabel,
    // Le contrat gelé porte `landLeaseId` (`ConstructionSite`, openapi.yaml) et
    // l'écran d'un bail de terrain s'en sert pour prévenir qu'un chantier
    // appartient déjà à un autre bail. L'omettre ici le rendait toujours nul :
    // l'avertissement ne pouvait jamais se déclencher.
    landLeaseId: site.landLeaseId,
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

/**
 * Le détail d'un chantier, tel qu'il part sur le réseau.
 *
 * **Trois champs ajoutés le 20 septembre 2026**, après qu'un test de bout en
 * bout a fait tomber la fiche d'un chantier sur l'écran d'erreur global
 * (« Cannot read properties of undefined »). Tous sont **additifs** : les
 * quatre champs exigés par le contrat gelé (`siteId`, `actualCost`,
 * `allocations`, `subtotalsByCategory`) restent à leur place, sous leur nom.
 *
 * - `site` : le chantier lui-même. Sans lui, la réponse ne portait que des
 *   coûts, et l'écran qui la consomme n'avait ni nom, ni zone, ni statut, ni
 *   dates à afficher. Il est gratuit — `getSiteDetail` a déjà lu la ligne pour
 *   calculer le coût réel — et il évite au front un second aller-retour.
 * - `sourceLabel` : le libellé lisible de la pièce d'origine. `sites.ts` le
 *   résout déjà (« Facture FRS-2026-0142 — Matériaux du Sud »), et cette
 *   fonction le jetait : la colonne « Pièce d'origine » ne pouvait afficher
 *   que du vide. C'est précisément la leçon du lot 1, où un compte rendu ne
 *   montrait que des identifiants — une gestionnaire qui lit « Pièce 3f2a9b8c »
 *   ne peut rien en faire.
 * - `costCategoryId` : l'identifiant du poste, que le front déclare sur chaque
 *   ligne et qui ne se reconstitue pas depuis un libellé.
 */
function toSiteDetailResponse(detail: SiteDetail) {
  return {
    siteId: detail.site.id,
    site: toConstructionSiteResponse(detail.site),
    actualCost: detail.site.actualCost,
    allocations: detail.allocations.map(allocation => ({
      id: allocation.id,
      sourceType: allocation.sourceType,
      sourceId: allocation.sourceId,
      sourceLabel: allocation.sourceLabel,
      costCategoryId: allocation.costCategoryId,
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
 * `CashVoucherRecord.number` (`./types-lot2.ts`) porte le format affiché
 * `AAAA-NNNN` (`cash.ts`, `formatCashVoucherNumber`), ou `null` tant que la
 * pièce est un brouillon. Le contrat attend en plus les deux composantes
 * séparées `voucherNumber`/`voucherYear`, nulles elles aussi jusqu'à la
 * validation.
 *
 * Elles sont redérivées du format affiché plutôt que dupliquées depuis les
 * colonnes : la forme canonique reste `number`, et une seule source de vérité
 * ne peut pas diverger d'elle-même.
 *
 * Le contrat disait « attribuées seulement à la validation » alors que la
 * première implémentation numérotait dès la saisie. La cliente a tranché le
 * 19 septembre 2026 en faveur du contrat : le document et le code disent
 * désormais la même chose.
 */
function toCashVoucherResponse(voucher: CashVoucherRecord) {
  const match = voucher.number ? /^(\d{4})-(\d+)$/.exec(voucher.number) : null;
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

// ---------------------------------------------------------------------------
// PUT cost-categories/:costCategoryId/account
//
// Rattache un poste de depense a un compte de charge, ou l'en detache.
//
// C'est la dette consignee au lot 2 et promise au lot 3 : sans ce lien, toute
// depense de chantier frappe le meme compte, et le grand livre ne distingue pas
// le ciment de la main-d'oeuvre. Ajoutee le 19 septembre 2026.
//
// Droit de PARAMETRAGE (`finance.settings.manage`), comme la creation d'un
// poste : designer le compte d'un poste engage tout ce qui s'y imputera
// ensuite, ce n'est pas un geste de saisie.
// ---------------------------------------------------------------------------

export const setCostCategoryAccountHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const costCategoryId = requireUuidParam(req, 'costCategoryId');
  const body = setCostCategoryAccountSchema.parse(req.body ?? {});

  const category = await setCostCategoryAccount(tenantId, costCategoryId, body.chartOfAccountId);

  res.status(200).json({ success: true, data: toCostCategoryResponse(category) });
});

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
  /** Nul pour un brouillon : le numéro est attribué à la validation. */
  number: string | null;
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
  // Un brouillon n'a pas de numéro, et le bon imprimé le dit en toutes lettres.
  // Un tiret ou une chaîne vide se liraient comme un numéro sur une pièce
  // papier qu'on remet à quelqu'un, ce qui est exactement ce qu'il faut éviter.
  const numeroImprime = payload.number ? `Pièce n° ${payload.number}` : 'Pièce n° : attribué à la validation';
  page.drawText(numeroImprime, { x: left, y, size: 13, font: bold });
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

// ---------------------------------------------------------------------------
// POST cash-vouchers/:voucherId/void
//
// Le principe P-6 veut qu'une piece validee se corrige par une piece
// d'annulation liee, jamais par une modification. Seule la facture fournisseur
// avait cette voie au lot 2 ; une erreur sur une piece de caisse validee etait
// donc definitive, et le cout du chantier restait faux pour toujours.
// Ajoutee le 19 septembre 2026.
//
// `voidDocumentTx` produit l'ecriture inverse ET marque les imputations comme
// annulees, ce qui fait retomber le cout reel du chantier de lui-meme : il est
// derive, jamais stocke (principe P-4).
//
// Porte le droit de validation, jamais celui de creation : annuler une piece
// validee est la meme responsabilite que la valider (decision D7).
// ---------------------------------------------------------------------------

export const voidCashVoucherHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const voucherId = requireUuidParam(req, 'voucherId');
  const body = voidCashVoucherSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const voidDocument = await prisma.$transaction(async tx => {
    const result = await voidDocumentTx(tx, {
      tenantId,
      documentType: 'CASH_VOUCHER' as any,
      documentId: voucherId,
      reason: body.reason,
      voidedByUserId: actorUserId
    });

    return tx.voidDocument.findUniqueOrThrow({ where: { id: result.voidDocumentId } });
  });

  res.status(201).json({
    success: true,
    data: {
      id: voidDocument.id,
      documentType: voidDocument.documentType,
      documentId: voidDocument.documentId,
      reason: voidDocument.reason,
      voidedByUserId: voidDocument.voidedByUserId,
      voidedAt: voidDocument.voidedAt
    }
  });
});

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
