/**
 * Fournisseurs — lot 2 (`specs/017-finance-fournisseurs-chantiers/`).
 *
 * Fait exister l'argent qui SORT : jusqu'ici l'application ne connaissait que
 * des `MaintenanceVendor` sans compte, sans facture, sans solde. Ce fichier
 * implemente les cinq fonctions fournisseurs du contrat gele
 * (`./types-lot2.ts`) : creation du fournisseur et de son compte, saisie
 * d'une facture brouillon, validation (ecriture + mouvement + imputations),
 * reglement, et balance.
 *
 * Trois regles du contrat s'appliquent ici sans exception :
 *
 *   1. **Aucun « débit » ni « crédit » ne sort d'ici.** La frontiere parle
 *      `amountBilled` / `amountSettled` ; un test de ce fichier le verifie
 *      sur toutes les chaines renvoyees.
 *   2. **Toute fonction qui ecrit prend le client de transaction fourni par
 *      l'appelant.** Rien n'ouvre sa propre transaction ici : la piece, son
 *      ecriture, son mouvement et ses imputations naissent ensemble.
 *   3. **La piece precede l'ecriture** (P-2) : `createSupplierInvoiceTx` ne
 *      produit aucune ecriture ni aucune imputation validee — seulement des
 *      lignes de facture et des imputations *non validees* (`validatedAt`
 *      nul), qui ne comptent pour rien tant que la facture n'est pas validee.
 *
 * **Deux ecarts entre le contrat gele et le schema gele, tous deux
 * documentes ici plutot que silencieux** (aucun des deux fichiers n'est
 * modifiable par cet agent) :
 *
 *   - `CreateSupplierTx` accepte `contactName`, mais `Supplier` ne porte que
 *     `contactPhone` / `contactEmail` (pas de colonne pour un nom de
 *     contact). Le parametre est accepte pour respecter la signature, mais
 *     n'est persiste nulle part ; `SupplierRecord.contactName` vaut toujours
 *     `null`.
 *   - `CreateSupplierPaymentTx` ne recoit aucun `method`, mais
 *     `SupplierPayment.method` est une colonne `String` obligatoire. Une
 *     valeur par defaut (`DEFAULT_PAYMENT_METHOD`) est ecrite a sa place.
 *
 * **Un troisieme ecart, de placement plutot que de forme** : le talon de
 * `getSuppliersBalance` (`types-lot2.ts`) suggere une implementation dans
 * `lib/finance/reports.ts`. Le territoire confie a cet agent se limite a ce
 * fichier (`suppliers.ts`) et a son test ; la fonction est donc definie et
 * exportee ici, sous le meme nom et la meme signature — a re-exporter depuis
 * `reports.ts` si une centralisation y est souhaitee plus tard.
 */

import { prisma } from '../../utils/database';
import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest, conflict, notFound } from '../errors';
import { ensureOperationalChartOfAccountsTx, ensureOperationalJournalTx, postDocumentEntryTx } from './accounting';
import { appendThirdPartyMovementTx } from './ledger';
import { syncWorkProgramCostTx } from './cost-allocation';
import { roundMoneyXof } from './money';
import type { FinanceSourceType } from './types';
import { toAmountOrZero } from './types';
import type {
  CreateSupplierInvoiceTx,
  CreateSupplierPaymentTx,
  ValidateSupplierPaymentTx,
  CreateSupplierTx,
  GetSuppliersBalance,
  SupplierInvoiceRecord,
  SupplierPaymentRecord,
  SupplierRecord,
  SuppliersBalanceLine,
  ValidateSupplierInvoiceTx
} from './types-lot2';
import type { PeriodRange } from './types';

/** Devise unique du lot (decision D9 du plan, deja actee au lot 1). */
const DEFAULT_CURRENCY = 'XOF';

/**
 * `SupplierPayment.method` est obligatoire en base mais absent du contrat
 * gele de `CreateSupplierPaymentTx`. Voir l'en-tete du fichier.
 */
