/**
 * Répartition du montant d'un appel de charges (ou d'un appel de fonds) entre
 * les lots — calculs PURS (menu lot 2).
 *
 * Trois modes, au choix du gestionnaire :
 * - `SHARES` (défaut, comportement historique) : un TOTAL est réparti au
 *   prorata des tantièmes généraux ; un lot à 0 tantième est exclu ;
 * - `BY_LOT_TYPE` : le barème de la copropriété (un montant PAR LOT pour chaque
 *   type de lot — appartement, parking… —, paramétré une fois par
 *   l'administrateur) est appliqué : chaque lot reçoit le montant de son type
 *   et le total en découle (somme des lots concernés). Barème vide, ou type de
 *   lot présent sans montant : refus avec un message clair. Un montant à 0 est
 *   un choix explicite (type non appelé) ;
 * - `EQUAL` : un TOTAL est réparti à parts égales entre les lots concernés.
 *
 * Le calcul se fait en entiers (unités ou centimes, voir `precision`) : aucune
 * addition de flottants, donc la somme des parts vaut EXACTEMENT le total.
 * Pour `SHARES` et `EQUAL`, le dernier lot (par numéro) absorbe le reste de
 * l'arrondi. Un lot dont la part est nulle n'est pas appelé (ni appel, ni
 * débit, ni avis : même règle que BUG-050).
 *
 * Ce module ne dépend ni de Prisma ni d'Express. Le filtrage des lots
 * candidats (lots principaux d'une programmation, lots actifs…) est fait par
 * l'appelant ; seule l'exclusion des lots à 0 tantième est propre au mode
 * `SHARES` et se fait ici.
 */

import { t } from '../../i18n';

export const CHARGE_ALLOCATION_METHODS = ['SHARES', 'BY_LOT_TYPE', 'EQUAL'] as const;
export type ChargeAllocationMethodKey = (typeof CHARGE_ALLOCATION_METHODS)[number];

/** Types de lots connus (enum `LotType` du schéma). */
export const CHARGE_ALLOCATION_LOT_TYPES = ['APARTMENT', 'PARKING', 'CELLAR', 'OFFICE', 'COMMERCIAL', 'OTHER'] as const;

/**
 * Barème de la copropriété : montant PAR LOT, par type de lot. Un type absent
 * est une erreur pour un lot de ce type ; un type à 0 n'est pas appelé.
 */
export type LotTypeRates = Partial<Record<string, number>>;

/**
 * Lit le barème stocké (JSON libre en base) : ne garde que les types de lots
 * connus avec un montant fini positif ou nul ; tout le reste est ignoré.
 */
export function parseLotTypeRates(raw: unknown): LotTypeRates {
  const rates: LotTypeRates = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return rates;
  for (const lotType of CHARGE_ALLOCATION_LOT_TYPES) {
    const value = (raw as Record<string, unknown>)[lotType];
    if (value === undefined || value === null || value === '') continue;
    const amount = Number(value);
    if (Number.isFinite(amount) && amount >= 0) rates[lotType] = amount;
  }
  return rates;
}

/** Types de lots présents parmi `lots` qui n'ont aucun montant dans le barème. */
export function lotTypesMissingFromRates(lots: Array<Pick<AllocationLot, 'lotType'>>, rates: LotTypeRates): string[] {
  const missing = new Set<string>();
  for (const lot of lots) if (rates[lot.lotType] === undefined) missing.add(lot.lotType);
  return (CHARGE_ALLOCATION_LOT_TYPES as readonly string[])
    .filter(type => missing.has(type))
    .concat([...missing].filter(type => !(CHARGE_ALLOCATION_LOT_TYPES as readonly string[]).includes(type)));
}

export interface AllocationLot {
  id: string;
  lotNumber: string;
  lotType: string;
  generalShares: number;
}

export interface AllocationLine {
  lotId: string;
  lotNumber: string;
  amount: number;
}

