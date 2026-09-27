import { Prisma } from '@prisma/client';
import { prisma, type PrismaTransactionClient } from '../../utils/database';
import { ConflictError, NotFoundError } from '../../middleware/error-middleware';
import { unprocessableEntity } from '../errors';
import { logger } from '../../utils/logger';
import { roundMoney } from './finance-utils';
import {
  ensureSyndicJournalTx,
  ensureSyndicProviderAccountsTx,
  postSyndicEntryTx,
  reverseSyndicEntryTx
} from './provider-invoice-accounting';
import {
  assertProviderInvoiceFile,
  cleanOriginalName,
  readProviderInvoiceFile,
  removeProviderInvoiceFile,
  storeProviderInvoiceFile
} from './provider-invoice-files';
import type {
  CreateProviderInvoiceInput,
  CreateProviderPaymentInput,
  ListProviderInvoicesQuery,
  UpdateProviderInvoiceInput
} from './provider-invoice-schemas';

/**
 * Factures et paiements des prestataires d'une copropriete (lot S6, besoin 3).
 *
 * Cycle d'une facture :
 *   1. enregistrement : charge 6xx au debit, prestataire 401 au credit, dans
 *      la comptabilite de la COPROPRIETE ; le realise de la ligne budgetaire
 *      liee augmente du TTC ;
 *   2. paiements (un ou plusieurs, jamais plus que le reste du) : le fonds
 *      choisi est debite et un `SyndicateFundMovement` le trace ; ecriture
 *      401 au debit / 521 au credit ; statut PARTIALLY_PAID puis PAID ;
 *   3. annulation d'un paiement : mouvement de fonds inverse, contre-ecriture,
 *      statut recalcule ;
 *   4. annulation d'une facture SANS paiement actif : contre-ecriture, realise
 *      budgetaire diminue, statut CANCELLED.
 *
 * Isolation : chaque identifiant recu (prestataire, contrat, incident, ligne
 * budgetaire, fonds, compte) est verifie comme appartenant a la copropriete
 * de l'agence. Un objet d'une autre copropriete ou d'une autre agence repond
 * la meme 404 qu'un objet inexistant.
 *
 * La TVA : une copropriete ne recupere pas la TVA, la charge est donc le TTC.
 */

type Tx = PrismaTransactionClient;

const NOT_FOUND_INVOICE = 'Facture de prestataire introuvable.';

// ---------------------------------------------------------------------------
// Gardes d'appartenance
// ---------------------------------------------------------------------------

async function assertSyndicate(tenantId: string, syndicateId: string) {
  const syndicate = await prisma.syndicate.findFirst({
    where: { id: syndicateId, tenantId },
    select: { id: true, name: true }
  });
  if (!syndicate) throw new NotFoundError('Copropriete introuvable ou inaccessible');
  return syndicate;
}

async function assertProvider(tenantId: string, providerId: string) {
  const provider = await prisma.serviceProvider.findFirst({
    where: { id: providerId, tenantId },
    select: { id: true, name: true }
  });
  if (!provider) throw new NotFoundError('Prestataire introuvable ou inaccessible');
  return provider;
}

async function assertFund(syndicateId: string, fundId: string) {
  const fund = await prisma.syndicateFund.findFirst({
    where: { id: fundId, syndicateId },
    select: { id: true, name: true }
  });
  if (!fund) throw new NotFoundError('Fonds introuvable ou inaccessible pour cette copropriete');
  return fund;
}

async function assertBudgetLine(syndicateId: string, budgetLineItemId: string) {
  const line = await prisma.budgetLineItem.findFirst({
    where: { id: budgetLineItemId, budget: { syndicateId } },
    select: { id: true, accountId: true }
  });
  if (!line) throw new NotFoundError('Ligne budgetaire introuvable pour cette copropriete');
  return line;
}

/**
 * Ligne budgetaire deduite du contrat : les liens `SyndicateContractLink` de
 * la copropriete pour ce contrat. Seulement si UNE seule ligne est designee
 * et qu'elle appartient bien a un budget de la copropriete (le champ est un
 * texte libre, sans cle etrangere).
 */
async function budgetLineFromContract(syndicateId: string, contractId: string) {
  const links = await prisma.syndicateContractLink.findMany({
    where: { syndicateId, maintenanceContractId: contractId, budgetLineItemId: { not: null } },
    select: { budgetLineItemId: true }
  });
  const ids = Array.from(new Set(links.map(link => link.budgetLineItemId).filter((id): id is string => Boolean(id))));
  if (ids.length !== 1) return null;
  if (!/^[0-9a-f-]{36}$/i.test(ids[0])) return null;
  return prisma.budgetLineItem.findFirst({
    where: { id: ids[0], budget: { syndicateId } },
    select: { id: true, accountId: true }
  });
}

