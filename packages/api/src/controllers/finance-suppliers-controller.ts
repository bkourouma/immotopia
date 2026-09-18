import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { voidDocumentTx } from '../lib/finance/accounting';
import {
  createSupplierInvoiceTx,
  createSupplierPaymentTx,
  createSupplierTx,
  getSuppliersBalance,
  validateSupplierInvoiceTx
} from '../lib/finance/suppliers';
import { resolveRange } from '../lib/finance/schemas';
import { toAmountOrZero } from '../lib/finance/types';
import type { SupplierInvoiceRecord, SupplierPaymentRecord, SupplierRecord } from '../lib/finance/types-lot2';
import {
  createSupplierInvoiceSchema,
  createSupplierPaymentSchema,
  createSupplierSchema,
  listSuppliersQuerySchema,
  suppliersBalanceQuerySchema,
  uuidPathParamSchema,
  voidSupplierInvoiceSchema
} from '../lib/finance/schemas-suppliers';
import { prisma } from '../utils/database';

/**
 * Contrôleur des dix points d'entrée agence du module financier
 * opérationnel — lot 2, volet fournisseurs.
 *
 * Modèle : `controllers/finance-controller.ts` (lot 1). Chaque handler est
 * enveloppé dans `asyncHandler` et laisse le middleware central
 * (`middleware/error-middleware.ts`) traduire les erreurs — celles du
 * domaine (`lib/finance/suppliers.ts`, `lib/finance/accounting.ts`,
 * typées par `lib/errors.ts`) comme celles levées ici (`BadRequestError`,
 * `NotFoundError` de `middleware/error-middleware.ts`). Aucun `try/catch` ne
 * devine de statut HTTP depuis un message.
 *
 * Isolation multi-tenant : `tenantId` vient toujours de l'URL (posé par
 * `requireTenantAccess` en amont), jamais du corps ou d'une query.
 *
 * **Lectures sans fonction de contrat.** `types-lot2.ts` ne décrit que cinq
 * fonctions fournisseurs, toutes des écritures ou la balance ; aucune ne lit
 * la liste des fournisseurs, le détail d'un fournisseur, la liste des
 * factures d'un fournisseur ou le détail d'une facture. Ces quatre lectures
 * passent donc directement par `prisma`, filtrées par `tenantId`, exactement
 * comme `listBillingRunsHandler`/`getBillingRunHandler` le font déjà au
 * lot 1 pour une raison identique.
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

/** Identifiant de chemin (fournisseur, facture) : rejeté en 400 s'il n'a pas la forme d'un UUID. */
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
    throw new BadRequestError('Utilisateur authentifié requis pour cette opération financière.');
  }
  return actorUserId;
}

// ---------------------------------------------------------------------------
// Mise en forme des réponses
// ---------------------------------------------------------------------------

interface SupplierResponseInput {
  id: string;
  name: string;
  kind: string;
  contactPhone: string | null;
  contactEmail: string | null;
  maintenanceVendorId: string | null;
  thirdPartyAccountId: string;
  isActive: boolean;
  balance: number;
  currency: string;
}

function serializeSupplier(input: SupplierResponseInput) {
  return { ...input };
}

/** Sérialise un `SupplierRecord` du domaine, une fois son compte de tiers résolu. */
function toSupplierResponseFromRecord(supplier: SupplierRecord, account: { balance: number; currency: string }) {
  return serializeSupplier({
    id: supplier.id,
    name: supplier.name,
    kind: supplier.kind,
    contactPhone: supplier.phone,
    contactEmail: supplier.email,
    maintenanceVendorId: supplier.maintenanceVendorId,
    thirdPartyAccountId: supplier.thirdPartyAccountId,
    isActive: supplier.isActive,
    balance: account.balance,
    currency: account.currency
  });
}

/** Sérialise une ligne `Supplier` lue directement en base, avec son compte de tiers joint. */
function toSupplierResponseFromRow(row: {
  id: string;
  name: string;
  kind: string;
  contactPhone: string | null;
  contactEmail: string | null;
  maintenanceVendorId: string | null;
  thirdPartyAccountId: string;
  isActive: boolean;
  thirdPartyAccount: { balance: unknown; currency: string };
}) {
  return serializeSupplier({
    id: row.id,
    name: row.name,
    kind: row.kind,
    contactPhone: row.contactPhone,
    contactEmail: row.contactEmail,
    maintenanceVendorId: row.maintenanceVendorId,
    thirdPartyAccountId: row.thirdPartyAccountId,
    isActive: row.isActive,
    balance: toAmountOrZero(row.thirdPartyAccount.balance as any),
    currency: row.thirdPartyAccount.currency
  });
}

interface SupplierInvoiceResponseInput {
  id: string;
  supplierId: string;
  siteId: string | null;
  invoiceDate: Date;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  createdByUserId: string;
  validatedByUserId: string | null;
  validatedAt: Date | null;
}

function serializeSupplierInvoice(input: SupplierInvoiceResponseInput) {
  return { ...input };
}

