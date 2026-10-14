/**
 * Patrimoine des biens propres de l'agence : actifs, valorisations dans le temps, prêts
 * amortis, dépenses (taxe foncière, primes, charges périodiques écrites par le service du
 * produit, donc au journal), programmes de travaux, profils fiscaux, hypothèses de
 * rendement (en FRACTIONS : 0,04 et non 4, le moteur calcule `1 + taux`) et échéance de
 * taxe foncière du plan de trésorerie.
 *
 * Chaque bloc est idempotent : il teste ce que le tenant porte déjà.
 */
import { Prisma } from '@prisma/client';
import { computeStoredReliability } from '../../../src/lib/patrimoine/assets/stored-reliability';
import { ensurePropertyAsset } from '../../../src/lib/patrimoine/property-asset';
import { runWithTenantContext } from '../../../src/utils/tenant-context';
import { addDays, between, monthsAgo, pick } from './types';
import {
  annuity,
  atDay,
  monthsBack,
  monthsBetween,
  remainingCapital,
  roundTo,
  author
} from './agence-patrimoine-state';
import type { OwnState } from './agence-patrimoine-state';
import { valueAtMonthsAgo } from './agence-patrimoine-profile';
import type { Profile } from './agence-patrimoine-profile';

type PayMethod = 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CASH' | 'CHECK';
type ExpenseCategory =
  | 'PROPERTY_TAX'
  | 'CONDO_FEES'
  | 'INSURANCE'
  | 'ROUTINE_MAINTENANCE'
  | 'RENOVATION'
  | 'MANAGEMENT_FEES'
  | 'UTILITIES'
  | 'OTHER';

export interface ExpenseSpec {
  category: ExpenseCategory;
  label: string;
  amount: number;
  paidAt: Date;
  supplier: string;
  method?: PayMethod;
  capitalized?: boolean;
  recurrence?: 'ONE_OFF' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  recurrenceEnd?: Date | null;
  notes?: string;
}

/**
 * Dépense d'un bien propre, par le service du produit (écriture au journal comme à la saisie) ;
 * à défaut (période comptable, compte de trésorerie), insertion directe. Idempotent : une dépense
 * de même bien, libellé, date et montant n'est jamais écrite deux fois.
 */
export async function putExpense(o: OwnState, propertyId: string, spec: ExpenseSpec): Promise<string> {
  const { prisma, tenantId } = o.ctx;
  const known = await prisma.propertyExpense.findFirst({
    where: { tenantId, propertyId, label: spec.label, paidAt: spec.paidAt, amount: spec.amount },
    select: { id: true }
  });
  if (known) return known.id;
  const method: PayMethod = spec.method ?? 'BANK_TRANSFER';
  const recurrence = spec.recurrence ?? 'ONE_OFF';
  let id: string;
  try {
    const { createPropertyExpense } = await import('../../../src/lib/patrimoine/queries');
    const created = await createPropertyExpense(tenantId, propertyId, {
      category: spec.category,
      label: spec.label,
      amount: spec.amount,
      currency: 'XOF',
      paidAt: spec.paidAt,
      isCapitalized: spec.capitalized ?? false,
      notes: spec.notes,
      paymentMethod: method,
      supplierName: spec.supplier,
      recurrence,
      recurrenceEndDate: spec.recurrenceEnd ?? null
    });
    id = created.id;
  } catch (error) {
    o.ctx.log(
      `dépense « ${spec.label} » : service indisponible (${error instanceof Error ? error.message : String(error)}), insertion directe.`
    );
    const row = await prisma.propertyExpense.create({
      data: {
        tenantId,
        propertyId,
        category: spec.category,
        label: spec.label,
        amount: spec.amount,
        currency: 'XOF',
        paidAt: spec.paidAt,
        isCapitalized: spec.capitalized ?? false,
        notes: spec.notes,
        paymentMethod: method,
        supplierName: spec.supplier,
        recurrence,
        recurrenceEndDate: spec.recurrenceEnd ?? null
      },
      select: { id: true }
    });
    id = row.id;
  }
  await prisma.propertyExpense.update({ where: { id }, data: { createdAt: spec.paidAt } });
  return id;
}

