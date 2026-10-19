import type { ChargeAllocationMethod, LotType } from '../types/syndic-types';
import { t } from '../i18n/t';

/**
 * Aperçu côté client de la répartition d'un appel de charges (menu lot 2).
 *
 * Miroir EXACT de `packages/api/src/lib/syndics/charge-allocation-methods.ts`
 * (le web ne peut pas importer l'API) : mêmes règles, mêmes messages d'erreur.
 * L'API reste l'autorité ; cet aperçu sert à montrer le résultat avant
 * l'envoi et à bloquer d'avance une saisie qu'elle refuserait.
 *
 * Calcul en entiers de sous-unités (franc pour le FCFA, sinon centime) : la
 * somme des parts vaut exactement le total. Le dernier lot (par numéro)
 * absorbe le reste de l'arrondi.
 */

export type LotTypeRatesInput = Partial<Record<LotType | string, number | null | undefined>>;

export interface AllocationPreviewLot {
  id: string;
  lotNumber: string;
  lotType: string;
  generalShares: number;
}

export interface AllocationPreviewLine {
  lotId: string;
  lotNumber: string;
  lotType: string;
  amount: number;
}

export interface AllocationPreviewResult {
  /** Lots appelés, triés par numéro, montant strictement positif. */
  lines: AllocationPreviewLine[];
  /** Somme exacte des parts (0 en cas d'erreur). */
  totalAmount: number;
  /** Message destiné au gestionnaire ; `null` si la répartition est possible. */
  error: string | null;
  /**
   * Nature de l'erreur quand l'interface doit réagir autrement qu'en l'affichant :
   * `LOT_TYPE_RATES` = barème par type de lot vide ou incomplet (lien vers le
   * paramétrage). Absent sinon.
   */
  errorKind?: AllocationErrorKind | null;
}

export type AllocationErrorKind = 'LOT_TYPE_RATES';

export type AllocationPrecision = 'UNIT' | 'CENT';

/** Types de lots connus, dans l'ordre d'affichage du barème. */
export const ALLOCATION_LOT_TYPES: readonly LotType[] = [
  'APARTMENT',
  'PARKING',
  'CELLAR',
  'OFFICE',
  'COMMERCIAL',
  'OTHER'
];

const ZERO_DECIMAL_CURRENCIES = new Set(['XOF', 'XAF', 'XPF', 'GNF', 'KMF', 'DJF', 'BIF', 'RWF']);

/** Précision de l'arrondi : 1 franc (devises sans décimale comme le FCFA) ou 1 centime. */
export function allocationPrecisionFor(currency: string | null | undefined): AllocationPrecision {
  return ZERO_DECIMAL_CURRENCIES.has(String(currency ?? '').toUpperCase()) ? 'UNIT' : 'CENT';
}

class AllocationError extends Error {
  constructor(
    message: string,
    readonly kind: AllocationErrorKind | null = null
  ) {
    super(message);
  }
}

const scaleOf = (precision: AllocationPrecision) => (precision === 'UNIT' ? 1 : 100);

/** Montant → entier de sous-unités. Passe par une chaîne : 1.005 * 100 vaut 100.49999999999999. */
function toUnits(value: unknown, scale: number): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return Number.NaN;
  const units = Math.round(Number((numeric * scale).toFixed(6)));
  return units === 0 ? 0 : units;
}

const fromUnits = (units: number, scale: number) => units / scale;

function compareLots(a: AllocationPreviewLot, b: AllocationPreviewLot): number {
  return a.lotNumber.localeCompare(b.lotNumber, 'fr', { numeric: true }) || a.id.localeCompare(b.id);
}

function positiveTotalUnits(totalAmount: number | null | undefined, scale: number): number {
  const units = toUnits(totalAmount, scale);
  if (!Number.isFinite(units) || units <= 0) {
    throw new AllocationError(t('Le montant total à répartir doit être strictement positif'));
  }
  return units;
}

function finish(
  candidates: AllocationPreviewLot[],
  unitsByLot: Map<string, number>,
  scale: number
): AllocationPreviewResult {
  const lines: AllocationPreviewLine[] = [];
  let totalUnits = 0;
  for (const lot of candidates) {
    const units = unitsByLot.get(lot.id) ?? 0;
    if (units > 0) {
      lines.push({ lotId: lot.id, lotNumber: lot.lotNumber, lotType: lot.lotType, amount: fromUnits(units, scale) });
      totalUnits += units;
    }
  }
  if (lines.length === 0) throw new AllocationError(t('Aucun lot à appeler pour cette répartition'));
  return { lines, totalAmount: fromUnits(totalUnits, scale), error: null };
}