async function resolveExpenseAccountId(
  tenantId: string,
  syndicateId: string,
  explicitId: string | undefined,
  budgetLineAccountId: string | null | undefined
): Promise<string | null> {
  if (explicitId) {
    const account = await prisma.chartOfAccount.findFirst({
      where: { id: explicitId, tenantId, syndicateId, accountType: 'EXPENSE', isActive: true },
      select: { id: true }
    });
    if (!account) throw new NotFoundError('Compte de charge introuvable pour cette copropriete');
    return account.id;
  }
  if (budgetLineAccountId) {
    // Le compte de la ligne budgetaire n'est retenu que s'il est un compte de
    // charge actif de la copropriete ; sinon on retombe sur le compte par defaut.
    const account = await prisma.chartOfAccount.findFirst({
      where: { id: budgetLineAccountId, tenantId, syndicateId, accountType: 'EXPENSE', isActive: true },
      select: { id: true }
    });
    return account?.id ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Calculs
// ---------------------------------------------------------------------------

/** TTC attendu : HT + TVA. Un TTC fourni doit y correspondre au centime. */
export function computeInvoiceTotals(input: { amountHT: number; vatAmount?: number; amountTTC?: number }) {
  const amountHT = roundMoney(input.amountHT);
  const vatAmount = roundMoney(input.vatAmount ?? 0);
  const expected = roundMoney(amountHT + vatAmount);
  if (input.amountTTC !== undefined && roundMoney(input.amountTTC) !== expected) {
    throw unprocessableEntity('Le montant TTC doit etre egal au montant HT augmente de la TVA');
  }
  return { amountHT, vatAmount, amountTTC: expected };
}

/** Statut d'une facture non annulee d'apres ce qui a ete paye. */
export function computeInvoiceStatus(amountTTC: number, amountPaid: number): 'RECORDED' | 'PARTIALLY_PAID' | 'PAID' {
  const paid = roundMoney(amountPaid);
  if (paid <= 0) return 'RECORDED';
  if (paid < roundMoney(amountTTC)) return 'PARTIALLY_PAID';
  return 'PAID';
}

// ---------------------------------------------------------------------------
// Presentation : jamais de chemin de stockage vers le client
// ---------------------------------------------------------------------------

const invoiceSelect = {
  id: true,
  syndicateId: true,
  providerId: true,
  contractId: true,
  incidentId: true,
  budgetLineItemId: true,
  fundId: true,
  number: true,
  label: true,
  invoiceDate: true,
  dueDate: true,
  amountHT: true,
  vatAmount: true,
  amountTTC: true,
  amountPaid: true,
  currency: true,
  expenseAccountId: true,
  filePath: true,
  fileName: true,
  status: true,
  cancelledAt: true,
  cancelReason: true,
  journalEntryId: true,
  cancelEntryId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  provider: { select: { id: true, name: true } },
  contract: { select: { id: true, nature: true } },
  incident: { select: { id: true, description: true, status: true } },
  budgetLine: { select: { id: true, category: true, description: true } },
  fund: { select: { id: true, name: true } }
} satisfies Prisma.SyndicProviderInvoiceSelect;

const paymentSelect = {
  id: true,
  invoiceId: true,
  fundId: true,
  amount: true,
  paidAt: true,
  method: true,
  reference: true,
  journalEntryId: true,
  cancelledAt: true,
  cancelReason: true,
  cancelEntryId: true,
  createdById: true,
  createdAt: true,
  fund: { select: { id: true, name: true } }
} satisfies Prisma.SyndicProviderPaymentSelect;

type InvoiceRow = Prisma.SyndicProviderInvoiceGetPayload<{ select: typeof invoiceSelect }>;
type PaymentRow = Prisma.SyndicProviderPaymentGetPayload<{ select: typeof paymentSelect }>;

export function toPaymentDto(row: PaymentRow) {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    fundId: row.fundId,
    fund: row.fund ?? null,
    amount: Number(row.amount),
    paidAt: row.paidAt,
    method: row.method,
    reference: row.reference,
    journalEntryId: row.journalEntryId,
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason,
    cancelEntryId: row.cancelEntryId,
    createdById: row.createdById,
    createdAt: row.createdAt
  };
}

export function toInvoiceDto(row: InvoiceRow) {
  const amountTTC = Number(row.amountTTC);
  const amountPaid = Number(row.amountPaid);
  return {
    id: row.id,
    syndicateId: row.syndicateId,
    providerId: row.providerId,
    provider: row.provider ?? null,
    contractId: row.contractId,
    contract: row.contract ?? null,
    incidentId: row.incidentId,
    incident: row.incident ?? null,
    budgetLineItemId: row.budgetLineItemId,
    budgetLine: row.budgetLine ?? null,
    fundId: row.fundId,
    fund: row.fund ?? null,
    number: row.number,
    label: row.label,
    invoiceDate: row.invoiceDate,
    dueDate: row.dueDate,
    amountHT: Number(row.amountHT),
    vatAmount: Number(row.vatAmount),
    amountTTC,
    amountPaid,
    amountDue: row.status === 'CANCELLED' ? 0 : roundMoney(Math.max(0, amountTTC - amountPaid)),
    currency: row.currency,
    expenseAccountId: row.expenseAccountId,
    hasFile: Boolean(row.filePath),
    fileName: row.filePath ? row.fileName : null,
    status: row.status,
    cancelledAt: row.cancelledAt,
    cancelReason: row.cancelReason,
    journalEntryId: row.journalEntryId,
    cancelEntryId: row.cancelEntryId,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export type ProviderInvoiceDto = ReturnType<typeof toInvoiceDto>;

async function loadInvoiceDto(client: Tx | typeof prisma, tenantId: string, invoiceId: string) {
  const row = await client.syndicProviderInvoice.findFirst({
    where: { id: invoiceId, tenantId },
    select: invoiceSelect
  });
  if (!row) throw new NotFoundError(NOT_FOUND_INVOICE);
  return toInvoiceDto(row);
}

async function findInvoiceOrThrow(tenantId: string, syndicateId: string, invoiceId: string) {
  const invoice = await prisma.syndicProviderInvoice.findFirst({
    where: { id: invoiceId, tenantId, syndicateId },
    select: {
      id: true,
      syndicateId: true,
      number: true,
      status: true,
      amountTTC: true,
      amountPaid: true,
      fundId: true,
      budgetLineItemId: true,
      incidentId: true,
      journalEntryId: true,
      filePath: true,
      fileName: true,
      providerId: true
    }
  });
  if (!invoice) throw new NotFoundError(NOT_FOUND_INVOICE);
  return invoice;
}

// ---------------------------------------------------------------------------
// Verrous et fonds
// ---------------------------------------------------------------------------

/** Verrou de ligne sur la facture (ordre : facture, puis fonds). */
async function lockInvoiceTx(tx: Tx, tenantId: string, invoiceId: string) {
  await tx.$queryRaw`SELECT id FROM syndic_provider_invoices WHERE id = ${invoiceId}::uuid AND tenant_id = ${tenantId} FOR UPDATE`;
}

async function lockFundTx(tx: Tx, fundId: string) {
  await tx.$queryRaw`SELECT id FROM syndicate_funds WHERE id = ${fundId}::uuid FOR UPDATE`;
}

/**
 * Applique un mouvement au fonds (verrouille par l'appelant) et le trace.
 * Un solde negatif est accepte (avance de tresorerie, decouvert) : c'est a
 * l'appelant de le signaler.
 */
async function applyFundMovementTx(
  tx: Tx,
  params: {
    tenantId: string;
    fundId: string;
    direction: 'CREDIT' | 'DEBIT';
    amount: number;
    label: string;
    sourceType: 'PROVIDER_PAYMENT' | 'PROVIDER_PAYMENT_REVERSAL';
    sourceId: string;
    actorUserId?: string | null;
  }
) {
  const amount = roundMoney(params.amount);
  const updated = await tx.syndicateFund.update({
    where: { id: params.fundId },
    data: { balance: params.direction === 'CREDIT' ? { increment: amount } : { decrement: amount } },
    select: { id: true, name: true, balance: true, currency: true }
  });
  const balanceAfter = roundMoney(Number(updated.balance));
  await tx.syndicateFundMovement.create({
    data: {
      tenantId: params.tenantId,
      fundId: params.fundId,
      direction: params.direction,
      amount,
      balanceAfter,
      label: params.label,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      createdById: params.actorUserId ?? null
    }
  });
  return { id: updated.id, name: updated.name, balance: balanceAfter, currency: updated.currency };
}

// ---------------------------------------------------------------------------
// Imputation d'incident
// ---------------------------------------------------------------------------

export type IncidentImputationLink =
  | { linked: true; imputationId: string }
  | { linked: false; reason: 'NO_INCIDENT' | 'NO_SYNDICATE_BUDGET_IMPUTATION' | 'AMBIGUOUS' };

/**
 * Renseigne `IncidentCostImputation.journalEntryId` dans le seul cas simple :
 * l'incident porte UNE imputation SYNDICATE_BUDGET pas encore rattachee a une
 * ecriture. Plusieurs candidates : on ne devine pas, on le signale.
 */
async function linkIncidentImputationTx(
  tx: Tx,
  incidentId: string | null,
  journalEntryId: string
): Promise<IncidentImputationLink> {
  if (!incidentId) return { linked: false, reason: 'NO_INCIDENT' };
  const candidates = await tx.incidentCostImputation.findMany({
    where: { incidentId, imputationType: 'SYNDICATE_BUDGET', journalEntryId: null },
    select: { id: true }
  });
  if (candidates.length === 0) return { linked: false, reason: 'NO_SYNDICATE_BUDGET_IMPUTATION' };
  if (candidates.length > 1) return { linked: false, reason: 'AMBIGUOUS' };
  await tx.incidentCostImputation.update({
    where: { id: candidates[0].id },
    data: { journalEntryId }
  });
  return { linked: true, imputationId: candidates[0].id };
}

// ---------------------------------------------------------------------------
// Enregistrement
// ---------------------------------------------------------------------------

export interface UploadedFile {
  buffer: Buffer;
  originalname?: string;
}

export async function createProviderInvoice(
  tenantId: string,
  syndicateId: string,
  input: CreateProviderInvoiceInput,
  actorUserId?: string | null,
  file?: UploadedFile
) {
  await assertSyndicate(tenantId, syndicateId);
  await assertProvider(tenantId, input.providerId);
  // La piece est controlee AVANT toute ecriture : un fichier refuse ne laisse
  // pas une facture sans piece derriere lui.
  const fileKind = file ? assertProviderInvoiceFile(file.buffer) : null;

  if (input.contractId) {
    const contract = await prisma.maintenanceContract.findFirst({
      where: { id: input.contractId, syndicateId },
      select: { id: true, providerId: true }
    });
    if (!contract) throw new NotFoundError('Contrat introuvable pour cette copropriete');
    if (contract.providerId !== input.providerId) {
      throw unprocessableEntity("Le contrat choisi n'est pas celui de ce prestataire");
    }
  }
  if (input.incidentId) {
    const incident = await prisma.syndicateIncident.findFirst({
      where: { id: input.incidentId, syndicateId },
      select: { id: true }
    });
    if (!incident) throw new NotFoundError('Incident introuvable');
  }
  if (input.fundId) await assertFund(syndicateId, input.fundId);

  const budgetLine = input.budgetLineItemId
    ? await assertBudgetLine(syndicateId, input.budgetLineItemId)
    : input.contractId
      ? await budgetLineFromContract(syndicateId, input.contractId)
      : null;

  const explicitExpenseAccountId = await resolveExpenseAccountId(
    tenantId,
    syndicateId,
    input.expenseAccountId,
    budgetLine?.accountId
  );

  const duplicate = await prisma.syndicProviderInvoice.findFirst({
    where: {
      tenantId,
      syndicateId,
      providerId: input.providerId,
      number: input.number,
      status: { not: 'CANCELLED' }
    },
    select: { id: true }
  });
  if (duplicate) {
    throw new ConflictError('Une facture de ce prestataire porte deja ce numero pour cette copropriete');
  }

  const totals = computeInvoiceTotals(input);

  const result = await prisma.$transaction(async tx => {
    const accounts = await ensureSyndicProviderAccountsTx(tx, tenantId, syndicateId);
    const expenseAccountId = explicitExpenseAccountId ?? accounts.get(input.expenseKind === 'WORKS' ? '6241' : '624')!;
    const journalId = await ensureSyndicJournalTx(tx, tenantId, syndicateId, 'CHARGES', input.invoiceDate);

    const invoice = await tx.syndicProviderInvoice.create({
      data: {
        tenantId,
        syndicateId,
        providerId: input.providerId,
        contractId: input.contractId ?? null,
        incidentId: input.incidentId ?? null,
        budgetLineItemId: budgetLine?.id ?? null,
        fundId: input.fundId ?? null,
        number: input.number,
        label: input.label,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate ?? null,
        amountHT: totals.amountHT,
        vatAmount: totals.vatAmount,
        amountTTC: totals.amountTTC,
        currency: input.currency,
        expenseAccountId,
        createdById: actorUserId ?? null
      },
      select: { id: true }
    });

    const label = `Facture ${input.number} - ${input.label}`.slice(0, 250);
    const journalEntryId = await postSyndicEntryTx(tx, {
      tenantId,
      journalId,
      entryDate: input.invoiceDate,
      reference: `FP-${input.number}`.slice(0, 190),
      description: label,
      sourceType: 'PROVIDER_INVOICE',
      sourceId: invoice.id,
      documentType: 'SYNDIC_PROVIDER_INVOICE',
      lines: [
        { accountId: expenseAccountId, debit: totals.amountTTC, credit: 0, label },
        { accountId: accounts.get('401')!, debit: 0, credit: totals.amountTTC, label }
      ]
    });

    await tx.syndicProviderInvoice.update({
      where: { id: invoice.id, tenantId },
      data: { journalEntryId }
    });

    if (budgetLine) {
      await tx.budgetLineItem.update({
        where: { id: budgetLine.id },
        data: { amountActual: { increment: totals.amountTTC } }
      });
    }

    const incidentImputation = await linkIncidentImputationTx(tx, input.incidentId ?? null, journalEntryId);
    return { invoiceId: invoice.id, incidentImputation };
  });

  if (file && fileKind) {
    const filePath = await storeProviderInvoiceFile(syndicateId, file.buffer, fileKind);
    await prisma.syndicProviderInvoice.update({
      where: { id: result.invoiceId, tenantId },
      data: { filePath, fileName: cleanOriginalName(file.originalname) }
    });
  }

  logger.info('Audit: syndic provider invoice recorded', {
    tenantId,
    syndicateId,
    invoiceId: result.invoiceId,
    amountTTC: totals.amountTTC,
    actorUserId
  });

  return {
    invoice: await loadInvoiceDto(prisma, tenantId, result.invoiceId),
    incidentImputation: result.incidentImputation
  };
}

// ---------------------------------------------------------------------------
// Modification (champs non financiers)
// ---------------------------------------------------------------------------

export async function updateProviderInvoice(
  tenantId: string,
  syndicateId: string,
  invoiceId: string,
  input: UpdateProviderInvoiceInput
) {
  await assertSyndicate(tenantId, syndicateId);
  const invoice = await findInvoiceOrThrow(tenantId, syndicateId, invoiceId);
  if (invoice.status !== 'RECORDED') {
    throw new ConflictError('Seule une facture enregistree et non payee peut etre modifiee');
  }
  if (input.fundId) await assertFund(syndicateId, input.fundId);
  if (input.number && input.number !== invoice.number) {
    const duplicate = await prisma.syndicProviderInvoice.findFirst({
      where: {
        tenantId,
        syndicateId,
        providerId: invoice.providerId,
        number: input.number,
        status: { not: 'CANCELLED' },
        id: { not: invoiceId }
      },
      select: { id: true }
    });
    if (duplicate) {
      throw new ConflictError('Une facture de ce prestataire porte deja ce numero pour cette copropriete');
    }
  }

  await prisma.syndicProviderInvoice.update({
    where: { id: invoiceId, tenantId },
    data: {
      ...(input.number !== undefined ? { number: input.number } : {}),
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.fundId !== undefined ? { fundId: input.fundId } : {})
    }
  });
  return loadInvoiceDto(prisma, tenantId, invoiceId);
}

// ---------------------------------------------------------------------------
// Annulation d'une facture
// ---------------------------------------------------------------------------

export async function cancelProviderInvoice(
  tenantId: string,
  syndicateId: string,
  invoiceId: string,
  input: { reason: string },
  actorUserId?: string | null
) {
  await assertSyndicate(tenantId, syndicateId);
  await findInvoiceOrThrow(tenantId, syndicateId, invoiceId);
  const now = new Date();

  await prisma.$transaction(async tx => {
    await lockInvoiceTx(tx, tenantId, invoiceId);
    const invoice = await tx.syndicProviderInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: { id: true, status: true, number: true, amountTTC: true, budgetLineItemId: true, journalEntryId: true }
    });
    if (!invoice) throw new NotFoundError(NOT_FOUND_INVOICE);
    if (invoice.status === 'CANCELLED') throw new ConflictError('Cette facture est deja annulee');

    const activePayments = await tx.syndicProviderPayment.count({
      where: { tenantId, invoiceId, cancelledAt: null }
    });
    if (activePayments > 0) {
      throw new ConflictError("Cette facture a des paiements : annulez-les avant d'annuler la facture");
    }

    const cancelEntryId = invoice.journalEntryId
      ? await reverseSyndicEntryTx(tx, {
          tenantId,
          entryId: invoice.journalEntryId,
          date: now,
          description: `Annulation facture ${invoice.number} - ${input.reason}`.slice(0, 250),
          documentType: 'SYNDIC_PROVIDER_INVOICE_CANCEL'
        })
      : null;

    if (invoice.budgetLineItemId) {
      await tx.budgetLineItem.update({
        where: { id: invoice.budgetLineItemId },
        data: { amountActual: { decrement: roundMoney(Number(invoice.amountTTC)) } }
      });
    }

    // L'ecriture est contre-passee : l'imputation d'incident qui la citait
    // redevient libre pour une facture de remplacement.
    if (invoice.journalEntryId) {
      await tx.incidentCostImputation.updateMany({
        where: { journalEntryId: invoice.journalEntryId },
        data: { journalEntryId: null }
      });
    }

    await tx.syndicProviderInvoice.update({
      where: { id: invoiceId, tenantId },
      data: { status: 'CANCELLED', cancelledAt: now, cancelReason: input.reason, cancelEntryId }
    });
  });

  logger.info('Audit: syndic provider invoice cancelled', { tenantId, syndicateId, invoiceId, actorUserId });
  return loadInvoiceDto(prisma, tenantId, invoiceId);
}

