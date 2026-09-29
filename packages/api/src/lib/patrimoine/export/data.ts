import { prisma } from '../../../utils/database';
import { badRequest } from '../../errors';
import {
  buildPropertyYieldInput,
  ensureTenantProperty,
  getPatrimoineOverview,
  OCCUPANCY_EXCLUDED_STATUSES
} from '../queries';
import { grossYield, latentCapitalGain, netNetYield, netYield } from '../yield';

/**
 * Collecte des données de l'export patrimoine (agence ou bien) — lot P3.
 *
 * Tout ici est déjà scopé `tenantId` (et `propertyId` pour un bien, après
 * `ensureTenantProperty`). Le rendement par bien réutilise
 * `buildPropertyYieldInput` et les fonctions de `lib/patrimoine/yield.ts` —
 * jamais recopiés ici — avec une concurrence bornée : un export d'agence peut
 * couvrir jusqu'à `MAX_EXPORT_PROPERTIES` biens, et `buildPropertyYieldInput`
 * lance à lui seul cinq requêtes par bien.
 *
 * Aucun champ de chemin de fichier (`filePath`, `fileUrl`, `receiptUrl`)
 * n'entre dans ce contrat : chaque `select` Prisma ci-dessous est explicite et
 * les exclut volontairement (voir `docs/governance/SECURITY.md`).
 */

/** Au-delà, un export "toute l'agence" doit être remplacé par des exports par bien. */
export const MAX_EXPORT_PROPERTIES = 500;

/** Pas plus de 5 calculs de rendement par bien en vol en même temps. */
const YIELD_CONCURRENCY = 5;

/** Seuil (en jours) sous lequel un document à échéance est "Expire bientôt". */
const EXPIRING_SOON_THRESHOLD_DAYS = 30;

export type DocumentState = 'EXPIRED' | 'EXPIRING_SOON' | 'UP_TO_DATE' | 'NO_DEADLINE';

export interface ExportDocumentRow {
  type: string;
  label: string;
  expiresAt: Date | null;
  state: DocumentState;
  daysRemaining: number | null;
}

export interface ExportValuationRow {
  valuatedAt: Date;
  estimatedValue: number;
  currency: string;
  method: string;
}

export interface ExportLoanRow {
  lender: string;
  capitalAmount: number;
  remainingCapital: number;
  interestRate: number;
  monthlyPayment: number;
  currency: string;
  startDate: Date;
  endDate: Date;
  status: string;
}

export interface ExportExpenseRow {
  category: string;
  label: string;
  amount: number;
  currency: string;
  paidAt: Date;
  isCapitalized: boolean;
}

export interface ExportWorkProgramRow {
  title: string;
  status: string;
  estimatedCost: number;
  actualCost: number | null;
  currency: string;
  plannedDate: Date;
  completedDate: Date | null;
}

export interface ExportYield {
  currentValue: number;
  annualRent: number;
  /** Dépenses non capitalisées des 12 derniers mois glissants — voir `buildPropertyYieldInput`. */
  annualExpenses: number;
  grossYield: number;
  netYield: number;
  netNetYield: number | null;
  latentCapitalGain: number | null;
}

export interface ExportProperty {
  id: string;
  internalReference: string;
  title: string;
  propertyType: string;
  status: string;
  address: string;
  valuations: ExportValuationRow[];
  loans: ExportLoanRow[];
  expenses: ExportExpenseRow[];
  workPrograms: ExportWorkProgramRow[];
  documents: ExportDocumentRow[];
  yield: ExportYield;
}

export interface PatrimoineExportData {
  scope: 'AGENCY' | 'PROPERTY';
  generatedAt: Date;
  /** Vue consolidée de l'agence — présente seulement pour un export `AGENCY`. */
  overview: Awaited<ReturnType<typeof getPatrimoineOverview>> | null;
  properties: ExportProperty[];
}

interface PropertyIdentity {
  id: string;
  internalReference: string;
  title: string;
  propertyType: string;
  status: string;
  address: string;
}