// ------------------------------------------------------------------ actifs et valorisations

export async function seedAssetsAndValuations(o: OwnState, profiles: Profile[]): Promise<void> {
  const { prisma, tenantId, end, log } = o.ctx;
  let assets = 0;
  let valuations = 0;
  for (const p of profiles) {
    const asset = await ensurePropertyAsset(prisma as never, tenantId, p.prop.id);
    if (!asset) continue;
    const row = await prisma.asset.findUnique({
      where: { id: asset.id },
      select: { acquisitionCost: true, createdAt: true }
    });
    if (row && row.acquisitionCost === null) {
      await prisma.asset.update({
        where: { id: asset.id },
        data: {
          name: p.prop.title,
          acquisitionCost: p.cost,
          acquisitionDate: p.acqDate,
          details: { legalStatus: p.legalStatus },
          detailsVersion: 2,
          createdByUserId: author(o),
          createdAt: p.acqDate
        }
      });
      assets += 1;
    }

    if ((await prisma.assetValuation.count({ where: { tenantId, propertyId: p.prop.id } })) > 0) continue;
    const points: Array<{
      at: Date;
      value: number;
      method: 'MANUAL' | 'MARKET_ESTIMATE' | 'EXPERT_APPRAISAL';
      source: string;
      first: boolean;
    }> = [
      {
        at: p.acqDate,
        value: p.cost,
        method: 'MANUAL',
        source: 'Prix d’acquisition (acte notarié)',
        first: true
      }
    ];
    for (const m of [48, 36, 30, 24, 18, 12, 9, 6, 3, 1]) {
      if (m >= p.acqAgo - 1) continue;
      const at = monthsBack(end, m, 10 + (m % 12));
      const expert = m === 12 && p.index % 3 === 0;
      points.push({
        at,
        value: valueAtMonthsAgo(p, m),
        method: expert ? 'EXPERT_APPRAISAL' : 'MARKET_ESTIMATE',
        source: expert ? 'Cabinet Expertim CI — rapport d’expertise' : 'Estimation de marché (comparables du quartier)',
        first: false
      });
    }
    await prisma.assetValuation.createMany({
      data: points.map(pt => {
        const reliability = computeStoredReliability(
          { assetClass: 'REAL_ESTATE', details: { legalStatus: p.legalStatus } },
          { method: pt.method, valuatedAt: pt.at, source: pt.source },
          addDays(pt.at, 2)
        );
        return {
          tenantId,
          propertyId: p.prop.id,
          valuatedAt: pt.at,
          estimatedValue: pt.value,
          currency: 'XOF',
          acquisitionCost: pt.first ? p.cost : null,
          acquisitionDate: pt.first ? p.acqDate : null,
          method: pt.method,
          source: pt.source,
          reliability: reliability.reliability,
          reliabilityReasons: reliability.reliabilityReasons,
          createdAt: pt.at
        } satisfies Prisma.AssetValuationCreateManyInput;
      })
    });
    valuations += points.length;
  }
  log(
    `patrimoine propre : ${assets} actif(s) immobilier(s) renseigné(s), ${valuations} valorisation(s) dans le temps.`
  );
}

// ------------------------------------------------------------------ prêts