const DEFAULT_PAYMENT_METHOD = 'OTHER';

// ---------------------------------------------------------------------------
// FinanceSourceType (lot 1) est un union ferme aux natures du lot 1 —
// on ne peut pas l'etendre sans modifier `types.ts`, gele. La colonne
// `ThirdPartyMovement.sourceType` est elle un `String` brut en base (jamais
// un enum Postgres) : rien n'empeche d'y ecrire une nature du lot 2, seul le
// type TypeScript est trop etroit. On l'elargit ici, localement, par une
// conversion explicite plutot que par un `any` disperse dans tout le fichier.
// ---------------------------------------------------------------------------

type SupplierSourceType = 'SUPPLIER_INVOICE' | 'SUPPLIER_PAYMENT' | 'SUPPLIER_PAYMENT_ALLOCATION';

function asFinanceSourceType(value: SupplierSourceType): FinanceSourceType {
  return value as unknown as FinanceSourceType;
}

// ---------------------------------------------------------------------------
// Plan de comptes operationnel
//
// Ce fichier portait sa propre copie du plan de comptes, ecrite faute
// d'acces a celle du moteur comptable pendant le developpement en
// parallele. Elle est retiree : `accounting.ts` fait foi, seul.
//
// Les deux copies avaient deja diverge — la tresorerie etait ici le compte
// 521, et le 571 pour la caisse. Un reglement fournisseur et un bon de
// caisse auraient credite deux comptes differents pour le meme argent.
// ---------------------------------------------------------------------------

interface OperationalAccounts {
  journalId: string;
  fournisseursAccountId: string;
  achatsAccountId: string;
  banqueAccountId: string;
}

/**
 * Resout le journal et les comptes dont une piece fournisseur a besoin.
 *
 * **Delegue au moteur comptable, et ne redefinit rien.** Ce fichier portait sa
 * propre copie du plan de comptes, ecrite faute d'acces a celle du moteur
 * pendant le developpement en parallele. Les deux avaient deja diverge : la
 * tresorerie y etait le compte 521, alors que la caisse ecrivait au 571. Un
 * reglement fournisseur et un bon de caisse auraient credite deux comptes
 * differents pour le meme argent.
 *
 * `OPERATIONAL_ACCOUNT_SEEDS` (accounting.ts) fait desormais foi, seul.
 */
async function resolveOperationalAccounts(
  tx: PrismaTransactionClient,
  tenantId: string,
  entryDate: Date
): Promise<OperationalAccounts> {
  const [journalId, comptes] = await Promise.all([
    ensureOperationalJournalTx(tx, tenantId, entryDate.getFullYear()),
    ensureOperationalChartOfAccountsTx(tx, tenantId)
  ]);

  const exiger = (numero: string): string => {
    const id = comptes.get(numero);
    if (!id) {
      throw new Error(`Compte operationnel ${numero} absent apres amorcage du plan de comptes.`);
    }
    return id;
  };

  return {
    journalId,
    fournisseursAccountId: exiger('401'),
    achatsAccountId: exiger('601'),
    // La tresorerie est le compte 571, comme pour la caisse. C'est le meme
    // argent, et il ne sort pas par deux portes.
    banqueAccountId: exiger('571')
  };
}

// ---------------------------------------------------------------------------
// Conversions Prisma -> contrat
// ---------------------------------------------------------------------------

function toSupplierRecord(row: any): SupplierRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    kind: row.kind,
    // Pas de colonne `contactName` sur `Supplier` — voir l'en-tete du fichier.
    contactName: null,
    phone: row.contactPhone ?? null,
    email: row.contactEmail ?? null,
    maintenanceVendorId: row.maintenanceVendorId ?? null,
    thirdPartyAccountId: row.thirdPartyAccountId,
    isActive: row.isActive
  };
}

