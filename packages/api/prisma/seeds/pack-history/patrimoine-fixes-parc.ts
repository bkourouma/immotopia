/**
 * PATRIMOINE (correctifs, 2e vague) : le parc.
 *
 *  - Pro : douze biens ne font pas un patrimoine de trois ans. On l'étoffe d'une quinzaine de
 *    biens aux statuts variés (loué, vacant publié à la location, à vendre, promesse en cours,
 *    réservé, en travaux, vendu), chacun avec son actif, ses valorisations, sa détention, son
 *    profil fiscal, ses hypothèses de rendement, son historique de statut, ses charges et ses
 *    assurances. Les baux de ces biens sont écrits par `patrimoine-fixes-locatif.ts`.
 *  - Essentiel : plafonné par BIENS_DETENUS (10), il ne reçoit AUCUN bien ; on varie les statuts
 *    des biens existants (terrain publié à la vente, chantier en cours sur un bien loué).
 *  - Les deux : prêts sur davantage de biens, polices d'assurance en majorité en cours.
 *
 * Idempotent par bloc (référence interne du bien, numéro de police, prêteur par bien).
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { addDays, between, monthsAgo, pick } from './types';
import type { PatProperty, PatState } from './patrimoine-extras-state';

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;
const atMonth = (d: Date, day: number): Date => new Date(d.getFullYear(), d.getMonth(), day, 10, 0, 0, 0);

export const PACK_HELD_LIMIT = { PATRIMOINE_ESSENTIEL: 10, PATRIMOINE_PRO: 100 } as const;

// ------------------------------------------------------------------ catalogue des nouveaux biens (Pro)

type Mode = 'RENT' | 'SALE' | 'NONE';

export interface NewProperty {
  ref: string;
  type: Prisma.PropertyCreateManyInput['propertyType'];
  title: string;
  zone: string;
  address: string;
  surface: number;
  rooms: number | null;
  value: number;
  growth: number;
  acqAgo: number;
  built: boolean;
  status: 'RENTED' | 'AVAILABLE' | 'UNDER_OFFER' | 'RESERVED' | 'SOLD';
  mode: Mode;
  published: boolean;
  /** Loyer de mise en location (biens vacants publiés à la location). */
  askingRent?: number;
  /** Chantier en cours / prévu / terminé sur le bien. */
  works?: { title: string; estimated: number; actual: number | null; status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' };
  /** Cession : mois écoulés depuis la vente et prix obtenu (statut SOLD, actif sorti). */
  soldAgo?: number;
  soldPrice?: number;
}

