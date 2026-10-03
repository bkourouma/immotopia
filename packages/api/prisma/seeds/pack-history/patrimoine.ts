/**
 * Historique de gestion d'une agence de test PATRIMOINE (staging) : biens détenus
 * en propre, baux et loyers perçus, charges, travaux, assurances, documents,
 * valorisations dans le temps, dettes ; pour le Pro, en plus : entités de
 * détention (SCI, société, personne physique), actifs non immobiliers, profils
 * fiscaux, hypothèses de rendement, scénarios de projection, dossier foncier et
 * sinistres.
 *
 * Contrat : ./types.ts (dates relatives à ctx.end, rng seedé, idempotent, aucun
 * envoi sortant, tenantId partout). Tout est écrit dans UNE transaction : un
 * échec ne laisse rien derrière lui, donc le garde d'idempotence reste fiable.
 *
 * Passe par le vrai service seulement pour le registre des lots
 * (`reconcileLotActivationsTx`) ; le reste est écrit directement pour rester
 * déterministe et sans effet de bord (aucun e-mail, SMS ni écriture comptable).
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { parseAssetDetails } from '../../../src/lib/patrimoine/assets/asset-classes';
import { LAND_TRACKS } from '../../../src/lib/patrimoine/land/tracks';
import { addDays, between, monthsAgo, neutralizeOutbound, pick } from './types';
import type { HistoryContext, HistorySeeder } from './types';

export type PatrimoinePack = 'PATRIMOINE_ESSENTIEL' | 'PATRIMOINE_PRO';

/** Plafond BIENS_DETENUS de chaque pack (catalogue : lib/subscription/catalog.ts). */
const PACK_HELD_LIMIT: Record<PatrimoinePack, number> = { PATRIMOINE_ESSENTIEL: 10, PATRIMOINE_PRO: 100 };

// ------------------------------------------------------------------ catalogue de biens

interface PropertySpec {
  ref: string;
  type: Prisma.PropertyCreateManyInput['propertyType'];
  title: string;
  zone: string;
  address: string;
  surface: number;
  rooms: number | null;
  /** Valeur actuelle de référence (XOF), avant arrondi. */
  value: number;
  /** Croissance annuelle de la valeur (fraction). */
  growth: number;
  /** Ancienneté d'acquisition, en mois avant `end`, par profil. */
  acqAgo: { '6m': number; '3y': number };
  built: boolean;
  ownerOccupied?: boolean;
}

const PROPERTIES: readonly PropertySpec[] = [
  {
    ref: 'APP-ANGRE',
    type: 'APPARTEMENT',
    title: 'Appartement F4 Angré 8e tranche',
    zone: 'Cocody',
    address: 'Angré 8e tranche, Abidjan',
    surface: 110,
    rooms: 4,
    value: 85_000_000,
    growth: 0.05,
    acqAgo: { '6m': 40, '3y': 70 },
    built: true
  },
  {
    ref: 'VIL-RIVIERA',
    type: 'MAISON_VILLA',
    title: 'Villa Riviera Palmeraie',
    zone: 'Cocody',
    address: 'Riviera Palmeraie, Abidjan',
    surface: 320,
    rooms: 7,
    value: 160_000_000,
    growth: 0.06,
    acqAgo: { '6m': 36, '3y': 80 },
    built: true
  },
  {
    ref: 'STU-MARCORY',
    type: 'STUDIO',
    title: 'Studio Marcory Zone 4',
    zone: 'Marcory',
    address: 'Zone 4, rue Pierre et Marie Curie, Abidjan',
    surface: 32,
    rooms: 1,
    value: 22_000_000,
    growth: 0.04,
    acqAgo: { '6m': 24, '3y': 60 },
    built: true
  },
  {
    ref: 'TER-BASSAM',
    type: 'TERRAIN',
    title: 'Terrain de 1 200 m² Grand-Bassam',
    zone: 'Grand-Bassam',
    address: 'Route de la plage, Grand-Bassam',
    surface: 1200,
    rooms: null,
    value: 18_000_000,
    growth: 0.1,
    acqAgo: { '6m': 30, '3y': 75 },
    built: false
  },
  {
    ref: 'BUR-PLATEAU',
    type: 'BUREAU',
    title: 'Plateau de bureaux Avenue Noguès',
    zone: 'Plateau',
    address: 'Avenue Noguès, Le Plateau, Abidjan',
    surface: 180,
    rooms: 6,
    value: 140_000_000,
    growth: 0.04,
    acqAgo: { '6m': 40, '3y': 50 },
    built: true
  },
  {
    ref: 'BOU-TREICH',
    type: 'BOUTIQUE_COMMERCIAL',
    title: 'Boutique Avenue 16 Treichville',
    zone: 'Treichville',
    address: 'Avenue 16, Treichville, Abidjan',
    surface: 60,
    rooms: 2,
    value: 55_000_000,
    growth: 0.05,
    acqAgo: { '6m': 40, '3y': 64 },
    built: true
  },
  {
    ref: 'APP-2PLAT',
    type: 'APPARTEMENT',
    title: 'Appartement F3 Deux-Plateaux Vallons',
    zone: 'Cocody',
    address: 'Deux-Plateaux Vallons, Abidjan',
    surface: 85,
    rooms: 3,
    value: 60_000_000,
    growth: 0.05,
    acqAgo: { '6m': 40, '3y': 40 },
    built: true
  },
  {
    ref: 'IMM-YOP',
    type: 'IMMEUBLE',
    title: 'Immeuble R+3 Yopougon Millionnaire',
    zone: 'Yopougon',
    address: 'Millionnaire, Yopougon, Abidjan',
    surface: 640,
    rooms: 12,
    value: 210_000_000,
    growth: 0.045,
    acqAgo: { '6m': 40, '3y': 90 },
    built: true
  },
  {
    ref: 'VIL-BINGER',
    type: 'MAISON_VILLA',
    title: 'Villa basse Bingerville Cité Cocody',
    zone: 'Bingerville',
    address: 'Cité Cocody, Bingerville',
    surface: 210,
    rooms: 5,
    value: 95_000_000,
    growth: 0.05,
    acqAgo: { '6m': 40, '3y': 22 },
    built: true
  },
  {
    ref: 'ENT-VRIDI',
    type: 'ENTREPOT_INDUSTRIEL',
    title: 'Entrepôt de 600 m² zone industrielle de Vridi',
    zone: 'Port-Bouët',
    address: 'Zone industrielle de Vridi, Abidjan',
    surface: 600,
    rooms: null,
    value: 120_000_000,
    growth: 0.04,
    acqAgo: { '6m': 40, '3y': 16 },
    built: true
  },
  {
    ref: 'DUP-BONOUMIN',
    type: 'DUPLEX_TRIPLEX',
    title: 'Duplex familial Riviera Bonoumin',
    zone: 'Cocody',
    address: 'Riviera Bonoumin, Abidjan',
    surface: 240,
    rooms: 6,
    value: 130_000_000,
    growth: 0.055,
    acqAgo: { '6m': 40, '3y': 55 },
    built: true,
    ownerOccupied: true
  },
  {
    ref: 'APP-KOUMASSI',
    type: 'APPARTEMENT',
    title: 'Appartement F3 Koumassi Remblais',
    zone: 'Koumassi',
    address: 'Remblais, Koumassi, Abidjan',
    surface: 78,
    rooms: 3,
    value: 38_000_000,
    growth: 0.04,
    acqAgo: { '6m': 40, '3y': 12 },
    built: true
  }
];

