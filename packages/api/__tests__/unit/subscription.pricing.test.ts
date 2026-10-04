/**
 * Abonnements par packs — prix (lib/subscription/pricing.ts).
 *
 * Les exemples chiffres de docs/architecture/PLAN-ABONNEMENTS.md, recalcules
 * a partir du catalogue par defaut (grille du site). Pur : aucune base.
 */

import fs from 'fs';
import path from 'path';
import {
  ANNUAL_MONTHS,
  DEFAULT_CATALOG,
  EXTENSION,
  PACK,
  PARTICULIER_PACKS,
  PATRIMOINE_PACKS,
  packsForModules,
  featuresForModules,
  validateExclusivity,
  PricingCatalogItem,
  annualPrice,
  computeComboDiscount,
  computeOverageLines,
  computeRecurringLines,
  computeSetupLines,
  cycleMultiplier,
  estimateMonthly,
  finalizeInvoice,
  isExtensionAllowed,
  planExtensionUnits,
  prorataDays,
  prorateAmount,
  resolveUnitMonthlyPrice,
  scaleLinesForCycle,
  addBillingPeriod
} from '../../src/lib/subscription';

const catalog: PricingCatalogItem[] = DEFAULT_CATALOG.map(d => ({ ...d }));
const byCode = (code: string) => catalog.find(c => c.code === code)!;
const lotsBlock = byCode(EXTENSION.LOTS_10);
const copro = byCode(EXTENSION.COPRO);
const chantier = byCode(EXTENSION.CHANTIER);

/** Calque exact des fonctions du site (pricing.ts), pour comparer. */
const over = (n: number, limit: number) => Math.max(0, n - limit);
const site = {
  agence: (units: number) => 29_900 + Math.min(over(units, 100), 200) * 150 + over(units, 300) * 75,
  syndic: (copros: number, lots: number) => 49_900 + over(copros, 2) * 10_000 + over(lots, 100) * 150,
  promoteur: (sites: number, lots: number) => 149_900 + over(sites, 2) * 40_000 + over(lots, 150) * 100,
  integre: (sites: number, copros: number, lots: number) =>
    249_900 + over(sites, 3) * 35_000 + over(copros, 3) * 10_000 + over(lots, 300) * 100
};