export const NEW_PROPERTIES: readonly NewProperty[] = [
  {
    ref: 'APP-RIV3',
    type: 'APPARTEMENT',
    title: 'Appartement F4 Riviera 3',
    zone: 'Cocody',
    address: 'Riviera 3, près du carrefour Duncan, Abidjan',
    surface: 105,
    rooms: 4,
    value: 78_000_000,
    growth: 0.05,
    acqAgo: 44,
    built: true,
    status: 'RENTED',
    mode: 'RENT',
    published: false
  },
  {
    ref: 'APP-ZONE4',
    type: 'APPARTEMENT',
    title: 'Appartement F3 Marcory Zone 4C',
    zone: 'Marcory',
    address: 'Zone 4C, rue du Canal, Marcory, Abidjan',
    surface: 82,
    rooms: 3,
    value: 52_000_000,
    growth: 0.045,
    acqAgo: 52,
    built: true,
    status: 'RENTED',
    mode: 'RENT',
    published: false
  },
  {
    ref: 'STU-BIETRY',
    type: 'STUDIO',
    title: 'Studio meublé Marcory Biétry',
    zone: 'Marcory',
    address: 'Biétry, boulevard de Marseille, Abidjan',
    surface: 34,
    rooms: 1,
    value: 21_000_000,
    growth: 0.04,
    acqAgo: 30,
    built: true,
    status: 'RENTED',
    mode: 'RENT',
    published: false
  },
  {
    ref: 'VIL-ANGRE',
    type: 'MAISON_VILLA',
    title: 'Villa duplex Angré Château',
    zone: 'Cocody',
    address: 'Angré Château, Abidjan',
    surface: 260,
    rooms: 6,
    value: 135_000_000,
    growth: 0.055,
    acqAgo: 60,
    built: true,
    status: 'RENTED',
    mode: 'RENT',
    published: false
  },
  {
    ref: 'BOU-DANGA',
    type: 'BOUTIQUE_COMMERCIAL',
    title: 'Boutique Cocody Danga',
    zone: 'Cocody',
    address: 'Danga, boulevard Latrille, Abidjan',
    surface: 48,
    rooms: 2,
    value: 44_000_000,
    growth: 0.05,
    acqAgo: 38,
    built: true,
    status: 'RENTED',
    mode: 'RENT',
    published: false
  },
  {
    ref: 'BUR-MARCORY',
    type: 'BUREAU',
    title: 'Bureaux Marcory Zone 3',
    zone: 'Marcory',
    address: 'Zone 3, rue Louis Lumière, Marcory, Abidjan',
    surface: 140,
    rooms: 5,
    value: 98_000_000,
    growth: 0.04,
    acqAgo: 48,
    built: true,
    status: 'RENTED',
    mode: 'RENT',
    published: false
  },
  {
    ref: 'APP-BASSAM',
    type: 'APPARTEMENT',
    title: 'Appartement vue mer Grand-Bassam',
    zone: 'Grand-Bassam',
    address: 'Quartier France, Grand-Bassam',
    surface: 90,
    rooms: 3,
    value: 46_000_000,
    growth: 0.06,
    acqAgo: 26,
    built: true,
    status: 'AVAILABLE',
    mode: 'RENT',
    published: true,
    askingRent: 380_000
  },
  {
    ref: 'VIL-BASSAM',
    type: 'MAISON_VILLA',
    title: 'Villa de plage Grand-Bassam Moossou',
    zone: 'Grand-Bassam',
    address: 'Moossou, Grand-Bassam',
    surface: 300,
    rooms: 6,
    value: 150_000_000,
    growth: 0.06,
    acqAgo: 58,
    built: true,
    status: 'AVAILABLE',
    mode: 'SALE',
    published: true
  },
  {
    ref: 'TER-BINGER',
    type: 'TERRAIN',
    title: 'Terrain de 800 m² Bingerville',
    zone: 'Bingerville',
    address: 'Lotissement Cité Verte, Bingerville',
    surface: 800,
    rooms: null,
    value: 24_000_000,
    growth: 0.09,
    acqAgo: 46,
    built: false,
    status: 'AVAILABLE',
    mode: 'SALE',
    published: true
  },
  {
    ref: 'TER-ANYAMA',
    type: 'TERRAIN',
    title: 'Terrain de 2 000 m² Anyama',
    zone: 'Anyama',
    address: 'Route d’Alépé, Anyama',
    surface: 2000,
    rooms: null,
    value: 36_000_000,
    growth: 0.1,
    acqAgo: 64,
    built: false,
    status: 'UNDER_OFFER',
    mode: 'SALE',
    published: true
  },
  {
    ref: 'IMM-ABOBO',
    type: 'IMMEUBLE',
    title: 'Immeuble R+2 Abobo Avocatier',
    zone: 'Abobo',
    address: 'Avocatier, Abobo, Abidjan',
    surface: 420,
    rooms: 9,
    value: 125_000_000,
    growth: 0.045,
    acqAgo: 66,
    built: true,
    status: 'RENTED',
    mode: 'RENT',
    published: false
  },
  {
    ref: 'APP-PLATEAU',
    type: 'APPARTEMENT',
    title: 'Appartement F3 Plateau Dokui',
    zone: 'Plateau',
    address: 'Rue du Commerce, Le Plateau, Abidjan',
    surface: 95,
    rooms: 3,
    value: 88_000_000,
    growth: 0.045,
    acqAgo: 34,
    built: true,
    status: 'AVAILABLE',
    mode: 'RENT',
    published: false,
    works: {
      title: 'Rénovation complète : cuisine, sanitaires, peinture',
      estimated: 6_800_000,
      actual: null,
      status: 'IN_PROGRESS'
    }
  },
  {
    ref: 'ENT-YOP',
    type: 'ENTREPOT_INDUSTRIEL',
    title: 'Entrepôt de 450 m² Yopougon zone industrielle',
    zone: 'Yopougon',
    address: 'Zone industrielle de Yopougon, Abidjan',
    surface: 450,
    rooms: null,
    value: 85_000_000,
    growth: 0.04,
    acqAgo: 42,
    built: true,
    status: 'RENTED',
    mode: 'RENT',
    published: false
  },
  {
    ref: 'MAI-SONGON',
    type: 'MAISON_VILLA',
    title: 'Maison basse Songon Agban',
    zone: 'Songon',
    address: 'Agban, Songon',
    surface: 150,
    rooms: 4,
    value: 40_000_000,
    growth: 0.04,
    acqAgo: 56,
    built: true,
    status: 'SOLD',
    mode: 'NONE',
    published: false,
    soldAgo: 5,
    soldPrice: 43_500_000
  },
  {
    ref: 'DUP-2PLAT',
    type: 'DUPLEX_TRIPLEX',
    title: 'Duplex Deux-Plateaux Aghien',
    zone: 'Cocody',
    address: 'Deux-Plateaux Aghien, Abidjan',
    surface: 200,
    rooms: 5,
    value: 112_000_000,
    growth: 0.05,
    acqAgo: 20,
    built: true,
    status: 'RESERVED',
    mode: 'SALE',
    published: true
  }
];

