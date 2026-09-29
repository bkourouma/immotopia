import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { voidDocumentTx } from '../lib/finance/accounting';
import {
  createSupplierInvoiceTx,
  createSupplierPaymentTx,
  validateSupplierPaymentTx,
  createSupplierTx,
  getSuppliersBalance,
  validateSupplierInvoiceTx
} from '../lib/finance/suppliers';
import { unpackPaymentMethod } from '../lib/finance/supplier-payment-method';
import { resolveRange } from '../lib/finance/schemas';
import { roundMoneyXof } from '../lib/finance/money';
import { toAmount, toAmountOrZero } from '../lib/finance/types';
import type { SupplierInvoiceRecord, SupplierPaymentRecord, SupplierRecord } from '../lib/finance/types-lot2';
import {
  createSupplierInvoiceSchema,
  createSupplierPaymentSchema,
  createSupplierSchema,
  listSupplierPaymentsQuerySchema,
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
  contactName: string | null;
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
    contactName: supplier.contactName,
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
  contactName: string | null;
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
    contactName: row.contactName,
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
  /**
   * Le nom du chantier, resolu par le serveur. Ajoute le 20 septembre 2026 :
   * la liste des factures affichait un tiret dans sa colonne « Chantier » meme
   * quand la facture en portait un, car seul l'identifiant partait sur le fil
   * et l'ecran n'avait rien de lisible a montrer. Meme lecon que le compte
   * rendu de campagne du lot 1 — un libelle, jamais un identifiant.
   */
  siteLabel?: string | null;
  siteId: string | null;
  invoiceDate: Date;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  createdByUserId: string;
  validatedByUserId: string | null;
  validatedAt: Date | null;
  /**
   * Ajout additif du 20 septembre 2026 : ce qu'il reste à payer sur la
   * facture (`resolveRemainingPayableByInvoice`, plus bas). Optionnel et
   * `undefined` par défaut : seule la LISTE (`listSupplierInvoicesHandler`)
   * le calcule et le pose — la recette du 20 septembre 2026 a montré qu'une
   * facture soldée depuis mars restait proposée au règlement, faute de ce
   * chiffre. Les autres réponses (création, validation, détail) ne le
   * portent pas, et le contrat (`SupplierInvoice`, `contracts/openapi.yaml`)
   * le décrit comme tel — un ajout, jamais un champ retypé ou retiré.
   */
  remainingPayable?: number | null;
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
function toSupplierInvoiceResponseFromRow(
  row: {
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
  },
  remainingPayable: number | null = null
) {
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
    validatedAt: row.validatedAt,
    remainingPayable
  });
}

// ---------------------------------------------------------------------------
// Reste dû, par facture — lot de requêtes, jamais une par ligne
// ---------------------------------------------------------------------------

/**
 * Ce qui reste à payer sur chaque facture `VALIDATED` d'un lot, en deux
 * requêtes au plus — même discipline que `nomParChantier` juste au-dessus.
 *
 * Reprend le calcul de `resolveSupplierInvoiceSource`
 * (`lib/finance/retentions.ts`), qui pose la même question pièce par pièce
 * pour poser une retenue de garantie : la dette baisse par un règlement
 * VALIDÉ et non annulé, et par une retenue de garantie encore DÉTENUE
 * (`HELD`) — une retenue LIBÉRÉE redevient exigible et ne compte donc plus
 * ici. Une facture qui n'est pas `VALIDATED` n'a constaté aucune dette : son
 * reste dû n'a pas de sens et vaut `null`, sans aucune requête.
 *
 * Pourquoi ce calcul ne vit pas dans `retentions.ts` : cette fonction lit
 * hors transaction, pour un LOT de factures — l'inverse exact de
 * `resolveSupplierInvoiceSource`, qui lit dans une transaction, une seule
 * pièce, comme verrou avant écriture. Les deux répondent à la même question
 * pour deux usages différents ; les fusionner aurait fait porter à l'une la
 * contrainte de l'autre.
 */