interface LeaseSpec {
  propertyIdx: number;
  /** Début, en mois avant `end` (peut dépasser l'histoire). */
  startAgo: number;
  /** Dernier mois facturé, en mois avant `end` ; null = bail en cours. */
  endAgo: number | null;
  rent: number;
  /** Mauvais payeur : dernier mois en retard. */
  late?: boolean;
  /** Paiement partiel le mois dernier. */
  partial?: boolean;
}

const LEASES: Record<'6m' | '3y', readonly LeaseSpec[]> = {
  '6m': [
    { propertyIdx: 0, startAgo: 20, endAgo: null, rent: 450_000 },
    { propertyIdx: 1, startAgo: 14, endAgo: null, rent: 1_100_000, late: true },
    { propertyIdx: 2, startAgo: 4, endAgo: null, rent: 140_000 }
  ],
  '3y': [
    { propertyIdx: 0, startAgo: 50, endAgo: null, rent: 450_000 },
    { propertyIdx: 1, startAgo: 60, endAgo: 15, rent: 1_000_000 },
    { propertyIdx: 1, startAgo: 12, endAgo: null, rent: 1_150_000, late: true },
    { propertyIdx: 2, startAgo: 40, endAgo: null, rent: 140_000 },
    { propertyIdx: 4, startAgo: 30, endAgo: null, rent: 900_000, partial: true },
    { propertyIdx: 5, startAgo: 48, endAgo: 20, rent: 380_000 },
    { propertyIdx: 5, startAgo: 18, endAgo: null, rent: 420_000 },
    { propertyIdx: 6, startAgo: 36, endAgo: null, rent: 350_000 },
    { propertyIdx: 7, startAgo: 55, endAgo: null, rent: 1_500_000 },
    { propertyIdx: 8, startAgo: 18, endAgo: null, rent: 600_000 },
    { propertyIdx: 9, startAgo: 12, endAgo: null, rent: 850_000 },
    { propertyIdx: 11, startAgo: 8, endAgo: null, rent: 220_000 }
  ]
};

const RENTER_NAMES = [
  'Koffi Brou',
  'Aminata Traoré',
  "Jean-Marc N'Guessan",
  'Fatoumata Coulibaly',
  'Serge Kouadio',
  'Mariam Ouattara',
  'Yves Gnahoré',
  'Adjoua Konan',
  'Boubacar Diallo',
  'Estelle Akissi Yao',
  'Pharmacie Les Lagunes',
  'Société Ivoire Services'
];

const INSURERS: ReadonlyArray<{ name: string; code: string }> = [
  { name: 'NSIA Assurances', code: 'NSIA' },
  { name: 'Saham Assurance Côte d’Ivoire', code: 'SAHAM' },
  { name: 'Allianz Côte d’Ivoire', code: 'ALZ' },
  { name: 'Sunu Assurances CI', code: 'SUNU' }
];

const LENDERS = ['Société Générale Côte d’Ivoire', 'NSIA Banque', 'Ecobank Côte d’Ivoire', 'Bank of Africa CI', 'BNI'];

const MAINTENANCE: ReadonlyArray<{ label: string; supplier: string; min: number; max: number }> = [
  { label: 'Dépannage plomberie', supplier: 'Plomberie Moderne d’Abobo', min: 25_000, max: 90_000 },
  { label: 'Entretien des climatiseurs', supplier: 'Froid Service CI', min: 40_000, max: 150_000 },
  { label: 'Remise en peinture partielle', supplier: 'Peinture Pro Abidjan', min: 80_000, max: 260_000 },
  { label: 'Réparation électrique', supplier: 'Élec-Habitat Cocody', min: 30_000, max: 120_000 },
  { label: 'Entretien jardin et parties communes', supplier: 'Jardins du Golfe', min: 20_000, max: 60_000 },
  { label: 'Désinsectisation et dératisation', supplier: 'Hygiène Plus CI', min: 35_000, max: 80_000 }
];

// ------------------------------------------------------------------ utilitaires

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;
const iso = (d: Date): string => d.toISOString().slice(0, 10);
const monthKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const endOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth() + 1, 0, 18, 0, 0, 0);
const atMonth = (d: Date, day: number): Date => new Date(d.getFullYear(), d.getMonth(), day, 10, 0, 0, 0);

/** Valeur d'un bien `m` mois avant `end` (croissance composée depuis l'acquisition). */
function valueAt(spec: PropertySpec, cost: number, acqAgo: number, m: number): number {
  return roundTo(cost * Math.pow(1 + spec.growth, Math.max(0, acqAgo - m) / 12), 100_000);
}

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

/** Dates de valorisation (mois avant `end`) : acquisition si dans l'histoire, puis annuelles, puis le mois dernier. */
function valuationPoints(months: number, acqAgo: number): number[] {
  const points = new Set<number>();
  for (let m = months; m >= 12; m -= 12) points.add(m);
  points.add(1);
  const list = [...points].filter(m => m < acqAgo).sort((a, b) => b - a);
  if (acqAgo <= months) list.unshift(acqAgo);
  else if (list[0] !== months) list.unshift(months);
  return list;
}

// ------------------------------------------------------------------ générateur