describe('Catalogue par defaut = grille du site', () => {
  it('prix mensuels, mises en route et capacites des quatre packs', () => {
    expect(byCode(PACK.AGENCE)).toMatchObject({ monthlyPrice: 29_900, setupPrice: 100_000, capacities: { LOTS: 100 } });
    expect(byCode(PACK.SYNDIC)).toMatchObject({
      monthlyPrice: 49_900,
      setupPrice: 150_000,
      capacities: { COPROPRIETES: 2, LOTS: 100 }
    });
    expect(byCode(PACK.PROMOTEUR)).toMatchObject({
      monthlyPrice: 149_900,
      setupPrice: 450_000,
      capacities: { CHANTIERS: 2, LOTS: 150 }
    });
    expect(byCode(PACK.INTEGRE)).toMatchObject({
      monthlyPrice: 249_900,
      setupPrice: 650_000,
      capacities: { CHANTIERS: 3, COPROPRIETES: 3, LOTS: 300 },
      exclusiveGroup: 'INTEGRE'
    });
  });

  it('extensions : bloc de 10 lots a 1 500, copropriete 10 000, chantier 40 000', () => {
    expect(lotsBlock).toMatchObject({ monthlyPrice: 1_500, capacities: { LOTS: 10 } });
    expect(copro).toMatchObject({ monthlyPrice: 10_000, capacities: { COPROPRIETES: 1 } });
    expect(chantier).toMatchObject({ monthlyPrice: 40_000, capacities: { CHANTIERS: 1 } });
  });

  it('mises en route vendues a part (SETUP_*) aux montants du site', () => {
    expect(byCode('SETUP_AGENCE').setupPrice).toBe(100_000);
    expect(byCode('SETUP_SYNDIC').setupPrice).toBe(150_000);
    expect(byCode('SETUP_PROMOTEUR').setupPrice).toBe(450_000);
    expect(byCode('SETUP_INTEGRE').setupPrice).toBe(650_000);
  });

  it('la migration SQL amorce exactement le meme catalogue (codes et prix)', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../prisma/migrations/20260928090000_abonnements_packs/migration.sql'),
      'utf8'
    );
    // Les offres Patrimoine (lot P1) ne viennent pas de cette migration-ci
    // mais de 20261001101600_patrimoine_pack_catalogue, celles du lot 4A de
    // 20261004220100_particulier_catalogue (verifies ci-dessous). L'option
    // Inventaire WhatsApp (lot 041) ne vient pas du site mais de la decision
    // du fondateur du 04/10/2026 : 20261009090200_inventaire_whatsapp_catalogue.
    for (const item of DEFAULT_CATALOG) {
      if (
        PATRIMOINE_PACKS.includes(item.code) ||
        PARTICULIER_PACKS.includes(item.code) ||
        item.code === EXTENSION.BIENS_10 ||
        item.code === EXTENSION.INVENTAIRE_WHATSAPP ||
        item.code.startsWith('SETUP_PATRIMOINE_')
      ) {
        continue;
      }
      expect(sql).toContain(`'${item.code}', '${item.kind}'`);
      expect(sql).toMatch(
        new RegExp(`'${item.code}', '${item.kind}', '[^']*', [^\\n]*, ${item.monthlyPrice}, ${item.setupPrice},`)
      );
    }
  });

  it('la migration Particulier amorce exactement les deux packs (prix, capacite ACTIFS, palier)', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../prisma/migrations/20261004220100_particulier_catalogue/migration.sql'),
      'utf8'
    );
    const enums = fs.readFileSync(
      path.join(__dirname, '../../prisma/migrations/20261004220000_particulier_enums/migration.sql'),
      'utf8'
    );
    expect(enums).toContain(`ALTER TYPE "TenantType" ADD VALUE IF NOT EXISTS 'PARTICULIER'`);
    expect(enums).toContain(`ALTER TYPE "CapacityKey" ADD VALUE IF NOT EXISTS 'ACTIFS'`);
    // Une valeur d'enum ajoutee ne s'emploie pas dans la meme transaction.
    expect(enums).not.toContain('INSERT');
    for (const code of PARTICULIER_PACKS) {
      const item = DEFAULT_CATALOG.find(c => c.code === code)!;
      expect(sql).toMatch(
        new RegExp(`'${item.code}', '${item.kind}', '[^']*', [^\\n]*, ${item.monthlyPrice}, ${item.setupPrice},`)
      );
      expect(sql).toContain(`'{"tierGroup":"PARTICULIER"}'::jsonb`);
      expect(sql).toContain(`'ACTIFS', ${item.capacities.ACTIFS} FROM "catalog_items" WHERE "code" = '${item.code}'`);
    }
  });

  it('la migration Inventaire WhatsApp amorce l’option a 25 000 pour 500 photos (PHOTOS_INVENTAIRE), Promoteur ou Integre', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../prisma/migrations/20261009090200_inventaire_whatsapp_catalogue/migration.sql'),
      'utf8'
    );
    const item = DEFAULT_CATALOG.find(c => c.code === EXTENSION.INVENTAIRE_WHATSAPP)!;
    expect(item).toMatchObject({
      code: 'EXT_INVENTAIRE_WHATSAPP',
      kind: 'EXTENSION',
      monthlyPrice: 25_000,
      setupPrice: 0,
      capacities: { PHOTOS_INVENTAIRE: 500 }
    });
    // Nom et description tiennent chacun sur leur ligne, avant les prix.
    expect(sql).toMatch(
      new RegExp(`'${item.code}', '${item.kind}', '[^']*',\\s*'[^']*',\\s*${item.monthlyPrice}, ${item.setupPrice},`)
    );
    expect(sql).toContain(`'${JSON.stringify(item.rules)}'::jsonb`);
    expect(sql).toContain(
      `'PHOTOS_INVENTAIRE', ${item.capacities.PHOTOS_INVENTAIRE} FROM "catalog_items" WHERE "code" = '${item.code}'`
    );
  });

  it('packs Particulier : gratuit a 0 pour 10 actifs, Plus a 2 900 pour 100 actifs, meme palier, module Patrimoine', () => {
    const def = (code: string) => DEFAULT_CATALOG.find(c => c.code === code)!;
    expect(def(PACK.PARTICULIER_GRATUIT)).toMatchObject({
      kind: 'PACK',
      monthlyPrice: 0,
      setupPrice: 0,
      modules: ['MODULE_PATRIMOINE'],
      capacities: { ACTIFS: 10 },
      rules: { tierGroup: 'PARTICULIER' }
    });
    expect(def(PACK.PARTICULIER_PLUS)).toMatchObject({
      kind: 'PACK',
      monthlyPrice: 2_900,
      setupPrice: 0,
      modules: ['MODULE_PATRIMOINE'],
      capacities: { ACTIFS: 100 },
      rules: { tierGroup: 'PARTICULIER' }
    });
    // Annuel : convention existante (11 mensualites).
    expect(annualPrice(2_900)).toBe(2_900 * ANNUAL_MONTHS);
    // Aucune mise en route vendue a part.
    expect(DEFAULT_CATALOG.some(c => c.code.startsWith('SETUP_PARTICULIER'))).toBe(false);
  });

  it('les deux packs Particulier ne se cumulent pas ; ils ouvrent les fonctionnalites du module Patrimoine', () => {
    const def = (code: string) => DEFAULT_CATALOG.find(c => c.code === code)!;
    const items = (codes: string[]) =>
      codes.map(code => ({
        code,
        kind: 'PACK' as const,
        exclusiveGroup: def(code).exclusiveGroup,
        tierGroup: def(code).rules?.tierGroup ?? null
      }));
    expect(validateExclusivity(items([PACK.PARTICULIER_GRATUIT, PACK.PARTICULIER_PLUS])).ok).toBe(false);
    expect(validateExclusivity(items([PACK.PARTICULIER_GRATUIT])).ok).toBe(true);
    expect(featuresForModules(def(PACK.PARTICULIER_GRATUIT).modules)).toEqual(['CORE', 'RENTAL', 'PATRIMOINE']);
    expect(featuresForModules(def(PACK.PARTICULIER_PLUS).modules)).toEqual(['CORE', 'RENTAL', 'PATRIMOINE']);
  });

  it('packsForModules est inchange par les packs Particulier', () => {
    expect(packsForModules(['MODULE_PATRIMOINE'])).toEqual({ packs: [PACK.PATRIMOINE_ESSENTIEL], toReview: false });
    expect(packsForModules(['MODULE_AGENCY'])).toEqual({ packs: [PACK.AGENCE], toReview: false });
  });

  it('ACTIFS : aucun depassement facture (pas d extension), le pack Plus ne porte pas de bloc', () => {
    expect(DEFAULT_CATALOG.filter(c => c.kind === 'EXTENSION').some(c => c.capacities.ACTIFS)).toBe(false);
  });

  it('la migration Patrimoine amorce exactement les offres Patrimoine du catalogue', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '../../prisma/migrations/20261001101600_patrimoine_pack_catalogue/migration.sql'),
      'utf8'
    );
    const patrimoineCodes = [
      ...PATRIMOINE_PACKS,
      EXTENSION.BIENS_10,
      'SETUP_PATRIMOINE_ESSENTIEL',
      'SETUP_PATRIMOINE_PRO'
    ];
    for (const item of DEFAULT_CATALOG) {
      if (!patrimoineCodes.includes(item.code)) continue;
      expect(sql).toContain(`'${item.code}', '${item.kind}'`);
      expect(sql).toMatch(
        new RegExp(`'${item.code}', '${item.kind}', '[^']*', [^\\n]*, ${item.monthlyPrice}, ${item.setupPrice},`)
      );
    }
  });

  it('annuel = 11 mensualites', () => {
    expect(ANNUAL_MONTHS).toBe(11);
    expect(cycleMultiplier('ANNUAL')).toBe(11);
    expect(cycleMultiplier('MONTHLY')).toBe(1);
  });
});