// ---------------------------------------------------------------------------
// Paiement
// ---------------------------------------------------------------------------

export async function payProviderInvoice(
  tenantId: string,
  syndicateId: string,
  invoiceId: string,
  input: CreateProviderPaymentInput,
  actorUserId?: string | null
) {
  await assertSyndicate(tenantId, syndicateId);
  const found = await findInvoiceOrThrow(tenantId, syndicateId, invoiceId);
  const fundId = input.fundId ?? found.fundId;
  if (!fundId) throw unprocessableEntity('Choisissez le fonds a debiter pour ce paiement');
  await assertFund(syndicateId, fundId);
  const amount = roundMoney(input.amount);

  const result = await prisma.$transaction(async tx => {
    await lockInvoiceTx(tx, tenantId, invoiceId);
    await lockFundTx(tx, fundId);

    const invoice = await tx.syndicProviderInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: { id: true, status: true, number: true, amountTTC: true, amountPaid: true }
    });
    if (!invoice) throw new NotFoundError(NOT_FOUND_INVOICE);
    if (invoice.status === 'CANCELLED') throw new ConflictError('Une facture annulee ne peut pas etre payee');

    const due = roundMoney(Number(invoice.amountTTC) - Number(invoice.amountPaid));
    if (amount > due) {
      throw unprocessableEntity('Le montant du paiement depasse le reste du de la facture');
    }

    const payment = await tx.syndicProviderPayment.create({
      data: {
        tenantId,
        invoiceId,
        fundId,
        amount,
        paidAt: input.paidAt,
        method: input.method,
        reference: input.reference ?? null,
        createdById: actorUserId ?? null
      },
      select: { id: true }
    });

    const label = `Paiement facture ${invoice.number}`;
    const fund = await applyFundMovementTx(tx, {
      tenantId,
      fundId,
      direction: 'DEBIT',
      amount,
      label,
      sourceType: 'PROVIDER_PAYMENT',
      sourceId: payment.id,
      actorUserId
    });

    const accounts = await ensureSyndicProviderAccountsTx(tx, tenantId, syndicateId);
    const journalId = await ensureSyndicJournalTx(tx, tenantId, syndicateId, 'BANK', input.paidAt);
    const journalEntryId = await postSyndicEntryTx(tx, {
      tenantId,
      journalId,
      entryDate: input.paidAt,
      reference: `RP-${invoice.number}`.slice(0, 190),
      description: label,
      sourceType: 'PROVIDER_PAYMENT',
      sourceId: payment.id,
      documentType: 'SYNDIC_PROVIDER_PAYMENT',
      lines: [
        { accountId: accounts.get('401')!, debit: amount, credit: 0, label },
        { accountId: accounts.get('521')!, debit: 0, credit: amount, label }
      ]
    });
    await tx.syndicProviderPayment.update({
      where: { id: payment.id, tenantId },
      data: { journalEntryId }
    });

    const amountPaid = roundMoney(Number(invoice.amountPaid) + amount);
    await tx.syndicProviderInvoice.update({
      where: { id: invoiceId, tenantId },
      data: { amountPaid, status: computeInvoiceStatus(Number(invoice.amountTTC), amountPaid) }
    });

    return { paymentId: payment.id, fund };
  });

  logger.info('Audit: syndic provider payment recorded', {
    tenantId,
    syndicateId,
    invoiceId,
    paymentId: result.paymentId,
    fundId,
    amount,
    actorUserId
  });

  const payment = await prisma.syndicProviderPayment.findFirst({
    where: { id: result.paymentId, tenantId },
    select: paymentSelect
  });
  return {
    payment: payment ? toPaymentDto(payment) : null,
    invoice: await loadInvoiceDto(prisma, tenantId, invoiceId),
    fund: result.fund,
    fundBalanceNegative: result.fund.balance < 0
  };
}