/** Sérialise un `SupplierInvoiceRecord` du domaine (déjà en `number`). */
function toSupplierInvoiceResponseFromRecord(invoice: SupplierInvoiceRecord) {
  return serializeSupplierInvoice({
    id: invoice.id,
    supplierId: invoice.supplierId,
    siteId: invoice.siteId,
    invoiceDate: invoice.invoiceDate,
    reference: invoice.reference,
    amount: invoice.amount,
    currency: invoice.currency,
    status: invoice.status,
    createdByUserId: invoice.createdByUserId,
    validatedByUserId: invoice.validatedByUserId,
    validatedAt: invoice.validatedAt
  });
}

/** Sérialise une ligne `SupplierInvoice` lue directement en base (montant en `Decimal`). */
function toSupplierInvoiceResponseFromRow(row: {
  id: string;
  supplierId: string;
  siteId: string | null;
  invoiceDate: Date;
  reference: string;
  amount: unknown;
  currency: string;
  status: string;
  createdByUserId: string;
  validatedByUserId: string | null;
  validatedAt: Date | null;
}) {
  return serializeSupplierInvoice({
    id: row.id,
    supplierId: row.supplierId,
    siteId: row.siteId,
    invoiceDate: row.invoiceDate,
    reference: row.reference,
    amount: toAmountOrZero(row.amount as any),
    currency: row.currency,
    status: row.status,
    createdByUserId: row.createdByUserId,
    validatedByUserId: row.validatedByUserId,
    validatedAt: row.validatedAt
  });
}

function toSupplierPaymentResponse(input: {
  id: string;
  supplierId: string;
  paymentDate: Date;
  amount: number;
  currency: string;
  method: string;
  validatedAt: Date | null;
  allocations: SupplierPaymentRecord['allocations'];
}) {
  return { ...input };
}

// ---------------------------------------------------------------------------
// A. GET suppliers — liste
// ---------------------------------------------------------------------------

export const listSuppliersHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = listSuppliersQuerySchema.parse(req.query ?? {});

  const suppliers = await prisma.supplier.findMany({
    where: {
      tenantId,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {})
    },
    include: { thirdPartyAccount: { select: { balance: true, currency: true } } },
    orderBy: { name: 'asc' }
  });

  res.status(200).json({ success: true, data: suppliers.map((row: any) => toSupplierResponseFromRow(row)) });
});

// ---------------------------------------------------------------------------
// B. POST suppliers — création
// ---------------------------------------------------------------------------

export const createSupplierHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const body = createSupplierSchema.parse(req.body ?? {});

  const { supplier, account } = await prisma.$transaction(async tx => {
    const created = await createSupplierTx(tx, tenantId, {
      name: body.name,
      kind: body.kind as any,
      phone: body.contactPhone ?? null,
      email: body.contactEmail ?? null,
      maintenanceVendorId: body.maintenanceVendorId ?? null
    });

    const accountRow = await tx.thirdPartyAccount.findUniqueOrThrow({
      where: { id: created.thirdPartyAccountId },
      select: { balance: true, currency: true }
    });

    return { supplier: created, account: accountRow };
  });

  res.status(201).json({
    success: true,
    data: toSupplierResponseFromRecord(supplier, {
      balance: toAmountOrZero(account.balance as any),
      currency: account.currency
    })
  });
});

// ---------------------------------------------------------------------------
// C. GET suppliers/balance
//
// Déclarée, côté routeur, AVANT `GET suppliers/:supplierId` : sinon Express
// capture `balance` comme un identifiant de fournisseur. Voir
// `routes/finance-suppliers-routes.ts`.
// ---------------------------------------------------------------------------

export const getSuppliersBalanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const query = suppliersBalanceQuerySchema.parse(req.query ?? {});
  const range = resolveRange(query);

  const result = await getSuppliersBalance(tenantId, {
    range: range.from || range.to ? range : undefined,
    siteId: query.siteId
  });

  res.status(200).json({ success: true, data: result });
});

// ---------------------------------------------------------------------------
// D. GET suppliers/:supplierId — détail
// ---------------------------------------------------------------------------

export const getSupplierHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const supplierId = requireUuidParam(req, 'supplierId');

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, tenantId },
    include: { thirdPartyAccount: { select: { balance: true, currency: true } } }
  });

  if (!supplier) {
    throw new NotFoundError('Fournisseur introuvable ou inaccessible.');
  }

  res.status(200).json({ success: true, data: toSupplierResponseFromRow(supplier as any) });
});

// ---------------------------------------------------------------------------
// E. GET suppliers/:supplierId/invoices — liste
// ---------------------------------------------------------------------------

export const listSupplierInvoicesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const supplierId = requireUuidParam(req, 'supplierId');

  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true } });
  if (!supplier) {
    throw new NotFoundError('Fournisseur introuvable ou inaccessible.');
  }

  const invoices = await prisma.supplierInvoice.findMany({
    where: { supplierId, tenantId },
    orderBy: { invoiceDate: 'desc' }
  });

  res.status(200).json({ success: true, data: invoices.map((row: any) => toSupplierInvoiceResponseFromRow(row)) });
});