function documentState(expiresAt: Date | null, now: Date): { state: DocumentState; daysRemaining: number | null } {
  if (!expiresAt) return { state: 'NO_DEADLINE', daysRemaining: null };
  const days = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 3600 * 1000));
  if (days < 0) return { state: 'EXPIRED', daysRemaining: days };
  if (days <= EXPIRING_SOON_THRESHOLD_DAYS) return { state: 'EXPIRING_SOON', daysRemaining: days };
  return { state: 'UP_TO_DATE', daysRemaining: days };
}

/** Traite `items` avec au plus `limit` appels de `fn` en vol simultanément. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function buildExportProperty(tenantId: string, property: PropertyIdentity, now: Date): Promise<ExportProperty> {
  const [valuations, loans, expenses, workPrograms, propertyDocuments, patrimonyDocuments, input] = await Promise.all([
    prisma.assetValuation.findMany({
      where: { tenantId, propertyId: property.id },
      select: { valuatedAt: true, estimatedValue: true, currency: true, method: true },
      orderBy: { valuatedAt: 'desc' }
    }),
    prisma.propertyLoan.findMany({
      where: { tenantId, propertyId: property.id },
      select: {
        lender: true,
        capitalAmount: true,
        remainingCapital: true,
        interestRate: true,
        monthlyPayment: true,
        currency: true,
        startDate: true,
        endDate: true,
        status: true
      },
      orderBy: { startDate: 'desc' }
    }),
    prisma.propertyExpense.findMany({
      where: { tenantId, propertyId: property.id },
      select: { category: true, label: true, amount: true, currency: true, paidAt: true, isCapitalized: true },
      orderBy: { paidAt: 'desc' }
    }),
    prisma.workProgram.findMany({
      where: { tenantId, propertyId: property.id },
      select: {
        title: true,
        status: true,
        estimatedCost: true,
        actualCost: true,
        currency: true,
        plannedDate: true,
        completedDate: true
      },
      orderBy: { plannedDate: 'asc' }
    }),
    // `PropertyDocument` : jamais `filePath`/`fileUrl`, seulement le nom de
    // fichier (deja denue de chemin) et son echeance.
    prisma.propertyDocument.findMany({
      where: { tenantId, propertyId: property.id },
      select: { documentType: true, fileName: true, expirationDate: true }
    }),
    prisma.patrimonyDocument.findMany({
      where: { tenantId, propertyId: property.id },
      select: { title: true, type: true, expiresAt: true }
    }),
    buildPropertyYieldInput(tenantId, property.id)
  ]);

  const documents: ExportDocumentRow[] = [
    ...propertyDocuments.map(doc => {
      const { state, daysRemaining } = documentState(doc.expirationDate, now);
      return { type: doc.documentType, label: doc.fileName, expiresAt: doc.expirationDate, state, daysRemaining };
    }),
    ...patrimonyDocuments.map(doc => {
      const { state, daysRemaining } = documentState(doc.expiresAt, now);
      return { type: doc.type, label: doc.title, expiresAt: doc.expiresAt, state, daysRemaining };
    })
  ];

  return {
    id: property.id,
    internalReference: property.internalReference,
    title: property.title,
    propertyType: property.propertyType,
    status: property.status,
    address: property.address,
    valuations: valuations.map(v => ({
      valuatedAt: v.valuatedAt,
      estimatedValue: Number(v.estimatedValue),
      currency: v.currency,
      method: v.method
    })),
    loans: loans.map(l => ({
      lender: l.lender,
      capitalAmount: Number(l.capitalAmount),
      remainingCapital: Number(l.remainingCapital),
      interestRate: Number(l.interestRate),
      monthlyPayment: Number(l.monthlyPayment),
      currency: l.currency,
      startDate: l.startDate,
      endDate: l.endDate,
      status: l.status
    })),
    expenses: expenses.map(e => ({
      category: e.category,
      label: e.label,
      amount: Number(e.amount),
      currency: e.currency,
      paidAt: e.paidAt,
      isCapitalized: e.isCapitalized
    })),
    workPrograms: workPrograms.map(w => ({
      title: w.title,
      status: w.status,
      estimatedCost: Number(w.estimatedCost),
      actualCost: w.actualCost !== null ? Number(w.actualCost) : null,
      currency: w.currency,
      plannedDate: w.plannedDate,
      completedDate: w.completedDate
    })),
    documents,
    yield: {
      currentValue: input.currentValue,
      annualRent: input.annualRent,
      annualExpenses: input.annualExpenses,
      grossYield: grossYield(input),
      netYield: netYield(input),
      netNetYield: netNetYield(input),
      latentCapitalGain: latentCapitalGain(input)
    }
  };
}

/**
 * Devise à retenir pour les montants consolidés du PDF (`drawConsolidatedOverview`).
 *
 * Les totaux de `overview` (`getPatrimoineOverview`) sont de simples sommes,
 * sans notion de devise : la devise à afficher est donc déduite des données
 * détaillées déjà collectées (valorisations, emprunts, dépenses). Une seule
 * devise rencontrée : on l'affiche. Aucune donnée : XOF par défaut, comme le
 * reste de l'application. Plusieurs devises différentes : additionner des
 * montants dans des devises différentes n'a pas de sens — l'appelant doit
 * afficher les montants bruts, sans suffixe, avec une mention explicite.
 */