// ---------------------------------------------------------------------------
// Annulation d'un paiement
// ---------------------------------------------------------------------------

export async function cancelProviderPayment(
  tenantId: string,
  syndicateId: string,
  invoiceId: string,
  paymentId: string,
  input: { reason: string },
  actorUserId?: string | null
) {
  await assertSyndicate(tenantId, syndicateId);
  await findInvoiceOrThrow(tenantId, syndicateId, invoiceId);
  const existing = await prisma.syndicProviderPayment.findFirst({
    where: { id: paymentId, tenantId, invoiceId },
    select: { id: true, fundId: true }
  });
  if (!existing) throw new NotFoundError('Paiement introuvable.');
  const now = new Date();

  const result = await prisma.$transaction(async tx => {
    await lockInvoiceTx(tx, tenantId, invoiceId);
    if (existing.fundId) await lockFundTx(tx, existing.fundId);

    const payment = await tx.syndicProviderPayment.findFirst({
      where: { id: paymentId, tenantId, invoiceId },
      select: { id: true, amount: true, fundId: true, cancelledAt: true, journalEntryId: true }
    });
    if (!payment) throw new NotFoundError('Paiement introuvable.');
    if (payment.cancelledAt) throw new ConflictError('Ce paiement est deja annule');

    const invoice = await tx.syndicProviderInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: { number: true, amountTTC: true, amountPaid: true, status: true }
    });
    if (!invoice) throw new NotFoundError(NOT_FOUND_INVOICE);

    const amount = roundMoney(Number(payment.amount));
    const label = `Annulation paiement facture ${invoice.number}`;
    // Un fonds supprime depuis (fundId remis a NULL) ne peut plus etre
    // recredite : le paiement s'annule quand meme, comptablement.
    const fund = payment.fundId
      ? await applyFundMovementTx(tx, {
          tenantId,
          fundId: payment.fundId,
          direction: 'CREDIT',
          amount,
          label,
          sourceType: 'PROVIDER_PAYMENT_REVERSAL',
          sourceId: payment.id,
          actorUserId
        })
      : null;

    const cancelEntryId = payment.journalEntryId
      ? await reverseSyndicEntryTx(tx, {
          tenantId,
          entryId: payment.journalEntryId,
          date: now,
          description: `${label} - ${input.reason}`.slice(0, 250),
          documentType: 'SYNDIC_PROVIDER_PAYMENT_CANCEL'
        })
      : null;

    await tx.syndicProviderPayment.update({
      where: { id: payment.id, tenantId },
      data: { cancelledAt: now, cancelReason: input.reason, cancelEntryId }
    });

    const amountPaid = roundMoney(Math.max(0, Number(invoice.amountPaid) - amount));
    await tx.syndicProviderInvoice.update({
      where: { id: invoiceId, tenantId },
      data: { amountPaid, status: computeInvoiceStatus(Number(invoice.amountTTC), amountPaid) }
    });
    return { fund };
  });

  logger.info('Audit: syndic provider payment cancelled', { tenantId, syndicateId, invoiceId, paymentId, actorUserId });
  const payment = await prisma.syndicProviderPayment.findFirst({
    where: { id: paymentId, tenantId },
    select: paymentSelect
  });
  return {
    payment: payment ? toPaymentDto(payment) : null,
    invoice: await loadInvoiceDto(prisma, tenantId, invoiceId),
    fund: result.fund,
    fundBalanceNegative: result.fund ? result.fund.balance < 0 : false
  };
}

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