const ASSET_LEGAL: Record<string, string> = { TERRAIN: 'ACD' };

const INSURERS: ReadonlyArray<{ name: string; code: string }> = [
  { name: 'NSIA Assurances', code: 'NSIA' },
  { name: 'Saham Assurance Côte d’Ivoire', code: 'SAHAM' },
  { name: 'Allianz Côte d’Ivoire', code: 'ALZ' },
  { name: 'Sunu Assurances CI', code: 'SUNU' }
];
const LENDERS = ['Société Générale Côte d’Ivoire', 'NSIA Banque', 'Ecobank Côte d’Ivoire', 'Bank of Africa CI', 'BNI'];

const valueAtGrowth = (cost: number, growth: number, acqAgo: number, m: number): number =>
  roundTo(cost * Math.pow(1 + growth, Math.max(0, acqAgo - m) / 12), 100_000);

function annuityPayment(capital: number, annualRatePercent: number, termMonths: number): number {
  const r = annualRatePercent / 1200;
  return r === 0 ? capital / termMonths : (capital * r) / (1 - Math.pow(1 + r, -termMonths));
}

function remainingCapital(capital: number, annualRatePercent: number, termMonths: number, paid: number): number {
  const r = annualRatePercent / 1200;
  if (paid >= termMonths) return 0;
  if (r === 0) return capital * (1 - paid / termMonths);
  const growth = Math.pow(1 + r, termMonths);
  return (capital * (growth - Math.pow(1 + r, paid))) / (growth - 1);
}

// ------------------------------------------------------------------ nouveaux biens (Pro)