export async function seedOwnLoans(o: OwnState, profiles: Profile[]): Promise<void> {
  const { prisma, tenantId, end, log } = o.ctx;
  const onOwn = { tenantId, propertyId: { in: profiles.map(p => p.prop.id) } };
  if ((await prisma.propertyLoan.count({ where: onOwn })) > 0) {
    log('patrimoine propre : prêts déjà présents, bloc sauté.');
    return;
  }
  const lenders = [
    'Société Générale Côte d’Ivoire',
    'Bank of Africa Côte d’Ivoire',
    'NSIA Banque Côte d’Ivoire',
    'Ecobank Côte d’Ivoire',
    'Banque Atlantique Côte d’Ivoire',
    'BICICI'
  ];
  interface LoanDef {
    p: Profile;
    capital: number;
    rate: number;
    years: number;
    startAgo: number;
  }
  const defs: LoanDef[] = [];
  const oldest = [...profiles].sort((a, b) => b.acqAgo - a.acqAgo)[0];
  profiles.forEach(p => {
    if (p === oldest && p.acqAgo >= 62) {
      // Un prêt court, soldé : il reste dans l'historique avec le statut « clos ».
      defs.push({ p, capital: roundTo(p.cost * 0.45, 500_000), rate: 7.5, years: 5, startAgo: p.acqAgo });
      return;
    }
    // Environ un bien sur deux a été acheté à crédit.
    if (p.index % 2 !== 0 || p.annualRent < 1_500_000) return;
    const rngL = p.fork('loans');
    const years = pick(rngL, [10, 12, 15, 15, 20]);
    defs.push({
      p,
      capital: roundTo(p.cost * (0.28 + rngL() * 0.14), 500_000),
      rate: Math.round((6.5 + rngL() * 3) * 10) / 10,
      years,
      startAgo: Math.min(p.acqAgo, 12 * years - 6)
    });
  });
  // Un prêt travaux récent sur un bien déjà remboursé en capital.
  const worksPick = profiles.find(p => p.index % 2 === 1 && p.annualRent > 3_000_000) ?? profiles[1];
  if (worksPick) {
    defs.push({
      p: worksPick,
      capital: roundTo(Math.min(18_000_000, worksPick.valueNow * 0.12), 500_000),
      rate: 8.5,
      years: 3,
      startAgo: 8
    });
  }
  let n = 0;
  for (const d of defs) {
    const term = d.years * 12;
    const paid = Math.min(term, d.startAgo);
    const closed = paid >= term;
    await prisma.propertyLoan.create({
      data: {
        tenantId,
        propertyId: d.p.prop.id,
        lender: lenders[(d.p.index + n) % lenders.length],
        capitalAmount: d.capital,
        remainingCapital: Math.round(remainingCapital(d.capital, d.rate, term, paid)),
        interestRate: d.rate,
        monthlyPayment: Math.round(annuity(d.capital, d.rate, term)),
        currency: 'XOF',
        startDate: monthsBack(end, d.startAgo, 5),
        endDate: monthsBack(end, d.startAgo - term, 5),
        status: closed ? 'CLOSED' : 'ACTIVE',
        createdAt: monthsBack(end, d.startAgo, 5)
      }
    });
    n += 1;
  }
  log(`patrimoine propre : ${n} prêt(s) amorti(s) écrit(s).`);
}

// ------------------------------------------------------------------ dépenses

const METHODS: readonly PayMethod[] = [
  'BANK_TRANSFER',
  'BANK_TRANSFER',
  'BANK_TRANSFER',
  'MOBILE_MONEY',
  'MOBILE_MONEY',
  'CASH',
  'CHECK'
];

interface Recurring {
  category: ExpenseCategory;
  label: string;
  amount: number;
  step: number;
  recurrence: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  supplier: string;
  startAgo: number;
  /** Contrat terminé il y a `endAgo` mois. */
  endAgo?: number;
}