export async function listProviderInvoices(tenantId: string, syndicateId: string, query: ListProviderInvoicesQuery) {
  await assertSyndicate(tenantId, syndicateId);
  const where: Prisma.SyndicProviderInvoiceWhereInput = {
    tenantId,
    syndicateId,
    ...(query.providerId ? { providerId: query.providerId } : {}),
    ...(query.contractId ? { contractId: query.contractId } : {}),
    ...(query.incidentId ? { incidentId: query.incidentId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.from || query.to
      ? { invoiceDate: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
      : {})
  };
  const [rows, total] = await Promise.all([
    prisma.syndicProviderInvoice.findMany({
      where,
      select: invoiceSelect,
      orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit
    }),
    prisma.syndicProviderInvoice.count({ where })
  ]);
  return { items: rows.map(toInvoiceDto), total, page: query.page, limit: query.limit };
}

export async function getProviderInvoice(tenantId: string, syndicateId: string, invoiceId: string) {
  await assertSyndicate(tenantId, syndicateId);
  await findInvoiceOrThrow(tenantId, syndicateId, invoiceId);
  const invoice = await loadInvoiceDto(prisma, tenantId, invoiceId);
  const payments = await prisma.syndicProviderPayment.findMany({
    where: { tenantId, invoiceId },
    select: paymentSelect,
    orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }]
  });
  return { ...invoice, payments: payments.map(toPaymentDto) };
}

