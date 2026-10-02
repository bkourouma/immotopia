/**
 * Factures PLATFORM des abonnements (vague 3, lot A) — emission automatique.
 * Reference : docs/architecture/PLAN-ABONNEMENTS.md (§6 bis, §6 ter, §6 quater).
 *
 * - `generateInvoiceForPeriod` part de `previewNextInvoice` (subscription-v2)
 *   et ecrit la facture dans une transaction verrouillee par agence :
 *   IDEMPOTENTE (jamais deux factures vivantes pour la meme agence, la meme
 *   nature et le meme debut de periode ; index partiel
 *   `invoices_platform_period_key` en dernier rempart).
 * - Natures : PERIOD (periode suivante : packs, extensions, remise, prorata
 *   et avoirs en attente, mise en route, depassement en mensuel), OVERAGE
 *   (depassement MENSUEL d'un abonnement annuel, §6 ter), CREDIT_NOTE (avoir).
 * - Statuts : DRAFT -> ISSUED -> PAID | OVERDUE | CANCELED (par avoir).
 * - Numerotation continue IMT-AAAA-NNNNN attribuee a l'EMISSION, dans la
 *   transaction (compteur `platform_invoice_sequences`, verrou de ligne) :
 *   ni trou ni doublon, meme en concurrence.
 * - Le reglement passe par la porte unique du lot B
 *   (`platform-payment-service.ts`, `settlePlatformInvoiceTx` /
 *   `recordManualPayment`), qui repasse l'abonnement ACTIVE.
 *
 * Ne touche JAMAIS aux factures RENTAL (loyers) : toutes les requetes portent
 * `kind: 'PLATFORM'` et `tenantId`.
 */

import { randomUUID } from 'crypto';
import { InvoiceLineKind, InvoiceStatus, PlatformPaymentMethod, Prisma, SubscriptionStatus } from '@prisma/client';
import { prisma, PrismaTransactionClient } from '../utils/database';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { t } from '../i18n';
import { runWithTenantContext } from '../utils/tenant-context';
import { BadRequestError, ConflictError, NotFoundError } from '../middleware/error-middleware';
import { logAuditEvent, recordAuditEvent } from './audit-service';
import { AuditActionKey } from '../types/audit-types';
import { ChargeLine, PARTICULIER_PACKS, PLATFORM_TAX_RATE_PERCENT, addBillingPeriod } from '../lib/subscription';
import {
  DRAFT_NUMBER_PREFIX,
  PlatformCustomerInfo,
  PlatformIssuerInfo,
  addDays,
  assembleInvoice,
  creditNoteLines,
  formatPlatformInvoiceNumber,
  isDraftNumber,
  withoutPendingLines
} from '../lib/subscription/platform-invoice';
import { buildPlatformInvoicePdf, formatFcfa } from '../lib/subscription/platform-invoice-pdf';
import { loadExistingCatalogByCodes, previewNextInvoice } from './subscription-v2-service';
import {
  UPGRADE_LINE_SOURCE,
  UpgradeTarget,
  buildUpgradeLineMetadata,
  isUpgradeTarget
} from './subscription-upgrade/constants';

type Db = PrismaTransactionClient | typeof prisma;
type InvoiceNature = 'PERIOD' | 'OVERAGE';

const DAY_MS = 24 * 60 * 60 * 1000;
const PLATFORM = 'PLATFORM' as const;

const toNumber = (value: unknown): number => (value === null || value === undefined ? 0 : Number(String(value)));

/** Moyens de reglement d'un avoir (jamais payable en ligne) et d'une facture a zero. */
export const SETTLEMENT_NO_PAYMENT = 'NONE';
export const SETTLEMENT_COMPENSATION = 'COMPENSATION';
export const SETTLEMENT_REFUND_DUE = 'REFUND_DUE';

// =============================================================== emetteur et client

/**
 * Mentions d'Alliance Consultants, lues dans la configuration
 * (`PLATFORM_ISSUER_*`, src/config/env.ts) et figees dans chaque facture a
 * l'emission (`issuerSnapshot`).
 */
export function platformIssuer(): PlatformIssuerInfo {
  const clean = (value: string | undefined) => (value && value.trim() ? value.trim() : null);
  return {
    name: env.PLATFORM_ISSUER_NAME,
    address: clean(env.PLATFORM_ISSUER_ADDRESS),
    rccm: clean(env.PLATFORM_ISSUER_RCCM),
    taxId: clean(env.PLATFORM_ISSUER_TAX_ID),
    email: clean(env.PLATFORM_ISSUER_EMAIL),
    phone: clean(env.PLATFORM_ISSUER_PHONE)
  };
}

async function customerOf(db: Db, tenantId: string): Promise<PlatformCustomerInfo> {
  const [tenant, finance] = await Promise.all([
    db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        legalName: true,
        address: true,
        city: true,
        country: true,
        contactEmail: true,
        contactPhone: true
      }
    }),
    db.agencyFinanceSettings.findFirst({ where: { tenantId }, select: { taxpayerNumber: true } })
  ]);
  if (!tenant) throw new NotFoundError('Agence introuvable.');
  const address = [tenant.address, tenant.city, tenant.country].filter(Boolean).join(', ');
  return {
    tenantId,
    name: tenant.legalName || tenant.name,
    address: address || null,
    email: tenant.contactEmail,
    phone: tenant.contactPhone,
    taxId: finance?.taxpayerNumber ?? null
  };
}

// =============================================================== numerotation

/**
 * Prochain numero IMT-AAAA-NNNNN. A appeler DANS la transaction d'emission :
 * l'upsert verrouille la ligne de l'annee jusqu'a la fin de la transaction,
 * si bien que deux emissions concurrentes se suivent, et une emission annulee
 * (rollback) rend son numero : la serie reste continue.
 */
export async function nextPlatformInvoiceNumberTx(tx: Db, issuedAt: Date): Promise<string> {
  const year = issuedAt.getUTCFullYear();
  const rows = await tx.$queryRaw<Array<{ last_number: number }>>`
    INSERT INTO platform_invoice_sequences (year, last_number, updated_at)
    VALUES (${year}, 1, NOW())
    ON CONFLICT (year) DO UPDATE
      SET last_number = platform_invoice_sequences.last_number + 1, updated_at = NOW()
    RETURNING last_number`;
  return formatPlatformInvoiceNumber(year, Number(rows[0].last_number));
}