function allocateByShares(lots: AllocationPreviewLot[], totalUnits: number, scale: number): AllocationPreviewResult {
  const eligible = lots.filter(lot => Number(lot.generalShares) > 0);
  if (eligible.length === 0) {
    throw new AllocationError(t('Aucun lot avec des tantièmes : impossible de répartir par tantièmes'));
  }
  const weightOf = (lot: AllocationPreviewLot) => BigInt(Math.floor(Number(lot.generalShares)));
  const totalWeight = eligible.reduce((sum, lot) => sum + weightOf(lot), BigInt(0));
  const unitsByLot = new Map<string, number>();
  let distributed = 0;
  eligible.forEach((lot, index) => {
    const units =
      index === eligible.length - 1
        ? totalUnits - distributed
        : Number((BigInt(totalUnits) * weightOf(lot)) / totalWeight);
    distributed += units;
    unitsByLot.set(lot.id, units);
  });
  return finish(lots, unitsByLot, scale);
}

function allocateEqually(lots: AllocationPreviewLot[], totalUnits: number, scale: number): AllocationPreviewResult {
  const base = Math.floor(totalUnits / lots.length);
  if (base <= 0) {
    throw new AllocationError(
      t('Montant trop faible pour être réparti à parts égales entre {{count}} lots', { count: lots.length })
    );
  }
  const unitsByLot = new Map<string, number>();
  lots.forEach((lot, index) => {
    unitsByLot.set(lot.id, index === lots.length - 1 ? totalUnits - base * (lots.length - 1) : base);
  });
  return finish(lots, unitsByLot, scale);
}

/** Types de lots présents parmi `lots` sans montant au barème (ordre des types connus). */
export function lotTypesMissingFromRates(
  lots: Array<Pick<AllocationPreviewLot, 'lotType'>>,
  rates: LotTypeRatesInput | null | undefined
): string[] {
  const safeRates = rates ?? {};
  const isMissing = (type: string) => safeRates[type] === undefined || safeRates[type] === null;
  const present = new Set(lots.map(lot => lot.lotType));
  const known = (ALLOCATION_LOT_TYPES as readonly string[]).filter(type => present.has(type) && isMissing(type));
  const unknown = [...present].filter(
    type => !(ALLOCATION_LOT_TYPES as readonly string[]).includes(type) && isMissing(type)
  );
  return known.concat(unknown);
}

function allocateByLotType(
  lots: AllocationPreviewLot[],
  lotTypeRates: LotTypeRatesInput | null | undefined,
  scale: number
): AllocationPreviewResult {
  const rates = lotTypeRates ?? {};
  if (Object.values(rates).every(amount => amount === undefined || amount === null)) {
    throw new AllocationError(
      t(
        'Le barème par type de lot de cette copropriété est vide : renseignez-le dans les paramètres de la copropriété.'
      ),
      'LOT_TYPE_RATES'
    );
  }
  const missing = lotTypesMissingFromRates(lots, rates);
  if (missing.length > 0) {
    throw new AllocationError(
      t(
        'Le barème par type de lot est incomplet : aucun montant pour {{types}}. Complétez-le dans les paramètres de la copropriété.',
        { types: missing.join(', ') }
      ),
      'LOT_TYPE_RATES'
    );
  }
  const perType = new Map<string, number>();
  for (const [lotType, amount] of Object.entries(rates)) {
    if (amount === undefined || amount === null) continue;
    const units = toUnits(amount, scale);
    if (!Number.isFinite(units) || units < 0) {
      throw new AllocationError(t('Le montant du type de lot {{lotType}} est invalide', { lotType: lotType }));
    }
    perType.set(lotType, units);
  }
  const unitsByLot = new Map<string, number>();
  for (const lot of lots) unitsByLot.set(lot.id, perType.get(lot.lotType) ?? 0);
  return finish(lots, unitsByLot, scale);
}

export interface PreviewAllocationInput {
  method: ChargeAllocationMethod;
  lots: AllocationPreviewLot[];
  /** Obligatoire pour SHARES et EQUAL, ignoré pour BY_LOT_TYPE. */
  totalAmount?: number | null;
  /** Barème de la copropriété (BY_LOT_TYPE) ; `null` si indisponible. */
  lotTypeRates?: LotTypeRatesInput | null;
  currency?: string | null;
}

/**
 * Répartit un appel entre `lots` selon `method`. Ne lève jamais : une saisie
 * qui ne permet pas de répartir donne `error` (message de l'API) et aucune ligne.
 */