/** Étoffe le parc du Pack Pro. Renvoie le nombre de biens créés. */
export async function seedNewProperties(s: PatState): Promise<number> {
  const { prisma, tenantId, adminUserId, end, rng, log } = s.ctx;
  if (!s.isPro) return 0;
  const existing = new Set(s.properties.map(p => p.ref));
  const todo = NEW_PROPERTIES.filter(p => !existing.has(`PAT-${p.ref}`));
  if (todo.length === 0) return 0;
  const room = PACK_HELD_LIMIT.PATRIMOINE_PRO - s.properties.length;
  const specs = todo.slice(0, Math.max(0, room));

  const entities = await prisma.holdingEntity.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
    select: { id: true }
  });
  const staff = s.staff;
  const who = (): string => pick(rng, staff);

  const properties: Prisma.PropertyCreateManyInput[] = [];
  const assets: Prisma.AssetCreateManyInput[] = [];
  const valuations: Prisma.AssetValuationCreateManyInput[] = [];
  const holdings: Prisma.PropertyHoldingCreateManyInput[] = [];
  const taxes: Prisma.PropertyTaxProfileCreateManyInput[] = [];
  const yields: Prisma.PropertyYieldAssumptionCreateManyInput[] = [];
  const history: Prisma.PropertyStatusHistoryUncheckedCreateInput[] = [];
  const expenses: Prisma.PropertyExpenseCreateManyInput[] = [];
  const works: Prisma.WorkProgramCreateManyInput[] = [];

  for (const spec of specs) {
    const id = randomUUID();
    const assetId = randomUUID();
    const cost = roundTo(spec.value / Math.pow(1 + spec.growth, spec.acqAgo / 12), 100_000);
    const acqDate = monthsAgo(end, spec.acqAgo);
    const sold = spec.status === 'SOLD';
    const soldDate = sold ? monthsAgo(end, spec.soldAgo ?? 5) : null;
    const price =
      spec.mode === 'RENT' && spec.askingRent ? spec.askingRent : sold ? (spec.soldPrice ?? spec.value) : spec.value;
    const published = spec.published;
    const availability =
      spec.status === 'AVAILABLE' ? (spec.works ? 'SOON_AVAILABLE' : 'AVAILABLE') : ('UNAVAILABLE' as const);
    properties.push({
      id,
      internalReference: `PAT-${spec.ref}`,
      propertyType: spec.type,
      ownershipType: 'TENANT',
      tenantId,
      title: spec.title,
      description: `${spec.title} — bien détenu en propre. Quartier ${spec.zone}.`,
      address: spec.address,
      locationZone: spec.zone,
      transactionModes: spec.mode === 'RENT' ? ['RENTAL'] : spec.mode === 'SALE' ? ['SALE'] : [],
      price,
      currency: 'XOF',
      surfaceArea: spec.surface,
      rooms: spec.rooms,
      status: spec.status,
      availability,
      isPublished: published,
      publishedAt: published ? monthsAgo(end, between(rng, 1, 3)) : null,
      createdAt: acqDate,
      updatedAt: end
    });
    assets.push({
      id: assetId,
      tenantId,
      name: spec.title,
      assetClass: 'REAL_ESTATE',
      status: sold ? 'DISPOSED' : 'ACTIVE',
      currency: 'XOF',
      acquisitionCost: cost,
      acquisitionDate: acqDate,
      disposedAt: soldDate,
      propertyId: id,
      details: { legalStatus: ASSET_LEGAL[spec.type] ?? pick(rng, ['TITRE_FONCIER', 'TITRE_FONCIER', 'ACD']) },
      detailsVersion: 2,
      createdByUserId: adminUserId,
      createdAt: acqDate
    });

    // Valorisations : acquisition, relevés annuels, dernier relevé (ou prix de cession).
    const points: number[] = [];
    for (let m = 36; m >= 12; m -= 12) if (m < spec.acqAgo) points.push(m);
    if (sold && spec.soldAgo) points.push(spec.soldAgo);
    else if (spec.acqAgo > 1) points.push(1);
    const allPoints = [spec.acqAgo, ...points].sort((a, b) => b - a);
    allPoints.forEach((m, k) => {
      const first = m === spec.acqAgo;
      const isSale = sold && m === spec.soldAgo;
      const expert = !first && !isSale && m === 1 && spec.ref.length % 3 === 0;
      const method = first ? 'MANUAL' : isSale ? 'MANUAL' : expert ? 'EXPERT_APPRAISAL' : 'MARKET_ESTIMATE';
      valuations.push({
        tenantId,
        propertyId: id,
        valuatedAt: first ? acqDate : monthsAgo(end, m),
        estimatedValue: first
          ? cost
          : isSale
            ? (spec.soldPrice ?? spec.value)
            : valueAtGrowth(cost, spec.growth, spec.acqAgo, m),
        currency: 'XOF',
        acquisitionCost: k === 0 ? cost : null,
        acquisitionDate: k === 0 ? acqDate : null,
        method,
        source: isSale
          ? 'Prix de cession (acte de vente notarié)'
          : first
            ? 'Prix d’acquisition (acte notarié)'
            : expert
              ? 'Cabinet Expertim CI — rapport d’expertise'
              : 'Estimation de marché (comparables du quartier)',
        reliability: method === 'EXPERT_APPRAISAL' || isSale || first ? 'HIGH' : 'MEDIUM',
        reliabilityReasons: []
      });
    });

    // Détention.
    if (entities.length > 0) {
      const owner = entities[(spec.ref.length + spec.acqAgo) % entities.length];
      holdings.push({
        tenantId,
        propertyId: id,
        entityId: owner.id,
        sharePercent: 100,
        effectiveFrom: acqDate,
        updatedByUserId: adminUserId
      });
    }

    // Fiscalité et hypothèses (fractions).
    taxes.push({
      tenantId,
      propertyId: id,
      country: 'CI',
      builtStatus: spec.built ? 'BUILT' : 'UNBUILT',
      occupancy: spec.status === 'RENTED' ? 'RENTED' : 'VACANT',
      declaredRentalValue: null,
      updatedByUserId: adminUserId
    });
    const land = spec.type === 'TERRAIN';
    yields.push({
      tenantId,
      propertyId: id,
      years: 10,
      valueGrowthRate: Number(spec.growth.toFixed(4)),
      rentGrowthRate: land ? 0 : 0.03,
      expenseGrowthRate: land ? 0.02 : 0.04,
      vacancyRate: land
        ? 0
        : ['BUREAU', 'ENTREPOT_INDUSTRIEL', 'BOUTIQUE_COMMERCIAL'].includes(spec.type)
          ? 0.08
          : 0.05,
      updatedByUserId: adminUserId
    });

    // Historique de statut (les mouvements de bail sont ajoutés par le bloc locatif).
    history.push(
      {
        propertyId: id,
        tenantId,
        previousStatus: null,
        newStatus: 'DRAFT',
        changedByUserId: who(),
        notes: 'Bien ajouté au patrimoine.',
        createdAt: acqDate
      },
      {
        propertyId: id,
        tenantId,
        previousStatus: 'DRAFT',
        newStatus: 'AVAILABLE',
        changedByUserId: who(),
        notes: 'Bien vérifié et disponible.',
        createdAt: addDays(acqDate, 3)
      }
    );
    if (spec.status === 'UNDER_OFFER' || spec.status === 'RESERVED') {
      history.push({
        propertyId: id,
        tenantId,
        previousStatus: 'AVAILABLE',
        newStatus: spec.status,
        changedByUserId: who(),
        notes:
          spec.status === 'UNDER_OFFER'
            ? 'Offre d’achat reçue : promesse de vente en cours de signature.'
            : 'Réservation d’un acquéreur avec versement d’un acompte.',
        createdAt: monthsAgo(end, 1)
      });
    }
    if (sold && soldDate) {
      history.push({
        propertyId: id,
        tenantId,
        previousStatus: 'AVAILABLE',
        newStatus: 'SOLD',
        changedByUserId: who(),
        notes: 'Cession signée chez le notaire : bien sorti du patrimoine.',
        createdAt: soldDate
      });
    }

    // Charges : taxe foncière annuelle, entretien, eau-électricité du bien vacant.
    for (let year = end.getFullYear() - 3; year <= end.getFullYear(); year++) {
      const due = new Date(year, 2, 31, 10, 0, 0, 0);
      if (due < monthsAgo(end, 36) || due > end || due < acqDate) continue;
      if (soldDate && due > soldDate) continue;
      expenses.push({
        tenantId,
        propertyId: id,
        category: 'PROPERTY_TAX',
        label: `Taxe foncière ${year}`,
        amount: roundTo(spec.value * 0.0015, 1_000),
        currency: 'XOF',
        paidAt: due,
        paymentMethod: 'BANK_TRANSFER',
        supplierName: 'Direction générale des impôts',
        recurrence: 'ONE_OFF'
      });
    }
    if (spec.built && !sold) {
      const jobs = [
        { label: 'Dépannage plomberie', supplier: 'Plomberie Moderne d’Abobo', min: 25_000, max: 90_000 },
        { label: 'Entretien des climatiseurs', supplier: 'Froid Service CI', min: 40_000, max: 150_000 },
        { label: 'Réparation électrique', supplier: 'Élec-Habitat Cocody', min: 30_000, max: 120_000 },
        { label: 'Remise en peinture partielle', supplier: 'Peinture Pro Abidjan', min: 80_000, max: 260_000 }
      ];
      const n = between(rng, 2, 4);
      for (let e = 0; e < n; e++) {
        const job = pick(rng, jobs);
        expenses.push({
          tenantId,
          propertyId: id,
          category: 'ROUTINE_MAINTENANCE',
          label: job.label,
          amount: roundTo(between(rng, job.min, job.max), 5_000),
          currency: 'XOF',
          paidAt: atMonth(monthsAgo(end, between(rng, 1, Math.min(34, spec.acqAgo - 1))), between(rng, 8, 25)),
          paymentMethod: pick(rng, ['CASH', 'MOBILE_MONEY'] as const),
          supplierName: job.supplier,
          recurrence: 'ONE_OFF'
        });
      }
      if (spec.status === 'AVAILABLE') {
        for (let m = 1; m <= 3; m++) {
          expenses.push({
            tenantId,
            propertyId: id,
            category: 'UTILITIES',
            label: 'Eau et électricité (logement vacant)',
            amount: between(rng, 8, 22) * 1_000,
            currency: 'XOF',
            paidAt: atMonth(monthsAgo(end, m), 18),
            paymentMethod: 'MOBILE_MONEY',
            supplierName: 'CIE / SODECI',
            recurrence: 'ONE_OFF'
          });
        }
      }
    }
    if (['APPARTEMENT', 'STUDIO', 'DUPLEX_TRIPLEX'].includes(spec.type) && !sold) {
      expenses.push({
        tenantId,
        propertyId: id,
        category: 'CONDO_FEES',
        label: 'Charges de copropriété',
        amount: roundTo(between(rng, 25_000, 45_000), 1_000),
        currency: 'XOF',
        paidAt: atMonth(monthsAgo(end, Math.min(36, spec.acqAgo)), 10),
        paymentMethod: 'MOBILE_MONEY',
        supplierName: `Syndic ${spec.zone}`,
        recurrence: 'MONTHLY'
      });
    }

    // Chantier.
    if (spec.works) {
      const planned = monthsAgo(end, spec.works.status === 'COMPLETED' ? 9 : 2);
      works.push({
        tenantId,
        propertyId: id,
        title: spec.works.title,
        description: 'Travaux confiés à l’entreprise Bâtiment Plus Cocody, suivi hebdomadaire par la gestionnaire.',
        estimatedCost: spec.works.estimated,
        actualCost: spec.works.actual,
        currency: 'XOF',
        plannedDate: planned,
        completedDate: spec.works.status === 'COMPLETED' ? addDays(planned, 40) : null,
        status: spec.works.status,
        isCapitalized: true
      });
    }
  }

  await prisma.$transaction(async tx => {
    await tx.property.createMany({ data: properties });
    await tx.asset.createMany({ data: assets });
    await tx.assetValuation.createMany({ data: valuations });
    await tx.propertyHolding.createMany({ data: holdings });
    await tx.propertyTaxProfile.createMany({ data: taxes });
    await tx.propertyYieldAssumption.createMany({ data: yields });
    await tx.propertyStatusHistory.createMany({ data: history });
    await tx.propertyExpense.createMany({ data: expenses });
    await tx.workProgram.createMany({ data: works });
  });
  log(`patrimoine-correctifs : ${specs.length} bien(s) ajouté(s) au parc, ${expenses.length} charge(s).`);
  return specs.length;
}

