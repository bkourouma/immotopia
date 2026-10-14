/**
 * Baux des biens PROPRES de l'agence (ownershipType TENANT).
 *
 * Le générateur de base n'a loué que les biens confiés par des propriétaires :
 * les ~17 biens que l'agence détient en propre restaient sans bail, donc sans
 * loyer, sans taux d'occupation ni plan de trésorerie. Ce bloc leur donne une
 * vie locative complète par les VRAIS services (`createLease`, échéances,
 * dépôt de garantie, encaissements, fins de bail) : locataires fidèles, bail
 * renouvelé, retard puis régularisation, paiement partiel, bail suspendu pour
 * impayés, bail en brouillon (signature à venir) et quelques biens vacants.
 *
 * Ensuite, la campagne de facturation du produit émet les échéances du mois en
 * cours et du suivant (« À payer »), pour toute l'agence.
 */
import { runWithTenantContext } from '../../../src/utils/tenant-context';
import { between, neutralizeOutbound, pick } from './types';
import type { HistoryContext } from './types';
import { COMPANY_NAMES, ZONES, ivorianPhone, randomPerson, slugify } from './agence-data';
import { addDaysTo, addMonths, firstOfMonth, leaseEndDate, startOfDay, ymd } from './agence-plan';
import type { Frequency, LeaseScenario } from './agence-plan';
import { monthsBetween, roundTo } from './agence-patrimoine-state';
import type { OwnProperty, OwnState } from './agence-patrimoine-state';

type Services = {
  createLease: typeof import('../../../src/services/rental-lease-service').createLease;
  updateLeaseStatus: typeof import('../../../src/services/rental-lease-service').updateLeaseStatus;
  generateInstallments: typeof import('../../../src/services/rental-installment-service').generateInstallments;
  recalculateInstallmentStatuses: typeof import('../../../src/services/rental-installment-service').recalculateInstallmentStatuses;
  createPayment: typeof import('../../../src/services/rental-payment-service').createPayment;
  allocatePayment: typeof import('../../../src/services/rental-payment-service').allocatePayment;
  createDeposit: typeof import('../../../src/services/rental-deposit-service').createDeposit;
  createDepositMovement: typeof import('../../../src/services/rental-deposit-service').createDepositMovement;
  calculatePenalty: typeof import('../../../src/services/rental-penalty-service').calculatePenalty;
  calculatePenaltiesForOverdueInstallments: typeof import('../../../src/services/rental-penalty-service').calculatePenaltiesForOverdueInstallments;
};

async function loadServices(): Promise<Services> {
  neutralizeOutbound();
  const [lease, installment, payment, deposit, penalty] = await Promise.all([
    import('../../../src/services/rental-lease-service'),
    import('../../../src/services/rental-installment-service'),
    import('../../../src/services/rental-payment-service'),
    import('../../../src/services/rental-deposit-service'),
    import('../../../src/services/rental-penalty-service')
  ]);
  return {
    createLease: lease.createLease,
    updateLeaseStatus: lease.updateLeaseStatus,
    generateInstallments: installment.generateInstallments,
    recalculateInstallmentStatuses: installment.recalculateInstallmentStatuses,
    createPayment: payment.createPayment,
    allocatePayment: payment.allocatePayment,
    createDeposit: deposit.createDeposit,
    createDepositMovement: deposit.createDepositMovement,
    calculatePenalty: penalty.calculatePenalty,
    calculatePenaltiesForOverdueInstallments: penalty.calculatePenaltiesForOverdueInstallments
  };
}

const OPERATORS = ['ORANGE', 'MTN', 'MOOV', 'WAVE'] as const;
const METHODS = [
  'MOBILE_MONEY',
  'MOBILE_MONEY',
  'MOBILE_MONEY',
  'MOBILE_MONEY',
  'BANK_TRANSFER',
  'BANK_TRANSFER',
  'CASH',
  'CHECK'
] as const;