describe('Exemples chiffres du plan', () => {
  it('Agence, 180 logements -> 29 900 + 8 blocs = 41 900', () => {
    const r = estimateMonthly({ packs: [PACK.AGENCE], lots: 180 }, catalog);
    expect(r.extensions[EXTENSION.LOTS_10]).toBe(8);
    expect(r.subtotal).toBe(41_900);
    expect(r.subtotal).toBe(site.agence(180));
  });

  it('Syndic, 2 coproprietes et 140 lots -> 55 900', () => {
    const r = estimateMonthly({ packs: [PACK.SYNDIC], copros: 2, lots: 140 }, catalog);
    expect(r.subtotal).toBe(55_900);
    expect(r.subtotal).toBe(site.syndic(2, 140));
  });

  it('Agence + Syndic, 320 lots (reserve unique de 200) -> 94 810', () => {
    const r = estimateMonthly({ packs: [PACK.AGENCE, PACK.SYNDIC], lots: 320 }, catalog);
    // 29 900 + 49 900 - 10 % x 29 900 (2 990) + 12 blocs x 1 500 (18 000)
    expect(r.comboDiscount).toBe(2_990);
    expect(r.extensions[EXTENSION.LOTS_10]).toBe(12);
    expect(r.subtotal).toBe(94_810);
  });

  it('Promoteur, 3 chantiers et 120 lots -> 189 900', () => {
    const r = estimateMonthly({ packs: [PACK.PROMOTEUR], chantiers: 3, lots: 120 }, catalog);
    expect(r.subtotal).toBe(189_900);
    expect(r.subtotal).toBe(site.promoteur(3, 120));
  });

  it('Integre -> 249 900 par mois, 2 748 900 par an', () => {
    const r = estimateMonthly({ packs: [PACK.INTEGRE], chantiers: 3, copros: 3, lots: 300 }, catalog);
    expect(r.subtotal).toBe(249_900);
    expect(annualPrice(r.subtotal)).toBe(2_748_900);
    const annual = scaleLinesForCycle(r.lines, 'ANNUAL');
    expect(annual.reduce((s, l) => s + l.amount, 0)).toBe(2_748_900);
  });

  it('prorata : +3 blocs le 16 d’un mois de 30 jours -> 2 250', () => {
    const periodStart = new Date('2026-09-01T00:00:00Z');
    const periodEnd = new Date('2026-10-01T00:00:00Z');
    const added = new Date('2026-09-16T10:30:00Z');
    expect(prorataDays(periodStart, periodEnd, added)).toEqual({ remainingDays: 15, totalDays: 30 });
    expect(prorateAmount(3 * 1_500, periodStart, periodEnd, added)).toBe(2_250);
  });
});