export interface AllocationResult {
  method: ChargeAllocationMethodKey;
  /** Somme exacte des parts : le total saisi (SHARES, EQUAL) ou calculé (BY_LOT_TYPE). */
  totalAmount: number;
  /** Lots appelés, triés par numéro de lot, montant strictement positif. */
  lots: AllocationLine[];
  /** Lots candidats qui ne reçoivent rien (0 tantième, type sans montant, part arrondie à 0). */
  excludedLotIds: string[];
}

/** Précision de l'arrondi : 1 franc (devises sans décimale comme le FCFA) ou 1 centime. */
export type AllocationPrecision = 'UNIT' | 'CENT';

export interface AllocateChargeInput {
  method: ChargeAllocationMethodKey;
  lots: AllocationLot[];
  /** Total à répartir (obligatoire pour SHARES et EQUAL, ignoré pour BY_LOT_TYPE). */
  totalAmount?: number | null;
  /** Barème de la copropriété (obligatoire pour BY_LOT_TYPE, ignoré sinon). */
  lotTypeRates?: LotTypeRates | null;
  /** Défaut `CENT`. Voir `allocationPrecisionFor` pour la précision d'une devise. */
  precision?: AllocationPrecision;
}

/** Erreur de saisie ou de données : le message est destiné au gestionnaire. */
export class ChargeAllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChargeAllocationError';
  }
}

/** Devises sans sous-unité en usage courant : le FCFA se répartit au franc près. */
const ZERO_DECIMAL_CURRENCIES = new Set(['XOF', 'XAF', 'XPF', 'GNF', 'KMF', 'DJF', 'BIF', 'RWF']);

export function allocationPrecisionFor(currency: string | null | undefined): AllocationPrecision {
  return ZERO_DECIMAL_CURRENCIES.has(String(currency ?? '').toUpperCase()) ? 'UNIT' : 'CENT';
}

export function isChargeAllocationMethod(value: unknown): value is ChargeAllocationMethodKey {
  return typeof value === 'string' && (CHARGE_ALLOCATION_METHODS as readonly string[]).includes(value);
}

function scaleOf(precision: AllocationPrecision): number {
  return precision === 'UNIT' ? 1 : 100;
}

/** Montant → entier de sous-unités. Passe par une chaîne : 1.005 * 100 vaut 100.49999999999999. */
function toUnits(value: unknown, scale: number): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return Number.NaN;
  const units = Math.round(Number((numeric * scale).toFixed(6)));
  return units === 0 ? 0 : units;
}

function fromUnits(units: number, scale: number): number {
  return units / scale;
}

function compareLots(a: AllocationLot, b: AllocationLot): number {
  return a.lotNumber.localeCompare(b.lotNumber, 'fr', { numeric: true }) || a.id.localeCompare(b.id);
}

function positiveTotalUnits(totalAmount: number | null | undefined, scale: number): number {
  const units = toUnits(totalAmount, scale);
  if (!Number.isFinite(units) || units <= 0) {
    throw new ChargeAllocationError(t('Le montant total à répartir doit être strictement positif'));
  }
  return units;
}

function finish(
  method: ChargeAllocationMethodKey,
  candidates: AllocationLot[],
  unitsByLot: Map<string, number>,
  scale: number
): AllocationResult {
  const lines: AllocationLine[] = [];
  const excludedLotIds: string[] = [];
  let totalUnits = 0;
  for (const lot of candidates) {
    const units = unitsByLot.get(lot.id) ?? 0;
    if (units > 0) {
      lines.push({ lotId: lot.id, lotNumber: lot.lotNumber, amount: fromUnits(units, scale) });
      totalUnits += units;
    } else {
      excludedLotIds.push(lot.id);
    }
  }
  if (lines.length === 0) throw new ChargeAllocationError(t('Aucun lot à appeler pour cette répartition'));
  return { method, totalAmount: fromUnits(totalUnits, scale), lots: lines, excludedLotIds };
}