/** Charges périodiques d'un bien selon son type, son occupation et son âge. */
function recurringFor(p: Profile, end: Date): Recurring[] {
  const out: Recurring[] = [];
  const rngR = p.fork('recurring');
  const age = Math.max(2, monthsBetween(p.prop.createdAt, end));
  const startAgo = (min: number, max: number): number =>
    Math.max(2, Math.min(between(rngR, min, max), age, p.acqAgo - 1));
  const t = p.prop.type;
  const amt = (lo: number, hi: number): number => roundTo(lo + rngR() * (hi - lo), 5_000);
  if (t === 'ENTREPOT_INDUSTRIEL' || t === 'BUREAU') {
    out.push({
      category: 'OTHER',
      label: t === 'BUREAU' ? 'Gardiennage et sécurité des bureaux' : 'Gardiennage du site',
      amount: amt(110_000, 180_000),
      step: 1,
      recurrence: 'MONTHLY',
      supplier: 'Sécurité Ivoire Protection',
      startAgo: startAgo(14, 30)
    });
  }
  if (t === 'BUREAU' || t === 'BOUTIQUE_COMMERCIAL') {
    out.push({
      category: 'OTHER',
      label: 'Nettoyage des parties communes',
      amount: amt(60_000, 95_000),
      step: 1,
      recurrence: 'MONTHLY',
      supplier: 'Net Plus Abidjan',
      startAgo: startAgo(10, 26)
    });
  }
  if (['BUREAU', 'BOUTIQUE_COMMERCIAL', 'ENTREPOT_INDUSTRIEL'].includes(t)) {
    out.push({
      category: 'ROUTINE_MAINTENANCE',
      label: 'Contrôle annuel de sécurité incendie et du réseau électrique',
      amount: amt(90_000, 240_000),
      step: 12,
      recurrence: 'ANNUAL',
      supplier: 'Technibat CI',
      startAgo: startAgo(14, 34)
    });
  }
  if (t === 'MAISON_VILLA' || t === 'DUPLEX_TRIPLEX') {
    out.push({
      category: 'ROUTINE_MAINTENANCE',
      label: 'Entretien du jardin et de la piscine',
      amount: amt(120_000, 190_000),
      step: 3,
      recurrence: 'QUARTERLY',
      supplier: 'Jardins du Golfe',
      startAgo: startAgo(12, 30)
    });
    out.push({
      category: 'ROUTINE_MAINTENANCE',
      label: 'Entretien du jardin (ancienne convention terminée)',
      amount: amt(50_000, 80_000),
      step: 3,
      recurrence: 'QUARTERLY',
      supplier: 'Verdure Services Abidjan',
      startAgo: startAgo(24, 34),
      endAgo: 14
    });
  }
  if (['APPARTEMENT', 'STUDIO'].includes(t) && p.index % 2 === 0) {
    out.push({
      category: 'CONDO_FEES',
      label: 'Charges de copropriété de la résidence',
      amount: amt(18_000, 48_000),
      step: 1,
      recurrence: 'MONTHLY',
      supplier: 'Syndic de la résidence',
      startAgo: startAgo(14, 30)
    });
  }
  if (!p.leased) {
    out.push({
      category: 'UTILITIES',
      label: 'Eau et électricité du bien vacant',
      amount: amt(15_000, 38_000),
      step: 1,
      recurrence: 'MONTHLY',
      supplier: 'CIE / SODECI',
      startAgo: startAgo(8, 14)
    });
  }
  return out;
}

