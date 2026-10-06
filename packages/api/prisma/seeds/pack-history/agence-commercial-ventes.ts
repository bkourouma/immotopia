/**
 * Ventes de l'agence « 3 ans » : biens confiés aux propriétaires (mandats de
 * gestion), mandats de vente, offres, compromis, commissions et leurs
 * règlements, acquéreurs et affaires gagnées ou perdues correspondantes.
 *
 * Principes :
 *  - les histoires de vente sont planifiées d'abord (dates, montants, statuts),
 *    puis écrites dans l'ordre chronologique : la numérotation annuelle
 *    (MV-, OA-, CV-, HT-, RC-) suit les dates ;
 *  - les règlements de commission passent par le vrai service
 *    (`createCommissionPayment`) : écritures comptables équilibrées, statut de
 *    la commission recalculé ;
 *  - aucun envoi sortant.
 */
import type { Prisma, PropertyStatus } from '@prisma/client';
import { between, pick } from './types';
import { DEAL_TRACES, ivorianPhone, randomPerson, slugify, COMPANY_NAMES, ZONES } from './agence-data';
import {
  CONDITION_LABELS,
  DEAL_NOTES,
  MANDATE_NOTES,
  NOTARIES,
  OFFER_CONDITIONS,
  REJECT_REASONS,
  WITHDRAW_REASONS,
  addDays,
  roundTo
} from './agence-commercial-data';
import type { CommercialEnv } from './agence-commercial-data';

type Scenario =
  | 'SOLD_PAID'
  | 'SOLD_PARTIAL'
  | 'SOLD_DUE_RECENT'
  | 'AGREEMENT_SIGNED'
  | 'AGREEMENT_CANCELLED'
  | 'RESERVED'
  | 'ACTIVE_OFFERS'
  | 'ACTIVE_EXPIRING'
  | 'EXPIRED'
  | 'REVOKED'
  | 'OCCUPIED_ACTIVE';

/** Ordre d'attribution aux biens vacants à vendre, du plus ancien au plus récent. */
const VACANT_SCENARIOS: readonly Scenario[] = [
  'SOLD_PAID',
  'SOLD_PAID',
  'EXPIRED',
  'SOLD_PARTIAL',
  'AGREEMENT_CANCELLED',
  'SOLD_DUE_RECENT',
  'AGREEMENT_SIGNED',
  'ACTIVE_EXPIRING',
  'REVOKED',
  'RESERVED'
];

const DEED_AGO: Partial<Record<Scenario, number[]>> = {
  SOLD_PAID: [640, 430],
  SOLD_PARTIAL: [150],
  SOLD_DUE_RECENT: [3]
};

interface SaleProp {
  id: string;
  title: string;
  price: number;
  status: string;
  createdAt: Date;
  sellerClientId: string;
  sellerUserId: string;
  sellerEmail: string;
}

interface BuyerPlan {
  key: string;
  firstName: string;
  lastName: string;
  company: string | null;
  phone: string;
  created: Date;
  contactId?: string;
}

interface ConditionPlan {
  label: string;
  due: Date | null;
  status: 'PENDING' | 'MET' | 'FAILED' | 'WAIVED';
  resolvedAt: Date | null;
}

interface MilestonePlan {
  label: string;
  due: Date | null;
  amount: number;
  paidAt: Date | null;
}

interface PaymentPlan {
  at: Date;
  /** Part du montant TTC de la commission ; la dernière d'une commission soldée prend le reste. */
  fraction: number;
  settle?: boolean;
  voidThenRepost?: boolean;
}

interface AgreementPlan {
  created: Date;
  price: number;
  deposit: number;
  holder: 'NOTARY' | 'SELLER';
  notary: string;
  signedAt: Date | null;
  expectedDeed: Date | null;
  deedDate: Date | null;
  status: 'DRAFT' | 'SIGNED' | 'COMPLETED' | 'CANCELLED';
  cancelledAt: Date | null;
  cancelReason: string | null;
  conditions: ConditionPlan[];
  milestones: MilestonePlan[];
  payments: PaymentPlan[];
}

type OfferStatus = 'SUBMITTED' | 'COUNTERED' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';

interface OfferPlan {
  key: string;
  mandateKey: string;
  buyer: BuyerPlan;
  amount: number;
  financing: 'CASH' | 'LOAN' | 'MIXED';
  conditions: string;
  created: Date;
  validUntil: Date | null;
  status: OfferStatus;
  counterAmount: number | null;
  decidedAt: Date | null;
  reason: string | null;
  agreement: AgreementPlan | null;
}

interface MandatePlan {
  key: string;
  scenario: Scenario;
  prop: SaleProp;
  type: 'SIMPLE' | 'EXCLUSIVE';
  asking: number;
  minimum: number;
  mode: 'PERCENT' | 'FIXED';
  rate: number | null;
  fixed: number | null;
  payer: 'SELLER' | 'BUYER';
  agentUserId: string;
  agentShare: number;
  start: Date;
  end: Date | null;
  status: 'ACTIVE' | 'REVOKED' | 'COMPLETED';
  revokedAt: Date | null;
  revokeReason: string | null;
  notes: string;
  /** Date de clôture du mandat de gestion (vente conclue). */
  managementClosedAt: Date | null;
  offers: OfferPlan[];
}

const HOUR = 10;

function at(end: Date, daysAgo: number): Date {
  const d = addDays(end, -daysAgo);
  d.setHours(HOUR, 0, 0, 0);
  return d;
}

/** Force un enchaînement croissant (au moins un jour d'écart) puis plafonne à « hier ». */
function chain(end: Date, dates: Date[]): Date[] {
  const cap = addDays(end, -1).getTime();
  const out: Date[] = [];
  for (let i = 0; i < dates.length; i++) {
    let t = dates[i].getTime();
    if (i > 0) t = Math.max(t, out[i - 1].getTime() + 86_400_000);
    out.push(new Date(Math.min(t, cap)));
  }
  return out;
}

function priceStep(price: number): number {
  return price >= 100_000_000 ? 1_000_000 : price >= 20_000_000 ? 500_000 : 100_000;
}

