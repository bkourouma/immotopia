/**
 * Patrimoine du promoteur : les lots que la société conserve à la livraison
 * (basculés en patrimoine par `capitalizeSiteLotTx`) deviennent un parc locatif :
 * typologie et prix, valorisations successives, baux et encaissements (par les
 * vrais services de gestion locative), prêts, dépenses récurrentes, travaux,
 * polices d'assurance (actives, expirées) et sinistres, plan de trésorerie,
 * hypothèses de rendement (en fractions), profils fiscaux, carnet d'entretien,
 * accès partagés et tickets des locataires.
 *
 * Idempotent par bloc : chaque bloc se saute dès que le tenant porte ses lignes.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { between, pick } from './types';
import { addDays, roundTo } from './agence-commercial-data';
import { addDaysTo, addMonths, startOfDay, ymd } from './agence-plan';
import { buildAuditRow } from '../../../src/services/audit-entry-builder';
import { AuditActionKey } from '../../../src/types/audit-types';
import {
  claimQuote,
  expertReport,
  insuranceCertificate,
  insurerLetter,
  repairInvoice,
  titleDeed
} from './patrimoine-extras-docs';
import type { DocContent, PropFacts } from './patrimoine-extras-docs';
import { putPropertyDoc } from './patrimoine-extras-state';
import type { PatState } from './patrimoine-extras-state';
import { sceneImage, sha256 } from './patrimoine-extras-files';
import type { SceneKind } from './patrimoine-extras-files';
import { lotSpec, PROGRAMS, WARRANTY_TICKETS } from './promoteur-commercial-data';
import type { PEnv, ProgCode } from './promoteur-commercial-data';
import { createContact } from './promoteur-commercial-crm';
import type { ContactRef } from './promoteur-commercial-crm';
import { seedVendors, writeTicket } from './promoteur-commercial-maintenance';
import type { VendorRef } from './promoteur-commercial-maintenance';

const DAY = 86_400_000;

interface Kept {
  propertyId: string;
  ref: string;
  lotName: string;
  surface: number;
  floor: number;
  code: ProgCode;
  siteId: string;
  deliveredAt: Date;
  cost: number;
  assetId: string | null;
  index: number;
  title: string;
  type: string;
  rooms: number;
  bedrooms: number;
  bathrooms: number;
  /** Valeur de marché à la livraison (prix de vente du programme). */
  market: number;
}

type Scenario = 'a_jour' | 'retard' | 'regularise' | 'partiel' | 'ended' | 'vacant';
const SCENARIOS: Scenario[] = [
  'a_jour',
  'a_jour',
  'retard',
  'regularise',
  'partiel',
  'ended',
  'a_jour',
  'a_jour',
  'vacant',
  'vacant'
];

const facts = (k: Kept, address: string): PropFacts => ({
  title: k.title,
  ref: k.ref,
  type: k.type,
  address,
  zone: PROGRAMS[k.code].zone,
  surface: k.surface
});

async function loadKept(env: PEnv): Promise<Kept[]> {
  const { prisma, tenantId, rng } = env;
  const lots = await prisma.siteLot.findMany({
    where: { tenantId, propertyId: { not: null } },
    select: {
      name: true,
      surfaceArea: true,
      propertyId: true,
      siteId: true,
      site: { select: { name: true, closedAt: true } }
    }
  });
  const out: Kept[] = [];
  for (const l of lots) {
    const code = /cocotiers/i.test(l.site.name)
      ? 'COC'
      : /orchid/i.test(l.site.name)
        ? 'ORC'
        : /angr/i.test(l.site.name)
          ? 'ANG'
          : /vallons/i.test(l.site.name)
            ? 'VAL'
            : null;
    if (!code || !l.propertyId || !l.site.closedAt) continue;
    const prop = await prisma.property.findUnique({
      where: { id: l.propertyId },
      select: { internalReference: true }
    });
    const val = await prisma.assetValuation.findFirst({
      where: { tenantId, propertyId: l.propertyId },
      orderBy: { valuatedAt: 'asc' },
      select: { estimatedValue: true, acquisitionCost: true }
    });
    const asset = await prisma.asset.findFirst({ where: { tenantId, propertyId: l.propertyId }, select: { id: true } });
    const surface = Number(l.surfaceArea ?? 80);
    const idx = Number(l.name.replace(/\D/g, '')) || 1;
    const floor = Math.floor((idx - 1) / 3);
    const spec = lotSpec(code, surface, false, floor);
    const program = PROGRAMS[code];
    const cost = Number(val?.acquisitionCost ?? val?.estimatedValue ?? surface * program.pricePerM2 * 0.65);
    out.push({
      propertyId: l.propertyId,
      ref: prop?.internalReference ?? `${code}-${l.name}`,
      lotName: l.name,
      surface,
      floor,
      code,
      siteId: l.siteId,
      deliveredAt: l.site.closedAt,
      cost,
      assetId: asset?.id ?? null,
      index: 0,
      title: `${spec.label} — ${program.brand} (${l.name.toLowerCase()})`,
      type: spec.type,
      rooms: spec.rooms,
      bedrooms: spec.bedrooms,
      bathrooms: spec.bathrooms,
      market: Math.round(program.pricePerM2 * surface * spec.premium * (0.98 + rng() * 0.04))
    });
  }
  out.sort((a, b) =>
    a.code === b.code ? a.lotName.localeCompare(b.lotName, 'fr', { numeric: true }) : a.code.localeCompare(b.code)
  );
  out.forEach((k, i) => (k.index = i));
  return out;
}

// ───────────────────────────────────────────────────────── typologie des lots conservés

async function reclassify(env: PEnv, kept: Kept[]): Promise<void> {
  const { prisma, rng, log } = env;
  let n = 0;
  for (const k of kept) {
    const p = await prisma.property.findUnique({
      where: { id: k.propertyId },
      select: { price: true, transactionModes: true }
    });
    if (!p || p.price !== null || p.transactionModes.length > 0) continue;
    const program = PROGRAMS[k.code];
    const scenario = SCENARIOS[k.index % SCENARIOS.length];
    const rent = roundTo((k.market * 0.072) / 12, 5_000);
    const both = scenario === 'vacant' && k.index % 2 === 1;
    await prisma.property.update({
      where: { id: k.propertyId },
      data: {
        propertyType: k.type as 'APPARTEMENT',
        title: k.title,
        description:
          `${k.title.split(' — ')[0]} de ${k.surface} m² conservé par la société à la livraison de ${program.brand} (${program.place}) : ` +
          `climatisation, cuisine équipée, parking en sous-sol. Bien intégré au patrimoine locatif du promoteur, ${program.highlights}.`,
        address: `${program.brand}, ${program.place}`,
        locationZone: program.zone,
        latitude: Number((program.lat + (rng() - 0.5) * 0.004).toFixed(6)),
        longitude: Number((program.lng + (rng() - 0.5) * 0.004).toFixed(6)),
        transactionModes: both ? ['RENTAL', 'SALE'] : ['RENTAL'],
        price: both ? k.market : rent,
        fees: roundTo(rent * 0.06, 5_000),
        surfaceArea: k.surface,
        surfaceUseful: Math.round(k.surface * 0.92 * 10) / 10,
        rooms: k.rooms,
        bedrooms: k.bedrooms,
        bathrooms: k.bathrooms,
        qualityScore: between(rng, 72, 96),
        updatedAt: addDays(k.deliveredAt, 10)
      }
    });
    n += 1;
  }
  if (n > 0) log(`promoteur-commercial : ${n} lots conservés décrits (types, surfaces, loyers, adresses).`);
}

async function setAssetCosts(env: PEnv, kept: Kept[]): Promise<void> {
  const { prisma } = env;
  for (const k of kept) {
    if (!k.assetId) continue;
    await prisma.asset.updateMany({
      where: { id: k.assetId, acquisitionCost: null },
      data: {
        acquisitionCost: Math.round(k.cost),
        acquisitionDate: k.deliveredAt,
        notes: 'Lot conservé par la société à la livraison du programme, au coût de revient.'
      }
    });
  }
}

