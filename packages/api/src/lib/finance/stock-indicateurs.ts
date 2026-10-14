/**
 * Indicateurs du stock — lot 040 (spec B8 ; contrat `IndicatorsView`,
 * `IndicatorRow`).
 *
 * Par LIEU et par MOIS, plus un total par mois. **Jamais par personne**
 * (B8-R1, décision D4) : aucune requête ne groupe par auteur, compteur ou
 * preneur.
 *
 * ---------------------------------------------------------------------------
 * Isolation des agrégats (B8-R3)
 * ---------------------------------------------------------------------------
 *
 * Les agrégations par mois passent par `$queryRaw`, que la garde Prisma
 * (`prisma-tenant-guard-extension.ts`) ne contrôle pas : CHAQUE requête porte
 * `tenant_id = ${tenantId}` en paramètre lié — jamais concaténé — et une
 * jointure ne lit que les inventaires de l'agence. La forme des requêtes est
 * vérifiée par `__tests__/unit/stock-indicateurs.test.ts` ; l'étanchéité réelle
 * contre PostgreSQL, par le bloc « Stock — étanchéité entre agences (lot 040) »
 * de `__tests__/integration/isolation.test.ts` (`npm run test:isolation`, base
 * dédiée) : les indicateurs de l'agence A n'y portent aucune trace de B.
 *
 * ---------------------------------------------------------------------------
 * Définitions (B8)
 * ---------------------------------------------------------------------------
 *
 * - Inventaires : ceux VALIDÉS dans le mois (`validated_at`). Le taux d'écart
 *   n'utilise que les valeurs FIGÉES à la validation (data-model §2.4) ; les
 *   inventaires validés avant le lot (valeurs nulles) en sont exclus et
 *   comptés à part (`countsWithoutFrozenValues`, B8-R2). Les surplus
 *   d'ouverture sont exclus de `variance_value_gross` à sa naissance (A7-R2).
 *   La part validée par une autre personne (`otherValidatorShare`) exclut les
 *   mêmes inventaires : avant le lot, `self_validated` n'était pas renseigné
 *   (défaut `false`) et les compter gonflerait la part.
 * - Lignes non comptées : `counted_quantity IS NULL` (A2-R8). Part à
 *   l'aveugle : `counted_blind = true` ÷ lignes où `counted_blind` est
 *   renseigné (lignes comptées après le lot, A2-R9).
 * - Sorties : une sortie est un BON quand elle en a un (`slip_id`), sinon un
 *   mouvement — une sortie de trois lignes compte pour une.
 * - Rebuts : valeur des rebuts ÷ (sorties + rebuts + retours), en valeur.
 * - Délai de saisie : `jour(created_at) − jour(movement_date)` (UTC, ≥ 0) des
 *   réceptions, sorties, transferts (moitié sortante), rebuts et retours.
 *
 * Les colonnes `timestamp` du schéma portent l'heure UTC : `::date` et
 * `to_char(…, 'YYYY-MM')` lisent donc le jour et le mois UTC.
 */

import { Prisma } from '@prisma/client';

import { prisma } from '../../utils/database';
import { BadRequestError } from '../../middleware/error-middleware';
import { assertBelongsToTenant } from '../../utils/tenant-ownership';
import type { IndicatorRow, IndicatorsView, PrismaLike } from './types-040-controle';

/** Période maximale, en mois (contrat). */
export const MAX_INDICATOR_MONTHS = 24;