async function resolveRemainingPayableByInvoice(
  tenantId: string,
  invoices: Array<{ id: string; amount: unknown; status: string }>
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  const facturesValidees = invoices.filter(invoice => invoice.status === 'VALIDATED');
  for (const invoice of invoices) {
    if (invoice.status !== 'VALIDATED') {
      result.set(invoice.id, null);
    }
  }
  if (facturesValidees.length === 0) {
    return result;
  }

  const invoiceIds = facturesValidees.map(invoice => invoice.id);

  const [affectations, retenues] = await Promise.all([
    prisma.supplierPaymentAllocation.findMany({
      where: { invoiceId: { in: invoiceIds }, payment: { validatedAt: { not: null } } },
      select: { invoiceId: true, amount: true, paymentId: true }
    }),
    prisma.retentionGuarantee.findMany({
      where: { tenantId, sourceType: 'SUPPLIER_INVOICE', sourceId: { in: invoiceIds }, status: 'HELD' },
      select: { sourceId: true, amount: true }
    })
  ]);

  const paiementIds = [...new Set(affectations.map((a: any) => a.paymentId))] as string[];
  const annulations = paiementIds.length
    ? await prisma.voidDocument.findMany({
        where: { tenantId, documentType: 'SUPPLIER_PAYMENT' as any, documentId: { in: paiementIds } },
        select: { documentId: true }
      })
    : [];
  const reglementsAnnules = new Set(annulations.map((a: any) => a.documentId));

  const dejaRegle = new Map<string, number>();
  for (const affectation of affectations as Array<{ invoiceId: string; amount: unknown; paymentId: string }>) {
    if (reglementsAnnules.has(affectation.paymentId)) continue;
    const precedent = dejaRegle.get(affectation.invoiceId) ?? 0;
    dejaRegle.set(affectation.invoiceId, precedent + toAmountOrZero(affectation.amount as any));
  }

  const retenu = new Map<string, number>();
  for (const retenue of retenues as Array<{ sourceId: string; amount: unknown }>) {
    const precedent = retenu.get(retenue.sourceId) ?? 0;
    retenu.set(retenue.sourceId, precedent + toAmountOrZero(retenue.amount as any));
  }

  for (const invoice of facturesValidees) {
    const montant = toAmountOrZero(invoice.amount as any);
    const reste = montant - (dejaRegle.get(invoice.id) ?? 0) - (retenu.get(invoice.id) ?? 0);
    result.set(invoice.id, Math.max(0, roundMoneyXof(reste)));
  }

  return result;
}

/**
 * Serialise un reglement pour la frontiere reseau.
 *
 * Emet `status` et, pour chaque affectation, la REFERENCE de la facture — les
 * deux champs que l'ecran lit reellement (`SupplierPayment` dans
 * `apps/web/src/types/finance-lot2-types.ts`). Ce serialiseur emettait jusqu'au
 * 19 septembre 2026 `method` et `validatedAt`, que personne ne lit, et taisait
 * ceux-la : l'ecran affichait donc un statut vide et des references vides,
 * sans que rien ne le signale.
 *
 * Meme lecon qu'au lot 1 sur le compte rendu de campagne : un libelle lisible,
 * jamais un identifiant, et resolu par une requete PAR LOT, jamais ligne a
 * ligne.
 */
function toSupplierPaymentResponse(input: {
  id: string;
  supplierId: string;
  supplierLabel: string;
  paymentDate: Date;
  amount: number;
  currency: string;
  status: string;
  allocations: Array<{ invoiceId: string; invoiceReference: string; amount: number }>;
}) {
  return { ...input };
}

/**
 * Complete un reglement de ce que le service ne porte pas : le nom du
 * fournisseur et la reference de chaque facture affectee.
 *
 * Deux requetes au plus, jamais une par ligne.
 */