describe('Prix du lot supplementaire (D5)', () => {
  it('150 FCFA/lot (bloc 1 500) avec Agence ou Syndic', () => {
    expect(resolveUnitMonthlyPrice(lotsBlock, { heldPacks: [PACK.AGENCE], firstLotRank: 101 })).toBe(1_500);
    expect(resolveUnitMonthlyPrice(lotsBlock, { heldPacks: [PACK.SYNDIC], firstLotRank: 401 })).toBe(1_500);
    expect(resolveUnitMonthlyPrice(lotsBlock, { heldPacks: [PACK.AGENCE, PACK.SYNDIC], firstLotRank: 301 })).toBe(
      1_500
    );
  });

  it('100 FCFA/lot des que l’agence detient Promoteur ou Integre', () => {
    expect(resolveUnitMonthlyPrice(lotsBlock, { heldPacks: [PACK.PROMOTEUR], firstLotRank: 151 })).toBe(1_000);
    expect(resolveUnitMonthlyPrice(lotsBlock, { heldPacks: [PACK.INTEGRE], firstLotRank: 301 })).toBe(1_000);
    expect(resolveUnitMonthlyPrice(lotsBlock, { heldPacks: [PACK.AGENCE, PACK.PROMOTEUR], firstLotRank: 401 })).toBe(
      1_000
    );
  });

  it('75 FCFA/lot pour l’Agence seule au-dela du 300e lot', () => {
    expect(resolveUnitMonthlyPrice(lotsBlock, { heldPacks: [PACK.AGENCE], firstLotRank: 291 })).toBe(1_500);
    expect(resolveUnitMonthlyPrice(lotsBlock, { heldPacks: [PACK.AGENCE], firstLotRank: 301 })).toBe(750);
  });

  it('Agence seule : identique a agencePrice du site de 0 a 600 logements (multiples de 10)', () => {
    for (let units = 0; units <= 600; units += 10) {
      expect(estimateMonthly({ packs: [PACK.AGENCE], lots: units }, catalog).subtotal).toBe(site.agence(units));
    }
  });

  it('Promoteur et Integre : identiques au site (multiples de 10)', () => {
    for (let lots = 100; lots <= 500; lots += 50) {
      expect(estimateMonthly({ packs: [PACK.PROMOTEUR], chantiers: 4, lots }, catalog).subtotal).toBe(
        site.promoteur(4, lots)
      );
      expect(estimateMonthly({ packs: [PACK.INTEGRE], chantiers: 5, copros: 4, lots }, catalog).subtotal).toBe(
        site.integre(5, 4, lots)
      );
    }
  });

  it('chantier supplementaire : 40 000, 35 000 avec l’Integre', () => {
    expect(resolveUnitMonthlyPrice(chantier, { heldPacks: [PACK.PROMOTEUR] })).toBe(40_000);
    expect(resolveUnitMonthlyPrice(chantier, { heldPacks: [PACK.INTEGRE] })).toBe(35_000);
  });

  it('decoupe un achat de blocs par palier de prix (un element par palier)', () => {
    // Agence seule, 100 lots inclus + 15 blocs deja achetes (250 lots) : +10 blocs.
    expect(planExtensionUnits(lotsBlock, [PACK.AGENCE], 10, 250)).toEqual([
      { quantity: 5, unitMonthlyPrice: 1_500, firstLotRank: 251 },
      { quantity: 5, unitMonthlyPrice: 750, firstLotRank: 301 }
    ]);
    expect(planExtensionUnits(chantier, [PACK.INTEGRE], 2)).toEqual([{ quantity: 2, unitMonthlyPrice: 35_000 }]);
  });

  it('extensions reservees aux packs concernes', () => {
    expect(isExtensionAllowed(copro, [PACK.AGENCE])).toBe(false);
    expect(isExtensionAllowed(copro, [PACK.SYNDIC])).toBe(true);
    expect(isExtensionAllowed(chantier, [PACK.INTEGRE])).toBe(true);
    expect(isExtensionAllowed(chantier, [PACK.SYNDIC])).toBe(false);
    expect(isExtensionAllowed(lotsBlock, [PACK.AGENCE])).toBe(true);
    expect(isExtensionAllowed(lotsBlock, [])).toBe(false);
  });
});

