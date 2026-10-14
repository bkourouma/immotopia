/**
 * Historique du module AGENCE (MODULE_AGENCY) d'une agence de test.
 *
 * Peuple, sur `ctx.tenantId` : contacts CRM (propriétaires, locataires,
 * prospects), biens, affaires du pipeline, visites, gestion locative complète
 * (baux, échéances, dépôts de garantie, encaissements, retards, pénalités,
 * déclarations de paiement, relevés propriétaire) et maintenance (prestataires,
 * tickets et leur historique).
 *
 * Principes (voir `types.ts`) :
 *  - dates relatives à `ctx.end`, hasard seedé par `ctx.rng` ;
 *  - idempotent : un tenant qui porte déjà des biens est laissé tel quel ;
 *  - aucun envoi sortant : `neutralizeOutbound()` AVANT l'import des services ;
 *  - la gestion locative passe par les vrais services (`createLease`,
 *    `generateInstallments`, `createPayment`, `allocatePayment`, dépôts,
 *    pénalités, relevés), jamais par des insertions directes ; seules les dates
 *    (qu'aucun service ne laisse choisir) sont ensuite ramenées dans le passé.
 *
 * Plans purs (testés sans base) : `agence-plan.ts` et `agence-data.ts`.
 */
import { MembershipStatus } from '@prisma/client';

import { runWithTenantContext } from '../../../src/utils/tenant-context';
import { between, neutralizeOutbound, pick } from './types';
import type { HistoryContext, HistorySeeder } from './types';
import {
  AGENCE_VOLUMES,
  COMPANY_NAMES,
  DEAL_TRACES,
  LOST_REASONS,
  TICKET_TEMPLATES,
  VENDOR_POOL,
  ZONES,
  ivorianPhone,
  planProperties,
  randomPerson,
  slugify
} from './agence-data';
import type { PropertyPlan, TicketCategoryName } from './agence-data';
import {
  addDaysTo,
  addMonths,
  firstOfMonth,
  leaseEndDate,
  periodOf,
  planLeases,
  randomWorkday,
  startOfDay,
  ymd
} from './agence-plan';
import type { LeasePlan } from './agence-plan';

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
  generateOwnerStatement: typeof import('../../../src/lib/patrimoine/queries').generateOwnerStatement;
  updateOwnerStatement: typeof import('../../../src/lib/patrimoine/queries').updateOwnerStatement;
};

/** Les services lisent leur configuration d'envoi au premier import : on les charge après la neutralisation. */
async function loadServices(): Promise<Services> {
  neutralizeOutbound();
  process.env.EMAIL_SMTP_HOST = '127.0.0.1';
  process.env.EMAIL_SMTP_PORT = '1';
  process.env.EMAIL_SMTP_USER = '';
  process.env.EMAIL_SMTP_PASS = '';
  delete process.env.SENDGRID_API_KEY;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;

  const [lease, installment, payment, deposit, penalty, statements] = await Promise.all([
    import('../../../src/services/rental-lease-service'),
    import('../../../src/services/rental-installment-service'),
    import('../../../src/services/rental-payment-service'),
    import('../../../src/services/rental-deposit-service'),
    import('../../../src/services/rental-penalty-service'),
    import('../../../src/lib/patrimoine/queries')
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
    calculatePenaltiesForOverdueInstallments: penalty.calculatePenaltiesForOverdueInstallments,
    generateOwnerStatement: statements.generateOwnerStatement,
    updateOwnerStatement: statements.updateOwnerStatement
  };
}

// ───────────────────────────────────────────────────────────── contacts

interface ContactRef {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  createdAt: Date;
}

type ContactKind = 'owner' | 'renter' | 'prospect' | 'archived';

const LEAD_SOURCES = ['WEBSITE', 'SOCIAL_MEDIA', 'REFERRAL', 'AGENCY', 'WALK_IN', 'PHONE_CALL'] as const;
const SOURCE_LABELS = ['Site web', 'Réseaux sociaux', 'Recommandation', 'Agence', 'Passage en agence', 'Appel entrant'];

interface Gen {
  ctx: HistoryContext;
  svc: Services;
  /** Fragment du tenant : garde les e-mails des contacts uniques d'une agence de test à l'autre. */
  tag: string;
  staff: string[];
  counter: number;
}

function pickStaff(g: Gen): string {
  return pick(g.ctx.rng, g.staff);
}

async function createContact(
  g: Gen,
  kind: ContactKind,
  createdAt: Date,
  opts: { company?: boolean } = {}
): Promise<ContactRef> {
  const { prisma, tenantId, rng } = g.ctx;
  const person = randomPerson(rng);
  g.counter += 1;
  const email = `${slugify(person.firstName)}.${slugify(person.lastName)}.${g.counter}.${g.tag}@example.ci`;
  const phone = ivorianPhone(rng);
  const zone = pick(rng, ZONES);
  const si = between(rng, 0, LEAD_SOURCES.length - 1);
  const company = opts.company ? `${pick(rng, ['SARL', 'SA', 'SAS'])} ${pick(rng, COMPANY_NAMES)}` : null;
  const status = kind === 'prospect' ? 'LEAD' : kind === 'archived' ? 'ARCHIVED' : 'ACTIVE_CLIENT';
  const maturity = kind === 'prospect' ? pick(rng, ['COLD', 'WARM', 'HOT'] as const) : 'COLD';

  const contact = await prisma.crmContact.create({
    data: {
      tenantId,
      contactType: company ? 'COMPANY' : 'PERSON',
      firstName: person.firstName,
      lastName: person.lastName,
      legalName: company,
      representativeName: company ? `${person.firstName} ${person.lastName}` : null,
      representativeRole: company ? 'Gérant' : null,
      email,
      phonePrimary: phone,
      whatsappNumber: phone,
      address: `${between(rng, 1, 90)} ${pick(rng, ['Rue', 'Avenue', 'Boulevard'])} ${person.lastName}, ${zone.name}`,
      city: 'Abidjan',
      country: "Côte d'Ivoire",
      locationZone: zone.name,
      preferredLanguage: 'fr',
      source: SOURCE_LABELS[si],
      leadSource: LEAD_SOURCES[si],
      maturityLevel: maturity,
      score: kind === 'prospect' ? between(rng, 20, 90) : between(rng, 40, 95),
      lastInteractionAt: createdAt,
      status,
      assignedToUserId: pickStaff(g),
      // Aucun envoi sortant, même par accident : pas de consentement marketing.
      consentMarketing: false,
      consentWhatsapp: false,
      consentEmail: false,
      createdAt
    },
    select: { id: true }
  });

  const role = kind === 'owner' ? 'PROPRIETAIRE' : kind === 'renter' ? 'LOCATAIRE' : kind === 'prospect' ? null : null;
  if (role) {
    await prisma.crmContactRole.create({
      data: { tenantId, contactId: contact.id, role, active: kind !== 'archived', startedAt: createdAt }
    });
  }
  return { id: contact.id, firstName: person.firstName, lastName: person.lastName, phone, createdAt };
}

async function ensureRole(g: Gen, contactId: string, role: 'LOCATAIRE' | 'ACQUEREUR' | 'PROPRIETAIRE', at: Date) {
  const { prisma, tenantId } = g.ctx;
  const has = await prisma.crmContactRole.findFirst({ where: { tenantId, contactId, role }, select: { id: true } });
  if (!has) await prisma.crmContactRole.create({ data: { tenantId, contactId, role, startedAt: at } });
}

// ───────────────────────────────────────────────────────────────── état

interface PropertyRef {
  id: string;
  plan: PropertyPlan;
}

interface LeaseRecord {
  id: string;
  leaseNumber: string;
  propertyIndex: number;
  renter: ContactRef;
  start: Date;
  /** Date de fin réelle (plafonnée à maintenant pour un bail en cours). */
  effectiveEnd: Date;
  kind: LeasePlan['kind'];
}

interface Counters {
  contacts: number;
  properties: number;
  leases: number;
  installments: number;
  payments: number;
  deals: number;
  visits: number;
  tickets: number;
  statements: number;
  failures: number;
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

/** Reste dû d'une échéance : `total_due` n'existe pas en colonne. */
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

function noonUtc(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12));
}

