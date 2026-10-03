/**
 * Historique des agences de test, module AGENCE : plans purs (dates, biens, baux)
 * de prisma/seeds/pack-history/agence-plan.ts et agence-data.ts. Aucun accès base.
 */
import { AGENCE_VOLUMES, planProperties } from '../../prisma/seeds/pack-history/agence-data';
import {
  addMonths,
  firstOfMonth,
  leaseEndDate,
  periodOf,
  planLeases,
  randomWorkday,
  ymd
} from '../../prisma/seeds/pack-history/agence-plan';
import { PROFILE_MONTHS, createRng } from '../../prisma/seeds/pack-history/types';
import type { HistoryProfile } from '../../prisma/seeds/pack-history/types';

const NOW = new Date(2026, 9, 3, 11, 30); // 3 octobre 2026

function build(profile: HistoryProfile, seed = 42) {
  const rng = createRng(seed);
  const v = AGENCE_VOLUMES[profile];
  const props = planProperties(rng, v.properties, v.owners);
  const leasable = props.filter(p => p.leasable);
  const leases = planLeases(
    rng,
    profile,
    PROFILE_MONTHS[profile],
    leasable.map(p => ({ commercial: p.commercial }))
  );
  return { props, leasable, leases, v };
}

describe('dates relatives', () => {
  it('firstOfMonth tombe sur le 1er du mois, à minuit', () => {
    const d = firstOfMonth(NOW, 6);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 3, 1, 0]);
    expect(firstOfMonth(NOW, 36).getFullYear()).toBe(2023);
  });

  it('addMonths garde le dernier jour du mois quand le jour n’existe pas', () => {
    expect(ymd(addMonths(new Date(2026, 0, 31), 1))).toBe('2026-02-28');
    expect(ymd(addMonths(new Date(2026, 10, 1), 3))).toBe('2027-02-01');
  });

  it('ymd et periodOf formatent en composantes locales', () => {
    expect(ymd(new Date(2026, 2, 5))).toBe('2026-03-05');
    expect(periodOf(new Date(2026, 2, 5))).toBe('2026-03');
  });

  it('randomWorkday reste dans la fenêtre, hors week-end, en heures ouvrées', () => {
    const rng = createRng(7);
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 30);
    for (let i = 0; i < 200; i++) {
      const d = randomWorkday(rng, from, to);
      expect(d.getTime()).toBeGreaterThanOrEqual(from.getTime());
      expect(d.getTime()).toBeLessThan(addMonths(to, 0).getTime() + 86_400_000);
      expect([0, 6]).not.toContain(d.getDay());
      expect(d.getHours()).toBeGreaterThanOrEqual(8);
      expect(d.getHours()).toBeLessThanOrEqual(17);
    }
  });
});

describe.each(['6m', '3y'] as const)('plans du profil %s', profile => {
  const months = PROFILE_MONTHS[profile];

  it('est déterministe : même graine, même plan', () => {
    expect(build(profile, 99)).toEqual(build(profile, 99));
  });

  it('produit le volume de biens attendu, avec des biens louables et un terrain à vendre', () => {
    const { props, leasable, v } = build(profile);
    expect(props).toHaveLength(v.properties);
    expect(leasable.length).toBeGreaterThanOrEqual(v.leases - v.renewals);
    expect(props.some(p => p.type === 'TERRAIN' && !p.leasable)).toBe(true);
    for (const p of leasable) expect(p.rent).toBeGreaterThan(0);
  });

  it('produit exactement le volume de baux attendu', () => {
    const { leases, v } = build(profile);
    expect(leases).toHaveLength(v.leases);
    expect(leases.filter(l => l.kind === 'ended')).toHaveLength(v.endedLeases);
    expect(leases.filter(l => l.isRenewal)).toHaveLength(v.renewals);
    expect(leases.filter(l => l.kind === 'terminated')).toHaveLength(v.terminatedLeases);
  });

  it('place chaque bail dans l’historique, du plus ancien au plus récent', () => {
    const { leases } = build(profile);
    for (const l of leases) {
      expect(l.startAgo).toBeGreaterThanOrEqual(1);
      expect(l.startAgo).toBeLessThanOrEqual(months);
    }
    const ago = leases.map(l => l.startAgo);
    expect(ago).toEqual([...ago].sort((a, b) => b - a));
  });

  it('un bail en cours finit dans le futur ; un bail terminé ou résilié est échu avant ce mois-ci', () => {
    const { leases } = build(profile);
    const monthStart = firstOfMonth(NOW, 0);
    for (const l of leases) {
      const end = leaseEndDate(NOW, l);
      if (l.kind === 'active') expect(end.getTime()).toBeGreaterThan(NOW.getTime());
      else expect(end.getTime()).toBeLessThanOrEqual(monthStart.getTime());
    }
  });

  it('ne loue un bien à deux locataires en même temps (sauf renouvellement à la suite)', () => {
    const { leases } = build(profile);
    const byProperty = new Map<number, typeof leases>();
    for (const l of leases) byProperty.set(l.leasableIndex, [...(byProperty.get(l.leasableIndex) ?? []), l]);
    for (const list of byProperty.values()) {
      const sorted = [...list].sort((a, b) => b.startAgo - a.startAgo);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].isRenewal).toBe(true);
        const previousEnd = leaseEndDate(NOW, sorted[i - 1]);
        const start = firstOfMonth(NOW, sorted[i].startAgo);
        expect(start.getTime()).toBeGreaterThanOrEqual(previousEnd.getTime());
      }
    }
  });

  it('couvre les scénarios de recette : à jour, retard, partiel, déclaration', () => {
    const { leases } = build(profile);
    const scenarios = new Set(leases.map(l => l.scenario));
    for (const s of ['a_jour', 'retard', 'partiel', 'declaration']) expect(scenarios.has(s as never)).toBe(true);
  });
});

describe('profil 3 ans', () => {
  it('contient des impayés régularisés, des baux terminés, renouvelés et résiliés', () => {
    const { leases } = build('3y');
    expect(leases.some(l => l.scenario === 'regularise')).toBe(true);
    expect(leases.some(l => l.kind === 'ended' && !leases.some(o => o.isRenewal && o.renterKey === l.renterKey))).toBe(
      true
    );
    expect(leases.some(l => l.isRenewal)).toBe(true);
    expect(leases.some(l => l.kind === 'terminated')).toBe(true);
  });

  it('démarre des baux dès le premier mois de l’historique', () => {
    const { leases } = build('3y');
    expect(leases.some(l => l.startAgo === PROFILE_MONTHS['3y'])).toBe(true);
  });
});

describe('profil 6 mois', () => {
  it('ne contient que des baux en cours, sans régularisation lointaine', () => {
    const { leases } = build('6m');
    expect(leases.every(l => l.kind === 'active')).toBe(true);
    expect(leases.some(l => l.scenario === 'regularise')).toBe(false);
  });
});