// ───────────────────────────────────────────────────────── valorisations

async function seedValuations(env: PEnv, kept: Kept[]): Promise<void> {
  const { prisma, tenantId, ctx, rng, log } = env;
  let n = 0;
  const T = ctx.end;
  for (const k of kept) {
    const count = await prisma.assetValuation.count({ where: { tenantId, propertyId: k.propertyId } });
    if (count > 1) continue;
    const rows: Prisma.AssetValuationUncheckedCreateInput[] = [];
    const months = Math.floor((T.getTime() - k.deliveredAt.getTime()) / (30.44 * DAY));
    const steps = [3, 6, 9, 12, 14].filter(m => m <= months - 0.3);
    steps.push(Math.max(months - 1, 1));
    let last = -1;
    for (const m of Array.from(new Set(steps))) {
      if (m === last) continue;
      last = m;
      const date = addMonths(k.deliveredAt, m);
      if (date > addDays(T, -8)) continue;
      // À la livraison la valeur vénale rejoint le marché (coût de revient → valeur d'expert), puis dérive d'environ 4 % par an.
      const drift = Math.pow(1.04, m / 12);
      const base = m < 3 ? k.cost : k.market * 0.93 * drift;
      const noise = 1 + (rng() - 0.5) * 0.015;
      const method = m === 3 || m === 12 ? 'EXPERT_APPRAISAL' : m % 2 === 0 ? 'MARKET_ESTIMATE' : 'MANUAL';
      rows.push({
        tenantId,
        propertyId: k.propertyId,
        valuatedAt: date,
        estimatedValue: roundTo(base * noise, 100_000),
        currency: 'XOF',
        method,
        source:
          method === 'EXPERT_APPRAISAL'
            ? 'Cabinet Expertim CI — expertise immobilière'
            : method === 'MARKET_ESTIMATE'
              ? 'Comparables du marché (ventes du programme)'
              : 'Estimation interne du service patrimoine',
        reliability: method === 'EXPERT_APPRAISAL' ? 'HIGH' : method === 'MARKET_ESTIMATE' ? 'MEDIUM' : 'LOW',
        reliabilityReasons: [],
        notes:
          method === 'EXPERT_APPRAISAL'
            ? 'Valeur vénale retenue par l’expert après livraison et mise en location.'
            : null,
        createdAt: date
      });
    }
    if (rows.length > 0) {
      await prisma.assetValuation.createMany({ data: rows });
      n += rows.length;
    }
  }
  if (n > 0) log(`promoteur-commercial : ${n} valorisations supplémentaires des lots conservés.`);
}

// ───────────────────────────────────────────────────────── baux et encaissements

interface LeaseServices {
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
}

