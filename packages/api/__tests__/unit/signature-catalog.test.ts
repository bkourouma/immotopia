/**
 * Capacité SIGNATURES_MENSUELLES (spec 043, décisions du 15/10/2026) : quota selon
 * le pack d'agence (valeurs PROVISOIRES), extension cumulable « bloc de 50 »
 * (prix à décider : 0 et non vendable), additionnée par le calcul des droits ;
 * la migration de données dit la même chose que le catalogue et reste idempotente.
 */
import * as fs from 'fs';
import * as path from 'path';
import { computeCapacityLimits } from '../../src/lib/subscription/entitlements';
import { DEFAULT_CATALOG, EXTENSION, PACK } from '../../src/lib/subscription/catalog';

const AGENCY_PACKS: string[] = [PACK.AGENCE, PACK.SYNDIC, PACK.PROMOTEUR, PACK.INTEGRE];
const PROVISIONAL: Record<string, number> = {
  [PACK.AGENCE]: 20,
  [PACK.SYNDIC]: 50,
  [PACK.PROMOTEUR]: 20,
  [PACK.INTEGRE]: 100
};
const entry = (code: string) => DEFAULT_CATALOG.find(item => item.code === code);

describe('catalogue : signatures incluses selon le pack', () => {
  it('AGENCE 20, SYNDIC 50, PROMOTEUR 20, INTEGRE 100 (valeurs provisoires)', () => {
    for (const code of AGENCY_PACKS) {
      expect({ code, amount: entry(code)?.capacities.SIGNATURES_MENSUELLES }).toEqual({
        code,
        amount: PROVISIONAL[code]
      });
    }
  });

  it('seule l’extension « bloc de 50 » la porte en dehors des quatre packs', () => {
    const others = DEFAULT_CATALOG.filter(
      item => !AGENCY_PACKS.includes(item.code) && item.code !== EXTENSION.SIGNATURES_SUPPLEMENTAIRES
    );
    expect(others.length).toBeGreaterThan(0);
    for (const item of others) {
      expect({ code: item.code, has: 'SIGNATURES_MENSUELLES' in item.capacities }).toEqual({
        code: item.code,
        has: false
      });
    }
  });

  it('les capacités déjà portées par ces packs sont inchangées', () => {
    expect(entry(PACK.AGENCE)?.capacities).toMatchObject({ LOTS: 100 });
    expect(entry(PACK.SYNDIC)?.capacities).toMatchObject({ COPROPRIETES: 2, LOTS: 100 });
    expect(entry(PACK.PROMOTEUR)?.capacities).toMatchObject({ CHANTIERS: 2, LOTS: 150 });
    expect(entry(PACK.INTEGRE)?.capacities).toMatchObject({ CHANTIERS: 3, COPROPRIETES: 3, LOTS: 300 });
  });
});

describe('extension « Signatures électroniques — bloc de 50 »', () => {
  const extension = entry(EXTENSION.SIGNATURES_SUPPLEMENTAIRES);

  it('est une extension de 50 signatures, réservée aux quatre packs d’agence', () => {
    expect(extension).toMatchObject({
      code: 'EXT_SIGNATURES_SUPPLEMENTAIRES',
      kind: 'EXTENSION',
      name: 'Signatures électroniques — bloc de 50',
      capacities: { SIGNATURES_MENSUELLES: 50 },
      rules: { requiresAnyOf: AGENCY_PACKS }
    });
  });

  it('prix 0 et non vendable tant que le tarif n’est pas décidé (décision fondateur)', () => {
    expect(extension?.monthlyPrice).toBe(0);
    expect(extension?.isSellable).toBe(false);
  });

  it('le calcul des droits additionne le pack et la quantité d’extensions', () => {
    const pack = entry(PACK.AGENCE)!;
    const item = (def: NonNullable<typeof extension>, quantity: number) => ({
      kind: def.kind,
      quantity,
      capacities: def.capacities
    });
    const now = new Date();
    const alone = computeCapacityLimits([item(pack, 1)], [], now).SIGNATURES_MENSUELLES;
    expect(alone).toMatchObject({ included: 20, extensions: 0, limit: 20 });
    const withBlocks = computeCapacityLimits([item(pack, 1), item(extension!, 3)], [], now).SIGNATURES_MENSUELLES;
    expect(withBlocks).toMatchObject({ included: 20, extensions: 150, limit: 170 });
    const integre = computeCapacityLimits(
      [item(entry(PACK.INTEGRE)!, 1), item(extension!, 1)],
      [],
      now
    ).SIGNATURES_MENSUELLES;
    expect(integre.limit).toBe(150);
  });
});

describe('migration de données', () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '../../prisma/migrations/20261015120000_signatures_incluses_packs/migration.sql'),
    'utf8'
  );
  const code = sql.replace(/--.*$/gm, '');

  it('pose les valeurs par pack, comme le catalogue', () => {
    const codes = [...(/"code" IN \(([^)]*)\)/.exec(code)?.[1] ?? '').matchAll(/'([A-Z_]+)'/g)].map(m => m[1]).sort();
    expect(codes).toEqual([...AGENCY_PACKS].sort());
    for (const [pack, amount] of Object.entries(PROVISIONAL)) {
      expect(code).toContain(`WHEN '${pack}' THEN ${amount}`);
    }
  });

  it('amorce l’extension : 50 par unité, prix 0, non vendable, requiresAnyOf des quatre packs', () => {
    expect(code).toContain("'EXT_SIGNATURES_SUPPLEMENTAIRES', 'EXTENSION'");
    expect(code).toContain('\'{"requiresAnyOf":["AGENCE","SYNDIC","PROMOTEUR","INTEGRE"]}\'::jsonb, false, 160');
    expect(code).toMatch(/0, 0, ARRAY\[\]::"ModuleKey"\[\]/);
    expect(code).toMatch(
      /'SIGNATURES_MENSUELLES', 50 FROM "catalog_items" WHERE "code" = 'EXT_SIGNATURES_SUPPLEMENTAIRES'/
    );
  });

  it('est idempotente et ne touche aucun abonnement', () => {
    expect(code.match(/ON CONFLICT/g)?.length).toBe(3);
    expect(code).not.toMatch(/\b(DELETE|UPDATE|DROP|TRUNCATE)\b/i);
    expect(code).not.toMatch(/subscription/i);
  });
});