function toInvoiceRecord(row: any): SupplierInvoiceRecord {
  return {
    id: row.id,
    supplierId: row.supplierId,
    siteId: row.siteId ?? null,
    invoiceDate: row.invoiceDate,
    reference: row.reference,
    amount: toAmountOrZero(row.amount),
    currency: row.currency,
    status: row.status,
    createdByUserId: row.createdByUserId,
    validatedByUserId: row.validatedByUserId ?? null,
    validatedAt: row.validatedAt ?? null
  };
}

function toPaymentRecord(
  row: any,
  allocations: Array<{ invoiceId: string; amount: number }>,
  voided = false
): SupplierPaymentRecord {
  return {
    id: row.id,
    supplierId: row.supplierId,
    paymentDate: row.paymentDate,
    amount: toAmountOrZero(row.amount),
    currency: row.currency,
    // `SupplierPayment` n'a pas de colonne `status` : il se deduit de
    // `validatedAt` et de la presence d'une pièce d'annulation, comme pour la
    // piece de caisse. Jusqu'au 19 septembre 2026 ce champ valait toujours
    // VALIDATED, parce que le reglement naissait valide — ce qui rendait la
    // file de validation vide de reglements par construction.
    status: voided ? ('VOIDED' as any) : row.validatedAt ? ('VALIDATED' as any) : ('DRAFT' as any),
    allocations
  };
}

// ---------------------------------------------------------------------------
// A. Creation du fournisseur et de son compte de tiers
// ---------------------------------------------------------------------------

/** Voir `CreateSupplierTx` dans `./types-lot2.ts`. */
export const createSupplierTx: CreateSupplierTx = async (tx, tenantId, params) => {
  // Le compte nait avec le fournisseur, dans la meme transaction : un
  // fournisseur sans compte ne pourrait rien devoir, et le premier reglement
  // le trouverait manquant.
  const account = await tx.thirdPartyAccount.create({
    data: {
      tenantId,
      kind: 'SUPPLIER' as any,
      label: params.name,
      balance: 0,
      currency: DEFAULT_CURRENCY
    }
  });

  const supplier = await tx.supplier.create({
    data: {
      tenantId,
      name: params.name,
      kind: params.kind as any,
      contactPhone: params.phone ?? undefined,
      contactEmail: params.email ?? undefined,
      maintenanceVendorId: params.maintenanceVendorId ?? undefined,
      thirdPartyAccountId: account.id
    }
  });

  return toSupplierRecord(supplier);
};

// ---------------------------------------------------------------------------
// B. Saisie d'une facture fournisseur (brouillon)
// ---------------------------------------------------------------------------