async function loadLeaseServices(): Promise<LeaseServices> {
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
const OPERATORS = ['ORANGE', 'MTN', 'MOOV', 'WAVE'] as const;
const METHODS = ['MOBILE_MONEY', 'MOBILE_MONEY', 'BANK_TRANSFER', 'BANK_TRANSFER', 'CASH', 'CHECK'] as const;

export interface LeaseRecord {
  leaseId: string;
  leaseNumber: string;
  kept: Kept;
  renter: ContactRef;
  status: 'ACTIVE' | 'ENDED';
  start: Date;
  end: Date;
}

async function seedLeases(env: PEnv, kept: Kept[]): Promise<LeaseRecord[]> {
  const { prisma, tenantId, rng, ctx, adminUserId, log, tag } = env;
  const T = ctx.end;
  const out: LeaseRecord[] = [];
  const todo: Kept[] = [];
  for (const k of kept) {
    const scenario = SCENARIOS[k.index % SCENARIOS.length];
    if (scenario === 'vacant') continue;
    if ((await prisma.rentalLease.count({ where: { tenant_id: tenantId, property_id: k.propertyId } })) > 0) continue;
    todo.push(k);
  }
  if (todo.length === 0) return out;
  const svc = await loadLeaseServices();

  for (const k of todo) {
    const scenario = SCENARIOS[k.index % SCENARIOS.length];
    try {
      const start = startOfDay(addDays(k.deliveredAt, between(rng, 18, 70)));
      if (start > addDays(T, -35)) continue;
      const ended = scenario === 'ended';
      const durationMonths = ended ? 12 : 24;
      const endDate = addDaysTo(addMonths(start, durationMonths), -1);
      const rent = roundTo((k.market * 0.072) / 12, 5_000);
      const charges = roundTo(rent * 0.06, 5_000);
      const deposit = rent * 2;
      const renter = await createContact(env, {
        kind: 'RENTER',
        createdAt: addDays(start, -between(rng, 12, 40)),
        status: 'ACTIVE_CLIENT',
        convertedAt: start,
        lastInteractionAt: addDays(T, -between(rng, 3, 40))
      });
      const lease = await svc.createLease(
        tenantId,
        {
          propertyId: k.propertyId,
          primaryRenterContactId: renter.id,
          startDate: start,
          endDate,
          billingFrequency: 'MONTHLY',
          dueDayOfMonth: pick(rng, [5, 5, 10]),
          currency: 'XOF',
          rentAmount: rent,
          serviceChargeAmount: charges,
          securityDepositAmount: deposit,
          penaltyGraceDays: 5,
          penaltyMode: 'PERCENT_OF_BALANCE' as const,
          penaltyRate: 5,
          penaltyCapAmount: 250000,
          moveInDate: start,
          notes: ended
            ? 'Bail d’habitation d’un an, résilié à l’initiative du locataire (mutation professionnelle).'
            : 'Bail d’habitation de deux ans sur un lot conservé par la société.'
        },
        adminUserId
      );
      const row = await prisma.rentalLease.findUnique({
        where: { id: lease.id },
        select: { primary_renter_client_id: true }
      });
      const renterClientId = row?.primary_renter_client_id ?? '';
      await prisma.rentalLease.update({ where: { id: lease.id }, data: { created_at: addDaysTo(start, -7) } });
      const installments = await svc.generateInstallments(tenantId, lease.id, adminUserId);
      await svc.recalculateInstallmentStatuses(tenantId, lease.id);

      const depot = await svc.createDeposit(tenantId, lease.id, adminUserId);
      const depositPaidAt = start <= T ? start : addDaysTo(T, -1);
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
      const move = await svc.createDepositMovement(
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
        where: { id: move.id },
        data: { created_at: noonUtc(depositPaidAt) }
      });

      const today0 = startOfDay(T);
      const due = [...installments]
        .map(e => ({ row: e, dueDate: new Date(e.due_date) }))
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
      const echues = due.filter(d => d.dueDate < today0);
      const unpaid = scenario === 'retard' ? Math.min(2, Math.max(echues.length - 1, 0)) : 0;
      const toPay = echues.slice(0, echues.length - unpaid);
      const lateIdx = new Set<number>();
      if (scenario === 'regularise' && toPay.length >= 4) lateIdx.add(between(rng, 0, Math.max(0, toPay.length - 4)));

      for (let i = 0; i < toPay.length; i++) {
        const { row: inst, dueDate } = toPay[i];
        const isLate = lateIdx.has(i);
        const delay = isLate ? between(rng, 40, 75) : rng() < 0.8 ? between(rng, 0, 4) : between(rng, 5, 15);
        let payDate = addDaysTo(dueDate, delay);
        const yesterday = addDaysTo(today0, -1);
        if (payDate > yesterday) payDate = yesterday;
        if (payDate < start) payDate = start;
        let current = inst;
        if (isLate) {
          try {
            await svc.calculatePenalty(tenantId, inst.id, undefined, adminUserId);
            const fresh = await prisma.rentalInstallment.findUnique({ where: { id: inst.id } });
            if (fresh) current = fresh;
          } catch {
            // Pas de pénalité : le retard se règle au montant de base.
          }
        }
        const total = amountDue(current);
        const partial = scenario === 'partiel' && i === toPay.length - 1;
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
            idempotencyKey: `hist-reglement-${inst.id}`,
            paidAt: ymd(payDate)
          },
          adminUserId
        );
        await svc.allocatePayment(tenantId, payment.id, { installmentIds: [inst.id] }, adminUserId);
        const when = noonUtc(payDate);
        await prisma.rentalPayment.update({
          where: { id: payment.id },
          data: { initiated_at: when, created_at: when }
        });
        await prisma.rentalPaymentAllocation.updateMany({
          where: { payment_id: payment.id },
          data: { created_at: when }
        });
        await prisma.rentalInstallment.updateMany({
          where: { id: inst.id, paid_at: { not: null } },
          data: { paid_at: when }
        });
      }
      await svc.recalculateInstallmentStatuses(tenantId, lease.id);

      if (ended) {
        await svc.updateLeaseStatus(tenantId, lease.id, 'ENDED', adminUserId);
        await prisma.rentalLease.update({ where: { id: lease.id }, data: { move_out_date: endDate } });
        try {
          const retained = Math.round((deposit * between(rng, 8, 20)) / 100 / 1000) * 1000;
          const m1 = await svc.createDepositMovement(
            tenantId,
            depot.id,
            'FORFEIT',
            retained,
            undefined,
            undefined,
            'Retenue pour remise en peinture des pièces',
            adminUserId
          );
          await prisma.rentalDepositMovement.update({ where: { id: m1.id }, data: { created_at: noonUtc(endDate) } });
          const m2 = await svc.createDepositMovement(
            tenantId,
            depot.id,
            'REFUND',
            deposit - retained,
            undefined,
            undefined,
            'Restitution du dépôt de garantie à la sortie du locataire',
            adminUserId
          );
          await prisma.rentalDepositMovement.update({ where: { id: m2.id }, data: { created_at: noonUtc(endDate) } });
        } catch (error) {
          log(
            `promoteur-commercial : restitution du dépôt ${lease.lease_number} impossible — ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
      out.push({
        leaseId: lease.id,
        leaseNumber: lease.lease_number,
        kept: k,
        renter,
        status: ended ? 'ENDED' : 'ACTIVE',
        start,
        end: endDate
      });
    } catch (error) {
      log(
        `promoteur-commercial : bail du lot ${k.ref} ignoré — ${error instanceof Error ? error.stack : String(error)}`
      );
    }
  }
  try {
    await svc.calculatePenaltiesForOverdueInstallments(tenantId, adminUserId);
  } catch (error) {
    log(
      `promoteur-commercial : calcul des pénalités échoué — ${error instanceof Error ? error.message : String(error)}`
    );
  }
  log(`promoteur-commercial : ${out.length} baux sur les lots conservés.`);
  return out;
}

/** Statut final des lots conservés : loué, ou disponible à la location. */
async function applyKeptStatuses(env: PEnv, kept: Kept[]): Promise<void> {
  const { prisma, tenantId, rng, ctx } = env;
  for (const k of kept) {
    const active = await prisma.rentalLease.count({
      where: { tenant_id: tenantId, property_id: k.propertyId, status: 'ACTIVE' }
    });
    const p = await prisma.property.findUnique({ where: { id: k.propertyId }, select: { status: true } });
    if (!p) continue;
    if (active > 0) {
      if (p.status === 'RENTED') continue;
      await prisma.property.update({
        where: { id: k.propertyId },
        data: {
          status: 'RENTED',
          availability: 'UNAVAILABLE',
          isPublished: false,
          updatedAt: addDays(ctx.end, -between(rng, 20, 200))
        }
      });
    } else if (p.status === 'DRAFT') {
      const published = addDays(ctx.end, -between(rng, 5, 60));
      await prisma.property.update({
        where: { id: k.propertyId },
        data: {
          status: 'AVAILABLE',
          availability: 'AVAILABLE',
          isPublished: true,
          publishedAt: published,
          updatedAt: published
        }
      });
      await prisma.propertyStatusHistory.create({
        data: {
          propertyId: k.propertyId,
          tenantId,
          previousStatus: 'DRAFT',
          newStatus: 'AVAILABLE',
          changedByUserId: env.adminUserId,
          notes: 'Lot conservé proposé à la location',
          createdAt: published
        }
      });
    }
  }
}

// ───────────────────────────────────────────────────────── prêts

async function seedLoans(env: PEnv, kept: Kept[]): Promise<void> {
  const { prisma, tenantId, ctx, log } = env;
  if ((await prisma.propertyLoan.count({ where: { tenantId } })) > 0) return;
  const T = ctx.end;
  const defs: Array<{ pick: number; lender: string; share: number; rate: number; years: number; extra?: boolean }> = [
    { pick: 0, lender: 'SGBCI — prêt immobilier professionnel', share: 0.55, rate: 8.2, years: 15 },
    { pick: 2, lender: 'Ecobank Côte d’Ivoire — crédit d’investissement', share: 0.5, rate: 8.6, years: 12 },
    { pick: 7, lender: 'NSIA Banque — prêt immobilier', share: 0.6, rate: 7.9, years: 15 },
    {
      pick: -1,
      lender: 'Bank of Africa — crédit de trésorerie du patrimoine',
      share: 0,
      rate: 9.5,
      years: 5,
      extra: true
    }
  ];
  let n = 0;
  for (const d of defs) {
    const k = d.pick >= 0 ? kept[d.pick % Math.max(kept.length, 1)] : null;
    if (d.pick >= 0 && !k) continue;
    const capital = k ? roundTo(k.cost * d.share * 1.4, 500_000) : 40_000_000;
    const start = k ? addDays(k.deliveredAt, 20) : addDays(T, -420);
    const months = d.years * 12;
    const r = d.rate / 100 / 12;
    const monthly = Math.round((capital * r) / (1 - Math.pow(1 + r, -months)));
    const elapsed = Math.max(0, Math.floor((T.getTime() - start.getTime()) / (30.44 * DAY)));
    const remaining = Math.round(
      (capital * (Math.pow(1 + r, months) - Math.pow(1 + r, elapsed))) / (Math.pow(1 + r, months) - 1)
    );
    await prisma.propertyLoan.create({
      data: {
        tenantId,
        propertyId: k?.propertyId ?? null,
        assetId: null,
        lender: d.lender,
        capitalAmount: capital,
        remainingCapital: remaining,
        interestRate: d.rate,
        monthlyPayment: monthly,
        currency: 'XOF',
        startDate: start,
        endDate: addMonths(start, months),
        status: 'ACTIVE',
        createdAt: start
      }
    });
    n += 1;
  }
  log(`promoteur-commercial : ${n} prêts du patrimoine.`);
}

// ───────────────────────────────────────────────────────── dépenses

async function seedExpenses(env: PEnv, kept: Kept[], leases: LeaseRecord[]): Promise<void> {
  const { prisma, tenantId, ctx, rng, log } = env;
  const T = ctx.end;
  let n = 0;
  for (const k of kept) {
    if ((await prisma.propertyExpense.count({ where: { tenantId, propertyId: k.propertyId } })) > 0) continue;
    const rows: Prisma.PropertyExpenseUncheckedCreateInput[] = [];
    const first = addMonths(k.deliveredAt, 2);
    if (k.index % 3 === 0) {
      // Hors exonération : taxe foncière annuelle exigible le 31 mars.
      const paid = new Date(T.getFullYear() - (T.getMonth() >= 3 ? 0 : 1), 2, 31, 10, 0, 0);
      rows.push({
        tenantId,
        propertyId: k.propertyId,
        category: 'PROPERTY_TAX',
        label: 'Taxe foncière sur les propriétés bâties',
        amount: roundTo(k.market * 0.0012, 5_000),
        currency: 'XOF',
        paidAt: paid,
        paymentMethod: 'BANK_TRANSFER',
        supplierName: 'Direction générale des impôts',
        recurrence: 'ANNUAL',
        notes: 'Avis de taxe foncière reçu en février.',
        createdAt: paid
      });
    }
    rows.push({
      tenantId,
      propertyId: k.propertyId,
      category: 'CONDO_FEES',
      label: 'Provision pour charges de copropriété (syndic provisoire)',
      amount: roundTo(k.surface * 550, 5_000),
      currency: 'XOF',
      paidAt: first,
      paymentMethod: 'BANK_TRANSFER',
      supplierName: 'Syndic provisoire de la résidence',
      recurrence: 'MONTHLY',
      createdAt: first
    });
    const lease = leases.find(l => l.kept.propertyId === k.propertyId);
    rows.push({
      tenantId,
      propertyId: k.propertyId,
      category: 'ROUTINE_MAINTENANCE',
      label: 'Entretien annuel des climatiseurs et contrôle des installations',
      amount: roundTo(45_000 + k.surface * 400, 5_000),
      currency: 'XOF',
      paidAt: addMonths(k.deliveredAt, 9),
      paymentMethod: 'MOBILE_MONEY',
      supplierName: 'Froid et Clim Bassam',
      recurrence: 'ONE_OFF',
      createdAt: addMonths(k.deliveredAt, 9)
    });
    if (lease?.status === 'ENDED') {
      rows.push({
        tenantId,
        propertyId: k.propertyId,
        category: 'RENOVATION',
        label: 'Remise en peinture après le départ du locataire',
        amount: 380_000,
        currency: 'XOF',
        paidAt: addDays(lease.end, 12),
        paymentMethod: 'BANK_TRANSFER',
        supplierName: 'Peinture et Rénovation Lagune',
        isCapitalized: false,
        recurrence: 'ONE_OFF',
        createdAt: addDays(lease.end, 12)
      });
    }
    if (!lease) {
      rows.push({
        tenantId,
        propertyId: k.propertyId,
        category: 'UTILITIES',
        label: 'Eau et électricité du lot vacant (compteurs au nom de la société)',
        amount: between(rng, 8, 22) * 1_000,
        currency: 'XOF',
        paidAt: addDays(T, -between(rng, 20, 70)),
        paymentMethod: 'MOBILE_MONEY',
        supplierName: 'CIE / SODECI',
        recurrence: 'QUARTERLY',
        createdAt: addDays(T, -between(rng, 20, 70))
      });
    }
    await prisma.propertyExpense.createMany({ data: rows });
    n += rows.length;
  }
  if (n > 0)
    log(`promoteur-commercial : ${n} dépenses des lots conservés (dont récurrentes pour le plan de trésorerie).`);
}

// ───────────────────────────────────────────────────────── travaux

async function seedWorkPrograms(env: PEnv, kept: Kept[]): Promise<void> {
  const { prisma, tenantId, ctx, log } = env;
  if ((await prisma.workProgram.count({ where: { tenantId } })) > 0) return;
  const T = ctx.end;
  const at = (i: number): Kept => kept[i % kept.length];
  const defs: Array<{
    i: number;
    title: string;
    description: string;
    estimated: number;
    actual: number | null;
    status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    plannedAgo: number;
    completedAgo?: number;
    capitalized: boolean;
    site: boolean;
  }> = [
    {
      i: 0,
      title: 'Pose de climatiseurs split dans les chambres',
      description: 'Fourniture et pose de trois climatiseurs split avant la première mise en location.',
      estimated: 1_650_000,
      actual: 1_590_000,
      status: 'COMPLETED',
      plannedAgo: 400,
      completedAgo: 385,
      capitalized: true,
      site: true
    },
    {
      i: 1,
      title: 'Installation de placards et de garde-corps de balcon',
      description: 'Placards de chambre sur mesure et sécurisation du balcon pour la location familiale.',
      estimated: 980_000,
      actual: 1_040_000,
      status: 'COMPLETED',
      plannedAgo: 360,
      completedAgo: 340,
      capitalized: true,
      site: true
    },
    {
      i: 2,
      title: 'Reprise d’étanchéité de la toiture-terrasse',
      description:
        'Reprise des relevés d’étanchéité après des infiltrations constatées en saison des pluies, au titre de la garantie.',
      estimated: 2_400_000,
      actual: 2_180_000,
      status: 'COMPLETED',
      plannedAgo: 210,
      completedAgo: 185,
      capitalized: false,
      site: true
    },
    {
      i: 4,
      title: 'Aménagement d’une cuisine équipée avant remise en location',
      description: 'Cuisine équipée sur mesure : meubles hauts et bas, plan de travail et hotte.',
      estimated: 2_900_000,
      actual: null,
      status: 'IN_PROGRESS',
      plannedAgo: 25,
      capitalized: true,
      site: false
    },
    {
      i: 5,
      title: 'Peinture complète avant relocation',
      description: 'Remise en peinture des pièces et reprise des enduits après le départ du locataire.',
      estimated: 780_000,
      actual: null,
      status: 'PLANNED',
      plannedAgo: -12,
      capitalized: false,
      site: false
    },
    {
      i: 7,
      title: 'Pose de panneaux solaires sur la toiture-terrasse',
      description: 'Installation photovoltaïque de 3 kWc pour réduire les charges communes de la résidence.',
      estimated: 4_800_000,
      actual: null,
      status: 'PLANNED',
      plannedAgo: -75,
      capitalized: true,
      site: false
    },
    {
      i: 8,
      title: 'Création d’une mezzanine dans le séjour',
      description: 'Projet de mezzanine abandonné après l’avis défavorable de l’architecte sur la charge admissible.',
      estimated: 3_500_000,
      actual: null,
      status: 'CANCELLED',
      plannedAgo: 120,
      capitalized: false,
      site: false
    },
    {
      i: 9,
      title: 'Remplacement du chauffe-eau et du groupe de ventilation',
      description: 'Remplacement préventif d’équipements en fin de garantie biennale.',
      estimated: 640_000,
      actual: null,
      status: 'PLANNED',
      plannedAgo: -30,
      capitalized: false,
      site: false
    }
  ];
  let n = 0;
  for (const d of defs) {
    const k = at(d.i);
    const planned = addDays(T, -d.plannedAgo);
    if (planned < k.deliveredAt && d.status !== 'PLANNED') continue;
    await prisma.workProgram.create({
      data: {
        tenantId,
        propertyId: k.propertyId,
        constructionSiteId: d.site ? k.siteId : null,
        title: d.title,
        description: d.description,
        estimatedCost: d.estimated,
        actualCost: d.actual,
        currency: 'XOF',
        plannedDate: planned,
        completedDate: d.completedAgo ? addDays(T, -d.completedAgo) : null,
        status: d.status,
        isCapitalized: d.capitalized && d.status === 'COMPLETED',
        createdAt: addDays(planned, -between(env.rng, 8, 30)) > T ? addDays(T, -5) : addDays(planned, -10)
      }
    });
    n += 1;
  }
  log(`promoteur-commercial : ${n} programmes de travaux.`);
}

// ───────────────────────────────────────────────────────── assurances et sinistres

const INSURERS = [
  'NSIA Assurances',
  'Allianz Côte d’Ivoire',
  'SUNU Assurances IARD',
  'Saham Assurance Côte d’Ivoire',
  'AXA Assurances Côte d’Ivoire'
];
const COVERAGES: Array<'MULTIRISK_HOME' | 'MULTIRISK_BUILDING' | 'OWNER_LIABILITY'> = [
  'MULTIRISK_HOME',
  'MULTIRISK_HOME',
  'OWNER_LIABILITY',
  'MULTIRISK_BUILDING'
];
const COVERAGE_LABEL: Record<string, string> = {
  MULTIRISK_HOME: 'multirisque habitation propriétaire non occupant',
  MULTIRISK_BUILDING: 'multirisque immeuble',
  OWNER_LIABILITY: 'responsabilité civile propriétaire'
};

async function seedPolicies(env: PEnv, kept: Kept[]): Promise<void> {
  const { prisma, tenantId, ctx, rng, log } = env;
  const state = { ctx } as unknown as PatState;
  const T = ctx.end;
  let n = 0;
  for (const k of kept) {
    if ((await prisma.insurancePolicy.count({ where: { tenantId, propertyId: k.propertyId } })) > 0) continue;
    const insurer = INSURERS[k.index % INSURERS.length];
    const coverage = COVERAGES[k.index % COVERAGES.length];
    const premium = roundTo(70_000 + k.surface * 1_100 + between(rng, 0, 30_000), 5_000);
    // Une police par année couverte ; le lot d'indice 6 n'est pas renouvelé : police expirée.
    const lapsed = k.index === 6;
    let start = k.deliveredAt;
    let year = 0;
    while (start <= T) {
      const stop = addDaysTo(addMonths(start, 12), -1);
      const number = `${insurer.split(' ')[0].toUpperCase().slice(0, 4)}-${start.getFullYear()}-${String(between(rng, 10000, 99999))}`;
      const facts: PropFacts = {
        title: k.title,
        ref: k.ref,
        type: k.type,
        address: `${PROGRAMS[k.code].brand}, ${PROGRAMS[k.code].place}`,
        zone: PROGRAMS[k.code].zone,
        surface: k.surface
      };
      let documentId: string | null = null;
      if (stop >= T || year === 0) {
        const res = await putPropertyDoc(
          state,
          { id: k.propertyId },
          {
            type: 'INSURANCE',
            fileName: `Attestation d'assurance ${number}.pdf`,
            createdAt: start,
            content: insuranceCertificate(
              facts,
              'la société propriétaire',
              insurer,
              number,
              COVERAGE_LABEL[coverage],
              start,
              stop,
              premium
            ),
            expiration: stop
          }
        );
        documentId = res.id;
      }
      await prisma.insurancePolicy.create({
        data: {
          tenantId,
          propertyId: k.propertyId,
          insurer,
          policyNumber: number,
          coverageType: coverage,
          startDate: start,
          endDate: stop,
          annualPremium: premium + year * 5_000,
          currency: 'XOF',
          notes: year === 0 ? 'Souscrite à la livraison du programme.' : 'Renouvelée à l’échéance, prime révisée.',
          documentId,
          createdByUserId: env.adminUserId,
          createdAt: start
        }
      });
      n += 1;
      year += 1;
      start = addMonths(start, 12);
      if (lapsed && year >= 1) {
        // Dernière police arrêtée il y a quelques jours : non renouvelée.
        break;
      }
    }
  }
  if (n > 0) log(`promoteur-commercial : ${n} polices d'assurance (actives, bientôt échues, expirées).`);
}