export async function seedVentes(env: CommercialEnv): Promise<void> {
  const { prisma, tenantId, rng, ctx, staff, log } = env;

  const alreadyMandates = await prisma.saleMandate.count({ where: { tenantId } });
  const alreadyManagement = await prisma.propertyMandate.count({ where: { tenantId } });
  const alreadyRates = await prisma.agentCommissionRate.count({ where: { tenantId } });

  // ─────────────────────────────────────────── taux de partage des négociateurs
  if (alreadyRates === 0) {
    const shares = [40, 35, 45, 30, 50, 38];
    let i = 0;
    for (const userId of staff) {
      await prisma.agentCommissionRate.create({
        data: { tenantId, userId, sharePercent: shares[i % shares.length], createdAt: ctx.start }
      });
      i += 1;
    }
    log(`commercial : ${staff.length} taux de partage de commission par négociateur.`);
  }

  if (alreadyMandates > 0 && alreadyManagement > 0) {
    log('commercial : mandats et ventes déjà présents.');
    return;
  }

  // ───────────────────────────────────────────────────────────── biens et vendeurs
  const ownerClients = await prisma.tenantClient.findMany({
    where: { tenantId, clientType: 'OWNER' },
    select: { id: true, userId: true, user: { select: { email: true } } },
    orderBy: { createdAt: 'asc' }
  });
  if (ownerClients.length === 0) {
    log('commercial : aucun propriétaire client, mandats non créés.');
    return;
  }
  const properties = await prisma.property.findMany({
    where: { tenantId },
    select: {
      id: true,
      title: true,
      price: true,
      status: true,
      createdAt: true,
      ownershipType: true,
      transactionModes: true,
      ownershipShares: {
        select: { ownerClientId: true, sharePercent: true },
        orderBy: { sharePercent: 'desc' }
      }
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  });
  const clientById = new Map(ownerClients.map(c => [c.id, c]));

  // Un bien à vendre porte toujours un vendeur : on l'attribue à un propriétaire si besoin.
  if (alreadyMandates === 0) {
    for (const p of properties) {
      if (!p.transactionModes.includes('SALE') || p.ownershipShares.length > 0) continue;
      const owner = pick(rng, ownerClients);
      await prisma.propertyOwnershipShare.create({
        data: {
          tenantId,
          propertyId: p.id,
          ownerClientId: owner.id,
          sharePercent: 100,
          updatedByUserId: env.adminUserId
        }
      });
      p.ownershipShares = [{ ownerClientId: owner.id, sharePercent: 100 as unknown as Prisma.Decimal }];
    }
  }

  const saleProps: SaleProp[] = [];
  for (const p of properties) {
    if (!p.transactionModes.includes('SALE') || p.ownershipShares.length === 0) continue;
    const client = clientById.get(p.ownershipShares[0].ownerClientId);
    if (!client) continue;
    saleProps.push({
      id: p.id,
      title: p.title,
      price: Number(p.price ?? 0),
      status: p.status,
      createdAt: p.createdAt,
      sellerClientId: client.id,
      sellerUserId: client.userId,
      sellerEmail: client.user.email
    });
  }

  // ─────────────────────────────────────────────────────────── planification
  const plans: MandatePlan[] = [];
  if (alreadyMandates === 0) {
    const vacant = saleProps.filter(p => p.status !== 'RENTED' && p.price > 0);
    const occupied = saleProps.filter(p => p.status === 'RENTED' && p.price > 0);
    const used = new Map<Scenario, number>();
    vacant.forEach((p, i) => {
      const scenario = i < VACANT_SCENARIOS.length ? VACANT_SCENARIOS[i] : 'ACTIVE_OFFERS';
      const k = used.get(scenario) ?? 0;
      used.set(scenario, k + 1);
      plans.push(planMandate(env, scenario, p, k, plans.length));
    });
    occupied.slice(0, 3).forEach((p, i) => {
      plans.push(planMandate(env, 'OCCUPIED_ACTIVE', p, i, plans.length));
    });
  }

  // ───────────────────────────── mandats de gestion (et passage en bien de client)
  if (alreadyManagement === 0) {
    await seedManagementMandates(env, properties, plans);
  }

  if (plans.length === 0) {
    log('commercial : aucun mandat de vente à écrire.');
    return;
  }

  await writeSales(env, plans);
}

// ──────────────────────────────────────────────────────── mandats de gestion

async function seedManagementMandates(
  env: CommercialEnv,
  properties: Array<{
    id: string;
    createdAt: Date;
    ownershipType: string;
    status: string;
    ownershipShares: Array<{ ownerClientId: string }>;
  }>,
  plans: MandatePlan[]
): Promise<void> {
  const { prisma, tenantId, rng, ctx, adminUserId, log } = env;
  const soldByProperty = new Map<string, MandatePlan>();
  for (const plan of plans) if (plan.managementClosedAt) soldByProperty.set(plan.prop.id, plan);

  const clients = await prisma.tenantClient.findMany({
    where: { tenantId, clientType: 'OWNER' },
    select: { id: true, userId: true }
  });
  const userByClient = new Map(clients.map(c => [c.id, c.userId]));

  let converted = 0;
  let mandates = 0;
  let expiring = 0;
  for (const p of properties) {
    const share = p.ownershipShares[0];
    if (!share) continue;
    const ownerUserId = userByClient.get(share.ownerClientId);
    if (!ownerUserId) continue;

    if (p.ownershipType === 'TENANT') {
      await prisma.property.update({
        where: { id: p.id },
        data: { ownershipType: 'CLIENT', ownerUserId }
      });
      converted += 1;
    }

    const start = addDays(p.createdAt, -between(rng, 0, 8));
    const scope = {
      gestionLocative: true,
      encaissementDesLoyers: true,
      travauxPlafond: pick(rng, [150_000, 250_000, 500_000]),
      vente: plans.some(pl => pl.prop.id === p.id)
    };
    const sold = soldByProperty.get(p.id);
    if (sold) {
      const closed = sold.managementClosedAt as Date;
      await prisma.propertyMandate.create({
        data: {
          propertyId: p.id,
          tenantId,
          ownerUserId,
          startDate: start,
          endDate: closed,
          scope,
          notes: 'Bien vendu : le mandat est clos à la signature de l’acte de vente.',
          isActive: false,
          revokedAt: closed,
          revokedByUserId: adminUserId,
          createdAt: start
        }
      });
      mandates += 1;
      continue;
    }

    const ageDays = Math.floor((ctx.end.getTime() - start.getTime()) / 86_400_000);
    const firstTerm = ageDays > 500 ? 365 : ageDays > 200 ? pick(rng, [365, 730]) : pick(rng, [365, 730, 1095]);
    if (ageDays <= firstTerm - 25) {
      // Un seul mandat, encore en cours.
      let end = addDays(start, firstTerm);
      if (expiring < 7 && rng() < 0.25 && ageDays > 330) {
        end = addDays(ctx.end, between(rng, 6, 55));
        expiring += 1;
      }
      await prisma.propertyMandate.create({
        data: {
          propertyId: p.id,
          tenantId,
          ownerUserId,
          startDate: start,
          endDate: end,
          scope,
          notes: pick(rng, [
            'Mandat de gestion locative signé à la remise des clés du bien.',
            'Gestion complète : recherche de locataire, encaissement des loyers et suivi des travaux.',
            'Le propriétaire souhaite un compte rendu mensuel détaillé.'
          ]),
          isActive: true,
          createdAt: start
        }
      });
      mandates += 1;
    } else {
      // Mandat arrivé à échéance puis renouvelé : une ligne close, une ligne active.
      const firstEnd = addDays(start, 365);
      const secondStart = addDays(firstEnd, 1);
      await prisma.propertyMandate.create({
        data: {
          propertyId: p.id,
          tenantId,
          ownerUserId,
          startDate: start,
          endDate: firstEnd,
          scope,
          notes: 'Mandat arrivé à échéance, renouvelé avec le propriétaire.',
          isActive: false,
          createdAt: start
        }
      });
      let secondEnd = addDays(secondStart, 365 * between(rng, 1, 3));
      let guard = 0;
      while (secondEnd < addDays(ctx.end, 20) && guard < 6) {
        secondEnd = addDays(secondEnd, 365);
        guard += 1;
      }
      if (expiring < 7 && rng() < 0.2) {
        secondEnd = addDays(ctx.end, between(rng, 6, 55));
        expiring += 1;
      }
      await prisma.propertyMandate.create({
        data: {
          propertyId: p.id,
          tenantId,
          ownerUserId,
          startDate: secondStart,
          endDate: secondEnd,
          scope,
          notes: 'Mandat renouvelé : honoraires de gestion inchangés.',
          isActive: true,
          createdAt: secondStart
        }
      });
      mandates += 2;
    }
  }
  log(
    `commercial : ${converted} biens confiés par leur propriétaire, ${mandates} mandats de gestion ` +
      `(${expiring} arrivent à échéance dans les deux mois).`
  );
}

// ──────────────────────────────────────────────────────────── planification

function planMandate(env: CommercialEnv, scenario: Scenario, prop: SaleProp, index: number, n: number): MandatePlan {
  const { rng, ctx, staff } = env;
  const now = ctx.end;
  const key = `m${n}`;
  const asking = roundTo(prop.price, priceStep(prop.price));
  const minimum = roundTo(asking * 0.92, priceStep(prop.price));
  const fixedMode = prop.price >= 60_000_000 && prop.price <= 110_000_000 && scenario !== 'SOLD_PAID' && rng() < 0.4;
  const rate = pick(rng, [3, 3.5, 4, 5]);
  const agentUserId = pick(rng, staff);
  const plan: MandatePlan = {
    key,
    scenario,
    prop,
    type: rng() < 0.5 ? 'EXCLUSIVE' : 'SIMPLE',
    asking,
    minimum,
    mode: fixedMode ? 'FIXED' : 'PERCENT',
    rate: fixedMode ? null : rate,
    fixed: fixedMode ? roundTo(asking * 0.035, 100_000) : null,
    payer: scenario === 'SOLD_PARTIAL' ? 'BUYER' : 'SELLER',
    agentUserId,
    agentShare: pick(rng, [35, 40, 40, 45, 50]),
    start: now,
    end: null,
    status: 'ACTIVE',
    revokedAt: null,
    revokeReason: null,
    notes: pick(rng, MANDATE_NOTES),
    managementClosedAt: null,
    offers: []
  };

  const minStart = addDays(prop.createdAt, 6).getTime();
  const shiftTo = (dates: Date[]): Date[] => {
    const first = dates[0].getTime();
    const delta = first < minStart ? minStart - first : 0;
    return chain(
      now,
      dates.map(d => new Date(d.getTime() + delta))
    );
  };

  let offerN = 0;
  const makeOffer = (
    created: Date,
    status: OfferStatus,
    opts: Partial<OfferPlan> & { amountFactor?: number } = {}
  ): OfferPlan => {
    offerN += 1;
    const person = randomPerson(rng);
    const company = rng() < 0.12 ? `SARL ${pick(rng, COMPANY_NAMES)}` : null;
    const factor = opts.amountFactor ?? between(rng, 91, 99) / 100;
    const amount = roundTo(asking * factor, priceStep(prop.price));
    const financing = pick(rng, ['LOAN', 'CASH', 'MIXED', 'LOAN'] as const);
    return {
      key: `${key}o${offerN}`,
      mandateKey: key,
      buyer: {
        key: `${key}b${offerN}`,
        firstName: person.firstName,
        lastName: person.lastName,
        company,
        phone: ivorianPhone(rng),
        created: addDays(created, -between(rng, 22, 48))
      },
      amount,
      financing,
      conditions: pick(rng, OFFER_CONDITIONS),
      created,
      validUntil: addDays(created, 21),
      status,
      counterAmount: null,
      decidedAt: null,
      reason: null,
      agreement: null,
      ...opts
    };
  };

  const buildAgreement = (
    accepted: OfferPlan,
    dates: { created: Date; signed: Date | null; expectedDeed: Date | null; deed: Date | null },
    status: AgreementPlan['status'],
    extra: Partial<AgreementPlan> = {}
  ): AgreementPlan => {
    const price = accepted.counterAmount ?? accepted.amount;
    const deposit = roundTo(price * 0.1, priceStep(prop.price));
    const loan = accepted.financing !== 'CASH';
    const conditions: ConditionPlan[] = [];
    if (loan) {
      conditions.push({
        label: CONDITION_LABELS[0],
        due: addDays(dates.created, 45),
        status: 'PENDING',
        resolvedAt: null
      });
    }
    conditions.push({
      label: CONDITION_LABELS[1],
      due: addDays(dates.created, 30),
      status: 'PENDING',
      resolvedAt: null
    });
    if (rng() < 0.6) {
      conditions.push({
        label: CONDITION_LABELS[2],
        due: addDays(dates.created, 25),
        status: 'PENDING',
        resolvedAt: null
      });
    }
    const signed = dates.signed;
    const milestones: MilestonePlan[] = [
      { label: 'Acompte à la signature du compromis', due: signed, amount: deposit, paidAt: signed },
      {
        label: 'Versement intermédiaire',
        due: signed ? addDays(signed, 20) : null,
        amount: roundTo(price * 0.4, priceStep(prop.price)),
        paidAt: null
      },
      {
        label: 'Solde à la signature de l’acte',
        due: dates.expectedDeed ?? dates.deed,
        amount: price - deposit - roundTo(price * 0.4, priceStep(prop.price)),
        paidAt: null
      }
    ];
    return {
      created: dates.created,
      price,
      deposit,
      holder: pick(rng, ['NOTARY', 'NOTARY', 'SELLER'] as const),
      notary: pick(rng, NOTARIES),
      signedAt: signed,
      expectedDeed: dates.expectedDeed,
      deedDate: dates.deed,
      status,
      cancelledAt: null,
      cancelReason: null,
      conditions,
      milestones,
      payments: [],
      ...extra
    };
  };

  const resolveConditions = (a: AgreementPlan, mode: 'ALL_MET' | 'MIXED' | 'LOAN_FAILED'): void => {
    a.conditions.forEach((c, i) => {
      const resolved = a.signedAt ? addDays(a.signedAt, 6 + i * 7) : null;
      if (mode === 'ALL_MET') {
        c.status = i === a.conditions.length - 1 && rng() < 0.3 ? 'WAIVED' : 'MET';
        c.resolvedAt = resolved;
      } else if (mode === 'LOAN_FAILED') {
        if (c.label === CONDITION_LABELS[0]) {
          c.status = 'FAILED';
          c.resolvedAt = a.cancelledAt;
        } else {
          c.status = 'MET';
          c.resolvedAt = resolved;
        }
      } else if (i === 0) {
        c.status = 'MET';
        c.resolvedAt = resolved;
      }
    });
  };

  const settleMilestones = (a: AgreementPlan, until: Date): void => {
    for (const m of a.milestones) {
      if (m.due && m.due <= until) m.paidAt = m.due;
    }
  };

  switch (scenario) {
    case 'SOLD_PAID':
    case 'SOLD_PARTIAL':
    case 'SOLD_DUE_RECENT': {
      const base = (DEED_AGO[scenario] ?? [200])[index] ?? 200;
      // L'acte récent tombe dans le mois en cours (tableau de bord « ce mois-ci »), quel que soit le jour du seed.
      const ago = scenario === 'SOLD_DUE_RECENT' ? Math.max(1, Math.min(now.getUTCDate() - 1, base)) : base;
      const deed = at(now, ago);
      const signed = addDays(deed, -38);
      const agrCreated = addDays(signed, -3);
      const accepted = addDays(agrCreated, -4);
      const mainCreated = addDays(accepted, -8);
      const withdrawnAt = addDays(mainCreated, -12);
      const rejectedAt = addDays(mainCreated, -20);
      const start = addDays(rejectedAt, -18);
      const [s, rj, wd, mo, ac, ag, sg, dd] = shiftTo([
        start,
        rejectedAt,
        withdrawnAt,
        mainCreated,
        accepted,
        agrCreated,
        signed,
        deed
      ]);
      plan.start = s;
      plan.end = addDays(s, 183);
      plan.status = 'COMPLETED';
      plan.managementClosedAt = dd;

      const rejected = makeOffer(rj, 'REJECTED', {
        amountFactor: 0.82,
        decidedAt: addDays(rj, 3),
        reason: pick(rng, REJECT_REASONS)
      });
      const withdrawn = makeOffer(wd, 'WITHDRAWN', {
        amountFactor: 0.88,
        decidedAt: addDays(wd, 6),
        reason: pick(rng, WITHDRAW_REASONS)
      });
      const main = makeOffer(mo, 'ACCEPTED', {
        decidedAt: ac,
        counterAmount: rng() < 0.4 ? roundTo(asking * 0.96, priceStep(prop.price)) : null
      });
      const agr = buildAgreement(main, { created: ag, signed: sg, expectedDeed: dd, deed: dd }, 'COMPLETED');
      resolveConditions(agr, 'ALL_MET');
      settleMilestones(agr, dd);
      agr.milestones.forEach(m => (m.paidAt = m.due));
      main.agreement = agr;
      if (scenario === 'SOLD_PAID') {
        agr.payments =
          index === 0
            ? [
                { at: dd, fraction: 0.5 },
                { at: addDays(dd, 21), fraction: 0.5, settle: true }
              ]
            : [
                { at: addDays(dd, 2), fraction: 0.4, voidThenRepost: true },
                { at: addDays(dd, 30), fraction: 0.6, settle: true }
              ];
      } else if (scenario === 'SOLD_PARTIAL') {
        agr.payments = [
          { at: addDays(dd, 3), fraction: 0.5 },
          { at: at(now, Math.max(1, Math.min(now.getUTCDate() - 1, 2))), fraction: 0.2 }
        ];
      }
      plan.offers.push(rejected, withdrawn, main);
      break;
    }
    case 'AGREEMENT_SIGNED': {
      const start0 = at(now, 220);
      const rejectedAt = at(now, 175);
      const mainCreated = at(now, 66);
      const accepted = at(now, 58);
      const agrCreated = at(now, 52);
      const signed = at(now, 45);
      const [s, rj, mo, ac, ag, sg] = shiftTo([start0, rejectedAt, mainCreated, accepted, agrCreated, signed]);
      plan.start = s;
      plan.end = addDays(s, 365);
      plan.type = 'EXCLUSIVE';
      const rejected = makeOffer(rj, 'REJECTED', {
        amountFactor: 0.8,
        decidedAt: addDays(rj, 4),
        reason: pick(rng, REJECT_REASONS)
      });
      const main = makeOffer(mo, 'ACCEPTED', { decidedAt: ac, financing: 'MIXED' });
      const agr = buildAgreement(
        main,
        { created: ag, signed: sg, expectedDeed: addDays(now, 25), deed: null },
        'SIGNED'
      );
      resolveConditions(agr, 'MIXED');
      agr.conditions.forEach(c => {
        if (c.status === 'PENDING') c.due = addDays(now, between(rng, 8, 20));
      });
      agr.milestones[0].paidAt = sg;
      agr.milestones[1].paidAt = addDays(now, -5);
      agr.milestones[1].due = addDays(now, -5);
      agr.milestones[2].due = addDays(now, 25);
      main.agreement = agr;
      plan.offers.push(rejected, main);
      break;
    }
    case 'AGREEMENT_CANCELLED': {
      const start0 = at(now, 330);
      const o1 = at(now, 265);
      const acc1 = at(now, 259);
      const agrCreated = at(now, 255);
      const signed = at(now, 249);
      const cancelled = at(now, 196);
      const o2 = at(now, 14);
      const [s, c1, a1, ag, sg, cn, c2] = shiftTo([start0, o1, acc1, agrCreated, signed, cancelled, o2]);
      plan.start = s;
      plan.end = addDays(now, 140);
      plan.type = 'SIMPLE';
      plan.notes = 'Mandat prolongé après l’échec de la première vente : le vendeur maintient son prix.';
      const first = makeOffer(c1, 'ACCEPTED', { decidedAt: a1, financing: 'LOAN' });
      const agr = buildAgreement(
        first,
        { created: ag, signed: sg, expectedDeed: addDays(sg, 60), deed: null },
        'CANCELLED',
        {
          cancelledAt: cn,
          cancelReason:
            'Condition suspensive d’obtention du prêt non réalisée : la banque de l’acquéreur a refusé le financement.'
        }
      );
      resolveConditions(agr, 'LOAN_FAILED');
      agr.milestones[1].due = null;
      agr.milestones[2].due = null;
      first.agreement = agr;
      const second = makeOffer(c2, 'SUBMITTED', { financing: 'CASH', amountFactor: 0.94 });
      plan.offers.push(first, second);
      break;
    }
    case 'RESERVED': {
      const start0 = at(now, 80);
      const o1 = at(now, 34);
      const o2 = at(now, 20);
      const accepted = at(now, 7);
      const agrCreated = at(now, 3);
      const [s, c1, c2, ac, ag] = shiftTo([start0, o1, o2, accepted, agrCreated]);
      plan.start = s;
      plan.end = addDays(s, 365);
      plan.type = 'EXCLUSIVE';
      const early = makeOffer(c1, 'REJECTED', {
        amountFactor: 0.85,
        decidedAt: addDays(c1, 2),
        reason: pick(rng, REJECT_REASONS)
      });
      const main = makeOffer(c2, 'ACCEPTED', {
        decidedAt: ac,
        counterAmount: roundTo(asking * 0.97, priceStep(prop.price)),
        financing: 'CASH'
      });
      main.agreement = buildAgreement(
        main,
        { created: ag, signed: null, expectedDeed: addDays(now, 50), deed: null },
        'DRAFT'
      );
      main.agreement.milestones = main.agreement.milestones.map(m => ({ ...m, due: null, paidAt: null }));
      plan.offers.push(early, main);
      break;
    }
    case 'ACTIVE_EXPIRING': {
      const end = addDays(now, between(rng, 9, 15));
      const s = shiftTo([addDays(end, -183)])[0];
      plan.start = s;
      plan.end = end;
      plan.type = 'EXCLUSIVE';
      plan.notes = 'Mandat exclusif de six mois : renouvellement à proposer au vendeur avant l’échéance.';
      const [o1, o2] = chain(now, [addDays(s, 40), at(now, 4)]);
      plan.offers.push(
        makeOffer(o1, 'COUNTERED', {
          amountFactor: 0.86,
          decidedAt: addDays(o1, 3),
          counterAmount: roundTo(asking * 0.95, priceStep(prop.price)),
          reason: 'Le vendeur propose un prix intermédiaire, sans aller sous le plancher.',
          validUntil: addDays(o1, 30)
        }),
        makeOffer(o2, 'SUBMITTED', { amountFactor: 0.9, validUntil: addDays(now, 12) })
      );
      break;
    }
    case 'EXPIRED': {
      const end = addDays(now, -24);
      const s = shiftTo([addDays(end, -183)])[0];
      plan.start = s;
      plan.end = end;
      plan.type = 'SIMPLE';
      plan.notes = 'Mandat échu sans renouvellement : relancer le vendeur pour le proroger ou le clore.';
      const c1 = addDays(s, 60);
      const c2 = addDays(end, -35);
      const [o1, o2] = chain(now, [c1, c2]);
      plan.offers.push(
        makeOffer(o1, 'REJECTED', { amountFactor: 0.8, decidedAt: addDays(o1, 4), reason: pick(rng, REJECT_REASONS) }),
        makeOffer(o2, 'SUBMITTED', { amountFactor: 0.85, validUntil: addDays(o2, 21) })
      );
      break;
    }
    case 'REVOKED': {
      const revokedAt = at(now, 120);
      const s = shiftTo([addDays(revokedAt, -230)])[0];
      plan.start = s;
      plan.end = addDays(s, 365);
      plan.status = 'REVOKED';
      plan.revokedAt = shiftTo([revokedAt])[0];
      plan.revokeReason = 'Le vendeur a retiré le bien de la vente pour le conserver dans le patrimoine familial.';
      const [o1, o2] = chain(now, [addDays(s, 70), addDays(s, 130)]);
      plan.offers.push(
        makeOffer(o1, 'WITHDRAWN', {
          amountFactor: 0.87,
          decidedAt: addDays(o1, 9),
          reason: pick(rng, WITHDRAW_REASONS)
        }),
        makeOffer(o2, 'REJECTED', {
          amountFactor: 0.9,
          decidedAt: plan.revokedAt as Date,
          reason: 'Mandat révoqué'
        })
      );
      break;
    }
    case 'ACTIVE_OFFERS': {
      const s = shiftTo([at(now, between(rng, 60, 130))])[0];
      plan.start = s;
      plan.end = addDays(s, 365);
      const o = chain(now, [addDays(s, 15), addDays(s, 38)]);
      plan.offers.push(
        makeOffer(o[0], 'REJECTED', {
          amountFactor: 0.82,
          decidedAt: addDays(o[0], 3),
          reason: pick(rng, REJECT_REASONS)
        }),
        makeOffer(o[1], 'SUBMITTED', { amountFactor: 0.93, validUntil: addDays(now, between(rng, 3, 14)) })
      );
      break;
    }
    case 'OCCUPIED_ACTIVE': {
      const s = shiftTo([at(now, between(rng, 90, 200))])[0];
      plan.start = s;
      plan.end = addDays(s, 365);
      plan.type = 'SIMPLE';
      plan.notes =
        'Bien occupé : visites uniquement sur rendez-vous avec le locataire en place, vente avec bail en cours.';
      if (index === 0) {
        const o = chain(now, [addDays(s, 40)]);
        plan.offers.push(makeOffer(o[0], 'SUBMITTED', { amountFactor: 0.92, validUntil: addDays(now, 9) }));
      }
      break;
    }
  }
  return plan;
}

// ─────────────────────────────────────────────────────────────── écriture

async function writeSales(env: CommercialEnv, plans: MandatePlan[]): Promise<void> {
  const { prisma, tenantId, rng, ctx, adminUserId, log } = env;
  const { computeCommissionAmounts } = await import('../../../src/lib/sales/commissions');
  const { createCommissionPayment, voidCommissionPayment } = await import('../../../src/lib/sales/commissions');
  const { getAgencyFinanceSettings } = await import('../../../src/lib/settings/finance-settings');
  const { nextSequenceTx, mandateNumber } = await import('../../../src/lib/sales/numbering');

  const year = (d: Date): number => d.getUTCFullYear();

  // 1. Mandats de vente, dans l'ordre chronologique.
  const mandateIds = new Map<string, string>();
  const mandateRows = new Map<string, Awaited<ReturnType<typeof prisma.saleMandate.create>>>();
  for (const plan of [...plans].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    const y = year(plan.start);
    const sequence = await nextSequenceTx(prisma.saleMandate, tenantId, y);
    const row = await prisma.saleMandate.create({
      data: {
        tenantId,
        year: y,
        sequence,
        propertyId: plan.prop.id,
        sellerClientId: plan.prop.sellerClientId,
        mandateType: plan.type,
        askingPrice: plan.asking,
        minimumPrice: plan.minimum,
        commissionMode: plan.mode,
        commissionRate: plan.rate,
        commissionFixedAmount: plan.fixed,
        commissionPayer: plan.payer,
        agentUserId: plan.agentUserId,
        agentSharePercent: plan.agentShare,
        startDate: plan.start,
        endDate: plan.end,
        status: plan.status,
        revokedAt: plan.revokedAt,
        revokedByUserId: plan.revokedAt ? adminUserId : null,
        revokeReason: plan.revokeReason,
        notes: plan.notes,
        createdAt: plan.start
      }
    });
    mandateIds.set(plan.key, row.id);
    mandateRows.set(plan.key, row);
  }
  log(`commercial : ${plans.length} mandats de vente (premier : ${mandateNumber(year(plans[0].start), 1)}).`);

  // 2. Vendeurs : affaire « vente » gagnée à la signature du mandat.
  const contactByEmail = new Map(
    (
      await prisma.crmContact.findMany({
        where: { tenantId, email: { in: Array.from(new Set(plans.map(p => p.prop.sellerEmail))) } },
        select: { id: true, email: true, createdAt: true }
      })
    ).map(c => [c.email, c])
  );
  for (const plan of plans) {
    const seller = contactByEmail.get(plan.prop.sellerEmail);
    if (!seller) continue;
    const created = new Date(
      Math.max(seller.createdAt.getTime(), addDays(plan.start, -between(rng, 12, 30)).getTime())
    );
    const deal = await prisma.crmDeal.create({
      data: {
        tenantId,
        contactId: seller.id,
        type: 'VENTE',
        stage: 'WON',
        locationZone: pick(rng, ZONES).name,
        expectedValue: plan.asking,
        probability: 1,
        assignedToUserId: plan.agentUserId,
        closedAt: plan.start,
        closedReason: 'Mandat de vente signé',
        createdAt: created
      },
      select: { id: true }
    });
    await prisma.crmDealProperty.create({
      data: { tenantId, dealId: deal.id, propertyId: plan.prop.id, matchScore: 100, status: 'SELECTED' }
    });
    await traces(env, seller.id, deal.id, 'VENTE', created, plan.start, plan.agentUserId, 3);
  }

  // 3. Acquéreurs et affaires d'achat.
  const offers = plans.flatMap(p => p.offers.map(o => ({ plan: p, offer: o })));
  let buyerCounter = 7000;
  const dealIds = new Map<string, string>();
  for (const { plan, offer } of offers.sort((a, b) => a.offer.created.getTime() - b.offer.created.getTime())) {
    buyerCounter += 1;
    const b = offer.buyer;
    const email = `${slugify(b.firstName)}.${slugify(b.lastName)}.${buyerCounter}.${env.tag}@example.ci`;
    const won = offer.agreement?.status === 'COMPLETED';
    const stage = dealStage(offer);
    const contact = await prisma.crmContact.create({
      data: {
        tenantId,
        contactType: b.company ? 'COMPANY' : 'PERSON',
        firstName: b.firstName,
        lastName: b.lastName,
        legalName: b.company,
        representativeName: b.company ? `${b.firstName} ${b.lastName}` : null,
        representativeRole: b.company ? 'Gérant' : null,
        email,
        phonePrimary: b.phone,
        whatsappNumber: b.phone,
        city: 'Abidjan',
        country: "Côte d'Ivoire",
        locationZone: pick(rng, ZONES).name,
        preferredLanguage: 'fr',
        source: pick(rng, ['Site web', 'Recommandation', 'Passage en agence', 'Appel entrant']),
        leadSource: pick(rng, ['WEBSITE', 'REFERRAL', 'WALK_IN', 'PHONE_CALL'] as const),
        maturityLevel: stage === 'WON' ? 'HOT' : pick(rng, ['WARM', 'HOT'] as const),
        score: between(rng, 55, 95),
        status: won ? 'ACTIVE_CLIENT' : 'LEAD',
        assignedToUserId: plan.agentUserId,
        borrowingCapacity: offer.financing === 'CASH' ? 'YES' : pick(rng, ['YES', 'UNKNOWN'] as const),
        consentMarketing: false,
        consentWhatsapp: false,
        consentEmail: false,
        createdAt: b.created
      },
      select: { id: true }
    });
    b.contactId = contact.id;
    await prisma.crmContactRole.create({
      data: { tenantId, contactId: contact.id, role: 'ACQUEREUR', startedAt: b.created }
    });

    const dealCreated = addDays(b.created, between(rng, 1, 8));
    const closedAt = dealClosedAt(offer);
    const deal = await prisma.crmDeal.create({
      data: {
        tenantId,
        contactId: contact.id,
        type: 'ACHAT',
        stage,
        budgetMin: Math.round(offer.amount * 0.85),
        budgetMax: Math.round(offer.amount * 1.1),
        locationZone: ZONES[between(rng, 0, ZONES.length - 1)].name,
        expectedValue: offer.agreement?.price ?? offer.amount,
        probability: { NEW: 0.2, QUALIFIED: 0.4, VISIT: 0.6, NEGOTIATION: 0.8, WON: 1, LOST: 0 }[stage],
        assignedToUserId: plan.agentUserId,
        closedAt: stage === 'WON' || stage === 'LOST' ? closedAt : null,
        closedReason: dealClosedReason(offer, stage),
        createdAt: dealCreated
      },
      select: { id: true }
    });
    dealIds.set(offer.key, deal.id);
    await prisma.crmDealProperty.create({
      data: {
        tenantId,
        dealId: deal.id,
        propertyId: plan.prop.id,
        matchScore: between(rng, 70, 97),
        status: offer.status === 'ACCEPTED' && stage !== 'LOST' ? 'SELECTED' : stage === 'LOST' ? 'REJECTED' : 'VISITED'
      }
    });
    await traces(
      env,
      contact.id,
      deal.id,
      'ACHAT',
      dealCreated,
      closedAt ?? addDays(ctx.end, -1),
      plan.agentUserId,
      undefined,
      stage !== 'WON' && stage !== 'LOST'
    );
    const visitAt = new Date(
      Math.min(addDays(offer.created, -between(rng, 3, 10)).getTime(), ctx.end.getTime() - 86_400_000)
    );
    await prisma.propertyVisit.create({
      data: {
        propertyId: plan.prop.id,
        tenantId,
        contactId: contact.id,
        dealId: deal.id,
        visitType: 'VISIT',
        goal: pick(rng, ['EVALUATION', 'NEGOTIATION'] as const),
        scheduledAt: visitAt,
        duration: pick(rng, [45, 60]),
        location: 'Sur site',
        status: 'DONE',
        assignedToUserId: plan.agentUserId,
        notes: pick(rng, DEAL_NOTES),
        createdAt: addDays(visitAt, -3)
      }
    });
  }

  // 4. Offres, dans l'ordre chronologique.
  const offerIds = new Map<string, string>();
  for (const { plan, offer } of [...offers].sort((a, b) => a.offer.created.getTime() - b.offer.created.getTime())) {
    const y = year(offer.created);
    const sequence = await nextSequenceTx(prisma.saleOffer, tenantId, y);
    const row = await prisma.saleOffer.create({
      data: {
        tenantId,
        year: y,
        sequence,
        mandateId: mandateIds.get(plan.key) as string,
        buyerContactId: offer.buyer.contactId as string,
        dealId: dealIds.get(offer.key) ?? null,
        amount: offer.amount,
        financing: offer.financing,
        conditions: offer.conditions,
        validUntil: offer.validUntil,
        status: offer.status,
        counterAmount: offer.counterAmount,
        decidedAt: offer.decidedAt,
        decidedByUserId: offer.decidedAt ? adminUserId : null,
        decisionReason: offer.reason,
        createdAt: offer.created
      }
    });
    offerIds.set(offer.key, row.id);
  }

  // 5. Compromis, conditions et échéanciers.
  const agreementRows = new Map<string, { id: string; plan: AgreementPlan; mandateKey: string; propertyId: string }>();
  const agreements = offers
    .filter(x => x.offer.agreement)
    .sort(
      (a, b) =>
        (a.offer.agreement as AgreementPlan).created.getTime() - (b.offer.agreement as AgreementPlan).created.getTime()
    );
  for (const { plan, offer } of agreements) {
    const a = offer.agreement as AgreementPlan;
    const y = year(a.created);
    const sequence = await nextSequenceTx(prisma.saleAgreement, tenantId, y);
    const row = await prisma.saleAgreement.create({
      data: {
        tenantId,
        year: y,
        sequence,
        offerId: offerIds.get(offer.key) as string,
        mandateId: mandateIds.get(plan.key) as string,
        propertyId: plan.prop.id,
        price: a.price,
        depositAmount: a.deposit,
        depositHolder: a.holder,
        notaryName: a.notary,
        signedAt: a.signedAt,
        expectedDeedDate: a.expectedDeed,
        deedDate: a.deedDate,
        status: a.status,
        cancelledAt: a.cancelledAt,
        cancelReason: a.cancelReason,
        cancelledByUserId: a.cancelledAt ? adminUserId : null,
        createdAt: a.created
      }
    });
    for (const c of a.conditions) {
      await prisma.saleAgreementCondition.create({
        data: {
          tenantId,
          agreementId: row.id,
          label: c.label,
          dueDate: c.due,
          status: c.status,
          resolvedAt: c.resolvedAt,
          createdAt: a.created
        }
      });
    }
    let order = 0;
    for (const m of a.milestones) {
      await prisma.salePaymentMilestone.create({
        data: {
          tenantId,
          agreementId: row.id,
          label: m.label,
          dueDate: m.due,
          amount: m.amount,
          paidAt: m.paidAt,
          sortOrder: order,
          createdAt: a.created
        }
      });
      order += 1;
    }
    agreementRows.set(offer.key, { id: row.id, plan: a, mandateKey: plan.key, propertyId: plan.prop.id });
  }

  // 6. Commissions des ventes conclues, dans l'ordre des actes.
  const settings = await getAgencyFinanceSettings(tenantId);
  const treasury = await prisma.treasuryAccount.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, kind: true, label: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
  });
  const completed = [...agreementRows.entries()]
    .filter(([, v]) => v.plan.status === 'COMPLETED')
    .sort((a, b) => (a[1].plan.deedDate as Date).getTime() - (b[1].plan.deedDate as Date).getTime());
  let commissions = 0;
  let paymentsCount = 0;
  for (const [, v] of completed) {
    const mandate = mandateRows.get(v.mandateKey);
    if (!mandate) continue;
    const deed = v.plan.deedDate as Date;
    const y = year(deed);
    const sequence = await nextSequenceTx(prisma.saleCommission, tenantId, y);
    const amounts = computeCommissionAmounts(mandate, v.plan.price, settings.vatRegistered, settings.vatRate);
    const commission = await prisma.saleCommission.create({
      data: {
        tenantId,
        year: y,
        sequence,
        agreementId: v.id,
        mandateId: mandate.id,
        payer: mandate.commissionPayer,
        baseAmount: v.plan.price,
        ...amounts,
        agentUserId: mandate.agentUserId,
        agentSharePercent: mandate.agentSharePercent,
        issuedAt: deed,
        createdAt: deed
      }
    });
    commissions += 1;

    let paidSoFar = 0;
    for (const pay of v.plan.payments) {
      if (pay.at > ctx.end) continue;
      const account = chooseTreasury(treasury, amounts.amountInclTax * pay.fraction, rng);
      if (!account) continue;
      let amount = Math.round(amounts.amountInclTax * pay.fraction);
      if (pay.settle) amount = amounts.amountInclTax - paidSoFar;
      if (amount <= 0) continue;
      try {
        const post = async (reference: string): Promise<{ id: string }> =>
          createCommissionPayment(tenantId, adminUserId, commission.id, {
            amount,
            paidAt: pay.at,
            paymentMethod: account.method,
            treasuryAccountId: account.id,
            reference
          });
        if (pay.voidThenRepost) {
          const wrong = await post(referenceFor(account.method, pay.at, 'ERR'));
          await backdatePayment(env, wrong.id, pay.at);
          await voidCommissionPayment(tenantId, adminUserId, wrong.id, {
            reason: 'Règlement saisi en double : écriture annulée et ressaisie correctement.'
          });
          paymentsCount += 1;
        }
        const payment = await post(referenceFor(account.method, pay.at, 'OK'));
        await backdatePayment(env, payment.id, pay.at);
        paidSoFar += amount;
        paymentsCount += 1;
      } catch (error) {
        log(`commercial : règlement de commission ignoré — ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  log(`commercial : ${commissions} commissions de vente, ${paymentsCount} règlements comptabilisés.`);

  // 7. Statuts des biens et historique.
  await applyPropertyStatuses(env, plans);

  const counts = {
    offers: offers.length,
    agreements: agreements.length,
    sold: completed.length
  };
  log(
    `commercial : ${counts.offers} offres, ${counts.agreements} compromis dont ${counts.sold} actes signés, ` +
      `${dealIds.size} affaires d'achat.`
  );
}

// ─────────────────────────────────────────────────────────────── assistants

function dealStage(offer: OfferPlan): 'NEW' | 'QUALIFIED' | 'VISIT' | 'NEGOTIATION' | 'WON' | 'LOST' {
  if (offer.status === 'ACCEPTED') {
    const status = offer.agreement?.status;
    if (status === 'COMPLETED') return 'WON';
    if (status === 'CANCELLED') return 'LOST';
    return 'NEGOTIATION';
  }
  if (offer.status === 'SUBMITTED' || offer.status === 'COUNTERED') return 'NEGOTIATION';
  return 'LOST';
}

function dealClosedAt(offer: OfferPlan): Date | null {
  if (offer.agreement?.status === 'COMPLETED') return offer.agreement.deedDate;
  if (offer.agreement?.status === 'CANCELLED') return offer.agreement.cancelledAt;
  if (offer.status === 'REJECTED' || offer.status === 'WITHDRAWN') return offer.decidedAt;
  return null;
}

function dealClosedReason(offer: OfferPlan, stage: string): string | null {
  if (stage === 'WON') return 'Vente conclue';
  if (stage !== 'LOST') return null;
  if (offer.agreement?.status === 'CANCELLED') return 'Financement refusé par la banque';
  if (offer.status === 'REJECTED') return 'Offre refusée par le vendeur';
  return 'Le client a renoncé à son projet';
}

type TreasuryRow = { id: string; kind: string; label: string };

function chooseTreasury(
  accounts: TreasuryRow[],
  amount: number,
  rng: () => number
): { id: string; method: 'CASH' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CHECK' } | null {
  if (accounts.length === 0) return null;
  const bank = accounts.filter(a => a.kind === 'BANK');
  if (bank.length > 0 && (amount > 2_000_000 || rng() < 0.3)) {
    return { id: bank[0].id, method: rng() < 0.75 ? 'BANK_TRANSFER' : 'CHECK' };
  }
  const cash = accounts.find(a => a.kind === 'CASH');
  if (cash) return { id: cash.id, method: 'CASH' };
  if (bank.length > 0) return { id: bank[0].id, method: 'BANK_TRANSFER' };
  const mm = accounts.find(a => a.kind === 'MOBILE_MONEY');
  return mm ? { id: mm.id, method: 'MOBILE_MONEY' } : null;
}

function referenceFor(method: string, at: Date, suffix: string): string {
  const stamp = at.toISOString().slice(2, 10).replace(/-/g, '');
  const prefix =
    method === 'BANK_TRANSFER' ? 'VIR' : method === 'CHECK' ? 'CHQ' : method === 'MOBILE_MONEY' ? 'MM' : 'ESP';
  return `${prefix}-${stamp}-${suffix}`;
}

async function backdatePayment(env: CommercialEnv, paymentId: string, at: Date): Promise<void> {
  await env.prisma.saleCommissionPayment.update({ where: { id: paymentId }, data: { createdAt: at } });
}

async function traces(
  env: CommercialEnv,
  contactId: string,
  dealId: string,
  kind: 'ACHAT' | 'VENTE',
  from: Date,
  to: Date,
  createdByUserId: string,
  max?: number,
  open = false
): Promise<void> {
  const { prisma, tenantId, rng, ctx } = env;
  const pool = DEAL_TRACES[kind];
  const n = Math.min(pool.length, max ?? between(rng, 3, pool.length));
  const end = to > ctx.end ? ctx.end : to;
  const span = Math.max(1, Math.floor((end.getTime() - from.getTime()) / 86_400_000));
  let last = from;
  for (let i = 0; i < n; i++) {
    const day = addDays(from, Math.floor((span * (i + 0.5)) / n));
    last = day > end ? end : day;
    await prisma.crmActivity.create({
      data: {
        tenantId,
        contactId,
        dealId,
        activityType: i === 2 ? 'VISIT' : pick(rng, ['CALL', 'WHATSAPP', 'EMAIL', 'MEETING'] as const),
        direction: i % 2 === 0 ? 'IN' : 'OUT',
        subject: pool[i].subject,
        content: pool[i].content,
        outcome: i === n - 1 ? (open ? 'En attente de retour' : 'Clôturé') : null,
        occurredAt: last,
        createdByUserId,
        createdAt: last
      }
    });
  }
  await prisma.crmContact.update({ where: { id: contactId }, data: { lastInteractionAt: last } });
}

async function applyPropertyStatuses(env: CommercialEnv, plans: MandatePlan[]): Promise<void> {
  const { prisma, tenantId, adminUserId, log } = env;
  type Event = { at: Date; status: 'AVAILABLE' | 'RESERVED' | 'UNDER_OFFER' | 'SOLD'; note: string };
  const byProperty = new Map<string, Event[]>();
  const push = (id: string, e: Event): void => {
    const list = byProperty.get(id) ?? [];
    list.push(e);
    byProperty.set(id, list);
  };
  for (const plan of plans) {
    for (const o of plan.offers) {
      const a = o.agreement;
      if (o.status !== 'ACCEPTED' || !a) continue;
      push(plan.prop.id, { at: o.decidedAt ?? a.created, status: 'RESERVED', note: 'Offre d’achat acceptée' });
      if (a.signedAt) push(plan.prop.id, { at: a.signedAt, status: 'UNDER_OFFER', note: 'Compromis de vente signé' });
      if (a.status === 'COMPLETED' && a.deedDate) {
        push(plan.prop.id, { at: a.deedDate, status: 'SOLD', note: 'Acte de vente signé chez le notaire' });
      }
      if (a.status === 'CANCELLED' && a.cancelledAt) {
        push(plan.prop.id, { at: a.cancelledAt, status: 'AVAILABLE', note: 'Compromis annulé, bien remis en vente' });
      }
    }
  }

  let changed = 0;
  for (const [propertyId, events] of byProperty) {
    events.sort((x, y) => x.at.getTime() - y.at.getTime());
    let previous: PropertyStatus = 'AVAILABLE';
    for (const e of events) {
      await prisma.propertyStatusHistory.create({
        data: {
          propertyId,
          tenantId,
          previousStatus: previous,
          newStatus: e.status,
          changedByUserId: adminUserId,
          notes: e.note,
          createdAt: e.at
        }
      });
      previous = e.status;
    }
    await prisma.property.update({
      where: { id: propertyId },
      data: {
        status: previous,
        availability: previous === 'SOLD' ? 'UNAVAILABLE' : previous === 'AVAILABLE' ? 'AVAILABLE' : 'UNAVAILABLE',
        isPublished: previous === 'AVAILABLE'
      }
    });
    changed += 1;
  }

  // Un bien vendu sort du registre des lots (réserve de l'abonnement), comme à la signature de l'acte.
  const soldIds = [...byProperty.entries()].filter(([, e]) => e.some(x => x.status === 'SOLD')).map(([id]) => id);
  if (soldIds.length > 0) {
    try {
      const { prisma: appPrisma } = await import('../../../src/utils/database');
      const { syncLotActivationsTx } = await import('../../../src/services/lot-registry-service');
      await appPrisma.$transaction(async tx => {
        await syncLotActivationsTx(
          tx,
          tenantId,
          { propertyIds: soldIds },
          { actorUserId: adminUserId, reason: 'PROPERTY_SOLD' }
        );
      });
    } catch (error) {
      log(
        `commercial : registre des lots non resynchronisé — ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  log(`commercial : ${changed} biens changent de statut (réservé, sous compromis, vendu).`);
}