// ------------------------------------------------------------------ Essentiel : statuts variés

/**
 * Essentiel : pas de bien supplémentaire (plafond BIENS_DETENUS). On fait varier les statuts :
 * le terrain est publié à la vente ; un chantier de ravalement tourne sur un bien loué.
 */
export async function seedEssentielStatuses(s: PatState): Promise<void> {
  const { prisma, tenantId, end, rng, log } = s.ctx;
  if (s.isPro) return;
  let changed = 0;

  const terrain = s.properties.find(p => p.type === 'TERRAIN');
  if (terrain && terrain.status === 'AVAILABLE') {
    const row = await prisma.property.findUnique({
      where: { id: terrain.id },
      select: { isPublished: true, price: true }
    });
    if (row && !row.isPublished) {
      await prisma.property.update({
        where: { id: terrain.id },
        data: {
          isPublished: true,
          publishedAt: monthsAgo(end, 2),
          transactionModes: ['SALE'],
          price: row.price ?? 18_000_000
        }
      });
      await prisma.propertyStatusHistory.create({
        data: {
          propertyId: terrain.id,
          tenantId,
          previousStatus: 'AVAILABLE',
          newStatus: 'AVAILABLE',
          changedByUserId: pick(rng, s.staff),
          notes: 'Terrain publié à la vente sur le catalogue de l’agence.',
          createdAt: monthsAgo(end, 2)
        }
      });
      changed += 1;
    }
  }

  const target = s.properties.find(p => p.ref === 'PAT-IMM-YOP') ?? s.properties.find(p => p.type === 'IMMEUBLE');
  if (
    target &&
    !(await prisma.workProgram.findFirst({ where: { tenantId, propertyId: target.id, status: 'IN_PROGRESS' } }))
  ) {
    await prisma.workProgram.create({
      data: {
        tenantId,
        propertyId: target.id,
        title: 'Ravalement de façade et réfection des parties communes',
        description: 'Chantier mené en site occupé : les logements restent loués pendant les travaux.',
        estimatedCost: 5_400_000,
        currency: 'XOF',
        plannedDate: monthsAgo(end, 2),
        status: 'IN_PROGRESS',
        isCapitalized: true
      }
    });
    changed += 1;
  }
  if (changed > 0) log(`patrimoine-correctifs : ${changed} statut(s) de bien varié(s) (Essentiel).`);
}