export async function seedOwnExpenses(o: OwnState, profiles: Profile[]): Promise<void> {
  const { ctx } = o;
  const { end, log } = ctx;
  let written = 0;
  const bump = async (propertyId: string, spec: ExpenseSpec): Promise<void> => {
    await putExpense(o, propertyId, spec);
    written += 1;
  };
  await runWithTenantContext({ tenantId: ctx.tenantId, userId: ctx.adminUserId }, async () => {
    for (const p of profiles) {
      const rngE = p.fork('expenses');
      const method = (): PayMethod => pick(rngE, METHODS);
      // Taxe foncière : exigible chaque 31 mars.
      for (let year = end.getFullYear() - 3; year <= end.getFullYear(); year++) {
        const paidAt = atDay(new Date(year, 2, 1), 28 - (p.index % 6));
        if (paidAt.getTime() > end.getTime() || paidAt.getTime() < p.acqDate.getTime()) continue;
        await bump(p.prop.id, {
          category: 'PROPERTY_TAX',
          label: `Taxe foncière ${year}`,
          amount: roundTo(p.annualRent * (0.04 + rngE() * 0.015), 1_000),
          paidAt,
          supplier: 'Direction générale des impôts',
          method: method()
        });
      }
      // Primes d'assurance : une par police.
      for (const pol of p.policies) {
        const paidAt = addDays(pol.start, 2);
        if (paidAt.getTime() > end.getTime()) continue;
        await bump(p.prop.id, {
          category: 'INSURANCE',
          label: `Prime d’assurance ${pol.insurer} — police ${pol.number}`,
          amount: pol.premium,
          paidAt,
          supplier: pol.insurer,
          method: 'BANK_TRANSFER'
        });
      }
      // Charges périodiques : modèle récurrent daté de la dernière échéance payée + règlements antérieurs.
      for (const r of recurringFor(p, end)) {
        const first = new Date(end.getFullYear(), end.getMonth() - r.startAgo, 8 + (p.index % 15), 10);
        const stopAt = r.endAgo ? new Date(end.getFullYear(), end.getMonth() - r.endAgo, 8, 10) : null;
        const dates: Date[] = [];
        for (let k = 0; ; k++) {
          const d = new Date(first.getFullYear(), first.getMonth() + k * r.step, first.getDate(), 10);
          if (d.getTime() > end.getTime() - 86_400_000) break;
          if (stopAt && d.getTime() > stopAt.getTime()) break;
          dates.push(d);
        }
        if (dates.length === 0) continue;
        const last = dates[dates.length - 1];
        const earlier = dates.slice(0, -1).slice(r.recurrence === 'MONTHLY' ? -11 : -8);
        for (const d of earlier) {
          await bump(p.prop.id, {
            category: r.category,
            label: r.label,
            amount: r.amount,
            paidAt: d,
            supplier: r.supplier,
            method: method()
          });
        }
        await bump(p.prop.id, {
          category: r.category,
          label: r.label,
          amount: r.amount,
          paidAt: last,
          supplier: r.supplier,
          method: method(),
          recurrence: r.recurrence,
          recurrenceEnd: stopAt && stopAt.getTime() < end.getTime() ? stopAt : null
        });
      }
    }
  });
  log(`patrimoine propre : ${written} dépense(s) (taxe foncière, primes, charges périodiques).`);
}

// ------------------------------------------------------------------ travaux

interface WorkDef {
  at: number;
  title: string;
  description: string;
  estimated: number;
  actual: number | null;
  plannedAgo: number;
  completedAgo: number | null;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  capitalized: boolean;
  supplier: string;
}