export async function seedPatrimoineHistoryForPack(ctx: HistoryContext, pack: PatrimoinePack): Promise<void> {
  const { prisma, tenantId, adminUserId, profile, months, end, rng, log } = ctx;
  const isPro = pack === 'PATRIMOINE_PRO';

  // Idempotence : un tenant qui porte déjà des biens ou des actifs n'est pas retouché.
  const [existingAssets, existingProperties] = await Promise.all([
    prisma.asset.count({ where: { tenantId } }),
    prisma.property.count({ where: { tenantId } })
  ]);
  if (existingAssets > 0 || existingProperties > 0) {
    log(`patrimoine : ${existingProperties} bien(s) et ${existingAssets} actif(s) déjà présents, rien à faire.`);
    return;
  }

  neutralizeOutbound();

  const propertyCount = Math.min(profile === '6m' ? 4 : 12, PACK_HELD_LIMIT[pack]);
  const specs = PROPERTIES.slice(0, propertyCount);
  const leaseSpecs = LEASES[profile].filter(l => l.propertyIdx < propertyCount);
  const startOfHistory = ctx.start;

  // ---- identifiants
  const propertyIds = specs.map(() => randomUUID());
  const assetIds = specs.map(() => randomUUID());
  const acqAgo = specs.map(s => s.acqAgo[profile]);
  const costs = specs.map((s, i) => {
    const raw = s.value / Math.pow(1 + s.growth, acqAgo[i] / 12);
    return roundTo(raw, 100_000);
  });

  // ---- données par table
  const properties: Prisma.PropertyCreateManyInput[] = [];
  const assets: Prisma.AssetCreateManyInput[] = [];
  const valuations: Prisma.AssetValuationCreateManyInput[] = [];
  const users: Prisma.UserCreateManyInput[] = [];
  const clients: Prisma.TenantClientCreateManyInput[] = [];
  const leases: Prisma.RentalLeaseCreateManyInput[] = [];
  const installments: Prisma.RentalInstallmentCreateManyInput[] = [];
  const installmentItems: Prisma.RentalInstallmentItemCreateManyInput[] = [];
  const payments: Prisma.RentalPaymentCreateManyInput[] = [];
  const allocations: Prisma.RentalPaymentAllocationCreateManyInput[] = [];
  const expenses: Prisma.PropertyExpenseCreateManyInput[] = [];
  const works: Prisma.WorkProgramCreateManyInput[] = [];
  const policies: Prisma.InsurancePolicyCreateManyInput[] = [];
  const documents: Prisma.PatrimonyDocumentCreateManyInput[] = [];
  const loans: Prisma.PropertyLoanCreateManyInput[] = [];

  const leased = new Set(leaseSpecs.filter(l => l.endAgo === null).map(l => l.propertyIdx));

  // ---- biens, actifs immobiliers, valorisations
  specs.forEach((spec, i) => {
    const acqDate = monthsAgo(end, acqAgo[i]);
    const isLeased = leased.has(i);
    properties.push({
      id: propertyIds[i],
      internalReference: `PAT-${spec.ref}`,
      propertyType: spec.type,
      ownershipType: 'TENANT',
      tenantId,
      title: spec.title,
      description: `${spec.title} — bien détenu en propre${spec.ownerOccupied ? ', occupé par la famille' : ''}. Quartier ${spec.zone}.`,
      address: spec.address,
      locationZone: spec.zone,
      transactionModes: spec.type === 'TERRAIN' ? ['SALE'] : isLeased ? ['RENTAL'] : [],
      price: valueAt(spec, costs[i], acqAgo[i], 1),
      currency: 'XOF',
      surfaceArea: spec.surface,
      rooms: spec.rooms,
      status: isLeased ? 'RENTED' : 'AVAILABLE',
      availability: isLeased ? 'UNAVAILABLE' : 'AVAILABLE',
      isPublished: false,
      createdAt: acqDate,
      updatedAt: end
    });
    assets.push({
      id: assetIds[i],
      tenantId,
      name: spec.title,
      assetClass: 'REAL_ESTATE',
      status: 'ACTIVE',
      currency: 'XOF',
      acquisitionCost: costs[i],
      acquisitionDate: acqDate,
      propertyId: propertyIds[i],
      details: { legalStatus: spec.type === 'TERRAIN' ? 'ACD' : pick(rng, ['TITRE_FONCIER', 'TITRE_FONCIER', 'ACD']) },
      detailsVersion: 2,
      createdByUserId: adminUserId,
      createdAt: acqDate
    });
    const points = valuationPoints(months, acqAgo[i]);
    points.forEach((m, k) => {
      const first = k === 0;
      const expert = !first && m === 1 && i % 4 === 0;
      const method = first && acqAgo[i] <= months ? 'MANUAL' : expert ? 'EXPERT_APPRAISAL' : 'MARKET_ESTIMATE';
      valuations.push({
        tenantId,
        propertyId: propertyIds[i],
        valuatedAt: m === acqAgo[i] ? acqDate : monthsAgo(end, m),
        estimatedValue: m === acqAgo[i] ? costs[i] : valueAt(spec, costs[i], acqAgo[i], m),
        currency: 'XOF',
        acquisitionCost: first ? costs[i] : null,
        acquisitionDate: first ? acqDate : null,
        method,
        source:
          method === 'EXPERT_APPRAISAL'
            ? 'Cabinet Expertim CI — rapport d’expertise'
            : method === 'MANUAL'
              ? 'Prix d’acquisition (acte notarié)'
              : 'Estimation de marché (comparables du quartier)',
        reliability: method === 'EXPERT_APPRAISAL' ? 'HIGH' : 'MEDIUM',
        reliabilityReasons: []
      });
    });
  });

  // ---- locataires et baux, échéances, paiements
  const renterIds: string[] = [];
  const clientIds: string[] = [];
  leaseSpecs.forEach((_lease, n) => {
    const userId = randomUUID();
    const clientId = randomUUID();
    renterIds.push(userId);
    clientIds.push(clientId);
    users.push({
      id: userId,
      email: `locataire${n + 1}.${tenantId.slice(0, 8)}@packs.immotopia.test`,
      fullName: RENTER_NAMES[n % RENTER_NAMES.length],
      isActive: true
    });
    clients.push({
      id: clientId,
      userId,
      tenantId,
      clientType: 'RENTER',
      details: { source: 'pack-history' }
    });
  });

  leaseSpecs.forEach((lease, n) => {
    const spec = specs[lease.propertyIdx];
    const leaseId = randomUUID();
    const leaseNumber = `PAT-BAIL-${String(n + 1).padStart(3, '0')}`;
    const startDate = monthsAgo(end, lease.startAgo);
    const lastBilled = lease.endAgo ?? 0;
    const service = roundTo(lease.rent * 0.06, 5_000);
    leases.push({
      id: leaseId,
      tenant_id: tenantId,
      property_id: propertyIds[lease.propertyIdx],
      primary_renter_client_id: clientIds[n],
      lease_number: leaseNumber,
      status: lease.endAgo === null ? 'ACTIVE' : 'ENDED',
      start_date: startDate,
      end_date: lease.endAgo === null ? null : endOfMonth(monthsAgo(end, lease.endAgo)),
      move_in_date: startDate,
      move_out_date: lease.endAgo === null ? null : endOfMonth(monthsAgo(end, lease.endAgo)),
      billing_frequency: 'MONTHLY',
      due_day_of_month: 5,
      currency: 'FCFA',
      rent_amount: lease.rent,
      service_charge_amount: service,
      security_deposit_amount: lease.rent * 2,
      notes: `Bail ${spec.type === 'BUREAU' || spec.type === 'BOUTIQUE_COMMERCIAL' ? 'commercial' : 'd’habitation'} — ${spec.title}`,
      created_by_user_id: adminUserId,
      created_at: startDate
    });

    for (let i = Math.min(lease.startAgo, months); i >= lastBilled; i--) {
      const monthStart = monthsAgo(end, i);
      const due = atMonth(monthStart, 5);
      const total = lease.rent + service;
      let status: 'PAID' | 'PARTIAL' | 'OVERDUE' | 'DUE' = 'PAID';
      let paidAmount = total;
      let paidAt: Date | null = addDays(due, rng() < 0.18 ? between(rng, 3, 15) : between(rng, 0, 2));
      if (lease.late && i === 1) {
        status = 'OVERDUE';
        paidAmount = 0;
        paidAt = null;
      } else if (lease.late && i === 2) {
        paidAt = addDays(due, 21);
      } else if (lease.partial && i === 1) {
        status = 'PARTIAL';
        paidAmount = roundTo(total * 0.6, 5_000);
        paidAt = addDays(due, 9);
      } else if (i === 0) {
        if (due.getTime() <= end.getTime() && rng() < 0.6) {
          paidAt = new Date(Math.min(end.getTime(), addDays(due, between(rng, 0, 4)).getTime()));
        } else {
          status = 'DUE';
          paidAmount = 0;
          paidAt = null;
        }
      }
      if (paidAt && paidAt.getTime() > end.getTime()) paidAt = end;

      const installmentId = randomUUID();
      installments.push({
        id: installmentId,
        tenant_id: tenantId,
        lease_id: leaseId,
        period_year: monthStart.getFullYear(),
        period_month: monthStart.getMonth() + 1,
        due_date: due,
        status,
        currency: 'FCFA',
        amount_rent: lease.rent,
        amount_service: service,
        amount_paid: paidAmount,
        paid_at: status === 'PAID' ? paidAt : null,
        created_at: monthStart
      });
      installmentItems.push(
        {
          tenant_id: tenantId,
          installment_id: installmentId,
          charge_type: 'RENT',
          label: 'Loyer',
          amount: lease.rent,
          currency: 'FCFA'
        },
        {
          tenant_id: tenantId,
          installment_id: installmentId,
          charge_type: 'SERVICE_CHARGE',
          label: 'Charges locatives',
          amount: service,
          currency: 'FCFA'
        }
      );
      if (paidAmount > 0 && paidAt) {
        const paymentId = randomUUID();
        const method = pick(rng, ['MOBILE_MONEY', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CASH'] as const);
        payments.push({
          id: paymentId,
          tenant_id: tenantId,
          lease_id: leaseId,
          renter_client_id: clientIds[n],
          method,
          status: 'SUCCESS',
          currency: 'FCFA',
          amount: paidAmount,
          mm_operator: method === 'MOBILE_MONEY' ? pick(rng, ['ORANGE', 'MTN', 'WAVE'] as const) : null,
          idempotency_key: `pat-hist:${leaseNumber}:${monthKey(monthStart)}`,
          initiated_at: paidAt,
          succeeded_at: paidAt,
          created_by_user_id: adminUserId,
          created_at: paidAt
        });
        allocations.push({
          tenant_id: tenantId,
          payment_id: paymentId,
          installment_id: installmentId,
          amount: paidAmount,
          currency: 'FCFA',
          created_at: paidAt
        });
      }
    }
  });

  // ---- assurances (une police courante par bien bâti, renouvelées chaque année)
  interface PolicyRow {
    id: string;
    propertyIdx: number;
    start: Date;
    end: Date;
  }
  const policyRows: PolicyRow[] = [];
  let policyCounter = 0;
  specs.forEach((spec, i) => {
    if (!spec.built) return;
    // La police du 3e bien expire dans environ un mois : de quoi alimenter les alertes d'échéance.
    const k = i === 2 ? 11 : ((i * 3) % 11) + 1;
    const insurer = INSURERS[i % INSURERS.length];
    for (let a = k; a - 12 <= months && a <= acqAgo[i]; a += 12) {
      policyCounter += 1;
      const start = monthsAgo(end, a);
      const stop = monthsAgo(end, a - 12);
      const premium = roundTo(valueAt(spec, costs[i], acqAgo[i], a) * 0.0025, 1_000);
      const id = randomUUID();
      policyRows.push({ id, propertyIdx: i, start, end: stop });
      policies.push({
        id,
        tenantId,
        propertyId: propertyIds[i],
        insurer: insurer.name,
        policyNumber: `${insurer.code}-${start.getFullYear()}-${String(policyCounter).padStart(5, '0')}`,
        coverageType: spec.type === 'IMMEUBLE' ? 'MULTIRISK_BUILDING' : i === 5 ? 'OWNER_LIABILITY' : 'MULTIRISK_HOME',
        startDate: start,
        endDate: stop,
        annualPremium: premium,
        currency: 'XOF',
        createdByUserId: adminUserId,
        createdAt: start
      });
      if (start.getTime() >= startOfHistory.getTime() && start.getTime() <= end.getTime()) {
        expenses.push({
          tenantId,
          propertyId: propertyIds[i],
          category: 'INSURANCE',
          label: `Prime d’assurance ${insurer.name}`,
          amount: premium,
          currency: 'XOF',
          paidAt: addDays(start, 2),
          paymentMethod: 'BANK_TRANSFER',
          supplierName: insurer.name,
          recurrence: 'ONE_OFF'
        });
      }
    }
  });

  // ---- charges courantes
  const histStartAgo = months;
  specs.forEach((spec, i) => {
    const from = Math.min(histStartAgo, acqAgo[i]);
    // Taxe foncière : exigible le 31 mars de chaque année.
    for (let year = startOfHistory.getFullYear(); year <= end.getFullYear(); year++) {
      const due = new Date(year, 2, 31, 10, 0, 0, 0);
      if (due.getTime() < startOfHistory.getTime() || due.getTime() > end.getTime()) continue;
      if (due.getTime() < monthsAgo(end, acqAgo[i]).getTime()) continue;
      expenses.push({
        tenantId,
        propertyId: propertyIds[i],
        category: 'PROPERTY_TAX',
        label: `Taxe foncière ${year}`,
        amount: roundTo(
          valueAt(spec, costs[i], acqAgo[i], Math.round((end.getTime() - due.getTime()) / 2_629_800_000)) * 0.0015,
          1_000
        ),
        currency: 'XOF',
        paidAt: due,
        paymentMethod: 'BANK_TRANSFER',
        supplierName: 'Direction générale des impôts',
        recurrence: 'ONE_OFF'
      });
    }
    // Charges de copropriété : une récurrence mensuelle ouverte par lot en copropriété.
    if (['APPARTEMENT', 'STUDIO', 'DUPLEX_TRIPLEX'].includes(spec.type)) {
      expenses.push({
        tenantId,
        propertyId: propertyIds[i],
        category: 'CONDO_FEES',
        label: 'Charges de copropriété',
        amount: roundTo(between(rng, 25_000, 45_000), 1_000),
        currency: 'XOF',
        paidAt: atMonth(monthsAgo(end, from), 10),
        paymentMethod: 'MOBILE_MONEY',
        supplierName: `Syndic ${spec.zone}`,
        recurrence: 'MONTHLY'
      });
    }
    // Entretien courant : quelques interventions par an sur les biens loués.
    const isLeased = leaseSpecs.some(l => l.propertyIdx === i);
    if (isLeased || spec.ownerOccupied) {
      const events = Math.max(1, Math.round((Math.min(months, acqAgo[i]) / 12) * between(rng, 2, 4)));
      for (let e = 0; e < events; e++) {
        const m = between(rng, 1, Math.max(1, Math.min(months, acqAgo[i]) - 1));
        const job = pick(rng, MAINTENANCE);
        expenses.push({
          tenantId,
          propertyId: propertyIds[i],
          category: 'ROUTINE_MAINTENANCE',
          label: job.label,
          amount: roundTo(between(rng, job.min, job.max), 5_000),
          currency: 'XOF',
          paidAt: atMonth(monthsAgo(end, m), between(rng, 8, 25)),
          paymentMethod: pick(rng, ['CASH', 'MOBILE_MONEY'] as const),
          supplierName: job.supplier,
          recurrence: 'ONE_OFF'
        });
      }
    }
  });
  // Vacance locative : eau et électricité à la charge du propriétaire entre deux baux.
  leaseSpecs.forEach((lease, n) => {
    const next = leaseSpecs.find(
      (l, m) => m !== n && l.propertyIdx === lease.propertyIdx && l.startAgo < (lease.endAgo ?? -1)
    );
    if (lease.endAgo === null || !next) return;
    for (let m = lease.endAgo - 1; m > next.startAgo; m--) {
      if (m > months) continue;
      expenses.push({
        tenantId,
        propertyId: propertyIds[lease.propertyIdx],
        category: 'UTILITIES',
        label: 'Eau et électricité (logement vacant)',
        amount: between(rng, 8, 20) * 1_000,
        currency: 'XOF',
        paidAt: atMonth(monthsAgo(end, m), 18),
        paymentMethod: 'MOBILE_MONEY',
        supplierName: 'CIE / SODECI',
        recurrence: 'ONE_OFF'
      });
    }
  });

  // ---- travaux (chantiers) et dépenses associées
  interface WorkSpec {
    propertyIdx: number;
    title: string;
    estimated: number;
    actual: number | null;
    plannedAgo: number;
    completedAgo: number | null;
    status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';
    capitalized: boolean;
    supplier: string;
  }
  const workSpecs: readonly WorkSpec[] =
    profile === '6m'
      ? [
          {
            propertyIdx: 0,
            title: 'Rénovation de la cuisine et des sanitaires',
            estimated: 3_200_000,
            actual: null,
            plannedAgo: 2,
            completedAgo: null,
            status: 'IN_PROGRESS',
            capitalized: true,
            supplier: 'Bâtiment Plus Cocody'
          }
        ]
      : [
          {
            propertyIdx: 1,
            title: 'Reprise de la toiture et de l’étanchéité',
            estimated: 4_500_000,
            actual: 4_900_000,
            plannedAgo: 28,
            completedAgo: 27,
            status: 'COMPLETED',
            capitalized: true,
            supplier: 'Étanchéité Ivoire'
          },
          {
            propertyIdx: 3,
            title: 'Bornage et clôture du terrain',
            estimated: 2_400_000,
            actual: 2_600_000,
            plannedAgo: 11,
            completedAgo: 10,
            status: 'COMPLETED',
            capitalized: true,
            supplier: 'Cabinet de géomètres Kouamé'
          },
          {
            propertyIdx: 5,
            title: 'Réaménagement de la boutique pour le nouveau locataire',
            estimated: 2_200_000,
            actual: 2_000_000,
            plannedAgo: 19,
            completedAgo: 18,
            status: 'COMPLETED',
            capitalized: true,
            supplier: 'Bâtiment Plus Cocody'
          },
          {
            propertyIdx: 7,
            title: 'Ravalement de façade et peinture de l’immeuble',
            estimated: 8_000_000,
            actual: 8_600_000,
            plannedAgo: 9,
            completedAgo: 8,
            status: 'COMPLETED',
            capitalized: true,
            supplier: 'Peinture Pro Abidjan'
          },
          {
            propertyIdx: 0,
            title: 'Remplacement des climatiseurs',
            estimated: 1_800_000,
            actual: 1_700_000,
            plannedAgo: 14,
            completedAgo: 14,
            status: 'COMPLETED',
            capitalized: false,
            supplier: 'Froid Service CI'
          },
          {
            propertyIdx: 8,
            title: 'Clôture et portail électrique',
            estimated: 3_500_000,
            actual: null,
            plannedAgo: 2,
            completedAgo: null,
            status: 'IN_PROGRESS',
            capitalized: true,
            supplier: 'Métal Concept CI'
          },
          {
            propertyIdx: 9,
            title: 'Mise aux normes électriques de l’entrepôt',
            estimated: 5_000_000,
            actual: null,
            plannedAgo: -2,
            completedAgo: null,
            status: 'PLANNED',
            capitalized: false,
            supplier: 'Élec-Habitat Cocody'
          }
        ];
  for (const w of workSpecs) {
    if (w.propertyIdx >= propertyCount) continue;
    const planned = atMonth(monthsAgo(end, w.plannedAgo), 12);
    const completed = w.completedAgo === null ? null : atMonth(monthsAgo(end, w.completedAgo), 25);
    works.push({
      id: randomUUID(),
      tenantId,
      propertyId: propertyIds[w.propertyIdx],
      title: w.title,
      description: `Travaux confiés à ${w.supplier}.`,
      estimatedCost: w.estimated,
      actualCost: w.actual,
      currency: 'XOF',
      plannedDate: planned,
      completedDate: completed,
      status: w.status,
      isCapitalized: w.capitalized,
      createdAt: planned
    });
    if (w.status === 'COMPLETED' && w.actual !== null && completed) {
      expenses.push({
        tenantId,
        propertyId: propertyIds[w.propertyIdx],
        category: w.capitalized ? 'RENOVATION' : 'ROUTINE_MAINTENANCE',
        label: w.title,
        amount: w.actual,
        currency: 'XOF',
        paidAt: completed,
        isCapitalized: w.capitalized,
        paymentMethod: 'BANK_TRANSFER',
        supplierName: w.supplier,
        recurrence: 'ONE_OFF'
      });
    }
  }

  // ---- dettes
  interface LoanSpec {
    propertyIdx: number;
    capital: number;
    rate: number;
    years: number;
    startAgo: number;
  }
  const loanSpecsAll: readonly LoanSpec[] =
    profile === '6m'
      ? [{ propertyIdx: 0, capital: 55_000_000, rate: 8.2, years: 20, startAgo: 38 }]
      : [
          { propertyIdx: 0, capital: 55_000_000, rate: 8.2, years: 20, startAgo: 60 },
          { propertyIdx: 1, capital: 90_000_000, rate: 7.9, years: 15, startAgo: 70 },
          { propertyIdx: 7, capital: 120_000_000, rate: 8.5, years: 12, startAgo: 80 },
          { propertyIdx: 8, capital: 60_000_000, rate: 8.0, years: 15, startAgo: 22 },
          { propertyIdx: 6, capital: 30_000_000, rate: 9.0, years: 7, startAgo: 90 }
        ];
  const loanSpecs = loanSpecsAll
    .filter(l => l.propertyIdx < propertyCount)
    .slice(0, isPro ? 5 : profile === '6m' ? 1 : 2);
  loanSpecs.forEach((l, n) => {
    const term = l.years * 12;
    const paid = Math.min(term, l.startAgo);
    const closed = paid >= term;
    loans.push({
      tenantId,
      propertyId: propertyIds[l.propertyIdx],
      lender: LENDERS[n % LENDERS.length],
      capitalAmount: l.capital,
      remainingCapital: Math.round(remainingCapital(l.capital, l.rate, term, paid)),
      interestRate: l.rate,
      monthlyPayment: Math.round(annuityPayment(l.capital, l.rate, term)),
      currency: 'XOF',
      startDate: monthsAgo(end, l.startAgo),
      endDate: monthsAgo(end, l.startAgo - term),
      status: closed ? 'CLOSED' : 'ACTIVE',
      createdAt: monthsAgo(end, l.startAgo)
    });
  });

  // ---- documents
  const docUrl = (slug: string): string => `/uploads/patrimoine/seed/${tenantId}/${slug}.pdf`;
  specs.forEach((spec, i) => {
    const base = { tenantId, propertyId: propertyIds[i], assetId: assetIds[i] };
    documents.push({
      ...base,
      title: `Titre foncier — ${spec.title}`,
      type: 'TITLE_DEED',
      fileUrl: docUrl(`${spec.ref}-titre`),
      createdAt: monthsAgo(end, Math.min(acqAgo[i], months))
    });
    const policy = policyRows.filter(p => p.propertyIdx === i).sort((a, b) => b.start.getTime() - a.start.getTime())[0];
    if (policy) {
      documents.push({
        ...base,
        title: `Attestation d’assurance ${policy.start.getFullYear()} — ${spec.title}`,
        type: 'INSURANCE',
        fileUrl: docUrl(`${spec.ref}-assurance`),
        expiresAt: policy.end,
        createdAt: policy.start
      });
    }
    if (isPro) {
      documents.push({
        ...base,
        title: `Acte de vente notarié — ${spec.title}`,
        type: 'NOTARIAL_DEED',
        fileUrl: docUrl(`${spec.ref}-acte`),
        createdAt: monthsAgo(end, Math.min(acqAgo[i], months))
      });
      documents.push({
        ...base,
        title: `Avis de taxe foncière ${end.getFullYear() - (end.getMonth() < 3 ? 1 : 0)} — ${spec.title}`,
        type: 'TAX_DOCUMENT',
        fileUrl: docUrl(`${spec.ref}-taxe`),
        createdAt: monthsAgo(end, 3)
      });
      if (spec.built) {
        documents.push({
          ...base,
          title: `Diagnostic technique — ${spec.title}`,
          type: 'TECHNICAL_DIAGNOSIS',
          fileUrl: docUrl(`${spec.ref}-diagnostic`),
          expiresAt: monthsAgo(end, -between(rng, 6, 30)),
          createdAt: monthsAgo(end, between(rng, 2, 10))
        });
      }
      if (i === 1 || i === 7) {
        documents.push({
          ...base,
          title: `Permis de construire — ${spec.title}`,
          type: 'BUILDING_PERMIT',
          fileUrl: docUrl(`${spec.ref}-permis`),
          createdAt: monthsAgo(end, Math.min(acqAgo[i], months))
        });
      }
    }
  });

  // ---- Pro : actifs non immobiliers, entités, fiscalité, rendements, scénarios, foncier, sinistres
  const proAssets: Prisma.AssetCreateManyInput[] = [];
  const proValuations: Prisma.AssetValuationCreateManyInput[] = [];
  const entities: Prisma.HoldingEntityCreateManyInput[] = [];
  const holdings: Prisma.PropertyHoldingCreateManyInput[] = [];
  const taxProfiles: Prisma.PropertyTaxProfileCreateManyInput[] = [];
  const yields: Prisma.PropertyYieldAssumptionCreateManyInput[] = [];
  const scenarios: Prisma.PatrimonyScenarioCreateManyInput[] = [];

  const entityIds = [randomUUID(), randomUUID(), randomUUID()];
  if (isPro) {
    // Entités de détention (organigramme : la SCI détient la société).
    const entityCount = profile === '6m' ? 2 : 3;
    const entityDefs = [
      { name: 'SCI Les Flamboyants', legalForm: 'SCI' as const, rccm: 'CI-ABJ-2019-B-10234', taxId: '1923456 A' },
      { name: 'Kouassi Immo SARL', legalForm: 'COMPANY' as const, rccm: 'CI-ABJ-2021-B-20871', taxId: '2145678 B' },
      { name: 'M. Yao Kouassi (personne physique)', legalForm: 'INDIVIDUAL' as const, rccm: null, taxId: null }
    ];
    entityDefs.slice(0, entityCount).forEach((e, n) => {
      entities.push({
        id: entityIds[n],
        tenantId,
        name: e.name,
        legalForm: e.legalForm,
        country: 'CI',
        rccm: e.rccm,
        taxId: e.taxId,
        parentEntityId: n === 1 ? entityIds[0] : null,
        createdByUserId: adminUserId,
        createdAt: monthsAgo(end, months + 12)
      });
    });
    specs.forEach((spec, i) => {
      const effectiveFrom = monthsAgo(end, Math.min(acqAgo[i], months + 12));
      const owner = entityIds[i % entityCount];
      if (profile === '3y' && i === 1) {
        holdings.push(
          {
            tenantId,
            propertyId: propertyIds[i],
            entityId: entityIds[0],
            sharePercent: 60,
            effectiveFrom,
            updatedByUserId: adminUserId
          },
          {
            tenantId,
            propertyId: propertyIds[i],
            entityId: entityIds[1],
            sharePercent: 40,
            effectiveFrom,
            updatedByUserId: adminUserId
          }
        );
      } else {
        holdings.push({
          tenantId,
          propertyId: propertyIds[i],
          entityId: owner,
          sharePercent: 100,
          effectiveFrom,
          updatedByUserId: adminUserId
        });
      }
      const rented = leased.has(i);
      taxProfiles.push({
        tenantId,
        propertyId: propertyIds[i],
        country: 'CI',
        builtStatus: spec.built ? 'BUILT' : 'UNBUILT',
        occupancy: spec.ownerOccupied ? 'MAIN_RESIDENCE' : rented ? 'RENTED' : 'VACANT',
        declaredRentalValue: rented
          ? (leaseSpecs.find(l => l.propertyIdx === i && l.endAgo === null)?.rent ?? 0) * 12
          : null,
        updatedByUserId: adminUserId
      });
      if (i % 2 === 0) {
        yields.push({
          tenantId,
          propertyId: propertyIds[i],
          years: 10,
          valueGrowthRate: roundTo(spec.growth * 100, 0.5),
          rentGrowthRate: 3,
          expenseGrowthRate: 4,
          vacancyRate: spec.type === 'BUREAU' || spec.type === 'ENTREPOT_INDUSTRIEL' ? 8 : 5,
          updatedByUserId: adminUserId
        });
      }
    });

    // Actifs non immobiliers.
    interface OtherAsset {
      name: string;
      assetClass: Prisma.AssetCreateManyInput['assetClass'];
      details: Record<string, unknown>;
      method: Prisma.AssetValuationCreateManyInput['method'];
      cost: number | null;
      acqAgo: number;
      /** Valeur à l'ouverture et dérive annuelle (fraction, négative pour un amortissement). */
      base: number;
      drift: number;
      /** Pas des relevés, en mois. */
      step: number;
      entity?: number;
      source: string;
    }
    const year = end.getFullYear();
    const others: OtherAsset[] = [
      {
        name: 'Compte courant Société Générale CI',
        assetClass: 'CASH',
        details: { institution: 'Société Générale Côte d’Ivoire', cashKind: 'BANK', accountLast4: '4821' },
        method: 'BALANCE',
        cost: null,
        acqAgo: months + 24,
        base: 12_500_000,
        drift: 0.08,
        step: 3,
        source: 'Relevé bancaire',
        entity: 0
      },
      {
        name: 'Orange Money — compte principal',
        assetClass: 'CASH',
        details: { institution: 'Orange Money', cashKind: 'MOBILE_MONEY', accountLast4: '0764' },
        method: 'BALANCE',
        cost: null,
        acqAgo: months + 12,
        base: 1_400_000,
        drift: 0.1,
        step: 3,
        source: 'Solde saisi'
      },
      {
        name: 'Assurance-vie NSIA Vie',
        assetClass: 'SAVINGS_INVESTMENT',
        details: {
          savingsKind: 'LIFE_INSURANCE',
          organization: 'NSIA Vie Assurances',
          expectedRatePercent: 5,
          principal: 20_000_000
        },
        method: 'ACCRUED_SAVINGS',
        cost: 20_000_000,
        acqAgo: months + 36,
        base: 24_000_000,
        drift: 0.05,
        step: 12,
        source: 'Relevé annuel NSIA Vie'
      },
      {
        name: 'Pick-up Toyota Hilux',
        assetClass: 'VEHICLE_EQUIPMENT',
        details: {
          kind: 'Pick-up',
          brand: 'Toyota',
          model: 'Hilux',
          year: year - 3,
          registration: '4821 GH 01',
          usefulLifeYears: 8,
          residualValuePercent: 10,
          depreciationMethod: 'LINEAR'
        },
        method: 'DEPRECIATION_LINEAR',
        cost: 28_000_000,
        acqAgo: 36,
        base: 24_000_000,
        drift: -0.12,
        step: 12,
        source: 'Facture concessionnaire'
      }
    ];
    if (profile === '3y') {
      others.push(
        {
          name: 'Parts SARL Ivoire Logistique (30 %)',
          assetClass: 'BUSINESS_EQUITY',
          details: {
            companyName: 'Ivoire Logistique',
            legalForm: 'SARL',
            country: 'Côte d’Ivoire',
            ownershipPercent: 30,
            sector: 'Transport et logistique',
            companyValue: 250_000_000
          },
          method: 'EQUITY_SHARE',
          cost: 45_000_000,
          acqAgo: 60,
          base: 55_000_000,
          drift: 0.09,
          step: 12,
          source: 'Bilan de l’exercice',
          entity: 1
        },
        {
          name: 'Créance sur M. Soro Lacina',
          assetClass: 'RECEIVABLE',
          details: {
            debtor: 'M. Soro Lacina',
            dueDate: iso(monthsAgo(end, -6)),
            ratePercent: 6,
            principal: 8_000_000,
            collectibilityPercent: 80
          },
          method: 'DISCOUNTED_CLAIM',
          cost: 8_000_000,
          acqAgo: 24,
          base: 8_000_000,
          drift: -0.05,
          step: 12,
          source: 'Reconnaissance de dette'
        },
        {
          name: 'Plantation d’anacardiers de Korhogo',
          assetClass: 'AGRICULTURE',
          details: { agricultureKind: 'PLANTATION', crop: 'Anacarde', areaHectares: 12, unitValue: 2_300_000 },
          method: 'UNIT_VALUE',
          cost: 18_000_000,
          acqAgo: 48,
          base: 22_000_000,
          drift: 0.06,
          step: 12,
          source: 'Estimation du technicien agricole'
        }
      );
    }
    for (const o of others) {
      const checked = parseAssetDetails(o.assetClass as string, o.details);
      if (!checked.success) {
        throw new Error(`patrimoine : détails invalides pour « ${o.name} » : ${JSON.stringify(checked.issues)}`);
      }
      const id = randomUUID();
      const acqDate = monthsAgo(end, Math.min(o.acqAgo, months + 60));
      proAssets.push({
        id,
        tenantId,
        name: o.name,
        assetClass: o.assetClass,
        status: 'ACTIVE',
        currency: 'XOF',
        acquisitionCost: o.cost,
        acquisitionDate: o.cost === null ? null : acqDate,
        holdingEntityId: o.entity !== undefined && o.entity < entityCount ? entityIds[o.entity] : null,
        details: o.details as Prisma.InputJsonValue,
        detailsVersion: 2,
        createdByUserId: adminUserId,
        createdAt: acqDate
      });
      // Relevés espacés de `step` mois, du plus ancien au plus récent (mois dernier).
      const points: number[] = [];
      for (let m = months; m >= 1; m -= o.step) points.push(m);
      if (points[points.length - 1] !== 1) points.push(1);
      points.forEach((m, k) => {
        const elapsedYears = (months - m) / 12;
        const wobble = o.assetClass === 'CASH' ? 0.9 + rng() * 0.25 : 1;
        const raw = o.base * Math.pow(1 + o.drift, elapsedYears) * wobble;
        proValuations.push({
          tenantId,
          assetId: id,
          valuatedAt: monthsAgo(end, m),
          estimatedValue: Math.max(100_000, roundTo(raw, o.assetClass === 'CASH' ? 10_000 : 100_000)),
          currency: 'XOF',
          acquisitionCost: k === 0 ? o.cost : null,
          acquisitionDate: k === 0 && o.cost !== null ? acqDate : null,
          method: o.method,
          source: o.source,
          reliability: o.method === 'BALANCE' ? 'HIGH' : 'MEDIUM',
          reliabilityReasons: []
        });
      });
    }

    // Scénarios de projection (hypothèses et opérations, aucun résultat stocké).
    scenarios.push(
      {
        tenantId,
        name: 'Scénario prudent sur 10 ans',
        horizonYears: 10,
        baseScenario: 'PRUDENT',
        assumptions: { inflationPercent: 3 },
        operations: [],
        createdByUserId: adminUserId
      },
      {
        tenantId,
        name: 'Acquisition d’un immeuble à Cocody en année 2',
        horizonYears: 15,
        baseScenario: 'CENTRAL',
        assumptions: { growthPercentByClass: { REAL_ESTATE: 6 } },
        operations: [
          {
            type: 'BUY_ASSET',
            year: 2,
            assetClass: 'REAL_ESTATE',
            name: 'Immeuble R+4 Cocody Riviera',
            price: 180_000_000
          },
          { type: 'TAKE_LOAN', year: 2, amount: 100_000_000, annualRatePercent: 8, termYears: 15 }
        ],
        createdByUserId: adminUserId
      },
      {
        tenantId,
        name: 'Épargne mensuelle de 500 000 FCFA',
        horizonYears: 10,
        baseScenario: 'OPTIMISTIC',
        assumptions: {},
        operations: [{ type: 'MONTHLY_SAVING', fromYear: 1, amount: 500_000 }],
        createdByUserId: adminUserId
      }
    );
  }

  // ---- écriture : une seule transaction
  await prisma.$transaction(
    async tx => {
      await tx.user.createMany({ data: users });
      await tx.tenantClient.createMany({ data: clients });
      await tx.property.createMany({ data: properties });
      await tx.asset.createMany({ data: assets });
      await tx.assetValuation.createMany({ data: valuations });
      await tx.rentalLease.createMany({ data: leases });
      await tx.rentalInstallment.createMany({ data: installments });
      await tx.rentalInstallmentItem.createMany({ data: installmentItems });
      await tx.rentalPayment.createMany({ data: payments });
      await tx.rentalPaymentAllocation.createMany({ data: allocations });
      await tx.insurancePolicy.createMany({ data: policies });
      await tx.workProgram.createMany({ data: works });
      await tx.propertyLoan.createMany({ data: loans });
      await tx.patrimonyDocument.createMany({ data: documents });

      // Plan de trésorerie : taxe foncière exigible le 31 mars.
      await tx.patrimonyCashPlanSettings.create({
        data: { tenantId, propertyTaxDueMonth: 3, propertyTaxDueDay: 31, updatedByUserId: adminUserId }
      });

      if (isPro) {
        await tx.holdingEntity.createMany({ data: entities });
        await tx.propertyHolding.createMany({ data: holdings });
        await tx.asset.createMany({ data: proAssets });
        await tx.assetValuation.createMany({ data: proValuations });
        await tx.propertyTaxProfile.createMany({ data: taxProfiles });
        await tx.propertyYieldAssumption.createMany({ data: yields });
        await tx.patrimonyScenario.createMany({ data: scenarios });

        // Dossier de régularisation foncière du terrain (filière CI_ACD).
        const terrainIdx = specs.findIndex(s => s.type === 'TERRAIN');
        if (terrainIdx >= 0) {
          const track = LAND_TRACKS.find(t => t.key === 'CI_ACD');
          if (track) {
            const startedAgo = profile === '6m' ? 5 : 18;
            const doneSteps = profile === '6m' ? 2 : 3;
            const regId = randomUUID();
            await tx.landRegularization.create({
              data: {
                id: regId,
                tenantId,
                propertyId: propertyIds[terrainIdx],
                track: 'CI_ACD',
                status: 'EN_COURS',
                startDate: monthsAgo(end, startedAgo),
                notes: 'Passage de l’attestation villageoise au titre foncier.',
                createdByUserId: adminUserId,
                createdAt: monthsAgo(end, startedAgo)
              }
            });
            const stepMonths = Math.max(1, Math.floor(startedAgo / (doneSteps + 1)));
            await tx.landRegularizationStep.createMany({
              data: track.steps.map((s, idx) => {
                const done = idx < doneSteps;
                const running = idx === doneSteps;
                const completedAt = done ? atMonth(monthsAgo(end, startedAgo - stepMonths * (idx + 1) + 1), 20) : null;
                return {
                  tenantId,
                  regularizationId: regId,
                  stepKey: s.key,
                  sortOrder: s.order,
                  label: s.label,
                  required: s.required,
                  status: done ? ('TERMINEE' as const) : running ? ('EN_COURS' as const) : ('A_FAIRE' as const),
                  startedAt: done || running ? atMonth(monthsAgo(end, startedAgo - stepMonths * idx), 5) : null,
                  completedAt,
                  dueDate: running ? addDays(end, 45) : null,
                  costXof: done ? between(rng, 150, 450) * 1_000 : 0
                };
              })
            });
          }
        }

        // Sinistres : un réglé (3 ans) et un en cours.
        const claimDefs =
          profile === '3y'
            ? [
                {
                  propertyIdx: 2,
                  ago: 14,
                  cause: 'WATER_DAMAGE' as const,
                  claimed: 1_200_000,
                  indemnified: 950_000,
                  deductible: 100_000,
                  final: 'SETTLED' as const,
                  text: 'Dégât des eaux dû à une fuite de la colonne montante.'
                },
                {
                  propertyIdx: 6,
                  ago: 2,
                  cause: 'STORM' as const,
                  claimed: 650_000,
                  indemnified: null,
                  deductible: null,
                  final: 'INSURER_NOTIFIED' as const,
                  text: 'Tôles arrachées par la tempête sur la terrasse.'
                }
              ]
            : [
                {
                  propertyIdx: 1,
                  ago: 2,
                  cause: 'WATER_DAMAGE' as const,
                  claimed: 480_000,
                  indemnified: null,
                  deductible: null,
                  final: 'INSURER_NOTIFIED' as const,
                  text: 'Infiltration au plafond du salon après de fortes pluies.'
                }
              ];
        const chain = ['DECLARED', 'INSURER_NOTIFIED', 'EXPERTISE', 'SETTLED'] as const;
        for (const c of claimDefs) {
          if (c.propertyIdx >= propertyCount) continue;
          const occurred = atMonth(monthsAgo(end, c.ago), 12);
          const policy =
            policyRows.find(p => p.propertyIdx === c.propertyIdx && p.start <= occurred && p.end > occurred) ??
            policyRows
              .filter(p => p.propertyIdx === c.propertyIdx)
              .sort((a, b) => b.start.getTime() - a.start.getTime())[0];
          if (!policy) continue;
          let expenseId: string | null = null;
          if (c.final === 'SETTLED') {
            expenseId = randomUUID();
            await tx.propertyExpense.create({
              data: {
                id: expenseId,
                tenantId,
                propertyId: propertyIds[c.propertyIdx],
                category: 'ROUTINE_MAINTENANCE',
                label: 'Réparation suite au sinistre',
                amount: c.claimed,
                currency: 'XOF',
                paidAt: addDays(occurred, 20),
                paymentMethod: 'BANK_TRANSFER',
                supplierName: 'Plomberie Moderne d’Abobo'
              }
            });
          }
          const claimId = randomUUID();
          const steps = chain.slice(0, chain.indexOf(c.final === 'SETTLED' ? 'SETTLED' : 'INSURER_NOTIFIED') + 1);
          const stamp = (n: number): Date => addDays(occurred, 3 + n * 12);
          await tx.insuranceClaim.create({
            data: {
              id: claimId,
              tenantId,
              propertyId: propertyIds[c.propertyIdx],
              policyId: policy.id,
              expenseId,
              occurredAt: occurred,
              declaredAt: addDays(occurred, 2),
              cause: c.cause,
              description: c.text,
              status: c.final,
              claimedAmount: c.claimed,
              indemnifiedAmount: c.indemnified,
              deductible: c.deductible,
              currency: 'XOF',
              insurerNotifiedAt: steps.length > 1 ? stamp(1) : null,
              expertiseAt: steps.length > 2 ? stamp(2) : null,
              settledAt: c.final === 'SETTLED' ? stamp(3) : null,
              createdByUserId: adminUserId,
              createdAt: addDays(occurred, 2)
            }
          });
          await tx.insuranceClaimStatusHistory.createMany({
            data: steps.map((status, n) => ({
              tenantId,
              claimId,
              fromStatus: n === 0 ? null : steps[n - 1],
              toStatus: status,
              changedByUserId: adminUserId,
              changedAt: n === 0 ? addDays(occurred, 2) : stamp(n)
            }))
          });
        }
      }

      // Dépenses : après les éventuelles dépenses de sinistre, en bloc.
      await tx.propertyExpense.createMany({ data: expenses });
    },
    { timeout: 300_000, maxWait: 30_000 }
  );

  // ---- registre des lots : le vrai service fait compter les biens détenus (capacité BIENS_DETENUS)
  try {
    const { lockTenantLotsTx, reconcileLotActivationsTx } = await import('../../../src/services/lot-registry-service');
    type Db = Parameters<typeof reconcileLotActivationsTx>[0];
    const result = await prisma.$transaction(
      async tx => {
        await lockTenantLotsTx(tx as unknown as Db, tenantId);
        return reconcileLotActivationsTx(tx as unknown as Db, tenantId, { actorUserId: adminUserId });
      },
      { timeout: 60_000 }
    );
    log(`patrimoine : registre des lots aligné (${result.byKind.HELD_PROPERTY} bien(s) détenu(s) comptés).`);
  } catch (error) {
    log(`patrimoine : registre des lots non aligné (${error instanceof Error ? error.message : String(error)}).`);
  }

  log(
    `patrimoine (${pack}, ${profile}) : ${properties.length} biens, ${leases.length} baux, ${installments.length} échéances, ` +
      `${expenses.length} dépenses, ${works.length} travaux, ${policies.length} polices, ${loans.length} prêts, ` +
      `${valuations.length + proValuations.length} valorisations, ${documents.length} documents` +
      (isPro
        ? `, ${entities.length} entités, ${proAssets.length} actifs non immobiliers, ${scenarios.length} scénarios.`
        : '.')
  );
}

export const seedPatrimoineHistory: HistorySeeder = ctx => seedPatrimoineHistoryForPack(ctx, 'PATRIMOINE_PRO');
