/**
 * Fiche patrimoniale de chaque bien propre de l'agence : acquisition, croissance de la valeur,
 * police d'assurance courante et précédentes. Tout est DÉRIVÉ de la référence du bien (hasard
 * local seedé par agence + référence) : les blocs « valeurs », « charges », « assurances »,
 * « sinistres » lisent donc les mêmes chiffres quel que soit l'ordre ou la reprise de l'exécution.
 */
import { createRng, seedFromString } from './types';
import { hnum } from './patrimoine-extras-docs';
import { monthsBack, monthsBetween, roundTo } from './agence-patrimoine-state';
import type { OwnProperty, OwnState } from './agence-patrimoine-state';

export const INSURERS = [
  { name: 'NSIA Assurances Côte d’Ivoire', code: 'NSIA' },
  { name: 'Saham Assurance Côte d’Ivoire', code: 'SAHAM' },
  { name: 'Allianz Côte d’Ivoire Assurances', code: 'ALZ' },
  { name: 'AXA Assurances Côte d’Ivoire', code: 'AXA' },
  { name: 'SUNU Assurances IARD', code: 'SUNU' }
] as const;

/** Rendement brut (loyer annuel / valeur) par type de bien. */
const GROSS_YIELD: Record<string, number> = {
  APPARTEMENT: 0.07,
  STUDIO: 0.08,
  MAISON_VILLA: 0.055,
  DUPLEX_TRIPLEX: 0.06,
  BUREAU: 0.075,
  BOUTIQUE_COMMERCIAL: 0.085,
  ENTREPOT_INDUSTRIEL: 0.09,
  PARKING_BOX: 0.1
};

export type CoverageType = 'MULTIRISK_HOME' | 'MULTIRISK_BUILDING' | 'OWNER_LIABILITY' | 'OTHER';

export interface PolicyPlan {
  insurer: string;
  code: string;
  number: string;
  coverage: CoverageType;
  start: Date;
  end: Date;
  premium: number;
}

export interface Profile {
  prop: OwnProperty;
  index: number;
  /** Hasard local du bien (jamais le flux partagé du contexte). */
  rng: () => number;
  /** Flux de hasard propre à un bloc : l'ordre ou la reprise des blocs ne le décale jamais. */
  fork: (name: string) => () => number;
  acqAgo: number;
  acqDate: Date;
  legalStatus: 'TITRE_FONCIER' | 'ACD' | 'ATTESTATION_COUTUMIERE';
  growth: number;
  cost: number;
  valueNow: number;
  annualRent: number;
  /** Bail actif ou suspendu en ce moment. */
  leased: boolean;
  policies: PolicyPlan[];
}

const COVERAGE_BY_TYPE = (type: string): CoverageType =>
  ['BUREAU', 'ENTREPOT_INDUSTRIEL', 'IMMEUBLE'].includes(type)
    ? 'MULTIRISK_BUILDING'
    : ['PARKING_BOX', 'BOUTIQUE_COMMERCIAL'].includes(type)
      ? 'OWNER_LIABILITY'
      : 'MULTIRISK_HOME';

function valueRounding(value: number): number {
  return value >= 20_000_000 ? 500_000 : 100_000;
}

/** Valeur estimée `m` mois avant maintenant (croissance composée, bruit de marché de ±1,5 %). */
export function valueAtMonthsAgo(p: Profile, m: number): number {
  const years = Math.max(0, p.acqAgo - m) / 12;
  const noise = 1 + ((hnum(`${p.prop.ref}:${m}`, 0, 300) - 150) / 150) * 0.015;
  return roundTo(p.cost * Math.pow(1 + p.growth, years) * noise, valueRounding(p.cost));
}