/** Voir `CreateSupplierInvoiceTx` dans `./types-lot2.ts`. */
export const createSupplierInvoiceTx: CreateSupplierInvoiceTx = async (tx, tenantId, params) => {
  const supplier = await tx.supplier.findFirst({
    where: { id: params.supplierId, tenantId },
    select: { id: true, kind: true }
  });

  if (!supplier) {
    throw notFound('Fournisseur introuvable');
  }

  // FR-010 / besoin B7 : un sac de ciment est toujours achete pour quelque
  // chose. Le rattachement est facultatif pour une prestation.
  const requiresSite = supplier.kind === 'MATERIALS' || supplier.kind === 'MIXED';
  if (requiresSite && params.allocations.length === 0) {
    throw badRequest('Un fournisseur de materiaux exige un rattachement a un chantier');
  }

  if (params.lines.length === 0) {
    throw badRequest('Une facture doit porter au moins une ligne');
  }

  // Discipline du defaut n°1 : chaque montant est arrondi avant d'entrer
  // dans la somme, jamais apres — la somme brute puis arrondie peut differer
  // de la somme des valeurs deja arrondies qui seront stockees.
  const roundedLines = params.lines.map(line => ({ label: line.label, amount: roundMoneyXof(line.amount) }));
  const amount = roundMoneyXof(roundedLines.reduce((sum, line) => sum + line.amount, 0));

  // Le champ unique `siteId` de la facture n'est qu'un affichage — les
  // imputations, elles, portent chacune leur propre chantier. On y place le
  // premier renseigne, ou `null` pour une prestation sans chantier.
  const primarySiteId: string | null = params.allocations[0]?.siteId ?? null;

  const invoice = await tx.supplierInvoice.create({
    data: {
      tenantId,
      supplierId: params.supplierId,
      siteId: primarySiteId ?? undefined,
      invoiceDate: params.invoiceDate,
      reference: params.reference,
      amount,
      currency: DEFAULT_CURRENCY,
      status: 'DRAFT' as any,
      createdByUserId: params.createdByUserId
    }
  });

  for (const line of roundedLines) {
    await tx.supplierInvoiceLine.create({
      data: { invoiceId: invoice.id, label: line.label, amount: line.amount }
    });
  }

  // Les imputations naissent non validees (`validatedAt` nul) : elles
  // n'entrent dans aucun cout de chantier tant que la facture n'est pas
  // validee (P-2, P-4). C'est `validateSupplierInvoiceTx` qui les valide.
  for (const allocation of params.allocations) {
    await tx.costAllocation.create({
      data: {
        tenantId,
        siteId: allocation.siteId,
        costCategoryId: allocation.costCategoryId,
        sourceType: 'SUPPLIER_INVOICE' as any,
        sourceId: invoice.id,
        amount: roundMoneyXof(allocation.amount)
      }
    });
  }

  return toInvoiceRecord(invoice);
};

// ---------------------------------------------------------------------------
// C. Validation d'une facture fournisseur
// ---------------------------------------------------------------------------

/** Voir `ValidateSupplierInvoiceTx` dans `./types-lot2.ts`. */
export const validateSupplierInvoiceTx: ValidateSupplierInvoiceTx = async (
  tx,
  tenantId,
  invoiceId,
  validatedByUserId
) => {
  const invoice = await tx.supplierInvoice.findFirst({ where: { id: invoiceId, tenantId } });
  if (!invoice) {
    throw notFound('Facture fournisseur introuvable');
  }
  if (invoice.status !== 'DRAFT') {
    throw conflict('Cette facture a deja ete validee ou annulee — une piece validee ne se modifie plus');
  }

  const supplier = await tx.supplier.findFirst({
    where: { id: invoice.supplierId, tenantId },
    select: { id: true, name: true, thirdPartyAccountId: true }
  });
  if (!supplier) {
    throw notFound('Fournisseur introuvable pour cette facture');
  }

  const allocations = await tx.costAllocation.findMany({
    where: {
      tenantId,
      sourceType: 'SUPPLIER_INVOICE' as any,
      sourceId: invoiceId,
      validatedAt: null,
      voidedAt: null
    }
  });

  const invoiceAmount = roundMoneyXof(toAmountOrZero(invoice.amount));

  // Invariant verifie AVANT toute ecriture, sur les montants arrondis —
  // ceux qui seront stockes, jamais sur les valeurs brutes (meme discipline
  // que le defaut n°1 du moteur comptable general).
  if (allocations.length > 0) {
    const allocatedTotal = roundMoneyXof(
      allocations.reduce((sum: number, a: any) => sum + roundMoneyXof(toAmountOrZero(a.amount)), 0)
    );
    if (allocatedTotal !== invoiceAmount) {
      throw badRequest(
        `La somme des imputations (${allocatedTotal}) ne correspond pas au montant de la facture (${invoiceAmount})`
      );
    }
  }

  const accounts = await resolveOperationalAccounts(tx, tenantId, invoice.invoiceDate);

  const entry = await postDocumentEntryTx(tx, {
    tenantId,
    journalId: accounts.journalId,
    entryDate: invoice.invoiceDate,
    reference: invoice.reference,
    description: `Facture fournisseur ${invoice.reference} — ${supplier.name}`,
    documentType: 'SUPPLIER_INVOICE' as any,
    documentId: invoice.id,
    lines: [
      { accountId: accounts.achatsAccountId, debit: invoiceAmount, label: `Achats — ${supplier.name}` },
      { accountId: accounts.fournisseursAccountId, credit: invoiceAmount, label: `Fournisseur — ${supplier.name}` }
    ]
  });

  // Le fournisseur nous est du davantage : le mouvement est "facture"
  // (`billed`), qui augmente le solde du compte de tiers, quel que soit le
  // sens metier — c'est la meme fonction que pour le locataire du lot 1,
  // seule l'interpretation du signe differe (voir `SuppliersBalanceLine`).
  const movement = await appendThirdPartyMovementTx(tx, {
    accountId: supplier.thirdPartyAccountId,
    tenantId,
    type: 'INSTALLMENT' as any,
    billed: invoiceAmount,
    label: `Facture ${invoice.reference}`,
    sourceType: asFinanceSourceType('SUPPLIER_INVOICE'),
    sourceId: invoice.id,
    movementDate: invoice.invoiceDate
  });
  if (!movement) {
    throw notFound('Compte fournisseur introuvable');
  }

  if (allocations.length > 0) {
    await tx.costAllocation.updateMany({
      where: {
        tenantId,
        sourceType: 'SUPPLIER_INVOICE' as any,
        sourceId: invoiceId,
        validatedAt: null,
        voidedAt: null
      },
      data: { validatedAt: new Date() }
    });

    // Le cout d'un chantier vient de changer : tout programme de travaux qui
    // lui est rattache doit suivre, dans CETTE transaction. Sinon il
    // afficherait son ancien montant jusqu'a la prochaine imputation, et
    // personne ne saurait lequel des deux croire.
    for (const siteId of new Set(allocations.map(a => a.siteId))) {
      await syncWorkProgramCostTx(tx, tenantId, siteId);
    }
  }

  const updated = await tx.supplierInvoice.update({
    where: { id: invoiceId },
    data: {
      status: 'VALIDATED' as any,
      validatedByUserId,
      validatedAt: new Date(),
      journalEntryId: entry.entryId
    }
  });

  return toInvoiceRecord(updated);
};