export type ExportCurrencyDetermination =
  { kind: 'single'; currency: string } | { kind: 'none' } | { kind: 'multiple' };

export function determineExportCurrency(properties: ExportProperty[]): ExportCurrencyDetermination {
  const currencies = new Set<string>();
  for (const property of properties) {
    for (const valuation of property.valuations) currencies.add(valuation.currency);
    for (const loan of property.loans) currencies.add(loan.currency);
    for (const expense of property.expenses) currencies.add(expense.currency);
  }
  if (currencies.size === 0) return { kind: 'none' };
  if (currencies.size === 1) return { kind: 'single', currency: [...currencies][0] };
  return { kind: 'multiple' };
}

/**
 * Export "toute l'agence" : les biens hors DRAFT/SOLD/ARCHIVED (même
 * périmètre que `getPatrimoineOverview`), plafonnés à `MAX_EXPORT_PROPERTIES`.
 */
export async function collectAgencyPatrimoineExport(tenantId: string): Promise<PatrimoineExportData> {
  const now = new Date();
  const [overview, properties] = await Promise.all([
    getPatrimoineOverview(tenantId),
    prisma.property.findMany({
      where: { tenantId, status: { notIn: OCCUPANCY_EXCLUDED_STATUSES } },
      select: { id: true, internalReference: true, title: true, propertyType: true, status: true, address: true },
      orderBy: { internalReference: 'asc' }
    })
  ]);

  if (properties.length > MAX_EXPORT_PROPERTIES) {
    throw badRequest(
      `L'agence compte ${properties.length} biens, au-delà des ${MAX_EXPORT_PROPERTIES} couverts par un export ` +
        `d'agence : exportez par bien plutôt que pour toute l'agence.`
    );
  }

  const exportedProperties = await mapWithConcurrency(properties, YIELD_CONCURRENCY, property =>
    buildExportProperty(tenantId, property, now)
  );

  return { scope: 'AGENCY', generatedAt: now, overview, properties: exportedProperties };
}

/** Export d'un seul bien, après vérification qu'il appartient bien à `tenantId`. */
export async function collectPropertyPatrimoineExport(
  tenantId: string,
  propertyId: string
): Promise<PatrimoineExportData> {
  const now = new Date();
  const property = await ensureTenantProperty(tenantId, propertyId);
  const exported = await buildExportProperty(
    tenantId,
    {
      id: property.id,
      internalReference: property.internalReference,
      title: property.title,
      propertyType: property.propertyType,
      status: property.status,
      address: property.address
    },
    now
  );
  return { scope: 'PROPERTY', generatedAt: now, overview: null, properties: [exported] };
}
