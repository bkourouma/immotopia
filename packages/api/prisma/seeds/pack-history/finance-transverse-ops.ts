/**
 * Finance transverse, partie 2 : exploitation courante de l'agence.
 *
 *  - fournisseurs, factures reçues et règlements (loyer des bureaux, électricité,
 *    eau, téléphone, assurance, comptable…), pour les agences qui n'ont pas de
 *    chantiers (Agence, Syndic, Patrimoine) ; passe par les vrais moteurs
 *    (`createSupplierInvoiceTx`, `validateSupplierInvoiceTx`, …) ;
 *  - affectation des règlements à leur vrai compte de trésorerie (banque, Mobile
 *    Money) : le moteur fournisseur débite toujours la caisse par défaut ;
 *  - honoraires de syndic encaissés auprès des copropriétés ;
 *  - apport initial de l'exploitant ;
 *  - pièces annulées (factures fournisseurs saisies à tort).
 *
 * Toutes les écritures passent par `postDocumentEntryTx` (équilibre vérifié,
 * pièce d'origine rattachée). Idempotent par bloc.
 */
import { createHash } from 'crypto';
import { MembershipStatus } from '@prisma/client';

import { between, pick } from './types';
import type { HistoryContext } from './types';

export const DAY = 86_400_000;

/** Instant UTC (les autres générateurs écrivent à 10 h). */
export function at(year: number, month0: number, day: number, hour = 10, minute = 0): Date {
  return new Date(Date.UTC(year, month0, day, hour, minute, 0, 0));
}