// ---------------------------------------------------------------------------
// D. Reglement fournisseur
// ---------------------------------------------------------------------------

/** Voir `CreateSupplierPaymentTx` dans `./types-lot2.ts`. */
export const createSupplierPaymentTx: CreateSupplierPaymentTx = async (tx, tenantId, params) => {
  const supplier = await tx.supplier.findFirst({
    where: { id: params.supplierId, tenantId },
    select: { id: true, name: true, thirdPartyAccountId: true }
  });
  if (!supplier) {
    throw notFound('Fournisseur introuvable');
  }

  const amount = roundMoneyXof(params.amount);
  if (amount <= 0) {
    throw badRequest('Le montant du reglement doit etre positif');
  }

  const roundedAllocations = params.allocations.map(a => ({ invoiceId: a.invoiceId, amount: roundMoneyXof(a.amount) }));
  const allocatedTotal = roundMoneyXof(roundedAllocations.reduce((sum, a) => sum + a.amount, 0));

  // Verifie AVANT toute ecriture : un reglement ne peut pas affecter plus
  // qu'il ne reglemente. Le reliquat, lui, est autorise (c'est l'acompte).
  if (allocatedTotal > amount) {
    throw badRequest('La somme des imputations ne peut pas depasser le montant du reglement');
  }

  if (roundedAllocations.length > 0) {
    const invoiceIds = roundedAllocations.map(a => a.invoiceId);
    const invoices = await tx.supplierInvoice.findMany({
      where: { id: { in: invoiceIds }, tenantId, supplierId: params.supplierId }
    });
    const foundIds = new Set(invoices.map((i: any) => i.id));
    for (const invoiceId of invoiceIds) {
      if (!foundIds.has(invoiceId)) {
        throw notFound(`Facture ${invoiceId} introuvable pour ce fournisseur`);
      }
    }
    const invoiceById = new Map(invoices.map((i: any) => [i.id, i]));
    for (const invoiceId of invoiceIds) {
      const invoice = invoiceById.get(invoiceId);
      if (invoice.status !== 'VALIDATED') {
        throw conflict(`La facture ${invoice.reference} n'est pas validee — un reglement ne peut pas s'y affecter`);
      }
    }
  }

  // BROUILLON. Ni ecriture, ni mouvement de compte : un reglement saisi n'a
  // encore rien regle. Tout cela nait a la validation
  // (`validateSupplierPaymentTx`), comme pour la facture et la piece de caisse.
  const payment = await tx.supplierPayment.create({
    data: {
      tenantId,
      supplierId: params.supplierId,
      paymentDate: params.paymentDate,
      amount,
      currency: DEFAULT_CURRENCY,
      method: DEFAULT_PAYMENT_METHOD,
      createdByUserId: params.createdByUserId
    }
  });

  // Les affectations naissent avec le brouillon : ce sont ses lignes, au meme
  // titre que les lignes d'une facture. Elles ne portent aucun mouvement tant
  // que la piece n'est pas validee.
  const allocationRecords: Array<{ invoiceId: string; amount: number }> = [];
  for (const allocation of roundedAllocations) {
    await tx.supplierPaymentAllocation.create({
      data: { paymentId: payment.id, invoiceId: allocation.invoiceId, amount: allocation.amount }
    });
    allocationRecords.push({ invoiceId: allocation.invoiceId, amount: allocation.amount });
  }

  return toPaymentRecord(payment, allocationRecords);
};