const WORKS: readonly WorkDef[] = [
  {
    at: 0,
    title: 'Remplacement des climatiseurs du séjour et des chambres',
    description: 'Dépose de quatre splits vétustes et pose de modèles inverter.',
    estimated: 1_800_000,
    actual: 1_700_000,
    plannedAgo: 15,
    completedAgo: 14,
    status: 'COMPLETED',
    capitalized: false,
    supplier: 'Froid & Clim Abidjan'
  },
  {
    at: 1,
    title: 'Réfection de l’étanchéité de la terrasse',
    description: 'Reprise complète du revêtement d’étanchéité et des relevés.',
    estimated: 3_200_000,
    actual: 3_450_000,
    plannedAgo: 21,
    completedAgo: 20,
    status: 'COMPLETED',
    capitalized: true,
    supplier: 'Multiservices Bâti Plus'
  },
  {
    at: 3,
    title: 'Ravalement de façade et peinture extérieure',
    description: 'Nettoyage haute pression, enduit et deux couches de peinture.',
    estimated: 8_000_000,
    actual: 8_600_000,
    plannedAgo: 10,
    completedAgo: 9,
    status: 'COMPLETED',
    capitalized: true,
    supplier: 'Peinture & Rénovation Lagune'
  },
  {
    at: 4,
    title: 'Mise aux normes de l’installation électrique',
    description: 'Remplacement du tableau général et des protections différentielles.',
    estimated: 2_400_000,
    actual: null,
    plannedAgo: -2,
    completedAgo: null,
    status: 'PLANNED',
    capitalized: false,
    supplier: 'Ivoire Électricité Services'
  },
  {
    at: 6,
    title: 'Pose de panneaux solaires et batterie de secours',
    description: 'Installation de 6 kWc pour réduire la facture et sécuriser le site.',
    estimated: 6_500_000,
    actual: null,
    plannedAgo: -5,
    completedAgo: null,
    status: 'PLANNED',
    capitalized: true,
    supplier: 'Solaire CI'
  },
  {
    at: 7,
    title: 'Clôture et portail électrique',
    description: 'Mur de clôture de 40 ml et portail coulissant motorisé.',
    estimated: 3_500_000,
    actual: null,
    plannedAgo: 2,
    completedAgo: null,
    status: 'IN_PROGRESS',
    capitalized: true,
    supplier: 'Métal Concept CI'
  },
  {
    at: 9,
    title: 'Rénovation de la salle de bain',
    description: 'Remplacement des sanitaires, du carrelage et de la robinetterie.',
    estimated: 1_200_000,
    actual: null,
    plannedAgo: 1,
    completedAgo: null,
    status: 'IN_PROGRESS',
    capitalized: false,
    supplier: 'Plomberie Express CI'
  },
  {
    at: 10,
    title: 'Création d’une cuisine équipée',
    description: 'Meubles hauts et bas, plan de travail en granit, hotte.',
    estimated: 2_800_000,
    actual: null,
    plannedAgo: -8,
    completedAgo: null,
    status: 'PLANNED',
    capitalized: true,
    supplier: 'Menuiserie Aluminium Ivoire'
  },
  {
    at: 12,
    title: 'Reprise de la toiture et isolation thermique',
    description: 'Remplacement de la charpente légère et pose d’une isolation sous toiture.',
    estimated: 12_000_000,
    actual: null,
    plannedAgo: -3,
    completedAgo: null,
    status: 'PLANNED',
    capitalized: true,
    supplier: 'Multiservices Bâti Plus'
  },
  {
    at: 13,
    title: 'Aménagement d’une mezzanine',
    description: 'Projet abandonné : le coût dépassait le gain locatif attendu.',
    estimated: 4_200_000,
    actual: null,
    plannedAgo: 11,
    completedAgo: null,
    status: 'CANCELLED',
    capitalized: true,
    supplier: 'Multiservices Bâti Plus'
  },
  {
    at: 15,
    title: 'Groupe électrogène de secours',
    description: 'Fourniture, pose et raccordement d’un groupe de 20 kVA avec inverseur.',
    estimated: 4_500_000,
    actual: 4_380_000,
    plannedAgo: 7,
    completedAgo: 6,
    status: 'COMPLETED',
    capitalized: true,
    supplier: 'Groupes Électrogènes Ivoire'
  }
];

