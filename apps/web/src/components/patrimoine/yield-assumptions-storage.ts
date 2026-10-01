import { getYieldAssumptions, saveYieldAssumptions } from '../../services/patrimoine-service';
import type { YieldAssumptionsInput } from './YieldCalculator';

/**
 * Les hypothèses de projection vivent sur le serveur (une ligne par bien,
 * partagée entre appareils et collaborateurs). Le stockage local ne sert plus
 * que de REPLI hors ligne et de source de migration unique : sous la même clé
 * qu'avant, par agence et par bien.
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
    if (!Number.isInteger(parsed.years)) return undefined;
    // Objet reconstruit : une clé en trop dans le stockage ferait refuser le PUT (corps strict).
    return {
      years: parsed.years as number,
      valueGrowthRate: parsed.valueGrowthRate as number,
      rentGrowthRate: parsed.rentGrowthRate as number,
      expenseGrowthRate: parsed.expenseGrowthRate as number,
      vacancyRate: parsed.vacancyRate as number
    };
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

export interface LoadedYieldAssumptions {
  /** `undefined` : aucune hypothèse enregistrée nulle part, le composant utilise ses défauts. */
  assumptions: YieldAssumptionsInput | undefined;
  source: 'server' | 'local' | 'default';
  /** Faux tant que la valeur affichée n'est connue que de cet appareil. */
  synced: boolean;
}

const enVol = new Map<string, Promise<LoadedYieldAssumptions>>();

/** Valeur locale valide + tentative de migration (PUT) vers le serveur. */
async function migrerLocal(
  tenantId: string,
  propertyId: string,
  local: YieldAssumptionsInput
): Promise<LoadedYieldAssumptions> {
  try {
    await saveYieldAssumptions(tenantId, propertyId, local);
    return { assumptions: local, source: 'server', synced: true };
  } catch {
    // 403 (lecteur), hors ligne, 5xx : on garde le local, la migration sera retentée.
    return { assumptions: local, source: 'local', synced: false };
  }
}

async function charger(tenantId: string, propertyId: string): Promise<LoadedYieldAssumptions> {
  const local = readYieldAssumptions(tenantId, propertyId);
  let etat;
  try {
    etat = await getYieldAssumptions(tenantId, propertyId);
  } catch {
    return local
      ? { assumptions: local, source: 'local', synced: false }
      : { assumptions: undefined, source: 'default', synced: false };
  }
  if (etat.saved) {
    // Le serveur fait foi : il n'est jamais écrasé par le local.
    writeYieldAssumptions(tenantId, propertyId, etat.assumptions);
    return { assumptions: etat.assumptions, source: 'server', synced: true };
  }
  if (local) return migrerLocal(tenantId, propertyId, local);
  return { assumptions: undefined, source: 'default', synced: true };
}

/**
 * Résout les hypothèses d'un bien : serveur d'abord, migration unique de la
 * valeur locale s'il n'y a encore rien côté serveur, repli local si le serveur
 * est injoignable. Ne lève jamais. Une promesse en vol par bien évite les PUT
 * concurrents.
 */
export function loadYieldAssumptions(tenantId: string, propertyId: string): Promise<LoadedYieldAssumptions> {
  const key = cle(tenantId, propertyId);
  const existante = enVol.get(key);
  if (existante) return existante;
  const promesse = charger(tenantId, propertyId).finally(() => enVol.delete(key));
  enVol.set(key, promesse);
  return promesse;
}

/** Enregistre sur le serveur ; en cas d'échec, écrit seulement en local (`synced: false`). Ne lève jamais. */
export async function persistYieldAssumptions(
  tenantId: string,
  propertyId: string,
  value: YieldAssumptionsInput
): Promise<{ synced: boolean }> {
  try {
    await saveYieldAssumptions(tenantId, propertyId, value);
    writeYieldAssumptions(tenantId, propertyId, value);
    return { synced: true };
  } catch {
    writeYieldAssumptions(tenantId, propertyId, value);
    return { synced: false };
  }
}