/** Soldes dus par prestataire, factures non annulees de la copropriete. */
export async function listProviderBalances(tenantId: string, syndicateId: string, now: Date = new Date()) {
  await assertSyndicate(tenantId, syndicateId);
  const rows = await prisma.syndicProviderInvoice.findMany({
    where: { tenantId, syndicateId, status: { not: 'CANCELLED' } },
    select: {
      providerId: true,
      amountTTC: true,
      amountPaid: true,
      dueDate: true,
      currency: true,
      provider: { select: { id: true, name: true } }
    }
  });

  const byProvider = new Map<
    string,
    {
      providerId: string;
      providerName: string;
      currency: string;
      invoicesCount: number;
      totalInvoiced: number;
      totalPaid: number;
      totalDue: number;
      overdueDue: number;
    }
  >();
  for (const row of rows) {
    const current = byProvider.get(row.providerId) ?? {
      providerId: row.providerId,
      providerName: row.provider?.name ?? '',
      currency: row.currency,
      invoicesCount: 0,
      totalInvoiced: 0,
      totalPaid: 0,
      totalDue: 0,
      overdueDue: 0
    };
    const due = Math.max(0, Number(row.amountTTC) - Number(row.amountPaid));
    current.invoicesCount += 1;
    current.totalInvoiced = roundMoney(current.totalInvoiced + Number(row.amountTTC));
    current.totalPaid = roundMoney(current.totalPaid + Number(row.amountPaid));
    current.totalDue = roundMoney(current.totalDue + due);
    if (row.dueDate && row.dueDate.getTime() < now.getTime()) {
      current.overdueDue = roundMoney(current.overdueDue + due);
    }
    byProvider.set(row.providerId, current);
  }
  return Array.from(byProvider.values()).sort((a, b) => b.totalDue - a.totalDue);
}