async function enrichirReglement(tenantId: string, record: SupplierPaymentRecord) {
  const [supplier, invoices] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: record.supplierId, tenantId }, select: { name: true } }),
    record.allocations.length > 0
      ? prisma.supplierInvoice.findMany({
          where: { id: { in: record.allocations.map(a => a.invoiceId) }, tenantId },
          select: { id: true, reference: true }
        })
      : Promise.resolve([] as Array<{ id: string; reference: string }>)
  ]);

  const referenceById = new Map(invoices.map(i => [i.id, i.reference]));

  return toSupplierPaymentResponse({
    id: record.id,
    supplierId: record.supplierId,
    supplierLabel: supplier?.name ?? 'Fournisseur inconnu',
    paymentDate: record.paymentDate,
    amount: record.amount,
    currency: record.currency,
    status: record.status,
    allocations: record.allocations.map(a => ({
      invoiceId: a.invoiceId,
      invoiceReference: referenceById.get(a.invoiceId) ?? 'Facture inconnue',
      amount: a.amount
    }))
  });
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
      contactName: body.contactName ?? null,
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

  // Les noms des chantiers visés, en UNE requete pour toute la liste, jamais
  // une par ligne — meme discipline que `enrichirReglement` plus haut.
  const siteIds = [...new Set(invoices.map((row: any) => row.siteId).filter(Boolean))] as string[];
  const sites =
    siteIds.length > 0
      ? await prisma.constructionSite.findMany({
          where: { id: { in: siteIds }, tenantId },
          select: { id: true, name: true }
        })
      : [];
  const nomParChantier = new Map(sites.map(site => [site.id, site.name]));

  // Ajout additif du 20 septembre 2026 : le reste dû, pour que l'écran de
  // règlement (`FactureFournisseur.tsx`) cesse de proposer une facture déjà
  // soldée — voir `resolveRemainingPayableByInvoice` plus haut.
  const resteParFacture = await resolveRemainingPayableByInvoice(
    tenantId,
    invoices.map((row: any) => ({ id: row.id, amount: row.amount, status: row.status }))
  );

  res.status(200).json({
    success: true,
    data: invoices.map((row: any) => ({
      ...toSupplierInvoiceResponseFromRow(row, resteParFacture.get(row.id) ?? null),
      siteLabel: row.siteId ? (nomParChantier.get(row.siteId) ?? null) : null,
      // Ajout additif (BUG-2026-09-29-033) : le bon de commande rapproché, pour
      // que l'écran sache si une facture est déjà rattachée à un bon.
      purchaseOrderId: row.purchaseOrderId ?? null
    }))
  });
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
  const lines = body.lines.length > 0 ? body.lines : [{ label: body.reference, amount: body.amount as number }];

  // Le chantier vient de l'imputation elle-même, et à défaut du `siteId`
  // unique de la requête. C'était l'inverse jusqu'au 20 septembre 2026 : le
  // `siteId` de la requête écrasait celui de chaque imputation, si bien que
  // la forme envoyée par l'écran — un chantier par imputation, aucun à la
  // racine — produisait des imputations sans chantier. Le schéma garantit
  // qu'au moins l'un des deux est présent.
  const allocations = body.allocations.map(allocation => ({
    siteId: (allocation.siteId ?? body.siteId) as string,
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
//
// **Ajout additif du 20 septembre 2026 : `lines` et `allocations`.** Le détail
// ne rendait que l'en-tête de la facture, alors que ses lignes
// (`SupplierInvoiceLine`) et ses imputations (`CostAllocation` de
// `sourceType = 'SUPPLIER_INVOICE'`) sont en base depuis le lot 2. Aucun écran
// ne pouvait donc relire ce qui compose une facture — ce que la duplication
// d'une pièce exige, un en-tête recopié seul n'ayant aucun intérêt.
//
// Ajout strictement additif : les champs déjà émis ne bougent pas, et le
// contrat (`contracts/openapi.yaml`, schéma `SupplierInvoiceDetail`) le décrit
// comme tel.
//
// Les imputations ANNULÉES ne sont pas écartées : `voidedAt` dit ce qui ne
// compte plus au coût du chantier, mais on annule justement pour ressaisir, et
// une facture annulée doit rester duplicable telle qu'elle a été saisie.
// ---------------------------------------------------------------------------

export const getSupplierInvoiceHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const invoiceId = requireUuidParam(req, 'invoiceId');

  const invoice = await prisma.supplierInvoice.findFirst({ where: { id: invoiceId, tenantId } });
  if (!invoice) {
    throw new NotFoundError('Facture fournisseur introuvable ou inaccessible.');
  }

  // Les lignes n'ont pas de `tenantId` : elles tiennent leur isolation de la
  // facture, dont l'appartenance à l'agence vient d'être vérifiée. Les
  // imputations, elles, en portent un, et on le filtre explicitement.
  const [lines, allocations] = await Promise.all([
    prisma.supplierInvoiceLine.findMany({ where: { invoiceId }, orderBy: { createdAt: 'asc' } }),
    prisma.costAllocation.findMany({
      where: { tenantId, sourceType: 'SUPPLIER_INVOICE', sourceId: invoiceId },
      orderBy: { createdAt: 'asc' }
    })
  ]);

  res.status(200).json({
    success: true,
    data: {
      ...toSupplierInvoiceResponseFromRow(invoice as any),
      lines: (lines ?? []).map((line: any) => ({
        id: line.id,
        label: line.label,
        amount: toAmountOrZero(line.amount),
        // `toAmount`, pas `toAmountOrZero` : une ligne sans quantité garde
        // `null`, jamais un « 0 » inventé qui se lirait comme une saisie.
        quantity: toAmount(line.quantity),
        unitPrice: toAmount(line.unitPrice)
      })),
      allocations: (allocations ?? []).map((allocation: any) => ({
        id: allocation.id,
        siteId: allocation.siteId,
        costCategoryId: allocation.costCategoryId,
        amount: toAmountOrZero(allocation.amount)
      }))
    }
  });
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
// H bis. POST supplier-payments/:paymentId/validate
//
// Cette route figurait au contrat OpenAPI depuis le gel du lot 2 et n'avait
// jamais ete ecrite : le reglement naissait deja valide. L'ecran web
// l'appelait pourtant, et recevait un 404 ; la file de validation, qui filtre
// sur l'absence de validation, ne montrait donc jamais aucun reglement.
// Ajoutee le 19 septembre 2026.
//
// Porte le droit de validation, jamais celui de creation : saisir et valider
// sont deux responsabilites distinctes (decision D7).
// ---------------------------------------------------------------------------

export const validateSupplierPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const paymentId = requireUuidParam(req, 'paymentId');
  const actorUserId = requireActorUserId(req);

  const payment = await prisma.$transaction(tx => validateSupplierPaymentTx(tx, tenantId, paymentId, actorUserId));

  res.status(200).json({ success: true, data: await enrichirReglement(tenantId, payment) });
});

// ---------------------------------------------------------------------------
// H ter. POST supplier-payments/:paymentId/void
//
// Le principe P-6 veut qu'une piece validee se corrige par une piece
// d'annulation liee, jamais par une modification. Seule la facture avait cette
// voie ; le reglement et la piece de caisse n'en avaient aucune, et une erreur
// de saisie y etait donc definitive. Ajoutee le 19 septembre 2026.
// ---------------------------------------------------------------------------

export const voidSupplierPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const paymentId = requireUuidParam(req, 'paymentId');
  const body = voidSupplierInvoiceSchema.parse(req.body ?? {});
  const actorUserId = requireActorUserId(req);

  const voidDocument = await prisma.$transaction(async tx => {
    const result = await voidDocumentTx(tx, {
      tenantId,
      documentType: 'SUPPLIER_PAYMENT' as any,
      documentId: paymentId,
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
// J bis. GET suppliers/:supplierId/payments — règlements d'un fournisseur
//
// Ajoutée le 29 septembre 2026 (BUG-2026-09-29-001). Les règlements n'étaient
// relisibles nulle part : l'écran les gardait en mémoire de page, si bien qu'un
// règlement saisi par une personne puis validé par une autre ne pouvait plus
// être retrouvé, donc plus annulé. Lecture directe, filtrée par `tenantId`,
// comme les autres lectures de ce contrôleur ; `?invoiceId=` restreint aux
// règlements qui s'affectent à une facture. Statut déduit comme partout :
// annulé (pièce d'annulation), validé (`validatedAt`), sinon brouillon.
// ---------------------------------------------------------------------------

export const listSupplierPaymentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const supplierId = requireUuidParam(req, 'supplierId');
  const query = listSupplierPaymentsQuerySchema.parse(req.query ?? {});

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, tenantId },
    select: { id: true, name: true }
  });
  if (!supplier) {
    throw new NotFoundError('Fournisseur introuvable ou inaccessible.');
  }

  const userSelect = { id: true, fullName: true, email: true } as const;
  const payments = await prisma.supplierPayment.findMany({
    where: {
      tenantId,
      supplierId,
      ...(query.invoiceId ? { allocations: { some: { invoiceId: query.invoiceId } } } : {})
    },
    include: {
      allocations: true,
      createdBy: { select: userSelect },
      validatedBy: { select: userSelect }
    },
    orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }]
  });

  const paymentIds = payments.map(p => p.id);
  const invoiceIds = [...new Set(payments.flatMap(p => p.allocations.map(a => a.invoiceId)))];
  const treasuryIds = [
    ...new Set(payments.map(p => unpackPaymentMethod(p.method).treasuryAccountId).filter(Boolean))
  ] as string[];

  const [voids, invoices, treasuries] = await Promise.all([
    paymentIds.length
      ? prisma.voidDocument.findMany({
          where: { tenantId, documentType: 'SUPPLIER_PAYMENT' as any, documentId: { in: paymentIds } },
          include: { voidedBy: { select: userSelect } }
        })
      : Promise.resolve([]),
    invoiceIds.length
      ? prisma.supplierInvoice.findMany({
          where: { id: { in: invoiceIds }, tenantId },
          select: { id: true, reference: true }
        })
      : Promise.resolve([]),
    treasuryIds.length
      ? prisma.treasuryAccount.findMany({
          where: { id: { in: treasuryIds }, tenantId },
          select: { id: true, label: true }
        })
      : Promise.resolve([])
  ]);

  const voidByPayment = new Map(voids.map(v => [v.documentId, v]));
  const referenceById = new Map(invoices.map(i => [i.id, i.reference]));
  const treasuryLabelById = new Map(treasuries.map(a => [a.id, a.label]));
  const nameOf = (user: { fullName: string | null; email: string } | null | undefined) =>
    user ? user.fullName || user.email : null;

  res.status(200).json({
    success: true,
    data: payments.map(payment => {
      const voided = voidByPayment.get(payment.id);
      const { method, treasuryAccountId } = unpackPaymentMethod(payment.method);
      return {
        ...toSupplierPaymentResponse({
          id: payment.id,
          supplierId: payment.supplierId,
          supplierLabel: supplier.name,
          paymentDate: payment.paymentDate,
          amount: toAmountOrZero(payment.amount as any),
          currency: payment.currency,
          status: voided ? 'VOIDED' : payment.validatedAt ? 'VALIDATED' : 'DRAFT',
          allocations: payment.allocations.map(a => ({
            invoiceId: a.invoiceId,
            invoiceReference: referenceById.get(a.invoiceId) ?? 'Facture inconnue',
            amount: toAmountOrZero(a.amount as any)
          }))
        }),
        method,
        treasuryAccountId,
        treasuryLabel: treasuryAccountId ? (treasuryLabelById.get(treasuryAccountId) ?? null) : null,
        createdByUserId: payment.createdByUserId,
        createdByName: nameOf(payment.createdBy),
        validatedByUserId: payment.validatedByUserId,
        validatedByName: nameOf(payment.validatedBy),
        validatedAt: payment.validatedAt,
        voidedAt: voided?.voidedAt ?? null,
        voidReason: voided?.reason ?? null,
        voidedByName: nameOf(voided?.voidedBy)
      };
    })
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

  const payment = await prisma.$transaction(tx =>
    createSupplierPaymentTx(tx, tenantId, {
      supplierId,
      paymentDate: body.paymentDate,
      amount: body.amount,
      method: body.method,
      treasuryAccountId: body.treasuryAccountId ?? null,
      allocations: body.allocations,
      createdByUserId: actorUserId
    })
  );

  // Le reglement nait BROUILLON depuis le 19 septembre 2026 : son statut sort
  // du domaine, il n'y a plus rien a relire en base pour le deviner.
  res.status(201).json({ success: true, data: await enrichirReglement(tenantId, payment) });
});