/** Voir `ValidateSupplierPaymentTx` dans `./types-lot2.ts`. */
export const validateSupplierPaymentTx: ValidateSupplierPaymentTx = async (
  tx,
  tenantId,
  paymentId,
  validatedByUserId
) => {
  const payment = await tx.supplierPayment.findFirst({ where: { id: paymentId, tenantId } });
  if (!payment) {
    throw notFound('Reglement introuvable');
  }
  if (payment.validatedAt) {
    // Ce qui est valide ne bouge plus (P-6) : une seconde validation n'est pas
    // une mise a jour, c'est un refus.
    throw conflict('Ce reglement est deja valide');
  }

  const dejaAnnule = await tx.voidDocument.findFirst({
    where: { documentType: 'SUPPLIER_PAYMENT' as any, documentId: paymentId },
    select: { id: true }
  });
  if (dejaAnnule) {
    throw conflict('Ce reglement a ete annule : il ne peut plus etre valide');
  }

  const supplier = await tx.supplier.findFirst({
    where: { id: payment.supplierId, tenantId },
    select: { id: true, name: true, thirdPartyAccountId: true }
  });
  if (!supplier) {
    throw notFound('Fournisseur introuvable');
  }

  const allocations = await tx.supplierPaymentAllocation.findMany({
    where: { paymentId: payment.id }
  });

  // Les factures visees sont RE-verifiees ici, et non seulement a la saisie :
  // entre le brouillon et sa validation, une facture a pu etre annulee. Un
  // reglement ne peut pas s'affecter a une facture qui n'est plus valide.
  if (allocations.length > 0) {
    const invoices = await tx.supplierInvoice.findMany({
      where: { id: { in: allocations.map((a: any) => a.invoiceId) }, tenantId, supplierId: supplier.id }
    });
    const invoiceById = new Map(invoices.map((i: any) => [i.id, i]));
    for (const allocation of allocations) {
      const invoice = invoiceById.get(allocation.invoiceId);
      if (!invoice) {
        throw notFound(`Facture ${allocation.invoiceId} introuvable pour ce fournisseur`);
      }
      if (invoice.status !== 'VALIDATED') {
        throw conflict(`La facture ${invoice.reference} n'est plus validee — ce reglement ne peut pas s'y affecter`);
      }
    }
  }

  const amount = toAmountOrZero(payment.amount);
  const accounts = await resolveOperationalAccounts(tx, tenantId, payment.paymentDate);

  const entry = await postDocumentEntryTx(tx, {
    tenantId,
    journalId: accounts.journalId,
    entryDate: payment.paymentDate,
    reference: `REG-${supplier.id}-${payment.paymentDate.getTime()}`,
    description: `Reglement fournisseur — ${supplier.name}`,
    documentType: 'SUPPLIER_PAYMENT' as any,
    documentId: payment.id,
    lines: [
      { accountId: accounts.fournisseursAccountId, debit: amount, label: `Reglement — ${supplier.name}` },
      { accountId: accounts.banqueAccountId, credit: amount, label: `Reglement — ${supplier.name}` }
    ]
  });

  const allocationRecords: Array<{ invoiceId: string; amount: number }> = [];
  let allocatedTotal = 0;

  for (const allocation of allocations) {
    const montant = toAmountOrZero(allocation.amount);
    await appendThirdPartyMovementTx(tx, {
      accountId: supplier.thirdPartyAccountId,
      tenantId,
      type: 'PAYMENT' as any,
      settled: montant,
      label: 'Reglement affecte a une facture',
      sourceType: asFinanceSourceType('SUPPLIER_PAYMENT_ALLOCATION'),
      sourceId: allocation.id,
      movementDate: payment.paymentDate
    });
    allocationRecords.push({ invoiceId: allocation.invoiceId, amount: montant });
    allocatedTotal = roundMoneyXof(allocatedTotal + montant);
  }

  // Reliquat non affecte : acompte. Le compte fournisseur devient debiteur du
  // surplus, symetrique exact de l'avance locataire du lot 1.
  const remainder = roundMoneyXof(amount - allocatedTotal);
  if (remainder > 0) {
    await appendThirdPartyMovementTx(tx, {
      accountId: supplier.thirdPartyAccountId,
      tenantId,
      type: 'ADVANCE_RECEIVED' as any,
      settled: remainder,
      label: 'Acompte verse, non affecte a une facture',
      sourceType: asFinanceSourceType('SUPPLIER_PAYMENT'),
      sourceId: payment.id,
      movementDate: payment.paymentDate
    });
  }

  // Mise a jour conditionnelle, meme discipline qu'a la piece de caisse : si
  // une autre transaction a valide ce reglement entre notre lecture et cet
  // instant, `count` vaut 0 et on abandonne. L'ecriture et les mouvements
  // crees ici repartent avec le rollback, rien ne subsiste en double.
  const updateResult = await tx.supplierPayment.updateMany({
    where: { id: payment.id, tenantId, validatedAt: null },
    data: { validatedAt: new Date(), validatedByUserId, journalEntryId: entry.entryId }
  });
  if (updateResult.count !== 1) {
    throw conflict("Ce reglement vient d'etre valide par ailleurs");
  }

  const updated = await tx.supplierPayment.findFirst({ where: { id: payment.id, tenantId } });
  return toPaymentRecord(updated, allocationRecords);
};