type Role = 'renewed' | 'active' | 'retard' | 'partiel' | 'vacant' | 'suspended' | 'draft';

/** Rôle de chaque bien propre, dans l'ordre des références : de la variété, des biens vacants en réserve. */
const ROLES: readonly Role[] = [
  'renewed',
  'active',
  'retard',
  'active',
  'vacant',
  'partiel',
  'renewed',
  'active',
  'vacant',
  'suspended',
  'active',
  'draft',
  'renewed',
  'active',
  'vacant',
  'active',
  'active'
];

const SCENARIOS: readonly LeaseScenario[] = ['a_jour', 'regularise', 'a_jour', 'a_jour', 'regularise', 'a_jour'];

interface OwnLeasePlan {
  prop: OwnProperty;
  kind: 'active' | 'ended' | 'suspended' | 'draft';
  startAgo: number;
  durationMonths: number;
  frequency: Frequency;
  dueDay: number;
  scenario: LeaseScenario;
  unpaid: number;
  rentFactor: number;
  renterKey: string;
  isRenewal: boolean;
}

/** Durée standard qui laisse au moins `margin` mois de bail devant nous (le plan de trésorerie ne tombe pas à zéro). */
function durationFor(startAgo: number, margin: number): number {
  return [12, 24, 36, 48, 60].find(d => d >= startAgo + margin) ?? 60;
}

export function planOwnLeases(own: readonly OwnProperty[], rng: () => number, end: Date): OwnLeasePlan[] {
  const plans: OwnLeasePlan[] = [];
  const leasable = own.filter(p => p.modes.includes('RENTAL') && p.price > 0);
  let activeIndex = 0;
  leasable.forEach((prop, i) => {
    const role: Role = ROLES[i % ROLES.length];
    // Premier mois plein après la création de la fiche : un bail ne précède pas son bien.
    const maxAgo = Math.min(35, monthsBetween(prop.createdAt, end) - 1);
    if (role === 'vacant' || maxAgo < 2) return;
    const frequency = (): Frequency => (prop.commercial && rng() < 0.4 ? 'QUARTERLY' : 'MONTHLY');
    const common = { prop, dueDay: pick(rng, [5, 5, 5, 10, 1]), unpaid: 0 };
    const key = `own-${i}`;

    if (role === 'draft') {
      plans.push({
        ...common,
        kind: 'draft',
        startAgo: -1,
        durationMonths: 12,
        frequency: 'MONTHLY',
        scenario: 'a_jour',
        rentFactor: 1,
        renterKey: key,
        isRenewal: false
      });
      return;
    }
    if (role === 'suspended') {
      const startAgo = Math.max(4, Math.min(maxAgo, 10));
      if (maxAgo < 4) return;
      plans.push({
        ...common,
        kind: 'suspended',
        startAgo,
        durationMonths: 12,
        frequency: 'MONTHLY',
        scenario: 'retard',
        unpaid: 3,
        rentFactor: 1,
        renterKey: key,
        isRenewal: false
      });
      return;
    }
    if (role === 'renewed' && maxAgo >= 16) {
      // Bail de 12 mois arrivé à son terme, renouvelé avec le même locataire, loyer revalorisé.
      const firstAgo = maxAgo;
      plans.push({
        ...common,
        kind: 'ended',
        startAgo: firstAgo,
        durationMonths: 12,
        frequency: 'MONTHLY',
        scenario: rng() < 0.4 ? 'regularise' : 'a_jour',
        rentFactor: 0.92,
        renterKey: key,
        isRenewal: false
      });
      const renewalAgo = firstAgo - 12;
      plans.push({
        ...common,
        kind: 'active',
        startAgo: renewalAgo,
        durationMonths: durationFor(renewalAgo, 15),
        frequency: frequency(),
        scenario: 'a_jour',
        rentFactor: 1,
        renterKey: key,
        isRenewal: true
      });
      return;
    }
    // Bail en cours : le plus ancien possible pour les premiers, au hasard pour les suivants.
    const startAgo = activeIndex < 3 ? maxAgo : between(rng, Math.max(2, Math.floor(maxAgo * 0.4)), maxAgo);
    const scenario: LeaseScenario =
      role === 'retard' ? 'retard' : role === 'partiel' ? 'partiel' : SCENARIOS[activeIndex % SCENARIOS.length];
    const effective: LeaseScenario = scenario === 'regularise' && startAgo < 6 ? 'a_jour' : scenario;
    const freq = frequency();
    plans.push({
      ...common,
      kind: 'active',
      startAgo,
      // Un bail sur quatre arrive à échéance dans les mois qui viennent (alerte de renouvellement).
      durationMonths: durationFor(startAgo, activeIndex % 4 === 1 ? 2 : 15),
      frequency: freq,
      scenario: effective,
      unpaid: effective === 'retard' ? (freq === 'QUARTERLY' ? 1 : pick(rng, [1, 2, 2])) : 0,
      rentFactor: 1 - 0.015 * Math.floor(startAgo / 12),
      renterKey: key,
      isRenewal: false
    });
    activeIndex += 1;
  });
  return plans.sort((a, b) => b.startAgo - a.startAgo);
}