export async function seedOwnWorks(o: OwnState, profiles: Profile[]): Promise<void> {
  const { ctx } = o;
  const { prisma, tenantId, end, log } = ctx;
  if (profiles.length === 0) return;
  let created = 0;
  await runWithTenantContext({ tenantId, userId: ctx.adminUserId }, async () => {
    for (const w of WORKS) {
      const p = profiles[w.at % profiles.length];
      const rngW = p.fork(`works:${w.title}`);
      const planned = atDay(monthsAgo(end, w.plannedAgo), 12);
      // Pas de travaux avant la mise au patrimoine du bien.
      if (planned.getTime() < p.acqDate.getTime() && w.status !== 'PLANNED') continue;
      const known = await prisma.workProgram.findFirst({
        where: { tenantId, propertyId: p.prop.id, title: w.title },
        select: { id: true }
      });
      if (known) continue;
      const completed = w.completedAgo === null ? null : atDay(monthsAgo(end, w.completedAgo), 25);
      await prisma.workProgram.create({
        data: {
          tenantId,
          propertyId: p.prop.id,
          title: w.title,
          description: `${w.description} Travaux confiés à ${w.supplier}.`,
          estimatedCost: w.estimated,
          actualCost: w.actual,
          currency: 'XOF',
          plannedDate: planned,
          completedDate: completed,
          status: w.status,
          isCapitalized: w.capitalized,
          createdAt: w.plannedAgo > 0 ? addDays(planned, -30) : addDays(end, -between(rngW, 5, 40))
        }
      });
      created += 1;
      if (w.status === 'COMPLETED' && w.actual !== null && completed) {
        await putExpense(o, p.prop.id, {
          category: w.capitalized ? 'RENOVATION' : 'ROUTINE_MAINTENANCE',
          label: w.title,
          amount: w.actual,
          paidAt: completed,
          supplier: w.supplier,
          capitalized: w.capitalized
        });
      }
    }
  });
  log(`patrimoine propre : ${created} programme(s) de travaux (à venir, en cours, terminés, abandonné).`);
}

// ------------------------------------------------------------------ fiscalité, hypothèses, plan de trésorerie

export async function seedTaxYieldAndCashPlan(o: OwnState, profiles: Profile[]): Promise<void> {
  const { prisma, tenantId, log } = o.ctx;
  let yields = 0;
  let taxes = 0;
  for (const p of profiles) {
    const rngY = p.fork('yield');
    const commercial = p.prop.commercial;
    const parking = p.prop.type === 'PARKING_BOX';
    if (
      !(await prisma.propertyYieldAssumption.findUnique({ where: { propertyId: p.prop.id }, select: { id: true } }))
    ) {
      // FRACTIONS : le moteur de rendement calcule `1 + taux`.
      await prisma.propertyYieldAssumption.create({
        data: {
          tenantId,
          propertyId: p.prop.id,
          years: pick(rngY, [10, 10, 15]),
          valueGrowthRate: Math.round(p.growth * 1000) / 1000,
          rentGrowthRate: Math.round((0.02 + rngY() * 0.02) * 1000) / 1000,
          expenseGrowthRate: Math.round((0.03 + rngY() * 0.015) * 1000) / 1000,
          vacancyRate: parking ? 0.03 : commercial ? 0.08 : 0.05,
          updatedByUserId: author(o)
        }
      });
      yields += 1;
    }
    if (!(await prisma.propertyTaxProfile.findUnique({ where: { propertyId: p.prop.id }, select: { id: true } }))) {
      await prisma.propertyTaxProfile.create({
        data: {
          tenantId,
          propertyId: p.prop.id,
          country: 'CI',
          builtStatus: 'BUILT',
          occupancy: p.leased ? 'RENTED' : 'VACANT',
          declaredRentalValue: p.leased ? p.annualRent : null,
          notes: p.leased
            ? 'Revenus fonciers déclarés chaque année auprès du guichet unique de la DGI (échéance fin avril).'
            : 'Bien vacant : taxe foncière seule, pas de revenus fonciers tant qu’il n’est pas reloué.',
          updatedByUserId: author(o)
        }
      });
      taxes += 1;
    }
  }
  const settings = await prisma.patrimonyCashPlanSettings.findUnique({ where: { tenantId }, select: { id: true } });
  if (!settings) {
    await prisma.patrimonyCashPlanSettings.create({
      data: { tenantId, propertyTaxDueMonth: 3, propertyTaxDueDay: 31, updatedByUserId: o.ctx.adminUserId }
    });
  }
  log(
    `patrimoine propre : ${yields} hypothèse(s) de rendement, ${taxes} profil(s) fiscal(aux)${settings ? '' : ', échéance de taxe foncière au 31 mars'}.`
  );
}