// ─────────────────────────────────────────────────────────────── entrée

export const seedAgenceHistory: HistorySeeder = async ctx => {
  const { prisma, tenantId, log } = ctx;

  const already = await prisma.property.count({ where: { tenantId } });
  if (already > 0) {
    log(`agence : ${already} bien(s) déjà présents, historique non régénéré.`);
    return;
  }

  const svc = await loadServices();
  await runWithTenantContext({ tenantId, userId: ctx.adminUserId }, () => build(ctx, svc));
};

async function build(ctx: HistoryContext, svc: Services): Promise<void> {
  const { prisma, tenantId, rng, log } = ctx;
  const volumes = AGENCE_VOLUMES[ctx.profile];
  const tag = tenantId.replace(/-/g, '').slice(0, 6);
  const counts: Counters = {
    contacts: 0,
    properties: 0,
    leases: 0,
    installments: 0,
    payments: 0,
    deals: 0,
    visits: 0,
    tickets: 0,
    statements: 0,
    failures: 0
  };

  // Collaborateurs actifs de l'agence : commerciaux des contacts, des affaires et des tickets.
  const members = await prisma.membership.findMany({
    where: { tenantId, status: MembershipStatus.ACTIVE },
    select: { userId: true }
  });
  const staff = Array.from(new Set([ctx.adminUserId, ...members.map(m => m.userId)]));
  const g: Gen = { ctx, svc, tag, staff, counter: 0 };

  // Règle de pénalité de l'agence : sans elle le service en crée une à 2 % sans délai de grâce.
  const rule = await prisma.rentalPenaltyRule.findFirst({ where: { tenant_id: tenantId, is_active: true } });
  if (!rule) {
    await prisma.rentalPenaltyRule.create({
      data: {
        tenant_id: tenantId,
        is_active: true,
        grace_days: 5,
        mode: 'PERCENT_OF_BALANCE',
        fixed_amount: 0,
        rate: 5,
        cap_amount: 250000,
        min_balance_to_apply: 5000
      }
    });
  }

  // ─────────────────────────────────────────────── propriétaires et prospects
  const owners: ContactRef[] = [];
  for (let i = 0; i < volumes.owners; i++) {
    const at = addDaysTo(ctx.start, -between(rng, 5, 60));
    owners.push(await createContact(g, 'owner', at));
  }
  counts.contacts += owners.length;

  const prospects: ContactRef[] = [];
  const recentFrom = addDaysTo(ctx.end, -45);
  for (let i = 0; i < volumes.prospects; i++) {
    // Les prospects portant une affaire ouverte sont récents ; les autres sont répartis sur l'historique.
    const at =
      i < volumes.openDeals
        ? randomWorkday(rng, recentFrom, addDaysTo(ctx.end, -2))
        : randomWorkday(rng, ctx.start, addDaysTo(ctx.end, -2));
    prospects.push(await createContact(g, 'prospect', at));
  }
  for (let i = 0; i < volumes.archived; i++) {
    const at = randomWorkday(rng, ctx.start, addDaysTo(ctx.end, -200));
    await createContact(g, 'archived', at);
  }
  counts.contacts += prospects.length + volumes.archived;

  // ──────────────────────────────────────────────────────────────── biens
  const propertyPlans = planProperties(rng, volumes.properties, owners.length);
  const leasableIdx = propertyPlans.filter(p => p.leasable).map(p => p.index);
  const leasePlans = planLeases(
    rng,
    ctx.profile,
    ctx.months,
    leasableIdx.map(i => ({ commercial: propertyPlans[i].commercial }))
  );

  // Date de création d'un bien : peu avant son premier bail ; un bien vacant, au hasard dans l'historique.
  const firstLeaseStart = new Map<number, Date>();
  for (const lp of leasePlans) {
    const pIdx = leasableIdx[lp.leasableIndex];
    const s = firstOfMonth(ctx.end, lp.startAgo);
    const cur = firstLeaseStart.get(pIdx);
    if (!cur || s < cur) firstLeaseStart.set(pIdx, s);
  }

  const properties: PropertyRef[] = [];
  for (const plan of propertyPlans) {
    const leased = firstLeaseStart.get(plan.index);
    const createdAt = leased
      ? addDaysTo(leased, -between(rng, 10, 45))
      : randomWorkday(rng, ctx.start, addDaysTo(ctx.end, -10));
    const vacantAndOffered = !leased;
    const created = await prisma.property.create({
      data: {
        internalReference: `BIEN-${String(plan.index + 1).padStart(4, '0')}`,
        propertyType: plan.type,
        ownershipType: 'TENANT',
        tenantId,
        title: plan.title,
        description: plan.description,
        address: plan.address,
        locationZone: plan.zone.name,
        latitude: plan.latitude,
        longitude: plan.longitude,
        transactionModes: plan.leasable ? (plan.forSale ? ['RENTAL', 'SALE'] : ['RENTAL']) : ['SALE'],
        price: plan.leasable && !plan.forSale ? plan.rent : plan.price,
        fees: plan.charges || null,
        currency: 'XOF',
        surfaceArea: plan.surface,
        surfaceUseful: Math.round(plan.surface * 0.9),
        rooms: plan.rooms,
        bedrooms: plan.bedrooms,
        bathrooms: plan.bathrooms,
        furnishingStatus: plan.type === 'STUDIO' ? 'FURNISHED' : null,
        status: 'AVAILABLE',
        availability: 'AVAILABLE',
        isPublished: vacantAndOffered,
        publishedAt: vacantAndOffered ? createdAt : null,
        qualityScore: between(rng, 62, 95),
        createdAt
      },
      select: { id: true }
    });
    properties.push({ id: created.id, plan });
  }
  counts.properties = properties.length;
  log(`agence : ${properties.length} biens, ${owners.length} propriétaires, ${prospects.length} prospects.`);

  // ──────────────────────────────────────────────────── baux et encaissements
  const records: LeaseRecord[] = [];
  const renters = new Map<string, ContactRef>();
  const ownerClientByContact = new Map<string, string>();
  const rentersToDeclare: { leaseId: string; clientId: string; renter: ContactRef }[] = [];

  for (let li = 0; li < leasePlans.length; li++) {
    const lp = leasePlans[li];
    try {
      const rec = await processLease(
        g,
        lp,
        properties,
        leasableIdx,
        owners,
        renters,
        ownerClientByContact,
        counts,
        rentersToDeclare
      );
      if (rec) records.push(rec);
    } catch (error) {
      counts.failures++;
      log(
        `agence : bail ${li + 1}/${leasePlans.length} ignoré — ${error instanceof Error ? error.message : String(error)}`
      );
    }
    if ((li + 1) % 10 === 0) log(`agence : ${li + 1}/${leasePlans.length} baux traités.`);
  }

  // Pénalités des retards en cours (échéances échues impayées au-delà du délai de grâce).
  try {
    await svc.calculatePenaltiesForOverdueInstallments(tenantId, ctx.adminUserId);
  } catch (error) {
    log(`agence : calcul des pénalités échoué — ${error instanceof Error ? error.message : String(error)}`);
  }

  // Déclarations de paiement à valider (circuit « le locataire déclare, l'agence valide »).
  for (const d of rentersToDeclare) {
    await createDeclaration(g, d.leaseId, d.clientId);
  }

  // Statut final des biens : loué s'il porte un bail actif, disponible sinon.
  const activeProps = new Set(records.filter(r => r.kind === 'active').map(r => r.propertyIndex));
  for (const p of properties) {
    const rented = activeProps.has(p.plan.index);
    await prisma.property.update({
      where: { id: p.id },
      data: rented
        ? { status: 'RENTED', availability: 'UNAVAILABLE', isPublished: false }
        : { status: 'AVAILABLE', availability: 'AVAILABLE' }
    });
  }

  // ───────────────────────────────────────────────── affaires, visites
  await buildPipeline(g, properties, owners, prospects, records, counts);

  // ───────────────────────────────────────────────────────────── maintenance
  await buildMaintenance(g, records, properties, counts);

  // ───────────────────────────────────────────── relevés propriétaire
  await buildStatements(g, properties, owners, records, counts);

  log(
    `agence : ${counts.contacts} contacts, ${counts.properties} biens, ${counts.leases} baux, ` +
      `${counts.installments} échéances, ${counts.payments} encaissements, ${counts.deals} affaires, ` +
      `${counts.visits} visites, ${counts.tickets} tickets, ${counts.statements} relevés` +
      (counts.failures ? ` (${counts.failures} élément(s) en échec)` : '') +
      '.'
  );
}