interface ClaimDef {
  idx: number;
  cause: 'WATER_DAMAGE' | 'FIRE' | 'THEFT' | 'STRUCTURAL' | 'STORM' | 'OTHER';
  agoDays: number;
  final: 'DECLARED' | 'INSURER_NOTIFIED' | 'EXPERTISE' | 'SETTLED' | 'REJECTED' | 'CLOSED';
  claimed: number;
  indemnified?: number;
  deductible?: number;
  text: string;
  reason?: string;
  supplier: string;
  repair: string;
  scene: SceneKind;
}

const CLAIMS: ClaimDef[] = [
  {
    idx: 1,
    cause: 'WATER_DAMAGE',
    agoDays: 240,
    final: 'SETTLED',
    claimed: 1_850_000,
    indemnified: 1_500_000,
    deductible: 200_000,
    text: 'Dégât des eaux : rupture d’un flexible dans la salle de bain, plafond et parquet du couloir endommagés.',
    supplier: 'Plomberie Sanitaire Ivoire',
    repair: 'Remplacement du flexible, reprise du plafond et du revêtement de sol',
    scene: 'stain'
  },
  {
    idx: 2,
    cause: 'STORM',
    agoDays: 95,
    final: 'EXPERTISE',
    claimed: 3_200_000,
    text: 'Orage violent : infiltrations par la toiture-terrasse après arrachement d’un relevé d’étanchéité.',
    supplier: 'Étanchéité et Toitures d’Abidjan',
    repair: 'Reprise de l’étanchéité et remise en état des plafonds',
    scene: 'storm'
  },
  {
    idx: 7,
    cause: 'THEFT',
    agoDays: 150,
    final: 'REJECTED',
    claimed: 620_000,
    text: 'Vol de deux unités extérieures de climatisation sur le balcon pendant la vacance du lot.',
    reason: 'le vol sans effraction d’équipements extérieurs n’entre pas dans les garanties du contrat.',
    supplier: 'Froid et Clim Bassam',
    repair: 'Remplacement de deux unités extérieures',
    scene: 'facade'
  },
  {
    idx: 8,
    cause: 'FIRE',
    agoDays: 40,
    final: 'INSURER_NOTIFIED',
    claimed: 780_000,
    text: 'Court-circuit au tableau électrique du lot vacant : départ de feu rapidement maîtrisé, tableau et gaines détériorés.',
    supplier: 'Électro Bâtiment CI',
    repair: 'Remplacement du tableau électrique et reprise des gaines',
    scene: 'room'
  },
  {
    idx: 3,
    cause: 'WATER_DAMAGE',
    agoDays: 12,
    final: 'DECLARED',
    claimed: 420_000,
    text: 'Infiltration depuis le logement du dessus : tache d’humidité au plafond du séjour, déclarée hier au syndic.',
    supplier: 'Plomberie Sanitaire Ivoire',
    repair: 'Recherche de fuite et reprise du plafond',
    scene: 'stain'
  },
  {
    idx: 4,
    cause: 'STRUCTURAL',
    agoDays: 215,
    final: 'CLOSED',
    claimed: 950_000,
    indemnified: 700_000,
    deductible: 100_000,
    text: 'Fissures structurelles en façade près de la baie vitrée : expertise demandée par la compagnie.',
    supplier: 'Atelier Lagune Architectes',
    repair: 'Injection des fissures et reprise de l’enduit de façade',
    scene: 'facade'
  }
];