interface Renter {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

/** Contact CRM locataire (personne ou société), sans aucun consentement marketing. */
async function createRenter(
  ctx: HistoryContext,
  staff: string[],
  tag: string,
  n: number,
  at: Date,
  company: boolean
): Promise<Renter> {
  const { prisma, tenantId, rng } = ctx;
  const person = randomPerson(rng);
  const phone = ivorianPhone(rng);
  const zone = pick(rng, ZONES);
  const legalName = company ? `${pick(rng, ['SARL', 'SA', 'SAS'])} ${pick(rng, COMPANY_NAMES)}` : null;
  const contact = await prisma.crmContact.create({
    data: {
      tenantId,
      contactType: company ? 'COMPANY' : 'PERSON',
      firstName: person.firstName,
      lastName: person.lastName,
      legalName,
      representativeName: company ? `${person.firstName} ${person.lastName}` : null,
      representativeRole: company ? 'Gérant' : null,
      email: `${slugify(person.firstName)}.${slugify(person.lastName)}.p${n}.${tag}@example.ci`,
      phonePrimary: phone,
      whatsappNumber: phone,
      address: `${between(rng, 1, 90)} ${pick(rng, ['Rue', 'Avenue', 'Boulevard'])} ${person.lastName}, ${zone.name}`,
      city: 'Abidjan',
      country: "Côte d'Ivoire",
      locationZone: zone.name,
      preferredLanguage: 'fr',
      source: 'Recommandation',
      leadSource: 'REFERRAL',
      maturityLevel: 'COLD',
      score: between(rng, 40, 95),
      lastInteractionAt: at,
      status: 'ACTIVE_CLIENT',
      assignedToUserId: pick(rng, staff),
      consentMarketing: false,
      consentWhatsapp: false,
      consentEmail: false,
      createdAt: at
    },
    select: { id: true }
  });
  await prisma.crmContactRole.create({
    data: { tenantId, contactId: contact.id, role: 'LOCATAIRE', active: true, startedAt: at }
  });
  return { id: contact.id, firstName: person.firstName, lastName: person.lastName, phone };
}

function amountDue(e: {
  amount_rent: unknown;
  amount_service: unknown;
  amount_other_fees: unknown;
  penalty_amount: unknown;
  amount_paid: unknown;
}): number {
  return (
    Number(e.amount_rent) +
    Number(e.amount_service) +
    Number(e.amount_other_fees) +
    Number(e.penalty_amount) -
    Number(e.amount_paid)
  );
}

const noonUtc = (d: Date): Date => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12));