// ------------------------------------------------------------------ prêts

/**
 * Porte la part de biens financés à ~60 % (Essentiel) / ~50 % (Pro) : des prêts sur des biens
 * loués (DSCR et LTV calculables) et un prêt soldé. Idempotent : un bien déjà financé est ignoré,
 * et le bloc s'arrête dès que la cible est atteinte.
 */
export async function seedMoreLoans(s: PatState): Promise<void> {
  const { prisma, tenantId, adminUserId, end, rng, log } = s.ctx;
  const props = await prisma.property.findMany({
    where: { tenantId },
    select: { id: true, internalReference: true, title: true, propertyType: true, status: true }
  });
  const loans = await prisma.propertyLoan.findMany({ where: { tenantId }, select: { propertyId: true, status: true } });
  const financed = new Set(loans.filter(l => l.propertyId).map(l => l.propertyId as string));
  const target = Math.ceil(props.length * (s.isPro ? 0.5 : 0.6));
  if (financed.size >= target) return;

  const assets = await prisma.asset.findMany({
    where: { tenantId, propertyId: { not: null } },
    select: { propertyId: true, acquisitionCost: true, acquisitionDate: true }
  });
  const assetOf = new Map(assets.map(a => [a.propertyId as string, a]));
  const leased = new Set(
    (
      await prisma.rentalLease.findMany({
        where: { tenant_id: tenantId, status: 'ACTIVE' },
        select: { property_id: true }
      })
    ).map(l => l.property_id)
  );

  const candidates = props
    .filter(p => !financed.has(p.id) && p.propertyType !== 'TERRAIN' && p.status !== 'SOLD' && leased.has(p.id))
    .sort((a, b) => Number(assetOf.get(b.id)?.acquisitionCost ?? 0) - Number(assetOf.get(a.id)?.acquisitionCost ?? 0));

  let added = 0;
  for (const p of candidates) {
    if (financed.size + added >= target) break;
    const asset = assetOf.get(p.id);
    const cost = Number(asset?.acquisitionCost ?? 0);
    const acq = asset?.acquisitionDate;
    if (!cost || !acq) continue;
    const capital = roundTo(cost * (0.35 + rng() * 0.2), 500_000);
    const rate = roundTo(7.2 + rng() * 2.8, 0.1);
    const termMonths = pick(rng, [120, 144, 180, 204, 240]);
    const acqMonths = Math.max(1, Math.round((end.getTime() - acq.getTime()) / 2_629_800_000));
    const startAgo = Math.min(acqMonths, between(rng, 8, 54));
    const start = new Date(end.getFullYear(), end.getMonth() - startAgo, 1, 10);
    const monthly = Math.round(annuityPayment(capital, rate, termMonths));
    const remaining = Math.round(remainingCapital(capital, rate, termMonths, startAgo));
    await prisma.propertyLoan.create({
      data: {
        tenantId,
        propertyId: p.id,
        lender: LENDERS[(added + p.title.length) % LENDERS.length],
        capitalAmount: capital,
        remainingCapital: remaining,
        interestRate: rate,
        monthlyPayment: monthly,
        currency: 'XOF',
        startDate: start,
        endDate: new Date(start.getFullYear(), start.getMonth() + termMonths, 1, 10),
        status: 'ACTIVE'
      }
    });
    added += 1;
  }

  // Un prêt soldé par anticipation (statut CLOSED), pour que le filtre ne soit pas vide.
  if (!loans.some(l => l.status === 'CLOSED')) {
    const old =
      props.find(
        p => !financed.has(p.id) && p.propertyType !== 'TERRAIN' && p.status !== 'SOLD' && !leased.has(p.id)
      ) ?? props[props.length - 1];
    const asset = old ? assetOf.get(old.id) : undefined;
    if (old && asset?.acquisitionDate && Number(asset.acquisitionCost ?? 0) > 0) {
      const capital = roundTo(Number(asset.acquisitionCost) * 0.25, 500_000);
      const start = monthsAgo(end, 70);
      await prisma.propertyLoan.create({
        data: {
          tenantId,
          propertyId: old.id,
          lender: LENDERS[1],
          capitalAmount: capital,
          remainingCapital: 0,
          interestRate: 8.5,
          monthlyPayment: Math.round(annuityPayment(capital, 8.5, 48)),
          currency: 'XOF',
          startDate: start,
          endDate: monthsAgo(end, 22),
          status: 'CLOSED'
        }
      });
      added += 1;
    }
  }
  if (added > 0) log(`patrimoine-correctifs : ${added} prêt(s) ajouté(s) (biens financés visés : ${target}).`);
  void adminUserId;
}