/** Identifiant stable (UUID v5-like) d'une pièce de ce seed. */
export function pieceId(tenantId: string, kind: string, key: string | number): string {
  const h = createHash('sha1').update(`${tenantId}:${kind}:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/** Membres actifs de l'agence (auteurs des pièces), l'administrateur à défaut. */
export async function activeStaff(ctx: HistoryContext): Promise<string[]> {
  const members = await ctx.prisma.membership.findMany({
    where: { tenantId: ctx.tenantId, status: MembershipStatus.ACTIVE },
    select: { userId: true }
  });
  return Array.from(new Set([ctx.adminUserId, ...members.map(m => m.userId)]));
}

type Tx = Parameters<Parameters<typeof import('../../../src/utils/database').prisma.$transaction>[0]>[0];

export interface TreasuryRef {
  id: string;
  kind: string;
  accountNumber: string;
  label: string;
  chartOfAccountId: string;
  mmOperator: string | null;
  isDefault: boolean;
}

export async function loadTreasury(ctx: HistoryContext): Promise<TreasuryRef[]> {
  return ctx.prisma.treasuryAccount.findMany({
    where: { tenantId: ctx.tenantId, isActive: true },
    select: {
      id: true,
      kind: true,
      accountNumber: true,
      label: true,
      chartOfAccountId: true,
      mmOperator: true,
      isDefault: true
    },
    orderBy: { accountNumber: 'asc' }
  });
}

/** Compte de trésorerie où passe un règlement selon son moyen (null = caisse, on ne déplace rien). */
export function treasuryForMethod(accounts: TreasuryRef[], method: string, salt: number): TreasuryRef | null {
  const bank = accounts.filter(a => a.kind === 'BANK' && a.accountNumber !== '5213');
  const main = bank.find(a => a.accountNumber === '5211') ?? bank[0];
  const second = bank.find(a => a.accountNumber === '5212');
  switch (method) {
    case 'BANK_TRANSFER':
    case 'CHEQUE':
    case 'CHECK':
    case 'CARD':
      return second && salt % 100 < 35 ? second : (main ?? null);
    case 'MOBILE_MONEY': {
      const mm = accounts.filter(a => a.kind === 'MOBILE_MONEY');
      const order = ['ORANGE', 'MTN', 'WAVE', 'MOOV'];
      const weights = [40, 65, 85, 100];
      const r = salt % 100;
      const operator = order[weights.findIndex(w => r < w)];
      return mm.find(a => a.mmOperator === operator) ?? mm[0] ?? null;
    }
    default:
      return null;
  }
}

// ───────────────────────────────────────────────────────────────── fournisseurs

interface SupplierSpec {
  name: string;
  contact: string;
  phone: string;
  email: string;
  account: { number: string; name: string };
  /** Une facture tous les `every` mois. */
  every: number;
  offset: number;
  base: number;
  day: [number, number];
  label: (d: Date) => string;
  refPrefix: string;
  method: 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CASH' | 'CHEQUE';
  packs: Array<'AGENCE' | 'SYNDIC' | 'PATRIMOINE'>;
  /** Montant fixe d'un mois sur l'autre (loyer) plutôt que variable. */
  fixed?: boolean;
}

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre'
];
const monthName = (d: Date) => `${MONTHS_FR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

const SUPPLIERS: SupplierSpec[] = [
  {
    name: 'SCI Les Palmiers — bailleur des bureaux',
    contact: 'M. Armand Koffi',
    phone: '+225 27 21 24 56 10',
    email: 'gestion@sci-lespalmiers.example.ci',
    account: { number: '6222', name: 'Locations de bâtiments (bureaux)' },
    every: 1,
    offset: 0,
    base: 650_000,
    day: [2, 5],
    label: d => `Loyer des bureaux — ${monthName(d)}`,
    refPrefix: 'QUIT',
    method: 'BANK_TRANSFER',
    packs: ['AGENCE', 'SYNDIC'],
    fixed: true
  },
  {
    name: 'CIE — Compagnie Ivoirienne d’Électricité',
    contact: 'Agence commerciale Cocody',
    phone: '+225 27 22 44 00 00',
    email: 'clients.cocody@cie.example.ci',
    account: { number: '6052', name: 'Électricité' },
    every: 1,
    offset: 0,
    base: 118_000,
    day: [8, 14],
    label: d => `Consommation d’électricité — ${monthName(d)}`,
    refPrefix: 'CIE',
    method: 'MOBILE_MONEY',
    packs: ['AGENCE', 'SYNDIC']
  },
  {
    name: 'SODECI — distribution d’eau',
    contact: 'Service abonnés Cocody',
    phone: '+225 27 21 23 32 00',
    email: 'abonnes@sodeci.example.ci',
    account: { number: '6051', name: 'Eau' },
    every: 2,
    offset: 1,
    base: 34_500,
    day: [10, 16],
    label: d => `Facture d’eau — période se terminant en ${monthName(d)}`,
    refPrefix: 'SOD',
    method: 'MOBILE_MONEY',
    packs: ['AGENCE', 'SYNDIC']
  },
  {
    name: 'Orange Côte d’Ivoire — fibre et mobiles',
    contact: 'Service entreprises',
    phone: '+225 07 07 07 07 07',
    email: 'entreprises@orange.example.ci',
    account: { number: '628', name: 'Frais de télécommunications' },
    every: 1,
    offset: 0,
    base: 86_000,
    day: [3, 9],
    label: d => `Abonnement fibre et forfaits mobiles — ${monthName(d)}`,
    refPrefix: 'ORA',
    method: 'MOBILE_MONEY',
    packs: ['AGENCE', 'SYNDIC', 'PATRIMOINE']
  },
  {
    name: 'NSIA Assurances — multirisque professionnelle',
    contact: 'Mme Awa Traoré',
    phone: '+225 27 20 31 78 00',
    email: 'pro@nsia-assurances.example.ci',
    account: { number: '625', name: 'Primes d’assurance' },
    every: 12,
    offset: 3,
    base: 485_000,
    day: [12, 20],
    label: d => `Prime annuelle multirisque professionnelle ${d.getUTCFullYear()}`,
    refPrefix: 'NSIA',
    method: 'CHEQUE',
    packs: ['AGENCE', 'SYNDIC', 'PATRIMOINE']
  },
  {
    name: 'Librairie Papeterie Cocody Angré',
    contact: 'M. Ibrahim Ouattara',
    phone: '+225 07 48 12 33 90',
    email: 'commandes@papeterie-angre.example.ci',
    account: { number: '6055', name: 'Fournitures de bureau non stockables' },
    every: 2,
    offset: 0,
    base: 78_000,
    day: [15, 25],
    label: d => `Fournitures de bureau et consommables d’impression — ${monthName(d)}`,
    refPrefix: 'FAC',
    method: 'CASH',
    packs: ['AGENCE', 'SYNDIC', 'PATRIMOINE']
  },
  {
    name: 'TotalEnergies Marcory — cartes carburant',
    contact: 'Gestionnaire de flotte',
    phone: '+225 27 21 26 40 00',
    email: 'flotte@totalenergies.example.ci',
    account: { number: '6053', name: 'Carburants et lubrifiants' },
    every: 1,
    offset: 0,
    base: 152_000,
    day: [26, 28],
    label: d => `Cartes carburant — consommation de ${monthName(d)}`,
    refPrefix: 'TOT',
    method: 'BANK_TRANSFER',
    packs: ['AGENCE', 'SYNDIC']
  },
  {
    name: 'Net Services CI — entretien des locaux',
    contact: 'Mme Fatoumata Diaby',
    phone: '+225 05 06 78 91 20',
    email: 'contact@netservices.example.ci',
    account: { number: '624', name: 'Entretien, réparations et maintenance' },
    every: 1,
    offset: 0,
    base: 65_000,
    day: [28, 28],
    label: d => `Nettoyage et entretien des bureaux — ${monthName(d)}`,
    refPrefix: 'NS',
    method: 'MOBILE_MONEY',
    packs: ['AGENCE', 'SYNDIC']
  },
  {
    name: 'Cabinet Konan & Associés — expert-comptable',
    contact: 'M. Jean-Marc Konan',
    phone: '+225 27 22 49 11 25',
    email: 'cabinet@konan-associes.example.ci',
    account: { number: '6324', name: 'Honoraires' },
    every: 3,
    offset: 2,
    base: 285_000,
    day: [18, 26],
    label: d => `Tenue comptable et déclarations — trimestre clos en ${monthName(d)}`,
    refPrefix: 'KA',
    method: 'BANK_TRANSFER',
    packs: ['AGENCE', 'SYNDIC', 'PATRIMOINE']
  },
  {
    name: 'Kreatif Com — agence de communication',
    contact: 'Mme Estelle Gnaoré',
    phone: '+225 07 59 44 08 13',
    email: 'hello@kreatifcom.example.ci',
    account: { number: '627', name: 'Publicité, publications, relations publiques' },
    every: 2,
    offset: 1,
    base: 190_000,
    day: [5, 22],
    label: d => `Campagne d’annonces et visuels — ${monthName(d)}`,
    refPrefix: 'KC',
    method: 'BANK_TRANSFER',
    packs: ['AGENCE']
  },
  {
    name: 'Entretien Plus — petits travaux et dépannage',
    contact: 'M. Yao Kouadio',
    phone: '+225 01 40 22 18 77',
    email: 'devis@entretienplus.example.ci',
    account: { number: '624', name: 'Entretien, réparations et maintenance' },
    every: 4,
    offset: 2,
    base: 210_000,
    day: [6, 24],
    label: d => `Dépannage et petits travaux des locaux — ${monthName(d)}`,
    refPrefix: 'EP',
    method: 'CASH',
    packs: ['PATRIMOINE', 'SYNDIC', 'AGENCE']
  }
];

export type PackFlavor = 'AGENCE' | 'SYNDIC' | 'PATRIMOINE';

interface PlannedInvoice {
  spec: SupplierSpec;
  supplierIndex: number;
  date: Date;
  amount: number;
  reference: string;
  label: string;
  /** Jours avant le règlement (null = jamais réglée). */
  payAfterDays: number | null;
  split: boolean;
}

function planInvoices(ctx: HistoryContext, flavor: PackFlavor, specs: SupplierSpec[]): PlannedInvoice[] {
  const rng = ctx.rng;
  const out: PlannedInvoice[] = [];
  const startY = ctx.start.getUTCFullYear();
  const startM = ctx.start.getUTCMonth();
  const months = ctx.months + 1;
  const scale = flavor === 'PATRIMOINE' ? 0.55 : flavor === 'SYNDIC' ? 0.85 : 1;
  specs.forEach((spec, supplierIndex) => {
    for (let i = 0; i < months; i++) {
      if ((i - spec.offset) % spec.every !== 0 || i < spec.offset) continue;
      const y = startY + Math.floor((startM + i) / 12);
      const m0 = (startM + i) % 12;
      const date = at(y, m0, between(rng, spec.day[0], spec.day[1]), 9 + between(rng, 0, 6), between(rng, 0, 59));
      if (date.getTime() > ctx.end.getTime() - 2 * DAY) continue;
      const years = i / 12;
      const growth = 1 + 0.05 * years;
      const noise = spec.fixed ? 1 : 0.88 + rng() * 0.24;
      const amount = Math.max(5_000, roundTo(spec.base * scale * growth * noise, spec.fixed ? 5_000 : 500));
      const ym = `${y}${String(m0 + 1).padStart(2, '0')}`;
      const reference = spec.fixed
        ? `${spec.refPrefix}-${ym}`
        : `${spec.refPrefix}-${ym}-${String(between(rng, 100, 99999)).padStart(5, '0')}`;
      const ageDays = (ctx.end.getTime() - date.getTime()) / DAY;
      // Les factures des 25 derniers jours restent à régler (échéance à 30 jours).
      const recent = ageDays < 25;
      out.push({
        spec,
        supplierIndex,
        date,
        amount,
        reference,
        label: spec.label(date),
        payAfterDays: recent ? null : between(rng, 3, 24),
        split: !recent && amount >= 200_000 && rng() < 0.18
      });
    }
  });
  // Deux histoires de retard : une facture d'assurance et une du comptable laissées impayées (litige, pièce manquante).
  const olds = out.filter(p => p.payAfterDays !== null && (p.spec.refPrefix === 'NSIA' || p.spec.refPrefix === 'KA'));
  for (const p of [olds[olds.length - 1], olds[Math.max(0, olds.length - 3)]]) {
    if (p && (ctx.end.getTime() - p.date.getTime()) / DAY < 200) p.payAfterDays = null;
  }
  // Quatre factures saisies en double (même montant, lendemain) : elles seront annulées (`seedVoids`).
  const dupable = out.filter(
    p =>
      p.payAfterDays !== null &&
      !p.spec.fixed &&
      (ctx.end.getTime() - p.date.getTime()) / DAY > 90 &&
      p.amount >= 30_000
  );
  const stride = Math.max(1, Math.floor(dupable.length / 4));
  for (let i = 3; i < dupable.length; i += stride) {
    if (out.filter(p => p.reference.endsWith('-DUP')).length >= 4) break;
    const base = dupable[i];
    out.push({
      ...base,
      date: new Date(base.date.getTime() + DAY),
      reference: `${base.reference}-DUP`,
      payAfterDays: null,
      split: false
    });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Fournisseurs de l'agence et leurs factures sur 36 mois. Saute le bloc si
 * l'agence a déjà des fournisseurs (Promoteur, Opérateur intégré).
 */
export async function seedSuppliers(ctx: HistoryContext, flavor: PackFlavor, staff: string[]): Promise<void> {
  const { prisma, tenantId, log } = ctx;
  if ((await prisma.supplier.count({ where: { tenantId } })) > 0) return;

  const specs = SUPPLIERS.filter(s => s.packs.includes(flavor));
  const plan = planInvoices(ctx, flavor, specs);
  if (plan.length === 0) return;

  const [{ prisma: appPrisma }, suppliers, treasury] = await Promise.all([
    import('../../../src/utils/database'),
    import('../../../src/lib/finance/suppliers'),
    loadTreasury(ctx)
  ]);
  const { ensureChartAccountTx } = await import('../../../src/lib/treasury/accounts');
  const { ensureOperationalJournalTx } = await import('../../../src/lib/finance/accounting');

  // Fournisseurs.
  const supplierIds: string[] = [];
  for (const spec of specs) {
    const rec = await appPrisma.$transaction(tx =>
      suppliers.createSupplierTx(tx, tenantId, {
        name: spec.name,
        kind: 'SERVICES' as never,
        contactName: spec.contact,
        phone: spec.phone,
        email: spec.email
      })
    );
    supplierIds.push(rec.id);
  }

  let invoicesCount = 0;
  let paymentsCount = 0;
  let k = 0;
  for (const p of plan) {
    k += 1;
    const creator = pick(ctx.rng, staff);
    const validator = pick(ctx.rng, staff);
    try {
      const invoiceId = await appPrisma.$transaction(
        async tx => {
          const created = await suppliers.createSupplierInvoiceTx(tx, tenantId, {
            supplierId: supplierIds[p.supplierIndex],
            invoiceDate: p.date,
            reference: p.reference,
            lines: [{ label: p.label, amount: p.amount }],
            allocations: [],
            createdByUserId: creator,
            siteRequired: false
          });
          const validated = await suppliers.validateSupplierInvoiceTx(tx, tenantId, created.id, validator);
          // Date de la pièce : saisie le jour même, validée le lendemain.
          const row = await tx.supplierInvoice.update({
            where: { id: created.id, tenantId },
            data: { createdAt: p.date, validatedAt: new Date(p.date.getTime() + 20 * 3_600_000) },
            select: { journalEntryId: true }
          });
          // Le moteur débite « Achats » (601) : on range la charge sur son vrai compte.
          if (row.journalEntryId) {
            const target = await ensureChartAccountTx(
              tx,
              tenantId,
              p.spec.account.number,
              p.spec.account.name,
              'EXPENSE'
            );
            await tx.journalEntryLine.updateMany({
              where: { entryId: row.journalEntryId, debit: { gt: 0 } },
              data: { accountId: target }
            });
          }
          return validated.id;
        },
        { timeout: 60_000 }
      );
      invoicesCount += 1;

      if (p.payAfterDays === null) continue;
      const payDate = new Date(Math.min(p.date.getTime() + p.payAfterDays * DAY, ctx.end.getTime() - DAY));
      const chunks = p.split
        ? [
            { date: payDate, amount: roundTo(p.amount * 0.5, 500) },
            {
              date: new Date(Math.min(payDate.getTime() + 22 * DAY, ctx.end.getTime() - DAY)),
              amount: p.amount - roundTo(p.amount * 0.5, 500)
            }
          ]
        : [{ date: payDate, amount: p.amount }];
      for (const chunk of chunks) {
        await appPrisma.$transaction(
          async tx => {
            const method = p.spec.method;
            const pay = await suppliers.createSupplierPaymentTx(tx, tenantId, {
              supplierId: supplierIds[p.supplierIndex],
              paymentDate: chunk.date,
              amount: chunk.amount,
              method,
              allocations: [{ invoiceId, amount: chunk.amount }],
              createdByUserId: creator
            });
            await suppliers.validateSupplierPaymentTx(tx, tenantId, pay.id, validator);
            const row = await tx.supplierPayment.update({
              where: { id: pay.id, tenantId },
              data: { createdAt: chunk.date, validatedAt: chunk.date },
              select: { journalEntryId: true }
            });
            await repointPaymentEntry(tx, ctx, row.journalEntryId, treasury, method, k, ensureOperationalJournalTx);
          },
          { timeout: 60_000 }
        );
        paymentsCount += 1;
      }
    } catch (error) {
      log(`finance : facture ${p.reference} ignorée (${(error as Error).message.slice(0, 160)})`);
    }
  }
  log(`finance : ${specs.length} fournisseur(s), ${invoicesCount} facture(s), ${paymentsCount} règlement(s)`);
}

/** Déplace le crédit de la caisse vers le compte réel du moyen de paiement. */
export async function repointPaymentEntry(
  tx: Tx,
  ctx: HistoryContext,
  entryId: string | null,
  treasury: TreasuryRef[],
  method: string,
  salt: number,
  ensureJournal: (tx: Tx, tenantId: string, year: number, type: 'BANK' | 'CASH' | 'GENERAL') => Promise<string>
): Promise<boolean> {
  if (!entryId) return false;
  const target = treasuryForMethod(treasury, method, salt);
  if (!target) return false;
  const cash = treasury.find(a => a.kind === 'CASH' && a.isDefault) ?? treasury.find(a => a.kind === 'CASH');
  if (!cash) return false;
  const line = await tx.journalEntryLine.findFirst({
    where: { entryId, accountId: cash.chartOfAccountId, credit: { gt: 0 } },
    select: { id: true, entry: { select: { entryDate: true } } }
  });
  if (!line) return false;
  await tx.journalEntryLine.update({ where: { id: line.id }, data: { accountId: target.chartOfAccountId } });
  const journalId = await ensureJournal(tx, ctx.tenantId, line.entry.entryDate.getUTCFullYear(), 'BANK');
  await tx.journalEntry.update({ where: { id: entryId }, data: { journalId } });
  return true;
}

/**
 * Règlements d'agences qui portent un chantier (Promoteur, Opérateur intégré) :
 * le moteur les a débités de la caisse quel que soit le moyen. On les range sur
 * la banque ou le Mobile Money selon le moyen réellement saisi ; les
 * contrats de tâcherons et loyers de terrain sont réglés par la banque.
 */
export async function repointConstructionPayments(ctx: HistoryContext): Promise<void> {
  const { prisma, tenantId, log } = ctx;
  const treasury = await loadTreasury(ctx);
  const cash = treasury.find(a => a.kind === 'CASH' && a.isDefault) ?? treasury.find(a => a.kind === 'CASH');
  if (!cash || !treasury.some(a => a.kind === 'BANK')) return;
  const lines = await prisma.journalEntryLine.findMany({
    where: {
      accountId: cash.chartOfAccountId,
      credit: { gt: 0 },
      entry: { tenantId, documentType: { in: ['SUPPLIER_PAYMENT', 'CONTRACTOR_PAYMENT', 'LAND_LEASE_PAYMENT'] } }
    },
    select: { entryId: true, entry: { select: { documentType: true, documentId: true } } }
  });
  if (lines.length === 0) return;
  const supplierIds = lines
    .filter(l => l.entry.documentType === 'SUPPLIER_PAYMENT')
    .map(l => l.entry.documentId as string);
  const methods = new Map(
    (
      await prisma.supplierPayment.findMany({
        where: { tenantId, id: { in: supplierIds } },
        select: { id: true, method: true }
      })
    ).map(m => [m.id, m.method])
  );
  const [{ prisma: appPrisma }, accounting] = await Promise.all([
    import('../../../src/utils/database'),
    import('../../../src/lib/finance/accounting')
  ]);
  let moved = 0;
  let i = 0;
  await appPrisma.$transaction(
    async tx => {
      for (const l of lines) {
        i += 1;
        const method =
          l.entry.documentType === 'SUPPLIER_PAYMENT'
            ? (methods.get(l.entry.documentId as string) ?? 'BANK_TRANSFER')
            : 'BANK_TRANSFER';
        if (await repointPaymentEntry(tx, ctx, l.entryId, treasury, method, i, accounting.ensureOperationalJournalTx))
          moved += 1;
      }
    },
    { timeout: 300_000, maxWait: 30_000 }
  );
  if (moved) log(`finance : ${moved} règlement(s) de chantier rangés sur banque / Mobile Money`);
}

// ───────────────────────────────────────────────────────── recettes et apports

async function postEntry(
  ctx: HistoryContext,
  params: {
    kind: string;
    key: string | number;
    date: Date;
    reference: string;
    description: string;
    journalType: 'BANK' | 'CASH' | 'GENERAL';
    lines: Array<{
      accountNumber: string;
      accountName: string;
      type: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE' | 'EQUITY';
      treasury?: TreasuryRef;
      debit?: number;
      credit?: number;
      label: string;
    }>;
  }
): Promise<void> {
  const [{ prisma: appPrisma }, accounting, accounts] = await Promise.all([
    import('../../../src/utils/database'),
    import('../../../src/lib/finance/accounting'),
    import('../../../src/lib/treasury/accounts')
  ]);
  await appPrisma.$transaction(
    async tx => {
      const journalId = await accounting.ensureOperationalJournalTx(
        tx,
        ctx.tenantId,
        params.date.getUTCFullYear(),
        params.journalType
      );
      const lines = [];
      for (const l of params.lines) {
        const accountId = l.treasury
          ? l.treasury.chartOfAccountId
          : await accounts.ensureChartAccountTx(tx, ctx.tenantId, l.accountNumber, l.accountName, l.type as 'ASSET');
        lines.push({ accountId, debit: l.debit, credit: l.credit, label: l.label });
      }
      await accounting.postDocumentEntryTx(tx, {
        tenantId: ctx.tenantId,
        journalId,
        entryDate: params.date,
        reference: params.reference,
        description: params.description,
        documentType: params.kind as never,
        documentId: pieceId(ctx.tenantId, params.kind, params.key),
        lines
      });
    },
    { timeout: 60_000 }
  );
}

export { postEntry };

/** Apport initial de l'exploitant : trésorerie de départ de l'agence. */
export async function seedOpeningContribution(
  ctx: HistoryContext,
  flavor: PackFlavor,
  withConstruction: boolean
): Promise<void> {
  const { prisma, tenantId, log } = ctx;
  if ((await prisma.journalEntry.count({ where: { tenantId, documentType: 'AGENCY_CAPITAL' } })) > 0) return;
  const treasury = await loadTreasury(ctx);
  const bank = treasury.find(a => a.accountNumber === '5211') ?? treasury.find(a => a.kind === 'BANK');
  if (!bank) return;
  const amount = withConstruction
    ? 150_000_000
    : flavor === 'PATRIMOINE'
      ? 12_000_000
      : flavor === 'SYNDIC'
        ? 10_000_000
        : 20_000_000;
  const date = at(ctx.start.getUTCFullYear(), ctx.start.getUTCMonth(), 3, 10);
  const equity = flavor === 'PATRIMOINE';
  await postEntry(ctx, {
    kind: 'AGENCY_CAPITAL',
    key: 'opening',
    date,
    reference: 'APPORT-INIT',
    description: equity
      ? 'Apport initial de l’investisseur en compte courant'
      : 'Libération du capital social à la constitution',
    journalType: 'BANK',
    lines: [
      {
        accountNumber: '5211',
        accountName: bank.label,
        type: 'ASSET',
        treasury: bank,
        debit: amount,
        label: 'Versement initial en banque'
      },
      equity
        ? {
            accountNumber: '4621',
            accountName: 'Associés, comptes courants',
            type: 'LIABILITY',
            credit: amount,
            label: 'Apport initial'
          }
        : {
            accountNumber: '101',
            accountName: 'Capital social',
            type: 'EQUITY',
            credit: amount,
            label: 'Capital social'
          }
    ]
  });
  log('finance : apport initial passé');
}

/** Honoraires de syndic : une écriture par copropriété et par mois (+ honoraires d'assemblée générale). */
export async function seedSyndicFees(ctx: HistoryContext): Promise<void> {
  const { prisma, tenantId, log } = ctx;
  const copros = await prisma.syndicate.findMany({
    where: { tenantId },
    select: { id: true, name: true, createdAt: true, _count: { select: { lots: true } } },
    orderBy: { name: 'asc' }
  });
  if (copros.length === 0) return;
  if ((await prisma.journalEntry.count({ where: { tenantId, documentType: 'SYNDIC_FEE' } })) > 0) return;
  const treasury = await loadTreasury(ctx);
  const bank = treasury.find(a => a.accountNumber === '5211') ?? treasury.find(a => a.kind === 'BANK');
  const orange = treasury.find(a => a.kind === 'MOBILE_MONEY' && a.mmOperator === 'ORANGE');
  if (!bank) return;

  let n = 0;
  const startY = ctx.start.getUTCFullYear();
  const startM = ctx.start.getUTCMonth();
  for (let ci = 0; ci < copros.length; ci++) {
    const copro = copros[ci];
    const lots = Math.max(copro._count.lots, 8);
    for (let i = 0; i < ctx.months + 1; i++) {
      const y = startY + Math.floor((startM + i) / 12);
      const m0 = (startM + i) % 12;
      const date = at(y, m0, between(ctx.rng, 6, 12), 11);
      if (date.getTime() > ctx.end.getTime() - DAY) continue;
      const monthly = roundTo(lots * 9_000 * (1 + 0.04 * (i / 12)), 1_000);
      const via = orange && ctx.rng() < 0.12 ? orange : bank;
      n += 1;
      await postEntry(ctx, {
        kind: 'SYNDIC_FEE',
        key: `${copro.id}:${i}`,
        date,
        reference: `HON-${y}${String(m0 + 1).padStart(2, '0')}-${String(ci + 1).padStart(2, '0')}`,
        description: `Honoraires de syndic — ${copro.name} — ${monthName(date)}`,
        journalType: 'BANK',
        lines: [
          {
            accountNumber: via.accountNumber,
            accountName: via.label,
            type: 'ASSET',
            treasury: via,
            debit: monthly,
            label: `Honoraires ${copro.name}`
          },
          {
            accountNumber: '70612',
            accountName: 'Honoraires de syndic de copropriété',
            type: 'INCOME',
            credit: monthly,
            label: `Honoraires ${copro.name}`
          }
        ]
      });
      // Honoraires de suivi de travaux (1 % à 5 % du montant des travaux votés), certains mois.
      const worksDate = at(y, m0, between(ctx.rng, 14, 24), 14);
      if (ctx.rng() < 0.3 && worksDate.getTime() < ctx.end.getTime() - DAY) {
        n += 1;
        const works = roundTo(120_000 + ctx.rng() * 380_000, 5_000);
        await postEntry(ctx, {
          kind: 'SYNDIC_FEE',
          key: `${copro.id}:travaux:${i}`,
          date: worksDate,
          reference: `HTR-${y}${String(m0 + 1).padStart(2, '0')}-${String(ci + 1).padStart(2, '0')}`,
          description: `Honoraires de suivi de travaux — ${copro.name} — ${monthName(date)}`,
          journalType: 'BANK',
          lines: [
            {
              accountNumber: bank.accountNumber,
              accountName: bank.label,
              type: 'ASSET',
              treasury: bank,
              debit: works,
              label: `Suivi de travaux ${copro.name}`
            },
            {
              accountNumber: '70612',
              accountName: 'Honoraires de syndic de copropriété',
              type: 'INCOME',
              credit: works,
              label: `Suivi de travaux ${copro.name}`
            }
          ]
        });
      }
      // Honoraires de tenue d'assemblée générale, une fois par an.
      if (m0 === 4 && date.getTime() < ctx.end.getTime() - 20 * DAY) {
        n += 1;
        const ag = roundTo(180_000 + lots * 1_500, 5_000);
        await postEntry(ctx, {
          kind: 'SYNDIC_FEE',
          key: `${copro.id}:ag:${y}`,
          date: at(y, 4, between(ctx.rng, 18, 26), 15),
          reference: `HAG-${y}-${String(ci + 1).padStart(2, '0')}`,
          description: `Honoraires de tenue d’assemblée générale — ${copro.name} — ${y}`,
          journalType: 'BANK',
          lines: [
            {
              accountNumber: bank.accountNumber,
              accountName: bank.label,
              type: 'ASSET',
              treasury: bank,
              debit: ag,
              label: `AG ${copro.name}`
            },
            {
              accountNumber: '70612',
              accountName: 'Honoraires de syndic de copropriété',
              type: 'INCOME',
              credit: ag,
              label: `AG ${copro.name}`
            }
          ]
        });
      }
    }
  }
  log(`finance : ${n} écriture(s) d’honoraires de syndic`);
}

// ───────────────────────────────────────────────────────────────── annulations

const VOID_REASONS = [
  'Facture saisie en double',
  'Montant erroné : facture rectificative reçue du fournisseur',
  'Prestation non réalisée : avoir demandé au fournisseur',
  'Facture adressée à une autre société',
  'Erreur de saisie du fournisseur : pièce remplacée'
];

/**
 * Pièces annulées : quelques factures fournisseurs validées mais jamais réglées
 * sont annulées par une pièce d'annulation liée (écriture inverse, motif).
 */
export async function seedVoids(ctx: HistoryContext, staff: string[]): Promise<void> {
  const { prisma, tenantId, log } = ctx;
  if ((await prisma.voidDocument.count({ where: { tenantId } })) > 0) return;
  const candidates = await prisma.supplierInvoice.findMany({
    where: {
      tenantId,
      status: 'VALIDATED',
      invoiceDate: { lt: new Date(ctx.end.getTime() - 40 * DAY), gt: new Date(ctx.end.getTime() - 1100 * DAY) },
      paymentAllocations: { none: {} },
      stockReceipts: { none: {} },
      stockSlips: { none: {} },
      purchaseOrderId: null
    },
    select: { id: true, invoiceDate: true, reference: true },
    orderBy: { invoiceDate: 'asc' }
  });
  // Les doublons saisis par ce seed d'abord ; les factures « en litige » (assurance, comptable) restent dues.
  const duplicates = candidates.filter(c => c.reference.endsWith('-DUP'));
  const others = candidates.filter(c => !c.reference.endsWith('-DUP') && !/^(NSIA|KA)-/.test(c.reference));
  const step = Math.max(1, Math.floor(others.length / 5));
  const chosen = (duplicates.length > 0 ? duplicates : others.filter((_, i) => i % step === 0)).slice(0, 5);
  if (chosen.length === 0) return;
  const [{ prisma: appPrisma }, accounting] = await Promise.all([
    import('../../../src/utils/database'),
    import('../../../src/lib/finance/accounting')
  ]);
  let done = 0;
  for (const [i, c] of chosen.entries()) {
    const when = new Date(c.invoiceDate.getTime() + between(ctx.rng, 2, 6) * DAY);
    try {
      await appPrisma.$transaction(
        async tx => {
          const res = await accounting.voidDocumentTx(tx, {
            tenantId,
            documentType: 'SUPPLIER_INVOICE',
            documentId: c.id,
            reason: VOID_REASONS[i % VOID_REASONS.length],
            voidedByUserId: pick(ctx.rng, staff)
          });
          await tx.voidDocument.update({ where: { id: res.voidDocumentId, tenantId }, data: { voidedAt: when } });
          if (res.reversingEntryId) {
            await tx.journalEntry.update({ where: { id: res.reversingEntryId }, data: { entryDate: when } });
          }
        },
        { timeout: 60_000 }
      );
      done += 1;
    } catch (error) {
      log(`finance : annulation de ${c.reference} impossible (${(error as Error).message.slice(0, 120)})`);
    }
  }
  if (done) log(`finance : ${done} pièce(s) annulée(s)`);
}
