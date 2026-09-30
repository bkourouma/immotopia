import type { YieldAssumptionsInput } from './YieldCalculator';

/**
 * Les hypothèses de projection ne sont pas stockées côté serveur (la spec 015,
 * FR-009, n'en fait qu'un paramètre de calcul). Pour qu'elles survivent à un
 * rechargement, on les garde sur l'appareil, par agence et par bien.
 */
const cle = (tenantId: string, propertyId: string) => `patrimoine:performance:assumptions:${tenantId}:${propertyId}`;

const BORNES: Record<keyof YieldAssumptionsInput, [number, number]> = {
  years: [1, 30],
  valueGrowthRate: [-0.5, 1],
  rentGrowthRate: [-0.5, 1],
  expenseGrowthRate: [-0.5, 1],
  vacancyRate: [0, 1]
};

export function readYieldAssumptions(tenantId: string, propertyId: string): YieldAssumptionsInput | undefined {
  try {
    const raw = window.localStorage.getItem(cle(tenantId, propertyId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [k, [min, max]] of Object.entries(BORNES)) {
      const v = parsed[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return undefined;
    }
    return parsed as unknown as YieldAssumptionsInput;
  } catch {
    return undefined;
  }
}

export function writeYieldAssumptions(tenantId: string, propertyId: string, value: YieldAssumptionsInput): void {
  try {
    window.localStorage.setItem(cle(tenantId, propertyId), JSON.stringify(value));
  } catch {
    // stockage indisponible : les hypothèses restent valables pour la session en cours
  }
}