describe('Remise de combinaison (D6)', () => {
  it('10 % du prix de base du pack le moins cher, des 2 packs', () => {
    expect(computeComboDiscount([29_900], 10)).toBe(0);
    expect(computeComboDiscount([29_900, 49_900], 10)).toBe(2_990);
    expect(computeComboDiscount([49_900, 149_900, 29_900], 10)).toBe(2_990);
  });

  it('extensions exclues de la base de remise', () => {
    const r = computeRecurringLines(
      [
        { code: PACK.SYNDIC, kind: 'PACK', name: 'Syndic', quantity: 1, unitMonthlyPrice: 49_900 },
        { code: PACK.PROMOTEUR, kind: 'PACK', name: 'Promoteur', quantity: 1, unitMonthlyPrice: 149_900 },
        { code: EXTENSION.COPRO, kind: 'EXTENSION', name: 'Copro', quantity: 5, unitMonthlyPrice: 10_000 }
      ],
      { comboDiscountPercent: 10 }
    );
    expect(r.comboDiscount).toBe(4_990);
    expect(r.subtotal).toBe(49_900 + 149_900 + 50_000 - 4_990);
    expect(r.lines.find(l => l.kind === 'DISCOUNT')).toMatchObject({ amount: -4_990, code: PACK.SYNDIC });
  });

  it('la remise commerciale d’un element s’applique a sa ligne ; les SETUP sont hors recurrent', () => {
    const items = [
      {
        code: PACK.AGENCE,
        kind: 'PACK' as const,
        name: 'Agence',
        quantity: 1,
        unitMonthlyPrice: 29_900,
        discountPercent: 50
      },
      {
        code: 'SETUP_AGENCE',
        kind: 'SETUP' as const,
        name: 'Mise en route',
        quantity: 1,
        unitMonthlyPrice: 0,
        unitSetupPrice: 100_000
      }
    ];
    expect(computeRecurringLines(items, { comboDiscountPercent: 10 }).subtotal).toBe(14_950);
    expect(computeSetupLines(items)).toEqual([
      expect.objectContaining({ kind: 'SETUP', amount: 100_000, code: 'SETUP_AGENCE' })
    ]);
  });
});