// ---------------------------------------------------------------------------
// Mois
// ---------------------------------------------------------------------------

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** `AAAA-MM` → premier instant du mois, UTC. */
export function parseMonth(value: string): Date {
  const match = MONTH_PATTERN.exec(value);
  if (!match) {
    throw new BadRequestError('Le mois doit avoir la forme AAAA-MM.');
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Les mois de `from` à `to` inclus, `AAAA-MM`. 400 si la période est vide ou dépasse 24 mois. */
export function monthsBetween(from: string, to: string): string[] {
  const start = parseMonth(from);
  const end = parseMonth(to);
  if (start.getTime() > end.getTime()) {
    throw new BadRequestError('Le début de la période doit précéder sa fin.');
  }
  const months: string[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    months.push(monthKey(cursor));
    if (months.length > MAX_INDICATOR_MONTHS) {
      throw new BadRequestError('La période ne peut pas dépasser 24 mois.');
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

// ---------------------------------------------------------------------------
// Agrégats lus en base
// ---------------------------------------------------------------------------

/** Inventaires validés, par lieu et par mois. */
export interface CountAggregate {
  locationId: string;
  month: string;
  countsValidated: number;
  countsWithoutFrozenValues: number;
  countedValue: number;
  varianceValueGross: number;
  setAsideVarianceValue: number;
  countsValidatedByOther: number;
}

/** Lignes des inventaires validés, par lieu et par mois. */
export interface LineAggregate {
  locationId: string;
  month: string;
  uncountedLines: number;
  blindLines: number;
  linesWithBlindFlag: number;
}

/** Mouvements, par lieu et par mois. */
export interface MovementAggregate {
  locationId: string;
  month: string;
  issuesCount: number;
  issuesWithTaker: number;
  issueValue: number;
  scrapValue: number;
  supplierReturnValue: number;
  movementsCount: number;
  entryLagSum: number;
  sameDayCount: number;
}

/** BigInt, Decimal ou chaîne d'une ligne brute → nombre. */
function num(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Une borne de période comparée à une colonne `timestamp` (sans fuseau, en
 * UTC) : convertie explicitement en UTC, pour ne pas dépendre du fuseau de la
 * session PostgreSQL.
 */
function utcTimestamp(date: Date): Prisma.Sql {
  return Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}

function locationFilter(column: string, locationId: string | null): Prisma.Sql {
  return locationId ? Prisma.sql`AND ${Prisma.raw(column)} = ${locationId}::uuid` : Prisma.empty;
}

/** Les trois requêtes d'agrégation, chacune bornée par `tenant_id = $1` (B8-R3). */
export function buildIndicatorQueries(
  tenantId: string,
  start: Date,
  end: Date,
  locationId: string | null
): { counts: Prisma.Sql; lines: Prisma.Sql; movements: Prisma.Sql } {
  const counts = Prisma.sql`
    SELECT c.location_id::text AS "locationId",
           to_char(c.validated_at, 'YYYY-MM') AS "month",
           COUNT(*) AS "countsValidated",
           COUNT(*) FILTER (WHERE c.counted_value IS NULL) AS "countsWithoutFrozenValues",
           COALESCE(SUM(c.counted_value) FILTER (WHERE c.counted_value IS NOT NULL), 0) AS "countedValue",
           COALESCE(SUM(c.variance_value_gross) FILTER (WHERE c.counted_value IS NOT NULL), 0) AS "varianceValueGross",
           COALESCE(SUM(c.set_aside_variance_value) FILTER (WHERE c.counted_value IS NOT NULL), 0) AS "setAsideVarianceValue",
           COUNT(*) FILTER (WHERE c.self_validated = false AND c.counted_value IS NOT NULL) AS "countsValidatedByOther"
      FROM stock_counts c
     WHERE c.tenant_id = ${tenantId}
       AND c.status = 'VALIDATED'
       AND c.validated_at >= ${utcTimestamp(start)}
       AND c.validated_at < ${utcTimestamp(end)}
       ${locationFilter('c.location_id', locationId)}
     GROUP BY 1, 2`;

  const lines = Prisma.sql`
    SELECT c.location_id::text AS "locationId",
           to_char(c.validated_at, 'YYYY-MM') AS "month",
           COUNT(*) FILTER (WHERE l.counted_quantity IS NULL) AS "uncountedLines",
           COUNT(*) FILTER (WHERE l.counted_blind IS TRUE) AS "blindLines",
           COUNT(*) FILTER (WHERE l.counted_blind IS NOT NULL) AS "linesWithBlindFlag"
      FROM stock_count_lines l
      JOIN stock_counts c ON c.id = l.count_id AND c.tenant_id = ${tenantId}
     WHERE c.tenant_id = ${tenantId}
       AND c.status = 'VALIDATED'
       AND c.validated_at >= ${utcTimestamp(start)}
       AND c.validated_at < ${utcTimestamp(end)}
       ${locationFilter('c.location_id', locationId)}
     GROUP BY 1, 2`;

  const movements = Prisma.sql`
    SELECT m.location_id::text AS "locationId",
           to_char(m.movement_date, 'YYYY-MM') AS "month",
           COUNT(DISTINCT COALESCE(m.slip_id, m.id)) FILTER (WHERE m.type = 'ISSUE') AS "issuesCount",
           COUNT(DISTINCT COALESCE(m.slip_id, m.id)) FILTER (WHERE m.type = 'ISSUE' AND m.taker_id IS NOT NULL) AS "issuesWithTaker",
           COALESCE(SUM(m.total_value) FILTER (WHERE m.type = 'ISSUE'), 0) AS "issueValue",
           COALESCE(SUM(m.total_value) FILTER (WHERE m.type = 'SCRAP'), 0) AS "scrapValue",
           COALESCE(SUM(m.total_value) FILTER (WHERE m.type = 'SUPPLIER_RETURN'), 0) AS "supplierReturnValue",
           COUNT(*) FILTER (WHERE m.type IN ('RECEIPT', 'ISSUE', 'SCRAP', 'SUPPLIER_RETURN')
                               OR (m.type = 'TRANSFER' AND m.is_decrease)) AS "movementsCount",
           COALESCE(SUM(GREATEST(0, m.created_at::date - m.movement_date::date))
                    FILTER (WHERE m.type IN ('RECEIPT', 'ISSUE', 'SCRAP', 'SUPPLIER_RETURN')
                               OR (m.type = 'TRANSFER' AND m.is_decrease)), 0) AS "entryLagSum",
           COUNT(*) FILTER (WHERE (m.type IN ('RECEIPT', 'ISSUE', 'SCRAP', 'SUPPLIER_RETURN')
                                   OR (m.type = 'TRANSFER' AND m.is_decrease))
                              AND m.created_at::date <= m.movement_date::date) AS "sameDayCount"
      FROM stock_movements m
     WHERE m.tenant_id = ${tenantId}
       AND m.movement_date >= ${utcTimestamp(start)}
       AND m.movement_date < ${utcTimestamp(end)}
       ${locationFilter('m.location_id', locationId)}
     GROUP BY 1, 2`;

  return { counts, lines, movements };
}

/** Lit les trois agrégats d'une agence sur la période. */
export async function loadIndicatorAggregates(
  db: PrismaLike,
  tenantId: string,
  start: Date,
  end: Date,
  locationId: string | null
): Promise<{ counts: CountAggregate[]; lines: LineAggregate[]; movements: MovementAggregate[] }> {
  const queries = buildIndicatorQueries(tenantId, start, end, locationId);
  const [countRows, lineRows, movementRows] = await Promise.all([
    db.$queryRaw<Array<Record<string, unknown>>>(queries.counts),
    db.$queryRaw<Array<Record<string, unknown>>>(queries.lines),
    db.$queryRaw<Array<Record<string, unknown>>>(queries.movements)
  ]);
  return {
    counts: countRows.map(row => ({
      locationId: String(row.locationId),
      month: String(row.month),
      countsValidated: num(row.countsValidated),
      countsWithoutFrozenValues: num(row.countsWithoutFrozenValues),
      countedValue: num(row.countedValue),
      varianceValueGross: num(row.varianceValueGross),
      setAsideVarianceValue: num(row.setAsideVarianceValue),
      countsValidatedByOther: num(row.countsValidatedByOther)
    })),
    lines: lineRows.map(row => ({
      locationId: String(row.locationId),
      month: String(row.month),
      uncountedLines: num(row.uncountedLines),
      blindLines: num(row.blindLines),
      linesWithBlindFlag: num(row.linesWithBlindFlag)
    })),
    movements: movementRows.map(row => ({
      locationId: String(row.locationId),
      month: String(row.month),
      issuesCount: num(row.issuesCount),
      issuesWithTaker: num(row.issuesWithTaker),
      issueValue: num(row.issueValue),
      scrapValue: num(row.scrapValue),
      supplierReturnValue: num(row.supplierReturnValue),
      movementsCount: num(row.movementsCount),
      entryLagSum: num(row.entryLagSum),
      sameDayCount: num(row.sameDayCount)
    }))
  };
}

// ---------------------------------------------------------------------------
// Assemblage (pur)
// ---------------------------------------------------------------------------

/** Somme brute d'une cellule (lieu, mois) ou d'un total : les parts se recalculent sur les sommes. */
interface Totals {
  countsValidated: number;
  countsWithoutFrozenValues: number;
  countedValue: number;
  varianceValueGross: number;
  setAsideVarianceValue: number;
  countsValidatedByOther: number;
  uncountedLines: number;
  blindLines: number;
  linesWithBlindFlag: number;
  issuesCount: number;
  issuesWithTaker: number;
  issueValue: number;
  scrapValue: number;
  supplierReturnValue: number;
  movementsCount: number;
  entryLagSum: number;
  sameDayCount: number;
}

function emptyTotals(): Totals {
  return {
    countsValidated: 0,
    countsWithoutFrozenValues: 0,
    countedValue: 0,
    varianceValueGross: 0,
    setAsideVarianceValue: 0,
    countsValidatedByOther: 0,
    uncountedLines: 0,
    blindLines: 0,
    linesWithBlindFlag: 0,
    issuesCount: 0,
    issuesWithTaker: 0,
    issueValue: 0,
    scrapValue: 0,
    supplierReturnValue: 0,
    movementsCount: 0,
    entryLagSum: 0,
    sameDayCount: 0
  };
}

function addInto(target: Totals, source: Partial<Totals>): void {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'number' && key in target) {
      target[key as keyof Totals] += value;
    }
  }
}

/** Une part, ou `null` quand le dénominateur est nul. Arrondie à 4 décimales. */
function share(numerator: number, denominator: number): number | null {
  if (!(denominator > 0)) {
    return null;
  }
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function toRow(month: string, totals: Totals, location: { id: string; label: string } | null): IndicatorRow {
  const frozenCounts = totals.countsValidated - totals.countsWithoutFrozenValues;
  const scrapBase = totals.issueValue + totals.scrapValue + totals.supplierReturnValue;
  return {
    locationId: location?.id ?? null,
    locationLabel: location?.label ?? null,
    month,
    countsValidated: totals.countsValidated,
    countsWithoutFrozenValues: totals.countsWithoutFrozenValues,
    countedValue: money(totals.countedValue),
    varianceValueGross: money(totals.varianceValueGross),
    setAsideVarianceValue: money(totals.setAsideVarianceValue),
    varianceRate:
      frozenCounts > 0 ? share(totals.varianceValueGross + totals.setAsideVarianceValue, totals.countedValue) : null,
    uncountedLines: totals.uncountedLines,
    blindLineShare: share(totals.blindLines, totals.linesWithBlindFlag),
    issuesCount: totals.issuesCount,
    issuesWithTaker: totals.issuesWithTaker,
    takerShare: share(totals.issuesWithTaker, totals.issuesCount),
    countsValidatedByOther: totals.countsValidatedByOther,
    // Sur les seuls inventaires validés depuis le lot (valeurs figées), comme le taux d'écart (B8-R2).
    otherValidatorShare: share(totals.countsValidatedByOther, frozenCounts),
    scrapValue: money(totals.scrapValue),
    scrapShare: share(totals.scrapValue, scrapBase),
    movementsCount: totals.movementsCount,
    averageEntryLagDays:
      totals.movementsCount > 0 ? Math.round((totals.entryLagSum / totals.movementsCount) * 10) / 10 : null,
    sameDayShare: share(totals.sameDayCount, totals.movementsCount)
  };
}

/**
 * Assemble la vue : une ligne par (lieu, mois), mois sans activité inclus à
 * zéro, puis un total par mois tous lieux confondus. Les parts du total se
 * recalculent sur les sommes, jamais comme une moyenne de parts.
 */
export function assembleIndicators(
  from: string,
  to: string,
  months: string[],
  locations: Array<{ id: string; label: string }>,
  aggregates: { counts: CountAggregate[]; lines: LineAggregate[]; movements: MovementAggregate[] }
): IndicatorsView {
  const cells = new Map<string, Totals>();
  const cellKey = (locationId: string, month: string): string => `${locationId}|${month}`;
  const cell = (locationId: string, month: string): Totals => {
    const keyValue = cellKey(locationId, month);
    const existing = cells.get(keyValue);
    if (existing) {
      return existing;
    }
    const created = emptyTotals();
    cells.set(keyValue, created);
    return created;
  };

  const monthSet = new Set(months);
  const collect = <T extends { locationId: string; month: string }>(rows: T[]): void => {
    for (const row of rows) {
      if (!monthSet.has(row.month)) {
        continue;
      }
      const { locationId, month, ...values } = row;
      addInto(cell(locationId, month), values as Partial<Totals>);
    }
  };
  collect(aggregates.counts);
  collect(aggregates.lines);
  collect(aggregates.movements);

  // Un lieu absent du référentiel lu (désactivé hors liste) mais actif dans
  // la période garde sa ligne, sans libellé inventé.
  const known = new Map(locations.map(location => [location.id, location]));
  for (const keyValue of cells.keys()) {
    const locationId = keyValue.split('|')[0];
    if (!known.has(locationId)) {
      known.set(locationId, { id: locationId, label: '' });
    }
  }
  const orderedLocations = [...known.values()].sort(
    (a, b) => a.label.localeCompare(b.label, 'fr') || a.id.localeCompare(b.id)
  );

  const rows: IndicatorRow[] = [];
  const totals: IndicatorRow[] = [];
  for (const month of months) {
    const monthTotals = emptyTotals();
    for (const location of orderedLocations) {
      const values = cells.get(cellKey(location.id, month)) ?? emptyTotals();
      addInto(monthTotals, values);
      rows.push(toRow(month, values, location));
    }
    totals.push(toRow(month, monthTotals, null));
  }
  return { from, to, rows, totals };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * `GET /stock/indicators` : par lieu et par mois, plus le total. `locationId`
 * d'une autre agence : 404, comme un lieu inexistant.
 */
export async function getStockIndicators(
  tenantId: string,
  query: { from: string; to: string; locationId?: string | null }
): Promise<IndicatorsView> {
  const months = monthsBetween(query.from, query.to);
  const start = parseMonth(query.from);
  const end = parseMonth(query.to);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const locationId = query.locationId ?? null;

  if (locationId) {
    await assertBelongsToTenant(prisma, 'stockLocation', locationId, tenantId, {
      message: 'Lieu de stockage introuvable.'
    });
  }

  const [locations, aggregates] = await Promise.all([
    prisma.stockLocation.findMany({
      where: { tenantId, ...(locationId ? { id: locationId } : { isActive: true }) },
      select: { id: true, label: true }
    }),
    loadIndicatorAggregates(prisma, tenantId, start, end, locationId)
  ]);

  // Un lieu désactivé qui a eu de l'activité dans la période garde son libellé.
  const listed = new Set(locations.map(location => location.id));
  const missing = [
    ...new Set(
      [...aggregates.counts, ...aggregates.lines, ...aggregates.movements]
        .map(row => row.locationId)
        .filter(id => !listed.has(id))
    )
  ];
  const extra =
    missing.length > 0
      ? await prisma.stockLocation.findMany({
          where: { tenantId, id: { in: missing } },
          select: { id: true, label: true }
        })
      : [];

  return assembleIndicators(query.from, query.to, months, [...locations, ...extra], aggregates);
}