export function previewAllocation(input: PreviewAllocationInput): AllocationPreviewResult {
  try {
    if (!['SHARES', 'BY_LOT_TYPE', 'EQUAL'].includes(input.method)) {
      throw new AllocationError(t('Mode de répartition inconnu'));
    }
    const scale = scaleOf(allocationPrecisionFor(input.currency));
    const lots = [...input.lots].sort(compareLots);
    if (lots.length === 0) throw new AllocationError(t('Aucun lot à appeler pour cette répartition'));
    if (input.method === 'BY_LOT_TYPE') return allocateByLotType(lots, input.lotTypeRates, scale);
    const totalUnits = positiveTotalUnits(input.totalAmount, scale);
    return input.method === 'EQUAL'
      ? allocateEqually(lots, totalUnits, scale)
      : allocateByShares(lots, totalUnits, scale);
  } catch (error) {
    if (error instanceof AllocationError) {
      return { lines: [], totalAmount: 0, error: error.message, errorKind: error.kind };
    }
    throw error;
  }
}

// ---------------------------------------------------------------- programmations

/** Types de lots principaux (mêmes que le registre des lots). */
const MAIN_LOT_TYPES = new Set(['APARTMENT', 'OFFICE', 'COMMERCIAL']);

/**
 * Lots candidats d'un appel émis pour « Tous les lots » : ceux qui ont des
 * tantièmes généraux.
 */
export function lotsWithShares<T extends AllocationPreviewLot>(lots: T[]): T[] {
  return lots.filter(lot => Number(lot.generalShares) > 0);
}

/**
 * Lots candidats d'une programmation à montant fixe : les lots actifs (avec
 * tantièmes), ou tous les lots si aucun n'a de tantièmes. Utilisé pour EQUAL
 * et BY_LOT_TYPE.
 */
export function scheduleActiveLots<T extends AllocationPreviewLot>(lots: T[]): T[] {
  const active = lotsWithShares(lots);
  return active.length > 0 ? active : lots;
}

/** Montant → centimes (même arrondi que `toCents` de l'API). */
function toCents(value: unknown): number {
  return toUnits(value, 100) || 0;
}

/**
 * Règle HISTORIQUE d'une programmation à montant fixe par tantièmes (miroir de
 * `distributeFixedAmount`) : lots principaux (appartements, bureaux, locaux
 * commerciaux), repli sur tous les lots, tri par numéro ; si personne n'a de
 * tantièmes, parts égales. Calcul en centimes, le dernier lot absorbe le reste.
 */
export function distributeFixedAmount(
  amount: number,
  lots: AllocationPreviewLot[]
): Array<{ lotId: string; amount: number }> {
  const main = lots.filter(lot => MAIN_LOT_TYPES.has(lot.lotType));
  const targets = [...(main.length > 0 ? main : lots)].sort((a, b) =>
    a.lotNumber.localeCompare(b.lotNumber, 'fr', { numeric: true })
  );
  if (targets.length === 0) return [];
  const totalCents = toCents(amount);
  const sharesOf = (lot: AllocationPreviewLot) => Math.max(0, Number(lot.generalShares) || 0);
  const totalShares = targets.reduce((sum, lot) => sum + sharesOf(lot), 0);
  const weightOf = (lot: AllocationPreviewLot) => (totalShares > 0 ? sharesOf(lot) : 1);
  const totalWeight = totalShares > 0 ? totalShares : targets.length;
  let distributed = 0;
  return targets.map((lot, index) => {
    const cents =
      index === targets.length - 1 ? totalCents - distributed : Math.floor((totalCents * weightOf(lot)) / totalWeight);
    distributed += cents;
    return { lotId: lot.id, amount: cents / 100 };
  });
}

/**
 * Aperçu par lot d'une programmation à montant fixe (`FIXED`) : SHARES suit la
 * règle historique, EQUAL et BY_LOT_TYPE répartissent entre les lots actifs.
 */
export function previewScheduleAllocation(input: PreviewAllocationInput): AllocationPreviewResult {
  if (input.method !== 'SHARES') {
    return previewAllocation({ ...input, lots: scheduleActiveLots(input.lots) });
  }
  const total = Number(input.totalAmount);
  if (!Number.isFinite(total) || total <= 0) {
    return { lines: [], totalAmount: 0, error: t('Le montant total à répartir doit être strictement positif') };
  }
  const byId = new Map(input.lots.map(lot => [lot.id, lot]));
  const parts = distributeFixedAmount(total, input.lots).filter(part => part.amount > 0);
  if (parts.length === 0) {
    return { lines: [], totalAmount: 0, error: t('Aucun lot à appeler pour cette répartition') };
  }
  const lines: AllocationPreviewLine[] = [];
  for (const part of parts) {
    const lot = byId.get(part.lotId);
    if (lot) lines.push({ lotId: lot.id, lotNumber: lot.lotNumber, lotType: lot.lotType, amount: part.amount });
  }
  const totalCents = lines.reduce((sum, line) => sum + toCents(line.amount), 0);
  return { lines, totalAmount: totalCents / 100, error: null };
}