export async function listFundMovements(
  tenantId: string,
  syndicateId: string,
  fundId: string,
  query: { page: number; limit: number }
) {
  await assertSyndicate(tenantId, syndicateId);
  const fund = await prisma.syndicateFund.findFirst({
    where: { id: fundId, syndicateId },
    select: { id: true, name: true, balance: true, currency: true }
  });
  if (!fund) throw new NotFoundError('Fonds introuvable ou inaccessible pour cette copropriete');

  const where = { tenantId, fundId };
  const [rows, total] = await Promise.all([
    prisma.syndicateFundMovement.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        direction: true,
        amount: true,
        balanceAfter: true,
        label: true,
        sourceType: true,
        sourceId: true,
        createdById: true,
        createdAt: true
      }
    }),
    prisma.syndicateFundMovement.count({ where })
  ]);

  return {
    fund: { id: fund.id, name: fund.name, balance: Number(fund.balance), currency: fund.currency },
    items: rows.map(row => ({ ...row, amount: Number(row.amount), balanceAfter: Number(row.balanceAfter) })),
    total,
    page: query.page,
    limit: query.limit
  };
}

// ---------------------------------------------------------------------------
// Piece jointe
// ---------------------------------------------------------------------------

export async function attachProviderInvoiceFile(
  tenantId: string,
  syndicateId: string,
  invoiceId: string,
  file: UploadedFile | undefined
) {
  await assertSyndicate(tenantId, syndicateId);
  const invoice = await findInvoiceOrThrow(tenantId, syndicateId, invoiceId);
  const kind = assertProviderInvoiceFile(file?.buffer);
  const filePath = await storeProviderInvoiceFile(syndicateId, file!.buffer, kind);
  await prisma.syndicProviderInvoice.update({
    where: { id: invoiceId, tenantId },
    data: { filePath, fileName: cleanOriginalName(file?.originalname) }
  });
  // L'ancienne piece, remplacee, est retiree du disque.
  if (invoice.filePath) await removeProviderInvoiceFile(syndicateId, invoice.filePath);
  return loadInvoiceDto(prisma, tenantId, invoiceId);
}