const CHAIN = ['DECLARED', 'INSURER_NOTIFIED', 'EXPERTISE'];
const CAUSE_LABEL: Record<string, string> = {
  WATER_DAMAGE: 'dégât des eaux',
  FIRE: 'incendie',
  THEFT: 'vol',
  STRUCTURAL: 'désordre structurel',
  STORM: 'tempête',
  OTHER: 'autre sinistre'
};

async function seedClaims(env: PEnv, kept: Kept[]): Promise<void> {
  const { prisma, tenantId, ctx, log } = env;
  if ((await prisma.insuranceClaim.count({ where: { tenantId } })) > 0) return;
  const T = ctx.end;
  const state = { ctx } as unknown as PatState;
  const policies = await prisma.insurancePolicy.findMany({ where: { tenantId } });
  let created = 0;
  let docs = 0;
  for (const def of CLAIMS) {
    const k = kept[def.idx % kept.length];
    const occurred = addDays(T, -def.agoDays);
    if (occurred < addDays(k.deliveredAt, 20)) continue;
    const policy =
      policies.find(x => x.propertyId === k.propertyId && x.startDate <= occurred && x.endDate > occurred) ??
      policies
        .filter(x => x.propertyId === k.propertyId)
        .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0];
    if (!policy) continue;
    const steps: string[] = [...CHAIN];
    if (def.final === 'DECLARED') steps.length = 1;
    else if (def.final === 'INSURER_NOTIFIED') steps.length = 2;
    else if (def.final === 'SETTLED') steps.push('SETTLED');
    else if (def.final === 'CLOSED') steps.push('SETTLED', 'CLOSED');
    else if (def.final === 'REJECTED') steps.push('REJECTED');
    const stamp = (n: number): Date => new Date(Math.min(T.getTime() - DAY, addDays(occurred, 3 + n * 12).getTime()));
    const at = (status: string): Date | null => {
      const n = steps.indexOf(status);
      return n < 0 ? null : stamp(n);
    };
    let expenseId: string | null = null;
    if (def.final === 'SETTLED' || def.final === 'CLOSED') {
      expenseId = (
        await prisma.propertyExpense.create({
          data: {
            tenantId,
            propertyId: k.propertyId,
            category: 'ROUTINE_MAINTENANCE',
            label: `Réparation suite au sinistre — ${CAUSE_LABEL[def.cause]}`,
            amount: def.claimed,
            currency: 'XOF',
            paidAt: addDays(occurred, 20),
            paymentMethod: 'BANK_TRANSFER',
            supplierName: def.supplier,
            recurrence: 'ONE_OFF',
            createdAt: addDays(occurred, 20)
          },
          select: { id: true }
        })
      ).id;
    }
    const claim = await prisma.insuranceClaim.create({
      data: {
        tenantId,
        propertyId: k.propertyId,
        policyId: policy.id,
        expenseId,
        occurredAt: occurred,
        declaredAt: addDays(occurred, 2),
        cause: def.cause,
        description: def.text,
        status: def.final,
        claimedAmount: def.claimed,
        indemnifiedAmount: def.indemnified ?? null,
        deductible: def.deductible ?? null,
        rejectionReason: def.final === 'REJECTED' ? `Refus de la compagnie : ${def.reason}` : null,
        insurerNotifiedAt: at('INSURER_NOTIFIED'),
        expertiseAt: at('EXPERTISE'),
        settledAt: at('SETTLED'),
        rejectedAt: at('REJECTED'),
        closedAt: at('CLOSED'),
        createdByUserId: env.adminUserId,
        createdAt: addDays(occurred, 2)
      },
      select: { id: true }
    });
    await prisma.insuranceClaimStatusHistory.createMany({
      data: steps.map((status, n) => ({
        tenantId,
        claimId: claim.id,
        fromStatus: n === 0 ? null : (steps[n - 1] as 'DECLARED'),
        toStatus: status as 'DECLARED',
        note: n === 0 ? 'Sinistre déclaré à la compagnie.' : null,
        changedByUserId: env.adminUserId,
        changedAt: n === 0 ? addDays(occurred, 2) : stamp(n)
      }))
    });
    created += 1;

    // Pièces du dossier : photo avant, devis, rapport d'expertise, lettre de la compagnie, facture, photo après.
    const f = facts(k, `${PROGRAMS[k.code].brand}, ${PROGRAMS[k.code].place}`);
    const tag = `${CAUSE_LABEL[def.cause]} ${occurred.toISOString().slice(0, 10)}`;
    const attach = async (
      kind: 'PHOTO_BEFORE' | 'PHOTO_AFTER' | 'QUOTE' | 'EXPERT_REPORT' | 'INSURER_LETTER' | 'INVOICE',
      docType: 'OTHER' | 'INSURANCE',
      fileName: string,
      when: Date,
      content?: DocContent,
      png?: Buffer
    ): Promise<void> => {
      const { id } = await putPropertyDoc(
        state,
        { id: k.propertyId },
        { type: docType, fileName, createdAt: when, content, png }
      );
      await prisma.insuranceClaimDocument.create({
        data: { tenantId, claimId: claim.id, documentId: id, kind, createdAt: when }
      });
      docs += 1;
    };
    const variant = def.idx;
    await attach(
      'PHOTO_BEFORE',
      'OTHER',
      `Photo avant réparation — ${tag}.png`,
      addDays(occurred, 1),
      undefined,
      sceneImage(def.scene, variant)
    );
    if (def.final !== 'DECLARED')
      await attach(
        'QUOTE',
        'OTHER',
        `Devis ${def.supplier} — ${tag}.pdf`,
        addDays(occurred, 6),
        claimQuote(f, def.supplier, def.repair, def.claimed, addDays(occurred, 6))
      );
    if (['EXPERTISE', 'SETTLED', 'CLOSED', 'REJECTED'].includes(def.final)) {
      const retained = def.indemnified ? def.indemnified + (def.deductible ?? 0) : Math.round(def.claimed * 0.9);
      await attach(
        'EXPERT_REPORT',
        'OTHER',
        `Rapport d'expertise — ${tag}.pdf`,
        addDays(occurred, 18),
        expertReport(f, def.text, def.claimed, retained, addDays(occurred, 18))
      );
    }
    if (['SETTLED', 'CLOSED', 'REJECTED'].includes(def.final)) {
      const outcome =
        def.final === 'REJECTED'
          ? ({
              kind: 'REJECTED',
              reason: def.reason ?? 'le sinistre n’entre pas dans les garanties du contrat.'
            } as const)
          : ({ kind: 'SETTLED', indemnified: def.indemnified ?? 0, deductible: def.deductible ?? 0 } as const);
      await attach(
        'INSURER_LETTER',
        'INSURANCE',
        `Lettre de la compagnie — ${tag}.pdf`,
        addDays(occurred, 30),
        insurerLetter(policy.insurer, f, policy.policyNumber, outcome, addDays(occurred, 30))
      );
    }
    if (def.final === 'SETTLED' || def.final === 'CLOSED') {
      await attach(
        'INVOICE',
        'OTHER',
        `Facture ${def.supplier} — ${tag}.pdf`,
        addDays(occurred, 22),
        repairInvoice(f, def.supplier, def.repair, def.claimed, addDays(occurred, 22))
      );
      await attach(
        'PHOTO_AFTER',
        'OTHER',
        `Photo après réparation — ${tag}.png`,
        addDays(occurred, 24),
        undefined,
        sceneImage(def.scene === 'stain' ? 'room' : def.scene, variant + 1)
      );
    }
  }
  log(`promoteur-commercial : ${created} sinistres, ${docs} pièces de sinistre.`);
}

