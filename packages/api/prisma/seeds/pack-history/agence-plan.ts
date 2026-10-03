/**
 * Plans (purs) du générateur d'historique AGENCE : dates et baux.
 *
 * Aucun accès base : tout est déterminé par `rng` et par `end` (maintenant).
 * Le test `pack-history-agence-plan.test.ts` vérifie les invariants.
 */
import type { HistoryProfile } from './types';
import { between, pick } from './types';
import { AGENCE_VOLUMES } from './agence-data';

// ─────────────────────────────────────────────────────────────── dates

/** Premier jour du mois situé `monthsBack` mois avant `end`, à minuit (heure locale). */
export function firstOfMonth(end: Date, monthsBack: number): Date {
  return new Date(end.getFullYear(), end.getMonth() - monthsBack, 1, 0, 0, 0, 0);
}

/** `from` décalée de `months` mois (le jour du mois est conservé quand il existe). */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d;
}

export function addDaysTo(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/** Minuit local du jour de `end`. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** `AAAA-MM-JJ` en composantes locales (format attendu par `paidAt` des paiements). */
export function ymd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** `AAAA-MM`, période d'un relevé propriétaire. */
export function periodOf(d: Date): string {
  return ymd(d).slice(0, 7);
}

/** Date au hasard dans [from, to], à une heure ouvrée. */
export function randomWorkday(rng: () => number, from: Date, to: Date): Date {
  const span = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
  const d = addDaysTo(startOfDay(from), between(rng, 0, span));
  // Les week-ends glissent au lundi (sauf si cela dépasse `to`).
  const dow = d.getDay();
  if (dow === 6) d.setDate(d.getDate() + 2);
  else if (dow === 0) d.setDate(d.getDate() + 1);
  if (d.getTime() > to.getTime()) d.setTime(startOfDay(to).getTime());
  d.setHours(between(rng, 8, 17), pick(rng, [0, 15, 30, 45]), 0, 0);
  return d;
}

// ─────────────────────────────────────────────────────────────── baux

export type LeaseKind = 'active' | 'ended' | 'terminated';
export type LeaseScenario = 'a_jour' | 'retard' | 'partiel' | 'regularise' | 'declaration';
export type Frequency = 'MONTHLY' | 'QUARTERLY';

export interface LeasePlan {
  /** Indice de l'entrée dans la liste des biens louables. */
  leasableIndex: number;
  /** Les renouvellements réutilisent la clé du locataire du bail précédent. */
  renterKey: string;
  kind: LeaseKind;
  /** Début du bail : premier du mois, `startAgo` mois avant maintenant. */
  startAgo: number;
  /** Durée en mois (pour un bail résilié : jusqu'à la résiliation). */
  durationMonths: number;
  frequency: Frequency;
  dueDay: number;
  scenario: LeaseScenario;
  /** Échéances laissées impayées (scénario « retard »). */
  unpaid: number;
  /** Coefficient appliqué au loyer du bien (anciens baux moins chers, renouvellements revalorisés). */
  rentFactor: number;
  /** Ce bail renouvelle le précédent du même bien. */
  isRenewal: boolean;
}

export interface LeasableRef {
  commercial: boolean;
}

const DURATIONS = [12, 24, 36, 48, 60] as const;

/** Plus petite durée standard strictement supérieure à l'ancienneté : le bail court encore. */
export function runningDuration(rng: () => number, startAgo: number): number {
  let i = DURATIONS.findIndex(d => d > startAgo);
  if (i < 0) i = DURATIONS.length - 1;
  if (rng() < 0.3 && i < DURATIONS.length - 1) i += 1;
  return DURATIONS[i];
}

/** Scénarios imposés aux premiers baux actifs : l'écran de recette y trouve tous les cas. */
const FORCED_SCENARIOS: readonly LeaseScenario[] = [
  'a_jour',
  'retard',
  'a_jour',
  'partiel',
  'declaration',
  'a_jour',
  'retard',
  'a_jour'
];

function drawScenario(rng: () => number, profile: HistoryProfile): LeaseScenario {
  const r = rng();
  if (r < 0.56) return 'a_jour';
  if (r < 0.7) return 'retard';
  if (r < 0.78) return 'partiel';
  if (r < 0.92) return profile === '3y' ? 'regularise' : 'a_jour';
  return 'declaration';
}

/**
 * Compose les baux du profil. Les biens louables sont consommés dans l'ordre ;
 * un renouvellement reprend le bien et le locataire du bail terminé qui le
 * précède. Résultat trié du plus ancien au plus récent (numérotation des baux
 * dans l'ordre du temps).
 */
export function planLeases(
  rng: () => number,
  profile: HistoryProfile,
  months: number,
  leasable: readonly LeasableRef[]
): LeasePlan[] {
  const v = AGENCE_VOLUMES[profile];
  const plans: LeasePlan[] = [];
  let cursor = 0;
  const take = (): number | null => (cursor < leasable.length ? cursor++ : null);

  const mk = (
    p: Omit<LeasePlan, 'frequency' | 'dueDay' | 'scenario' | 'unpaid' | 'rentFactor' | 'isRenewal'> & Partial<LeasePlan>
  ): LeasePlan => ({
    frequency: leasable[p.leasableIndex].commercial && rng() < 0.4 ? 'QUARTERLY' : ('MONTHLY' as Frequency),
    dueDay: pick(rng, [5, 5, 5, 10, 1]),
    scenario: 'a_jour',
    unpaid: 0,
    rentFactor: 1,
    isRenewal: false,
    ...p
  });

  // Baux terminés à leur terme, dont certains renouvelés sur le même bien.
  for (let r = 0; r < v.endedLeases; r++) {
    const duration = r % 2 === 0 ? 12 : 24;
    if (duration + 2 > months) break;
    const li = take();
    if (li === null) break;
    const startAgo = between(rng, duration + 2, months);
    const key = `ended-${r}`;
    plans.push(
      mk({
        leasableIndex: li,
        renterKey: key,
        kind: 'ended',
        startAgo,
        durationMonths: duration,
        rentFactor: 0.92,
        scenario: rng() < 0.3 ? 'regularise' : 'a_jour'
      })
    );
    if (r < v.renewals) {
      const renewalAgo = startAgo - duration;
      plans.push(
        mk({
          leasableIndex: li,
          renterKey: key,
          kind: 'active',
          startAgo: renewalAgo,
          durationMonths: runningDuration(rng, renewalAgo),
          rentFactor: 1,
          isRenewal: true
        })
      );
    }
  }

  // Baux résiliés avant terme (préavis du locataire).
  for (let t = 0; t < v.terminatedLeases; t++) {
    if (months < 10) break;
    const li = take();
    if (li === null) break;
    const startAgo = between(rng, 8, months - 1);
    plans.push(
      mk({
        leasableIndex: li,
        renterKey: `terminated-${t}`,
        kind: 'terminated',
        startAgo,
        durationMonths: between(rng, 5, startAgo - 2),
        rentFactor: 0.95
      })
    );
  }

  // Baux en cours : le reste du volume.
  let activeIndex = 0;
  while (plans.length < v.leases) {
    const li = take();
    if (li === null) break;
    const startAgo = activeIndex < 3 ? months : between(rng, 1, months);
    const scenario = activeIndex < FORCED_SCENARIOS.length ? FORCED_SCENARIOS[activeIndex] : drawScenario(rng, profile);
    const effective: LeaseScenario = scenario === 'regularise' && startAgo < 6 ? 'a_jour' : scenario;
    const frequency: Frequency = leasable[li].commercial && rng() < 0.4 ? 'QUARTERLY' : 'MONTHLY';
    plans.push({
      leasableIndex: li,
      renterKey: `active-${activeIndex}`,
      kind: 'active',
      startAgo,
      durationMonths: runningDuration(rng, startAgo),
      frequency,
      dueDay: pick(rng, [5, 5, 5, 10, 1]),
      scenario: effective,
      unpaid: effective === 'retard' ? (frequency === 'QUARTERLY' ? 1 : pick(rng, [1, 1, 2, 3])) : 0,
      rentFactor: 1 - 0.015 * Math.floor(startAgo / 12),
      isRenewal: false
    });
    activeIndex++;
  }

  return plans.sort((a, b) => b.startAgo - a.startAgo);
}

/** Fin effective d'un bail planifié (première échéance hors bail). */
export function leaseEndDate(end: Date, plan: Pick<LeasePlan, 'startAgo' | 'durationMonths'>): Date {
  return addMonths(firstOfMonth(end, plan.startAgo), plan.durationMonths);
}