export async function removeProviderInvoiceAttachment(tenantId: string, syndicateId: string, invoiceId: string) {
  await assertSyndicate(tenantId, syndicateId);
  const invoice = await findInvoiceOrThrow(tenantId, syndicateId, invoiceId);
  if (!invoice.filePath) throw new NotFoundError('Piece jointe introuvable.');
  await prisma.syndicProviderInvoice.update({
    where: { id: invoiceId, tenantId },
    data: { filePath: null, fileName: null }
  });
  await removeProviderInvoiceFile(syndicateId, invoice.filePath);
  return loadInvoiceDto(prisma, tenantId, invoiceId);
}

export async function getProviderInvoiceFile(tenantId: string, syndicateId: string, invoiceId: string) {
  // Toute situation (copropriete ou facture d'une autre agence, facture sans
  // piece, fichier absent) repond la meme 404.
  const syndicate = await prisma.syndicate.findFirst({ where: { id: syndicateId, tenantId }, select: { id: true } });
  if (!syndicate) throw new NotFoundError('Piece jointe introuvable.');
  const invoice = await prisma.syndicProviderInvoice.findFirst({
    where: { id: invoiceId, tenantId, syndicateId },
    select: { syndicateId: true, filePath: true, fileName: true, number: true }
  });
  if (!invoice) throw new NotFoundError('Piece jointe introuvable.');
  return readProviderInvoiceFile(invoice);
}