// ───────────────────────────────────────────────────────── plan de trésorerie, rendement, fiscalité

async function seedCashPlanAndYields(env: PEnv, kept: Kept[], leases: LeaseRecord[]): Promise<void> {
  const { prisma, tenantId, rng, log } = env;
  await prisma.patrimonyCashPlanSettings.upsert({
    where: { tenantId },
    update: {},
    create: { tenantId, propertyTaxDueMonth: 3, propertyTaxDueDay: 31, updatedByUserId: env.adminUserId }
  });
  let yields = 0;
  let profiles = 0;
  for (const k of kept) {
    if (
      !(await prisma.propertyYieldAssumption.findUnique({ where: { propertyId: k.propertyId }, select: { id: true } }))
    ) {
      const lease = leases.find(l => l.kept.propertyId === k.propertyId);
      // Fractions (0,04 = 4 %), comme l'attendent `lib/patrimoine/yield.ts` et le schéma API.
      await prisma.propertyYieldAssumption.create({
        data: {
          tenantId,
          propertyId: k.propertyId,
          years: 10,
          valueGrowthRate: pick(rng, [0.04, 0.045, 0.05, 0.055]),
          rentGrowthRate: 0.03,
          expenseGrowthRate: 0.04,
          vacancyRate: lease ? 0.05 : 0.08,
          updatedByUserId: env.adminUserId
        }
      });
      yields += 1;
    }
    if (!(await prisma.propertyTaxProfile.findUnique({ where: { propertyId: k.propertyId }, select: { id: true } }))) {
      const lease = leases.find(l => l.kept.propertyId === k.propertyId && l.status === 'ACTIVE');
      const exempt = k.index % 3 !== 0;
      await prisma.propertyTaxProfile.create({
        data: {
          tenantId,
          propertyId: k.propertyId,
          country: 'CI',
          builtStatus: 'BUILT',
          occupancy: lease ? 'RENTED' : 'VACANT',
          declaredRentalValue: lease ? roundTo(k.market * 0.072, 10_000) : null,
          exemptUntilYear: exempt ? k.deliveredAt.getFullYear() + 5 : null,
          exemptionReason: exempt
            ? 'Exonération temporaire de taxe foncière pour construction neuve (cinq ans à compter de l’achèvement).'
            : null,
          notes: exempt
            ? 'Exonération en cours : attestation d’achèvement jointe au dossier fiscal.'
            : 'Revenus fonciers déclarés chaque année auprès du guichet unique de la DGI (échéance fin avril).',
          updatedByUserId: env.adminUserId
        }
      });
      profiles += 1;
    }
  }
  log(
    `promoteur-commercial : plan de trésorerie réglé, ${yields} hypothèses de rendement, ${profiles} profils fiscaux.`
  );
}

// ───────────────────────────────────────────────────────── carnet d'entretien