/** Un bail de bout en bout : création, échéances, dépôt, règlements, fin éventuelle. */
async function processOwnLease(
  o: OwnState,
  svc: Services,
  plan: OwnLeasePlan,
  renters: Map<string, Renter>,
  tag: string,
  counter: { n: number }
): Promise<'ok'> {
  const { ctx } = o;
  const { prisma, tenantId, rng, adminUserId, end: now } = ctx;
  const prop = plan.prop;
  const today0 = startOfDay(now);
  const start = plan.kind === 'draft' ? firstOfMonth(now, -1) : firstOfMonth(now, plan.startAgo);
  const endDate = plan.kind === 'draft' ? addMonths(start, 12) : leaseEndDate(now, plan);
  const ended = plan.kind === 'ended';

  let renter = renters.get(plan.renterKey);
  if (!renter) {
    counter.n += 1;
    renter = await createRenter(ctx, o.staff, tag, counter.n, addDaysTo(start, -between(rng, 12, 40)), prop.commercial);
    renters.set(plan.renterKey, renter);
  }

  const periodMonths = plan.frequency === 'QUARTERLY' ? 3 : 1;
  const rent = Math.max(5_000, roundTo(prop.price * plan.rentFactor, 5_000));
  const charges = prop.fees;
  const deposit = rent * 2;
  const notes = plan.isRenewal
    ? 'Renouvellement du bail précédent, loyer revalorisé.'
    : plan.kind === 'draft'
      ? 'Bail en préparation : signature prévue avec le futur locataire.'
      : plan.kind === 'suspended'
        ? 'Bail suspendu pour loyers impayés, mise en demeure adressée au locataire.'
        : ended
          ? 'Bail arrivé à son terme.'
          : prop.commercial
            ? 'Bail commercial sur un bien détenu par l’agence.'
            : 'Bail d’habitation sur un bien détenu par l’agence.';

  const lease = await svc.createLease(
    tenantId,
    {
      propertyId: prop.id,
      primaryRenterContactId: renter.id,
      startDate: start,
      endDate: addDaysTo(endDate, -1),
      billingFrequency: plan.frequency,
      dueDayOfMonth: plan.dueDay,
      currency: 'XOF',
      rentAmount: rent * periodMonths,
      serviceChargeAmount: charges * periodMonths,
      securityDepositAmount: deposit,
      penaltyGraceDays: 5,
      penaltyMode: 'PERCENT_OF_BALANCE' as const,
      penaltyRate: 5,
      penaltyCapAmount: 250000,
      moveInDate: start <= today0 ? start : undefined,
      notes
    },
    adminUserId
  );
  await prisma.rentalLease.update({
    where: { id: lease.id },
    data: { created_at: addDaysTo(start, plan.kind === 'draft' ? -20 : -7) }
  });

  if (plan.kind === 'draft') {
    // Pas encore signé : brouillon, ni échéance ni encaissement, le bien reste à louer.
    await prisma.rentalLease.update({ where: { id: lease.id }, data: { status: 'DRAFT', move_in_date: null } });
    await prisma.property.update({
      where: { id: prop.id },
      data: { status: 'AVAILABLE', availability: 'AVAILABLE', isPublished: true }
    });
    return 'ok';
  }

  const leaseRow = await prisma.rentalLease.findUnique({
    where: { id: lease.id },
    select: { primary_renter_client_id: true }
  });
  const renterClientId = leaseRow?.primary_renter_client_id ?? '';

  const installments = await svc.generateInstallments(tenantId, lease.id, adminUserId);
  await svc.recalculateInstallmentStatuses(tenantId, lease.id);

  // Dépôt de garantie encaissé à l'entrée dans les lieux.
  const depot = await svc.createDeposit(tenantId, lease.id, adminUserId);
  const depositPaidAt = start <= today0 ? start : addDaysTo(today0, -1);
  const caution = await svc.createPayment(
    tenantId,
    {
      leaseId: lease.id,
      renterClientId,
      method: pick(rng, ['MOBILE_MONEY', 'BANK_TRANSFER'] as const),
      amount: deposit,
      currency: 'XOF',
      mmOperator: pick(rng, OPERATORS),
      mmPhone: renter.phone.replace(/\D/g, '').slice(-10),
      pspName: 'CinetPay',
      pspTransactionId: `HIST-${tag}-${lease.lease_number}-CAUT`,
      pspReference: `REF-CAUT-${lease.lease_number}`,
      idempotencyKey: `hist-caution-${lease.id}`,
      paidAt: ymd(depositPaidAt)
    },
    adminUserId
  );
  const cautionMovement = await svc.createDepositMovement(
    tenantId,
    depot.id,
    'COLLECT',
    deposit,
    caution.id,
    undefined,
    "Dépôt de garantie encaissé à l'entrée dans les lieux",
    adminUserId
  );
  await prisma.rentalPayment.update({
    where: { id: caution.id },
    data: { initiated_at: noonUtc(depositPaidAt), created_at: noonUtc(depositPaidAt) }
  });
  await prisma.rentalDepositMovement.update({
    where: { id: cautionMovement.id },
    data: { created_at: noonUtc(depositPaidAt) }
  });

  // Règlements des échéances échues, selon le scénario.
  const due = [...installments]
    .map(e => ({ row: e, dueDate: new Date(e.due_date) }))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  const echues = due.filter(d => d.dueDate < today0);
  const unpaid = plan.scenario === 'retard' ? Math.min(plan.unpaid, Math.max(echues.length - 1, 0)) : 0;
  const toPay = echues.slice(0, echues.length - unpaid);
  const lateIdx = new Set<number>();
  if (plan.scenario === 'regularise' && toPay.length >= 5) {
    lateIdx.add(between(rng, 0, toPay.length - 4));
    if (rng() < 0.5) lateIdx.add(between(rng, 0, toPay.length - 4));
  }
  for (let i = 0; i < toPay.length; i++) {
    const { row, dueDate } = toPay[i];
    const isLate = lateIdx.has(i);
    const delay = isLate ? between(rng, 50, 140) : rng() < 0.8 ? between(rng, 0, 4) : between(rng, 5, 20);
    const yesterday = addDaysTo(today0, -1);
    let payDate = addDaysTo(dueDate, delay);
    if (payDate > yesterday) payDate = yesterday;
    if (payDate < start) payDate = start;

    let current = row;
    if (isLate) {
      try {
        await svc.calculatePenalty(tenantId, row.id, undefined, adminUserId);
        const fresh = await prisma.rentalInstallment.findUnique({ where: { id: row.id } });
        if (fresh) current = fresh;
      } catch {
        // Pas de pénalité : le retard se règle au montant de base.
      }
    }
    const total = amountDue(current);
    const partial = plan.scenario === 'partiel' && i === toPay.length - 1;
    const amount = partial ? Math.round(total / 2) : total;
    if (amount <= 0) continue;

    const method = pick(rng, METHODS);
    const mm = method === 'MOBILE_MONEY';
    const payment = await svc.createPayment(
      tenantId,
      {
        leaseId: lease.id,
        renterClientId,
        method,
        amount,
        currency: 'XOF',
        mmOperator: mm ? pick(rng, OPERATORS) : undefined,
        mmPhone: mm ? `07${String(between(rng, 10000000, 99999999))}` : undefined,
        pspName: mm ? 'CinetPay' : undefined,
        pspTransactionId: mm ? `HIST-${tag}-${lease.lease_number}-${i + 1}` : undefined,
        pspReference: `REF-${lease.lease_number}-${i + 1}`,
        idempotencyKey: `hist-reglement-${row.id}`,
        paidAt: ymd(payDate)
      },
      adminUserId
    );
    await svc.allocatePayment(tenantId, payment.id, { installmentIds: [row.id] }, adminUserId);
    const when = noonUtc(payDate);
    await prisma.rentalPayment.update({ where: { id: payment.id }, data: { initiated_at: when, created_at: when } });
    await prisma.rentalPaymentAllocation.updateMany({ where: { payment_id: payment.id }, data: { created_at: when } });
    await prisma.rentalInstallment.updateMany({
      where: { id: row.id, paid_at: { not: null } },
      data: { paid_at: when }
    });
  }
  await svc.recalculateInstallmentStatuses(tenantId, lease.id);

  if (plan.kind === 'suspended') {
    await svc.updateLeaseStatus(tenantId, lease.id, 'SUSPENDED', adminUserId);
  }

  if (ended) {
    await svc.updateLeaseStatus(tenantId, lease.id, 'ENDED', adminUserId);
    await prisma.rentalLease.update({ where: { id: lease.id }, data: { move_out_date: endDate } });
    try {
      const retained = rng() < 0.35 ? Math.round((deposit * between(rng, 8, 25)) / 100 / 1000) * 1000 : 0;
      if (retained > 0) {
        const m = await svc.createDepositMovement(
          tenantId,
          depot.id,
          'FORFEIT',
          retained,
          undefined,
          undefined,
          'Retenue pour remise en état des lieux',
          adminUserId
        );
        await prisma.rentalDepositMovement.update({ where: { id: m.id }, data: { created_at: noonUtc(endDate) } });
      }
      const refund = await svc.createDepositMovement(
        tenantId,
        depot.id,
        'REFUND',
        deposit - retained,
        undefined,
        undefined,
        'Restitution du dépôt de garantie à la sortie du locataire',
        adminUserId
      );
      await prisma.rentalDepositMovement.update({ where: { id: refund.id }, data: { created_at: noonUtc(endDate) } });
    } catch (error) {
      ctx.log(
        `baux propres : restitution du dépôt ${lease.lease_number} impossible — ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return 'ok';
}

export async function seedOwnLeases(o: OwnState): Promise<void> {
  const { ctx } = o;
  const { prisma, tenantId, rng, end, log } = ctx;
  const already = await prisma.rentalLease.count({
    where: { tenant_id: tenantId, property_id: { in: o.own.map(p => p.id) } }
  });
  if (already > 0) {
    log(`baux propres : ${already} bail(s) déjà présents sur les biens de l'agence, bloc sauté.`);
    return;
  }
  const plans = planOwnLeases(o.own, rng, end);
  if (plans.length === 0) return;
  const svc = await loadServices();
  const tag = tenantId.replace(/-/g, '').slice(0, 6);
  const renters = new Map<string, Renter>();
  const counter = { n: 0 };
  let ok = 0;
  await runWithTenantContext({ tenantId, userId: ctx.adminUserId }, async () => {
    for (const plan of plans) {
      try {
        await processOwnLease(o, svc, plan, renters, tag, counter);
        ok += 1;
      } catch (error) {
        log(
          `baux propres : bail ${plan.prop.ref} (${plan.kind}) ignoré — ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
        );
      }
    }
    try {
      await svc.calculatePenaltiesForOverdueInstallments(tenantId, ctx.adminUserId);
    } catch (error) {
      log(`baux propres : calcul des pénalités échoué — ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Statut final : loué s'il porte un bail actif ou suspendu, disponible sinon.
  const active = await prisma.rentalLease.findMany({
    where: {
      tenant_id: tenantId,
      property_id: { in: o.own.map(p => p.id) },
      status: { in: ['ACTIVE', 'SUSPENDED'] }
    },
    select: { property_id: true }
  });
  const rentedIds = new Set(active.map(l => l.property_id));
  for (const p of o.own) {
    if (rentedIds.has(p.id)) {
      await prisma.property.update({
        where: { id: p.id },
        data: { status: 'RENTED', availability: 'UNAVAILABLE', isPublished: false }
      });
    }
  }
  log(`baux propres : ${ok}/${plans.length} baux écrits, ${rentedIds.size} bien(s) loué(s) sur ${o.own.length}.`);
}