// ---------------------------------------------------------------------------
// E. Balance fournisseurs — miroir exact de la balance clients du lot 1
//
// Le talon (`types-lot2.ts`) place cette fonction dans `reports.ts` ; voir
// l'en-tete du fichier pour la raison de son implementation ici.
// ---------------------------------------------------------------------------

function buildMovementDateFilter(range?: PeriodRange): { gte?: Date; lte?: Date } | undefined {
  if (!range?.from && !range?.to) {
    return undefined;
  }
  return {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lte: range.to } : {})
  };
}

/**
 * Resout, pour un chantier donne, les identifiants de piece a suivre dans le
 * grand livre : les factures qui lui sont rattachees, et les allocations de
 * reglement de ces factures. Un acompte sans facture n'est jamais rattache a
 * un chantier — il en est exclu par construction, comme il se doit.
 */
async function resolveSiteMovementSources(
  tenantId: string,
  siteId: string
): Promise<{ invoiceIds: string[]; allocationIds: string[] }> {
  const invoices = await prisma.supplierInvoice.findMany({
    where: { tenantId, siteId },
    select: { id: true }
  });
  const invoiceIds = invoices.map((i: any) => i.id);
  if (invoiceIds.length === 0) {
    return { invoiceIds: [], allocationIds: [] };
  }

  const allocations = await prisma.supplierPaymentAllocation.findMany({
    where: { invoiceId: { in: invoiceIds } },
    select: { id: true }
  });

  return { invoiceIds, allocationIds: allocations.map((a: any) => a.id) };
}