// ───────────────────────────────────────────────────────────────── baux

async function processLease(
  g: Gen,
  lp: LeasePlan,
  properties: PropertyRef[],
  leasableIdx: number[],
  owners: ContactRef[],
  renters: Map<string, ContactRef>,
  ownerClientByContact: Map<string, string>,
  counts: Counters,
  toDeclare: { leaseId: string; clientId: string; renter: ContactRef }[]
): Promise<LeaseRecord | null> {
  const { ctx, svc } = g;
  const { prisma, tenantId, rng, adminUserId } = ctx;
  const propertyIndex = leasableIdx[lp.leasableIndex];
  const prop = properties[propertyIndex];
  const owner = owners[prop.plan.ownerIndex];

  const start = firstOfMonth(ctx.end, lp.startAgo);
  const end = leaseEndDate(ctx.end, lp);
  const today0 = startOfDay(ctx.end);
  const historical = lp.kind !== 'active';

  // Locataire : un renouvellement reprend celui du bail précédent.
  let renter = renters.get(lp.renterKey);
  if (!renter) {
    renter = await createContact(g, 'renter', addDaysTo(start, -between(rng, 12, 40)), {
      company: prop.plan.commercial
    });
    renters.set(lp.renterKey, renter);
    counts.contacts++;
  }

  const rent = Math.max(5_000, Math.round((prop.plan.rent * lp.rentFactor) / 5_000) * 5_000);
  const charges = prop.plan.charges;
  const deposit = rent * 2;
  // `rent_amount` est le loyer d'UNE période de facturation.
  const periodMonths = lp.frequency === 'QUARTERLY' ? 3 : 1;

  // Affaire « gagnée » à l'origine du bail (la plupart des baux ; pas les renouvellements).
  let dealId: string | undefined;
  if (!lp.isRenewal && rng() < 0.7) {
    dealId = await createWonLeaseDeal(g, renter, prop, rent, start, counts);
  }

  const notes = lp.isRenewal
    ? 'Renouvellement du bail précédent, loyer revalorisé.'
    : lp.kind === 'terminated'
      ? 'Résilié à l’initiative du locataire, préavis de trois mois respecté.'
      : lp.kind === 'ended'
        ? 'Bail arrivé à son terme.'
        : prop.plan.commercial
          ? 'Bail commercial.'
          : 'Bail d’habitation.';

  const leaseInput = {
    propertyId: prop.id,
    primaryRenterContactId: renter.id,
    crmDealId: dealId,
    startDate: start,
    // Dernier jour du bail : une borne sur le 1er du mois suivant ferait générer une échéance de trop.
    endDate: addDaysTo(end, -1),
    billingFrequency: lp.frequency,
    dueDayOfMonth: lp.dueDay,
    currency: 'XOF',
    rentAmount: rent * periodMonths,
    serviceChargeAmount: charges * periodMonths,
    securityDepositAmount: deposit,
    penaltyGraceDays: 5,
    penaltyMode: 'PERCENT_OF_BALANCE' as const,
    penaltyRate: 5,
    penaltyCapAmount: 250000,
    moveInDate: start,
    notes
  };

  // Avec bailleur d'abord ; si la barrière « détenu en propre » le refuse (aucune écriture avant), sans bailleur.
  let lease;
  try {
    lease = await svc.createLease(tenantId, { ...leaseInput, ownerContactId: owner.id }, adminUserId);
  } catch {
    lease = await svc.createLease(tenantId, leaseInput, adminUserId);
  }
  counts.leases++;

  const leaseRow = await prisma.rentalLease.findUnique({
    where: { id: lease.id },
    select: { owner_client_id: true, primary_renter_client_id: true }
  });
  const renterClientId = leaseRow?.primary_renter_client_id ?? '';
  await prisma.rentalLease.update({ where: { id: lease.id }, data: { created_at: addDaysTo(start, -7) } });

  // Conditions de gestion et part du propriétaire, pour que honoraires et relevés se calculent.
  const ownerClientId = leaseRow?.owner_client_id ?? null;
  if (ownerClientId) {
    if (!ownerClientByContact.has(owner.id)) {
      ownerClientByContact.set(owner.id, ownerClientId);
      await prisma.ownerManagementTerms.upsert({
        where: { ownerClientId },
        update: {},
        create: {
          tenantId,
          ownerClientId,
          managementFeeMode: 'PERCENT',
          managementFeeRate: pick(rng, [6, 8, 8, 10]),
          managementFeeBase: 'RENT_ONLY',
          updatedByUserId: adminUserId
        }
      });
    }
    await prisma.propertyOwnershipShare.upsert({
      where: { propertyId_ownerClientId: { propertyId: prop.id, ownerClientId } },
      update: {},
      create: { tenantId, propertyId: prop.id, ownerClientId, sharePercent: 100, updatedByUserId: adminUserId }
    });
  }

  // Échéances sur toute la durée du bail (futures comprises).
  const installments = await svc.generateInstallments(tenantId, lease.id, adminUserId);
  counts.installments += installments.length;
  await svc.recalculateInstallmentStatuses(tenantId, lease.id);

  // Dépôt de garantie, encaissé à l'entrée dans les lieux.
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
      pspTransactionId: `HIST-${g.tag}-${lease.lease_number}-CAUT`,
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
  counts.payments++;

  // Règlements des échéances échues, selon le scénario du bail.
  const due = [...installments]
    .map(e => ({ row: e, dueDate: new Date(e.due_date) }))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  const echues = due.filter(d => d.dueDate < today0);
  const unpaid = lp.scenario === 'retard' ? Math.min(lp.unpaid, Math.max(echues.length - 1, 0)) : 0;
  const toPay = echues.slice(0, echues.length - unpaid);

  // « Régularisé » : une ou deux échéances anciennes, payées longtemps après avec pénalité.
  const lateIdx = new Set<number>();
  if (lp.scenario === 'regularise' && toPay.length >= 5) {
    lateIdx.add(between(rng, 0, toPay.length - 4));
    if (rng() < 0.5) lateIdx.add(between(rng, 0, toPay.length - 4));
  }

  for (let i = 0; i < toPay.length; i++) {
    const { row, dueDate } = toPay[i];
    const isLate = lateIdx.has(i);
    let delay = isLate ? between(rng, 50, 140) : rng() < 0.8 ? between(rng, 0, 4) : between(rng, 5, 20);
    if (lp.scenario === 'a_jour' && historical && rng() < 0.5) delay = between(rng, 0, 3);
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
    const partial = lp.scenario === 'partiel' && i === toPay.length - 1;
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
        pspTransactionId: mm ? `HIST-${g.tag}-${lease.lease_number}-${i + 1}` : undefined,
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
    counts.payments++;
  }
  await svc.recalculateInstallmentStatuses(tenantId, lease.id);

  if (lp.scenario === 'declaration') toDeclare.push({ leaseId: lease.id, clientId: renterClientId, renter });

  // Fin de bail : statut, sortie des lieux, restitution du dépôt (avec retenue parfois).
  if (historical) {
    await svc.updateLeaseStatus(tenantId, lease.id, 'ENDED', adminUserId);
    await prisma.rentalLease.update({ where: { id: lease.id }, data: { move_out_date: end } });
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
        await prisma.rentalDepositMovement.update({ where: { id: m.id }, data: { created_at: noonUtc(end) } });
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
      await prisma.rentalDepositMovement.update({ where: { id: refund.id }, data: { created_at: noonUtc(end) } });
    } catch (error) {
      ctx.log(
        `agence : restitution du dépôt ${lease.lease_number} impossible — ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return {
    id: lease.id,
    leaseNumber: lease.lease_number,
    propertyIndex,
    renter,
    start,
    effectiveEnd: end > today0 ? today0 : end,
    kind: lp.kind
  };
}

async function createDeclaration(g: Gen, leaseId: string, clientId: string): Promise<void> {
  const { prisma, tenantId, rng, end } = g.ctx;
  const next = await prisma.rentalInstallment.findFirst({
    where: {
      tenant_id: tenantId,
      lease_id: leaseId,
      status: { in: ['DUE', 'OVERDUE', 'PARTIAL', 'DRAFT'] },
      due_date: { lte: addDaysTo(end, 40) }
    },
    orderBy: { due_date: 'asc' }
  });
  if (!next) return;
  const pending = await prisma.rentalPaymentDeclaration.findFirst({
    where: { tenant_id: tenantId, lease_id: leaseId, status: 'PENDING' },
    select: { id: true }
  });
  if (pending) return;
  await prisma.rentalPaymentDeclaration.create({
    data: {
      tenant_id: tenantId,
      lease_id: leaseId,
      installment_id: next.id,
      declared_by: clientId,
      amount: amountDue(next),
      payment_date: addDaysTo(end, -2),
      payment_method: 'MOBILE_MONEY',
      mobile_operator: 'ORANGE',
      transaction_phone: `07${String(between(rng, 10000000, 99999999))}`,
      reference: `OM${String(between(rng, 200000000, 299999999))}`,
      notes: 'Transfert effectué depuis mon compte Orange Money, capture jointe.',
      status: 'PENDING'
    }
  });
}

// ───────────────────────────────────────────────────────────────── affaires

async function addTraces(
  g: Gen,
  contactId: string,
  dealId: string,
  kind: keyof typeof DEAL_TRACES,
  from: Date,
  to: Date,
  open: boolean,
  max?: number
): Promise<void> {
  const { prisma, tenantId, rng } = g.ctx;
  const pool = DEAL_TRACES[kind];
  const n = Math.min(pool.length, max ?? between(g.ctx.rng, 2, pool.length));
  const span = Math.max(1, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
  let last = from;
  for (let i = 0; i < n; i++) {
    const at = randomWorkday(
      rng,
      addDaysTo(from, Math.floor((span * i) / n)),
      addDaysTo(from, Math.floor((span * (i + 1)) / n))
    );
    last = at > to ? to : at;
    const type = pick(rng, ['CALL', 'WHATSAPP', 'EMAIL', 'MEETING'] as const);
    await prisma.crmActivity.create({
      data: {
        tenantId,
        contactId,
        dealId,
        activityType: i === 2 && kind !== 'GESTION' ? 'VISIT' : type,
        direction: i % 2 === 0 ? 'IN' : 'OUT',
        subject: pool[i].subject,
        content: pool[i].content,
        outcome: i === n - 1 ? (open ? 'En attente de retour' : 'Clôturé') : null,
        occurredAt: last,
        createdByUserId: pickStaff(g),
        nextActionAt: open && i === n - 1 ? addDaysTo(g.ctx.end, between(rng, 1, 6)) : null,
        nextActionType: open && i === n - 1 ? 'Relance téléphonique' : null,
        createdAt: last
      }
    });
  }
  await prisma.crmContact.update({ where: { id: contactId }, data: { lastInteractionAt: last } });
}

async function createWonLeaseDeal(
  g: Gen,
  renter: ContactRef,
  prop: PropertyRef,
  rent: number,
  leaseStart: Date,
  counts: Counters
): Promise<string> {
  const { prisma, tenantId, rng } = g.ctx;
  const created = addDaysTo(leaseStart, -between(rng, 18, 35));
  const closed = addDaysTo(leaseStart, -between(rng, 1, 4));
  const deal = await prisma.crmDeal.create({
    data: {
      tenantId,
      contactId: renter.id,
      type: 'LOCATION',
      stage: 'WON',
      budgetMin: Math.round(rent * 0.8),
      budgetMax: Math.round(rent * 1.2),
      locationZone: prop.plan.zone.name,
      expectedValue: rent,
      probability: 1,
      assignedToUserId: pickStaff(g),
      closedAt: closed,
      createdAt: created
    },
    select: { id: true }
  });
  counts.deals++;
  await prisma.crmDealProperty.create({
    data: { tenantId, dealId: deal.id, propertyId: prop.id, matchScore: between(rng, 70, 98), status: 'SELECTED' }
  });
  await addTraces(g, renter.id, deal.id, 'LOCATION', created, closed, false);
  await prisma.propertyVisit.create({
    data: {
      propertyId: prop.id,
      tenantId,
      contactId: renter.id,
      dealId: deal.id,
      visitType: 'VISIT',
      goal: 'CONTRACT_SIGNING',
      scheduledAt: addDaysTo(created, between(rng, 4, 12)),
      duration: 45,
      location: `Sur site — ${prop.plan.zone.name}`,
      status: 'DONE',
      assignedToUserId: pickStaff(g),
      notes: 'Visite concluante, le client souhaite poursuivre.'
    }
  });
  counts.visits++;
  await ensureRole(g, renter.id, 'LOCATAIRE', created);
  return deal.id;
}

async function buildPipeline(
  g: Gen,
  properties: PropertyRef[],
  owners: ContactRef[],
  prospects: ContactRef[],
  records: LeaseRecord[],
  counts: Counters
): Promise<void> {
  const { ctx } = g;
  const { prisma, tenantId, rng, end } = ctx;
  const volumes = AGENCE_VOLUMES[ctx.profile];
  const rented = new Set(records.filter(r => r.kind === 'active').map(r => r.propertyIndex));
  const forRent = properties.filter(p => p.plan.leasable && !rented.has(p.plan.index));
  const forSale = properties.filter(p => p.plan.forSale && !rented.has(p.plan.index));
  const allOffers = properties.filter(p => !rented.has(p.plan.index));

  // Mandats de gestion signés avec les propriétaires, à leur arrivée.
  for (const owner of owners) {
    const closed = addDaysTo(owner.createdAt, between(ctx.rng, 10, 25));
    const deal = await prisma.crmDeal.create({
      data: {
        tenantId,
        contactId: owner.id,
        type: 'GESTION',
        stage: 'WON',
        locationZone: pick(rng, ZONES).name,
        expectedValue: between(rng, 8, 30) * 100_000,
        probability: 1,
        assignedToUserId: pickStaff(g),
        closedAt: closed > end ? end : closed,
        createdAt: owner.createdAt
      },
      select: { id: true }
    });
    counts.deals++;
    await addTraces(g, owner.id, deal.id, 'GESTION', owner.createdAt, closed > end ? end : closed, false, 3);
  }

  const stages = ['NEW', 'QUALIFIED', 'VISIT', 'NEGOTIATION', 'QUALIFIED', 'NEW', 'VISIT', 'NEGOTIATION'] as const;

  // Affaires ouvertes : prospects récents.
  let futureVisits = 0;
  for (let i = 0; i < volumes.openDeals && i < prospects.length; i++) {
    const contact = prospects[i];
    const stage = stages[i % stages.length];
    const rental = rng() < 0.6;
    const pool = rental ? forRent : forSale.length > 0 ? forSale : forRent;
    const offered = pool.length > 0 ? [pick(rng, pool), pick(rng, pool)].filter((p, k, a) => a.indexOf(p) === k) : [];
    const ref = offered[0];
    const rentValue = ref?.plan.rent || between(rng, 8, 60) * 10_000;
    const type = rental ? 'LOCATION' : 'ACHAT';
    const value = rental ? rentValue : (ref?.plan.price ?? between(rng, 30, 120) * 1_000_000);
    const deal = await prisma.crmDeal.create({
      data: {
        tenantId,
        contactId: contact.id,
        type,
        stage,
        budgetMin: Math.round(value * 0.85),
        budgetMax: Math.round(value * 1.15),
        locationZone: ref?.plan.zone.name ?? pick(rng, ZONES).name,
        expectedValue: value,
        probability: { NEW: 0.2, QUALIFIED: 0.4, VISIT: 0.6, NEGOTIATION: 0.8 }[stage],
        assignedToUserId: pickStaff(g),
        createdAt: contact.createdAt
      },
      select: { id: true }
    });
    counts.deals++;
    await ensureRole(g, contact.id, rental ? 'LOCATAIRE' : 'ACQUEREUR', contact.createdAt);
    for (const p of offered) {
      await prisma.crmDealProperty.create({
        data: {
          tenantId,
          dealId: deal.id,
          propertyId: p.id,
          matchScore: between(rng, 55, 95),
          status: stage === 'NEW' ? 'SHORTLISTED' : stage === 'QUALIFIED' ? 'PROPOSED' : 'VISITED'
        }
      });
    }
    await addTraces(
      g,
      contact.id,
      deal.id,
      rental ? 'LOCATION' : 'ACHAT',
      contact.createdAt,
      addDaysTo(end, -1),
      true,
      stage === 'NEW' ? 1 : undefined
    );

    if ((stage === 'VISIT' || stage === 'NEGOTIATION') && ref) {
      // Une visite déjà faite, et pour l'étape « Visite » une autre à venir.
      await createVisit(
        g,
        ref,
        contact.id,
        deal.id,
        randomWorkday(rng, addDaysTo(end, -12), addDaysTo(end, -1)),
        'DONE',
        counts
      );
      if (stage === 'VISIT') {
        const at = randomWorkday(rng, addDaysTo(end, 1), addDaysTo(end, 9));
        await createVisit(g, ref, contact.id, deal.id, at, rng() < 0.5 ? 'CONFIRMED' : 'SCHEDULED', counts);
        futureVisits++;
      }
    }
  }

  // Affaires perdues : réparties sur l'historique.
  for (let i = 0; i < volumes.lostDeals; i++) {
    const contact = prospects[volumes.openDeals + i];
    if (!contact) break;
    const rental = rng() < 0.6;
    const pool = rental ? forRent : forSale;
    const ref = pool.length > 0 ? pick(rng, pool) : allOffers[0];
    const base = ref?.plan.rent || between(rng, 10, 50) * 10_000;
    const value = rental ? base : (ref?.plan.price ?? 40_000_000);
    const closedAt = addDaysTo(contact.createdAt, between(rng, 10, 40));
    const deal = await prisma.crmDeal.create({
      data: {
        tenantId,
        contactId: contact.id,
        type: rental ? 'LOCATION' : 'ACHAT',
        stage: 'LOST',
        budgetMin: Math.round(value * 0.8),
        budgetMax: Math.round(value * 1.1),
        locationZone: ref?.plan.zone.name ?? pick(rng, ZONES).name,
        expectedValue: value,
        probability: 0,
        assignedToUserId: pickStaff(g),
        closedReason: pick(rng, LOST_REASONS),
        closedAt: closedAt > end ? end : closedAt,
        createdAt: contact.createdAt
      },
      select: { id: true }
    });
    counts.deals++;
    await addTraces(
      g,
      contact.id,
      deal.id,
      rental ? 'LOCATION' : 'ACHAT',
      contact.createdAt,
      closedAt > end ? end : closedAt,
      false,
      2
    );
    if (ref && rng() < 0.6) {
      await createVisit(
        g,
        ref,
        contact.id,
        deal.id,
        addDaysTo(contact.createdAt, between(rng, 3, 8)),
        rng() < 0.7 ? 'DONE' : 'NO_SHOW',
        counts
      );
    }
  }

  // Visites supplémentaires de prospects, passées et à venir.
  const extra = volumes.extraVisits;
  for (let i = 0; i < extra; i++) {
    const contact = prospects[between(rng, 0, prospects.length - 1)];
    const ref = allOffers.length > 0 ? pick(rng, allOffers) : properties[0];
    if (!contact || !ref) break;
    if (i < 3 - Math.min(futureVisits, 2)) {
      const at = randomWorkday(rng, addDaysTo(end, 1), addDaysTo(end, 12));
      await createVisit(g, ref, contact.id, null, at, rng() < 0.5 ? 'CONFIRMED' : 'SCHEDULED', counts);
    } else {
      const at = randomWorkday(rng, ctx.start, addDaysTo(end, -1));
      const r = rng();
      const status = r < 0.7 ? 'DONE' : r < 0.82 ? 'NO_SHOW' : 'CANCELED';
      await createVisit(g, ref, contact.id, null, at, status, counts);
    }
  }
}

async function createVisit(
  g: Gen,
  prop: PropertyRef,
  contactId: string,
  dealId: string | null,
  at: Date,
  status: 'SCHEDULED' | 'CONFIRMED' | 'DONE' | 'NO_SHOW' | 'CANCELED',
  counts: Counters
): Promise<void> {
  const { prisma, tenantId, rng } = g.ctx;
  await prisma.propertyVisit.create({
    data: {
      propertyId: prop.id,
      tenantId,
      contactId,
      dealId,
      visitType: 'VISIT',
      goal: pick(rng, ['CONTACT_TAKING', 'EVALUATION', 'NEGOTIATION', 'FOLLOW_UP'] as const),
      scheduledAt: at,
      duration: pick(rng, [30, 45, 60]),
      location: `Sur site — ${prop.plan.zone.name}`,
      status,
      assignedToUserId: pickStaff(g),
      notes:
        status === 'DONE'
          ? 'Visite effectuée, retour du client à recueillir.'
          : status === 'NO_SHOW'
            ? 'Le visiteur ne s’est pas présenté.'
            : status === 'CANCELED'
              ? 'Annulée par le visiteur.'
              : 'Rendez-vous confirmé par téléphone.',
      createdAt: addDaysTo(at, -between(rng, 1, 6)) > g.ctx.end ? g.ctx.end : addDaysTo(at, -between(rng, 1, 6))
    }
  });
  counts.visits++;
}

// ─────────────────────────────────────────────────────────────── maintenance

const CATEGORY_SPECIALTY: Record<TicketCategoryName, string> = {
  PLUMBING: 'plumbing',
  ELECTRICITY: 'electricity',
  AC: 'ac',
  OTHER: 'other'
};

async function buildMaintenance(
  g: Gen,
  records: LeaseRecord[],
  properties: PropertyRef[],
  counts: Counters
): Promise<void> {
  const { ctx } = g;
  const { prisma, tenantId, rng, end } = ctx;
  const volumes = AGENCE_VOLUMES[ctx.profile];
  if (records.length === 0) return;

  const vendors: { id: string; specialties: readonly string[] }[] = [];
  for (let i = 0; i < Math.min(volumes.vendors, VENDOR_POOL.length); i++) {
    const v = VENDOR_POOL[i];
    // La route « Prestataires » lit `service_providers` (source de vérité) et ne lit
    // `maintenance_vendors` que comme miroir de même identifiant : écrire les deux.
    const provider = await prisma.serviceProvider.create({
      data: {
        tenantId,
        name: v.name,
        specialty: v.specialties.join(', '),
        email: v.email,
        phone: v.phone
      },
      select: { id: true }
    });
    const row = await prisma.maintenanceVendor.create({
      data: {
        id: provider.id,
        tenant_id: tenantId,
        name: v.name,
        phone: v.phone,
        email: v.email,
        address: v.address,
        specialties: [...v.specialties],
        is_active: i !== VENDOR_POOL.length - 1 || volumes.vendors < VENDOR_POOL.length
      },
      select: { id: true }
    });
    vendors.push({ id: row.id, specialties: v.specialties });
  }

  const recentCount = ctx.profile === '6m' ? 2 : 3;
  for (let i = 0; i < volumes.tickets; i++) {
    const recent = i < recentCount;
    const candidates = recent ? records.filter(r => r.kind === 'active') : records;
    if (candidates.length === 0) continue;

    // Fenêtre où le locataire occupe les lieux.
    let rec = pick(rng, candidates);
    let from = recent ? addDaysTo(end, -14) : addDaysTo(rec.start, 14);
    let to = recent ? addDaysTo(end, -1) : addDaysTo(rec.effectiveEnd, -1);
    for (let attempt = 0; attempt < 6 && to.getTime() - from.getTime() < 3 * 86_400_000; attempt++) {
      rec = pick(rng, candidates);
      from = recent ? addDaysTo(end, -14) : addDaysTo(rec.start, 14);
      to = recent ? addDaysTo(end, -1) : addDaysTo(rec.effectiveEnd, -1);
    }
    if (to.getTime() - from.getTime() < 3 * 86_400_000) continue;

    const tpl = pick(rng, TICKET_TEMPLATES);
    const declared = randomWorkday(rng, from < ctx.start ? ctx.start : from, to);
    const ageDays = Math.floor((end.getTime() - declared.getTime()) / 86_400_000);

    // État selon l'âge : le passé est résolu (ou annulé), le récent peut être ouvert.
    type S = 'DECLARED' | 'IN_PROGRESS' | 'ASSIGNED' | 'RESOLVED' | 'CANCELED';
    let status: S;
    if (ageDays > 25) {
      status = rng() < 0.88 ? 'RESOLVED' : 'CANCELED';
    } else {
      const options: S[] = ['DECLARED', 'IN_PROGRESS', 'ASSIGNED'];
      if (ageDays >= 5) options.push('RESOLVED');
      status = pick(rng, options);
    }

    const withVendor = status === 'ASSIGNED' || (status === 'RESOLVED' && rng() < 0.7);
    const specialty = CATEGORY_SPECIALTY[tpl.category];
    const matching = vendors.filter(v => v.specialties.includes(specialty));
    const vendor = withVendor && vendors.length > 0 ? pick(rng, matching.length > 0 ? matching : vendors) : null;

    const inProgressAt = status !== 'DECLARED' ? new Date(declared.getTime() + 26 * 3_600_000) : null;
    const assignedAt = vendor ? new Date(declared.getTime() + 2 * 86_400_000) : null;
    const resolveDelay = Math.max(2, Math.min(ageDays - 1, between(rng, 3, 14)));
    const resolvedAt = status === 'RESOLVED' ? new Date(declared.getTime() + resolveDelay * 86_400_000) : null;
    const canceledAt = status === 'CANCELED' ? new Date(declared.getTime() + between(rng, 1, 3) * 86_400_000) : null;
    const manager = pickStaff(g);

    const ticket = await prisma.maintenanceTicket.create({
      data: {
        tenant_id: tenantId,
        property_id: properties[rec.propertyIndex].id,
        lease_id: rec.id,
        tenant_contact_id: rec.renter.id,
        created_by_contact_id: rec.renter.id,
        title: tpl.title,
        category: tpl.category,
        priority: tpl.priority,
        description: tpl.description,
        location_details: tpl.location,
        status,
        assigned_vendor_id: vendor?.id ?? null,
        assigned_to_user_id: status === 'DECLARED' ? null : manager,
        resolution_notes: status === 'RESOLVED' ? tpl.resolution : null,
        declared_at: declared,
        in_progress_at: inProgressAt,
        assigned_at: assignedAt,
        resolved_at: resolvedAt,
        canceled_at: canceledAt,
        created_at: declared
      },
      select: { id: true }
    });
    counts.tickets++;

    const steps: { from: S | null; to: S; at: Date; note: string }[] = [
      { from: null, to: 'DECLARED', at: declared, note: 'Signalé depuis le portail locataire.' }
    ];
    if (inProgressAt)
      steps.push({ from: 'DECLARED', to: 'IN_PROGRESS', at: inProgressAt, note: 'Pris en charge par l’agence.' });
    if (assignedAt) steps.push({ from: 'IN_PROGRESS', to: 'ASSIGNED', at: assignedAt, note: 'Prestataire mandaté.' });
    if (resolvedAt) {
      steps.push({
        from: assignedAt ? 'ASSIGNED' : 'IN_PROGRESS',
        to: 'RESOLVED',
        at: resolvedAt,
        note: tpl.resolution
      });
    }
    if (canceledAt)
      steps.push({ from: 'IN_PROGRESS', to: 'CANCELED', at: canceledAt, note: 'Annulé à la demande du locataire.' });

    for (const s of steps) {
      await prisma.maintenanceTicketStatusHistory.create({
        data: {
          tenant_id: tenantId,
          ticket_id: ticket.id,
          from_status: s.from,
          to_status: s.to,
          note: s.note,
          changed_by_user_id: s.from === null ? null : manager,
          changed_at: s.at
        }
      });
    }

    const comments: { author: 'TENANT' | 'MANAGER'; text: string; at: Date }[] = [
      { author: 'TENANT', text: tpl.description, at: declared }
    ];
    if (inProgressAt) comments.push({ author: 'MANAGER', text: tpl.managerReply, at: inProgressAt });
    if (resolvedAt) {
      comments.push({ author: 'MANAGER', text: `Intervention terminée : ${tpl.resolution}`, at: resolvedAt });
      if (rng() < 0.6) {
        comments.push({
          author: 'TENANT',
          text: 'Merci, tout est rentré dans l’ordre.',
          at: new Date(resolvedAt.getTime() + 4 * 3_600_000)
        });
      }
    }
    if (canceledAt) {
      comments.push({ author: 'TENANT', text: 'Le problème a disparu, je retire ma demande.', at: canceledAt });
    }
    for (const c of comments) {
      await prisma.maintenanceTicketComment.create({
        data: {
          tenant_id: tenantId,
          ticket_id: ticket.id,
          author_type: c.author,
          content: c.text,
          author_user_id: c.author === 'MANAGER' ? manager : null,
          author_contact_id: c.author === 'TENANT' ? rec.renter.id : null,
          created_at: c.at
        }
      });
    }
  }
}

// ───────────────────────────────────────────────── relevés propriétaire

async function buildStatements(
  g: Gen,
  properties: PropertyRef[],
  owners: ContactRef[],
  records: LeaseRecord[],
  counts: Counters
): Promise<void> {
  const { ctx, svc } = g;
  const { prisma, tenantId, end, log } = ctx;
  const volumes = AGENCE_VOLUMES[ctx.profile];

  for (let o = 0; o < owners.length; o++) {
    const owner = owners[o];
    const ownProps = properties.filter(p => p.plan.ownerIndex === o);
    const leasedIdx = new Set(records.map(r => r.propertyIndex));
    const withLeases = ownProps.filter(p => leasedIdx.has(p.plan.index));
    if (withLeases.length === 0) continue;
    const firstStart = records
      .filter(r => withLeases.some(p => p.plan.index === r.propertyIndex))
      .reduce((min, r) => (r.start < min ? r.start : min), end);

    for (let m = volumes.statementMonths; m >= 1; m--) {
      const monthStart = firstOfMonth(end, m);
      if (addMonths(monthStart, 1) <= firstStart) continue;
      const period = periodOf(monthStart);
      try {
        const statement = await svc.generateOwnerStatement(tenantId, {
          ownerContactId: owner.id,
          period,
          propertyIds: withLeases.map(p => p.id)
        });
        if (!statement) continue;
        const sentAtRaw = addDaysTo(addMonths(monthStart, 1), 2);
        const sentAt = sentAtRaw > end ? end : sentAtRaw;
        if (m >= 2) {
          const paidAt = addDaysTo(addMonths(monthStart, 1), 8);
          await svc.updateOwnerStatement(tenantId, statement.id, { status: 'PAID', paidAt });
          await prisma.ownerStatement.update({ where: { id: statement.id }, data: { sentAt, createdAt: sentAt } });
        } else {
          await svc.updateOwnerStatement(tenantId, statement.id, { status: 'SENT' });
          await prisma.ownerStatement.update({ where: { id: statement.id }, data: { sentAt, createdAt: sentAt } });
        }
        counts.statements++;
      } catch (error) {
        log(
          `agence : relevé ${period} de ${owner.lastName} ignoré — ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
}