// ------------------------------------------------------------------ assurances

/**
 * Rééquilibre les polices : ajoute à chaque bien assurable une responsabilité civile
 * propriétaire et, pour les biens loués, une garantie des loyers impayés, toutes en cours
 * (anniversaires étalés sur les douze derniers mois). L'historique des renouvellements échus
 * reste : il devient « quelques polices échues » au milieu de polices en cours.
 */
export async function seedActivePolicies(s: PatState): Promise<void> {
  const { prisma, tenantId, adminUserId, end, rng, log } = s.ctx;
  const props = await prisma.property.findMany({
    where: { tenantId, status: { not: 'SOLD' } },
    select: { id: true, propertyType: true, title: true, internalReference: true },
    orderBy: { internalReference: 'asc' }
  });
  const leased = new Set(
    (
      await prisma.rentalLease.findMany({
        where: { tenant_id: tenantId, status: 'ACTIVE' },
        select: { property_id: true }
      })
    ).map(l => l.property_id)
  );
  const policies = await prisma.insurancePolicy.findMany({
    where: { tenantId },
    select: { propertyId: true, coverageType: true, endDate: true, policyNumber: true }
  });
  let counter = policies.length;
  const rows: Prisma.InsurancePolicyCreateManyInput[] = [];
  const expenses: Prisma.PropertyExpenseCreateManyInput[] = [];
  const now = end.getTime();

  for (const [i, p] of props.entries()) {
    const own = policies.filter(x => x.propertyId === p.id);
    const hasActive = (type: string): boolean =>
      own.some(x => x.coverageType === type && x.endDate.getTime() > now + 20 * 86_400_000);
    const insurer = INSURERS[(i + 1) % INSURERS.length];
    const add = (
      type: 'MULTIRISK_HOME' | 'MULTIRISK_BUILDING' | 'OWNER_LIABILITY' | 'OTHER',
      ago: number,
      ratePerMille: number,
      note: string
    ): void => {
      counter += 1;
      const start = monthsAgo(end, ago);
      const premium = roundTo(Math.max(45_000, (between(rng, 30, 120) * 1_000_000 * ratePerMille) / 1000), 1_000);
      rows.push({
        id: randomUUID(),
        tenantId,
        propertyId: p.id,
        insurer: insurer.name,
        policyNumber: `${insurer.code}-${start.getFullYear()}-${String(9000 + counter).padStart(5, '0')}`,
        coverageType: type,
        startDate: start,
        endDate: monthsAgo(end, ago - 12),
        annualPremium: premium,
        currency: 'XOF',
        notes: note,
        createdByUserId: adminUserId,
        createdAt: start
      });
      expenses.push({
        tenantId,
        propertyId: p.id,
        category: 'INSURANCE',
        label: `Prime d’assurance ${insurer.name}`,
        amount: premium,
        currency: 'XOF',
        paidAt: addDays(start, 2),
        paymentMethod: 'BANK_TRANSFER',
        supplierName: insurer.name,
        recurrence: 'ONE_OFF'
      });
    };
    if (!hasActive('MULTIRISK_HOME') && !hasActive('MULTIRISK_BUILDING') && p.propertyType !== 'TERRAIN') {
      add(
        p.propertyType === 'IMMEUBLE' ? 'MULTIRISK_BUILDING' : 'MULTIRISK_HOME',
        between(rng, 1, 11),
        2.5,
        'Multirisque : incendie, dégâts des eaux, catastrophes naturelles.'
      );
    }
    if (!hasActive('OWNER_LIABILITY')) {
      add('OWNER_LIABILITY', between(rng, 2, 11), 0.9, 'Responsabilité civile du propriétaire non occupant.');
    }
    if (leased.has(p.id) && !hasActive('OTHER')) {
      add('OTHER', between(rng, 1, 10), 1.8, 'Garantie des loyers impayés et des dégradations locatives.');
    }
  }
  if (rows.length === 0) return;
  await prisma.insurancePolicy.createMany({ data: rows });
  await prisma.propertyExpense.createMany({ data: expenses });
  log(`patrimoine-correctifs : ${rows.length} police(s) d'assurance en cours ajoutée(s).`);
}

export type { PatProperty };