function allocateByShares(lots: AllocationLot[], totalUnits: number, scale: number): AllocationResult {
  const eligible = lots.filter(lot => Number(lot.generalShares) > 0);
  if (eligible.length === 0) {
    throw new ChargeAllocationError(t('Aucun lot avec des tantièmes : impossible de répartir par tantièmes'));
  }
  const totalWeight = eligible.reduce((sum, lot) => sum + BigInt(Math.floor(Number(lot.generalShares))), BigInt(0));
  const unitsByLot = new Map<string, number>();
  let distributed = 0;
  eligible.forEach((lot, index) => {
    const units =
      index === eligible.length - 1
        ? totalUnits - distributed
        : Number((BigInt(totalUnits) * BigInt(Math.floor(Number(lot.generalShares)))) / totalWeight);
    distributed += units;
    unitsByLot.set(lot.id, units);
  });
  return finish('SHARES', lots, unitsByLot, scale);
}

function allocateEqually(lots: AllocationLot[], totalUnits: number, scale: number): AllocationResult {
  const base = Math.floor(totalUnits / lots.length);
  if (base <= 0) {
    throw new ChargeAllocationError(
      t('Montant trop faible pour être réparti à parts égales entre {{count}} lots', { count: lots.length })
    );
  }
  const unitsByLot = new Map<string, number>();
  lots.forEach((lot, index) => {
    unitsByLot.set(lot.id, index === lots.length - 1 ? totalUnits - base * (lots.length - 1) : base);
  });
  return finish('EQUAL', lots, unitsByLot, scale);
}

function allocateByLotType(
  lots: AllocationLot[],
  lotTypeRates: LotTypeRates | null | undefined,
  scale: number
): AllocationResult {
  const rates = lotTypeRates ?? {};
  if (Object.values(rates).every(amount => amount === undefined || amount === null)) {
    throw new ChargeAllocationError(
      t(
        'Le barème par type de lot de cette copropriété est vide : renseignez-le dans les paramètres de la copropriété.'
      )
    );
  }
  const missing = lotTypesMissingFromRates(lots, rates);
  if (missing.length > 0) {
    throw new ChargeAllocationError(
      t(
        'Le barème par type de lot est incomplet : aucun montant pour {{types}}. Complétez-le dans les paramètres de la copropriété.',
        { types: missing.join(', ') }
      )
    );
  }
  const perType = new Map<string, number>();
  for (const [lotType, amount] of Object.entries(rates)) {
    if (amount === undefined || amount === null) continue;
    const units = toUnits(amount, scale);
    if (!Number.isFinite(units) || units < 0) {
      throw new ChargeAllocationError(t('Le montant du type de lot {{lotType}} est invalide', { lotType }));
    }
    perType.set(lotType, units);
  }
  const unitsByLot = new Map<string, number>();
  for (const lot of lots) unitsByLot.set(lot.id, perType.get(lot.lotType) ?? 0);
  return finish('BY_LOT_TYPE', lots, unitsByLot, scale);
}

/**
 * Répartit un appel entre `lots` selon `method`. Voir l'en-tête du fichier.
 * Lève `ChargeAllocationError` (message en français) si la saisie ne permet
 * pas de répartir ; ne modifie pas ses arguments.
 */
export function allocateCharge(input: AllocateChargeInput): AllocationResult {
  if (!isChargeAllocationMethod(input.method)) {
    throw new ChargeAllocationError(t('Mode de répartition inconnu'));
  }
  const scale = scaleOf(input.precision ?? 'CENT');
  const lots = [...input.lots].sort(compareLots);
  if (lots.length === 0) throw new ChargeAllocationError(t('Aucun lot à appeler pour cette répartition'));

  if (input.method === 'BY_LOT_TYPE') return allocateByLotType(lots, input.lotTypeRates, scale);
  const totalUnits = positiveTotalUnits(input.totalAmount, scale);
  return input.method === 'EQUAL'
    ? allocateEqually(lots, totalUnits, scale)
    : allocateByShares(lots, totalUnits, scale);
}