describe('Depassement facture (D4, BILL_OVERAGE)', () => {
  it('Agence seule, 320 lots pour une reserve de 300 : 20 lots a 75 FCFA', () => {
    const lines = computeOverageLines({
      capacityKey: 'LOTS',
      limit: 300,
      used: 320,
      heldPacks: [PACK.AGENCE],
      extension: lotsBlock
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ quantity: 20, unitPrice: 75, amount: 1_500 });
  });

  it('Agence seule, reserve 100, 310 lots : 200 a 150 puis 10 a 75', () => {
    const lines = computeOverageLines({
      capacityKey: 'LOTS',
      limit: 100,
      used: 310,
      heldPacks: [PACK.AGENCE],
      extension: lotsBlock
    });
    expect(lines.map(l => [l.quantity, l.unitPrice])).toEqual([
      [200, 150],
      [10, 75]
    ]);
    expect(lines.reduce((s, l) => s + l.amount, 0) + 29_900).toBe(site.agence(310));
  });

  it('coproprietes et chantiers au prix de l’extension', () => {
    expect(
      computeOverageLines({
        capacityKey: 'COPROPRIETES',
        limit: 2,
        used: 4,
        heldPacks: [PACK.SYNDIC],
        extension: copro
      })[0]
    ).toMatchObject({ quantity: 2, unitPrice: 10_000, amount: 20_000 });
    expect(
      computeOverageLines({
        capacityKey: 'CHANTIERS',
        limit: 3,
        used: 4,
        heldPacks: [PACK.INTEGRE],
        extension: chantier
      })[0]
    ).toMatchObject({ quantity: 1, amount: 35_000 });
  });

  it('rien dans le plafond', () => {
    expect(
      computeOverageLines({
        capacityKey: 'LOTS',
        limit: 100,
        used: 100,
        heldPacks: [PACK.AGENCE],
        extension: lotsBlock
      })
    ).toEqual([]);
  });
});

