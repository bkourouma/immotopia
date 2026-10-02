import { describe, expect, it } from 'vitest';
import { evaluerQuotaBiens, ligneCompteDansLots } from '../../../pages/patrimoine/import/quota';
import type { TenantEntitlements } from '../../../services/subscription-v2-service';

function droits(options: {
  detenus?: { limit: number; used: number };
  lots?: { limit: number; used: number };
  quotaPolicy?: TenantEntitlements['quotaPolicy'];
  enforcement?: TenantEntitlements['enforcement'];
}): TenantEntitlements {
  const etat = (c?: { limit: number; used: number }) => ({
    included: c?.limit ?? 0,
    extensions: 0,
    overrides: 0,
    limit: c?.limit ?? 0,
    used: c?.used ?? 0,
    remaining: Math.max(0, (c?.limit ?? 0) - (c?.used ?? 0)),
    overBy: Math.max(0, (c?.used ?? 0) - (c?.limit ?? 0))
  });
  return {
    quotaPolicy: options.quotaPolicy ?? 'BLOCK',
    enforcement: options.enforcement ?? 'enforce',
    capacities: {
      BIENS_DETENUS: etat(options.detenus),
      LOTS: etat(options.lots),
      COPROPRIETES: etat(),
      CHANTIERS: etat()
    }
  } as unknown as TenantEntitlements;
}

const lignes = (n: number, modes: string[] = ['SALE']) =>
  Array.from({ length: n }, (_v, i) => ({ numero: i + 2, modes }));

describe('evaluerQuotaBiens', () => {
  it('pack avec BIENS_DETENUS : chaque ligne compte, BLOCK retient le surplus dans l’ordre', () => {
    const r = evaluerQuotaBiens(droits({ detenus: { limit: 10, used: 8 } }), lignes(4));
    expect(r.capacite).toBe('BIENS_DETENUS');
    expect(r.restant).toBe(2);
    expect(r.passent).toEqual([2, 3]);
    expect(r.horsQuota).toEqual([4, 5]);
    expect(r.depassementFacture).toBe(0);
    expect(r.message).toContain('indicative');
  });

  it('sans BIENS_DETENUS : seules les lignes à louer comptent dans LOTS', () => {
    const entree = [
      { numero: 2, modes: ['SALE'] },
      { numero: 3, modes: ['RENTAL'] },
      { numero: 4, modes: ['SHORT_TERM', 'SALE'] },
      { numero: 5, modes: ['RENTAL'] }
    ];
    const r = evaluerQuotaBiens(droits({ lots: { limit: 3, used: 1 } }), entree);
    expect(r.capacite).toBe('LOTS');
    expect(r.restant).toBe(2);
    expect(r.horsQuota).toEqual([5]);
    expect(r.passent).toEqual([2, 3, 4]);
  });

  it('aucune ligne locative sans pack détenus : non applicable, tout passe', () => {
    const r = evaluerQuotaBiens(droits({ lots: { limit: 0, used: 0 } }), lignes(3));
    expect(r.applicable).toBe(false);
    expect(r.capacite).toBeNull();
    expect(r.restant).toBeNull();
    expect(r.horsQuota).toEqual([]);
    expect(r.passent).toEqual([2, 3, 4]);
  });

  it('BILL_OVERAGE : tout passe, le dépassement est compté', () => {
    const r = evaluerQuotaBiens(droits({ detenus: { limit: 5, used: 4 }, quotaPolicy: 'BILL_OVERAGE' }), lignes(4));
    expect(r.horsQuota).toEqual([]);
    expect(r.passent).toHaveLength(4);
    expect(r.depassementFacture).toBe(3);
    expect(r.message).toContain('facturé');
  });

  it('WARN_ONLY et enforcement warn/off : tout passe, rien n’est facturé', () => {
    for (const cas of [
      droits({ detenus: { limit: 1, used: 1 }, quotaPolicy: 'WARN_ONLY' }),
      droits({ detenus: { limit: 1, used: 1 }, enforcement: 'warn' }),
      droits({ detenus: { limit: 1, used: 1 }, enforcement: 'off' })
    ]) {
      const r = evaluerQuotaBiens(cas, lignes(3));
      expect(r.horsQuota).toEqual([]);
      expect(r.passent).toHaveLength(3);
      expect(r.depassementFacture).toBe(0);
    }
    expect(
      evaluerQuotaBiens(droits({ detenus: { limit: 1, used: 1 }, enforcement: 'warn' }), lignes(2)).message
    ).toContain('avertissement');
  });

  it('dans le plafond : rien n’est retenu', () => {
    const r = evaluerQuotaBiens(droits({ detenus: { limit: 100, used: 10 } }), lignes(5));
    expect(r.horsQuota).toEqual([]);
    expect(r.passent).toHaveLength(5);
  });

  it('used au-dessus de limit : tout est retenu en BLOCK', () => {
    const r = evaluerQuotaBiens(droits({ detenus: { limit: 5, used: 9 } }), lignes(2));
    expect(r.restant).toBe(0);
    expect(r.horsQuota).toEqual([2, 3]);
  });

  it('la capacité vient du pack (included), pas d’une simple limite non nulle', () => {
    const base = droits({ lots: { limit: 10, used: 0 } });
    const avecPack = {
      ...base,
      capacities: { ...base.capacities, BIENS_DETENUS: { included: 5, limit: 0, used: 0, remaining: 0, overBy: 0 } }
    } as unknown as TenantEntitlements;
    expect(evaluerQuotaBiens(avecPack, lignes(1, ['SALE'])).capacite).toBe('BIENS_DETENUS');

    const sansPack = {
      ...base,
      capacities: {
        ...base.capacities,
        BIENS_DETENUS: { included: 0, limit: 7, used: 0, remaining: 7, overBy: 0 }
      }
    } as unknown as TenantEntitlements;
    const r = evaluerQuotaBiens(sansPack, lignes(2, ['RENTAL']));
    expect(r.capacite).toBe('LOTS');
    expect(r.restant).toBe(10);
  });

  it('ligneCompteDansLots reconnaît RENTAL et SHORT_TERM seulement', () => {
    expect(ligneCompteDansLots(['SALE'])).toBe(false);
    expect(ligneCompteDansLots([])).toBe(false);
    expect(ligneCompteDansLots(['sale', 'rental'])).toBe(true);
    expect(ligneCompteDansLots(['SHORT_TERM'])).toBe(true);
  });
});