export function buildProfiles(o: OwnState, leasedIds: Set<string>): Profile[] {
  const { tenantId, end } = o.ctx;
  const profiles: Profile[] = [];
  const usedNumbers = new Set<string>();
  o.own.forEach((prop, index) => {
    const rng = createRng(seedFromString(`${tenantId}:patrimoine:${prop.ref}`));
    const sinceCreated = Math.max(1, monthsBetween(prop.createdAt, end));
    // Le bien était déjà dans le patrimoine avant d'être saisi dans l'application.
    const acqAgo = Math.min(84, sinceCreated + 2 + Math.floor(rng() * 36));
    const growth = Math.round((0.025 + rng() * 0.04) * 1000) / 1000;
    const annualRent = prop.price * 12;
    const yieldRate = (GROSS_YIELD[prop.type] ?? 0.07) * (0.92 + rng() * 0.16);
    const valueNow = roundTo(annualRent / yieldRate, valueRounding(annualRent / yieldRate));
    const cost = roundTo(valueNow / Math.pow(1 + growth, acqAgo / 12), valueRounding(valueNow));
    const insurer = INSURERS[(index + Math.floor(rng() * 3)) % INSURERS.length];
    const profile: Profile = {
      prop,
      index,
      rng,
      fork: (name: string) => createRng(seedFromString(`${tenantId}:patrimoine:${prop.ref}:${name}`)),
      acqAgo,
      acqDate: monthsBack(end, acqAgo, 1 + Math.floor(rng() * 25)),
      legalStatus: rng() < 0.7 ? 'TITRE_FONCIER' : 'ACD',
      growth,
      cost,
      valueNow,
      annualRent,
      leased: leasedIds.has(prop.id),
      policies: []
    };

    // Polices : une par an depuis l'acquisition (plafonné à 4 ans), la courante commence il y a 0 à 11 mois.
    // Deux biens ont une police qui expire dans le mois ; un bien est resté sans couverture depuis deux mois.
    let currentAgo = Math.floor(rng() * 12);
    if (index === 2 || index === 8) currentAgo = 11;
    const lapsed = index === 5;
    if (lapsed) currentAgo = 14;
    else currentAgo = Math.min(currentAgo, acqAgo);
    for (let a = currentAgo, n = 0; n < 4 && a <= Math.max(acqAgo, currentAgo); a += 12, n++) {
      const day = 1 + (hnum(`${prop.ref}:day`, 0, 24) % 25);
      const start = monthsBack(end, a, a === 0 ? Math.min(day, Math.max(1, end.getDate() - 1)) : day);
      const stop = monthsBack(end, a - 12, start.getDate());
      let number = '';
      for (let k = 0; ; k++) {
        number = `${insurer.code}-${start.getFullYear()}-${String(hnum(`${tenantId}${prop.ref}${start.getFullYear()}${k}`, 10000, 99999))}`;
        if (!usedNumbers.has(number)) break;
      }
      usedNumbers.add(number);
      profile.policies.push({
        insurer: insurer.name,
        code: insurer.code,
        number,
        coverage: COVERAGE_BY_TYPE(prop.type),
        start,
        end: stop,
        premium: roundTo(valueAtMonthsAgoRaw(cost, growth, acqAgo, a) * 0.0025, 1_000)
      });
    }
    profile.policies.reverse();
    profiles.push(profile);
  });
  // Le dossier de régularisation foncière en cours porte sur un bien encore couvert par une attestation coutumière.
  const targets = landTargets(profiles);
  if (targets.inProgress) targets.inProgress.legalStatus = 'ATTESTATION_COUTUMIERE';
  if (targets.done) targets.done.legalStatus = 'TITRE_FONCIER';
  return profiles;
}

/** Biens des deux dossiers de régularisation foncière : l'un en cours, l'autre abouti. */
export function landTargets(profiles: Profile[]): { inProgress: Profile | undefined; done: Profile | undefined } {
  const inProgress = profiles.find(p => p.prop.type === 'ENTREPOT_INDUSTRIEL') ?? profiles[4];
  const done = profiles.find(p => p.prop.type === 'BOUTIQUE_COMMERCIAL' && p !== inProgress) ?? profiles[10];
  return { inProgress, done };
}

function valueAtMonthsAgoRaw(cost: number, growth: number, acqAgo: number, m: number): number {
  return cost * Math.pow(1 + growth, Math.max(0, acqAgo - m) / 12);
}