// ---------------------------------------------------------------------------
// F. POST suppliers/:supplierId/invoices — saisie en brouillon
// ---------------------------------------------------------------------------

export const createSupplierInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const supplierId = requireUuidParam(req, 'supplierId');
  const body = createSupplierInvoiceSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  // Une ligne unique par défaut quand l'écran n'en envoie pas : le domaine
  // (`createSupplierInvoiceTx`, `lib/finance/suppliers.ts`) exige au moins
  // une ligne et calcule le montant de la facture à partir d'elles.
  const lines = body.lines.length > 0 ? body.lines : [{ label: body.reference, amount: body.amount }];

  // Le contrat porte un `siteId` unique au niveau de la requête ; le domaine
  // attend un `siteId` par ligne d'imputation. Le schéma Zod garantit déjà
  // que `siteId` est présent dès qu'une imputation existe (voir
  // `schemas-suppliers.ts`).
  const allocations = body.allocations.map(allocation => ({
    siteId: body.siteId as string,
    costCategoryId: allocation.costCategoryId,
    amount: allocation.amount
  }));

  const invoice = await prisma.$transaction(tx =>
    createSupplierInvoiceTx(tx, tenantId, {
      supplierId,
      invoiceDate: body.invoiceDate,
      reference: body.reference,
      lines,
      allocations,
      createdByUserId: actorUserId
    })
  );

  res.status(201).json({ success: true, data: toSupplierInvoiceResponseFromRecord(invoice) });
});

// ---------------------------------------------------------------------------
// G. GET supplier-invoices/:invoiceId — détail
// ---------------------------------------------------------------------------

export const getSupplierInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const invoiceId = requireUuidParam(req, 'invoiceId');

  const invoice = await prisma.supplierInvoice.findFirst({ where: { id: invoiceId, tenantId } });
  if (!invoice) {
    throw new NotFoundError('Facture fournisseur introuvable ou inaccessible.');
  }

  res.status(200).json({ success: true, data: toSupplierInvoiceResponseFromRow(invoice as any) });
});

// ---------------------------------------------------------------------------
// H. POST supplier-invoices/:invoiceId/validate
//
// Porte le droit de validation (`requireDocumentsValidate`), distinct de la
// création (décision D7) : voir `middleware/finance-rbac-middleware.ts`.
// Une seconde tentative sur une facture déjà validée renvoie 409 (conflit
// d'état), pas 400 — c'est `validateSupplierInvoiceTx` qui le lève
// (`conflict()`, `lib/errors.ts`) : une pièce validée est immuable (P-6).
// ---------------------------------------------------------------------------

export const validateSupplierInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const invoiceId = requireUuidParam(req, 'invoiceId');
  const actorUserId = requireActorUserId(req);

  const invoice = await prisma.$transaction(tx => validateSupplierInvoiceTx(tx, tenantId, invoiceId, actorUserId));

  res.status(200).json({ success: true, data: toSupplierInvoiceResponseFromRecord(invoice) });
});

// ---------------------------------------------------------------------------
// I. POST supplier-invoices/:invoiceId/void
//
// Porte aussi le droit de validation, jamais celui de création : annuler une
// pièce validée est la même responsabilité que la valider (décision D7).
// ---------------------------------------------------------------------------

export const voidSupplierInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const invoiceId = requireUuidParam(req, 'invoiceId');
  const body = voidSupplierInvoiceSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const voidDocument = await prisma.$transaction(async tx => {
    const result = await voidDocumentTx(tx, {
      tenantId,
      documentType: 'SUPPLIER_INVOICE' as any,
      documentId: invoiceId,
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

// ---------------------------------------------------------------------------
// J. POST suppliers/:supplierId/payments — règlement
// ---------------------------------------------------------------------------

export const createSupplierPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const supplierId = requireUuidParam(req, 'supplierId');
  const body = createSupplierPaymentSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const { payment, methodAndValidation } = await prisma.$transaction(async tx => {
    const created = await createSupplierPaymentTx(tx, tenantId, {
      supplierId,
      paymentDate: body.paymentDate,
      amount: body.amount,
      allocations: body.allocations,
      createdByUserId: actorUserId
    });

    // `method` et `validatedAt` sont écrits par le domaine mais absents de
    // `SupplierPaymentRecord` (voir l'en-tête de `lib/finance/suppliers.ts`
    // pour l'écart entre le contrat gelé et le schéma) : on les relit dans la
    // même transaction plutôt que de deviner la valeur par défaut du domaine.
    const row = await tx.supplierPayment.findUniqueOrThrow({
      where: { id: created.id },
      select: { method: true, validatedAt: true }
    });

    return { payment: created, methodAndValidation: row };
  });

  res.status(201).json({
    success: true,
    data: toSupplierPaymentResponse({
      id: payment.id,
      supplierId: payment.supplierId,
      paymentDate: payment.paymentDate,
      amount: payment.amount,
      currency: payment.currency,
      method: methodAndValidation.method,
      validatedAt: methodAndValidation.validatedAt,
      allocations: payment.allocations
    })
  });
});