async function seedMaintenanceLog(env: PEnv, kept: Kept[], vendors: VendorRef[]): Promise<void> {
  const { prisma, tenantId, ctx, rng, log } = env;
  if ((await prisma.maintenanceLogEntry.count({ where: { tenantId } })) > 0) return;
  const T = ctx.end;
  const templates: Array<{
    category: 'AIR_CONDITIONING' | 'PLUMBING' | 'ELECTRICAL' | 'PAINTING' | 'ROOF_WATERPROOFING' | 'OTHER';
    text: string;
    cost: [number, number];
    period: number | null;
    warranty: number | null;
    spec: string[];
  }> = [
    {
      category: 'AIR_CONDITIONING',
      text: 'Entretien annuel des climatiseurs : nettoyage des filtres, contrôle du niveau de gaz et des condensats.',
      cost: [35_000, 95_000],
      period: 12,
      warranty: null,
      spec: ['ac']
    },
    {
      category: 'PLUMBING',
      text: 'Révision de la plomberie : détartrage du chauffe-eau, remplacement des flexibles et des joints.',
      cost: [25_000, 90_000],
      period: 24,
      warranty: 6,
      spec: ['plumbing']
    },
    {
      category: 'ELECTRICAL',
      text: 'Contrôle du tableau électrique, resserrage des connexions et test des différentiels.',
      cost: [20_000, 70_000],
      period: 24,
      warranty: null,
      spec: ['electricity']
    },
    {
      category: 'PAINTING',
      text: 'Retouches de peinture des parties communes du lot et du balcon avant la remise en location.',
      cost: [180_000, 520_000],
      period: null,
      warranty: 12,
      spec: ['painting']
    },
    {
      category: 'ROOF_WATERPROOFING',
      text: 'Contrôle de l’étanchéité de la toiture-terrasse et nettoyage des descentes d’eaux pluviales.',
      cost: [60_000, 160_000],
      period: 12,
      warranty: null,
      spec: ['masonry']
    },
    {
      category: 'OTHER',
      text: 'Désinsectisation et traitement préventif des parties privatives.',
      cost: [30_000, 80_000],
      period: 12,
      warranty: null,
      spec: ['other']
    }
  ];
  const rows: Prisma.MaintenanceLogEntryUncheckedCreateInput[] = [];
  for (const k of kept) {
    const count = between(rng, 2, 4);
    for (let i = 0; i < count; i++) {
      const t = templates[(k.index + i) % templates.length];
      const performed = addDays(
        k.deliveredAt,
        between(rng, 40, Math.max(60, Math.floor((T.getTime() - k.deliveredAt.getTime()) / DAY) - 10))
      );
      if (performed > addDays(T, -2)) continue;
      const matching = vendors.filter(v => v.active && v.specialties.some(s => t.spec.includes(s)));
      rows.push({
        tenantId,
        propertyId: k.propertyId,
        category: t.category,
        performedAt: performed,
        vendorId: (matching.length > 0 ? pick(rng, matching) : pick(rng, vendors))?.id ?? null,
        cost: roundTo(between(rng, t.cost[0], t.cost[1]), 5_000),
        currency: 'XOF',
        description: t.text,
        nextDueDate: t.period ? addMonths(performed, t.period) : null,
        warrantyEndDate: t.warranty ? addMonths(performed, t.warranty) : null,
        createdByUserId: env.adminUserId,
        createdAt: performed
      });
    }
  }
  await prisma.maintenanceLogEntry.createMany({ data: rows });
  log(`promoteur-commercial : ${rows.length} interventions au carnet d'entretien.`);
}

// ───────────────────────────────────────────────────────── accès partagés

const GRANTS: Array<{
  type: 'NOTARY' | 'ACCOUNTANT' | 'BANKER';
  name: string;
  email: string;
  sections: Array<'VALUATIONS' | 'YIELD_RATIOS' | 'LOANS' | 'EXPENSES' | 'RENTS' | 'DOCUMENTS' | 'TITLES_OWNERSHIP'>;
  createdDaysAgo: number;
  expiresInDays: number | null;
  revokedDaysAgo?: number;
  views: number;
  lastViewedDaysAgo?: number;
  linkSentDaysAgo?: number;
  count: number;
}> = [
  {
    type: 'BANKER',
    name: 'Société Générale Côte d’Ivoire — M. Théodore Kouamé, chargé d’affaires',
    email: 'theodore.kouame@example.ci',
    sections: ['VALUATIONS', 'YIELD_RATIOS', 'LOANS'],
    createdDaysAgo: 24,
    expiresInDays: 6,
    views: 7,
    lastViewedDaysAgo: 2,
    linkSentDaysAgo: 20,
    count: 4
  },
  {
    type: 'ACCOUNTANT',
    name: 'Cabinet Diomandé & Associés — expertise comptable',
    email: 'comptabilite.diomande@example.ci',
    sections: ['EXPENSES', 'RENTS', 'LOANS'],
    createdDaysAgo: 430,
    expiresInDays: null,
    views: 31,
    lastViewedDaysAgo: 4,
    linkSentDaysAgo: 6,
    count: 10
  },
  {
    type: 'NOTARY',
    name: 'Étude de Maître Aya Kouamé — acte de division du programme',
    email: 'etude.kouame@example.ci',
    sections: ['TITLES_OWNERSHIP', 'DOCUMENTS'],
    createdDaysAgo: 60,
    expiresInDays: 45,
    views: 3,
    lastViewedDaysAgo: 9,
    linkSentDaysAgo: 14,
    count: 3
  },
  {
    type: 'BANKER',
    name: 'NSIA Banque — service des engagements',
    email: 'engagements.nsia@example.ci',
    sections: ['VALUATIONS', 'LOANS', 'RENTS'],
    createdDaysAgo: 220,
    expiresInDays: -110,
    views: 9,
    lastViewedDaysAgo: 120,
    linkSentDaysAgo: 210,
    count: 3
  },
  {
    type: 'NOTARY',
    name: 'Étude de Maître Tiémoko Bamba — dossier de cession de lots',
    email: 'etude.bamba@example.ci',
    sections: ['TITLES_OWNERSHIP', 'DOCUMENTS'],
    createdDaysAgo: 300,
    expiresInDays: -150,
    revokedDaysAgo: 180,
    views: 2,
    lastViewedDaysAgo: 250,
    linkSentDaysAgo: 290,
    count: 2
  }
];