/** Serialise les ecritures de facturation d'une agence (generation, emission, avoir). */
async function lockTenantBillingTx(tx: Db, tenantId: string): Promise<void> {
  const key = `platform-invoice:${tenantId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

// =============================================================== brouillon

export interface PlatformInvoiceDraft {
  nature: InvoiceNature;
  subscriptionId: string;
  periodStart: Date;
  periodEnd: Date;
  /** Lignes a CREER (HT, sans TVA ni lignes en attente). */
  newLines: Array<ChargeLine & { catalogItemId?: string | null; metadata?: Record<string, unknown> }>;
  /** Lignes en attente (prorata, avoirs) a rattacher telles quelles. */
  pendingLineIds: string[];
  /** Mises en route (elements SETUP) facturees ici : `billedThrough` pose. */
  setupItemIds: string[];
  /** Elements recurrents factures ici : `billedThrough` = fin de periode. */
  recurringItemIds: string[];
  dueDate: Date;
  notes?: string | null;
}

/** Mises en route des packs pour la PREMIERE facture de periode (D9). */
async function autoSetupLines(
  tenantId: string,
  packLines: ChargeLine[],
  periodStart: Date,
  periodEnd: Date,
  metadata: Record<string, unknown>
): Promise<PlatformInvoiceDraft['newLines']> {
  if (metadata.setupWaived === true) return [];
  const packCodes = [...new Set(packLines.map(l => l.code).filter((c): c is string => Boolean(c)))];
  if (packCodes.length === 0) return [];
  const previous = await prisma.invoice.count({
    where: { tenantId, kind: PLATFORM, billingNature: 'PERIOD', status: { not: InvoiceStatus.CANCELED } }
  });
  if (previous > 0) return [];
  const setupCodes = packCodes.map(code => `SETUP_${code}`);
  const [catalog, existingSetups] = await Promise.all([
    loadExistingCatalogByCodes(prisma, setupCodes),
    prisma.subscriptionItem.findMany({
      where: { tenantId, catalogItem: { code: { in: setupCodes } } },
      select: { catalogItem: { select: { code: true } } }
    })
  ]);
  const already = new Set(existingSetups.map(s => s.catalogItem.code));
  const lines: PlatformInvoiceDraft['newLines'] = [];
  for (const code of setupCodes) {
    const entry = catalog.get(code);
    if (!entry || already.has(code) || entry.setupPrice <= 0) continue;
    lines.push({
      kind: 'SETUP',
      label: entry.name,
      code,
      catalogItemId: entry.id,
      quantity: 1,
      unitPrice: entry.setupPrice,
      amount: entry.setupPrice,
      periodStart,
      periodEnd,
      metadata: { autoSetup: true }
    });
  }
  return lines;
}

function metadataOf(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

/**
 * Brouillon de la facture d'une nature, depuis `previewNextInvoice` (aucune
 * ecriture). PERIOD : la periode qui suit l'essai ou la periode en cours.
 * OVERAGE : la fenetre mensuelle de depassement qui contient `at` (annuel).
 * `null` quand il n'y a rien a facturer (depassement nul).
 */
export async function buildPlatformInvoiceDraft(
  tenantId: string,
  nature: InvoiceNature,
  options: { at?: Date } = {}
): Promise<PlatformInvoiceDraft | null> {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!subscription) throw new NotFoundError('Abonnement introuvable.');
  const at = options.at ?? new Date();
  const preview = await previewNextInvoice(tenantId, { now: at });

  if (nature === 'OVERAGE') {
    if (subscription.billingCycle !== 'ANNUAL') {
      throw new BadRequestError("Le dépassement d'un abonnement mensuel figure dans la facture de la période.");
    }
    const overage = preview.overageInvoice;
    if (!overage || overage.amountExclTax <= 0) return null;
    return {
      nature,
      subscriptionId: subscription.id,
      periodStart: overage.periodStart,
      periodEnd: overage.periodEnd,
      newLines: overage.lines.filter(l => l.kind !== 'TAX').map(l => ({ ...l, metadata: { usage: overage.usage } })),
      pendingLineIds: [],
      setupItemIds: [],
      recurringItemIds: [],
      dueDate: addDays(at, env.PLATFORM_INVOICE_DUE_DAYS)
    };
  }

  const pending = preview.pendingLineIds.length
    ? await prisma.invoiceLine.findMany({ where: { tenantId, invoiceId: null, id: { in: preview.pendingLineIds } } })
    : [];
  const ownLines = withoutPendingLines(
    preview.lines.filter(l => l.kind !== 'TAX'),
    pending.map(p => ({
      kind: p.kind,
      label: p.label,
      amount: toNumber(p.amount),
      subscriptionItemId: p.subscriptionItemId ?? undefined
    }))
  );
  const setupItemIds = ownLines
    .filter(l => l.kind === 'SETUP' && l.subscriptionItemId)
    .map(l => l.subscriptionItemId as string);
  const recurringItemIds = ownLines
    .filter(l => (l.kind === 'PACK' || l.kind === 'EXTENSION') && l.subscriptionItemId)
    .map(l => l.subscriptionItemId as string);
  const setup = await autoSetupLines(
    tenantId,
    ownLines.filter(l => l.kind === 'PACK'),
    preview.periodStart,
    preview.periodEnd,
    metadataOf(subscription.metadata)
  );

  return {
    nature,
    subscriptionId: subscription.id,
    periodStart: preview.periodStart,
    periodEnd: preview.periodEnd,
    newLines: [...ownLines, ...setup],
    pendingLineIds: pending.map(p => p.id),
    setupItemIds,
    recurringItemIds,
    // La grace (D8) court de l'echeance : la facture est due a sa fin.
    dueDate: addDays(preview.periodStart, subscription.graceDays)
  };
}

// =============================================================== ecriture

export interface GenerateResult {
  invoice: Awaited<ReturnType<typeof loadInvoice>>;
  created: boolean;
}

async function loadInvoice(db: Db, tenantId: string, invoiceId: string) {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId, kind: PLATFORM },
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      creditedInvoice: { select: { id: true, invoiceNumber: true } }
    }
  });
  if (!invoice) throw new NotFoundError('Facture introuvable.');
  return invoice;
}

/**
 * Ecrit un brouillon de facture, IDEMPOTENT : si une facture vivante (non
 * annulee) existe deja pour (agence, nature, debut de periode), elle est
 * renvoyee (`created: false`). `skipIfAnyExisting` (tache planifiee) : une
 * facture annulee par avoir bloque aussi la regeneration automatique — la
 * facture corrigee est alors l'affaire du super-admin.
 *
 * Les lignes en attente sont rattachees ; si l'une d'elles a ete prise entre
 * l'apercu et l'ecriture, la generation echoue (409) plutot que de facturer
 * deux fois.
 */
export async function generateInvoiceForPeriodTx(
  tx: Db,
  tenantId: string,
  draft: PlatformInvoiceDraft,
  options: { now?: Date; skipIfAnyExisting?: boolean } = {}
): Promise<GenerateResult> {
  const now = options.now ?? new Date();
  await lockTenantBillingTx(tx, tenantId);

  const existing = await tx.invoice.findFirst({
    where: {
      tenantId,
      kind: PLATFORM,
      billingNature: draft.nature,
      periodStart: draft.periodStart,
      ...(options.skipIfAnyExisting ? {} : { status: { not: InvoiceStatus.CANCELED } })
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true }
  });
  if (existing) return { invoice: await loadInvoice(tx, tenantId, existing.id), created: false };

  const pending = draft.pendingLineIds.length
    ? await tx.invoiceLine.findMany({ where: { tenantId, invoiceId: null, id: { in: draft.pendingLineIds } } })
    : [];
  if (pending.length !== draft.pendingLineIds.length) {
    throw new ConflictError('Des lignes en attente ont changé pendant la génération : relancez-la.');
  }

  type WorkLine = PlatformInvoiceDraft['newLines'][number] & { pendingId?: string };
  const work: WorkLine[] = [
    ...draft.newLines,
    ...pending.map(p => ({
      kind: p.kind,
      label: p.label,
      quantity: toNumber(p.quantity),
      unitPrice: toNumber(p.unitPrice),
      amount: toNumber(p.amount),
      pendingId: p.id
    }))
  ];
  const totals = assembleInvoice(work);

  const invoice = await tx.invoice.create({
    data: {
      tenantId,
      subscriptionId: draft.subscriptionId,
      invoiceNumber: `${DRAFT_NUMBER_PREFIX}${randomUUID()}`,
      issueDate: now,
      dueDate: draft.dueDate,
      currency: 'FCFA',
      kind: PLATFORM,
      billingNature: draft.nature,
      status: InvoiceStatus.DRAFT,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      amountExclTax: totals.amountExclTax,
      taxAmount: totals.taxAmount,
      taxRate: totals.taxRate,
      amountTotal: totals.amountTotal,
      notes: draft.notes ?? null
    }
  });

  // Lignes creees (dont TVA et report de solde) et lignes en attente
  // rattachees (contenu inchange), dans l'ordre d'affichage.
  let sortOrder = 0;
  for (const line of totals.lines as WorkLine[]) {
    sortOrder += 10;
    if (line.pendingId) {
      // eslint-disable-next-line no-await-in-loop -- quelques lignes par facture.
      const attached = await tx.invoiceLine.updateMany({
        where: { id: line.pendingId, tenantId, invoiceId: null },
        data: { invoiceId: invoice.id, sortOrder }
      });
      if (attached.count !== 1)
        throw new ConflictError('Des lignes en attente ont changé pendant la génération : relancez-la.');
      continue;
    }
    // eslint-disable-next-line no-await-in-loop -- quelques lignes par facture.
    await tx.invoiceLine.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        kind: line.kind as InvoiceLineKind,
        label: line.label,
        catalogItemId: line.catalogItemId ?? null,
        subscriptionItemId: line.subscriptionItemId ?? null,
        capacityKey: line.capacityKey ?? null,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: line.amount,
        periodStart: line.periodStart ?? null,
        periodEnd: line.periodEnd ?? null,
        sortOrder,
        metadata: { source: 'GENERATED', code: line.code ?? null, ...(line.metadata ?? {}) } as Prisma.InputJsonValue
      }
    });
  }

  // Credits superieurs au du : solde reporte en ligne CREDIT en attente.
  if (totals.carryForward < 0) {
    await tx.invoiceLine.create({
      data: {
        tenantId,
        invoiceId: null,
        kind: InvoiceLineKind.CREDIT,
        label: 'Solde créditeur reporté',
        quantity: 1,
        unitPrice: totals.carryForward,
        amount: totals.carryForward,
        periodStart: draft.periodStart,
        periodEnd: draft.periodEnd,
        metadata: { carriedFromInvoiceId: invoice.id } as Prisma.InputJsonValue
      }
    });
  }

  if (draft.setupItemIds.length) {
    await tx.subscriptionItem.updateMany({
      where: { tenantId, id: { in: draft.setupItemIds } },
      data: { billedThrough: draft.periodEnd }
    });
  }
  if (draft.recurringItemIds.length) {
    await tx.subscriptionItem.updateMany({
      where: { tenantId, id: { in: draft.recurringItemIds } },
      data: { billedThrough: draft.periodEnd }
    });
  }
  return { invoice: await loadInvoice(tx, tenantId, invoice.id), created: true };
}

// =============================================================== facture d'upgrade (espace particulier, lot 4D)

export interface UpgradeInvoiceInput {
  subscriptionId: string;
  target: UpgradeTarget;
  catalogItemId: string;
  packName: string;
  /** Prix mensuel HT du pack cible lu dans le catalogue a cet instant. */
  monthlyPrice: number;
  now?: Date;
}

/**
 * Facture PLATFORM du premier mois du pack cible d'une montee de palier
 * (Particulier gratuit -> payant), EMISE. N'altere NI la periode NI les
 * elements de l'abonnement : le changement de pack n'a lieu qu'au reglement
 * (`applyUpgradeForInvoiceTx`). Une seule ligne PACK (le pack Particulier n'a
 * aucune mise en route) marquee `metadata.source = SUBSCRIPTION_UPGRADE`.
 *
 * IDEMPOTENTE : une facture d'upgrade encore due pour la meme cible est
 * renvoyee telle quelle (`created: false`) tant que son montant correspond au
 * catalogue ; si le prix a change depuis, elle est annulee et remplacee.
 */
export async function generateUpgradeInvoiceTx(tx: Db, tenantId: string, input: UpgradeInvoiceInput) {
  if (!isUpgradeTarget(input.target)) throw new BadRequestError('Palier cible invalide.');
  if (!(input.monthlyPrice > 0)) throw new BadRequestError("Ce palier n'a rien à régler.");
  const now = input.now ?? new Date();
  await lockTenantBillingTx(tx, tenantId);

  const line: ChargeLine & { catalogItemId?: string | null; metadata?: Record<string, unknown> } = {
    kind: 'PACK',
    label: input.packName,
    code: input.target,
    quantity: 1,
    unitPrice: input.monthlyPrice,
    amount: input.monthlyPrice,
    periodStart: now,
    periodEnd: addBillingPeriod(now, 'MONTHLY')
  };
  const totals = assembleInvoice([line]);

  const dueStatuses: InvoiceStatus[] = [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE];
  const existing = await tx.invoice.findFirst({
    where: {
      tenantId,
      kind: PLATFORM,
      billingNature: 'PERIOD',
      subscriptionId: input.subscriptionId,
      status: { in: dueStatuses },
      lines: {
        some: {
          tenantId,
          kind: InvoiceLineKind.PACK,
          AND: [
            { metadata: { path: ['source'], equals: UPGRADE_LINE_SOURCE } },
            { metadata: { path: ['upgradeTo'], equals: input.target } }
          ]
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, amountTotal: true }
  });
  if (existing) {
    if (toNumber(existing.amountTotal) === totals.amountTotal) {
      return { invoice: await loadInvoice(tx, tenantId, existing.id), created: false };
    }
    await tx.invoice.update({
      where: { id: existing.id, tenantId },
      data: {
        status: InvoiceStatus.CANCELED,
        canceledAt: now,
        cancelReason: 'Prix du palier modifié : facture remplacée.'
      }
    });
  }

  const invoice = await tx.invoice.create({
    data: {
      tenantId,
      subscriptionId: input.subscriptionId,
      invoiceNumber: `${DRAFT_NUMBER_PREFIX}${randomUUID()}`,
      issueDate: now,
      dueDate: addDays(now, env.PLATFORM_INVOICE_DUE_DAYS),
      currency: 'FCFA',
      kind: PLATFORM,
      billingNature: 'PERIOD',
      status: InvoiceStatus.DRAFT,
      periodStart: line.periodStart,
      periodEnd: line.periodEnd,
      amountExclTax: totals.amountExclTax,
      taxAmount: totals.taxAmount,
      taxRate: totals.taxRate,
      amountTotal: totals.amountTotal
    }
  });
  let sortOrder = 0;
  for (const l of totals.lines) {
    sortOrder += 10;
    const isPack = l.kind === 'PACK';
    // eslint-disable-next-line no-await-in-loop -- deux lignes au plus (pack, TVA).
    await tx.invoiceLine.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        kind: l.kind as InvoiceLineKind,
        label: l.label,
        catalogItemId: isPack ? input.catalogItemId : null,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        amount: l.amount,
        periodStart: l.periodStart ?? null,
        periodEnd: l.periodEnd ?? null,
        sortOrder,
        metadata: {
          source: 'GENERATED',
          code: l.code ?? null,
          ...(isPack ? buildUpgradeLineMetadata(input.target) : {})
        } as Prisma.InputJsonValue
      }
    });
  }
  const issued = await issuePlatformInvoiceTx(tx, tenantId, invoice.id, now);
  return { invoice: issued.invoice, created: true };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// =============================================================== abonnement gratuit

/**
 * Vrai quand TOUS les elements vivants de l'abonnement (ACTIVE, ou
 * SCHEDULED a venir) sont des packs PARTICULIER (`PARTICULIER_PACKS`) ET ont un
 * prix mensuel ET de mise en route nuls — par exemple le seul pack
 * Particulier Gratuit. Un abonnement gratuit ne genere AUCUNE facture
 * periodique (sinon une facture a zero, payee d'office, serait emise a chaque
 * periode) et ne se renouvelle pas par facture : voir `processBillingBoundary`
 * (subscription-usage-job).
 *
 * Une AGENCE a prix nul (remise de 100 %, accord commercial, pack a zero) n'est
 * PAS gratuite : elle reste facturee comme avant, depassement compris. Un
 * abonnement sans element n'est pas « gratuit » non plus : cas anormal.
 * Les prix lus sont ceux figes dans SubscriptionItem (D12).
 */
export async function isFreeSubscription(db: Db, subscriptionId: string): Promise<boolean> {
  const items = await db.subscriptionItem.findMany({
    where: { subscriptionId, status: { in: ['ACTIVE', 'SCHEDULED'] } },
    select: { unitMonthlyPrice: true, unitSetupPrice: true, catalogItem: { select: { code: true } } }
  });
  return (
    items.length > 0 &&
    items.every(
      i =>
        PARTICULIER_PACKS.includes(i.catalogItem?.code ?? '') &&
        toNumber(i.unitMonthlyPrice) === 0 &&
        toNumber(i.unitSetupPrice) === 0
    )
  );
}

// =============================================================== emission

/**
 * Emet un brouillon : numero definitif, mentions figees, statut ISSUED (ou
 * PAID directement pour une facture a zero). Idempotent sur une facture deja
 * emise.
 */
export async function issuePlatformInvoiceTx(tx: Db, tenantId: string, invoiceId: string, now: Date = new Date()) {
  await lockTenantBillingTx(tx, tenantId);
  const invoice = await loadInvoice(tx, tenantId, invoiceId);
  if (invoice.status !== InvoiceStatus.DRAFT) return { invoice, issued: false };

  const number = await nextPlatformInvoiceNumberTx(tx, now);
  const total = toNumber(invoice.amountTotal);
  const dueDate = invoice.dueDate.getTime() < now.getTime() ? now : invoice.dueDate;
  await tx.invoice.update({
    where: { id: invoice.id },
    data: {
      invoiceNumber: number,
      issueDate: now,
      issuedAt: now,
      dueDate,
      status: total === 0 ? InvoiceStatus.PAID : InvoiceStatus.ISSUED,
      ...(total === 0 ? { paidAt: now, paymentMethod: SETTLEMENT_NO_PAYMENT } : {}),
      issuerSnapshot: platformIssuer() as unknown as Prisma.InputJsonValue,
      customerSnapshot: (await customerOf(tx, tenantId)) as unknown as Prisma.InputJsonValue
    }
  });
  return { invoice: await loadInvoice(tx, tenantId, invoice.id), issued: true };
}

export interface GenerateOptions {
  nature?: InvoiceNature;
  /** Date de reference (defaut : maintenant). OVERAGE : un instant de la fenetre a facturer. */
  at?: Date;
  /** Emettre aussitot (defaut : vrai ; le super-admin peut garder un brouillon). */
  issue?: boolean;
  /** Tache planifiee : ne regenere pas une periode deja annulee par avoir. */
  automatic?: boolean;
  /** Envoyer l'e-mail a l'agence apres emission (defaut : vrai). */
  sendEmail?: boolean;
  actorUserId?: string | null;
}

/**
 * Genere (et par defaut emet) la facture d'une agence. Refuse pendant l'essai
 * (D8 : aucune facture avant la fin de l'essai). Renvoie `null` quand il n'y
 * a rien a facturer (depassement nul).
 */
export async function generateInvoiceForPeriod(tenantId: string, options: GenerateOptions = {}) {
  const nature = options.nature ?? 'PERIOD';
  const now = new Date();
  const at = options.at ?? now;
  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!subscription) throw new NotFoundError('Abonnement introuvable.');
  if (
    subscription.status === SubscriptionStatus.TRIALING &&
    (subscription.trialEndsAt ?? subscription.currentPeriodEnd).getTime() > at.getTime()
  ) {
    throw new BadRequestError("Aucune facture pendant l'essai : elle sera émise à la fin de l'essai.");
  }
  if (subscription.status === SubscriptionStatus.CANCELED) {
    throw new BadRequestError('Abonnement résilié : aucune facture à émettre.');
  }

  // Emission automatique : jamais de facture pour un abonnement gratuit.
  if (options.automatic && (await isFreeSubscription(prisma, subscription.id))) return null;

  const draft = await buildPlatformInvoiceDraft(tenantId, nature, { at });
  if (!draft) return null;

  let result: GenerateResult & { issued: boolean };
  try {
    result = await prisma.$transaction(async tx => {
      const generated = await generateInvoiceForPeriodTx(tx, tenantId, draft, {
        now,
        skipIfAnyExisting: options.automatic
      });
      if (options.issue === false || !generated.created) return { ...generated, issued: false };
      const issued = await issuePlatformInvoiceTx(tx, tenantId, generated.invoice.id, now);
      return { invoice: issued.invoice, created: true, issued: issued.issued };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Course perdue contre une generation concurrente : renvoyer la sienne.
    const existing = await prisma.invoice.findFirst({
      where: {
        tenantId,
        kind: PLATFORM,
        billingNature: nature,
        periodStart: draft.periodStart,
        status: { not: 'CANCELED' }
      }
    });
    if (!existing) throw error;
    return { invoice: await loadInvoice(prisma, tenantId, existing.id), created: false, issued: false };
  }

  if (result.created) {
    logAuditEvent({
      actorUserId: options.actorUserId ?? null,
      tenantId,
      actionKey: result.issued ? AuditActionKey.INVOICE_ISSUED : AuditActionKey.INVOICE_CREATED,
      entityType: 'Invoice',
      entityId: result.invoice.id,
      payload: {
        nature,
        invoiceNumber: result.invoice.invoiceNumber,
        periodStart: draft.periodStart.toISOString(),
        amountTotal: toNumber(result.invoice.amountTotal),
        automatic: Boolean(options.automatic)
      }
    });
  }
  if (result.issued && options.sendEmail !== false) await sendPlatformInvoiceEmail(tenantId, result.invoice.id);
  return result;
}

/** Emission d'un brouillon par le super-admin. */
export async function issuePlatformInvoice(tenantId: string, invoiceId: string, actorUserId: string) {
  const result = await prisma.$transaction(tx => issuePlatformInvoiceTx(tx, tenantId, invoiceId));
  if (!result.issued) throw new ConflictError('Cette facture est déjà émise.');
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.INVOICE_ISSUED,
    entityType: 'Invoice',
    entityId: invoiceId,
    payload: { invoiceNumber: result.invoice.invoiceNumber, amountTotal: toNumber(result.invoice.amountTotal) }
  });
  await sendPlatformInvoiceEmail(tenantId, invoiceId);
  return result.invoice;
}

// =============================================================== en retard

/** Factures emises dont l'echeance est passee -> OVERDUE. Renvoie le nombre. */
export async function markOverdueInvoices(tenantId: string, now: Date = new Date()): Promise<number> {
  const result = await prisma.invoice.updateMany({
    where: {
      tenantId,
      kind: PLATFORM,
      billingNature: { in: ['PERIOD', 'OVERAGE'] },
      status: InvoiceStatus.ISSUED,
      dueDate: { lt: now }
    },
    data: { status: InvoiceStatus.OVERDUE }
  });
  return result.count;
}

// =============================================================== avoir

export interface CreditNoteInput {
  reason: string;
  /** Remettre en attente les prorata et avoirs repris par la facture annulee (defaut : vrai). */
  reissuePending?: boolean;
}

/**
 * Avoir annulant une facture emise (ISSUED, OVERDUE ou PAID) : lignes et
 * totaux opposes, numero de la serie continue. La facture passe CANCELED
 * (elle libere sa periode pour une facture corrigee). L'avoir n'est jamais
 * payable : PAID par COMPENSATION si la facture n'etait pas reglee,
 * REFUND_DUE (remboursement a traiter hors ligne) si elle l'etait.
 */
export async function issueCreditNote(
  tenantId: string,
  invoiceId: string,
  input: CreditNoteInput,
  actorUserId: string
) {
  const reason = input.reason?.trim();
  if (!reason) throw new BadRequestError("La raison de l'avoir est obligatoire.");
  const now = new Date();

  const creditNote = await prisma.$transaction(async tx => {
    await lockTenantBillingTx(tx, tenantId);
    const original = await loadInvoice(tx, tenantId, invoiceId);
    if (original.billingNature !== 'PERIOD' && original.billingNature !== 'OVERAGE') {
      throw new BadRequestError("Seule une facture d'abonnement peut être annulée par un avoir.");
    }
    const allowed: InvoiceStatus[] = [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE, InvoiceStatus.PAID];
    if (!allowed.includes(original.status)) {
      throw new BadRequestError('Seule une facture émise peut être annulée par un avoir.');
    }
    const already = await tx.invoice.findFirst({
      where: { tenantId, creditedInvoiceId: original.id },
      select: { id: true }
    });
    if (already) throw new ConflictError('Cette facture a déjà un avoir.');

    const wasPaid = original.status === InvoiceStatus.PAID;
    const reversed = creditNoteLines(
      original.lines.map(l => ({
        kind: l.kind,
        label: l.label,
        quantity: toNumber(l.quantity),
        unitPrice: toNumber(l.unitPrice),
        amount: toNumber(l.amount),
        subscriptionItemId: l.subscriptionItemId ?? undefined,
        capacityKey: l.capacityKey ?? undefined,
        periodStart: l.periodStart ?? undefined,
        periodEnd: l.periodEnd ?? undefined
      }))
    );
    const number = await nextPlatformInvoiceNumberTx(tx, now);
    const note = await tx.invoice.create({
      data: {
        tenantId,
        subscriptionId: original.subscriptionId,
        invoiceNumber: number,
        issueDate: now,
        issuedAt: now,
        dueDate: now,
        currency: original.currency,
        kind: PLATFORM,
        billingNature: 'CREDIT_NOTE',
        creditedInvoiceId: original.id,
        status: InvoiceStatus.PAID,
        paidAt: now,
        paymentMethod: wasPaid ? SETTLEMENT_REFUND_DUE : SETTLEMENT_COMPENSATION,
        periodStart: original.periodStart,
        periodEnd: original.periodEnd,
        amountExclTax: reversed.amountExclTax,
        taxAmount: reversed.taxAmount,
        taxRate: original.taxRate ?? PLATFORM_TAX_RATE_PERCENT,
        amountTotal: reversed.amountTotal,
        notes: reason,
        issuerSnapshot: platformIssuer() as unknown as Prisma.InputJsonValue,
        customerSnapshot: (await customerOf(tx, tenantId)) as unknown as Prisma.InputJsonValue
      }
    });
    let sortOrder = 0;
    for (const line of reversed.lines) {
      sortOrder += 10;
      // eslint-disable-next-line no-await-in-loop -- quelques lignes par facture.
      await tx.invoiceLine.create({
        data: {
          tenantId,
          invoiceId: note.id,
          kind: line.kind as InvoiceLineKind,
          label: line.label,
          subscriptionItemId: line.subscriptionItemId ?? null,
          capacityKey: line.capacityKey ?? null,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          amount: line.amount,
          periodStart: line.periodStart ?? null,
          periodEnd: line.periodEnd ?? null,
          sortOrder,
          metadata: { source: 'CREDIT_NOTE', creditedInvoiceId: original.id } as Prisma.InputJsonValue
        }
      });
    }

    await tx.invoice.update({
      where: { id: original.id },
      data: { status: InvoiceStatus.CANCELED, canceledAt: now, cancelReason: reason }
    });

    if (input.reissuePending !== false) {
      // Le report de solde cree par la facture annulee disparait ; les lignes
      // qu'elle avait reprises (prorata, avoirs) repartent en attente, et ses
      // mises en route redeviennent a facturer.
      await tx.invoiceLine.deleteMany({
        where: { tenantId, invoiceId: null, metadata: { path: ['carriedFromInvoiceId'], equals: original.id } }
      });
      for (const line of original.lines) {
        const meta = metadataOf(line.metadata as Prisma.JsonValue);
        if (meta.source === 'GENERATED' || line.kind === InvoiceLineKind.TAX) continue;
        // eslint-disable-next-line no-await-in-loop -- quelques lignes.
        await tx.invoiceLine.create({
          data: {
            tenantId,
            invoiceId: null,
            kind: line.kind,
            label: line.label,
            catalogItemId: line.catalogItemId,
            subscriptionItemId: line.subscriptionItemId,
            capacityKey: line.capacityKey,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            amount: line.amount,
            periodStart: line.periodStart,
            periodEnd: line.periodEnd,
            metadata: { ...meta, reissuedFromInvoiceId: original.id } as Prisma.InputJsonValue
          }
        });
      }
      const setupIds = original.lines
        .filter(l => l.kind === InvoiceLineKind.SETUP && l.subscriptionItemId)
        .map(l => l.subscriptionItemId as string);
      if (setupIds.length) {
        await tx.subscriptionItem.updateMany({
          where: { tenantId, id: { in: setupIds } },
          data: { billedThrough: null }
        });
      }
    }

    // Actions critiques : tracees dans la transaction, jamais commitees sans trace.
    await recordAuditEvent(tx, {
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.INVOICE_CREDIT_NOTE_ISSUED,
      entityType: 'Invoice',
      entityId: note.id,
      payload: { creditedInvoiceId: invoiceId, invoiceNumber: note.invoiceNumber, reason }
    });
    await recordAuditEvent(tx, {
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.INVOICE_CANCELED,
      entityType: 'Invoice',
      entityId: invoiceId,
      payload: { creditNoteId: note.id, reason }
    });
    return note;
  });

  await sendPlatformInvoiceEmail(tenantId, creditNote.id);
  return loadInvoice(prisma, tenantId, creditNote.id);
}

// =============================================================== lecture

export function serializePlatformInvoice(
  invoice: Awaited<ReturnType<typeof loadInvoice>>,
  options: { withLines?: boolean } = {}
) {
  return {
    id: invoice.id,
    tenantId: invoice.tenantId,
    invoiceNumber: isDraftNumber(invoice.invoiceNumber) ? null : invoice.invoiceNumber,
    nature: invoice.billingNature,
    status: invoice.status,
    issueDate: invoice.issueDate,
    issuedAt: invoice.issuedAt,
    dueDate: invoice.dueDate,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    currency: invoice.currency,
    amountExclTax: toNumber(invoice.amountExclTax),
    taxRate: toNumber(invoice.taxRate),
    taxAmount: toNumber(invoice.taxAmount),
    amountTotal: toNumber(invoice.amountTotal),
    paidAt: invoice.paidAt,
    paymentMethod: invoice.paymentMethod,
    paymentReference: invoice.paymentReference,
    canceledAt: invoice.canceledAt,
    cancelReason: invoice.cancelReason,
    creditedInvoice: invoice.creditedInvoice
      ? { id: invoice.creditedInvoice.id, invoiceNumber: invoice.creditedInvoice.invoiceNumber }
      : null,
    sentAt: invoice.sentAt,
    notes: invoice.notes,
    ...(options.withLines
      ? {
          issuer: invoice.issuerSnapshot ?? null,
          customer: invoice.customerSnapshot ?? null,
          lines: invoice.lines.map(l => ({
            id: l.id,
            kind: l.kind,
            label: l.label,
            quantity: toNumber(l.quantity),
            unitPrice: toNumber(l.unitPrice),
            amount: toNumber(l.amount),
            periodStart: l.periodStart,
            periodEnd: l.periodEnd,
            capacityKey: l.capacityKey
          }))
        }
      : {})
  };
}

export interface ListPlatformInvoicesOptions {
  /** Agence : jamais les brouillons. */
  includeDrafts?: boolean;
  status?: InvoiceStatus;
  page?: number;
  limit?: number;
}

/** Factures PLATFORM d'une agence (les plus recentes d'abord). Jamais les factures RENTAL. */
export async function listPlatformInvoices(tenantId: string, options: ListPlatformInvoicesOptions = {}) {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.floor(options.limit ?? 20)));
  const where: Prisma.InvoiceWhereInput = {
    tenantId,
    kind: PLATFORM,
    ...(options.status
      ? { status: options.status }
      : options.includeDrafts
        ? {}
        : { status: { not: InvoiceStatus.DRAFT } }),
    ...(options.status === InvoiceStatus.DRAFT && !options.includeDrafts ? { id: '__none__' } : {})
  };
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      include: {
        lines: { orderBy: { sortOrder: 'asc' } },
        creditedInvoice: { select: { id: true, invoiceNumber: true } }
      },
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.invoice.count({ where })
  ]);
  return {
    invoices: rows.map(r => serializePlatformInvoice(r)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  };
}

export async function getPlatformInvoice(
  tenantId: string,
  invoiceId: string,
  options: { includeDrafts?: boolean } = {}
) {
  const invoice = await loadInvoice(prisma, tenantId, invoiceId);
  if (invoice.status === InvoiceStatus.DRAFT && !options.includeDrafts) throw new NotFoundError('Facture introuvable.');
  return serializePlatformInvoice(invoice, { withLines: true });
}

function payloadForPdf(invoice: Awaited<ReturnType<typeof loadInvoice>>, customer: PlatformCustomerInfo) {
  return {
    invoiceNumber: isDraftNumber(invoice.invoiceNumber) ? 'BROUILLON' : invoice.invoiceNumber,
    nature: invoice.billingNature,
    status: invoice.status,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    currency: invoice.currency,
    issuer: (invoice.issuerSnapshot as unknown as PlatformIssuerInfo | null) ?? platformIssuer(),
    customer: (invoice.customerSnapshot as unknown as PlatformCustomerInfo | null) ?? customer,
    lines: invoice.lines.map(l => ({
      kind: l.kind,
      label: l.label,
      quantity: toNumber(l.quantity),
      unitPrice: toNumber(l.unitPrice),
      amount: toNumber(l.amount),
      periodStart: l.periodStart,
      periodEnd: l.periodEnd
    })),
    amountExclTax: toNumber(invoice.amountExclTax),
    taxRate: toNumber(invoice.taxRate ?? PLATFORM_TAX_RATE_PERCENT),
    taxAmount: toNumber(invoice.taxAmount),
    amountTotal: toNumber(invoice.amountTotal),
    creditedInvoiceNumber: invoice.creditedInvoice?.invoiceNumber ?? null,
    paidAt: invoice.paidAt,
    paymentMethod: invoice.paymentMethod,
    paymentReference: invoice.paymentReference,
    notes: invoice.notes
  };
}

/** PDF d'une facture de l'agence. Un brouillon n'est lisible que par le super-admin. */
export async function renderPlatformInvoicePdf(
  tenantId: string,
  invoiceId: string,
  options: { includeDrafts?: boolean } = {}
): Promise<{ filename: string; buffer: Buffer }> {
  const invoice = await loadInvoice(prisma, tenantId, invoiceId);
  if (invoice.status === InvoiceStatus.DRAFT && !options.includeDrafts) throw new NotFoundError('Facture introuvable.');
  const customer = invoice.customerSnapshot
    ? (invoice.customerSnapshot as unknown as PlatformCustomerInfo)
    : await customerOf(prisma, tenantId);
  const buffer = await buildPlatformInvoicePdf(payloadForPdf(invoice, customer));
  const base = isDraftNumber(invoice.invoiceNumber) ? `brouillon-${invoice.id.slice(0, 8)}` : invoice.invoiceNumber;
  return { filename: `${invoice.billingNature === 'CREDIT_NOTE' ? 'avoir' : 'facture'}-${base}.pdf`, buffer };
}

// =============================================================== e-mail

/** Administrateurs actifs de l'agence (TENANT_ADMIN), sinon son e-mail de contact. */
async function billingRecipients(tenantId: string): Promise<string[]> {
  const role = await prisma.role.findUnique({ where: { key: 'TENANT_ADMIN' }, select: { id: true } });
  if (role) {
    const links = await prisma.userRole.findMany({ where: { tenantId, roleId: role.id }, select: { userId: true } });
    const ids = [...new Set(links.map(l => l.userId))];
    if (ids.length > 0) {
      const users = await prisma.user.findMany({ where: { id: { in: ids }, isActive: true }, select: { email: true } });
      if (users.length > 0) return users.map(u => u.email);
    }
  }
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { contactEmail: true } });
  return tenant?.contactEmail ? [tenant.contactEmail] : [];
}

/**
 * Envoie la facture (ou l'avoir) emise a l'administrateur de l'agence, PDF
 * joint, au nom de la plateforme. Un echec d'envoi est journalise, jamais
 * propage : la facture reste emise et consultable dans l'espace de l'agence.
 */
export async function sendPlatformInvoiceEmail(tenantId: string, invoiceId: string): Promise<number> {
  try {
    return await runWithTenantContext({ tenantId }, async () => {
      const invoice = await loadInvoice(prisma, tenantId, invoiceId);
      if (invoice.status === InvoiceStatus.DRAFT) return 0;
      const recipients = await billingRecipients(tenantId);
      if (recipients.length === 0) return 0;
      const { filename, buffer } = await renderPlatformInvoicePdf(tenantId, invoiceId);
      const { emailService } = await import('./email-service');
      const { frontendUrl } = await import('../config/env');
      const isCredit = invoice.billingNature === 'CREDIT_NOTE';
      const amount = formatFcfa(toNumber(invoice.amountTotal), invoice.currency);
      const subject = isCredit
        ? t('Avoir ImmoTopia {{number}}', { number: invoice.invoiceNumber })
        : t('Facture ImmoTopia {{number}}', { number: invoice.invoiceNumber });
      const text = isCredit
        ? t("Votre facture {{credited}} est annulée par l'avoir {{number}} ({{amount}}). Le document est joint.", {
            credited: invoice.creditedInvoice?.invoiceNumber ?? '',
            number: invoice.invoiceNumber,
            amount
          })
        : invoice.status === InvoiceStatus.PAID
          ? t('Votre facture {{number}} ({{amount}}) est jointe. Elle est déjà réglée.', {
              number: invoice.invoiceNumber,
              amount
            })
          : t(
              "Votre facture {{number}} d'un montant de {{amount}} TTC est jointe. Elle est à régler avant le {{date}} depuis {{url}}.",
              {
                number: invoice.invoiceNumber,
                amount,
                date: invoice.dueDate.toISOString().slice(0, 10),
                url: `${frontendUrl}/tenant/${tenantId}/settings/abonnement`
              }
            );
      let sent = 0;
      for (const to of recipients) {
        try {
          // eslint-disable-next-line no-await-in-loop -- quelques destinataires.
          await emailService.sendEmail({
            to,
            subject,
            text,
            asPlatform: true,
            attachments: [{ filename, content: buffer, contentType: 'application/pdf' }]
          });
          sent += 1;
        } catch (error) {
          logger.warn('Platform invoice e-mail failed', {
            tenantId,
            invoiceId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      if (sent > 0)
        await prisma.invoice.updateMany({
          where: { id: invoiceId, tenantId, kind: PLATFORM },
          data: { sentAt: new Date() }
        });
      return sent;
    });
  } catch (error) {
    logger.warn('Platform invoice e-mail skipped', {
      tenantId,
      invoiceId,
      error: error instanceof Error ? error.message : String(error)
    });
    return 0;
  }
}

// =============================================================== tache planifiee

export interface BillingStepOutcome {
  periodInvoice: 'NONE' | 'CREATED' | 'EXISTING';
  overageInvoices: number;
  overdue: number;
}

/** Fenetres mensuelles de depassement ecoulees au plus 35 jours avant `now`, non encore traitees. */
export function dueOverageWindows(
  annualPeriodStart: Date,
  annualPeriodEnd: Date,
  now: Date,
  checkedThrough: Date | null
): Array<{ start: Date; end: Date }> {
  const windows: Array<{ start: Date; end: Date }> = [];
  const floor = Math.max(checkedThrough?.getTime() ?? 0, now.getTime() - 35 * DAY_MS);
  let start = new Date(annualPeriodStart.getTime());
  for (let i = 0; i < 13; i += 1) {
    const end = addBillingPeriod(start, 'MONTHLY');
    if (end.getTime() > now.getTime() || end.getTime() > annualPeriodEnd.getTime()) break;
    if (end.getTime() > floor) windows.push({ start, end });
    start = end;
  }
  return windows;
}

/**
 * Etape de facturation de la tache planifiee, AVANT `processBillingBoundary`
 * (qui renouvelle si une facture PAYEE couvre la periode suivante, sinon
 * passe PAST_DUE) :
 * 1. annuel : facture de depassement de chaque fenetre mensuelle ecoulee
 *    (§6 ter), avant que le renouvellement ne deplace l'ancrage des fenetres ;
 * 0. abonnement gratuit (`isFreeSubscription`) : aucune facture, retour immediat ;
 * 2. echeance d'essai ou de periode atteinte : facture de la periode
 *    suivante generee, emise et envoyee (une facture a zero est PAYEE
 *    d'office, donc renouvelee) ;
 * 3. factures emises dont l'echeance est passee -> OVERDUE.
 */
export async function runPlatformBillingStep(
  subscriptionId: string,
  now: Date = new Date()
): Promise<BillingStepOutcome> {
  const outcome: BillingStepOutcome = { periodInvoice: 'NONE', overageInvoices: 0, overdue: 0 };
  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) return outcome;
  const live: SubscriptionStatus[] = [
    SubscriptionStatus.TRIALING,
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.PAST_DUE
  ];
  if (!live.includes(sub.status)) return outcome;
  const tenantId = sub.tenantId;
  // Abonnement gratuit (tous les elements a prix nul) : aucune facture de periode
  // ni de depassement. `processBillingBoundary` le renouvelle sans facture.
  if (await isFreeSubscription(prisma, sub.id)) {
    outcome.overdue = await markOverdueInvoices(tenantId, now);
    return outcome;
  }

  if (
    sub.billingCycle === 'ANNUAL' &&
    sub.status !== SubscriptionStatus.TRIALING &&
    sub.quotaPolicy === 'BILL_OVERAGE'
  ) {
    const metadata = metadataOf(sub.metadata);
    const checked =
      typeof metadata.overageCheckedThrough === 'string' ? new Date(metadata.overageCheckedThrough) : null;
    const windows = dueOverageWindows(sub.currentPeriodStart, sub.currentPeriodEnd, now, checked);
    for (const window of windows) {
      // Un instant DANS la fenetre : `previewNextInvoice` la retrouve.
      const at = new Date(window.end.getTime() - 1);
      // eslint-disable-next-line no-await-in-loop -- une fenetre par mois au plus.
      const draft = await buildPlatformInvoiceDraft(tenantId, 'OVERAGE', { at });
      if (draft && draft.periodStart.getTime() === window.start.getTime()) {
        // eslint-disable-next-line no-await-in-loop -- idem.
        const res = await generateInvoiceForPeriod(tenantId, { nature: 'OVERAGE', at, automatic: true });
        if (res?.created) outcome.overageInvoices += 1;
      }
      // eslint-disable-next-line no-await-in-loop -- idem.
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { metadata: { ...metadata, overageCheckedThrough: window.end.toISOString() } as Prisma.InputJsonValue }
      });
      metadata.overageCheckedThrough = window.end.toISOString();
    }
  }

  const boundary =
    sub.status === SubscriptionStatus.TRIALING ? (sub.trialEndsAt ?? sub.currentPeriodEnd) : sub.currentPeriodEnd;
  if (boundary.getTime() <= now.getTime()) {
    const res = await generateInvoiceForPeriod(tenantId, { nature: 'PERIOD', automatic: true, at: now });
    if (res) outcome.periodInvoice = res.created ? 'CREATED' : 'EXISTING';
  }

  outcome.overdue = await markOverdueInvoices(tenantId, now);
  return outcome;
}

// =============================================================== reglement (super-admin)

/**
 * Constat de paiement par le super-admin (mode et reference). Passe par la
 * porte unique du lot B (`recordManualPayment` -> `settlePlatformInvoiceTx`),
 * qui ecrit le reglement et repasse l'abonnement ACTIVE si la facture couvre
 * l'echeance.
 */
export async function markPlatformInvoicePaid(
  tenantId: string,
  invoiceId: string,
  input: { method: PlatformPaymentMethod; paidAt?: Date; reference?: string | null; note?: string | null },
  actorUserId: string
) {
  const invoice = await loadInvoice(prisma, tenantId, invoiceId);
  if (invoice.billingNature === 'CREDIT_NOTE') throw new BadRequestError('Un avoir ne se règle pas.');
  const { recordManualPayment } = await import('./platform-payment-service');
  return recordManualPayment(
    tenantId,
    invoiceId,
    {
      method: input.method,
      paidAt: input.paidAt ?? new Date(),
      reference: input.reference ?? null,
      note: input.note ?? null
    },
    actorUserId
  );
}