/** Voir `GetSuppliersBalance` dans `./types-lot2.ts`. */
export const getSuppliersBalance: GetSuppliersBalance = async (tenantId, filters) => {
  const supplierAccounts = await prisma.thirdPartyAccount.findMany({
    where: { tenantId, kind: 'SUPPLIER' as any },
    select: {
      id: true,
      label: true,
      balance: true,
      currency: true,
      supplier: { select: { id: true } }
    }
  });

  if (supplierAccounts.length === 0) {
    return { lines: [], totalBalance: 0, currency: DEFAULT_CURRENCY };
  }

  let siteFilter: { invoiceIds: string[]; allocationIds: string[] } | undefined;
  if (filters?.siteId) {
    siteFilter = await resolveSiteMovementSources(tenantId, filters.siteId);
    if (siteFilter.invoiceIds.length === 0) {
      // Aucune facture rattachee a ce chantier : aucun mouvement ne peut lui
      // etre rattache non plus.
      return { lines: [], totalBalance: 0, currency: DEFAULT_CURRENCY };
    }
  }

  const movementDateFilter = buildMovementDateFilter(filters?.range);
  const accountIds = supplierAccounts.map((a: any) => a.id);

  const grouped = await prisma.thirdPartyMovement.groupBy({
    by: ['accountId'],
    where: {
      tenantId,
      accountId: { in: accountIds },
      ...(movementDateFilter ? { movementDate: movementDateFilter } : {}),
      ...(siteFilter
        ? {
            OR: [
              { sourceType: 'SUPPLIER_INVOICE', sourceId: { in: siteFilter.invoiceIds } },
              { sourceType: 'SUPPLIER_PAYMENT_ALLOCATION', sourceId: { in: siteFilter.allocationIds } }
            ]
          }
        : {})
    },
    _sum: { debit: true, credit: true }
  });

  if (grouped.length === 0) {
    return { lines: [], totalBalance: 0, currency: DEFAULT_CURRENCY };
  }

  const accountById = new Map(supplierAccounts.map((a: any) => [a.id, a]));

  // « Facture » et « regle » portent l'activite de la periode filtree ; le
  // solde, lui, porte le solde COURANT du compte — jamais recalcule sur la
  // periode. Sans cette distinction, un fournisseur sans mouvement dans la
  // periode afficherait un solde nul et notre dette envers lui disparaitrait
  // de la balance (meme regle de lecture qu'au lot 1).
  const lines: SuppliersBalanceLine[] = grouped.map((group: any) => {
    const account = accountById.get(group.accountId);
    return {
      accountId: account.id,
      supplierId: account.supplier?.id ?? '',
      label: account.label,
      totalBilled: roundMoneyXof(toAmountOrZero(group._sum.debit)),
      totalSettled: roundMoneyXof(toAmountOrZero(group._sum.credit)),
      balance: roundMoneyXof(toAmountOrZero(account.balance)),
      currency: account.currency
    };
  });

  // Total de controle : somme des soldes des lignes, pas de l'activite de
  // la periode.
  const totalBalance = roundMoneyXof(lines.reduce((sum, line) => sum + line.balance, 0));
  const currency = lines[0]?.currency ?? DEFAULT_CURRENCY;

  return { lines, totalBalance, currency };
};