describe('Pack Patrimoine (biens detenus, lot P1)', () => {
  const essentiel = byCode(PACK.PATRIMOINE_ESSENTIEL);
  const pro = byCode(PACK.PATRIMOINE_PRO);
  const biensBlock = byCode(EXTENSION.BIENS_10);

  it('Essentiel, 25 biens -> 9 900 + 2 blocs (19 800)', () => {
    const r = estimateMonthly({ packs: [PACK.PATRIMOINE_ESSENTIEL], biens: 25 }, catalog);
    expect(r.extensions[EXTENSION.BIENS_10]).toBe(2);
    expect(r.subtotal).toBe(9_900 + 2 * 9_900);
  });

  it('Pro, 150 biens -> 29 900 + 50 x 299 (depassement facture, pas de bloc vendu)', () => {
    const r = estimateMonthly({ packs: [PACK.PATRIMOINE_PRO], biens: 150 }, catalog);
    expect(r.extensions[EXTENSION.BIENS_10]).toBeUndefined();
    expect(r.subtotal).toBe(29_900 + 50 * 299);
  });

  it('Agence + Patrimoine Essentiel -> remise de combinaison de 990 (10 % du moins cher)', () => {
    const r = estimateMonthly({ packs: [PACK.AGENCE, PACK.PATRIMOINE_ESSENTIEL] }, catalog);
    expect(r.comboDiscount).toBe(990);
    expect(r.subtotal).toBe(29_900 + 9_900 - 990);
  });

  it('Promoteur + Patrimoine Essentiel -> remise de combinaison de 990 (10 % du moins cher)', () => {
    const r = estimateMonthly({ packs: [PACK.PROMOTEUR, PACK.PATRIMOINE_ESSENTIEL] }, catalog);
    expect(r.comboDiscount).toBe(990);
    expect(r.subtotal).toBe(149_900 + 9_900 - 990);
  });

  it('bloc de biens : 990 FCFA/bien avec l’Essentiel, 299 FCFA le bien en depassement du Pro', () => {
    expect(resolveUnitMonthlyPrice(biensBlock, { heldPacks: [PACK.PATRIMOINE_ESSENTIEL] })).toBe(9_900);
    expect(resolveUnitMonthlyPrice(biensBlock, { heldPacks: [PACK.PATRIMOINE_PRO] })).toBe(2_990);
    expect(isExtensionAllowed(biensBlock, [PACK.PATRIMOINE_ESSENTIEL])).toBe(true);
    expect(isExtensionAllowed(biensBlock, [PACK.PATRIMOINE_PRO])).toBe(false);
  });

  it('depassement BIENS_DETENUS : libelle et prix unitaire selon le pack detenu', () => {
    const essentielOverage = computeOverageLines({
      capacityKey: 'BIENS_DETENUS',
      limit: 10,
      used: 13,
      heldPacks: [PACK.PATRIMOINE_ESSENTIEL],
      extension: biensBlock
    });
    expect(essentielOverage).toEqual([
      {
        kind: 'OVERAGE',
        label: "Dépassement : 3 bien(s) détenu(s) au-delà de l'abonnement",
        capacityKey: 'BIENS_DETENUS',
        quantity: 3,
        unitPrice: 990,
        amount: 2_970
      }
    ]);

    const proOverage = computeOverageLines({
      capacityKey: 'BIENS_DETENUS',
      limit: 100,
      used: 150,
      heldPacks: [PACK.PATRIMOINE_PRO],
      extension: biensBlock
    });
    expect(proOverage).toEqual([
      {
        kind: 'OVERAGE',
        label: "Dépassement : 50 bien(s) détenu(s) au-delà de l'abonnement",
        capacityKey: 'BIENS_DETENUS',
        quantity: 50,
        unitPrice: 299,
        amount: 14_950
      }
    ]);
  });

  it('Essentiel et Pro : capacites BIENS_DETENUS de la grille', () => {
    expect(essentiel).toMatchObject({ monthlyPrice: 9_900, setupPrice: 30_000, capacities: { BIENS_DETENUS: 10 } });
    expect(pro).toMatchObject({ monthlyPrice: 29_900, setupPrice: 90_000, capacities: { BIENS_DETENUS: 100 } });
  });
});

describe('TVA (D9) et periodes', () => {
  it('TVA 18 % en ligne separee', () => {
    const totals = finalizeInvoice([{ kind: 'PACK', label: 'Agence', quantity: 1, unitPrice: 29_900, amount: 29_900 }]);
    expect(totals.amountExclTax).toBe(29_900);
    expect(totals.taxAmount).toBe(5_382);
    expect(totals.amountTotal).toBe(35_282);
    expect(totals.lines[totals.lines.length - 1]).toMatchObject({ kind: 'TAX', amount: 5_382, label: 'TVA 18 %' });
  });

  it('un total negatif (avoir) ne porte pas de TVA', () => {
    const totals = finalizeInvoice([{ kind: 'CREDIT', label: 'Avoir', quantity: 1, unitPrice: -1000, amount: -1000 }]);
    expect(totals.taxAmount).toBe(0);
    expect(totals.lines).toHaveLength(1);
  });

  it('prorata : jour d’ajout compris, borne a la periode', () => {
    const start = new Date('2026-02-01T00:00:00Z');
    const end = new Date('2026-03-01T00:00:00Z');
    expect(prorataDays(start, end, new Date('2026-02-01T08:00:00Z'))).toEqual({ remainingDays: 28, totalDays: 28 });
    expect(prorataDays(start, end, new Date('2026-03-05T00:00:00Z')).remainingDays).toBe(0);
    expect(prorataDays(start, end, new Date('2026-01-15T00:00:00Z')).remainingDays).toBe(28);
    expect(prorateAmount(29_900, start, end, new Date('2026-02-15T00:00:00Z'))).toBe(Math.round((29_900 * 14) / 28));
  });

  it('fin de periode : +1 mois ou +12 mois', () => {
    expect(addBillingPeriod(new Date('2026-09-25T00:00:00Z'), 'MONTHLY').toISOString()).toBe(
      '2026-10-25T00:00:00.000Z'
    );
    expect(addBillingPeriod(new Date('2026-09-25T00:00:00Z'), 'ANNUAL').toISOString()).toBe('2027-09-25T00:00:00.000Z');
  });
});