async function seedExternalAccess(env: PEnv, kept: Kept[]): Promise<void> {
  const { prisma, tenantId, ctx, rng, log } = env;
  if ((await prisma.externalAccessGrant.count({ where: { tenantId } })) > 0) return;
  const end = ctx.end;
  const ago = (days: number): Date => new Date(end.getTime() - days * DAY);
  const docs = await prisma.propertyDocument.findMany({
    where: {
      tenantId,
      documentType: { in: ['TITLE_DEED', 'NOTARIAL_DEED'] },
      propertyId: { in: kept.map(k => k.propertyId) }
    },
    select: { id: true, propertyId: true }
  });
  const user = await prisma.user.findUnique({ where: { id: env.adminUserId }, select: { fullName: true } });
  const audit: Prisma.AuditLogUncheckedCreateInput[] = [];
  const entry = (
    actionKey: string,
    grantId: string,
    when: Date,
    actor: string | null,
    payload: Record<string, unknown>,
    extra: { ip?: string } = {}
  ): void => {
    audit.push(
      buildAuditRow(
        {
          actorUserId: actor,
          actorLabel: actor ? (user?.fullName ?? null) : null,
          tenantId,
          actionKey,
          entityType: 'ExternalAccessGrant',
          entityId: grantId,
          ipAddress: extra.ip ?? null,
          userAgent: null,
          payload,
          createdAt: when,
          source: 'seed'
        },
        undefined
      )
    );
  };
  let count = 0;
  for (const def of GRANTS) {
    const props = kept.slice(0, def.count);
    if (props.length === 0) continue;
    const id = randomUUID();
    const createdAt = ago(def.createdDaysAgo);
    const expiresAt = def.expiresInDays === null ? null : new Date(end.getTime() + def.expiresInDays * DAY);
    const revokedAt = def.revokedDaysAgo ? ago(def.revokedDaysAgo) : null;
    const lastViewedAt = def.lastViewedDaysAgo !== undefined ? ago(def.lastViewedDaysAgo) : null;
    const linkSent = def.linkSentDaysAgo !== undefined ? ago(def.linkSentDaysAgo) : null;
    await prisma.externalAccessGrant.create({
      data: {
        id,
        tenantId,
        type: def.type,
        recipientName: def.name,
        recipientEmail: def.email,
        sections: def.sections,
        expiresAt,
        revokedAt,
        createdByUserId: env.adminUserId,
        viewCount: def.views,
        lastViewedAt,
        lastLinkSentAt: linkSent,
        createdAt
      }
    });
    count += 1;
    await prisma.externalAccessGrantProperty.createMany({
      data: props.map(p => ({ tenantId, grantId: id, propertyId: p.propertyId, createdAt }))
    });
    if (def.sections.includes('DOCUMENTS')) {
      const scoped = docs.filter(d => props.some(p => p.propertyId === d.propertyId));
      if (scoped.length > 0) {
        await prisma.externalAccessGrantDocument.createMany({
          data: scoped.map(d => ({ tenantId, grantId: id, propertyId: d.propertyId, documentId: d.id, createdAt }))
        });
      }
    }
    if (linkSent) {
      const linkExp = new Date(Math.min(expiresAt ? expiresAt.getTime() : Infinity, linkSent.getTime() + 30 * DAY));
      const link = await prisma.secureLink.create({
        data: {
          tenantId,
          scope: 'EXTERNAL_ACCESS_GRANT',
          objectType: 'ExternalAccessGrant',
          objectId: id,
          tokenHash: sha256(Buffer.from(`pack-history:${id}:link:1`)),
          expiresAt: linkExp,
          revokedAt: revokedAt && revokedAt.getTime() < linkExp.getTime() ? revokedAt : null,
          createdByUserId: env.adminUserId,
          viewCount: def.views,
          lastViewedAt,
          createdAt: linkSent
        },
        select: { id: true }
      });
      entry(AuditActionKey.SECURE_LINK_CREATED, id, linkSent, env.adminUserId, {
        linkId: link.id,
        scope: 'EXTERNAL_ACCESS_GRANT'
      });
      entry(AuditActionKey.EXTERNAL_ACCESS_GRANT_LINK_SENT, id, linkSent, env.adminUserId, {
        grantId: id,
        linkId: link.id
      });
      const from = linkSent.getTime() + 3_600_000;
      const to = (lastViewedAt ?? linkSent).getTime();
      for (let v = 0; v < Math.min(def.views, 12); v++) {
        entry(
          AuditActionKey.EXTERNAL_ACCESS_GRANT_VIEWED,
          id,
          new Date(from + ((to - from) * (v + 1)) / Math.max(1, Math.min(def.views, 12))),
          null,
          { grantId: id, linkId: link.id, sections: def.sections },
          { ip: `41.207.${between(rng, 1, 254)}.${between(rng, 1, 254)}` }
        );
      }
    }
    entry(AuditActionKey.EXTERNAL_ACCESS_GRANT_CREATED, id, createdAt, env.adminUserId, {
      grantId: id,
      type: def.type,
      sections: def.sections
    });
    if (revokedAt) entry(AuditActionKey.EXTERNAL_ACCESS_GRANT_REVOKED, id, revokedAt, env.adminUserId, { grantId: id });
  }
  if (audit.length > 0) await prisma.auditLog.createMany({ data: audit });
  log(`promoteur-commercial : ${count} accès partagés, ${audit.length} lignes de journal.`);
}

// ───────────────────────────────────────────────────────── titres et tickets des locataires

async function seedKeptDocuments(env: PEnv, kept: Kept[]): Promise<void> {
  const { prisma, tenantId, ctx, log } = env;
  const state = { ctx } as unknown as PatState;
  let n = 0;
  for (const k of kept) {
    const f = facts(k, `${PROGRAMS[k.code].brand}, ${PROGRAMS[k.code].place}`);
    const res = await putPropertyDoc(
      state,
      { id: k.propertyId },
      {
        type: 'TITLE_DEED',
        fileName: `Titre foncier ${k.ref}.pdf`,
        createdAt: addDays(k.deliveredAt, 25),
        content: titleDeed(f, 'la société promotrice (lot conservé)', addDays(k.deliveredAt, 25))
      }
    );
    if (res.created) n += 1;
  }
  void prisma;
  void tenantId;
  if (n > 0) log(`promoteur-commercial : ${n} titres fonciers des lots conservés.`);
}

async function seedLeaseTickets(env: PEnv, leases: LeaseRecord[], vendors: VendorRef[]): Promise<void> {
  const { prisma, tenantId, ctx, rng, log } = env;
  if ((await prisma.maintenanceTicket.count({ where: { tenant_id: tenantId, lease_id: { not: null } } })) > 0) return;
  const T = ctx.end;
  let n = 0;
  const pool = WARRANTY_TICKETS.filter(t => !t.title.includes('Éclairage') && !t.title.includes('Interphone'));
  for (const l of leases) {
    const count = l.status === 'ENDED' ? 1 : between(rng, 1, 2);
    for (let i = 0; i < count; i++) {
      const span = Math.floor((Math.min(T.getTime(), l.end.getTime()) - l.start.getTime()) / DAY) - 20;
      if (span < 5) continue;
      const declared = addDays(l.start, 14 + Math.floor(rng() * span));
      declared.setHours(between(rng, 8, 18), 20, 0, 0);
      const prop = await prisma.property.findUnique({
        where: { id: l.kept.propertyId },
        select: { title: true, propertyType: true }
      });
      await writeTicket(env, {
        propertyId: l.kept.propertyId,
        propertyTitle: prop?.title ?? l.kept.title,
        propertyType: prop?.propertyType ?? 'APPARTEMENT',
        leaseId: l.leaseId,
        leaseNumber: l.leaseNumber,
        contactId: l.renter.id,
        declared,
        tpl: pool[Math.floor(rng() * pool.length)],
        vendors,
        source: 'Signalé depuis le portail locataire.'
      });
      n += 1;
    }
  }
  if (n > 0) log(`promoteur-commercial : ${n} tickets des locataires des lots conservés.`);
}

// ───────────────────────────────────────────────────────── entrée

export async function seedConservedPatrimoine(env: PEnv): Promise<void> {
  const { log } = env;
  const kept = await loadKept(env);
  if (kept.length === 0) {
    log('promoteur-commercial : aucun lot conservé au patrimoine, volet patrimoine sauté.');
    return;
  }
  const guard = async (label: string, run: () => Promise<void>): Promise<void> => {
    try {
      await run();
    } catch (error) {
      log(
        `promoteur-commercial : bloc patrimoine « ${label} » en échec — ${error instanceof Error ? error.stack : String(error)}`
      );
    }
  };
  let leases: LeaseRecord[] = [];
  await guard('description des lots', () => reclassify(env, kept));
  await guard('coûts des actifs', () => setAssetCosts(env, kept));
  await guard('valorisations', () => seedValuations(env, kept));
  await guard('baux', async () => {
    leases = await seedLeases(env, kept);
  });
  await guard('statuts', () => applyKeptStatuses(env, kept));
  await guard('prêts', () => seedLoans(env, kept));
  await guard('dépenses', () => seedExpenses(env, kept, leases));
  await guard('travaux', () => seedWorkPrograms(env, kept));
  await guard('titres fonciers', () => seedKeptDocuments(env, kept));
  await guard('assurances', () => seedPolicies(env, kept));
  await guard('sinistres', () => seedClaims(env, kept));
  await guard('plan de trésorerie et rendement', () => seedCashPlanAndYields(env, kept, leases));
  const vendors = await seedVendors(env);
  await guard('carnet d’entretien', () => seedMaintenanceLog(env, kept, vendors));
  await guard('accès partagés', () => seedExternalAccess(env, kept));
  await guard('tickets des locataires', () => seedLeaseTickets(env, leases, vendors));
}
